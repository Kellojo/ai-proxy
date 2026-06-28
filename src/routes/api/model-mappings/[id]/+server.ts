import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createOrUpdateModelMapping, deleteModelMapping, invalidateModelMappingCache, listModelMappings } from "$lib/server/db";

export const GET: RequestHandler = async () => {
  const mappings = listModelMappings();
  return json({ mappings });
};

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const sourceModel = body?.source_model;
    const targetModel = body?.target_model;
    const providerId = body?.provider_id || undefined;

    if (!sourceModel || !targetModel) {
      throw new Error("source_model and target_model are required");
    }

    invalidateModelMappingCache();
    const mapping = createOrUpdateModelMapping(sourceModel, targetModel, providerId, params.id);
    return json({ ok: true, mapping });
  } catch (error: any) {
    return json({ error: error.message || "Invalid request" }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    await deleteModelMapping(params.id);
    return json({ ok: true });
  } catch (error: any) {
    return json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
};
