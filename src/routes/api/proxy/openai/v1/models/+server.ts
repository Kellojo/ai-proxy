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

const LogPrefix = "models";

export const GET: RequestHandler = async ({ request }) => {
  const startedAt = Date.now();

  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) {
    logRequest({ model: `${LogPrefix}:list:unauthenticated`, statusCode: 401, durationMs: Date.now() - startedAt });
    return json({ error: "Missing virtual key in Authorization header" }, { status: 401 });
  }

  const virtualKey = authenticateVirtualKey(bearer);
  if (!virtualKey) {
    logRequest({ model: `${LogPrefix}:list:unauthenticated`, statusCode: 401, durationMs: Date.now() - startedAt });
    return json({ error: "Invalid virtual key" }, { status: 401 });
  }

  const providerId = readProviderId(request);
  const providers = listProviders();
  if (providers.length === 0) {
    return json({ error: "No provider configured. Add a provider in the UI first." }, { status: 400 });
  }

  if (providerId) {
    const provider = getProvider(providerId);
    if (!provider) {
      return json({ error: "Provider not found" }, { status: 404 });
    }

    console.log(
      `[ai-proxy] ${LogPrefix}:list - fetching models from "${provider.name}" (id: ${provider.id})`,
    );

    try {
      const upstream = await forwardModelList(provider);
      const statusCode = upstream.status;
      const text = await upstream.text();

      if (!upstream.ok) {
        logRequest({ providerId, model: `${LogPrefix}:list`, statusCode, durationMs: Date.now() - startedAt, virtualKeyId: virtualKey.id });
        return json(
          { error: "Upstream request failed", detail: text || "Provider returned an error response" },
          { status: statusCode },
        );
      }

      const payload = JSON.parse(text);
      const models = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];

      logRequest({ providerId, model: `${LogPrefix}:list`, statusCode, durationMs: Date.now() - startedAt, virtualKeyId: virtualKey.id });

      return json({
        object: "list",
        data: models.map((m: any) => ({ ...m, providerId })),
        meta: { providersQueried: 1 },
      });
    } catch (error: any) {
      const statusCode = 502;
      logRequest({ providerId, model: `${LogPrefix}:list`, statusCode, durationMs: Date.now() - startedAt, virtualKeyId: virtualKey.id });

      console.log(
        `[ai-proxy] ${LogPrefix}:list failed for "${provider.name}": ${error?.message || "Unknown error"}`,
      );

      return json(
        { error: "Failed to fetch models", detail: error?.message || "Unknown proxy error" },
        { status: statusCode },
      );
    }
  }

  const sortedProviders = providers;

  console.log(`[ai-proxy] ${LogPrefix}:list - querying all ${sortedProviders.length} provider(s)`);

  const results = await Promise.all(
    sortedProviders.map((provider) => fetchProviderModels(provider, startedAt, virtualKey.id)),
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
      .map((model) => ({ ...model, providerId: result.provider.id, providerName: result.provider.name })),
  );

  return json({ object: "list", data: aggregatedModels, meta: { providersQueried: sortedProviders.length } });
};

async function fetchProviderModels(
  provider: any,
  startedAt: number,
  virtualKeyId: string,
): Promise<{ provider: any; ok: boolean; statusCode: number; models: any[]; error?: string }> {
  try {
    const upstream = await forwardModelList(provider);
    const text = await upstream.text();

    if (!upstream.ok) {
      return { provider, ok: false, statusCode: upstream.status, models: [], error: text || "Provider returned an error response" };
    }

    const payload = JSON.parse(text);
    const models = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];

    return { provider, ok: true, statusCode: upstream.status, models };
  } catch (error: any) {
    return {
      provider,
      ok: false,
      statusCode: 502,
      models: [],
      error: error?.message || "Unknown proxy error",
    };
  }
}

function readProviderId(request: Request): string | undefined {
  return (
    request.headers.get("x-provider-id") ||
    request.headers.get("x-ai-provider-id") ||
    new URL(request.url).searchParams.get("providerId") ||
    undefined
  );
}
