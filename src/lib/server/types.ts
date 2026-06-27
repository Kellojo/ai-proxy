export type ProviderKind = "openai";

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  endpointUrl: string;
  apiKey: string;
  isDefault: boolean;
  createdAt: string;
}

export interface ProviderInput {
  name: string;
  kind: ProviderKind;
  endpointUrl: string;
  apiKey?: string;
  isDefault?: boolean;
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
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  virtualKeyId?: string;
  remappedModel?: string;
  createdAt: string;
}
