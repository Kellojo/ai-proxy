import { writable, get } from "svelte/store";
import type { Provider, ProviderForm, ProviderModelCache } from "./types";

export const MODEL_PREVIEW_MAX_CHARS = 15;

export const providers = writable<Provider[]>([]);
export const loadingProviders = writable<boolean>(false);
export const message = writable<string>("");
export const error = writable<string>("");
export const cacheTtlMs = writable<number>(0);
export const toast = writable<string>("");
let toastTimeout: ReturnType<typeof setTimeout> | null = null;

export function showToast(text: string): void {
  if (toastTimeout) clearTimeout(toastTimeout);
  toast.set(text);
  toastTimeout = setTimeout(() => {
    toast.set("");
    toastTimeout = null;
  }, 1800);
}

export async function loadProviders() {
  loadingProviders.set(true);
  error.set("");

  try {
    const response = await fetch("/api/providers");
    const payload = await response.json();

    if (!response.ok) {
      error.set(payload?.error || "Failed to load providers");
      return;
    }

    providers.set(payload?.providers || []);
    cacheTtlMs.set(payload?.cacheTtlMs || 0);
  } catch {
    error.set("Failed to load providers");
  } finally {
    loadingProviders.set(false);
  }
}

export async function refreshProviderData() {
  await loadProviders();
}

export async function clearModelCache() {
  if (
    !confirm(
      "Are you sure you want to clear the model cache? This will force all providers to refresh their model lists on next check.",
    )
  ) {
    return;
  }

  try {
    const res = await fetch("/api/providers/models-cache", {
      method: "DELETE",
    });
    const payload = await res.json();
    if (!res.ok) {
      error.set(payload.error || "Failed to clear cache");
      return;
    }
    showToast(payload.message || "Cache cleared successfully");
    await refreshProviderData();
  } catch (err) {
    error.set("Failed to clear cache");
    console.error(err);
  }
}

export async function addProvider(formData: ProviderForm) {
  message.set("");
  error.set("");

  const res = await fetch("/api/providers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(formData),
  });

  const payload = await res.json();
  if (!res.ok) {
    error.set(payload.error || "Failed to create provider");
    return;
  }

  showToast(`Provider ${payload.provider.name} created`);
  await refreshProviderData();
}

export async function removeProvider(id: string) {
  const confirmed = window.confirm(
    "Delete this provider? This action cannot be undone.",
  );
  if (!confirmed) return;

  await fetch(`/api/providers/${id}`, { method: "DELETE" });
  await refreshProviderData();
}

export async function saveProviderEdits(id: string, formData: ProviderForm) {
  message.set("");
  error.set("");

  const res = await fetch(`/api/providers/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...formData, apiKey: formData.apiKey.trim() || undefined }),
  });

  const payload = await res.json();
  if (!res.ok) {
    error.set(payload.error || "Failed to update provider");
    return;
  }

  showToast(`Provider ${payload.provider.name} updated`);
  await refreshProviderData();
}

export function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) return "0s";

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function modelPreview(modelIds: string[]): string {
  const full = modelIds.join(", ");
  if (!full) return "-";
  if (full.length <= MODEL_PREVIEW_MAX_CHARS) return full;
  return `${full.slice(0, MODEL_PREVIEW_MAX_CHARS)}...`;
}

export function cacheTooltip(provider: Provider): string {
  if (!provider.modelCache) return "No cached models";

  const status = provider.modelCache.expired ? "Expired" : "Fresh";
  const ids = provider.modelCache.modelIds.join(", ") || "-";
  return `${status} | ${provider.modelCache.modelCount} model(s) | ${formatDuration(provider.modelCache.cacheAgeMs)} old\n${ids}`;
}

export function setupAutoRefresh(): () => void {
  loadProviders();

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      loadProviders();
    }
  };

  const onWindowFocus = () => {
    loadProviders();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("focus", onWindowFocus);

  const cacheRefreshInterval = setInterval(() => {
    if (document.visibilityState === "visible") {
      loadProviders();
    }
  }, 5000);

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", onWindowFocus);
    clearInterval(cacheRefreshInterval);
  };
}
