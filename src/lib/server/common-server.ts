import { json } from "@sveltejs/kit";
import { logRequest } from "$lib/server/db";
import type { Provider } from "$lib/server/types";

// ── Provider ordering ────────────────────────────────────────────────────

export function buildProviderOrder(allProviders: Provider[]): Provider[] {
  const providersToTry: Provider[] = [];
  const defaultProviderIds = new Set<string>();

  for (const p of allProviders) {
    if (p.isDefault) {
      providersToTry.push(p);
      defaultProviderIds.add(p.id);
      console.log(
        `[ai-proxy] Default provider: "${p.name}" (id: ${p.id}) - will be tried first`,
      );
    }
  }

  for (const p of allProviders) {
    if (!defaultProviderIds.has(p.id)) {
      providersToTry.push(p);
    }
  }

  return providersToTry;
}

export function readProviderId(request: Request): string | undefined {
  return (
    request.headers.get("x-provider-id") ||
    request.headers.get("x-ai-provider-id") ||
    new URL(request.url).searchParams.get("providerId") ||
    undefined
  );
}

// ── Numeric helpers ──────────────────────────────────────────────────────

export function readNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

// ── Usage metrics extractors ─────────────────────────────────────────────

export type UsageMetrics = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
};

export function extractOpenAIUsageMetrics(payload: any): UsageMetrics {
  const usage = payload?.usage || {};

  const promptTokens =
    readNumericValue(usage?.prompt_tokens) ??
    readNumericValue(usage?.input_tokens) ??
    readNumericValue(usage?.promptTokens) ??
    readNumericValue(usage?.inputTokens);

  const completionTokens =
    readNumericValue(usage?.completion_tokens) ??
    readNumericValue(usage?.output_tokens) ??
    readNumericValue(usage?.completionTokens) ??
    readNumericValue(usage?.outputTokens);

  const totalTokens =
    readNumericValue(usage?.total_tokens) ??
    readNumericValue(usage?.totalTokens) ??
    (() => {
      const combined = (promptTokens ?? 0) + (completionTokens ?? 0);
      return combined > 0 ? combined : undefined;
    })();

  const cost =
    readNumericValue(usage?.cost) ??
    readNumericValue(usage?.total_cost) ??
    readNumericValue(payload?.cost) ??
    readNumericValue(payload?.total_cost);

  return { promptTokens, completionTokens, totalTokens, cost };
}

// ── Response handling ────────────────────────────────────────────────────

export function returnResponse(
  upstream: Response,
  model: string,
  providerId: string,
  streamRequested: boolean,
  virtualKeyId: string,
  startedAt: number,
  extractUsageFn: (payload: any) => UsageMetrics,
): Promise<Response> {
  const statusCode = upstream.status;
  const upstreamContentType = upstream.headers.get("content-type") || "";
  const isEventStream = upstreamContentType
    .toLowerCase()
    .includes("text/event-stream");

  if (streamRequested && isEventStream) {
    logRequest({
      providerId,
      model,
      statusCode,
      durationMs: Date.now() - startedAt,
      virtualKeyId,
    });

    return Promise.resolve(
      new Response(upstream.body, {
        status: statusCode,
        headers: {
          "content-type": upstreamContentType,
          "cache-control":
            upstream.headers.get("cache-control") || "no-cache",
          connection: upstream.headers.get("connection") || "keep-alive",
        },
      }),
    );
  }

  return upstream.text().then(async (textContent) => {
    let metrics: UsageMetrics = {};
    try {
      const payload = JSON.parse(textContent);
      metrics = extractUsageFn(payload);
    } catch {
      // ignore parse errors
    }

    logRequest({
      providerId,
      model,
      statusCode,
      durationMs: Date.now() - startedAt,
      virtualKeyId,
      ...metrics,
    });

    return new Response(textContent, {
      status: statusCode,
      headers: {
        "content-type":
          upstream.headers.get("content-type") || "application/json",
      },
    });
  });
}

// ── Error responses ──────────────────────────────────────────────────────

export function authErrorResponse(reason: "missing" | "invalid"): Response {
  if (reason === "missing") {
    return json(
      { error: "Missing virtual key in Authorization header" },
      { status: 401 },
    );
  }
  return json({ error: "Invalid virtual key" }, { status: 401 });
}

export function noProviderResponse(): Response {
  return json(
    { error: "No provider configured. Add a provider in the UI first." },
    { status: 400 },
  );
}

export function providerNotFoundResponse(): Response {
  return json({ error: "Provider not found" }, { status: 404 });
}
