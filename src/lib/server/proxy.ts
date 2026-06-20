import type { Provider } from "./types";

function trimSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function buildUrl(base: string, path: string): string {
  return `${trimSlash(base)}${path.startsWith("/") ? path : `/${path}`}`;
}

function extractTextFromMessages(messages: any[] = []): string {
  return messages
    .map((m) => {
      if (typeof m?.content === "string") return `${m.role}: ${m.content}`;
      if (Array.isArray(m?.content)) {
        const text = m.content
          .filter((c: any) => c?.type === "text" && typeof c?.text === "string")
          .map((c: any) => c.text)
          .join(" ");
        return `${m.role}: ${text}`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function anthropicToOpenAI(response: any, model: string) {
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

function openAIToAnthropic(body: any) {
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  const systemMessage = messages.find((m: any) => m?.role === "system");
  const filteredMessages = messages
    .filter((m: any) => m?.role !== "system")
    .map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content:
        typeof m.content === "string"
          ? m.content
          : extractTextFromMessages([m]),
    }));

  return {
    model: body.model,
    max_tokens: body.max_tokens || 1024,
    temperature: body.temperature,
    system: systemMessage?.content,
    messages: filteredMessages,
  };
}

export async function forwardChatCompletion(
  provider: Provider,
  body: any,
): Promise<Response> {
  if (provider.kind === "anthropic") {
    const targetUrl = buildUrl(provider.endpointUrl, "/v1/messages");
    const anthropicBody = openAIToAnthropic(body);

    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(anthropicBody),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return new Response(JSON.stringify(payload), {
        status: response.status,
        headers: { "content-type": "application/json" },
      });
    }

    const mapped = anthropicToOpenAI(payload, body?.model || "unknown-model");
    return new Response(JSON.stringify(mapped), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const targetUrl = buildUrl(provider.endpointUrl, "/v1/chat/completions");
  return fetch(targetUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

function anthropicBodyToOpenAI(body: any): any {
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const system = body?.system;
  const openaiMessages = [];

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

function openAIToAnthropicResponse(payload: any, model: string) {
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

export async function forwardAnthropicMessages(
  provider: Provider,
  body: any,
): Promise<Response> {
  if (provider.kind === "anthropic") {
    const targetUrl = buildUrl(provider.endpointUrl, "/v1/messages");
    return fetch(targetUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": provider.apiKey,
        "anthropic-version": body?.anthropic_version || "2023-06-01",
      },
      body: JSON.stringify(body),
    });
  }

  // For non-Anthropic providers, convert Anthropic format to OpenAI format
  const targetUrl = buildUrl(provider.endpointUrl, "/v1/chat/completions");
  const openAIBody = anthropicBodyToOpenAI(body);

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify(openAIBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(errorText, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const payload = await response.json().catch(() => ({}));
  const mapped = openAIToAnthropicResponse(payload, body?.model || "unknown-model");
  return new Response(JSON.stringify(mapped), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

export async function forwardModelList(provider: Provider): Promise<Response> {
  const path = provider.kind === "anthropic" ? "/v1/models" : "/v1/models";
  const targetUrl = buildUrl(provider.endpointUrl, path);

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (provider.kind === "anthropic") {
    headers["x-api-key"] = provider.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    headers.authorization = `Bearer ${provider.apiKey}`;
  }

  return fetch(targetUrl, {
    method: "GET",
    headers,
  });
}
