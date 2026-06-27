import { writable, get } from "svelte/store";
import type { Provider, ProviderForm } from "./types";

export const MODEL_PREVIEW_MAX_CHARS = 15;

export const providers = writable<Provider[]>([]);
export const loadingProviders = writable<boolean>(false);
export const error = writable<string>("");
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
  } catch {
    error.set("Failed to load providers");
  } finally {
    loadingProviders.set(false);
  }
}

export async function refreshProviderData() {
  await loadProviders();
}

export async function addProvider(formData: ProviderForm) {
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
  const confirmed = window.confirm("Delete this provider? This action cannot be undone.");
  if (!confirmed) return;

  await fetch(`/api/providers/${id}`, { method: "DELETE" });
  await refreshProviderData();
}

export async function saveProviderEdits(id: string, formData: ProviderForm) {
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
  if (hours < 24) return `${hours}h ${minutes % 60}s`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function modelPreview(modelIds: string[]): string {
  const full = modelIds.join(", ");
  if (!full) return "-";
  if (full.length <= MODEL_PREVIEW_MAX_CHARS) return full;
  return `${full.slice(0, MODEL_PREVIEW_MAX_CHARS)}...`;
}
