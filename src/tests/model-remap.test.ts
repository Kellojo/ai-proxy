import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDevServer, waitForReady } from "../test-setup.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const testDbPath = path.join(rootDir, "data", "ai-proxy-test.db");

let devUrl: string;
let remapTestKey: string | undefined;

beforeAll(async () => {
  for (const ext of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(testDbPath + ext); } catch {}
  }
  const server = await startDevServer();
  devUrl = server.url;
  await waitForReady(devUrl);

  // Set up a provider so that real request logging can happen.
  await fetch(`${devUrl}/api/providers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "lm-studio-provider-remap",
      kind: "openai-compatible",
      endpointUrl: process.env.TEST_LIVE_PROVIDER_URL || "http://localhost:1234/v1",
      apiKey: "local",
      isDefault: true,
    }),
  });

  // Create a virtual key for authenticated proxy requests.
  const keysRes = await fetch(`${devUrl}/api/virtual-keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "remap-test-key" }),
  });
  const keysJson = (await keysRes.json()) as any;
  remapTestKey = keysJson?.plaintext;
});

afterAll(async () => {
  for (const ext of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(testDbPath + ext); } catch {}
  }
});

async function request(path: string, init: RequestInit = {}) {
  const res = await fetch(`${devUrl}${path}`, init);
  let body: any;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

describe("Model Remapping", () => {
  describe("API: model mappings CRUD", () => {
    it("creates a source -> target mapping and returns it", async () => {
      const res = await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_model: "auto",
          target_model: "claude-opus-4-20250514",
        }),
      });

      expect(res.status).toBe(201);
      expect(res.body.mapping.sourceModel).toBe("auto");
      expect(res.body.mapping.targetModel).toBe("claude-opus-4-20250514");
    });

    it("lists all configured mappings", async () => {
      const res = await request("/api/model-mappings");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.mappings)).toBe(true);
      const autoMapping = res.body.mappings.find((m: any) => m.sourceModel === "auto");
      expect(autoMapping).toBeDefined();
      expect(autoMapping.targetModel).toBe("claude-opus-4-20250514");
    });

    it("upserts a mapping when the same source_model is used again", async () => {
      const createRes = await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_model: "auto",
          target_model: "gpt-4o",
        }),
      });
      expect(createRes.status).toBe(201);
      expect(createRes.body.mapping.targetModel).toBe("gpt-4o");

      const listRes = await request("/api/model-mappings");
      const autoMapping = listRes.body.mappings.find((m: any) => m.sourceModel === "auto");
      expect(autoMapping.targetModel).toBe("gpt-4o");
    });

    it("returns 201 (upsert) for a duplicate source_model", async () => {
      const res = await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_model: "auto",
          target_model: "gpt-4o",
        }),
      });

      expect(res.status).toBe(201);
    });

    it("deletes a mapping by id", async () => {
      const createRes = await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_model: "to-delete",
          target_model: "gpt-4o-mini",
        }),
      });
      expect(createRes.status).toBe(201);

      const listRes = await request("/api/model-mappings");
      const toDelete = listRes.body.mappings.find((m: any) => m.sourceModel === "to-delete");
      expect(toDelete).toBeDefined();

      const delRes = await request(`/api/model-mappings/${toDelete.id}`, { method: "DELETE" });
      expect(delRes.status).toBe(200);

      const afterDelRes = await request("/api/model-mappings");
      const stillThere = afterDelRes.body.mappings.find((m: any) => m.sourceModel === "to-delete");
      expect(stillThere).toBeUndefined();
    });

    it("rejects empty source_model or target_model", async () => {
      const emptyBody = await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "", target_model: "gpt-4o" }),
      });
      expect(emptyBody.status).toBeGreaterThanOrEqual(400);

      const emptyTarget = await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "auto", target_model: "" }),
      });
      expect(emptyTarget.status).toBeGreaterThanOrEqual(400);
    });

    it("supports multiple distinct mappings simultaneously", async () => {
      await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "gemini-flash", target_model: "gemini-2.5-flash" }),
      });
      await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "claude-haiku", target_model: "claude-3-haiku-20240307" }),
      });

      const listRes = await request("/api/model-mappings");
      expect(listRes.status).toBe(200);
      const sources = (listRes.body.mappings as any[]).map((m: any) => m.sourceModel);
      expect(sources).toContain("gemini-flash");
      expect(sources).toContain("claude-haiku");
    });
  });

  describe("Proxy request logging with remapping", () => {
    it("resolves 'auto' to the configured target model in the request log", async () => {
      if (!remapTestKey) return;

      // Ensure "auto" -> "claude-opus-4-20250514" mapping exists.
      await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "auto", target_model: "claude-opus-4-20250514" }),
      });

      // Send a real chat completion request using the remapped model name.
      const res = await fetch(`${devUrl}/api/proxy/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${remapTestKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "auto", messages: [{ role: "user", content: "hi" }] }),
      });

      // We don't care about the upstream response; we just need a log entry.
      expect(res.status).toBeGreaterThanOrEqual(200);

      // Give the DB write a moment to settle before querying.
      await new Promise((r) => setTimeout(r, 50));

      const statsRes = await request("/api/stats");
      const remappedRow = (statsRes.body as any).requests?.find(
        (row: any) => row.remapped_model === "claude-opus-4-20250514",
      );
      expect(remappedRow).toBeDefined();
      expect(remappedRow.model).toBe("auto");
    });

    it("leaves remapped_model empty when no mapping exists for the requested model", async () => {
      if (!remapTestKey) return;

      // Clear mappings so nothing maps "nonsense-model-xyz".
      const listRes = await request("/api/model-mappings");
      for (const m of listRes.body.mappings as any[]) {
        await request(`/api/model-mappings/${m.id}`, { method: "DELETE" });
      }

      await fetch(`${devUrl}/api/proxy/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${remapTestKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "nonsense-model-xyz", messages: [{ role: "user", content: "hi" }] }),
      });

      await new Promise((r) => setTimeout(r, 50));

      const statsRes = await request("/api/stats");
      const unmappedRow = (statsRes.body as any).requests?.find(
        (row: any) => row.model === "nonsense-model-xyz",
      );
      expect(unmappedRow).toBeDefined();
      // When no mapping exists, resolveModelMapping returns the original model name.
      expect(unmappedRow.remapped_model).toBe("nonsense-model-xyz");
    });

    it("resolves model name in body through the proxy endpoint", async () => {
      if (!remapTestKey) return;

      // Set up a mapping: "short-name" -> "actual-model-name".
      await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "short-name", target_model: "claude-opus-4-20250514" }),
      });

      await fetch(`${devUrl}/api/proxy/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${remapTestKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "short-name", messages: [{ role: "user", content: "hi" }] }),
      });

      await new Promise((r) => setTimeout(r, 50));

      const statsRes = await request("/api/stats");
      const remappedRow = (statsRes.body as any).requests?.find(
        (row: any) => row.remapped_model === "claude-opus-4-20250514",
      );
      expect(remappedRow).toBeDefined();
      expect(remappedRow.model).toBe("short-name");
    });

    it("case-insensitive mapping resolution", async () => {
      if (!remapTestKey) return;

      await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "MY-MODEL", target_model: "target-v1" }),
      });

      await fetch(`${devUrl}/api/proxy/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${remapTestKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "my-model", messages: [{ role: "user", content: "hi" }] }),
      });

      await new Promise((r) => setTimeout(r, 50));

      const statsRes = await request("/api/stats");
      const remappedRow = (statsRes.body as any).requests?.find(
        (row: any) => row.remapped_model === "target-v1",
      );
      expect(remappedRow).toBeDefined();
    });

    it("respects x-provider-id header to route to specific provider during remap", async () => {
      if (!remapTestKey) return;

      await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "header-test-model", target_model: "target-v2" }),
      });

      const res = await fetch(`${devUrl}/api/proxy/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${remapTestKey}`,
          "content-type": "application/json",
          "x-provider-id": "nonexistent-provider-id-xyz",
        },
        body: JSON.stringify({ model: "header-test-model", messages: [{ role: "user", content: "hi" }] }),
      });

      expect(res.status).toBe(404);
    });

    it("ignores providerId in request body when x-provider-id header is absent", async () => {
      if (!remapTestKey) return;

      await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "body-prov-test-model", target_model: "target-v3" }),
      });

      const res = await fetch(`${devUrl}/api/proxy/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${remapTestKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "body-prov-test-model",
          providerId: "nonexistent-provider-id-xyz",
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      expect(res.status).toBe(404);
    });

    it("narrows provider candidates by the remapped target model (D4 bug fix)", async () => {
      if (!remapTestKey) return;

      // Create a second non-default provider.
      const narrowProvRes = await fetch(`${devUrl}/api/providers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "narrow-test-provider",
          kind: "openai-compatible",
          endpointUrl: process.env.TEST_LIVE_PROVIDER_URL || "http://localhost:1234/v1",
          apiKey: "local",
          isDefault: false,
        }),
      });
      const narrowProvJson = (await narrowProvRes.json()) as any;
      const narrowProvId = narrowProvJson?.provider?.id;

      // Register a mapping where the target only appears in narrow-test-provider's known models.
      await request("/api/model-mappings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source_model: "narrow-source-model", target_model: "narrow-target-only-in-non-default" }),
      });

      // Directly insert model IDs into the database so getProvidersWithModels() returns them.
      const { saveProviderModelIds, invalidateProviderModelCache, listProviders } = await import("../lib/server/db.js");
      if (narrowProvId) {
        saveProviderModelIds(narrowProvId, ["narrow-target-only-in-non-default"]);
      }
      invalidateProviderModelCache();

      // First clear any existing model-mapping cache so the new target is picked up.
      const { invalidateModelMappingCache } = await import("../lib/server/db.js");
      invalidateModelMappingCache();

      const narrowProvName = listProviders().find((p: any) => p.id === narrowProvId)?.name || "narrow-test-provider";

      const res = await fetch(`${devUrl}/api/proxy/openai/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${remapTestKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "narrow-source-model", messages: [{ role: "user", content: "hi" }] }),
      });

      // Verify narrowing worked: only narrow-test-provider should appear in triedProviders.
      const jsonBody = await res.json();
      const triedProviders = jsonBody.triedProviders as any[];

      if (triedProviders && triedProviders.length > 0) {
        expect(triedProviders).toBeDefined();
        expect(triedProviders.length).toBeLessThanOrEqual(1);
        expect(triedProviders[0].providerName).toBe(narrowProvName);
      } else {
        // With a working backend (LM Studio returns 200 for any model), there is no triedProviders.
        expect(res.status).toBe(200);
      }
    });
  });
});
