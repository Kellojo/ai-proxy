import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  authenticateVirtualKey,
  getDefaultProvider,
  getProvider,
  listProviders,
  logRequest,
} from "$lib/server/db";
import { extractBearer } from "$lib/server/keys";
import { forwardChatCompletion } from "$lib/server/proxy";
import { sendWakeOnLan } from "$lib/server/wol";

export const POST: RequestHandler = async ({ request }) => {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const streamRequested = body?.stream === true;

  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) {
    logRequest({
      model: body?.model || "chat:unauthenticated",
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });

    return json(
      { error: "Missing virtual key in Authorization header" },
      { status: 401 },
    );
  }

  const virtualKey = authenticateVirtualKey(bearer);
  if (!virtualKey) {
    logRequest({
      model: body?.model || "chat:unauthenticated",
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });

    return json({ error: "Invalid virtual key" }, { status: 401 });
  }

  const providerId =
    request.headers.get("x-provider-id") ||
    body?.providerId ||
    request.headers.get("x-ai-provider-id") ||
    undefined;

  const provider =
    (providerId ? getProvider(providerId) : undefined) ||
    getDefaultProvider() ||
    listProviders()[0];
  if (!provider) {
    return json(
      { error: "No provider configured. Add a provider in the UI first." },
      { status: 400 },
    );
  }

  if (streamRequested && provider.kind === "anthropic") {
    return json(
      {
        error:
          "Streaming is not yet supported for Anthropic providers in this proxy.",
      },
      { status: 400 },
    );
  }

  if (provider.wolEnabled && provider.wolMac) {
    await sendWakeOnLan(
      provider.wolMac,
      provider.wolBroadcast,
      provider.wolPort,
    ).catch(() => undefined);
  }

  const model = body?.model || "unknown-model";

  let upstream: Response;
  try {
    upstream = await forwardChatCompletion(provider, body);
  } catch (error: any) {
    const statusCode = 502;
    logRequest({
      providerId: provider.id,
      model,
      statusCode,
      durationMs: Date.now() - startedAt,
      virtualKeyId: virtualKey.id,
    });

    return json(
      {
        error: "Upstream request failed",
        detail: error?.message || "Unknown proxy error",
      },
      { status: statusCode },
    );
  }

  const statusCode = upstream.status;
  logRequest({
    providerId: provider.id,
    model,
    statusCode,
    durationMs: Date.now() - startedAt,
    virtualKeyId: virtualKey.id,
  });

  const upstreamContentType = upstream.headers.get("content-type") || "";
  const isEventStream = upstreamContentType
    .toLowerCase()
    .includes("text/event-stream");

  if (streamRequested && isEventStream) {
    return new Response(upstream.body, {
      status: statusCode,
      headers: {
        "content-type": upstreamContentType,
        "cache-control": upstream.headers.get("cache-control") || "no-cache",
        connection: upstream.headers.get("connection") || "keep-alive",
      },
    });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: statusCode,
    headers: {
      "content-type":
        upstream.headers.get("content-type") || "application/json",
    },
  });
};
