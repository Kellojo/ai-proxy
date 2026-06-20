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
import { readCachedModels, writeCachedModels } from "$lib/server/models-cache";
import { forwardAnthropicMessages, forwardModelList } from "$lib/server/proxy";
import type { Provider } from "$lib/server/types";
import { executeWithWolStartupGrace } from "$lib/server/wol-startup";

/**
 * Fetches the model list for a provider, using the cache if available.
 */
async function getModelListForProvider(provider: Provider): Promise<string[]> {
  // Check cache first
  const cached = readCachedModels(provider);
  if (cached) {
    return cached.models.map((m) => m?.id).filter((id): id is string => typeof id === "string");
  }

  // Fetch from provider's /models endpoint
  try {
    const response = await forwardModelList(provider);
    const payload = await response.json().catch(() => ({}));

    // Cache the models
    const models = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload) ? payload : []);
    writeCachedModels(provider, models);

    return models.map((m: any) => m?.id).filter((id: unknown): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/**
 * Checks if a provider supports a specific model.
 */
async function providerHasModel(provider: Provider, modelId: string): Promise<boolean> {
  const models = await getModelListForProvider(provider);
  return models.some(
    (m) => m.toLowerCase() === modelId.toLowerCase()
  );
}

function readNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function extractAnthropicUsageMetrics(payload: any): {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
} {
  const usage = payload?.usage || {};

  const promptTokens =
    readNumericValue(usage?.input_tokens) ??
    readNumericValue(usage?.cache_creation_input_tokens) ??
    readNumericValue(usage?.cache_read_input_tokens);

  const completionTokens =
    readNumericValue(usage?.output_tokens);

  const totalTokens =
    readNumericValue(usage?.input_tokens) ??
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
      model: body?.model || "anthropic:unauthenticated",
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
      model: body?.model || "anthropic:unauthenticated",
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

  const allProviders = listProviders();
  if (allProviders.length === 0) {
    return json(
      { error: "No provider configured. Add a provider in the UI first." },
      { status: 400 },
    );
  }

  const defaultProvider = getDefaultProvider();
  const model = body?.model || "unknown-model";

  console.log(`[ai-proxy] /anthropic/v1/messages request - model: "${model}", requested providerId: ${providerId || "none"}`);

  // Check if a specific provider was requested
  if (providerId) {
    const explicitProvider = getProvider(providerId);
    if (!explicitProvider) {
      console.log(`[ai-proxy] Provider "${providerId}" not found`);
      return json({ error: "Provider not found" }, { status: 404 });
    }

    console.log(`[ai-proxy] Using explicitly requested provider: "${explicitProvider.name}" (id: ${explicitProvider.id})`);

    let upstream: Response;
    try {
      upstream = await executeWithWolStartupGrace(
        explicitProvider,
        "anthropic:messages",
        () => forwardAnthropicMessages(explicitProvider, body),
        {
          shouldRetryResult: (response) => response.status >= 500,
        },
      );
    } catch (error: any) {
      const statusCode = 502;
      logRequest({
        providerId: explicitProvider.id,
        model,
        statusCode,
        durationMs: Date.now() - startedAt,
        virtualKeyId: virtualKey.id,
      });

      console.log(`[ai-proxy] Request to provider "${explicitProvider.name}" failed: ${error?.message || "Unknown error"}`);

      return json(
        {
          error: "Upstream request failed",
          detail: error?.message || "Unknown proxy error",
        },
        { status: statusCode },
      );
    }

    return returnResponse(upstream, model, explicitProvider.id, streamRequested, virtualKey.id, startedAt, extractAnthropicUsageMetrics);
  }

  // No explicit provider - build ordered list: default providers first, then all others
  const providersToTry: Provider[] = [];
  const defaultProviderIds = new Set<string>();

  // Add all default providers first
  for (const p of allProviders) {
    if (p.isDefault) {
      providersToTry.push(p);
      defaultProviderIds.add(p.id);
      console.log(`[ai-proxy] Default provider: "${p.name}" (id: ${p.id}) - will be tried first`);
    }
  }

  // Add non-default providers
  for (const p of allProviders) {
    if (!defaultProviderIds.has(p.id)) {
      providersToTry.push(p);
    }
  }

  console.log(`[ai-proxy] Provider attempt order: ${providersToTry.map(p => `"${p.name}" (id: ${p.id})`).join(", ")}`);

  // Try each provider in order, stop at the first one that has the model
  const triedProviders: Provider[] = [];
  let lastError: Error | undefined;

  for (const candidate of providersToTry) {
    // Check if this provider has the requested model before making the actual request
    console.log(`[ai-proxy] Checking if provider "${candidate.name}" (id: ${candidate.id}) has model "${model}"...`);
    const hasModel = await providerHasModel(candidate, model);

    if (!hasModel) {
      console.log(`[ai-proxy] Provider "${candidate.name}" does not have model "${model}" - skipping`);
      continue;
    }

    triedProviders.push(candidate);
    console.log(`[ai-proxy] Provider "${candidate.name}" has model "${model}" - sending messages request`);

    try {
      const upstream = await executeWithWolStartupGrace(
        candidate,
        "anthropic:messages",
        () => forwardAnthropicMessages(candidate, body),
        {
          shouldRetryResult: (response) => response.status >= 500,
        },
      );

      // Consume the response body
      const upstreamText = await upstream.text();
      const upstreamContentType = upstream.headers.get("content-type") || "";
      const isEventStream = upstreamContentType
        .toLowerCase()
        .includes("text/event-stream");

      console.log(`[ai-proxy] Provider "${candidate.name}" returned status ${upstream.status}${isEventStream ? " (streaming)" : ""}`);

      // Parse metrics from the response
      const metrics: ReturnType<typeof extractAnthropicUsageMetrics> = {};
      try {
        const payload = JSON.parse(upstreamText);
        Object.assign(metrics, extractAnthropicUsageMetrics(payload));
      } catch {
        // ignore parse errors
      }

      logRequest({
        providerId: candidate.id,
        model,
        statusCode: upstream.status,
        durationMs: Date.now() - startedAt,
        virtualKeyId: virtualKey.id,
        ...metrics,
      });

      return new Response(upstreamText, {
        status: upstream.status,
        headers: {
          "content-type": upstream.headers.get("content-type") || "application/json",
        },
      });
    } catch (error: any) {
      lastError = error;
      console.log(`[ai-proxy] Provider "${candidate.name}" threw an error: ${error?.message || "Unknown error"}`);
    }
  }

  // All providers failed - return detailed error
  console.log(`[ai-proxy] All ${triedProviders.length} tried provider(s) failed. Tried: ${triedProviders.map(p => `"${p.name}"`).join(", ")}`);
  return json(
    {
      error: `Failed to complete request. Model '${model}' not available in any configured provider.`,
      detail: lastError?.message || "Unknown proxy error",
      triedProviders: triedProviders.map((p) => ({
        providerId: p.id,
        providerName: p.name,
      })),
    },
    { status: 502 },
  );
};

function returnResponse(
  upstream: Response,
  model: string,
  providerId: string,
  streamRequested: boolean,
  virtualKeyId: string,
  startedAt: number,
  extractUsageFn: (payload: any) => { promptTokens?: number; completionTokens?: number; totalTokens?: number; cost?: number; },
): Promise<Response> {
  const statusCode = upstream.status;
  const upstreamContentType = upstream.headers.get("content-type") || "";
  const isEventStream = upstreamContentType
    .toLowerCase()
    .includes("text/event-stream");

  if (streamRequested && isEventStream) {
    logRequest({
      providerId,
      model,
      statusCode,
      durationMs: Date.now() - startedAt,
      virtualKeyId,
    });

    return Promise.resolve(new Response(upstream.body, {
      status: statusCode,
      headers: {
        "content-type": upstreamContentType,
        "cache-control": upstream.headers.get("cache-control") || "no-cache",
        connection: upstream.headers.get("connection") || "keep-alive",
      },
    }));
  }

  return upstream.text().then(async (textContent) => {
    let metrics: ReturnType<typeof extractUsageFn> = {};
    try {
      const payload = JSON.parse(textContent);
      metrics = extractUsageFn(payload);
    } catch {
      metrics = {};
    }

    logRequest({
      providerId,
      model,
      statusCode,
      durationMs: Date.now() - startedAt,
      virtualKeyId,
      ...metrics,
    });

    return new Response(textContent, {
      status: statusCode,
      headers: {
        "content-type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  });
}