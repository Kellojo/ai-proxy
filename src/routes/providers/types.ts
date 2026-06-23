/** Default endpoint URL used when creating a new provider. */
export const DEFAULT_ENDPOINT = "https://api.openai.com";

/** Supported provider kinds (API backends). */
export type ProviderKind = "openai" | "anthropic" | "other";

/** Cache metadata for a provider's model list. */
export interface ProviderModelCache {
  /** ISO timestamp when the cache was populated. */
  cachedAt: string;
  /** Age of the cache in milliseconds. */
  cacheAgeMs: number;
  /** Duration until the cache expires in milliseconds. */
  expiresInMs: number;
  /** Whether the cache has expired. */
  expired: boolean;
  /** Number of models in the cache. */
  modelCount: number;
  /** List of model identifiers. */
  modelIds: string[];
}

/** Full provider record as stored and returned by the API. */
export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  endpointUrl: string;
  isDefault: boolean;
  wolEnabled: boolean;
  wolMac?: string;
  wolBroadcast?: string;
  wolPort?: number;
  cacheEnabled: boolean;
  modelCache: ProviderModelCache | null;
}

/** Form state for creating or editing a provider. */
export interface ProviderForm {
  name: string;
  kind: ProviderKind;
  endpointUrl: string;
  apiKey: string;
  isDefault: boolean;
  wolEnabled: boolean;
  wolMac: string;
  wolBroadcast: string;
  wolPort: number;
}

/** Returns a fresh, empty provider form object. */
export function createEmptyProviderForm(): ProviderForm {
  return {
    name: "",
    kind: "openai",
    endpointUrl: DEFAULT_ENDPOINT,
    apiKey: "",
    isDefault: false,
    wolEnabled: false,
    wolMac: "",
    wolBroadcast: "255.255.255.255",
    wolPort: 9,
  };
}
