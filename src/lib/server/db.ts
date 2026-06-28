import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type { Provider, ProviderInput, VirtualKey } from "./types";
import { generateVirtualKeyPlaintext, hashKey } from "./keys";

const dbFilePath =
  process.env.DATABASE_PATH || path.join(process.cwd(), "data", "ai-proxy.db");
fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });

const db = new Database(dbFilePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL     CHECK(kind = 'openai' OR kind = 'openrouter' OR kind = 'openai-compatible'),
    endpoint_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS virtual_keys (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    key_prefix TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    last_used_at TEXT
  );

  CREATE TABLE IF NOT EXISTS request_logs (
    id TEXT PRIMARY KEY,
    provider_id TEXT,
    model TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    virtual_key_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE SET NULL,
    FOREIGN KEY(virtual_key_id) REFERENCES virtual_keys(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS model_mappings (
    id TEXT PRIMARY KEY,
    source_model TEXT NOT NULL UNIQUE,
    target_model TEXT NOT NULL,
    provider_id TEXT,
    FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS provider_models (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL UNIQUE,
    model_ids_json TEXT NOT NULL DEFAULT '[]',
    last_updated TEXT NOT NULL
  );
`);

const requestLogColumns = db
  .prepare("PRAGMA table_info(request_logs)")
  .all() as Array<{ name: string; notnull: number }>;
const providerIdColumn = requestLogColumns.find(
  (column) => column.name === "provider_id",
);

if (providerIdColumn?.notnull === 1) {
  db.exec(`
    PRAGMA foreign_keys = OFF;

    CREATE TABLE IF NOT EXISTS request_logs_migrated (
      id TEXT PRIMARY KEY,
      provider_id TEXT,
      model TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      virtual_key_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE SET NULL,
      FOREIGN KEY(virtual_key_id) REFERENCES virtual_keys(id) ON DELETE SET NULL
    );

    INSERT INTO request_logs_migrated
      (id, provider_id, model, status_code, duration_ms, virtual_key_id, created_at)
    SELECT
      id, provider_id, model, status_code, duration_ms, virtual_key_id, created_at
    FROM request_logs;

    DROP TABLE request_logs;
    ALTER TABLE request_logs_migrated RENAME TO request_logs;

    PRAGMA foreign_keys = ON;
  `);
}

const hasRequestLogColumn = (name: string) =>
  requestLogColumns.some((column) => column.name === name);

if (!hasRequestLogColumn("prompt_tokens")) {
  db.exec("ALTER TABLE request_logs ADD COLUMN prompt_tokens INTEGER");
}

if (!hasRequestLogColumn("completion_tokens")) {
  db.exec("ALTER TABLE request_logs ADD COLUMN completion_tokens INTEGER");
}

if (!hasRequestLogColumn("total_tokens")) {
  db.exec("ALTER TABLE request_logs ADD COLUMN total_tokens INTEGER");
}

if (!hasRequestLogColumn("cost")) {
  db.exec("ALTER TABLE request_logs ADD COLUMN cost REAL");
}

if (!hasRequestLogColumn("remapped_model")) {
  db.exec("ALTER TABLE request_logs ADD COLUMN remapped_model TEXT DEFAULT ''");
}

const modelMappingsColumns = db
  .prepare("PRAGMA table_info(model_mappings)")
  .all() as Array<{ name: string }>;
if (!modelMappingsColumns.some((col) => col.name === "provider_id")) {
  db.exec("ALTER TABLE model_mappings ADD COLUMN provider_id TEXT");
}

function mapProvider(row: any): Provider {
  const result: Provider = {
    id: row.id,
    name: row.name,
    kind: row.kind,
    endpointUrl: row.endpoint_url,
    apiKey: row.api_key,
    isDefault: !!row.is_default,
    createdAt: row.created_at,
  };

  if (row._model_ids_json) {
    try {
      result.modelIds = JSON.parse(row._model_ids_json);
    } catch {
      result.modelIds = [];
    }
    result.lastModelRefreshAt = row._last_model_updated;
  }

  return result;
}

function mapVirtualKey(row: any): VirtualKey {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    active: !!row.active,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || undefined,
  };
}

export function listProviders(): Provider[] {
  const rows = db
    .prepare(
      `SELECT p.*, pm.model_ids_json AS _model_ids_json, pm.last_updated AS _last_model_updated
       FROM providers p
       LEFT JOIN provider_models pm ON pm.provider_id = p.id
       ORDER BY created_at DESC`,
    )
    .all();
  return rows.map(mapProvider);
}

export function getProvider(id: string): Provider | undefined {
  const row = db.prepare("SELECT * FROM providers WHERE id = ?").get(id);
  return row ? mapProvider(row) : undefined;
}

export function getDefaultProvider(): Provider | undefined {
  const row = db
    .prepare("SELECT * FROM providers WHERE is_default = 1 LIMIT 1")
    .get();
  return row ? mapProvider(row) : undefined;
}

/** Validate provider input for both creation and update operations. */
export function validateProviderInput(
  value: any,
  options: { requireApiKey?: boolean } = {},
): ProviderInput | null {
  if (!value?.name || !value?.kind || !value?.endpointUrl) {
    throw new Error("name, kind and endpointUrl are required");
  }

  const apiKey =
    typeof value.apiKey === "string" && value.apiKey.trim().length > 0
      ? value.apiKey
      : undefined;

  if (options.requireApiKey && !apiKey) {
    throw new Error("apiKey is required");
  }

  if (!["openai", "openrouter", "openai-compatible"].includes(value.kind)) {
    throw new Error(
      "kind must be one of: openai, openrouter, openai-compatible",
    );
  }

  return {
    name: value.name,
    kind: value.kind,
    endpointUrl: value.endpointUrl,
    apiKey,
    isDefault: !!value.isDefault,
  };
}

export function createProvider(input: ProviderInput): Provider {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const tx = db.transaction(() => {
    if (input.isDefault) {
      db.prepare("UPDATE providers SET is_default = 0").run();
    }

    db.prepare(
      `INSERT INTO providers (id, name, kind, endpoint_url, api_key, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.kind,
      input.endpointUrl,
      input.apiKey,
      input.isDefault ? 1 : 0,
      createdAt,
    );
  });

  tx();
  return getProvider(id)!;
}

export function updateProvider(
  id: string,
  input: ProviderInput,
): Provider | undefined {
  const existing = getProvider(id);
  if (!existing) return undefined;

  const nextApiKey =
    input.apiKey && input.apiKey.trim().length > 0
      ? input.apiKey
      : existing.apiKey;

  const tx = db.transaction(() => {
    if (input.isDefault) {
      db.prepare("UPDATE providers SET is_default = 0").run();
    }

    db.prepare(
      `UPDATE providers SET
       name = ?, kind = ?, endpoint_url = ?, api_key = ?, is_default = ?, created_at = ? WHERE id = ?`,
    ).run(
      input.name,
      input.kind,
      input.endpointUrl,
      nextApiKey,
      input.isDefault ? 1 : 0,
      existing.createdAt,
      id,
    );
  });

  tx();
  return getProvider(id);
}

export function deleteProvider(id: string): boolean {
  db.prepare("DELETE FROM provider_models WHERE provider_id = ?").run(id);
  const result = db.prepare("DELETE FROM providers WHERE id = ?").run(id);
  return result.changes > 0;
}

// ── Provider Models ──────────────────────────────────────────────────────

export function getProviderModelIds(
  providerId: string,
): { modelIds: string[]; lastUpdated: string | null } | undefined {
  const row = db
    .prepare("SELECT * FROM provider_models WHERE provider_id = ?")
    .get(providerId) as any;
  if (!row) return undefined;

  let modelIds: string[] = [];
  try {
    modelIds = JSON.parse(row.model_ids_json);
  } catch {
    modelIds = [];
  }

  return { modelIds, lastUpdated: row.last_updated || null };
}

export function saveProviderModelIds(
  providerId: string,
  modelIds: string[],
): void {
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO provider_models (id, provider_id, model_ids_json, last_updated) VALUES (?, ?, ?, ?)
     ON CONFLICT(provider_id) DO UPDATE SET model_ids_json = excluded.model_ids_json, last_updated = excluded.last_updated`,
  ).run(id, providerId, JSON.stringify(modelIds), now);
}

let cachedProviderModelIds: Map<
  string,
  { modelIds: string[]; lastUpdated: string | null }
> | null = null;

export function getProvidersWithModels(): Array<{
  id: string;
  name: string;
  modelIds: string[];
  lastUpdated: string | null;
}> {
  const rows = db
    .prepare(
      "SELECT p.id, p.name, pm.model_ids_json, pm.last_updated FROM providers p LEFT JOIN provider_models pm ON pm.provider_id = p.id ORDER BY p.created_at DESC",
    )
    .all() as Array<{
    id: string;
    name: string;
    model_ids_json: string | null;
    last_updated: string | null;
  }>;

  return rows.map((row) => {
    let modelIds: string[] = [];
    try {
      if (row.model_ids_json) modelIds = JSON.parse(row.model_ids_json);
    } catch {
      /* ignore */
    }
    return {
      id: row.id,
      name: row.name,
      modelIds,
      lastUpdated: row.last_updated,
    };
  });
}

export function invalidateProviderModelCache(): void {
  cachedProviderModelIds = null;
}

export function listVirtualKeys(): VirtualKey[] {
  const rows = db
    .prepare(
      "SELECT id, name, key_prefix, active, created_at, last_used_at FROM virtual_keys ORDER BY created_at DESC",
    )
    .all();
  return rows.map(mapVirtualKey);
}

export function createVirtualKey(name: string): {
  key: VirtualKey;
  plaintext: string;
} {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const plaintext = generateVirtualKeyPlaintext();
  const keyHash = hashKey(plaintext);
  const keyPrefix = plaintext.slice(0, 8);

  db.prepare(
    `INSERT INTO virtual_keys (id, name, key_hash, key_prefix, active, created_at)
     VALUES (?, ?, ?, ?, 1, ?)`,
  ).run(id, name, keyHash, keyPrefix, createdAt);

  const row = db
    .prepare(
      "SELECT id, name, key_prefix, active, created_at, last_used_at FROM virtual_keys WHERE id = ?",
    )
    .get(id);

  return { key: mapVirtualKey(row), plaintext };
}

export function updateVirtualKey(
  id: string,
  values: { name?: string; active?: boolean },
): VirtualKey | undefined {
  const existing = db
    .prepare("SELECT * FROM virtual_keys WHERE id = ?")
    .get(id) as { name: string; active: number } | undefined;
  if (!existing) return undefined;

  const name = values.name ?? existing.name;
  const active = values.active ?? !!existing.active;

  db.prepare("UPDATE virtual_keys SET name = ?, active = ? WHERE id = ?").run(
    name,
    active ? 1 : 0,
    id,
  );

  const row = db
    .prepare(
      "SELECT id, name, key_prefix, active, created_at, last_used_at FROM virtual_keys WHERE id = ?",
    )
    .get(id);

  return mapVirtualKey(row);
}

export function rerollVirtualKey(
  id: string,
): { key: VirtualKey; plaintext: string } | undefined {
  const existing = db
    .prepare("SELECT * FROM virtual_keys WHERE id = ?")
    .get(id);
  if (!existing) return undefined;

  const plaintext = generateVirtualKeyPlaintext();
  const keyHash = hashKey(plaintext);
  const keyPrefix = plaintext.slice(0, 8);

  db.prepare(
    "UPDATE virtual_keys SET key_hash = ?, key_prefix = ?, active = 1 WHERE id = ?",
  ).run(keyHash, keyPrefix, id);

  const row = db
    .prepare(
      "SELECT id, name, key_prefix, active, created_at, last_used_at FROM virtual_keys WHERE id = ?",
    )
    .get(id);

  return { key: mapVirtualKey(row), plaintext };
}

export function deleteVirtualKey(id: string): boolean {
  const result = db.prepare("DELETE FROM virtual_keys WHERE id = ?").run(id);
  return result.changes > 0;
}

export function authenticateVirtualKey(
  plaintext: string,
): VirtualKey | undefined {
  const keyHash = hashKey(plaintext);
  const row = db
    .prepare(
      "SELECT id, name, key_prefix, active, created_at, last_used_at FROM virtual_keys WHERE key_hash = ? AND active = 1",
    )
    .get(keyHash) as
    | {
        id: string;
        name: string;
        key_prefix: string;
        active: number;
        created_at: string;
        last_used_at: string | null;
      }
    | undefined;

  if (!row) return undefined;

  const now = new Date().toISOString();
  db.prepare("UPDATE virtual_keys SET last_used_at = ? WHERE id = ?").run(
    now,
    row.id,
  );
  row.last_used_at = now;

  return mapVirtualKey(row);
}

export function logRequest(input: {
  providerId?: string;
  model: string;
  statusCode: number;
  durationMs: number;
  virtualKeyId?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  remappedModel?: string;
}): void {
  db.prepare(
    `INSERT INTO request_logs (
      id, provider_id, model, status_code, duration_ms, virtual_key_id,
      prompt_tokens, completion_tokens, total_tokens, cost, remapped_model, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.providerId || null,
    input.model,
    input.statusCode,
    input.durationMs,
    input.virtualKeyId || null,
    input.promptTokens ?? null,
    input.completionTokens ?? null,
    input.totalTokens ?? null,
    input.cost ?? null,
    input.remappedModel || "",
    new Date().toISOString(),
  );
}

export function getStats() {
  const summary = db
    .prepare(
      `SELECT COUNT(*) AS request_count, COALESCE(SUM(total_tokens), 0) AS total_tokens, SUM(cost) AS total_cost FROM request_logs`,
    )
    .get();

  const providerUsage = db
    .prepare(
      `SELECT p.id, p.name, COUNT(r.id) AS request_count FROM providers p LEFT JOIN request_logs r ON p.id = r.provider_id GROUP BY p.id, p.name ORDER BY request_count DESC, p.name ASC`,
    )
    .all();

  const modelUsage = db
    .prepare(
      `SELECT model, COUNT(*) AS request_count FROM request_logs GROUP BY model ORDER BY request_count DESC, model ASC LIMIT 20`,
    )
    .all();

  const requestsTimeline = db
    .prepare(
      `SELECT (strftime('%Y-%m-%dT%H:%M:00Z', created_at)) AS hour_bucket, status_code, COUNT(*) AS request_count FROM request_logs WHERE datetime(created_at) >= datetime('now', '-24 hours') GROUP BY hour_bucket, status_code ORDER BY hour_bucket ASC`,
    )
    .all();

  const recentRequests = db
    .prepare(
      `SELECT r.id, r.created_at, r.status_code, r.model, r.duration_ms, r.prompt_tokens, r.completion_tokens, r.total_tokens, r.cost, r.remapped_model, r.virtual_key_id, COALESCE(vk.name, 'Unauthenticated') AS key_name, COALESCE(p.name, '—') AS provider_name FROM request_logs r LEFT JOIN providers p ON p.id = r.provider_id LEFT JOIN virtual_keys vk ON vk.id = r.virtual_key_id ORDER BY r.created_at DESC LIMIT 50`,
    )
    .all();

  return {
    summary,
    providerUsage,
    modelUsage,
    requestsTimeline,
    recentRequests,
  };
}

// ── Model Migrations ──────────────────────────────────────────────────────

function tableExists(name: string): boolean {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get(name) as { count: number };
  return row.count > 0;
}

if (!tableExists("model_mappings")) {
  db.exec(`
    CREATE TABLE model_mappings (
      id TEXT PRIMARY KEY,
      source_model TEXT NOT NULL UNIQUE,
      target_model TEXT NOT NULL,
      provider_id TEXT,
      FOREIGN KEY(provider_id) REFERENCES providers(id) ON DELETE SET NULL
    );
  `);
}

export interface ModelMapping {
  id: string;
  sourceModel: string;
  targetModel: string;
  providerId?: string;
}

function mapModelMapping(row: any): ModelMapping {
  return {
    id: row.id,
    sourceModel: row.source_model,
    targetModel: row.target_model,
    providerId: row.provider_id || undefined,
  };
}

export function listModelMappings(): ModelMapping[] {
  const rows = db
    .prepare("SELECT * FROM model_mappings ORDER BY source_model ASC")
    .all();
  return rows.map(mapModelMapping);
}

export function createOrUpdateModelMapping(
  sourceModel: string,
  targetModel: string,
  providerId?: string,
  existingId?: string,
): ModelMapping | undefined {
  if (!sourceModel.trim() || !targetModel.trim()) {
    throw new Error("source_model and target_model are required");
  }

  const trimmedSource = sourceModel.trim();
  const trimmedTarget = targetModel.trim();

  // Check whether an existing row is being renamed (different source_model)
  if (existingId) {
    const existing = db.prepare("SELECT * FROM model_mappings WHERE id = ?").get(existingId) as { id: string; source_model: string } | undefined;

    let usedId: string;

    if (existing && existing.source_model !== trimmedSource) {
      // Rename: remove the old row, then insert with its original id preserved
      usedId = existing.id!;
      db.prepare("DELETE FROM model_mappings WHERE id = ?").run(existingId);
    } else if (!existing) {
      // Id refers to a non-existent row — treat as new mapping
      usedId = randomUUID();
    } else {
      // Update in place (same source_model or same new source_model)
      usedId = existingId;
    }

    db.prepare(
      `INSERT INTO model_mappings (id, source_model, target_model, provider_id) VALUES (?, ?, ?, ?)`,
    ).run(usedId, trimmedSource, trimmedTarget, providerId || null);

    const row = db
      .prepare("SELECT * FROM model_mappings WHERE id = ?")
      .get(usedId);

    return row ? mapModelMapping(row) : undefined;
  }

  // Create path: INSERT OR REPLACE so existing source_model is overwritten
  const id = randomUUID();

  db.prepare(
    `INSERT INTO model_mappings (id, source_model, target_model, provider_id) VALUES (?, ?, ?, ?)`,
  ).run(id, trimmedSource, trimmedTarget, providerId || null);

  const row = db
    .prepare("SELECT * FROM model_mappings WHERE id = ?")
    .get(id);

  return row ? mapModelMapping(row) : undefined;
}

export function deleteModelMapping(id: string): boolean {
  const result = db.prepare("DELETE FROM model_mappings WHERE id = ?").run(id);
  return result.changes > 0;
}

let cachedMappings: Map<
  string,
  { target: string; providerId?: string }
> | null = null;

function getMappingCache(): Map<
  string,
  { target: string; providerId?: string }
> {
  if (!cachedMappings) {
    cachedMappings = new Map();
    const mappings = listModelMappings();
    for (const m of mappings) {
      cachedMappings.set(m.sourceModel.toLowerCase(), {
        target: m.targetModel,
        providerId: m.providerId,
      });
    }
  }
  return cachedMappings;
}

export function resolveModelMapping(
  model: string,
): { target: string; providerId?: string } | undefined {
  const cache = getMappingCache();
  const lower = model.toLowerCase().trim();
  if (cache.has(lower)) {
    const entry = cache.get(lower)!;
    console.log(
      `[ai-proxy] Model remap: "${model}" -> "${entry.target}"${entry.providerId ? ` (provider: ${entry.providerId})` : ""}`,
    );
    return entry;
  }
  return undefined;
}

export function invalidateModelMappingCache(): void {
  cachedMappings = null;
}

// ── Provider Models Migration & Periodic Refresh ────────────────────────

if (!tableExists("provider_models")) {
  db.exec(`
    CREATE TABLE provider_models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL UNIQUE,
      model_ids_json TEXT NOT NULL DEFAULT '[]',
      last_updated TEXT NOT NULL
    );
  `);
}

const MODEL_REFRESH_INTERVAL_MS = (() => {
  const raw = process.env.MODEL_LIST_REFRESH_INTERVAL_MS;
  if (!raw) return 7 * 24 * 60 * 60 * 1000; // default: 1 week
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 60 * 60 * 1000;
})();

let refreshTimer: ReturnType<typeof setInterval> | null = null;

export function startModelRefreshTimer(): void {
  if (refreshTimer) clearInterval(refreshTimer);

  console.log(
    `[ai-proxy] Model list auto-refresh interval set to ${MODEL_REFRESH_INTERVAL_MS}ms (${Math.round(MODEL_REFRESH_INTERVAL_MS / 60000)} min)`,
  );

  refreshTimer = setInterval(async () => {
    try {
      await fetchAndSaveAllProviderModels();
    } catch (error: any) {
      console.error(
        "[ai-proxy] Error during periodic model refresh:",
        error?.message || "Unknown error",
      );
    }
  }, MODEL_REFRESH_INTERVAL_MS);

  // Do an initial refresh after startup
  setTimeout(async () => {
    try {
      await fetchAndSaveAllProviderModels();
    } catch (error: any) {
      console.error(
        "[ai-proxy] Error during initial model refresh:",
        error?.message || "Unknown error",
      );
    }
  }, 5000);
}

export function stopModelRefreshTimer(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

export async function fetchAndSaveProviderModels(
  provider: any,
): Promise<{ ok: boolean; modelIds: string[] }> {
  const { forwardModelList } = await import("$lib/server/proxy");
  try {
    const upstream = await forwardModelList(provider);
    const text = await upstream.text();

    if (!upstream.ok) {
      console.log(
        `[ai-proxy] Model refresh failed for "${provider.name}": HTTP ${upstream.status}`,
      );
      return { ok: false, modelIds: [] };
    }

    const payload = JSON.parse(text);
    const models = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : [];
    const modelIds = models
      .filter((m: any) => typeof m?.id === "string" && m.id.length > 0)
      .map((m: any) => m.id);

    saveProviderModelIds(provider.id, modelIds);
    console.log(
      `[ai-proxy] Saved ${modelIds.length} model(s) for provider "${provider.name}" (id: ${provider.id})`,
    );
    return { ok: true, modelIds };
  } catch (error: any) {
    console.error(
      `[ai-proxy] Error fetching models for "${provider.name}":`,
      error?.message || "Unknown error",
    );
    return { ok: false, modelIds: [] };
  }
}

export async function fetchAndSaveAllProviderModels(): Promise<void> {
  const providers = listProviders();
  if (providers.length === 0) return;

  console.log(
    `[ai-proxy] Refreshing models for ${providers.length} provider(s)...`,
  );

  await Promise.all(providers.map((p) => fetchAndSaveProviderModels(p)));
}
