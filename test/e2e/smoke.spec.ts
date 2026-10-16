import { expect, test, type Page } from "@playwright/test";

const localDate = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  date: localDate(),
  totalMl: 1420,
  goalMl: 2366,
  lastDrinkAt: new Date(Date.now() - 23 * 60_000).toISOString(),
  tz: "America/New_York",
  syncedAt: new Date().toISOString(),
  ...overrides,
});

async function mockToday(page: Page, status: number, body: unknown) {
  let calls = 0;
  await page.route("**/api/today", (route) => {
    calls += 1;
    return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  });
  return () => calls;
}

test("renders totals and last sip", async ({ page }) => {
  await mockToday(page, 200, { ok: true, data: snapshot() });
  await page.goto("/?key=abc");
  await expect(page.locator("#totals")).toHaveText("48 / 80 oz");
  await expect(page.locator("#last-sip")).toHaveText("Last sip 23 min ago");
  expect(page.url()).not.toContain("key=");
});

test("goal met turns ring green", async ({ page }) => {
  await mockToday(page, 200, { ok: true, data: snapshot({ totalMl: 2600 }) });
  await page.goto("/?key=abc");
  await expect(page.locator("body")).toHaveClass(/goal-met/);
});

test("no key shows setup", async ({ page }) => {
  const calls = await mockToday(page, 200, { ok: true, data: snapshot() });
  await page.goto("/");
  await expect(page.locator("#setup")).toBeVisible();
  await expect(page.locator("#setup")).toHaveText("Open your setup link");
  expect(calls()).toBe(0);
});

test("401 clears key and shows setup", async ({ page }) => {
  await mockToday(page, 401, { ok: false, error: "unauthorized" });
  await page.goto("/?key=bad");
  await expect(page.locator("#setup")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("hidratelens.key"))).toBeNull();
});
