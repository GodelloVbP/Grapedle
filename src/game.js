import { byId, schedule } from './data.js';
import { compare, shareSymbol } from './feedback.js';
import { answerIdFor } from './schedule.js';

export const MAX_GUESSES = 6;
/** Guesses needed before hint 1 and hint 2 unlock. */
export const HINT_AT = [3, 5];

/** "C _ _ _ _ _ _": first letter, then one underscore per letter. Spaces, slashes and hyphens stay as they are. */
export function letterPattern(name) {
  let first = true;
  return [...String(name)].map((ch) => {
    if (!/\p{L}/u.test(ch)) return ch;
    if (first) { first = false; return ch.toUpperCase(); }
    return '_';
  }).join(' ');
}

/**
 * Game core without DOM. `persist` false (debug ?day=) keeps results out of storage.
 */
export function createGame({ puzzle, store, persist = true, sched = schedule }) {
  const answer = byId.get(answerIdFor(puzzle, sched));
  const saved = persist && store.state.guesses[puzzle];
  let ids = Array.isArray(saved) ? saved.filter((id) => byId.has(id)).slice(0, MAX_GUESSES) : [];
  // a stored game is final once the answer is in or the six guesses are used
  const cut = ids.indexOf(answer.id);
  if (cut >= 0) ids = ids.slice(0, cut + 1);
  const savedHints = persist && store.state.hints && store.state.hints[puzzle];
  const used = Array.isArray(savedHints) ? [...new Set(savedHints.filter((n) => n === 1 || n === 2))].sort() : [];

  const api = {
    puzzle, answer,
    get guesses() { return ids.slice(); },
    get hints() { return used.slice(); },
    get status() {
      if (ids.includes(answer.id)) return 'won';
      return ids.length >= MAX_GUESSES ? 'lost' : 'playing';
    },
    has: (id) => ids.includes(id),
    rows: () => ids.map((id) => ({ grape: byId.get(id), cells: compare(byId.get(id), answer) })),
    /** Hint n (1 or 2) can be opened: enough guesses, not used yet, game still running. */
    hintReady: (n) => api.status === 'playing' && !used.includes(n) && ids.length >= HINT_AT[n - 1],
    useHint(n) {
      if (!api.hintReady(n)) return false;
      used.push(n);
      used.sort();
      if (persist) {
        store.state.hints = store.state.hints || {};
        store.state.hints[puzzle] = used.slice();
        store.save();
      }
      return true;
    },
    guess(id) {
      if (api.status !== 'playing') return null;
      const g = byId.get(id);
      if (!g || ids.includes(id)) return null;
      ids.push(id);
      const row = { grape: g, cells: compare(g, answer) };
      if (persist) {
        store.state.guesses[puzzle] = ids.slice();
        const st = api.status;
        if (st !== 'playing') store.state.history[puzzle] = st === 'won' ? ids.length : 0;
        store.save();
      }
      return row;
    },
  };
  // a game restored from storage may be finished but missing from history (e.g. blocked earlier)
  if (persist && api.status !== 'playing' && store.state.history[puzzle] === undefined) {
    store.state.history[puzzle] = api.status === 'won' ? ids.length : 0;
  }
  return api;
}

/** Share text: head line (with one 💡 per hint used), one emoji line per guess, link. */
export function shareText({ puzzle, rows, won, hints = 0, url = 'vinobypalazzo.nl/grapedle' }) {
  const head = `Grapedle #${puzzle} ${won ? rows.length : 'X'}/${MAX_GUESSES}` + (hints > 0 ? ' ' + '💡'.repeat(hints) : '');
  const lines = rows.map((r) => r.cells.map(shareSymbol).join(''));
  return [head, ...lines, url].join('\n');
}
