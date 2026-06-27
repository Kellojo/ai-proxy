import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDevServer, waitForReady } from "../test-setup.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const testDbPath = path.join(rootDir, "data", "ai-proxy-test.db");

let devUrl: string;

beforeAll(async () => {
  for (const ext of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(testDbPath + ext); } catch {}
  }
  const server = await startDevServer();
  devUrl = server.url;
  await waitForReady(devUrl);
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

describe("AI Proxy Integration Tests", () => {
  describe("Provider & Virtual Key Setup", () => {
    it("creates a provider pointing to LM Studio", async () => {
      const res = await request("/api/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "lm-studio-provider",
          kind: "openai-compatible",
          endpointUrl: process.env.TEST_LIVE_PROVIDER_URL || "http://localhost:1234",
          apiKey: "local",
          isDefault: true,
        }),
      });

      expect(res.status).toBe(201);
      expect(res.body.provider.name).toBe("lm-studio-provider");
      expect(res.body.provider.kind).toBe("openai-compatible");
    });

    it("creates a virtual key and returns its plaintext", async () => {
      const res = await request("/api/virtual-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "test-key" }),
      });

      expect(res.status).toBe(201);
      expect(res.body.plaintext).toMatch(/^vk_/);
    });
  });

  describe("GET /api/proxy/openai/v1/models", () => {
    it("returns 401 when no virtual key is provided", async () => {
      const res = await request("/api/proxy/openai/v1/models");
      expect(res.status).toBe(401);
      expect(res.body.error).toContain("virtual key");
    });

    it("returns models when a valid virtual key is provided", async () => {
      const createRes = await request("/api/virtual-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "model-test-key" }),
      });

      const bearer = `Bearer ${createRes.body.plaintext}`;

      const res = await request("/api/proxy/openai/v1/models", {
        headers: { authorization: bearer },
      });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it("returns 401 for an invalid virtual key", async () => {
      const res = await request("/api/proxy/openai/v1/models", {
        headers: { authorization: "Bearer vk_invalid-key-abc123" },
      });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/proxy/openai/v1/chat/completions", () => {
    it("returns 401 when no virtual key is provided", async () => {
      const res = await request("/api/proxy/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.TEST_MODEL || "local-model", messages: [{ role: "user", content: "hello" }] }),
      });

      expect(res.status).toBe(401);
    });

    it("returns a successful completion when a valid virtual key is provided", async () => {
      const createRes = await request("/api/virtual-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "completion-test-key" }),
      });

      const bearer = `Bearer ${createRes.body.plaintext}`;

      const model = process.env.TEST_MODEL || "local-model";

      const res = await request("/api/proxy/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: bearer },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Say hello" }],
        }),
      });

      expect(res.status).toBe(200);
      expect(res.body.object).toBeDefined();
      expect(res.body.choices).toBeDefined();
      expect(Array.isArray(res.body.choices)).toBe(true);
      expect(res.body.choices.length).toBeGreaterThan(0);
    });

    it("returns 401 for completions with an invalid virtual key", async () => {
      const res = await request("/api/proxy/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: process.env.TEST_MODEL || "local-model", messages: [{ role: "user", content: "hello" }] }),
        authorization: "Bearer vk_invalid-key-xyz789",
      });

      expect(res.status).toBe(401);
    });
  });
});
