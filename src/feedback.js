import { descriptors as defDesc, countries as defCountries } from './data.js';

export const COLUMNS = ['colour', 'origin', 'top', 'parents', 'climate', 'ripening', 'flavour', 'area', 'trend'];
export const CLIMATE_ORDER = ['cool', 'temperate', 'warm', 'hot'];
export const RIPENING_ORDER = ['early', 'mid', 'late'];

const cell = (key, status, extra) => ({ key, status, arrow: null, ...extra });
const known = (v) => v !== null && v !== undefined;

function ordered(order, a, b) {
  const i = order.indexOf(a), j = order.indexOf(b);
  if (i < 0 || j < 0) return 'grey';
  const d = Math.abs(i - j);
  return d === 0 ? 'green' : d === 1 ? 'yellow' : 'red';
}

/** Parentage: parents is null/[] (unknown) or an array of grape ids. */
export function parentage(guess, answer) {
  const gp = guess.parents, ap = answer.parents;
  if (guess.id === answer.id) return 'green';
  if (!gp || !ap || !gp.length || !ap.length) return 'grey';
  const same = gp.length === ap.length && gp.every((p) => ap.includes(p));
  if (same) return 'green';
  if (gp.some((p) => ap.includes(p))) return 'yellow';
  if (gp.includes(answer.id) || ap.includes(guess.id)) return 'yellow';
  return 'red';
}

export function flavour(guess, answer, desc = defDesc) {
  const gf = guess.flavours, af = answer.flavours;
  if (!gf || !af || !gf.length || !af.length) return { status: 'grey', shared: [] };
  const shared = gf.filter((d) => af.includes(d));
  const clusters = (list) => new Set(list.map((d) => desc[d] && desc[d].cluster).filter(Boolean));
  const ac = clusters(af);
  const sharedClusters = [...clusters(gf)].filter((c) => ac.has(c)).length;
  let status = 'red';
  if (shared.length >= 2) status = 'green';
  else if (shared.length === 1 || sharedClusters >= 2) status = 'yellow';
  return { status, shared };
}

/** Planted area: green within 10 %, yellow within 50 % of the answer (inclusive, integer maths). */
export function area(guessHa, answerHa) {
  if (!(guessHa > 0) || !(answerHa > 0)) return { status: 'grey', arrow: null };
  const diff = Math.abs(guessHa - answerHa);
  let status;
  if (diff * 10 <= answerHa) status = 'green';
  else if (diff * 2 <= answerHa) status = 'yellow';
  else status = 'red';
  const arrow = guessHa < answerHa ? 'up' : guessHa > answerHa ? 'down' : null;
  return { status: status, arrow: status === 'green' ? null : arrow };
}

export const TREND_CLASSES = ['strongly-shrinking', 'shrinking', 'stable', 'growing', 'strongly-growing'];

/** Area change 2010-2023 in %. Edges: -20 is strongly shrinking, -5 shrinking, +5 stable, +30 strongly growing. */
export function trendClass(pct) {
  if (!known(pct) || typeof pct !== 'number' || Number.isNaN(pct)) return -1;
  if (pct <= -20) return 0;
  if (pct <= -5) return 1;
  if (pct <= 5) return 2;
  if (pct < 30) return 3;
  return 4;
}

export function trend(guessPct, answerPct) {
  const i = trendClass(guessPct), j = trendClass(answerPct);
  if (i < 0 || j < 0) return 'grey';
  const d = Math.abs(i - j);
  return d === 0 ? 'green' : d === 1 ? 'yellow' : 'red';
}

/**
 * Compare a guess with the answer. Returns nine cells, in COLUMNS order:
 * { key, status: green|yellow|red|grey, arrow: up|down|null, ... }.
 * ctx = { descriptors, countries } can be injected for tests.
 */
export function compare(guess, answer, ctx = {}) {
  const desc = ctx.descriptors || defDesc;
  const ctry = ctx.countries || defCountries;
  const same = guess.id === answer.id;
  const out = [];

  out.push(cell('colour', guess.colour === answer.colour ? 'green' : 'red'));

  let o;
  if (!guess.origin || !answer.origin) o = 'grey';
  else if (guess.origin === answer.origin) o = 'green';
  else {
    const b = (ctry[guess.origin] && ctry[guess.origin].borders) || [];
    o = b.includes(answer.origin) ? 'yellow' : 'red';
  }
  out.push(cell('origin', o));

  const gt = guess.topCountries || [], at = answer.topCountries || [];
  let t;
  if (!gt.length || !at.length) t = 'grey';
  else if (gt[0] === at[0]) t = 'green';
  else if (at.slice(0, 3).includes(gt[0])) t = 'yellow';
  else t = 'red';
  out.push(cell('top', t));

  out.push(cell('parents', parentage(guess, answer)));
  out.push(cell('climate', ordered(CLIMATE_ORDER, guess.climate, answer.climate)));
  out.push(cell('ripening', ordered(RIPENING_ORDER, guess.ripening, answer.ripening)));

  const f = flavour(guess, answer, desc);
  out.push(cell('flavour', f.status, { shared: f.shared }));

  const a = area(guess.areaHa, answer.areaHa);
  out.push(cell('area', a.status, { arrow: a.arrow }));

  out.push(cell('trend', trend(guess.trendPct, answer.trendPct)));

  if (same) for (const c of out) { c.status = 'green'; c.arrow = null; }
  return out;
}

export const STATUS_EMOJI = { green: '🟩', yellow: '🟨', red: '🟥', grey: '⬜' };
export const STATUS_SYMBOL = { green: '✓', yellow: '~', red: '✗', grey: '?' };
