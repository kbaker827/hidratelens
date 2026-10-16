const BEARER_PREFIX = "Bearer ";

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
}

// Hash both sides so timingSafeEqual always compares equal-length buffers.
export async function isAuthorized(request: Request, expected: string): Promise<boolean> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith(BEARER_PREFIX) || !expected) return false;
  const [given, wanted] = await Promise.all([sha256(header.slice(BEARER_PREFIX.length)), sha256(expected)]);
  return crypto.subtle.timingSafeEqual(given, wanted);
}
