import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { deleteProvider, getProvider, updateProvider } from "$lib/server/db";
import type { ProviderInput } from "$lib/server/types";

function sanitizeProvider<T extends { apiKey?: string }>(provider: T) {
  const { apiKey, ...safeProvider } = provider;
  return safeProvider;
}

function validateProviderInput(
  value: any,
  options: { requireApiKey?: boolean } = {},
): ProviderInput {
  if (!value?.name || !value?.kind || !value?.endpointUrl) {
    throw new Error("name, kind and endpointUrl are required");
  }

  const apiKey =
    typeof value?.apiKey === "string" && value.apiKey.trim().length > 0
      ? value.apiKey
      : undefined;

  if (options.requireApiKey && !apiKey) {
    throw new Error("apiKey is required");
  }

  if (!["openai", "anthropic", "other"].includes(value.kind)) {
    throw new Error("kind must be one of: openai, anthropic, other");
  }

  return {
    name: value.name,
    kind: value.kind,
    endpointUrl: value.endpointUrl,
    apiKey,
    isDefault: !!value.isDefault,
    wolEnabled: !!value.wolEnabled,
    wolMac: value.wolMac,
    wolBroadcast: value.wolBroadcast,
    wolPort: value.wolPort,
  };
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
