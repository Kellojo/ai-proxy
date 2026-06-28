import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { listProviders } from "$lib/server/db";

export const GET: RequestHandler = async () => {
  const providers = listProviders();

  const providerOptions = providers.map((p) => ({ id: p.id, name: p.name, kind: p.kind }));

  const allModelIds = new Set<string>();
  for (const p of providers) {
    if (Array.isArray(p.modelIds)) {
      for (const m of p.modelIds) {
        if (typeof m === "string" && m.length > 0) {
          allModelIds.add(m);
        }
      }
    }
  }

  const models = [...allModelIds].sort();

  return json({ providers: providerOptions, models });
};
