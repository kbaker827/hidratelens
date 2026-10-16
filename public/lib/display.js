// Pure view logic for the glasses display. No DOM access here.

/** @typedef {"oz" | "ml"} Unit */
/**
 * @typedef {{ date: string, totalMl: number, goalMl: number,
 *   lastDrinkAt: string | null, tz: string, syncedAt: string }} Snapshot
 */

const ML_PER_OZ = 29.5735;
const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const STALE_AFTER_MS = 2 * 60 * MINUTE_MS;

/** @param {number} totalMl @param {number} goalMl */
export function ringFraction(totalMl, goalMl) {
  if (goalMl <= 0) return 0;
  return Math.min(Math.max(totalMl / goalMl, 0), 1);
}

/** @param {number} totalMl @param {number} goalMl */
export function isGoalMet(totalMl, goalMl) {
  return goalMl > 0 && totalMl >= goalMl;
}

/** @param {number} ml @param {Unit} unit */
export function formatAmount(ml, unit) {
  return String(Math.round(unit === "ml" ? ml : ml / ML_PER_OZ));
}

/** @param {number} totalMl @param {number} goalMl @param {Unit} unit */
export function totalsText(totalMl, goalMl, unit) {
  const label = unit === "ml" ? "mL" : "oz";
  return `${formatAmount(totalMl, unit)} / ${formatAmount(goalMl, unit)} ${label}`;
}

/** @param {string | null} lastDrinkAt @param {Date} now */
export function lastSipText(lastDrinkAt, now) {
  if (lastDrinkAt === null) return "No water yet today";
  const minutes = Math.floor(Math.max(0, now.getTime() - Date.parse(lastDrinkAt)) / MINUTE_MS);
  if (minutes < 1) return "Last sip just now";
  if (minutes < HOUR_MINUTES) return `Last sip ${minutes} min ago`;
  return `Last sip ${Math.floor(minutes / HOUR_MINUTES)} hr ago`;
}

/** @param {Date} now @returns {string} YYYY-MM-DD in local time */
export function localDateString(now) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** @param {string} syncedAt @param {Date} now */
function staleText(syncedAt, now) {
  const synced = new Date(syncedAt);
  if (now.getTime() - synced.getTime() <= STALE_AFTER_MS) return null;
  return `Not synced since ${synced.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * @param {Snapshot | null} snapshot
 * @param {Date} now
 * @param {Unit} unit
 */
export function viewModel(snapshot, now, unit) {
  if (snapshot === null) {
    return { fraction: 0, goalMet: false, totals: totalsText(0, 0, unit), lastSip: "No sync yet today", staleText: null };
  }
  if (snapshot.date !== localDateString(now)) {
    return {
      fraction: 0,
      goalMet: false,
      totals: totalsText(0, snapshot.goalMl, unit),
      lastSip: "No sync yet today",
      staleText: staleText(snapshot.syncedAt, now),
    };
  }
  return {
    fraction: ringFraction(snapshot.totalMl, snapshot.goalMl),
    goalMet: isGoalMet(snapshot.totalMl, snapshot.goalMl),
    totals: totalsText(snapshot.totalMl, snapshot.goalMl, unit),
    lastSip: lastSipText(snapshot.lastDrinkAt, now),
    staleText: staleText(snapshot.syncedAt, now),
  };
}
