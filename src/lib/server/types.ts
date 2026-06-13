export type ProviderKind = "openai" | "anthropic" | "other";

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  endpointUrl: string;
  apiKey: string;
  isDefault: boolean;
  wolEnabled: boolean;
  wolMac?: string;
  wolBroadcast?: string;
  wolPort?: number;
  createdAt: string;
}

export interface ProviderInput {
  name: string;
  kind: ProviderKind;
  endpointUrl: string;
  apiKey?: string;
  isDefault?: boolean;
  wolEnabled?: boolean;
  wolMac?: string;
  wolBroadcast?: string;
  wolPort?: number;
}

export interface VirtualKey {
  id: string;
  name: string;
  keyPrefix: string;
  active: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

export interface RequestLog {
  id: string;
  providerId?: string;
  model: string;
  statusCode: number;
  durationMs: number;
  virtualKeyId?: string;
  createdAt: string;
}
