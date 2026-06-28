import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { deleteProvider, fetchAndSaveProviderModels, getProvider, updateProvider, validateProviderInput } from "$lib/server/db";

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

export const GET: RequestHandler = async ({ params }) => {
  const provider = getProvider(params.id);
  if (!provider) {
    return json({ error: "Provider not found" }, { status: 404 });
  }
  return json({ provider: sanitizeProvider(provider) });
};

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const input = validateProviderInput(body, { requireApiKey: false });
    if (!input) throw new Error("Invalid provider data");
    const provider = updateProvider(params.id, input);

    if (!provider) {
      return json({ error: "Provider not found" }, { status: 404 });
    }

    // Fetch models in the background so we don't block the response
    fetchAndSaveProviderModels(provider).catch((err: any) => {
      console.error("[ai-proxy] Background model refresh failed:", err?.message || "Unknown error");
    });

    return json({ provider: sanitizeProvider(provider) });
  } catch (error: any) {
    return json({ error: error.message || "Invalid request" }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  const deleted = deleteProvider(params.id);
  if (!deleted) {
    return json({ error: "Provider not found" }, { status: 404 });
  }
  return json({ ok: true });
};
