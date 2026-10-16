import { describe, expect, it } from "vitest";
import {
  isGoalMet,
  lastSipText,
  localDateString,
  ringFraction,
  totalsText,
  viewModel,
} from "../public/lib/display.js";

const now = new Date(2026, 9, 16, 15, 0, 0);
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  date: localDateString(now),
  totalMl: 1420,
  goalMl: 2366,
  lastDrinkAt: minutesAgo(23),
  tz: "America/New_York",
  syncedAt: minutesAgo(1),
  ...overrides,
});

describe("ringFraction", () => {
  it("is total over goal, clamped to 0..1", () => {
    expect(ringFraction(1183, 2366)).toBe(0.5);
    expect(ringFraction(2600, 2366)).toBe(1);
    expect(ringFraction(0, 2366)).toBe(0);
  });
});

describe("totalsText", () => {
  it("formats oz and mL", () => {
    expect(totalsText(1420, 2366, "oz")).toBe("48 / 80 oz");
    expect(totalsText(1420, 2366, "ml")).toBe("1420 / 2366 mL");
  });

  it("shows the real total when over goal", () => {
    expect(totalsText(2600, 2366, "oz")).toBe("88 / 80 oz");
    expect(isGoalMet(2600, 2366)).toBe(true);
  });
});

describe("isGoalMet", () => {
  it("is true at or above goal", () => {
    expect(isGoalMet(2366, 2366)).toBe(true);
    expect(isGoalMet(2365, 2366)).toBe(false);
  });
});

describe("lastSipText", () => {
  it("handles null", () => {
    expect(lastSipText(null, now)).toBe("No water yet today");
  });

  it("uses just now / minutes / hours", () => {
    expect(lastSipText(new Date(now.getTime() - 30_000).toISOString(), now)).toBe("Last sip just now");
    expect(lastSipText(minutesAgo(23), now)).toBe("Last sip 23 min ago");
    expect(lastSipText(minutesAgo(59), now)).toBe("Last sip 59 min ago");
    expect(lastSipText(minutesAgo(61), now)).toBe("Last sip 1 hr ago");
    expect(lastSipText(minutesAgo(190), now)).toBe("Last sip 3 hr ago");
  });

  it("treats a future timestamp as just now", () => {
    expect(lastSipText(minutesAgo(-5), now)).toBe("Last sip just now");
  });
});

describe("viewModel", () => {
  it("handles no snapshot", () => {
    const vm = viewModel(null, now, "oz");
    expect(vm.fraction).toBe(0);
    expect(vm.totals).toBe("0 / 0 oz");
    expect(vm.lastSip).toBe("No sync yet today");
    expect(vm.staleText).toBeNull();
  });

  it("zeroes a snapshot from another day", () => {
    const vm = viewModel(snapshot({ date: "2026-10-15" }), now, "oz");
    expect(vm.fraction).toBe(0);
    expect(vm.totals).toBe("0 / 80 oz");
    expect(vm.lastSip).toBe("No sync yet today");
  });

  it("renders a fresh snapshot", () => {
    const vm = viewModel(snapshot(), now, "oz");
    expect(vm.fraction).toBeCloseTo(1420 / 2366);
    expect(vm.goalMet).toBe(false);
    expect(vm.totals).toBe("48 / 80 oz");
    expect(vm.lastSip).toBe("Last sip 23 min ago");
    expect(vm.staleText).toBeNull();
  });

  it("flags data older than 2 hours as stale", () => {
    expect(viewModel(snapshot({ syncedAt: minutesAgo(121) }), now, "oz").staleText).toMatch(/^Not synced since /);
    expect(viewModel(snapshot({ syncedAt: minutesAgo(120) }), now, "oz").staleText).toBeNull();
  });

  it("uses the snapshot's time zone to decide today", () => {
    // 1 AM on the 17th in Auckland, but still the 16th from the Americas through Europe.
    const instant = new Date("2026-10-16T12:00:00Z");
    const vm = viewModel(
      snapshot({
        date: "2026-10-17",
        tz: "Pacific/Auckland",
        syncedAt: new Date(instant.getTime() - 60_000).toISOString(),
        lastDrinkAt: null,
      }),
      instant,
      "oz",
    );
    expect(vm.totals).toBe("48 / 80 oz");
  });

  it("falls back to the local date for an unknown time zone", () => {
    expect(viewModel(snapshot({ tz: "Not/AZone" }), now, "oz").totals).toBe("48 / 80 oz");
  });

  it("hides the stale line for a snapshot from another day", () => {
    const vm = viewModel(snapshot({ date: "2026-10-15", syncedAt: minutesAgo(600) }), now, "oz");
    expect(vm.staleText).toBeNull();
    expect(vm.lastSip).toBe("No sync yet today");
  });
});
