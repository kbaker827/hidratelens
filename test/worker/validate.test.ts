import { describe, expect, it } from "vitest";
import { validateIntake } from "../../src/worker/validate";

const valid = {
  date: "2026-10-16",
  totalMl: 1420,
  goalMl: 2366,
  lastDrinkAt: "2026-10-16T14:07:00-04:00",
  tz: "America/New_York",
};

const errorFor = (patch: Record<string, unknown>) => {
  const result = validateIntake({ ...valid, ...patch });
  return result.ok ? null : result.error;
};

describe("validateIntake", () => {
  it("accepts a valid payload", () => {
    const result = validateIntake(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(valid);
  });

  it("accepts lastDrinkAt null", () => {
    expect(errorFor({ lastDrinkAt: null })).toBeNull();
  });

  it("accepts lastDrinkAt with Z suffix", () => {
    expect(errorFor({ lastDrinkAt: "2026-10-16T18:07:00Z" })).toBeNull();
  });

  it("rejects non-object", () => {
    for (const input of [null, [], "x"]) {
      const result = validateIntake(input);
      expect(result.ok ? null : result.error).toBe("body invalid");
    }
  });

  it("rejects bad date", () => {
    for (const date of ["2026-02-30", "10/16/2026", 20261016]) {
      expect(errorFor({ date })).toBe("date invalid");
    }
  });

  it("rejects totalMl as string", () => {
    expect(errorFor({ totalMl: "1420" })).toBe("totalMl invalid");
  });

  it("rejects totalMl out of range", () => {
    expect(errorFor({ totalMl: -1 })).toBe("totalMl invalid");
    expect(errorFor({ totalMl: 20001 })).toBe("totalMl invalid");
    expect(errorFor({ totalMl: 0 })).toBeNull();
    expect(errorFor({ totalMl: 20000 })).toBeNull();
  });

  it("rejects goalMl out of range", () => {
    expect(errorFor({ goalMl: 0 })).toBe("goalMl invalid");
    expect(errorFor({ goalMl: 20001 })).toBe("goalMl invalid");
  });

  it("rejects non-ISO lastDrinkAt", () => {
    expect(errorFor({ lastDrinkAt: "yesterday" })).toBe("lastDrinkAt invalid");
    expect(errorFor({ lastDrinkAt: "2026-10-16" })).toBe("lastDrinkAt invalid");
  });

  it("rejects tz empty or over 64 chars", () => {
    expect(errorFor({ tz: "" })).toBe("tz invalid");
    expect(errorFor({ tz: "x".repeat(65) })).toBe("tz invalid");
  });

  it("rejects unknown fields", () => {
    expect(errorFor({ foo: 1 })).toBe("foo invalid");
  });

  it("rejects NaN/Infinity totals", () => {
    expect(errorFor({ totalMl: Number.NaN })).toBe("totalMl invalid");
    expect(errorFor({ totalMl: Number.POSITIVE_INFINITY })).toBe("totalMl invalid");
  });
});
