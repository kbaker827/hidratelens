import { isAuthorized } from "./auth";
import { errorResponse, json } from "./respond";
import type { Env, Snapshot } from "./types";

export async function handleToday(request: Request, env: Env): Promise<Response> {
  if (!(await isAuthorized(request, env.READ_TOKEN))) return errorResponse("unauthorized", 401);
  const data = await env.HIDRATELENS.get<Snapshot>("latest", "json");
  return json({ ok: true, data });
}
