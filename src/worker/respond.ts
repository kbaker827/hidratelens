export function json(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const errorResponse = (error: string, status: number): Response =>
  json({ ok: false, error }, status);
