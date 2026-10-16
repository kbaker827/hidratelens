# SparkLens — Design Spec

**Date:** 2026-10-16
**Status:** Draft, awaiting review

## Goal

Show today's water intake from a HidrateSpark smart bottle on Meta Ray-Ban Display glasses: total vs. daily goal, a progress ring, and time since the last drink.

**Audience:** a single user (the repo owner). The repo is public so others can fork it and deploy their own copy; there is no multi-user support.

**Success criteria**

- After drinking and opening/closing the HidrateSpark app, the glasses show the updated total within ~2 minutes.
- The glasses display is readable at a glance: one ring, one number pair, one line of text.
- Everything can be built and deployed from Windows (no Mac/Xcode).
- A forker can deploy their own copy by following the README in under 30 minutes.

## Constraints and known facts

- **HidrateSpark has no public API.** The HidrateSpark iOS app writes every sip to Apple Health as *Dietary Water*. Apple Health is the only supported data source used here.
- **The daily goal is not in Apple Health.** The user enters the goal once in the Shortcut.
- **iOS Shortcuts cannot read Health data while the phone is locked.** Syncs only happen when the phone is unlocked.
- **Meta Ray-Ban Display Web Apps** (developer preview, May 2026) run standalone HTML/CSS/JS on the glasses with no phone app needed. Preview builds can only be shared with testers in the developer's own org; public publishing is limited to partners. That is fine for personal use.
- **Display:** additive optics. Black pixels look transparent, so the UI uses a black background with bright, high-contrast foreground.

## Architecture

```
HidrateSpark bottle ──BLE──> HidrateSpark iOS app ──> Apple Health (Dietary Water)
                                                          │
                              iOS Shortcut "Sync Hydration" (reads + sums today)
                                                          │  POST /api/intake (WRITE_TOKEN)
                                                          ▼
                                     Cloudflare Worker ──> KV (SPARKLENS)
                                       │   serves static Web App + GET /api/today
                                       ▼  (READ_TOKEN)
                              Ray-Ban Display Web App (polls every 60 s)
```

### Components

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `shortcuts/` docs | Step-by-step build of the "Sync Hydration" Shortcut and its automations | Apple Health, Worker URL, WRITE_TOKEN |
| `src/worker/index.ts` | Routing: `/api/*` to handlers, everything else to static assets | handlers |
| `src/worker/intake.ts` | Validate and store a snapshot | `validate.ts`, KV |
| `src/worker/today.ts` | Return the latest snapshot | KV |
| `src/worker/auth.ts` | Constant-time bearer token check | Worker secrets |
| `src/worker/validate.ts` | Pure validation of the intake payload | — |
| `public/index.html`, `public/app.js`, `public/style.css` | Glasses UI: fetch, render, poll | `/api/today` |
| `public/lib/display.js` | Pure functions: ring fraction, unit conversion, "time since" text, staleness | — |

## Data contract

### `POST /api/intake`

Header: `Authorization: Bearer <WRITE_TOKEN>`

```json
{
  "date": "2026-10-16",
  "totalMl": 1420,
  "goalMl": 2366,
  "lastDrinkAt": "2026-10-16T14:07:00-04:00",
  "tz": "America/New_York"
}
```

Validation:
- `date`: `YYYY-MM-DD`, a real calendar date.
- `totalMl`: number, 0 ≤ x ≤ 20000.
- `goalMl`: number, 1 ≤ x ≤ 20000.
- `lastDrinkAt`: ISO-8601 datetime string, or `null` when there is no intake today.
- `tz`: non-empty string, max 64 characters.
- Body max 2 KB, no other fields allowed.

The Worker adds `syncedAt` (server time, ISO-8601) and writes the snapshot to KV keys `latest` and `day:<date>`. `day:*` keys expire after 30 days. Responses:
- `200 {"ok": true}`
- `400 {"ok": false, "error": "<field> invalid"}`
- `401 {"ok": false, "error": "unauthorized"}`
- `413` when the body is too large

### `GET /api/today`

Header: `Authorization: Bearer <READ_TOKEN>`

- `200 {"ok": true, "data": { ...snapshot, "syncedAt": "..." }}`
- `200 {"ok": true, "data": null}` when nothing has been synced yet
- `401` on a bad token

The response sets `Cache-Control: no-store`.

### Secrets and config

- `WRITE_TOKEN` and `READ_TOKEN` are Worker secrets set with `wrangler secret put`. Both are different random values of at least 32 characters, and the README shows how to generate them.
- KV namespace binding: `SPARKLENS`.
- No secrets in the repo; `.dev.vars.example` documents local dev values.

## Glasses Web App

- **Setup:** the user opens `https://<worker>/?key=<READ_TOKEN>` once. The app saves the key to `localStorage` and removes it from the URL with `history.replaceState`. If there is no key, the app shows "Open your setup link".
- **Layout:**
  - A progress ring in the centre. The fill is `min(total/goal, 1)`. The accent colour is cyan, and it turns green at ≥100%.
  - Inside the ring: **`48 / 80 oz`**.
  - Below the ring: **`Last sip 23 min ago`**, or **`No water yet today`** when `lastDrinkAt` is null.
- **Units:** oz by default (1 oz = 29.5735 mL, rounded to whole oz). `?unit=ml` switches to mL and is saved to `localStorage`.
- **Refresh:** polls every 60 s, plus once when the page becomes visible (`visibilitychange`). The "time since" text updates each minute.
- **Staleness:**
  - If `syncedAt` is more than 2 hours old, show a dim line: **`Not synced since 2:10 PM`**.
  - If the snapshot's `date` is not today's local date, show 0 and **`No sync yet today`**.
- **Offline or errors:** keep showing the last good data with a small "offline" dot. On a 401, clear the saved key and show the setup message.
- No framework and no build step. Plain ES modules, so the same files work in a browser and on the glasses.

## iOS Shortcut ("Sync Hydration")

1. **Find Health Samples:** type Dietary Water, start date is today, sorted by start date, newest first.
2. Sum the quantities in mL to get `totalMl`. The newest sample's start date becomes `lastDrinkAt`.
3. A text action holds `goalMl`, which the user edits once.
4. **Get Contents of URL:** POST JSON to `/api/intake` with the Bearer header.

**Automations:**
- "When HidrateSpark is closed": run immediately, with no confirmation prompt.
- Time-of-day triggers at 9:00, 12:00, 15:00, 18:00 and 21:00 as backups. These only succeed when the phone is unlocked.

`docs/shortcut-setup.md` documents each step. Screenshots are added later by the owner.

## Error handling summary

| Situation | Behaviour |
|-----------|-----------|
| Wrong token | 401, generic message |
| Malformed or out-of-range payload | 400 naming the field, nothing stored |
| KV write failure | 500 `{"ok":false,"error":"storage error"}`, details logged with `console.error` on the server only |
| Phone locked / Shortcut didn't run | App shows the staleness line |
| Glasses offline | Last good data plus an offline dot |
| New day before first sync | App shows 0 and "No sync yet today" |

## Testing

- **Worker:** Vitest with `@cloudflare/vitest-pool-workers`, covering auth (missing/wrong/right token for both endpoints), each validation rule, KV writes for `latest` and `day:*`, the read path when empty and when filled, and the body-size limit.
- **Display logic:** Vitest unit tests for `display.js`, covering ring fraction clamping, oz/mL conversion and rounding, "time since" wording (just now, minutes, hours), the staleness rules and the date-rollover case.
- **E2E:** one Playwright smoke test that serves `public/` with a mocked `/api/today`. It checks that the ring, the totals text and the last-sip text render, and that a 401 shows the setup message.
- Coverage target: 80%+ on `src/worker` and `public/lib`.

## Repo layout

```
sparklens/
├── src/worker/            index.ts, intake.ts, today.ts, auth.ts, validate.ts
├── public/                index.html, app.js, style.css, lib/display.js
├── test/                  worker/*.test.ts, display.test.ts, e2e/smoke.spec.ts
├── docs/                  shortcut-setup.md, superpowers/specs/
├── wrangler.jsonc
├── .dev.vars.example
├── package.json, tsconfig.json, vitest.config.ts
├── README.md
└── LICENSE (MIT)
```

## Out of scope (YAGNI)

History or charts, pace-for-time-of-day, reminders or notifications, multi-user accounts, Android/Health Connect, HidrateSpark's private cloud API, direct Bluetooth to the bottle, Neural Band gestures, and a native iOS app.
