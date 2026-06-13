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
import { forwardModelList } from "$lib/server/proxy";
import { sendWakeOnLan } from "$lib/server/wol";

export const GET: RequestHandler = async ({ request }) => {
  const startedAt = Date.now();

  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) {
    logRequest({
      model: "models:list:unauthenticated",
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
      model: "models:list:unauthenticated",
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });

    return json({ error: "Invalid virtual key" }, { status: 401 });
  }

  const providerId =
    request.headers.get("x-provider-id") ||
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

  if (provider.wolEnabled && provider.wolMac) {
    await sendWakeOnLan(
      provider.wolMac,
      provider.wolBroadcast,
      provider.wolPort,
    ).catch(() => undefined);
  }

  let upstream: Response;
  try {
    upstream = await forwardModelList(provider);
  } catch (error: any) {
    const statusCode = 502;
    logRequest({
      providerId: provider.id,
      model: "models:list",
      statusCode,
      durationMs: Date.now() - startedAt,
      virtualKeyId: virtualKey.id,
    });

    return json(
      {
        error: "Upstream request failed",
        detail: error?.message || "Unknown proxy error",
      },
      { status: 502 },
    );
  }

  logRequest({
    providerId: provider.id,
    model: "models:list",
    statusCode: upstream.status,
    durationMs: Date.now() - startedAt,
    virtualKeyId: virtualKey.id,
  });

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") || "application/json",
    },
  });
};
