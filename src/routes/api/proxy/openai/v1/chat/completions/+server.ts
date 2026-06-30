import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  noProviderResponse,
  providerNotFoundResponse,
  requireVirtualKey,
  resolveModelAndProvider,
  resolveOrderedProviders,
  attemptProviders,
  extractUsageMetrics,
} from "$lib/server/common-server";
import { getProvider, listProviders } from "$lib/server/db";
import { forwardChatCompletion } from "$lib/server/proxy";
import type { Provider } from "$lib/server/types";
import { withActiveRequestTracking } from "$lib/server/active-requests";

export const POST: RequestHandler = async ({ request }) => {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));

  const auth = requireVirtualKey(request, "chat:unauthenticated", startedAt);
  if ("response" in auth) return auth.response;
  const { virtualKey } = auth;

  const allProviders = listProviders();
  if (allProviders.length === 0) return noProviderResponse();

  const resolved = resolveModelAndProvider(body, request);

  return withActiveRequestTracking(
    {
      model: resolved.model,
      providerId: resolved.effectiveProviderId,
      providerName: resolved.providerName,
      virtualKey: virtualKey.name,
    },
    () => handleAuthenticatedRequest({ body, allProviders, virtualKey, startedAt, ...resolved }),
  );
};

async function handleAuthenticatedRequest(params: {
  startedAt: number;
  body: any;
  allProviders: Provider[];
  model: string;
  remappedModel: string;
  virtualKey: { id: string; name: string };
  explicitProviderId?: string;
}): Promise<Response> {
  const ctx = {
    model: params.model,
    remappedModel: params.remappedModel,
    virtualKeyId: params.virtualKey.id,
    startedAt: params.startedAt,
  };

  let providers: Provider[];
  if (params.explicitProviderId) {
    const explicitProvider = getProvider(params.explicitProviderId);
    if (!explicitProvider) return providerNotFoundResponse();
    providers = [explicitProvider];
  } else {
    providers = await resolveOrderedProviders(params.allProviders, params.remappedModel);
  }

  const result = await attemptProviders(providers, params.body, forwardChatCompletion, extractUsageMetrics, ctx);
  if ("response" in result) return result.response;

  return json(
    {
      error: `Failed to complete request. Model '${params.model}' not available in any configured provider.`,
      detail: result.lastError?.message || "Unknown proxy error",
      triedProviders: result.tried.map((p) => ({ providerId: p.id, providerName: p.name })),
    },
    { status: 502 },
  );
}
