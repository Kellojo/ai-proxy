// In-memory store for currently-running requests
// Cleared on server restart; not persisted to the database.

export interface ActiveRequest {
  id: string;
  model: string;
  providerId: string | undefined;
  providerName: string | undefined;
  virtualKey: string | undefined;
  startedAt: number; // Date.now()
}

const active = new Map<string, ActiveRequest>();
let nextIndex = 0;

/** Register a request as it begins. Returns the tracking id. */
export function startRequest(entry: Omit<ActiveRequest, "id" | "startedAt">): string {
  const id = `run-${Date.now()}-${nextIndex++}`;
  active.set(id, {
    id,
    model: entry.model,
    providerId: entry.providerId,
    providerName: entry.providerName,
    virtualKey: entry.virtualKey,
    startedAt: Date.now(),
  });
  return id;
}

/** Remove a request when it finishes (success or failure). */
export function finishRequest(id: string): void {
  active.delete(id);
}

/** Snapshot of all currently-active requests, newest first. */
export function listActive(): ActiveRequest[] {
  return Array.from(active.values()).sort((a: ActiveRequest, b: ActiveRequest) => b.startedAt - a.startedAt);
}

export async function withActiveRequestTracking<T>(
  entry: Omit<ActiveRequest, "id" | "startedAt">,
  fn: () => Promise<T>,
): Promise<T> {
  const runId = startRequest(entry);
  try {
    return await fn();
  } finally {
    finishRequest(runId);
  }
}