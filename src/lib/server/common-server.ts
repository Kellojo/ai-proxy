import { json } from "@sveltejs/kit";
import { extractBearer } from "$lib/server/keys";
import {
  authenticateVirtualKey,
  getDefaultProvider,
  getProvider,
  logRequest,
  resolveModelMapping,
} from "$lib/server/db";
import type { Provider, VirtualKey } from "$lib/server/types";

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

export function resolveProviderId(request: Request, body: any): string | undefined {
  return (
    request.headers.get("x-provider-id") ||
    request.headers.get("x-ai-provider-id") ||
    body?.providerId ||
    new URL(request.url).searchParams.get("providerId") ||
    undefined
  );
}

export function requireVirtualKey(
  request: Request,
  unauthModel: string,
  startedAt: number,
): { virtualKey: VirtualKey } | { response: Response } {
  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) {
    logRequest({ model: unauthModel, statusCode: 401, durationMs: Date.now() - startedAt });
    return { response: authErrorResponse("missing") };
  }
  const virtualKey = authenticateVirtualKey(bearer);
  if (!virtualKey) {
    logRequest({ model: unauthModel, statusCode: 401, durationMs: Date.now() - startedAt });
    return { response: authErrorResponse("invalid") };
  }
  return { virtualKey };
}

export function resolveModelAndProvider(body: any, request: Request) {
  const model = body?.model || "unknown-model";
  const resolvedMapping = resolveModelMapping(model);

  if (resolvedMapping && resolvedMapping.target !== model) {
    body.model = resolvedMapping.target;
  }
  const remappedModel = resolvedMapping?.target || model;

  const explicitProviderId = resolveProviderId(request, body);
  let providerName: string | undefined;
  if (explicitProviderId) {
    const p = getProvider(explicitProviderId);
    if (p) providerName = p.name;
  } else if (resolvedMapping?.providerId) {
    const mappedProvider = getProvider(resolvedMapping.providerId);
    if (mappedProvider) providerName = mappedProvider.name;
  } else {
    const defaultProvider = getDefaultProvider();
    if (defaultProvider) providerName = defaultProvider.name;
  }

  const effectiveProviderId = explicitProviderId || resolvedMapping?.providerId || undefined;

  return { model, remappedModel, explicitProviderId, providerName, effectiveProviderId };
}

export async function resolveOrderedProviders(
  allProviders: Provider[],
  remappedModel: string,
): Promise<Provider[]> {
  const { getProvidersWithModels } = await import("$lib/server/db");
  const providersWithModels = getProvidersWithModels();

  if (providersWithModels.length === 0) return buildProviderOrder(allProviders);

  const providerModelMap = new Map<string, Set<string>>();
  for (const p of providersWithModels) {
    if (p.modelIds && p.modelIds.length > 0) providerModelMap.set(p.id, new Set(p.modelIds));
  }

  const matchingProviders = providersWithModels.filter(
    (p) => providerModelMap.get(p.id)?.has(remappedModel),
  );

  if (matchingProviders.length > 0) {
    const matchingIds = new Set(matchingProviders.map((m) => m.id));
    return buildProviderOrder(allProviders.filter((p) => matchingIds.has(p.id)));
  }

  console.log(`[ai-proxy] Model "${remappedModel}" not known in any provider, trying all ${allProviders.length} provider(s)`);
  return buildProviderOrder(allProviders);
}

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

export function extractUsageMetrics(payload: any): UsageMetrics {
  const usage = payload?.usage || payload?.response?.usage || {};

  // Handle plural and singular token field names (OpenAI uses plural, some providers use singular)
  const promptTokens =
    readNumericValue(usage?.prompt_tokens) ??
    readNumericValue(usage?.input_tokens) ??
    readNumericValue(payload?.prompt_tokens) ??
    readNumericValue(payload?.input_tokens) ??
    readNumericValue(usage?.promptTokens) ??
    readNumericValue(usage?.inputTokens) ??
    readNumericValue(payload?.promptTokens) ??
    readNumericValue(payload?.inputTokens);

  const completionTokens =
    readNumericValue(usage?.completion_tokens) ??
    readNumericValue(usage?.output_tokens) ??
    readNumericValue(payload?.completion_tokens) ??
    readNumericValue(payload?.output_tokens) ??
    readNumericValue(usage?.completionTokens) ??
    readNumericValue(usage?.outputTokens) ??
    readNumericValue(payload?.completionTokens) ??
    readNumericValue(payload?.outputTokens);

  const totalTokens = (() => {
    const combined = (promptTokens ?? 0) + (completionTokens ?? 0);
    return combined > 0 ? combined : undefined;
  })();

  const cost =
    readNumericValue(usage?.cost) ??
    readNumericValue(usage?.total_cost) ??
    readNumericValue(payload?.cost) ??
    readNumericValue(payload?.total_cost) ??
    readNumericValue(usage?.cost_details?.upstream_inference_cost);

  return { promptTokens, completionTokens, totalTokens, cost };
}

export const extractResponsesUsageMetrics = extractUsageMetrics;

// ── Stream usage aggregation ─────────────────────────────────────────────

export function aggregateStreamUsage(responseText: string): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
} {
  const lines = responseText.split("\n").filter((l) => l.startsWith("data:"));
  let promptTokens = 0, completionTokens = 0, totalTokens = 0, cost: number | undefined;

  for (const line of lines) {
    const data = line.slice(5).trim();
    if (data === "[DONE]") continue;
    try {
      const chunk = JSON.parse(data);
      const usage = chunk?.usage || {};
      if (usage?.prompt_tokens != null) promptTokens += Number(usage.prompt_tokens);
      if (usage?.completion_tokens != null) completionTokens += Number(usage.completion_tokens);
      if (usage?.total_tokens != null) totalTokens += Number(usage.total_tokens);
      if (usage?.cost != null && cost === undefined) cost = 0;
      if (usage?.cost != null) cost! += Number(usage.cost);
    } catch { /* ignore malformed chunks */ }
  }
  return { promptTokens, completionTokens, totalTokens, cost };
}

// ── Real stream teeing with usage logging ────────────────────────────────

export function teeAndLogStream(
  upstream: Response,
  logCtx: {
    providerId: string;
    model: string;
    virtualKeyId: string;
    startedAt: number;
    remappedModel?: string;
  },
): Response {
  const headers = {
    "content-type": upstream.headers.get("content-type") || "",
    "cache-control": upstream.headers.get("cache-control") || "no-cache",
    connection: upstream.headers.get("connection") || "keep-alive",
  };

  if (!upstream.body) {
    logRequest({
      providerId: logCtx.providerId,
      model: logCtx.model,
      statusCode: upstream.status,
      durationMs: Date.now() - logCtx.startedAt,
      virtualKeyId: logCtx.virtualKeyId,
      remappedModel: logCtx.remappedModel,
    });
    return new Response(upstream.body, { status: upstream.status, headers });
  }

  const [clientBranch, loggingBranch] = upstream.body.tee();

  (async () => {
    let buffered = "";
    try {
      const reader = loggingBranch.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
      }
    } catch (err) {
      console.log(`[ai-proxy] Stream usage logging failed: ${(err as Error)?.message || "unknown error"}`);
    } finally {
      const usage = aggregateStreamUsage(buffered);
      logRequest({
        providerId: logCtx.providerId,
        model: logCtx.model,
        statusCode: upstream.status,
        durationMs: Date.now() - logCtx.startedAt,
        virtualKeyId: logCtx.virtualKeyId,
        remappedModel: logCtx.remappedModel,
        promptTokens: usage.promptTokens || undefined,
        completionTokens: usage.completionTokens || undefined,
        totalTokens: usage.totalTokens || undefined,
        cost: usage.cost ?? undefined,
      });
    }
  })();

  return new Response(clientBranch, { status: upstream.status, headers });
}

export async function handleUpstreamResult(
  upstream: Response,
  ctx: { providerId: string; model: string; virtualKeyId: string; startedAt: number; remappedModel?: string },
  extractUsageFn: (payload: any) => UsageMetrics,
): Promise<Response> {
  const isEventStream = (upstream.headers.get("content-type") || "")
    .toLowerCase()
    .includes("text/event-stream");

  if (isEventStream) {
    return teeAndLogStream(upstream, ctx);
  }

  const textContent = await upstream.text();
  let metrics: UsageMetrics = {};
  try {
    metrics = extractUsageFn(JSON.parse(textContent));
  } catch { /* ignore parse errors */ }

  logRequest({
    providerId: ctx.providerId,
    model: ctx.model,
    statusCode: upstream.status,
    durationMs: Date.now() - ctx.startedAt,
    virtualKeyId: ctx.virtualKeyId,
    remappedModel: ctx.remappedModel,
    ...metrics,
  });

  return new Response(textContent, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
  });
}

// ── Multi-provider attempt loop ──────────────────────────────────────────

export async function attemptProviders(
  providers: Provider[],
  body: any,
  forwardFn: (provider: Provider, body: any) => Promise<Response>,
  extractUsageFn: (payload: any) => UsageMetrics,
  ctx: { model: string; remappedModel?: string; virtualKeyId: string; startedAt: number },
): Promise<{ response: Response } | { failed: true; tried: Provider[]; lastError?: Error }> {
  const tried: Provider[] = [];
  let lastError: Error | undefined;

  for (const candidate of providers) {
    let upstream: Response;
    try {
      upstream = await forwardFn(candidate, body);
    } catch (error: any) {
      lastError = error;
      tried.push(candidate);
      logRequest({
        providerId: candidate.id,
        model: ctx.model,
        statusCode: 502,
        durationMs: Date.now() - ctx.startedAt,
        virtualKeyId: ctx.virtualKeyId,
        remappedModel: ctx.remappedModel,
      });
      console.log(`[ai-proxy] Provider "${candidate.name}" threw an error: ${error?.message || "Unknown error"}`);
      continue;
    }

    if (!upstream.ok) {
      tried.push(candidate);
      logRequest({
        providerId: candidate.id,
        model: ctx.model,
        statusCode: upstream.status,
        durationMs: Date.now() - ctx.startedAt,
        virtualKeyId: ctx.virtualKeyId,
        remappedModel: ctx.remappedModel,
      });
      console.log(`[ai-proxy] Provider "${candidate.name}" returned ${upstream.status}`);
      continue;
    }

    const response = await handleUpstreamResult(
      upstream,
      { providerId: candidate.id, model: ctx.model, virtualKeyId: ctx.virtualKeyId, startedAt: ctx.startedAt, remappedModel: ctx.remappedModel },
      extractUsageFn,
    );
    return { response };
  }

  return { failed: true, tried, lastError };
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
