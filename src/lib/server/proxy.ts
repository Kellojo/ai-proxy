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

// ── Tool calling pass-through (no modification) ──────────────────────────

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

// ── OpenAI chat completions endpoint (pass-through with tool calling) ─────

export async function forwardChatCompletion(
  provider: Provider,
  body: any,
): Promise<Response> {
  return forwardRequest(provider, {
    endpoint: "chat/completions",
    headers: { "content-type": "application/json", authorization: `Bearer ${provider.apiKey}` },
    requestBody: body,
  });
}

// ── Model list endpoint ──────────────────────────────────────────────────

export async function forwardModelList(provider: Provider): Promise<Response> {
  const targetUrl = buildUrl(provider.endpointUrl, "models");

  return fetchWithTimeout(targetUrl, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
  });
}
