import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  authenticateVirtualKey,
  getDefaultProvider,
  getProvider,
  listProviders,
  logRequest,
  resolveModelMapping,
} from "$lib/server/db";
import { extractBearer } from "$lib/server/keys";
import { forwardChatCompletion } from "$lib/server/proxy";
import type { Provider } from "$lib/server/types";
import { startRequest, finishRequest } from "$lib/server/active-requests";
import { extractOpenAIUsageMetrics } from "$lib/server/common-server";

export const POST: RequestHandler = async ({ request }) => {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));

  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) {
    logRequest({
      model: "chat:unauthenticated",
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });
    return json({ error: "Missing virtual key in Authorization header" }, { status: 401 });
  }

  const virtualKey = authenticateVirtualKey(bearer);
  if (!virtualKey) {
    logRequest({
      model: "chat:unauthenticated",
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });
    return json({ error: "Invalid virtual key" }, { status: 401 });
  }

  const allProviders = listProviders();
  if (allProviders.length === 0) {
    return json({ error: "No provider configured. Add a provider in the UI first." }, { status: 400 });
  }

  const model = body?.model || "unknown-model";
  const resolvedModel = resolveModelMapping(model);

  // Update the request body to use the remapped model when forwarding upstream
  if (resolvedModel !== model) {
    body.model = resolvedModel;
  }

  function resolveProviderId(req: any): string | undefined {
    return (
      req.headers.get("x-provider-id") ||
      req.headers.get("x-ai-provider-id") ||
      body.providerId ||
      undefined
    );
  }

  let providerName: string | undefined;
  if (body.providerId) {
    const p = getProvider(body.providerId);
    if (!p) {
      return json({ error: "Provider not found" }, { status: 404 });
    }
    providerName = p.name;
  } else {
    const defaultProvider = getDefaultProvider();
    if (defaultProvider) {
      providerName = defaultProvider.name;
    }
  }

  // Register as an active request
  const runId = startRequest({ model, providerId: body.providerId || undefined, providerName, virtualKey: virtualKey.name });

  try {
    return await handleAuthenticatedRequest({ startedAt, body, allProviders, model, virtualKey,       providerId: resolveProviderId(request), resolvedModel });
  } finally {
    finishRequest(runId);
  }
};

async function handleAuthenticatedRequest(params: {
  startedAt: number;
  body: any;
  allProviders: ReturnType<typeof listProviders>;
  model: string;
  virtualKey: NonNullable<ReturnType<typeof authenticateVirtualKey>>;
  providerId?: string | null;
  resolvedModel?: string;
}) {
  const { startedAt, body, allProviders, model, virtualKey, resolvedModel } = params;

  console.log(
    `[ai-proxy] /chat/completions request - model: "${model}"`,
  );

  if (params.providerId) {
    const explicitProvider = getProvider(params.providerId);
    if (!explicitProvider) {
      return json({ error: "Provider not found" }, { status: 404 });
    }

    console.log(
      `[ai-proxy] Using explicitly requested provider: "${explicitProvider.name}" (id: ${explicitProvider.id})`,
    );

    let upstream: Response;
    try {
      upstream = await forwardChatCompletion(explicitProvider, body);
    } catch (error: any) {
      const statusCode = 502;
      logRequest({
        providerId: explicitProvider.id,
        model,
        statusCode,
        durationMs: Date.now() - startedAt,
        virtualKeyId: virtualKey.id,
        remappedModel: resolvedModel,
      });

      console.log(
        `[ai-proxy] Request to provider "${explicitProvider.name}" failed: ${error?.message || "Unknown error"}`,
      );

      return json(
        {
          error: "Upstream request failed",
          detail: error?.message || "Unknown proxy error",
        },
        { status: statusCode },
      );
    }

    return await processResponse(upstream, model, explicitProvider.id, body.stream === true, virtualKey.id, startedAt, resolvedModel);
  }

  const providersToTry = allProviders;
  console.log(
    `[ai-proxy] Provider attempt order: ${providersToTry.map(p => `"${p.name}" (id: ${p.id})`).join(", ")}`,
  );

  const triedProviders: Provider[] = [];
  let lastError: Error | undefined;

  for (const candidate of providersToTry) {
    console.log(
      `[ai-proxy] Checking if provider "${candidate.name}" (id: ${candidate.id}) has model "${model}"...`,
    );

    try {
      const upstream = await forwardChatCompletion(candidate, body);

      if (!upstream.ok) {
        lastError = new Error(`Upstream ${upstream.status} from "${candidate.name}"`);
        logRequest({
          providerId: candidate.id,
          model,
          statusCode: upstream.status,
          durationMs: Date.now() - startedAt,
          virtualKeyId: virtualKey.id,
          remappedModel: resolvedModel,
        });

        console.log(
          `[ai-proxy] Provider "${candidate.name}" returned ${upstream.status}: ${typeof (await upstream.json()).then((j: any) => j?.error || {}).catch(() => "unknown")}`,
        );

        continue;
      }

      const statusCode = upstream.status;
      const isEventStream = (upstream.headers.get("content-type") || "").toLowerCase().includes("text/event-stream");

      if (isEventStream) {
        const responseText = await upstream.text();
        const usage = await aggregateStreamUsage(responseText);

        logRequest({
          providerId: candidate.id,
          model,
          statusCode: upstream.status,
          durationMs: Date.now() - startedAt,
          virtualKeyId: virtualKey.id,
          remappedModel: resolvedModel,
          promptTokens: usage.promptTokens || undefined,
          completionTokens: usage.completionTokens || undefined,
          totalTokens: usage.totalTokens || undefined,
        });

        return new Response(responseText, {
          status: upstream.status,
          headers: { "content-type": upstream.headers.get("content-type") || "" },
        });
      }

      let textContent;
      try {
        textContent = await upstream.text();
      } catch (e: any) {
        console.log(
          `[ai-proxy] Could not read response from "${candidate.name}": ${(e as Error)?.message || "Unknown error"}`,
        );
        continue;
      }

      const metrics: ReturnType<typeof extractOpenAIUsageMetrics> = {};
      try {
        const payload = JSON.parse(textContent);
        Object.assign(metrics, extractOpenAIUsageMetrics(payload));
      } catch { /* ignore parse errors */ }

      logRequest({
        providerId: candidate.id,
        model,
        statusCode: upstream.status,
        durationMs: Date.now() - startedAt,
        virtualKeyId: virtualKey.id,
        remappedModel: resolvedModel,
        ...metrics,
      });

      return new Response(textContent, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") || "application/json" },
      });
    } catch (error: any) {
      lastError = error;
      console.log(
        `[ai-proxy] Provider "${candidate.name}" threw an error: ${error?.message || "Unknown error"}`,
      );
    }
  }

  console.log(
    `[ai-proxy] All ${triedProviders.length} tried provider(s) failed. Tried: ${triedProviders.map(p => `"${p.name}"`).join(", ")}`,
  );
  return json(
    {
      error: `Failed to complete request. Model '${model}' not available in any configured provider.`,
      detail: lastError?.message || "Unknown proxy error",
      triedProviders: triedProviders.map((p) => ({ providerId: p.id, providerName: p.name })),
    },
    { status: 502 },
  );
}

async function aggregateStreamUsage(responseText: string): Promise<{ promptTokens: number; completionTokens: number; totalTokens: number }> {
  const lines = responseText.split("\n").filter(l => l.startsWith("data:"));

  let promptTokens = 0, completionTokens = 0, totalTokens = 0;

  for (const line of lines) {
    const data = line.slice(5).trim();
    if (data === "[DONE]") continue;

    try {
      const chunk = JSON.parse(data);
      const usage = chunk?.usage || {};
      if (usage?.prompt_tokens != null) promptTokens += Number(usage.prompt_tokens);
      if (usage?.completion_tokens != null) completionTokens += Number(usage.completion_tokens);
      if (usage?.total_tokens != null) totalTokens += Number(usage.total_tokens);
    } catch { /* ignore malformed chunks */ }
  }

  return { promptTokens, completionTokens, totalTokens };
}

async function processResponse(
  upstream: Response,
  model: string,
  providerId: string,
  streamRequested: boolean,
  virtualKeyId: string,
  startedAt: number,
  remappedModel?: string,
): Promise<Response> {
  const statusCode = upstream.status;
  const isEventStream = (upstream.headers.get("content-type") || "").toLowerCase().includes("text/event-stream");

  if (streamRequested && isEventStream) {
    const responseText = await upstream.text();
    const usage = await aggregateStreamUsage(responseText);

    logRequest({
      providerId, model, statusCode, durationMs: Date.now() - startedAt, virtualKeyId, remappedModel,
      promptTokens: usage.promptTokens || undefined,
      completionTokens: usage.completionTokens || undefined,
      totalTokens: usage.totalTokens || undefined,
    });

    return new Response(responseText, {
      status: statusCode,
      headers: {
        "content-type": upstream.headers.get("content-type") || "",
        "cache-control": upstream.headers.get("cache-control") || "no-cache",
        connection: upstream.headers.get("connection") || "keep-alive",
      },
    });
  }

  const textContent = await upstream.text();
  let metrics: ReturnType<typeof extractOpenAIUsageMetrics> = {};
  try {
    const payload = JSON.parse(textContent);
    Object.assign(metrics, extractOpenAIUsageMetrics(payload));
  } catch { /* ignore */ }

  logRequest({ providerId, model, statusCode, durationMs: Date.now() - startedAt, virtualKeyId, remappedModel, ...metrics });

  return new Response(textContent, { status: statusCode, headers: { "content-type": upstream.headers.get("content-type") || "application/json" } });
}


