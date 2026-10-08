import { descriptors as defDesc, countries as defCountries } from './data.js';

export const COLUMNS = ['colour', 'region', 'climate', 'area', 'flavour'];

/** Eight compass arrows, clockwise from north. */
export const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

const cell = (key, status, extra) => ({ key, status, arrow: null, ...extra });
const rad = (d) => (d * Math.PI) / 180;

/** [lat, lon] of a grape's region point; falls back to its country point. */
export function pointOf(g, ctry = defCountries) {
  if (g.lat !== null && g.lat !== undefined && g.lon !== null && g.lon !== undefined) return [g.lat, g.lon];
  const c = ctry[g.country];
  return c ? [c.lat, c.lon] : null;
}

/** Great-circle distance in km (haversine, mean Earth radius). */
export function distanceKm(a, b) {
  const dLat = rad(b[0] - a[0]), dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from a to b in degrees, 0 = north, clockwise, [0, 360). */
export function bearingDeg(a, b) {
  const p1 = rad(a[0]), p2 = rad(b[0]), dl = rad(b[1] - a[1]);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/** Index 0..7 into ARROWS (0 = N, 1 = NE, ...). */
export function directionIndex(deg) {
  return Math.round((((deg % 360) + 360) % 360) / 45) % 8;
}

/** Distance shown to the player: rounded to 50 km, never below 50. */
export const roundKm = (km) => Math.max(50, Math.round(km / 50) * 50);

/** Region column: same region green, same country yellow, else red; yellow and red carry km + direction. */
export function region(guess, answer, ctry = defCountries) {
  const sameRegion = guess.region && answer.region && guess.region === answer.region && guess.country === answer.country;
  if (sameRegion) return { status: 'green', km: null, dir: null };
  if (!guess.country || !answer.country) return { status: 'grey', km: null, dir: null };
  const status = guess.country === answer.country ? 'yellow' : 'red';
  const a = pointOf(guess, ctry), b = pointOf(answer, ctry);
  if (!a || !b) return { status, km: null, dir: null };
  return { status, km: roundKm(distanceKm(a, b)), dir: directionIndex(bearingDeg(a, b)) };
}

/** Climate: three classes derived from the signature region. */
export function climate(guess, answer) {
  if (!guess.climate || !answer.climate) return 'grey';
  return guess.climate === answer.climate ? 'green' : 'red';
}

/**
 * Planted area: neutral arrow only. arrow 'up' = the answer has more, 'down' = less.
 * Green only for the same grape; an exact tie between two grapes is a neutral tile with tie: true.
 */
export function area(guessHa, answerHa) {
  if (!(guessHa > 0) || !(answerHa > 0)) return { status: 'grey', arrow: null, tie: false };
  if (guessHa === answerHa) return { status: 'neutral', arrow: null, tie: true };
  return { status: 'neutral', arrow: guessHa < answerHa ? 'up' : 'down', tie: false };
}

/**
 * Flavour: green >= 2 identical aromas; yellow 1 identical aroma or >= 3 shared aroma families;
 * red otherwise; grey when either grape has no aroma data.
 */
export function flavour(guess, answer, desc = defDesc) {
  const gf = guess.flavours, af = answer.flavours;
  if (!gf || !af || !gf.length || !af.length) return { status: 'grey', shared: [], families: 0 };
  const shared = gf.filter((d) => af.includes(d));
  const clusters = (list) => new Set(list.map((d) => desc[d] && desc[d].cluster).filter(Boolean));
  const ac = clusters(af);
  const families = [...clusters(gf)].filter((c) => ac.has(c)).length;
  let status = 'red';
  if (shared.length >= 2) status = 'green';
  else if (shared.length === 1 || families >= 3) status = 'yellow';
  return { status, shared, families };
}

/**
 * Compare a guess with the answer. Returns five cells in COLUMNS order:
 * { key, status: green|yellow|red|grey|neutral, arrow: up|down|null, ... }.
 * ctx = { descriptors, countries } can be injected for tests.
 */
export function compare(guess, answer, ctx = {}) {
  const desc = ctx.descriptors || defDesc;
  const ctry = ctx.countries || defCountries;
  const out = [];
  out.push(cell('colour', guess.colour === answer.colour ? 'green' : 'red'));
  const r = region(guess, answer, ctry);
  out.push(cell('region', r.status, { km: r.km, dir: r.dir }));
  out.push(cell('climate', climate(guess, answer)));
  const a = area(guess.areaHa, answer.areaHa);
  out.push(cell('area', a.status, { arrow: a.arrow, tie: a.tie }));
  const f = flavour(guess, answer, desc);
  out.push(cell('flavour', f.status, { shared: f.shared, families: f.families }));
  if (guess.id === answer.id) for (const c of out) { c.status = 'green'; c.arrow = null; c.km = null; c.dir = null; c.tie = false; }
  return out;
}

export const STATUS_EMOJI = { green: '🟩', yellow: '🟨', red: '🟥', grey: '⬜', neutral: '⬜' };
export const STATUS_SYMBOL = { green: '✓', yellow: '~', red: '✗', grey: '?', neutral: '' };

/** One share-line symbol per cell. Area: ⬆️ the answer has more, ⬇️ less, 🟩 correct, 🟰 exact tie. */
export function shareSymbol(c) {
  if (c.key === 'area') {
    if (c.status === 'green') return '🟩';
    if (c.arrow === 'up') return '⬆️';
    if (c.arrow === 'down') return '⬇️';
    return c.tie ? '🟰' : '⬜';
  }
  return STATUS_EMOJI[c.status];
}
