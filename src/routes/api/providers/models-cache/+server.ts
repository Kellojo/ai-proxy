import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listProviders } from "$lib/server/db";
import {
  MODELS_CACHE_TTL_MS,
  getModelsCacheSnapshot,
  isModelsCacheEnabled,
} from "$lib/server/models-cache";

export const GET: RequestHandler = async () => {
  const providers = listProviders();
  const providersById = new Map(
    providers.map((provider) => [provider.id, provider]),
  );

  const entries = getModelsCacheSnapshot()
    .map((entry) => {
      const provider = providersById.get(entry.providerId);

      return {
        providerId: entry.providerId,
        providerName: provider?.name || "Unknown provider",
        providerKind: provider?.kind || "other",
        cacheEnabled: provider ? isModelsCacheEnabled(provider) : false,
        cachedAt: new Date(entry.cachedAt).toISOString(),
        cacheAgeMs: entry.cacheAgeMs,
        expiresInMs: Math.max(0, MODELS_CACHE_TTL_MS - entry.cacheAgeMs),
        expired: entry.expired,
        modelCount: entry.modelCount,
        modelIds: entry.modelIds,
      };
    })
    .sort((a, b) => b.cacheAgeMs - a.cacheAgeMs);

  return json({
    cacheTtlMs: MODELS_CACHE_TTL_MS,
    entryCount: entries.length,
    entries,
  });
};
