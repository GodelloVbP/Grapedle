import { byId, schedule } from './data.js';
import { compare } from './feedback.js';
import { answerIdFor } from './schedule.js';

export const MAX_GUESSES = 6;

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

  const api = {
    puzzle, answer,
    get guesses() { return ids.slice(); },
    get status() {
      if (ids.includes(answer.id)) return 'won';
      return ids.length >= MAX_GUESSES ? 'lost' : 'playing';
    },
    has: (id) => ids.includes(id),
    rows: () => ids.map((id) => ({ grape: byId.get(id), cells: compare(byId.get(id), answer) })),
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

export function shareText({ puzzle, rows, won, url = 'vinobypalazzo.nl/grapedle' }) {
  const sym = { green: '🟩', yellow: '🟨', red: '🟥', grey: '⬜' };
  const head = `Grapedle #${puzzle} ${won ? rows.length : 'X'}/${MAX_GUESSES}`;
  const lines = rows.map((r) => r.cells.map((c) => sym[c.status]).join(''));
  return [head, ...lines, url].join('\n');
}
