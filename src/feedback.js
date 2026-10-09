import { descriptors as defDesc, countries as defCountries } from './data.js';

export const COLUMNS = ['colour', 'region', 'body', 'area', 'flavour', 'style'];

/** Eight compass arrows, clockwise from north. */
export const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

const cell = (key, status, extra) => ({ key, status, arrow: null, ...extra });
const rad = (d) => (d * Math.PI) / 180;

/** Signature regions of a grape: 1 or 2 entries { name, country, lat, lon }. */
export const regionsOf = (g) => (g && g.regions) || [];

/** Identity of a named region (the same name in another country is another region). */
export const regionKey = (r) => (r.name ? `${r.country}|${r.name}` : null);

/** [lat, lon] of a region point; falls back to its country point. */
export function pointOf(r, ctry = defCountries) {
  if (r.lat !== null && r.lat !== undefined && r.lon !== null && r.lon !== undefined) return [r.lat, r.lon];
  const c = ctry[r.country];
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

/** Names of the guess's regions that are also an answer region (guess order). */
export function sharedRegions(guess, answer) {
  const ak = new Set(regionsOf(answer).map(regionKey).filter(Boolean));
  return regionsOf(guess).filter((r) => ak.has(regionKey(r))).map((r) => r.name);
}

/**
 * Region column over the sets of signature regions.
 * Green: identical sets. Yellow: at least one region in common ('overlap', no distance) or, failing
 * that, a shared country. Red otherwise. Country-yellow and red carry km + 8-way arrow for the closest
 * pair of points (guess to answer).
 */
export function region(guess, answer, ctry = defCountries) {
  const r = regionBase(guess, answer, ctry);
  return { ...r, parts: regionParts(guess, answer, ctry) };
}

/**
 * One entry per region of the guess, in guess order: { name, hit: true } when the answer has that region,
 * otherwise { name, hit: false, km, dir } towards the nearest answer region. Drives the UI so each region
 * reads as its own line ("Rhône 550 km →", "Barossa 15.700 km ↘").
 */
export function regionParts(guess, answer, ctry = defCountries) {
  const G = regionsOf(guess), A = regionsOf(answer);
  const ak = new Set(A.map(regionKey).filter(Boolean));
  return G.map((x) => {
    const name = x.name || null;
    if (x.name && ak.has(regionKey(x))) return { name, country: x.country, hit: true, km: null, dir: null };
    let best = null;
    const p = pointOf(x, ctry);
    if (p) for (const y of A) {
      const q = pointOf(y, ctry);
      if (!q) continue;
      const d = distanceKm(p, q);
      if (!best || d < best.d) best = { d, q };
    }
    return { name, country: x.country, hit: false, km: best ? roundKm(best.d) : null, dir: best ? directionIndex(bearingDeg(p, best.q)) : null };
  });
}

function regionBase(guess, answer, ctry) {
  const G = regionsOf(guess), A = regionsOf(answer);
  const gk = new Set(G.map(regionKey).filter(Boolean)), ak = new Set(A.map(regionKey).filter(Boolean));
  if (gk.size && gk.size === ak.size && [...gk].every((k) => ak.has(k))) return { status: 'green', km: null, dir: null, hit: [] };
  if (!G.length || !A.length || !G[0].country || !A[0].country) return { status: 'grey', km: null, dir: null, hit: [] };
  const hit = sharedRegions(guess, answer);
  if (hit.length) return { status: 'yellow', km: null, dir: null, hit };
  const aCountries = new Set(A.map((r) => r.country));
  const status = G.some((r) => aCountries.has(r.country)) ? 'yellow' : 'red';
  let best = null;
  for (const x of G) for (const y of A) {
    const p = pointOf(x, ctry), q = pointOf(y, ctry);
    if (!p || !q) continue;
    const d = distanceKm(p, q);
    if (!best || d < best.d) best = { d, p, q };
  }
  if (!best) return { status, km: null, dir: null, hit: [] };
  return { status, km: roundKm(best.d), dir: directionIndex(bearingDeg(best.p, best.q)), hit: [] };
}

/** World area as shown to the player: rounded to 2 significant figures (280000 for 276543). */
export function roundArea(ha) {
  return Number(Number(ha).toPrecision(2));
}

/** "280.000 ha" (nl) or "280,000 ha" (en). Manual grouping, so it does not depend on the runtime's ICU data. */
export function formatArea(ha, lang) {
  const sep = lang === 'en' ? ',' : '.';
  return String(roundArea(ha)).replace(/\B(?=(\d{3})+(?!\d))/g, sep) + ' ha';
}

/**
 * Planted area: the cell shows the GUESS's own world area (rounded to 2 significant figures, `value`) and
 * an arrow pointing to the answer: 'up' when the answer has more, 'down' when it has less, null when the
 * two areas are exactly equal ('='). Yellow when the answer's area is within a factor 2 of the guess's, red otherwise; green only for the same grape (set in compare).
 */
export function area(guessHa, answerHa) {
  if (!(guessHa > 0) || !(answerHa > 0)) return { status: 'grey', arrow: null, value: null };
  const arrow = answerHa > guessHa ? 'up' : answerHa < guessHa ? 'down' : null;
  const ratio = Math.max(guessHa, answerHa) / Math.min(guessHa, answerHa);
  return { status: ratio <= 2 ? 'yellow' : 'red', arrow, value: roundArea(guessHa) };
}

/**
 * Body (1 light .. 5 full): the tile shows the GUESS's body. Green when equal, yellow when one step off, red otherwise, with an
 * arrow towards the answer ('up' = the answer is fuller, 'down' = lighter). Grey when either is unknown.
 */
export function body(guessBody, answerBody) {
  const ok = (b) => Number.isInteger(b) && b >= 1 && b <= 5;
  if (!ok(guessBody) || !ok(answerBody)) return { status: 'grey', arrow: null, value: ok(guessBody) ? guessBody : null };
  if (guessBody === answerBody) return { status: 'green', arrow: null, value: guessBody };
  return { status: Math.abs(answerBody - guessBody) === 1 ? 'yellow' : 'red', arrow: answerBody > guessBody ? 'up' : 'down', value: guessBody };
}

/**
 * Flavour: green >= 2 identical aromas; yellow 1 identical aroma or >= 3 shared aroma families;
 * red otherwise; grey when either grape has no aroma data.
 */
export function flavour(guess, answer, desc = defDesc) {
  const gf = guess.flavours, af = answer.flavours;
  if (!gf || !af || !gf.length || !af.length) return { status: 'grey', shared: [], families: 0, familyHit: [] };
  const shared = gf.filter((d) => af.includes(d));
  const clusters = (list) => new Set(list.map((d) => desc[d] && desc[d].cluster).filter(Boolean));
  const ac = clusters(af);
  const families = [...clusters(gf)].filter((c) => ac.has(c)).length;
  // guess aromas that are not identical but belong to a family the answer also has (yellow outline in the UI)
  const familyHit = gf.filter((d) => !af.includes(d) && desc[d] && ac.has(desc[d].cluster));
  let status = 'red';
  if (shared.length >= 2) status = 'green';
  else if (shared.length === 1 || families >= 3) status = 'yellow';
  return { status, shared, families, familyHit };
}

/**
 * Common style (sparkling, sweet, fortified, rosé, oak-aged, crisp, blend; max 3 per grape). An empty list
 * means a plain dry still wine and counts as the single style 'plain'. Green: identical sets. Yellow: at
 * least one style in common. Red: none. Grey when either grape has no style data (null).
 */
export function style(guess, answer) {
  const set = (l) => (Array.isArray(l) ? (l.length ? l : ['plain']) : null);
  const gs = set(guess.styles), as = set(answer.styles);
  if (!gs || !as) return { status: 'grey', shared: [] };
  const shared = gs.filter((x) => as.includes(x));
  if (gs.length === as.length && shared.length === gs.length) return { status: 'green', shared };
  return { status: shared.length ? 'yellow' : 'red', shared };
}

/**
 * Compare a guess with the answer. Returns six cells in COLUMNS order:
 * { key, status: green|yellow|red|grey|neutral, arrow: up|down|null, value (area), ... }.
 * ctx = { descriptors, countries } can be injected for tests.
 */
export function compare(guess, answer, ctx = {}) {
  const desc = ctx.descriptors || defDesc;
  const ctry = ctx.countries || defCountries;
  const out = [];
  out.push(cell('colour', guess.colour === answer.colour ? 'green' : 'red'));
  const r = region(guess, answer, ctry);
  out.push(cell('region', r.status, { km: r.km, dir: r.dir, hit: r.hit, parts: r.parts }));
  const b = body(guess.body, answer.body);
  out.push(cell('body', b.status, { arrow: b.arrow, value: b.value }));
  const a = area(guess.areaHa, answer.areaHa);
  out.push(cell('area', a.status, { arrow: a.arrow, value: a.value }));
  const f = flavour(guess, answer, desc);
  out.push(cell('flavour', f.status, { shared: f.shared, families: f.families, familyHit: f.familyHit }));
  const sy = style(guess, answer);
  out.push(cell('style', sy.status, { shared: sy.shared }));
  if (guess.id === answer.id) for (const c of out) { c.status = 'green'; c.arrow = null; c.km = null; c.dir = null; if (c.hit) c.hit = []; if (c.parts) c.parts = c.parts.map((x) => ({ ...x, hit: true, km: null, dir: null })); }
  return out;
}

export const STATUS_EMOJI = { green: '🟩', yellow: '🟨', red: '🟥', grey: '⬜', neutral: '⬜' };
export const STATUS_SYMBOL = { green: '✓', yellow: '~', red: '✗', grey: '?', neutral: '' };

/** One share-line symbol per cell. Area: ⬆️ the answer has more, ⬇️ less, ↔️ exactly equal, 🟩 correct. */
export function shareSymbol(c) {
  if (c.key === 'body') return c.status === 'green' ? '🟩' : c.status === 'grey' ? '⬜' : c.arrow === 'up' ? '⬆️' : '⬇️';
  if (c.key === 'area') {
    if (c.status === 'green') return '🟩';
    if (c.arrow === 'up') return '⬆️';
    if (c.arrow === 'down') return '⬇️';
    return c.status === 'grey' ? '⬜' : '↔️';
  }
  return STATUS_EMOJI[c.status];
}
