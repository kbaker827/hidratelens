# HidrateLens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Cloudflare Worker that receives today's HidrateSpark water total from an iOS Shortcut and serves a Ray-Ban Display Web App showing total vs. goal, a progress ring, and time since the last drink.

**Architecture:** One Worker with static assets. The Worker runs first only for `/api/*`; everything else is served from `public/`. Snapshots live in KV. The Web App is plain ES modules with no build step, polling `/api/today` every 60 s.

**Tech Stack:** TypeScript (Worker), plain JS/HTML/CSS (app), Wrangler 4, Workers KV, Vitest 3 + `@cloudflare/vitest-pool-workers`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-16-hidratelens-design.md`

## Global Constraints

- Everything must build, test and deploy from Windows. No Mac-only tooling.
- KV binding name: `HIDRATELENS`. Secrets: `WRITE_TOKEN`, `READ_TOKEN` (separate random values, at least 32 characters).
- KV keys: `latest` and `day:<YYYY-MM-DD>`; `day:*` keys expire after 30 days (`expirationTtl: 2592000`).
- Every JSON response uses the envelope `{ "ok": boolean, "data"?: ..., "error"?: string }`.
- Error strings are exactly: `unauthorized`, `<field> invalid`, `invalid JSON`, `payload too large`, `storage error`, `not found`.
- Max intake body is 2048 bytes. Limits: `totalMl` from 0 to 20000; `goalMl` from 1 to 20000; `tz` from 1 to 64 characters.
- 1 oz = 29.5735 mL, rounded to a whole number. The default unit is oz.
- The display is stale when `syncedAt` is more than 2 hours old. Polling interval is 60 000 ms.
- UI copy, verbatim:
  - `"<t> / <g> oz"` (or `mL`)
  - `"Last sip <n> min ago"`, `"Last sip just now"`, `"Last sip <h> hr ago"`
  - `"No water yet today"`, `"No sync yet today"`, `"Not synced since <time>"`, `"Open your setup link"`
- No secrets in the repo. No `console.log` in shipped code (`console.error` server-side only).
- Commit format: `<type>: <description>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Invalid JSON body from a misconfigured Shortcut:** expect 400 `invalid JSON`, nothing stored, no 500. *(Task 2 test)*
2. **The Shortcut sends numbers as strings** (`"totalMl": "1420"`): expect 400 `totalMl invalid`, which tells the user what to fix rather than storing garbage. *(Task 1 test; docs in Task 5 say to use the Number field type)*
3. **Intake over goal** (`totalMl` 2600, `goalMl` 2366): the ring is clamped to full and green, and the text shows the real total `"88 / 80 oz"`, not a capped one. *(Task 3 test)*
4. **`lastDrinkAt` slightly in the future** because the glasses and phone clocks differ: expect `"Last sip just now"`, never a negative number of minutes. *(Task 3 test)*
5. **The glasses open the app with no saved key, or a revoked key:** expect `"Open your setup link"` and no request loop. On 401 the saved key is cleared. *(Task 4 e2e test)*

---

### Task 1: Project scaffold + payload validation

**Files:**
- Create: `package.json`, `tsconfig.json`, `wrangler.jsonc`, `vitest.config.ts`, `.gitignore`, `.dev.vars.example`
- Create: `src/worker/types.ts`, `src/worker/validate.ts`
- Test: `test/worker/validate.test.ts`

**Interfaces:**
- Produces:
  - `type IntakePayload = { date: string; totalMl: number; goalMl: number; lastDrinkAt: string | null; tz: string }`
  - `type Snapshot = IntakePayload & { syncedAt: string }`
  - `interface Env { HIDRATELENS: KVNamespace; WRITE_TOKEN: string; READ_TOKEN: string; ASSETS: Fetcher }`, all exported from `types.ts`
  - `validateIntake(input: unknown): { ok: true; value: IntakePayload } | { ok: false; error: string }` in `validate.ts`

- [ ] **Step 1: Scaffold the project.**
  - `package.json` (name `hidratelens`, `"type": "module"`), with these scripts:
    - `dev`: `wrangler dev`
    - `deploy`: `wrangler deploy`
    - `test`: `vitest run`
    - `test:e2e`: `playwright test`
  - Dev dependencies: `wrangler@^4`, `vitest@~3.2`, `@cloudflare/vitest-pool-workers`, `@cloudflare/workers-types`, `typescript`, `@playwright/test`.
  - `wrangler.jsonc`:
    - `main: "src/worker/index.ts"`
    - `compatibility_date: "2026-10-01"`
    - `assets: { directory: "./public", binding: "ASSETS", run_worker_first: ["/api/*"] }`
    - `kv_namespaces: [{ binding: "HIDRATELENS", id: "REPLACE_WITH_YOUR_KV_ID" }]`
  - `vitest.config.ts`: uses `defineWorkersConfig` with `wrangler.configPath` and `miniflare.bindings` setting `WRITE_TOKEN: "test-write-token-000000000000000000"` and `READ_TOKEN: "test-read-token-0000000000000000000"`.
  - `.gitignore`: `node_modules`, `.wrangler`, `.dev.vars`, `test-results`, `playwright-report`.
  - `.dev.vars.example`: placeholder values for both tokens.
  - Run `npm install`.

- [ ] **Step 2: Write failing tests** in `test/worker/validate.test.ts`. The valid base payload is `{ date: "2026-10-16", totalMl: 1420, goalMl: 2366, lastDrinkAt: "2026-10-16T14:07:00-04:00", tz: "America/New_York" }`.
  - `accepts a valid payload`: `ok === true` and `value` deep-equals the input
  - `accepts lastDrinkAt null` and `accepts lastDrinkAt with Z suffix` (`"2026-10-16T18:07:00Z"`)
  - `rejects non-object` (`null`, `[]`, `"x"`): `error === "body invalid"`
  - `rejects bad date`: `"2026-02-30"`, `"10/16/2026"` and `20261016` each give `"date invalid"`
  - `rejects totalMl as string`: `"1420"` gives `"totalMl invalid"` (Review Focus 2)
  - `rejects totalMl out of range`: `-1` and `20001` give `"totalMl invalid"`; `0` and `20000` are accepted
  - `rejects goalMl out of range`: `0` and `20001` give `"goalMl invalid"`
  - `rejects non-ISO lastDrinkAt`: `"yesterday"` and `"2026-10-16"` (no time part) give `"lastDrinkAt invalid"`
  - `rejects tz empty or over 64 chars`: gives `"tz invalid"`
  - `rejects unknown fields`: an extra `foo: 1` gives `"foo invalid"`
  - `rejects NaN/Infinity totals`: gives `"totalMl invalid"`

- [ ] **Step 3: Run** `npx vitest run test/worker/validate.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 4: Implement `validateIntake` in `src/worker/validate.ts` and the types in `types.ts`.**
  - The date must match `/^\d{4}-\d{2}-\d{2}$/` and round-trip through `new Date(date + "T00:00:00Z").toISOString().slice(0, 10)`.
  - `lastDrinkAt` must match `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/` and give a finite `Date.parse`.
  - Check unknown keys first, then the fields in the order date, totalMl, goalMl, lastDrinkAt, tz.
  - Use `Number.isFinite` and `typeof === "number"`.

- [ ] **Step 5: Run** `npx vitest run test/worker/validate.test.ts`. Expected: all PASS.

- [ ] **Step 6: Commit** `feat: scaffold worker project and intake validation`

---

### Task 2: Worker API — auth, intake, today, routing

**Files:**
- Create: `src/worker/auth.ts`, `src/worker/respond.ts`, `src/worker/intake.ts`, `src/worker/today.ts`, `src/worker/index.ts`
- Test: `test/worker/api.test.ts`

**Interfaces:**
- Consumes: `validateIntake`, `IntakePayload`, `Snapshot` and `Env` from Task 1.
- Produces:
  - `isAuthorized(request: Request, expected: string): Promise<boolean>` in `auth.ts`
  - `json(body: object, status?: number): Response` in `respond.ts`, which always sets `Content-Type: application/json` and `Cache-Control: no-store`
  - `handleIntake(request: Request, env: Env, now?: Date): Promise<Response>`
  - `handleToday(request: Request, env: Env): Promise<Response>`
  - The default export `{ fetch }`
  - HTTP contract:
    - `POST /api/intake` gives `200 {ok:true}`
    - `GET /api/today` gives `200 {ok:true, data: Snapshot | null}`

- [ ] **Step 1: Write failing tests** in `test/worker/api.test.ts`, using `SELF.fetch("https://x/api/...")` and `env.HIDRATELENS` from `cloudflare:test`.
  - `intake without token → 401 {ok:false,error:"unauthorized"}`; same for a wrong token, and for using the READ token on intake
  - `today with WRITE token → 401` (the tokens are not interchangeable)
  - `intake valid → 200 {ok:true}`. Afterwards, KV `latest` and `day:2026-10-16` both parse to the payload plus a `syncedAt` ISO string
  - `intake invalid JSON body "{" → 400 {ok:false,error:"invalid JSON"}` and KV `latest` stays null (Review Focus 1)
  - `intake invalid field → 400 "goalMl invalid"`, nothing stored
  - `intake body of 2049 bytes → 413 "payload too large"`
  - `today before any intake → 200 {ok:true,data:null}`
  - `today after intake → 200` with `data` equal to the stored snapshot, and `Cache-Control: no-store`
  - `GET /api/intake → 405`, `GET /api/unknown → 404 {ok:false,error:"not found"}`

- [ ] **Step 2: Run** `npx vitest run test/worker/api.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `isAuthorized`:
    - Read `Authorization: Bearer <token>`.
    - SHA-256 both the given and the expected value with `crypto.subtle.digest`, then compare with `crypto.subtle.timingSafeEqual`. Hashing makes the two inputs the same length.
    - Return false when the header is missing.
  - `handleIntake`:
    - Order of checks: auth → read `request.text()` → if longer than 2048 bytes, 413 → `JSON.parse` (on throw, 400 `invalid JSON`) → `validateIntake` → build the snapshot with `syncedAt: now.toISOString()`.
    - Write it to `latest` and to `day:<date>` (with `expirationTtl: 2592000`) using `Promise.all`.
    - If the KV write throws: `console.error` the error and return 500 `storage error`.
  - `index.ts`: route by method + pathname. Anything that isn't `/api/*` goes to `env.ASSETS.fetch(request)`.

- [ ] **Step 4: Run** `npx vitest run`. Expected: all PASS (Task 1 + Task 2).

- [ ] **Step 5: Commit** `feat: add intake and today API with token auth`

---

### Task 3: Display logic (pure functions)

**Files:**
- Create: `public/lib/display.js` (ES module with JSDoc types)
- Test: `test/display.test.ts`

**Interfaces:**
- Produces, all exported from `public/lib/display.js`:
  - `ringFraction(totalMl: number, goalMl: number): number`, in the range 0 to 1
  - `isGoalMet(totalMl, goalMl): boolean`
  - `formatAmount(ml: number, unit: "oz" | "ml"): string`, a rounded number as a string
  - `totalsText(totalMl, goalMl, unit): string`, giving `"48 / 80 oz"` or `"1420 / 2366 mL"`
  - `lastSipText(lastDrinkAt: string | null, now: Date): string`
  - `localDateString(now: Date): string`, giving `YYYY-MM-DD` in local time
  - `viewModel(snapshot: Snapshot | null, now: Date, unit): { fraction: number; goalMet: boolean; totals: string; lastSip: string; staleText: string | null }`

- [ ] **Step 1: Write failing tests** in `test/display.test.ts`, using a fixed `now`.
  - `ringFraction(1183, 2366) === 0.5`; `ringFraction(2600, 2366) === 1`; `ringFraction(0, 2366) === 0`
  - `totalsText(1420, 2366, "oz") === "48 / 80 oz"`; `totalsText(1420, 2366, "ml") === "1420 / 2366 mL"`
  - Over goal (Review Focus 3): `totalsText(2600, 2366, "oz") === "88 / 80 oz"` and `isGoalMet(2600, 2366) === true`
  - `isGoalMet(2366, 2366) === true`; `isGoalMet(2365, 2366) === false`
  - `lastSipText`:
    - `null` gives `"No water yet today"`
    - 30 s ago gives `"Last sip just now"`
    - 23 min ago gives `"Last sip 23 min ago"`
    - 59 min ago gives `"Last sip 59 min ago"`
    - 61 min ago gives `"Last sip 1 hr ago"`
    - 3 h 10 min ago gives `"Last sip 3 hr ago"`
  - Future timestamp (Review Focus 4): `lastDrinkAt` 5 min after `now` gives `"Last sip just now"`
  - `viewModel(null, now, "oz")`: fraction 0, totals `"0 / 0 oz"`, lastSip `"No sync yet today"`, staleText null
  - `viewModel` with the snapshot's `date` ≠ `localDateString(now)`: fraction 0, totals `"0 / <goal> oz"`, lastSip `"No sync yet today"`
  - `viewModel` with `syncedAt` 2 h 1 min old: staleText starts with `"Not synced since "`. At exactly 2 h old, staleText is null.

- [ ] **Step 2: Run** `npx vitest run test/display.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `display.js`.**
  - In `lastSipText`, clamp the elapsed time with `Math.max(0, now - t)`.
  - Use minutes under 60 and floored hours from 60 up.
  - For staleText, format the time with `toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })`.

- [ ] **Step 4: Run** `npx vitest run`. Expected: all PASS.

- [ ] **Step 5: Commit** `feat: add display view-model logic`

---

### Task 4: Glasses Web App UI + e2e smoke

**Files:**
- Create: `public/index.html`, `public/style.css`, `public/app.js`
- Create: `playwright.config.ts`, `test/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `viewModel` and `localDateString` from `public/lib/display.js`, and `GET /api/today` from Task 2.
- Produces DOM ids that the e2e test relies on:
  - `#ring` (an SVG circle whose `stroke-dashoffset` reflects the fraction)
  - `#totals`, `#last-sip`, `#stale`, `#offline`, `#setup`
  - `body.goal-met` when the goal is reached

- [ ] **Step 1: Write failing e2e tests** in `test/e2e/smoke.spec.ts`.
  - Run against `wrangler dev` on port 8787 (`playwright.config.ts` `webServer`), with `page.route("**/api/today", ...)` for the mocks.
  - `renders totals and last sip`: mock the data `{date: today, totalMl: 1420, goalMl: 2366, lastDrinkAt: now - 23 min, syncedAt: now}`, then open `/?key=abc`. Expect:
    - `#totals` has the text `48 / 80 oz`
    - `#last-sip` has the text `Last sip 23 min ago`
    - the URL no longer contains `key=`
  - `goal met turns ring green`: with `totalMl: 2600`, expect `body` to have the class `goal-met`.
  - `no key shows setup` (Review Focus 5): open `/` with clean storage. Expect `#setup` to be visible with the text `Open your setup link`, and the `/api/today` route to be called 0 times.
  - `401 clears key and shows setup`: mock a 401. After loading `/?key=bad`, expect `#setup` to be visible and `localStorage.hidratelens.key` to be null.

- [ ] **Step 2: Run** `npx playwright install chromium && npm run test:e2e`. Expected: FAIL.

- [ ] **Step 3: Implement the UI.**
  - **Styling:**
    - Black background; text `#e8f6ff`; accent `#33d1ff`; goal-met colour `#4be38a`; dim `#6b7d88`.
    - System sans-serif font, with the totals at about 2.4rem.
    - Centred layout for a 600×600 viewport.
  - **Startup** (`app.js`):
    1. Read `?key` and `?unit`, save them to `localStorage` under `hidratelens.key` and `hidratelens.unit`, and remove them with `history.replaceState`.
    2. If there's no key, show `#setup` and stop.
  - **Running:**
    - `refresh()` fetches `/api/today` with the Bearer header. On a 401 it clears the key and shows setup; on a network error it shows `#offline` and keeps the last render.
    - Re-render from `viewModel(lastSnapshot, new Date(), unit)` every 60 000 ms and on `visibilitychange` to visible.

- [ ] **Step 4: Run** `npm run test:e2e && npx vitest run`. Expected: all PASS.

- [ ] **Step 5: Commit** `feat: add glasses web app UI`

---

### Task 5: Docs, license, deploy check

**Files:**
- Create: `README.md`, `docs/shortcut-setup.md`, `LICENSE` (MIT, copyright 2026 the repo owner)

**Interfaces:**
- Consumes: the API contract (Task 2) and the setup-link format `/?key=<READ_TOKEN>` (Task 4).

- [ ] **Step 1: Write `README.md`.**
  - What it is, with an architecture diagram copied from the spec.
  - Prerequisites: Cloudflare account, Node 20+, iPhone with HidrateSpark syncing to Apple Health, Ray-Ban Display with developer preview access.
  - Deploy steps:
    1. `npx wrangler kv namespace create HIDRATELENS`, then paste the id into `wrangler.jsonc`
    2. Generate tokens with `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`
    3. `wrangler secret put WRITE_TOKEN` and `wrangler secret put READ_TOKEN`
    4. `npm run deploy`
  - Opening `https://<worker>/?key=<READ_TOKEN>` on the glasses.
  - Testing commands, and a short limitations section: syncs only while the phone is unlocked, and the preview can only be shared with your own org.

- [ ] **Step 2: Write `docs/shortcut-setup.md`.**
  - The exact Shortcut actions from the spec's "iOS Shortcut" section. The JSON body fields use the **Number** type for `totalMl` and `goalMl` (Review Focus 2).
  - `lastDrinkAt` uses Format Date → ISO 8601 with time.
  - `date` uses the custom format `yyyy-MM-dd`.
  - The `Authorization` header value is `Bearer <WRITE_TOKEN>`.
  - Automations: "When HidrateSpark is closed", plus 9:00, 12:00, 15:00, 18:00 and 21:00, all with "Run Immediately".
  - Leave `<!-- screenshot -->` markers where images go.

- [ ] **Step 3: Verify.**
  - Run `npx vitest run && npm run test:e2e && npx wrangler deploy --dry-run`.
  - Expected: all tests PASS, and the dry run prints the bundle size with no errors.

- [ ] **Step 4: Commit** `docs: add README, Shortcut setup guide, and MIT license`
