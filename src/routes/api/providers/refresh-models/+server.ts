import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { fetchAndSaveAllProviderModels, fetchAndSaveProviderModels, getProvidersWithModels, listProviders } from "$lib/server/db";

export const POST: RequestHandler = async () => {
  try {
    await fetchAndSaveAllProviderModels();
    const providers = getProvidersWithModels();
    return json({ ok: true, providers });
  } catch (error: any) {
    return json(
      { error: "Failed to refresh models", detail: error?.message || "Unknown error" },
      { status: 500 },
    );
  }
};

export const GET: RequestHandler = async () => {
  const providers = getProvidersWithModels();
  return json({ providers });
};
