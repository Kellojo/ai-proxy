import type { Provider } from "./types";

type CachedModelsEntry = {
  providerFingerprint: string;
  cachedAt: number;
  models: any[];
};

const DEFAULT_MODELS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const parsedCacheTtlMs = Number.parseInt(
  process.env.MODELS_CACHE_TTL_MS || "",
  10,
);

export const MODELS_CACHE_TTL_MS =
  Number.isFinite(parsedCacheTtlMs) && parsedCacheTtlMs > 0
    ? parsedCacheTtlMs
    : DEFAULT_MODELS_CACHE_TTL_MS;

const modelsCache = new Map<string, CachedModelsEntry>();

export function isModelsCacheEnabled(provider: Provider): boolean {
  void provider;
  return true;
}

function providerFingerprint(provider: Provider): string {
  return [
    provider.id,
    provider.kind,
    provider.endpointUrl,
    provider.apiKey,
    provider.wolEnabled ? "1" : "0",
    provider.wolMac || "",
    provider.wolBroadcast || "",
    provider.wolPort || "",
  ].join("|");
}

function readCacheEntry(provider: Provider): CachedModelsEntry | null {
  const cached = modelsCache.get(provider.id);
  if (!cached) return null;

  if (cached.providerFingerprint !== providerFingerprint(provider)) {
    modelsCache.delete(provider.id);
    return null;
  }

  return cached;
}

export function readCachedModels(provider: Provider): {
  models: any[];
  cacheAgeMs: number;
} | null {
  const cached = readCacheEntry(provider);
  if (!cached) return null;

  const cacheAgeMs = Date.now() - cached.cachedAt;
  if (cacheAgeMs >= MODELS_CACHE_TTL_MS) {
    return null;
  }

  return {
    models: cached.models,
    cacheAgeMs,
  };
}

export function readStaleCachedModels(provider: Provider): {
  models: any[];
  cacheAgeMs: number;
} | null {
  const cached = readCacheEntry(provider);
  if (!cached) return null;

  return {
    models: cached.models,
    cacheAgeMs: Date.now() - cached.cachedAt,
  };
}

export function writeCachedModels(provider: Provider, models: any[]): void {
  modelsCache.set(provider.id, {
    providerFingerprint: providerFingerprint(provider),
    cachedAt: Date.now(),
    models,
  });
}

export function clearModelsCache(providerId?: string): number {
  if (providerId) {
    return modelsCache.delete(providerId) ? 1 : 0;
  }

  const removed = modelsCache.size;
  modelsCache.clear();
  return removed;
}

export function getModelsCacheSnapshot(): Array<{
  providerId: string;
  cachedAt: number;
  cacheAgeMs: number;
  modelCount: number;
  modelIds: string[];
  expired: boolean;
}> {
  return Array.from(modelsCache.entries()).map(([providerId, entry]) => {
    const cacheAgeMs = Date.now() - entry.cachedAt;
    const modelIds = entry.models
      .map((model) => (typeof model?.id === "string" ? model.id : ""))
      .filter((id) => id.length > 0);

    return {
      providerId,
      cachedAt: entry.cachedAt,
      cacheAgeMs,
      modelCount: modelIds.length,
      modelIds,
      expired: cacheAgeMs >= MODELS_CACHE_TTL_MS,
    };
  });
}
