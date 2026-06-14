import { sendWakeOnLan } from "$lib/server/wol";
import type { Provider } from "$lib/server/types";

const DEFAULT_WOL_BOOT_WAIT_MS = 20_000;
const DEFAULT_WOL_RETRY_ATTEMPTS = 8;
const DEFAULT_WOL_RETRY_INTERVAL_MS = 3_000;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

const WOL_BOOT_WAIT_MS = readPositiveIntEnv(
  "WOL_BOOT_WAIT_MS",
  DEFAULT_WOL_BOOT_WAIT_MS,
);
const WOL_RETRY_ATTEMPTS = readPositiveIntEnv(
  "WOL_RETRY_ATTEMPTS",
  DEFAULT_WOL_RETRY_ATTEMPTS,
);
const WOL_RETRY_INTERVAL_MS = readPositiveIntEnv(
  "WOL_RETRY_INTERVAL_MS",
  DEFAULT_WOL_RETRY_INTERVAL_MS,
);

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryNetworkError(error: unknown): boolean {
  const code = (error as any)?.code;
  if (typeof code === "string") {
    return [
      "ECONNREFUSED",
      "EHOSTUNREACH",
      "ENETUNREACH",
      "ETIMEDOUT",
      "ECONNRESET",
      "EAI_AGAIN",
    ].includes(code);
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error || "");

  return (
    message.includes("fetch failed") ||
    message.includes("connection refused") ||
    message.includes("network") ||
    message.includes("timed out") ||
    message.includes("econnrefused") ||
    message.includes("ehostunreach") ||
    message.includes("enetunreach")
  );
}

export async function executeWithWolStartupGrace<T>(
  provider: Provider,
  actionLabel: string,
  operation: () => Promise<T>,
  options?: {
    shouldRetryResult?: (result: T) => boolean;
  },
): Promise<T> {
  if (!provider.wolEnabled) {
    return operation();
  }

  const triggerWake = async () => {
    if (!provider.wolMac) {
      console.warn("[WOL] Skipped wake request: provider has no MAC configured", {
        providerId: provider.id,
        providerName: provider.name,
        action: actionLabel,
      });
      return;
    }

    await sendWakeOnLan(provider.wolMac, provider.wolBroadcast, provider.wolPort)
      .then(() => {
        console.info("[WOL] Wake packet sent", {
          providerId: provider.id,
          providerName: provider.name,
          mac: provider.wolMac,
          broadcast: provider.wolBroadcast || "255.255.255.255",
          port: provider.wolPort || 9,
          action: actionLabel,
        });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "Unknown WOL error";

        console.error("[WOL] Failed to send wake packet", {
          providerId: provider.id,
          providerName: provider.name,
          mac: provider.wolMac,
          broadcast: provider.wolBroadcast || "255.255.255.255",
          port: provider.wolPort || 9,
          action: actionLabel,
          error: message,
        });
      });
  };

  // Probe first: if provider is already up, do not send WOL.
  try {
    const probeResult = await operation();
    if (!options?.shouldRetryResult?.(probeResult)) {
      return probeResult;
    }
  } catch (error) {
    if (!shouldRetryNetworkError(error)) {
      throw error;
    }
  }

  await triggerWake();

  if (WOL_BOOT_WAIT_MS > 0) {
    console.info("[WOL] Waiting for provider startup", {
      providerId: provider.id,
      providerName: provider.name,
      action: actionLabel,
      waitMs: WOL_BOOT_WAIT_MS,
    });
    await sleep(WOL_BOOT_WAIT_MS);
  }

  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await operation();

      if (options?.shouldRetryResult?.(result) && attempt < WOL_RETRY_ATTEMPTS) {
        await sleep(WOL_RETRY_INTERVAL_MS);
        continue;
      }

      return result;
    } catch (error) {
      if (!shouldRetryNetworkError(error) || attempt >= WOL_RETRY_ATTEMPTS) {
        throw error;
      }

      console.warn("[WOL] Provider still starting; retrying request", {
        providerId: provider.id,
        providerName: provider.name,
        action: actionLabel,
        attempt: attempt + 1,
        retryInMs: WOL_RETRY_INTERVAL_MS,
      });

      await sleep(WOL_RETRY_INTERVAL_MS);
    }
  }
}
