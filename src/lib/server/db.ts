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
    kind TEXT NOT NULL,
    endpoint_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    wol_enabled INTEGER NOT NULL DEFAULT 0,
    wol_mac TEXT,
    wol_broadcast TEXT,
    wol_port INTEGER,
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

function mapProvider(row: any): Provider {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    endpointUrl: row.endpoint_url,
    apiKey: row.api_key,
    isDefault: !!row.is_default,
    wolEnabled: !!row.wol_enabled,
    wolMac: row.wol_mac || undefined,
    wolBroadcast: row.wol_broadcast || undefined,
    wolPort: row.wol_port || undefined,
    createdAt: row.created_at,
  };
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
    .prepare("SELECT * FROM providers ORDER BY created_at DESC")
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

export function createProvider(input: ProviderInput): Provider {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  const tx = db.transaction(() => {
    if (input.isDefault) {
      db.prepare("UPDATE providers SET is_default = 0").run();
    }

    db.prepare(
      `INSERT INTO providers
      (id, name, kind, endpoint_url, api_key, is_default, wol_enabled, wol_mac, wol_broadcast, wol_port, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name,
      input.kind,
      input.endpointUrl,
      input.apiKey,
      input.isDefault ? 1 : 0,
      input.wolEnabled ? 1 : 0,
      input.wolMac || null,
      input.wolBroadcast || null,
      input.wolPort || null,
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
      name = ?,
      kind = ?,
      endpoint_url = ?,
      api_key = ?,
      is_default = ?,
      wol_enabled = ?,
      wol_mac = ?,
      wol_broadcast = ?,
      wol_port = ?
      WHERE id = ?`,
    ).run(
      input.name,
      input.kind,
      input.endpointUrl,
      nextApiKey,
      input.isDefault ? 1 : 0,
      input.wolEnabled ? 1 : 0,
      input.wolMac || null,
      input.wolBroadcast || null,
      input.wolPort || null,
      id,
    );
  });

  tx();
  return getProvider(id);
}

export function deleteProvider(id: string): boolean {
  const result = db.prepare("DELETE FROM providers WHERE id = ?").run(id);
  return result.changes > 0;
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

  return {
    key: mapVirtualKey(row),
    plaintext,
  };
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

  return {
    key: mapVirtualKey(row),
    plaintext,
  };
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
}): void {
  db.prepare(
    `INSERT INTO request_logs (
      id,
      provider_id,
      model,
      status_code,
      duration_ms,
      virtual_key_id,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      cost,
      created_at
    )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    new Date().toISOString(),
  );
}

export function getStats() {
  const summary = db
    .prepare(
      `SELECT
            COUNT(*) AS request_count,
            COALESCE(SUM(total_tokens), 0) AS total_tokens,
            SUM(cost) AS total_cost
       FROM request_logs`,
    )
    .get();

  const providerUsage = db
    .prepare(
      `SELECT p.id, p.name, COUNT(r.id) AS request_count
     FROM providers p
     LEFT JOIN request_logs r ON p.id = r.provider_id
     GROUP BY p.id, p.name
     ORDER BY request_count DESC, p.name ASC`,
    )
    .all();

  const modelUsage = db
    .prepare(
      `SELECT model, COUNT(*) AS request_count
     FROM request_logs
     GROUP BY model
     ORDER BY request_count DESC, model ASC
     LIMIT 20`,
    )
    .all();

  const requestsTimeline = db
    .prepare(
      `SELECT (
              strftime('%Y-%m-%dT%H:%M:00Z', created_at)
            ) AS hour_bucket,
            status_code,
            COUNT(*) AS request_count
     FROM request_logs
     WHERE datetime(created_at) >= datetime('now', '-24 hours')
     GROUP BY hour_bucket, status_code
     ORDER BY hour_bucket ASC`,
    )
    .all();

  const recentRequests = db
    .prepare(
      `SELECT r.created_at, r.status_code, r.model, r.duration_ms,
      r.prompt_tokens, r.completion_tokens, r.total_tokens, r.cost,
            COALESCE(p.name, 'Unauthenticated') AS provider_name
     FROM request_logs r
     LEFT JOIN providers p ON p.id = r.provider_id
     ORDER BY r.created_at DESC
     LIMIT 50`,
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
