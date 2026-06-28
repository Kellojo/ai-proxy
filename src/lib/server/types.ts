export type ProviderKind = "openai";

export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  endpointUrl: string;
  apiKey: string;
  isDefault: boolean;
  createdAt: string;
  modelIds?: string[];
  lastModelRefreshAt?: string;
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

export interface RequestRow {
  id: string;
  created_at: string;
  status_code: number;
  model: string;
  duration_ms: number;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost: number | null;
  remapped_model: string | null;
  virtual_key_id: string | null;
  key_name: string;
  provider_name: string;
}
