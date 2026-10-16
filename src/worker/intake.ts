import { isAuthorized } from "./auth";
import { errorResponse, json } from "./respond";
import type { Env, Snapshot } from "./types";
import { validateIntake } from "./validate";

const MAX_BODY_BYTES = 2048;
const DAY_KEY_TTL_SECONDS = 30 * 24 * 60 * 60;

export async function handleIntake(request: Request, env: Env, now: Date = new Date()): Promise<Response> {
  if (!(await isAuthorized(request, env.WRITE_TOKEN))) return errorResponse("unauthorized", 401);

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) return errorResponse("payload too large", 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return errorResponse("invalid JSON", 400);
  }

  const result = validateIntake(parsed);
  if (!result.ok) return errorResponse(result.error, 400);

  const snapshot: Snapshot = { ...result.value, syncedAt: now.toISOString() };
  const serialized = JSON.stringify(snapshot);
  try {
    await Promise.all([
      env.HIDRATELENS.put("latest", serialized),
      env.HIDRATELENS.put(`day:${snapshot.date}`, serialized, { expirationTtl: DAY_KEY_TTL_SECONDS }),
    ]);
  } catch (error) {
    console.error("KV write failed", error);
    return errorResponse("storage error", 500);
  }
  return json({ ok: true });
}
