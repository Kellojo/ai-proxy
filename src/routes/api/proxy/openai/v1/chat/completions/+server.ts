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
import { executeWithWolStartupGrace } from "$lib/server/wol-startup";

function readNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function extractUsageMetrics(payload: any): {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
} {
  const usage = payload?.usage || {};

  const promptTokens =
    readNumericValue(usage?.prompt_tokens) ??
    readNumericValue(usage?.input_tokens) ??
    readNumericValue(usage?.promptTokens) ??
    readNumericValue(usage?.inputTokens);

  const completionTokens =
    readNumericValue(usage?.completion_tokens) ??
    readNumericValue(usage?.output_tokens) ??
    readNumericValue(usage?.completionTokens) ??
    readNumericValue(usage?.outputTokens);

  const totalTokens =
    readNumericValue(usage?.total_tokens) ??
    readNumericValue(usage?.totalTokens) ??
    (() => {
      const combined = (promptTokens ?? 0) + (completionTokens ?? 0);
      return combined > 0 ? combined : undefined;
    })();

  const cost =
    readNumericValue(usage?.cost) ??
    readNumericValue(usage?.total_cost) ??
    readNumericValue(payload?.cost) ??
    readNumericValue(payload?.total_cost);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cost,
  };
}

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

  const model = body?.model || "unknown-model";

  let upstream: Response;
  try {
    upstream = await executeWithWolStartupGrace(
      provider,
      "chat:completion",
      () => forwardChatCompletion(provider, body),
      {
        shouldRetryResult: (response) => response.status >= 500,
      },
    );
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
  const upstreamContentType = upstream.headers.get("content-type") || "";
  const isEventStream = upstreamContentType
    .toLowerCase()
    .includes("text/event-stream");

  if (streamRequested && isEventStream) {
    logRequest({
      providerId: provider.id,
      model,
      statusCode,
      durationMs: Date.now() - startedAt,
      virtualKeyId: virtualKey.id,
    });

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
  let metrics: ReturnType<typeof extractUsageMetrics> = {};
  try {
    const payload = JSON.parse(text);
    metrics = extractUsageMetrics(payload);
  } catch {
    metrics = {};
  }

  logRequest({
    providerId: provider.id,
    model,
    statusCode,
    durationMs: Date.now() - startedAt,
    virtualKeyId: virtualKey.id,
    ...metrics,
  });

  return new Response(text, {
    status: statusCode,
    headers: {
      "content-type":
        upstream.headers.get("content-type") || "application/json",
    },
  });
};
