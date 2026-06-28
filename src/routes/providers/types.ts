/** Default endpoint URL used when creating a new provider. */
export const DEFAULT_ENDPOINT = "https://api.openai.com";

/** Supported provider kinds (API backends). */
export type ProviderKind = "openai" | "openrouter" | "openai-compatible";

/** Default endpoint URLs per provider kind. Add new kinds here to get auto-fill on creation. */
export const providerDefaults: Record<ProviderKind, { defaultEndpoint: string }> = {
  openai: { defaultEndpoint: "https://api.openai.com/v1" },
  openrouter: { defaultEndpoint: "https://openrouter.ai/api/v1" },
  "openai-compatible": { defaultEndpoint: "https://api.openai.com/v1" },
};

/** Returns the default endpoint URL for a given provider kind. */
export function getDefaultEndpoint(kind: ProviderKind): string {
  return providerDefaults[kind]?.defaultEndpoint ?? "";
}

/** Full provider record as stored and returned by the API. */
export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  endpointUrl: string;
  isDefault: boolean;
  modelIds?: string[];
  modelCount?: number;
  lastModelRefreshAt?: string | null;
}

/** Form state for creating or editing a provider. */
export interface ProviderForm {
  name: string;
  kind: ProviderKind;
  endpointUrl: string;
  apiKey: string;
  isDefault: boolean;
}

/** Returns a fresh, empty provider form object. */
export function createEmptyProviderForm(): ProviderForm {
  return {
    name: "",
    kind: "openai",
    endpointUrl: getDefaultEndpoint("openai"),
    apiKey: "",
    isDefault: false,
  };
}

/** Available kinds for provider selection. */
export const PROVIDER_KINDS = [
  { value: "openai" as ProviderKind, label: "OpenAI" },
  { value: "openrouter" as ProviderKind, label: "OpenRouter" },
  { value: "openai-compatible" as ProviderKind, label: "OpenAI Compatible (Anthropic, etc.)" },
] as const;
