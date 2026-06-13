import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { rerollVirtualKey } from "$lib/server/db";

export const POST: RequestHandler = async ({ params }) => {
  const result = rerollVirtualKey(params.id);
  if (!result) {
    return json({ error: "Virtual key not found" }, { status: 404 });
  }

  return json({ key: result.key });
};
