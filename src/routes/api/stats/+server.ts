import type { RequestRow } from "$lib/server/types";
import { json } from "@sveltejs/kit";
import { getStats } from "$lib/server/db";
import { listActive } from "$lib/server/active-requests";

export const GET = async () => {
  const stats = getStats();

  const activeRows: RequestRow[] = listActive().map((a) => ({
    id: a.id,
    created_at: new Date(a.startedAt).toISOString(),
    status_code: 0,
    model: a.model ?? "",
    duration_ms: -1,
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    cost: null,
    remapped_model: null,
    virtual_key_id: null,
    key_name: a.virtualKey ?? "—",
    provider_name: a.providerName ?? "—",
  }));

  const recentRows = ((stats.recentRequests ?? []) as RequestRow[]).map((r) => ({ ...r }));

  return json({
    ...stats,
    requests: [...activeRows, ...recentRows],
  });
};
