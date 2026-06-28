import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createProvider, fetchAndSaveProviderModels, listProviders, validateProviderInput } from "$lib/server/db";

function sanitizeProvider<T extends { apiKey?: string; modelIds?: unknown }>(provider: T) {
  const { apiKey, ...safeProvider } = provider as any;
  if (typeof safeProvider.model_ids_json === "string") {
    try {
      const parsed = JSON.parse(safeProvider.model_ids_json);
      safeProvider.modelIds = Array.isArray(parsed) ? parsed : [];
      safeProvider.modelCount = safeProvider.modelIds.length;
    } catch {
      safeProvider.modelIds = [];
      safeProvider.modelCount = 0;
    }
    delete (safeProvider as any).model_ids_json;
  } else if (Array.isArray(safeProvider.modelIds)) {
    safeProvider.modelCount = safeProvider.modelIds.length;
  } else {
    safeProvider.modelIds = [];
    safeProvider.modelCount = 0;
  }
  return safeProvider;
}

export const GET: RequestHandler = async () => {
  const providers = listProviders().map((provider) => sanitizeProvider(provider));

  return json({ providers });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = validateProviderInput(body);
    if (!input) throw new Error("Invalid provider data");
    const provider = createProvider(input);

    // Fetch models in the background so we don't block the response
    fetchAndSaveProviderModels(provider).catch((err: any) => {
      console.error("[ai-proxy] Background model refresh failed:", err?.message || "Unknown error");
    });

    return json({ provider: sanitizeProvider(provider) }, { status: 201 });
  } catch (error: any) {
    return json({ error: error.message || "Invalid request" }, { status: 400 });
  }
};
