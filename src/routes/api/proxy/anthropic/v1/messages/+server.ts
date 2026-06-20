import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  authenticateVirtualKey,
  getProvider,
  listProviders,
  logRequest,
} from "$lib/server/db";
import { extractBearer } from "$lib/server/keys";
import { readCachedModels, writeCachedModels } from "$lib/server/models-cache";
import {
  forwardAnthropicMessages,
  forwardModelList,
} from "$lib/server/proxy";
import type { Provider } from "$lib/server/types";
import { executeWithWolStartupGrace } from "$lib/server/wol-startup";
import {
  extractAnthropicUsageMetrics,
  returnResponse,
  buildProviderOrder,
  authErrorResponse,
  noProviderResponse,
  providerNotFoundResponse,
} from "$lib/server/common-server";

async function getModelListForProvider(
  provider: Provider,
): Promise<string[]> {
  const cached = readCachedModels(provider);
  if (cached) {
    return cached.models
      .map((m) => m?.id)
      .filter((id): id is string => typeof id === "string");
  }

  try {
    const response = await forwardModelList(provider);
    const payload = await response.json().catch(() => ({}));

    const models = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];
    writeCachedModels(provider, models);

    return models
      .map((m: any) => m?.id)
      .filter((id: unknown): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

async function providerHasModel(
  provider: Provider,
  modelId: string,
): Promise<boolean> {
  const models = await getModelListForProvider(provider);
  return models.some((m) => m.toLowerCase() === modelId.toLowerCase());
}

export const POST: RequestHandler = async ({ request }) => {
  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const streamRequested = body?.stream === true;

  const bearer = extractBearer(request.headers.get("authorization"));
  if (!bearer) {
    logRequest({
      model: "anthropic:unauthenticated",
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });
    return authErrorResponse("missing");
  }

  const virtualKey = authenticateVirtualKey(bearer);
  if (!virtualKey) {
    logRequest({
      model: "anthropic:unauthenticated",
      statusCode: 401,
      durationMs: Date.now() - startedAt,
    });
    return authErrorResponse("invalid");
  }

  const providerId =
    request.headers.get("x-provider-id") ||
    body?.providerId ||
    request.headers.get("x-ai-provider-id") ||
    undefined;

  const allProviders = listProviders();
  if (allProviders.length === 0) {
    return noProviderResponse();
  }

  const model = body?.model || "unknown-model";

  console.log(
    `[ai-proxy] /anthropic/v1/messages request - model: "${model}", requested providerId: ${providerId || "none"}`,
  );

  if (providerId) {
    const explicitProvider = getProvider(providerId);
    if (!explicitProvider) {
      console.log(`[ai-proxy] Provider "${providerId}" not found`);
      return providerNotFoundResponse();
    }

    console.log(
      `[ai-proxy] Using explicitly requested provider: "${explicitProvider.name}" (id: ${explicitProvider.id})`,
    );

    let upstream: Response;
    try {
      upstream = await executeWithWolStartupGrace(
        explicitProvider,
        "anthropic:messages",
        () => forwardAnthropicMessages(explicitProvider, body),
        {
          shouldRetryResult: (response) => response.status >= 500,
        },
      );
    } catch (error: any) {
      const statusCode = 502;
      logRequest({
        providerId: explicitProvider.id,
        model,
        statusCode,
        durationMs: Date.now() - startedAt,
        virtualKeyId: virtualKey.id,
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

    return returnResponse(
      upstream,
      model,
      explicitProvider.id,
      streamRequested,
      virtualKey.id,
      startedAt,
      extractAnthropicUsageMetrics,
    );
  }

  const providersToTry = buildProviderOrder(allProviders);
  console.log(
    `[ai-proxy] Provider attempt order: ${providersToTry.map(p => `"${p.name}" (id: ${p.id})`).join(", ")}`,
  );

  const triedProviders: Provider[] = [];
  let lastError: Error | undefined;

  for (const candidate of providersToTry) {
    console.log(
      `[ai-proxy] Checking if provider "${candidate.name}" (id: ${candidate.id}) has model "${model}"...`,
    );
    const hasModel = await providerHasModel(candidate, model);

    if (!hasModel) {
      console.log(
        `[ai-proxy] Provider "${candidate.name}" does not have model "${model}" - skipping`,
      );
      continue;
    }

    triedProviders.push(candidate);
    console.log(
      `[ai-proxy] Provider "${candidate.name}" has model "${model}" - sending messages request`,
    );

    try {
      const upstream = await executeWithWolStartupGrace(
        candidate,
        "anthropic:messages",
        () => forwardAnthropicMessages(candidate, body),
        {
          shouldRetryResult: (response) => response.status >= 500,
        },
      );

      const upstreamText = await upstream.text();
      const upstreamContentType =
        upstream.headers.get("content-type") || "";
      const isEventStream = upstreamContentType.toLowerCase().includes(
        "text/event-stream",
      );

      console.log(
        `[ai-proxy] Provider "${candidate.name}" returned status ${upstream.status}${isEventStream ? " (streaming)" : ""}`,
      );

      const metrics: ReturnType<
        typeof extractAnthropicUsageMetrics
      > = {};
      try {
        const payload = JSON.parse(upstreamText);
        Object.assign(metrics, extractAnthropicUsageMetrics(payload));
      } catch {
        // ignore parse errors
      }

      logRequest({
        providerId: candidate.id,
        model,
        statusCode: upstream.status,
        durationMs: Date.now() - startedAt,
        virtualKeyId: virtualKey.id,
        ...metrics,
      });

      return new Response(upstreamText, {
        status: upstream.status,
        headers: {
          "content-type":
            upstream.headers.get("content-type") || "application/json",
        },
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
      triedProviders: triedProviders.map((p) => ({
        providerId: p.id,
        providerName: p.name,
      })),
    },
    { status: 502 },
  );
};


