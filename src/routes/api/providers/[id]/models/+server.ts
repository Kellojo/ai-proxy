import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { fetchAndSaveProviderModels, getProvider, getProviderModelIds, listProviders } from "$lib/server/db";

export const GET: RequestHandler = async ({ params }) => {
  const provider = getProvider(params.id);
  if (!provider) {
    return json({ error: "Provider not found" }, { status: 404 });
  }

  let cached = getProviderModelIds(provider.id);

  // If no cached models or the data is stale (older than 30 minutes), refresh.
  const needsRefresh = !cached?.lastUpdated ||
    (cached.lastUpdated && Date.now() - new Date(cached.lastUpdated).getTime() > 30 * 60 * 1000);

  if (needsRefresh) {
    try {
      await fetchAndSaveProviderModels(provider);
      cached = getProviderModelIds(provider.id) ?? { modelIds: [], lastUpdated: null };
    } catch (error: any) {
      console.error(`[ai-proxy] Failed to refresh models for "${provider.name}":`, error?.message || "Unknown error");
      // Return stale data if available.
      cached = cached ?? { modelIds: [], lastUpdated: null };
    }
  }

  return json({ providerId: provider.id, modelName: provider.name, modelIds: cached?.modelIds ?? [] });
};
