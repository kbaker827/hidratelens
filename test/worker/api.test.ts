import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../../src/worker/types";

const WRITE = "test-write-token-000000000000000000";
const READ = "test-read-token-0000000000000000000";
const kv = (env as unknown as Env).HIDRATELENS;

beforeEach(async () => {
  const { keys } = await kv.list();
  await Promise.all(keys.map(({ name }) => kv.delete(name)));
});

const payload = {
  date: "2026-10-16",
  totalMl: 1420,
  goalMl: 2366,
  lastDrinkAt: "2026-10-16T14:07:00-04:00",
  tz: "America/New_York",
};

const call = (path: string, init: RequestInit = {}) =>
  exports.default.fetch(new Request(`https://x${path}`, init));

const postIntake = (body: string, token?: string) =>
  call("/api/intake", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body,
  });

const getToday = (token?: string) =>
  call("/api/today", { headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe("auth", () => {
  it("intake without token → 401", async () => {
    const res = await postIntake(JSON.stringify(payload));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: "unauthorized" });
  });

  it("intake with wrong token → 401", async () => {
    expect((await postIntake(JSON.stringify(payload), "nope")).status).toBe(401);
  });

  it("intake with READ token → 401", async () => {
    expect((await postIntake(JSON.stringify(payload), READ)).status).toBe(401);
  });

  it("today with WRITE token → 401", async () => {
    expect((await getToday(WRITE)).status).toBe(401);
  });
});

describe("POST /api/intake", () => {
  it("intake valid → 200 and stores latest + day key", async () => {
    const res = await postIntake(JSON.stringify(payload), WRITE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    for (const key of ["latest", "day:2026-10-16"]) {
      const stored = JSON.parse((await kv.get(key)) ?? "null");
      expect(stored).toMatchObject(payload);
      expect(Number.isFinite(Date.parse(stored.syncedAt))).toBe(true);
    }
  });

  it("intake invalid JSON body → 400 invalid JSON, nothing stored", async () => {
    const res = await postIntake("{", WRITE);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid JSON" });
    expect(await kv.get("latest")).toBeNull();
  });

  it("intake invalid field → 400 goalMl invalid, nothing stored", async () => {
    const res = await postIntake(JSON.stringify({ ...payload, goalMl: 0 }), WRITE);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "goalMl invalid" });
    expect(await kv.get("latest")).toBeNull();
  });

  it("intake body of 2049 bytes → 413", async () => {
    const res = await postIntake("x".repeat(2049), WRITE);
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ ok: false, error: "payload too large" });
  });
});

describe("GET /api/today", () => {
  it("today before any intake → data null", async () => {
    const res = await getToday(READ);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: null });
  });

  it("today after intake → stored snapshot, no-store", async () => {
    await postIntake(JSON.stringify(payload), WRITE);
    const res = await getToday(READ);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = (await res.json()) as { ok: boolean; data: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual(JSON.parse((await kv.get("latest")) ?? "null"));
  });
});

describe("routing", () => {
  it("GET /api/intake → 405", async () => {
    expect((await call("/api/intake")).status).toBe(405);
  });

  it("GET /api/unknown → 404", async () => {
    const res = await call("/api/unknown");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not found" });
  });
});
