import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { deleteProvider, getProvider, updateProvider, validateProviderInput } from "$lib/server/db";

function sanitizeProvider<T extends { apiKey?: string }>(provider: T) {
  const { apiKey, ...safeProvider } = provider;
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
