import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createProvider, listProviders, validateProviderInput } from "$lib/server/db";

function sanitizeProvider<T extends { apiKey?: string }>(provider: T) {
  const { apiKey, ...safeProvider } = provider;
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
    return json({ provider: sanitizeProvider(provider) }, { status: 201 });
  } catch (error: any) {
    return json({ error: error.message || "Invalid request" }, { status: 400 });
  }
};
