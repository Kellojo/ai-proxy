import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createOrUpdateModelMapping, invalidateModelMappingCache, listModelMappings } from "$lib/server/db";

export const GET: RequestHandler = async () => {
  const mappings = listModelMappings();
  return json({ mappings });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const sourceModel = body?.source_model;
    const targetModel = body?.target_model;

    if (!sourceModel || !targetModel) {
      throw new Error("source_model and target_model are required");
    }

    invalidateModelMappingCache();
    const mapping = createOrUpdateModelMapping(sourceModel, targetModel);
    return json({ mapping }, { status: 201 });
  } catch (error: any) {
    return json({ error: error.message || "Invalid request" }, { status: 400 });
  }
};
