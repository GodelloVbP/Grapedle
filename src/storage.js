export const KEY = 'gd:v2';

function fresh() {
  return { v: 2, lang: null, seenHelp: false, guesses: {}, hints: {}, history: {} };
}

/**
 * Persistent state. Every storage access is wrapped; without storage the game keeps
 * working with in-memory state.
 */
export function createStore() {
  let state = fresh();
  let ok = true;
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.v === 2 && typeof p === 'object') state = { ...fresh(), ...p };
    }
  } catch (e) { ok = false; }

  function save() {
    // keep the guess log small: only the 40 most recent puzzles
    const keys = Object.keys(state.guesses).map(Number).sort((a, b) => b - a);
    for (const k of keys.slice(40)) { delete state.guesses[k]; if (state.hints) delete state.hints[k]; }
    try { globalThis.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { ok = false; }
  }
  function reset() {
    state = fresh();
    try { globalThis.localStorage.removeItem(KEY); } catch (e) { ok = false; }
  }
  return {
    get state() { return state; },
    get persistent() { return ok; },
    save, reset,
  };
}

/** history: { [puzzle]: tries (1..6) or 0 for a loss }. */
export function computeStats(history, today) {
  const nums = Object.keys(history).map(Number).sort((a, b) => a - b);
  const dist = [0, 0, 0, 0, 0, 0];
  let wins = 0, best = 0, run = 0, prev = null;
  for (const n of nums) {
    const t = history[n];
    if (t > 0) {
      wins++;
      dist[Math.min(t, 6) - 1]++;
      run = prev !== null && n === prev + 1 && history[prev] > 0 ? run + 1 : 1;
      if (run > best) best = run;
    } else run = 0;
    prev = n;
  }
  // current streak: consecutive wins ending today or yesterday
  let current = 0;
  let n = history[today] !== undefined ? today : today - 1;
  while (history[n] > 0) { current++; n--; }
  return { played: nums.length, wins, winPct: nums.length ? Math.round((wins / nums.length) * 100) : 0, current, best, dist };
}
