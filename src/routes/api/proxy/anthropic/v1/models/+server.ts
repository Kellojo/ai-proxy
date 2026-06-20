import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  authenticateVirtualKey,
  getProvider,
  listProviders,
  logRequest,
} from "$lib/server/db";
import { extractBearer } from "$lib/server/keys";
import { forwardModelList } from "$lib/server/proxy";
import type { Provider } from "$lib/server/types";
import {
  MODELS_CACHE_TTL_MS,
  clearModelsCache,
  isModelsCacheEnabled,
  readCachedModels,
  readStaleCachedModels,
  writeCachedModels,
} from "$lib/server/models-cache";
import {
  readProviderId,
  authErrorResponse,
  noProviderResponse,
  providerNotFoundResponse,
} from "$lib/server/common-server";

const LogPrefix = "anthropic:models";

type ProviderFetchResult = {
  provider: Provider;
  ok: boolean;
  statusCode: number;
  models: any[];
  fromCache: boolean;
  stale: boolean;
  cacheAgeMs?: number;
  error?: string;
};

function shouldBypassCache(request: Request): boolean {
  const cacheControl = (
    request.headers.get("cache-control") || ""
  ).toLowerCase();
  const pragma = (request.headers.get("pragma") || "").toLowerCase();
  const refreshParam = (
    new URL(request.url).searchParams.get("refresh") || ""
  ).toLowerCase();
  const refreshHeader = (
    request.headers.get("x-refresh-cache") || ""
  ).toLowerCase();
  const bustHeader = (
    request.headers.get("x-model-cache-bust") || ""
  ).toLowerCase();

  return (
    cacheControl.includes("no-cache") ||
    cacheControl.includes("no-store") ||
    pragma.includes("no-cache") ||
    refreshParam === "1" ||
    refreshParam === "true" ||
    refreshHeader === "1" ||
    refreshHeader === "true" ||
    bustHeader === "1" ||
    bustHeader === "true"
  );
}

async function fetchProviderModels(
  provider: Provider,
  startedAt: number,
  virtualKeyId: string,
  options?: { bypassCache?: boolean },
): Promise<ProviderFetchResult> {
  const cacheEnabled = isModelsCacheEnabled(provider);

  if (cacheEnabled && !options?.bypassCache) {
    const cached = readCachedModels(provider);
    if (cached) {
      logRequest({
        providerId: provider.id,
        model: `${LogPrefix}:list`,
        statusCode: 200,
        durationMs: Date.now() - startedAt,
        virtualKeyId,
      });

      return {
        provider,
        ok: true,
        statusCode: 200,
        models: cached.models,
        fromCache: true,
        stale: false,
        cacheAgeMs: cached.cacheAgeMs,
      };
    }
  }

  try {
    const upstream = await forwardModelList(provider);
    const statusCode = upstream.status;
    const text = await upstream.text();

    if (!upstream.ok) {
      logRequest({
        providerId: provider.id,
        model: `${LogPrefix}:list`,
        statusCode,
        durationMs: Date.now() - startedAt,
        virtualKeyId,
      });

      const staleCache = readStaleCachedModels(provider);
      if (cacheEnabled && staleCache) {
        return {
          provider,
          ok: true,
          statusCode: 200,
          models: staleCache.models,
          fromCache: true,
          stale: true,
          cacheAgeMs: staleCache.cacheAgeMs,
          error: text || "Provider returned an error response",
        };
      }

      return {
        provider,
        ok: false,
        statusCode,
        models: [],
        fromCache: false,
        stale: false,
        error: text || "Provider returned an error response",
      };
    }

    const payload = JSON.parse(text);
    const models = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : [];

    if (cacheEnabled) {
      writeCachedModels(provider, models);
    }

    logRequest({
      providerId: provider.id,
      model: `${LogPrefix}:list`,
      statusCode,
      durationMs: Date.now() - startedAt,
      virtualKeyId,
    });

    return {
      provider,
      ok: true,
      statusCode,
      models,
      fromCache: false,
      stale: false,
    };
  } catch (error: any) {
    const statusCode = 502;

    logRequest({
      providerId: provider.id,
      model: `${LogPrefix}:list`,
      statusCode,
      durationMs: Date.now() - startedAt,
      virtualKeyId,
    });

    const staleCache = readStaleCachedModels(provider);
    if (cacheEnabled && staleCache) {
      return {
        provider,
        ok: true,
        statusCode: 200,
        models: staleCache.models,
        fromCache: true,
        stale: true,
        cacheAgeMs: staleCache.cacheAgeMs,
        error: error?.message || "Unknown proxy error",
      };
    }

    return {
      provider,
      ok: false,
      statusCode,
      models: [],
      fromCache: false,
      stale: false,
      error: error?.message || "Unknown proxy error",
    };
  }
}

export const GET: RequestHandler = async ({ request }) => {
  const startedAt = Date.now();

  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) {
    logRequest({
      model: `${LogPrefix}:list:unauthenticated`,
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });
    return authErrorResponse("missing");
  }

  const virtualKey = authenticateVirtualKey(bearer);
  if (!virtualKey) {
    logRequest({
      model: `${LogPrefix}:list:unauthenticated`,
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });
    return authErrorResponse("invalid");
  }

  const providerId = readProviderId(request);
  const bypassCache = shouldBypassCache(request);
  const providers = listProviders();
  if (providers.length === 0) {
    return noProviderResponse();
  }

  if (providerId) {
    const provider = getProvider(providerId);
    if (!provider) {
      return providerNotFoundResponse();
    }

    if (bypassCache && isModelsCacheEnabled(provider)) {
      clearModelsCache(provider.id);
    }

    const result = await fetchProviderModels(
      provider,
      startedAt,
      virtualKey.id,
      { bypassCache },
    );
    if (!result.ok) {
      return json(
        {
          error: "Upstream request failed",
          detail: result.error || "Unknown proxy error",
        },
        { status: result.statusCode || 502 },
      );
    }

    return json({
      content_type: "list",
      data: result.models,
      meta: {
        cacheTtlMs: MODELS_CACHE_TTL_MS,
        cacheEnabled: isModelsCacheEnabled(provider),
        fromCache: result.fromCache,
        stale: result.stale,
        cacheAgeMs: result.cacheAgeMs,
      },
    });
  }

  const sortedProviders = providers;

  if (bypassCache) {
    clearModelsCache();
  }

  const results = await Promise.all(
    sortedProviders.map((provider) =>
      fetchProviderModels(provider, startedAt, virtualKey.id, { bypassCache }),
    ),
  );

  const successful = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);

  if (successful.length === 0) {
    return json(
      {
        error: "Failed to fetch models from all providers",
        details: failed.map((result) => ({
          providerId: result.provider.id,
          providerName: result.provider.name,
          statusCode: result.statusCode,
          error: result.error || "Unknown provider error",
        })),
      },
      { status: 502 },
    );
  }

  const aggregatedModels = successful.flatMap((result) =>
    result.models
      .filter((model) => typeof model?.id === "string" && model.id.length > 0)
      .map((model) => ({
        ...model,
        providerId: result.provider.id,
        providerName: result.provider.name,
        providerKind: result.provider.kind,
      })),
  );

  return json({
    content_type: "list",
    data: aggregatedModels,
    meta: {
      cacheTtlMs: MODELS_CACHE_TTL_MS,
      cacheBypassed: bypassCache,
      providersQueried: sortedProviders.length,
      providersSucceeded: successful.length,
      providersFailed: failed.length,
      providersFromCache: successful.filter((result) => result.fromCache)
        .length,
      providersServingStaleCache: successful.filter((result) => result.stale)
        .length,
    },
    errors: failed.map((result) => ({
      providerId: result.provider.id,
      providerName: result.provider.name,
      statusCode: result.statusCode,
      error: result.error || "Unknown provider error",
    })),
  });
};

export const DELETE: RequestHandler = async ({ request }) => {
  const startedAt = Date.now();

  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) {
    logRequest({
      model: `${LogPrefix}:cache:clear:unauthenticated`,
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });
    return authErrorResponse("missing");
  }

  const virtualKey = authenticateVirtualKey(bearer);
  if (!virtualKey) {
    logRequest({
      model: `${LogPrefix}:cache:clear:unauthenticated`,
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });
    return authErrorResponse("invalid");
  }

  const providerId = readProviderId(request);
  const provider = providerId ? getProvider(providerId) : undefined;
  if (providerId && !provider) {
    return providerNotFoundResponse();
  }

  const clearedEntries =
    providerId && provider && !isModelsCacheEnabled(provider)
      ? 0
      : clearModelsCache(providerId);

  logRequest({
    providerId,
    model: providerId
      ? `${LogPrefix}:cache:clear:provider`
      : `${LogPrefix}:cache:clear`,
    statusCode: 200,
    durationMs: Date.now() - startedAt,
    virtualKeyId: virtualKey.id,
  });

  return json({
    ok: true,
    scope: providerId ? "provider" : "all",
    providerId,
    clearedEntries,
  });
};
