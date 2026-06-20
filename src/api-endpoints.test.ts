import { describe, it, beforeAll, afterEach, expect, vi } from "vitest";
import {
  createProvider,
  createVirtualKey,
  listProviders,
} from "$lib/server/db";
import { POST as openaiPost } from "./routes/api/proxy/openai/v1/chat/completions/+server";
import { POST as anthropicPost } from "./routes/api/proxy/anthropic/v1/messages/+server";

const OPENAI_TEST_MODEL = "gpt-4o-mini";
const ANTHROPIC_TEST_MODEL = "claude-sonnet-4-20250514";

function mockFetchOpenAI(model: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
    const urlString = typeof url === "string" ? url : url?.url;

    if (urlString?.includes("/v1/models")) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: OPENAI_TEST_MODEL, object: "model" },
            { id: "gpt-4o", object: "model" },
          ],
        }),
      } as any;
    }

    if (urlString?.includes("/v1/chat/completions")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "chatcmpl_test123",
          object: "chat.completion",
          created: Date.now(),
          model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Hello from OpenAI!" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
          },
        }),
      } as any;
    }

    throw new Error(`Unexpected fetch to: ${urlString}`);
  });
}

function mockFetchAnthropic(model: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
    const urlString = typeof url === "string" ? url : url?.url;

    if (urlString?.includes("/v1/models")) {
      return {
        ok: true,
        json: async () => ({
          data: [
            { id: ANTHROPIC_TEST_MODEL, object: "model" },
            { id: "claude-opus-4-20250514", object: "model" },
          ],
        }),
      } as any;
    }

    if (urlString?.includes("/v1/messages")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "msg_test456",
          type: "message",
          role: "assistant",
          model,
          content: [{ type: "text", text: "Hello from Anthropic!" }],
          stop_reason: "end_turn",
          usage: {
            input_tokens: 15,
            output_tokens: 25,
          },
        }),
      } as any;
    }

    throw new Error(`Unexpected fetch to: ${urlString}`);
  });
}

function buildRequest(
  body: any,
  authKey: string,
  url: string,
  extraHeaders?: Record<string, string>,
): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${authKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

describe("OpenAI chat completions endpoint", () => {
  let providerId: string;
  let virtualKeyPlaintext: string;

  beforeAll(async () => {
    const provider = createProvider({
      name: "Test OpenAI",
      kind: "openai",
      endpointUrl: "https://api.openai.com",
      apiKey: "sk-test-openai-key",
      isDefault: true,
    });
    providerId = provider.id;

    const vk = createVirtualKey("test-key");
    virtualKeyPlaintext = vk.plaintext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when no auth header is provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as any);

    const req = new Request("http://localhost/api/proxy/openai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: OPENAI_TEST_MODEL, messages: [] }),
    });

    const handler = openaiPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("virtual key");
  });

  it("returns 401 for invalid virtual key", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as any);

    const req = buildRequest(
      { model: OPENAI_TEST_MODEL, messages: [] },
      "invalid-key",
      "http://localhost/api/proxy/openai/v1/chat/completions",
    );

    const handler = openaiPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown provider", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as any);

    const req = buildRequest(
      { model: OPENAI_TEST_MODEL, messages: [] },
      virtualKeyPlaintext,
      "http://localhost/api/proxy/openai/v1/chat/completions",
      { "x-provider-id": "nonexistent-provider-id" },
    );

    const handler = openaiPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Provider not found");
  });

  it("forwards request to OpenAI and returns completion", async () => {
    const fetchMock = mockFetchOpenAI(OPENAI_TEST_MODEL);

    const req = buildRequest(
      {
        model: OPENAI_TEST_MODEL,
        messages: [{ role: "user", content: "Hello" }],
      },
      virtualKeyPlaintext,
      "http://localhost/api/proxy/openai/v1/chat/completions",
      { "x-provider-id": providerId },
    );

    const handler = openaiPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("chatcmpl_test123");
    expect(body.choices[0].message.content).toBe("Hello from OpenAI!");
    expect(body.usage?.total_tokens).toBe(30);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("auto-selects provider when no providerId given", async () => {
    const fetchMock = mockFetchOpenAI(OPENAI_TEST_MODEL);

    const req = buildRequest(
      {
        model: OPENAI_TEST_MODEL,
        messages: [{ role: "user", content: "Hello" }],
      },
      virtualKeyPlaintext,
      "http://localhost/api/proxy/openai/v1/chat/completions",
    );

    const handler = openaiPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.choices[0].message.content).toBe("Hello from OpenAI!");
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("Anthropic messages endpoint", () => {
  let providerId: string;
  let virtualKeyPlaintext: string;

  beforeAll(async () => {
    const provider = createProvider({
      name: "Test Anthropic",
      kind: "anthropic",
      endpointUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test-key",
      isDefault: false,
    });
    providerId = provider.id;

    const vk = createVirtualKey("test-key-2");
    virtualKeyPlaintext = vk.plaintext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when no auth header is provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as any);

    const req = new Request("http://localhost/api/proxy/anthropic/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_TEST_MODEL, messages: [] }),
    });

    const handler = anthropicPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(401);
  });

  it("returns 404 for unknown provider", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as any);

    const req = buildRequest(
      { model: ANTHROPIC_TEST_MODEL, messages: [] },
      virtualKeyPlaintext,
      "http://localhost/api/proxy/anthropic/v1/messages",
      { "x-provider-id": "nonexistent-provider-id" },
    );

    const handler = anthropicPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(404);
  });

  it("forwards request to Anthropic and returns message", async () => {
    const fetchMock = mockFetchAnthropic(ANTHROPIC_TEST_MODEL);

    const req = buildRequest(
      {
        model: ANTHROPIC_TEST_MODEL,
        messages: [{ role: "user", content: "Hello" }],
      },
      virtualKeyPlaintext,
      "http://localhost/api/proxy/anthropic/v1/messages",
      { "x-provider-id": providerId },
    );

    const handler = anthropicPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("msg_test456");
    expect(body.content[0].text).toBe("Hello from Anthropic!");
    expect(body.usage?.output_tokens).toBe(25);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("auto-selects Anthropic provider when model matches", async () => {
    const fetchMock = mockFetchAnthropic(ANTHROPIC_TEST_MODEL);

    const req = buildRequest(
      {
        model: ANTHROPIC_TEST_MODEL,
        messages: [{ role: "user", content: "Hello" }],
      },
      virtualKeyPlaintext,
      "http://localhost/api/proxy/anthropic/v1/messages",
    );

    const handler = anthropicPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content[0].text).toBe("Hello from Anthropic!");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("accepts providerId in request body", async () => {
    const fetchMock = mockFetchAnthropic(ANTHROPIC_TEST_MODEL);

    const req = buildRequest(
      {
        model: ANTHROPIC_TEST_MODEL,
        providerId: providerId,
        messages: [{ role: "user", content: "Hello" }],
      },
      virtualKeyPlaintext,
      "http://localhost/api/proxy/anthropic/v1/messages",
    );

    const handler = anthropicPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.content[0].text).toBe("Hello from Anthropic!");
  });
});

describe("Cross-endpoint protocol translation", () => {
  let openaiProviderId: string;
  let anthropicProviderId: string;
  let virtualKeyPlaintext: string;

  beforeAll(async () => {
    const openaiProvider = createProvider({
      name: "Cross-test OpenAI",
      kind: "openai",
      endpointUrl: "https://api.openai.com",
      apiKey: "sk-test-cross-openai",
      isDefault: false,
    });
    openaiProviderId = openaiProvider.id;

    const anthropicProvider = createProvider({
      name: "Cross-test Anthropic",
      kind: "anthropic",
      endpointUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test-cross",
      isDefault: false,
    });
    anthropicProviderId = anthropicProvider.id;

    const vk = createVirtualKey("cross-test-key");
    virtualKeyPlaintext = vk.plaintext;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("OpenAI endpoint translates request to Anthropic format when provider is Anthropic", async () => {
    let capturedBody: any = null;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) => {
      const urlString = typeof url === "string" ? url : url?.url;

      if (urlString?.includes("/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: ANTHROPIC_TEST_MODEL, object: "model" }],
          }),
        } as any;
      }

      if (urlString?.includes("/v1/messages")) {
        capturedBody = JSON.parse(init?.body || "{}");
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            id: "msg_cross1",
            type: "message",
            role: "assistant",
            model: ANTHROPIC_TEST_MODEL,
            content: [{ type: "text", text: "Translated response" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 5, output_tokens: 10 },
          }),
        } as any;
      }

      throw new Error(`Unexpected: ${urlString}`);
    });

    const req = buildRequest(
      {
        model: ANTHROPIC_TEST_MODEL,
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hi" },
        ],
      },
      virtualKeyPlaintext,
      "http://localhost/api/proxy/openai/v1/chat/completions",
      { "x-provider-id": anthropicProviderId },
    );

    const handler = openaiPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.object).toBe("chat.completion");
    expect(body.choices[0].message.content).toBe("Translated response");

    expect(capturedBody.system).toBe("You are helpful");
    expect(capturedBody.messages[0].role).toBe("user");
    expect(capturedBody.messages[0].content).toBe("Hi");
  });

  it("Anthropic endpoint translates request to OpenAI format when provider is OpenAI", async () => {
    let capturedBody: any = null;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) => {
      const urlString = typeof url === "string" ? url : url?.url;

      if (urlString?.includes("/v1/models")) {
        return {
          ok: true,
          json: async () => ({
            data: [{ id: OPENAI_TEST_MODEL, object: "model" }],
          }),
        } as any;
      }

      if (urlString?.includes("/v1/chat/completions")) {
        capturedBody = JSON.parse(init?.body || "{}");
        return {
          ok: true,
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            id: "chatcmpl_cross2",
            object: "chat.completion",
            created: Date.now(),
            model: OPENAI_TEST_MODEL,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "OpenAI translated" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
          }),
        } as any;
      }

      throw new Error(`Unexpected: ${urlString}`);
    });

    const req = buildRequest(
      {
        model: OPENAI_TEST_MODEL,
        system: "Be concise",
        messages: [{ role: "user", content: "Explain AI" }],
      },
      virtualKeyPlaintext,
      "http://localhost/api/proxy/anthropic/v1/messages",
      { "x-provider-id": openaiProviderId },
    );

    const handler = anthropicPost as RequestHandler;
    const res = await handler({ request: req, url: new URL(req.url) } as any);

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.type).toBe("message");
    expect(body.content[0].type).toBe("text");
    expect(body.content[0].text).toBe("OpenAI translated");
    expect(body.stop_reason).toBe("stop");

    expect(capturedBody.messages[0].role).toBe("system");
    expect(capturedBody.messages[0].content).toBe("Be concise");
  });
});
