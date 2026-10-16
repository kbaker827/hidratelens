import type { IntakePayload } from "./types";

export type ValidationResult =
  | { ok: true; value: IntakePayload }
  | { ok: false; error: string };

const FIELDS = ["date", "totalMl", "goalMl", "lastDrinkAt", "tz"] as const;
const MAX_ML = 20000;
const MAX_TZ_LENGTH = 64;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const fail = (field: string): ValidationResult => ({ ok: false, error: `${field} invalid` });

const isMlInRange = (value: unknown, min: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= MAX_ML;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isIsoDateTimeOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  return typeof value === "string" && DATETIME_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

export function validateIntake(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return fail("body");
  const body = input as Record<string, unknown>;

  const unknownKey = Object.keys(body).find((key) => !(FIELDS as readonly string[]).includes(key));
  if (unknownKey !== undefined) return fail(unknownKey);

  if (!isCalendarDate(body.date)) return fail("date");
  if (!isMlInRange(body.totalMl, 0)) return fail("totalMl");
  if (!isMlInRange(body.goalMl, 1)) return fail("goalMl");
  if (!isIsoDateTimeOrNull(body.lastDrinkAt)) return fail("lastDrinkAt");
  if (typeof body.tz !== "string" || body.tz.length < 1 || body.tz.length > MAX_TZ_LENGTH) return fail("tz");

  return {
    ok: true,
    value: {
      date: body.date,
      totalMl: body.totalMl,
      goalMl: body.goalMl,
      lastDrinkAt: body.lastDrinkAt,
      tz: body.tz,
    },
  };
}
