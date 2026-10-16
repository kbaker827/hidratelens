import { viewModel } from "./lib/display.js";

const KEY_STORAGE = "hidratelens.key";
const UNIT_STORAGE = "hidratelens.unit";
const POLL_INTERVAL_MS = 60_000;
const RING_CIRCUMFERENCE = 2 * Math.PI * 120;

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

const storage = {
  get: (/** @type {string} */ k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (/** @type {string} */ k, /** @type {string} */ v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  remove: (/** @type {string} */ k) => { try { localStorage.removeItem(k); } catch { /* storage blocked */ } },
};

/** Moves ?key / ?unit from the URL into storage so the token doesn't linger in history. */
function absorbUrlParams() {
  const url = new URL(window.location.href);
  const key = url.searchParams.get("key");
  const unit = url.searchParams.get("unit");
  if (key) storage.set(KEY_STORAGE, key);
  if (unit === "ml" || unit === "oz") storage.set(UNIT_STORAGE, unit);
  if (key || unit) {
    url.searchParams.delete("key");
    url.searchParams.delete("unit");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
}

const state = {
  /** @type {import("./lib/display.js").Snapshot | null} */ snapshot: null,
};

function showSetup() {
  $("display").hidden = true;
  $("setup").hidden = false;
}

function render() {
  const unit = storage.get(UNIT_STORAGE) === "ml" ? "ml" : "oz";
  const vm = viewModel(state.snapshot, new Date(), unit);
  $("ring").style.strokeDasharray = String(RING_CIRCUMFERENCE);
  $("ring").style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - vm.fraction));
  $("totals").textContent = vm.totals;
  $("last-sip").textContent = vm.lastSip;
  $("stale").textContent = vm.staleText ?? "";
  $("stale").hidden = vm.staleText === null;
  document.body.classList.toggle("goal-met", vm.goalMet);
  $("display").hidden = false;
}

async function refresh() {
  const key = storage.get(KEY_STORAGE);
  if (!key) return showSetup();
  try {
    const res = await fetch("/api/today", { headers: { Authorization: `Bearer ${key}` }, cache: "no-store" });
    if (res.status === 401) {
      storage.remove(KEY_STORAGE);
      return showSetup();
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    state.snapshot = body.data;
    $("offline").hidden = true;
  } catch {
    $("offline").hidden = false;
  }
  render();
}

function start() {
  absorbUrlParams();
  if (!storage.get(KEY_STORAGE)) return showSetup();
  refresh();
  setInterval(refresh, POLL_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
}

start();
