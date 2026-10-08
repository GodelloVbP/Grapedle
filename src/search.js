import { index } from './data.js';
import { norm } from './text.js';

/** Match kind of one entry for a normalised query: lower is better, 99 = no match. */
function kindOf(e, q) {
  if (e.name === q || e.syn.some((s) => s.key === q)) return 0;
  if (e.name.startsWith(q)) return 1;
  if (e.syn.some((x) => x.key.startsWith(q))) return 2;
  if (e.name.split(' ').some((w) => w.startsWith(q))) return 3;
  if (e.name.includes(q) || e.syn.some((x) => x.key.includes(q))) return 4;
  return 99;
}

/**
 * Autocomplete over name + synonyms. Returns up to `limit` { grape, via, exact } ordered by:
 * (1) exact match on display name or synonym, (2) answer-pool grapes before the rest, (3) display
 * name prefix, (4) synonym prefix, (5) substring. A non-pool grape without flavour data never takes
 * the top slot while a pool grape also matches. `via` is the matching synonym (null if the display
 * name matched).
 */
export function search(query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const hits = [];
  for (const e of index) {
    const kind = kindOf(e, q);
    if (kind === 99) continue;
    const syn = (fn) => { const x = e.syn.find(fn); return x ? x.raw : null; };
    let via = null;
    if (kind === 0) via = e.name === q ? null : syn((x) => x.key === q);
    else if (kind === 2) via = syn((x) => x.key.startsWith(q));
    else if (kind === 4 && !e.name.includes(q)) via = syn((x) => x.key.includes(q));
    hits.push({ grape: e.g, via, kind, exact: kind === 0, pool: !!e.g.answer, thin: !e.g.answer && !(e.g.flavours && e.g.flavours.length) });
  }
  const anyPool = hits.some((h) => h.pool);
  const rank = (h) => [anyPool && h.thin ? 1 : 0, h.exact ? 0 : 1, h.pool ? 0 : 1, h.kind];
  hits.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return b.grape.areaHa - a.grape.areaHa;
  });
  return hits.slice(0, limit).map(({ grape, via, exact }) => ({ grape, via, exact }));
}

/** Exact match on name or synonym (for typed text without picking from the list). Pool grapes win a tie. */
export function exact(query) {
  const q = norm(query);
  if (!q) return null;
  const hits = index.filter((e) => e.name === q || e.syn.some((s) => s.key === q));
  if (!hits.length) return null;
  return (hits.find((e) => e.name === q && e.g.answer) || hits.find((e) => e.g.answer) || hits.find((e) => e.name === q) || hits[0]).g;
}
