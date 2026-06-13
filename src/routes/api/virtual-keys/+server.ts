import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createVirtualKey, listVirtualKeys } from "$lib/server/db";

export const GET: RequestHandler = async () => {
  return json({ keys: listVirtualKeys() });
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    if (!body?.name) {
      return json({ error: "name is required" }, { status: 400 });
    }

    const result = createVirtualKey(body.name);
    return json({ key: result.key }, { status: 201 });
  } catch (error: any) {
    return json({ error: error.message || "Invalid request" }, { status: 400 });
  }
};
