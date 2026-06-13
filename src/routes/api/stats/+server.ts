import { json } from "@sveltejs/kit";
import { getStats } from "$lib/server/db";

export const GET = async () => {
  return json(getStats());
};
