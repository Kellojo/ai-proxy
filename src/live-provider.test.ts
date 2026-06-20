import { describe, it, expect } from "vitest";
import {
  forwardModelList,
  forwardChatCompletion,
  forwardAnthropicMessages,
} from "$lib/server/proxy";
import type { Provider } from "$lib/server/types";

const providerKind = process.env.TEST_LIVE_PROVIDER_KIND as "openai" | "anthropic" | undefined;
const providerUrl = process.env.TEST_LIVE_PROVIDER_URL;
const providerApiKey = process.env.TEST_LIVE_PROVIDER_API_KEY;

const skipReason =
  !providerKind || !providerUrl || !providerApiKey
    ? "Set TEST_LIVE_PROVIDER_KIND, TEST_LIVE_PROVIDER_URL, and TEST_LIVE_PROVIDER_API_KEY env vars to run live tests"
    : undefined;

function makeProvider(): Provider {
  return {
    id: "live-test-provider",
    name: "Live Test",
    kind: providerKind as any,
    endpointUrl: providerUrl,
    apiKey: providerApiKey,
    isDefault: false,
    wolEnabled: false,
    createdAt: new Date().toISOString(),
  };
}

describe.skipIf(skipReason !== undefined)(
  "Live provider integration",
  () => {
    describe("Models endpoint", () => {
      it("fetches model list from provider", async () => {
        const provider = makeProvider();
        const res = await forwardModelList(provider);

        expect(res.ok).toBe(true);
        const body = await res.json();
        expect(Array.isArray(body?.data)).toBe(true);
        expect(body.data.length).toBeGreaterThan(0);
        expect(typeof body.data[0].id).toBe("string");
      }, 30_000);
    });

    describe("Inference via OpenAI endpoint", () => {
      it("completes a chat request and returns valid OpenAI response", async () => {
        const provider = makeProvider();
        const modelRes = await forwardModelList(provider);
        const modelBody = await modelRes.json();
        const modelId = modelBody.data[0].id;

        const res = await forwardChatCompletion(provider, {
          model: modelId,
          messages: [
            { role: "user", content: "Say only: OK" },
          ],
          max_tokens: 32,
        });

        expect(res.ok).toBe(true);
        const text = await res.text();
        const body = JSON.parse(text);

        expect(body.object).toBe("chat.completion");
        expect(body.choices[0].message.role).toBe("assistant");
        expect(typeof body.choices[0].message.content).toBe("string");
        expect(body.usage).toBeDefined();
      }, 60_000);
    });

    describe("Inference via Anthropic endpoint", () => {
      it("completes a messages request and returns valid Anthropic response", async () => {
        const provider = makeProvider();
        const modelRes = await forwardModelList(provider);
        const modelBody = await modelRes.json();
        const modelId = modelBody.data[0].id;

        const res = await forwardAnthropicMessages(provider, {
          model: modelId,
          messages: [
            { role: "user", content: "Say only: OK" },
          ],
          max_tokens: 32,
        });

        expect(res.ok).toBe(true);
        const text = await res.text();
        const body = JSON.parse(text);

        expect(body.type).toBe("message");
        expect(body.role).toBe("assistant");
        expect(Array.isArray(body.content)).toBe(true);
        expect(body.content[0].type).toBe("text");
        expect(typeof body.content[0].text).toBe("string");
        expect(body.usage).toBeDefined();
      }, 60_000);
    });
  },
);
