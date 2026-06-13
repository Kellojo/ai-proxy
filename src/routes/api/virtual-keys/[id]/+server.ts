import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { deleteVirtualKey, updateVirtualKey } from "$lib/server/db";

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const key = updateVirtualKey(params.id, {
      name: body?.name,
      active: typeof body?.active === "boolean" ? body.active : undefined,
    });

    if (!key) {
      return json({ error: "Virtual key not found" }, { status: 404 });
    }

    return json({ key });
  } catch (error: any) {
    return json({ error: error.message || "Invalid request" }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  const deleted = deleteVirtualKey(params.id);
  if (!deleted) {
    return json({ error: "Virtual key not found" }, { status: 404 });
  }
  return json({ ok: true });
};
