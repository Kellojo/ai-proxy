import { json } from "@sveltejs/kit";
import { getStats } from "$lib/server/db";
import { listActive } from "$lib/server/active-requests";

export const GET = async () => {
  const stats = getStats();
  return json({ ...stats, activeRequests: listActive() });
};
