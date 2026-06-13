import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createProvider, listProviders } from "$lib/server/db";
import type { ProviderInput } from "$lib/server/types";

function sanitizeProvider<T extends { apiKey?: string }>(provider: T) {
  const { apiKey, ...safeProvider } = provider;
  return safeProvider;
}

function validateProviderInput(value: any): ProviderInput {
  if (!value?.name || !value?.kind || !value?.endpointUrl || !value?.apiKey) {
    throw new Error("name, kind, endpointUrl and apiKey are required");
  }

  if (!["openai", "anthropic", "other"].includes(value.kind)) {
    throw new Error("kind must be one of: openai, anthropic, other");
  }

  return {
    name: value.name,
    kind: value.kind,
    endpointUrl: value.endpointUrl,
    apiKey: value.apiKey,
    isDefault: !!value.isDefault,
    wolEnabled: !!value.wolEnabled,
    wolMac: value.wolMac,
    wolBroadcast: value.wolBroadcast,
    wolPort: value.wolPort,
  };
}

export const GET: RequestHandler = async () => {
  return json({ providers: listProviders().map(sanitizeProvider) });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const input = validateProviderInput(body);
    const provider = createProvider(input);
    return json({ provider: sanitizeProvider(provider) }, { status: 201 });
  } catch (error: any) {
    return json({ error: error.message || "Invalid request" }, { status: 400 });
  }
};
