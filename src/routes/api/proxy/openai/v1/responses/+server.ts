import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { buildProviderOrder, returnResponse } from "$lib/server/common-server";
import { authenticateVirtualKey, logRequest, getDefaultProvider, getProvider, listProviders, resolveModelMapping } from "$lib/server/db";
import { extractBearer } from "$lib/server/keys";
import { forwardResponses } from "$lib/server/proxy";
import type { Provider } from "$lib/server/types";
import { startRequest, finishRequest } from "$lib/server/active-requests";
import { extractResponsesUsageMetrics } from "$lib/server/common-server";

const logModel = "responses:unauthenticated";

export const POST: RequestHandler = async ({ request }) => {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));

  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) {
    logRequest({ model: logModel, statusCode: 401, durationMs: Date.now() - startedAt });
    return json({ error: "Missing virtual key in Authorization header" }, { status: 401 });
  }

  const virtualKey = authenticateVirtualKey(bearer);
  if (!virtualKey) {
    logRequest({ model: logModel, statusCode: 401, durationMs: Date.now() - startedAt });
    return json({ error: "Invalid virtual key" }, { status: 401 });
  }

  const allProviders = listProviders();
  if (allProviders.length === 0) {
    return json({ error: "No provider configured. Add a provider in the UI first." }, { status: 400 });
  }

  const model = body?.model || "unknown-model";
  const resolvedMapping = resolveModelMapping(model);
  if (resolvedMapping && resolvedMapping.target !== model) body.model = resolvedMapping.target;
  const remappedModelForLog = resolvedMapping?.target || model;

  function resolveProviderId(req: any): string | undefined {
    return req.headers.get("x-provider-id") || req.headers.get("x-ai-provider-id") || body.providerId || undefined;
  }

  const explicitProviderId = resolveProviderId(request);
  let providerName: string | undefined;
  if (explicitProviderId) {
    const p = getProvider(explicitProviderId);
    if (!p) return json({ error: "Provider not found" }, { status: 404 });
    providerName = p.name;
  } else if (resolvedMapping?.providerId) {
    const mp = getProvider(resolvedMapping.providerId);
    if (mp) providerName = mp.name;
  } else {
    const dp = getDefaultProvider();
    if (dp) providerName = dp.name;
  }

  const effectiveProviderId = explicitProviderId || resolvedMapping?.providerId || undefined;
  const runId = startRequest({ model, providerId: effectiveProviderId, providerName, virtualKey: virtualKey.name });

  try {
    return await handleAuthenticatedRequest({ startedAt, body, allProviders, model, virtualKey, providerId: explicitProviderId, resolvedModel: remappedModelForLog });
  } finally {
    finishRequest(runId);
  }
};

async function resolveOrderedProviders(params: {
  allProviders: Provider[];
  model: string;
  resolvedModel?: string;
}): Promise<Provider[]> {
  const { allProviders, model, resolvedModel } = params;
  const { getProvidersWithModels } = await import("$lib/server/db");
  const providersWithModels = getProvidersWithModels();

  if (providersWithModels.length === 0) return buildProviderOrder(allProviders);

  const providerModelMap = new Map<string, Set<string>>();
  for (const p of providersWithModels) {
    if (p.modelIds && p.modelIds.length > 0) providerModelMap.set(p.id, new Set(p.modelIds));
  }

  const matchingProviders = providersWithModels.filter(
    (p: { id: string; modelIds?: string[] }) => providerModelMap.get(p.id)?.has(resolvedModel ?? model),
  );

  if (matchingProviders.length > 0) return buildProviderOrder(allProviders.filter((p: Provider) => new Set(matchingProviders.map(m => m.id)).has(p.id)));
  console.log(`[ai-proxy] Model "${resolvedModel ?? model}" not known in any provider, trying all ${allProviders.length} provider(s)`);
  return buildProviderOrder(allProviders);
}

async function handleAuthenticatedRequest(params: {
  startedAt: number;
  body: any;
  allProviders: Provider[];
  model: string;
  virtualKey: NonNullable<ReturnType<typeof authenticateVirtualKey>>;
  providerId?: string | null;
  resolvedModel?: string;
}): Promise<Response> {
  const { startedAt, body, allProviders, model, virtualKey, resolvedModel } = params;

  if (params.providerId) {
    const explicitProvider = getProvider(params.providerId);
    if (!explicitProvider) return json({ error: "Provider not found" }, { status: 404 });

    console.log(`[ai-proxy] Using explicitly requested provider: "${explicitProvider.name}"`);

    try {
      const upstream = await forwardResponses(explicitProvider, body);
      if (!upstream.ok) return json({ error: "Upstream request failed" }, { status: upstream.status });

      console.log(`[ai-proxy] Explicit provider returned ${upstream.status}`);
      return await returnResponse(
        upstream, model, explicitProvider.id, true, virtualKey.id, startedAt, extractResponsesUsageMetrics,
      );
    } catch (error: any) {
      logRequest({ providerId: explicitProvider.id, model, statusCode: 502, durationMs: Date.now() - startedAt, virtualKeyId: virtualKey.id, remappedModel: resolvedModel });
      return json({ error: "Upstream request failed", detail: error?.message || "Unknown proxy error" }, { status: 502 });
    }
  }

  // Fallback: try providers matching the requested model (or all if none match)
  const orderedProviders = await resolveOrderedProviders(params);

  console.log(`[ai-proxy] Trying ${orderedProviders.length} provider(s): ${orderedProviders.map(p => `"${p.name}"`).join(", ")}`);

  let lastError: Error | undefined;
  for (const candidate of orderedProviders) {
    try {
      const upstream = await forwardResponses(candidate, body);
      if (!upstream.ok) {
        logRequest({ providerId: candidate.id, model, statusCode: upstream.status, durationMs: Date.now() - startedAt, virtualKeyId: virtualKey.id, remappedModel: resolvedModel });
        console.log(`[ai-proxy] Provider "${candidate.name}" returned ${upstream.status}`);
        continue;
      }

      console.log(`[ai-proxy] Provider "${candidate.name}" OK (${upstream.status})`);
      return await returnResponse(
        upstream, model, candidate.id, true, virtualKey.id, startedAt, extractResponsesUsageMetrics,
      );
    } catch (error: any) {
      logRequest({ providerId: candidate.id, model, statusCode: 502, durationMs: Date.now() - startedAt, virtualKeyId: virtualKey.id, remappedModel: resolvedModel });
      lastError = error;
      console.log(`[ai-proxy] Provider "${candidate.name}" failed: ${error?.message || "Unknown"}`);
    }
  }

  return json(
    {
      error: `Failed to complete request. Model '${model}' not available in any configured provider.`,
      detail: lastError?.message || "Unknown proxy error",
      triedProviders: orderedProviders.map(p => ({ providerId: p.id, providerName: p.name })),
    },
    { status: 502 },
  );
}
