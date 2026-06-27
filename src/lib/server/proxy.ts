import type { Provider } from "./types";

const DEFAULT_FETCH_TIMEOUT_MS = 300_000;
const MAX_REQUEST_BODY_BYTES = 1_000_000; // 1MB

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

function openAIToolToAnthropic(tool: any): any {
  const fn = tool?.function || tool;
  return {
    name: fn?.name,
    description: fn?.description,
    input_schema: fn?.parameters || {},
  };
}

function openaiMessageToAnthropic(msg: any): any {
  const role = msg?.role;
  const content = msg?.content;
  const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
  const toolCallId = msg?.tool_call_id;

  if (toolCallId) {
    return {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolCallId, content: content ?? "" }],
    };
  }

  if (role === "assistant" && toolCalls.length > 0) {
    const textParts = typeof content === "string" && content ? [{ type: "text", text: content }] : [];
    const useParts = toolCalls.map((tc: any) => {
      let args = tc?.function?.arguments;
      if (typeof args === "string") {
        try { args = JSON.parse(args); } catch { /* leave as string */ }
      }
      return {
        type: "tool_use",
        id: tc?.id || `tooluse_${crypto.randomUUID()}`,
        name: tc?.function?.name,
        input: args || {},
      };
    });
    return { role: "assistant", content: [...textParts, ...useParts] };
  }

  return {
    role: role === "assistant" ? "assistant" : "user",
    content: messageContentToString(content),
  };
}

function openaiRequestToAnthropic(body: any): any {
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  const systemMessage = messages.find((m: any) => m?.role === "system");
  const conversationMessages = messages
    .filter((m: any) => m?.role !== "system")
    .map(openaiMessageToAnthropic);

  const converted: any = {
    model: body.model,
    max_tokens: body.max_tokens,
    temperature: body.temperature,
    top_p: body.top_p,
    stream: body.stream,
    system: systemMessage?.content,
    messages: conversationMessages,
  };

  if (Array.isArray(body?.tools) && body.tools.length > 0) {
    converted.tools = body.tools.map(openAIToolToAnthropic);
  }

  return converted;
}

function anthropicToolToOpenAI(tool: any): any {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

function anthropicContentToOpenAI(content: unknown): { contentStr: string | null; toolCalls: any[] } {
  if (typeof content === "string") return { contentStr: content, toolCalls: [] };
  if (!Array.isArray(content)) return { contentStr: null, toolCalls: [] };

  const textParts = content.filter((c: any) => c?.type === "text" && typeof c?.text === "string");
  const toolUseParts = content.filter((c: any) => c?.type === "tool_use");
  const toolCalls = toolUseParts.map((t: any) => ({
    id: t.id,
    type: "function",
    function: {
      name: t.name,
      arguments: typeof t.input === "string" ? t.input : JSON.stringify(t.input || {}),
    },
  }));

  return {
    contentStr: textParts.length ? textParts.map((t: any) => t.text).join(" ") : null,
    toolCalls,
  };
}

function anthropicMessageToOpenAI(msg: any): any[] {
  const results: any[] = [];

  if (msg?.role === "user") {
    const content = msg.content;
    if (Array.isArray(content)) {
      const toolResults = content.filter((c: any) => c?.type === "tool_result");
      const nonTool = content.filter((c: any) => c?.type !== "tool_result");

      if (nonTool.length > 0) {
        const text = nonTool
          .filter((c: any) => c?.type === "text")
          .map((c: any) => c?.text || "")
          .join(" ");
        if (text) results.push({ role: "user", content: text });
      }

      for (const tr of toolResults) {
        results.push({
          role: "user",
          content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content || ""),
          tool_call_id: tr.tool_use_id,
        });
      }

      if (results.length === 0) results.push({ role: "user", content: "" });
    } else {
      results.push({ role: "user", content: content ?? "" });
    }
  } else if (msg?.role === "assistant") {
    const { contentStr, toolCalls } = anthropicContentToOpenAI(msg.content);
    const entry: any = { role: "assistant" as const };
    if (contentStr) entry.content = contentStr;
    if (toolCalls.length) entry.tool_calls = toolCalls;
    results.push(entry);
  }

  return results;
}

function anthropicRequestToOpenAI(body: any): any {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = body?.system;
  const openaiMessages: any[] = [];

  if (system) {
    openaiMessages.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    openaiMessages.push(...anthropicMessageToOpenAI(msg));
  }

  const converted: any = {
    model: body?.model,
    messages: openaiMessages,
    max_tokens: body?.max_tokens,
    temperature: body?.temperature,
    top_p: body?.top_p,
    stream: body?.stream,
  };

  if (Array.isArray(body?.tools) && body.tools.length > 0) {
    converted.tools = body.tools.map(anthropicToolToOpenAI);
  }

  return converted;
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
  const choice = payload?.choices?.[0];
  const message = choice?.message || {};
  const content = message?.content || "";
  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];

  const contentBlocks: any[] = [];

  if (content) {
    contentBlocks.push({ type: "text", text: content });
  } else if (toolCalls.length === 0) {
    contentBlocks.push({ type: "text", text: "" });
  }

  for (const tc of toolCalls) {
    let parsedInput = tc?.function?.arguments;
    if (typeof parsedInput === "string") {
      try { parsedInput = JSON.parse(parsedInput); } catch { /* leave as string */ }
    }
    contentBlocks.push({
      type: "tool_use",
      id: tc?.id || `tooluse_${crypto.randomUUID()}`,
      name: tc?.function?.name,
      input: parsedInput || {},
    });
  }

  return {
    id: payload?.id || `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    model,
    content: contentBlocks,
    stop_reason: payload?.choices?.[0]?.finish_reason || "stop",
    usage: {
      input_tokens: payload?.usage?.prompt_tokens || 0,
      output_tokens: payload?.usage?.completion_tokens || 0,
    },
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

  const bodyStr = JSON.stringify(options.requestBody);
  if (bodyStr.length > MAX_REQUEST_BODY_BYTES) {
    return new Response(JSON.stringify({ error: "Request body too large" }), {
      status: 413,
      headers: { "content-type": "application/json" },
    });
  }

  const response = await fetchWithTimeout(targetUrl, {
    method: "POST",
    headers: options.headers,
    body: bodyStr,
  });

  const upstreamContentType = response.headers.get("content-type") || "";
  const isEventStream = upstreamContentType.toLowerCase().includes("text/event-stream");

  // Pass SSE streams through directly — they are not valid JSON and must not be parsed
  if (isEventStream) {
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": upstreamContentType,
        "cache-control": response.headers.get("cache-control") || "no-cache",
        connection: response.headers.get("connection") || "keep-alive",
      },
    });
  }

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
      headers: { "content-type": "application/json", "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01" },
      requestBody: adapted,
      responseBodyAdapter: anthropicResponseToOpenAI,
    });
  }

  return forwardRequest(provider, {
    endpoint: "/v1/chat/completions",
    headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` },
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
      headers: { "content-type": "application/json", "x-api-key": provider.apiKey, "anthropic-version": body?.anthropic_version || "2023-06-01" },
      requestBody: body,
    });
  }

  const adapted = anthropicRequestToOpenAI(body);
  return forwardRequest(provider, {
    endpoint: "/v1/chat/completions",
    headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` },
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
