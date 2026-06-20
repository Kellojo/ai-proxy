import type { Provider } from "./types";

const DEFAULT_FETCH_TIMEOUT_MS = 300_000;

// ── URL helpers ──────────────────────────────────────────────────────────

function trimSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildUrl(base: string, path: string): string {
  if (!base) throw new Error(`Missing endpointUrl for provider`);
  return `${trimSlash(base)}${path.startsWith("/") ? path : `/${path}`}`;
}

// ── Fetch with timeout ──────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Message content helpers ──────────────────────────────────────────────

function extractTextFromContentArray(content: unknown[]): string {
  return content
    .filter((c: any) => c?.type === "text" && typeof c?.text === "string")
    .map((c: any) => c.text)
    .join(" ");
}

function messageContentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return extractTextFromContentArray(content);
  return "";
}

// ── OpenAI <-> Anthropic request conversion ──────────────────────────────

function openaiRequestToAnthropic(body: any): any {
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  const systemMessage = messages.find((m: any) => m?.role === "system");
  const conversationMessages = messages
    .filter((m: any) => m?.role !== "system")
    .map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: messageContentToString(m.content),
    }));

  return {
    model: body.model,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    system: systemMessage?.content,
    messages: conversationMessages,
  };
}

function anthropicRequestToOpenAI(body: any): any {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = body?.system;
  const openaiMessages: any[] = [];

  if (system) {
    openaiMessages.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    if (msg?.role === "user") {
      openaiMessages.push({ role: "user", content: msg.content });
    } else if (msg?.role === "assistant") {
      openaiMessages.push({ role: "assistant", content: msg.content });
    }
  }

  return {
    model: body?.model,
    messages: openaiMessages,
    max_tokens: body?.max_tokens,
    temperature: body?.temperature,
    top_p: body?.top_p,
    stream: body?.stream,
  };
}

// ── OpenAI <-> Anthropic response conversion ─────────────────────────────

function anthropicResponseToOpenAI(response: any, model: string) {
  const joinedText = Array.isArray(response?.content)
    ? response.content
        .filter((item: any) => item?.type === "text")
        .map((item: any) => item?.text || "")
        .join("")
    : "";

  return {
    id: response?.id || `chatcmpl_${crypto.randomUUID()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: joinedText,
        },
        finish_reason: response?.stop_reason || "stop",
      },
    ],
    usage: {
      prompt_tokens: response?.usage?.input_tokens || 0,
      completion_tokens: response?.usage?.output_tokens || 0,
      total_tokens:
        (response?.usage?.input_tokens || 0) +
        (response?.usage?.output_tokens || 0),
    },
  };
}

function openaiResponseToAnthropic(payload: any, model: string) {
  const content = payload?.choices?.[0]?.message?.content || "";
  return {
    id: payload?.id || `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    model,
    content: [
      {
        type: "text",
        text: content,
      },
    ],
    stop_reason: payload?.choices?.[0]?.finish_reason || "stop",
    usage: {
      input_tokens: payload?.usage?.prompt_tokens || 0,
      output_tokens: payload?.usage?.completion_tokens || 0,
    },
  };
}

// ── Header builders ──────────────────────────────────────────────────────

function openAIHeaders(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

function anthropicHeaders(
  apiKey: string,
  version?: string,
): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": version || "2023-06-01",
  };
}

// ── Unified forward logic ───────────────────────────────────────────────

interface ForwardOptions {
  endpoint: string;
  headers: Record<string, string>;
  requestBody: any;
  responseBodyAdapter?: (payload: any, model: string) => any;
}

async function forwardRequest(
  provider: Provider,
  options: ForwardOptions,
): Promise<Response> {
  const targetUrl = buildUrl(provider.endpointUrl, options.endpoint);

  const response = await fetchWithTimeout(targetUrl, {
    method: "POST",
    headers: options.headers,
    body: JSON.stringify(options.requestBody),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return new Response(
      typeof payload === "string" ? payload : JSON.stringify(payload),
      {
        status: response.status,
        headers: { "content-type": "application/json" },
      },
    );
  }

  if (!options.responseBodyAdapter) {
    return new Response(JSON.stringify(payload), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const model = options.requestBody?.model || "unknown-model";
  const mapped = options.responseBodyAdapter(payload, model);
  return new Response(JSON.stringify(mapped), {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}

// ── OpenAI chat completions endpoint ─────────────────────────────────────

export async function forwardChatCompletion(
  provider: Provider,
  body: any,
): Promise<Response> {
  if (provider.kind === "anthropic") {
    const adapted = openaiRequestToAnthropic(body);
    return forwardRequest(provider, {
      endpoint: "/v1/messages",
      headers: anthropicHeaders(provider.apiKey),
      requestBody: adapted,
      responseBodyAdapter: anthropicResponseToOpenAI,
    });
  }

  return forwardRequest(provider, {
    endpoint: "/v1/chat/completions",
    headers: openAIHeaders(provider.apiKey),
    requestBody: body,
  });
}

// ── Anthropic messages endpoint ──────────────────────────────────────────

export async function forwardAnthropicMessages(
  provider: Provider,
  body: any,
): Promise<Response> {
  if (provider.kind === "anthropic") {
    return forwardRequest(provider, {
      endpoint: "/v1/messages",
      headers: anthropicHeaders(provider.apiKey, body?.anthropic_version),
      requestBody: body,
    });
  }

  const adapted = anthropicRequestToOpenAI(body);
  return forwardRequest(provider, {
    endpoint: "/v1/chat/completions",
    headers: openAIHeaders(provider.apiKey),
    requestBody: adapted,
    responseBodyAdapter: openaiResponseToAnthropic,
  });
}

// ── Model list endpoint ──────────────────────────────────────────────────

export async function forwardModelList(provider: Provider): Promise<Response> {
  const targetUrl = buildUrl(provider.endpointUrl, "/v1/models");

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (provider.kind === "anthropic") {
    headers["x-api-key"] = provider.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.authorization = `Bearer ${provider.apiKey}`;
  }

  return fetchWithTimeout(targetUrl, {
    method: "GET",
    headers,
  });
}
