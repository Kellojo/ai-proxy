import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createProvider, listProviders } from "$lib/server/db";
import {
  MODELS_CACHE_TTL_MS,
  isModelsCacheEnabled,
  readStaleCachedModels,
} from "$lib/server/models-cache";
import type { ProviderInput } from "$lib/server/types";

function sanitizeProvider<T extends { apiKey?: string }>(provider: T) {
  const { apiKey, ...safeProvider } = provider;
  return safeProvider;
}

function validateProviderInput(value: any): ProviderInput {
  if (!value?.name || !value?.kind || !value?.endpointUrl || !value?.apiKey) {
    throw new Error("name, kind, endpointUrl and apiKey are required");
  }

  if (!["openai", "anthropic", "other"].includes(value.kind)) {
    throw new Error("kind must be one of: openai, anthropic, other");
  }

  return {
    name: value.name,
    kind: value.kind,
    endpointUrl: value.endpointUrl,
    apiKey: value.apiKey,
    isDefault: !!value.isDefault,
    wolEnabled: !!value.wolEnabled,
    wolMac: value.wolMac,
    wolBroadcast: value.wolBroadcast,
    wolPort: value.wolPort,
  };
}

export const GET: RequestHandler = async () => {
  const providers = listProviders().map((provider) => {
    const safeProvider = sanitizeProvider(provider);
    const cached = readStaleCachedModels(provider);
    const modelIds = (cached?.models || [])
      .map((model) => (typeof model?.id === "string" ? model.id : ""))
      .filter((id) => id.length > 0);

    return {
      ...safeProvider,
      cacheEnabled: isModelsCacheEnabled(provider),
      modelCache: cached
        ? {
            cachedAt: new Date(Date.now() - cached.cacheAgeMs).toISOString(),
            cacheAgeMs: cached.cacheAgeMs,
            expiresInMs: Math.max(0, MODELS_CACHE_TTL_MS - cached.cacheAgeMs),
            expired: cached.cacheAgeMs >= MODELS_CACHE_TTL_MS,
            modelCount: modelIds.length,
            modelIds,
          }
        : null,
    };
  });

  return json({ providers, cacheTtlMs: MODELS_CACHE_TTL_MS });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = validateProviderInput(body);
    const provider = createProvider(input);
    return json({ provider: sanitizeProvider(provider) }, { status: 201 });
  } catch (error: any) {
    return json({ error: error.message || "Invalid request" }, { status: 400 });
  }
};
