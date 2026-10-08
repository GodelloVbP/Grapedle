import { index } from './data.js';
import { norm } from './text.js';

/**
 * Autocomplete over name + synonyms. Returns up to `limit` { grape, via } sorted by relevance:
 * name prefix, synonym prefix, word-prefix in name, substring in name, substring in synonym.
 * `via` is the matching synonym (null if the display name matched).
 */
export function search(query, limit = 8) {
  const q = norm(query);
  if (!q) return [];
  const out = [];
  for (const e of index) {
    let rank = 99, via = null;
    if (e.name.startsWith(q)) rank = 0;
    else {
      const s = e.syn.find((x) => x.key.startsWith(q));
      if (s) { rank = 1; via = s.raw; }
      else if (e.name.split(' ').some((w) => w.startsWith(q))) rank = 2;
      else if (e.name.includes(q)) rank = 3;
      else {
        const s2 = e.syn.find((x) => x.key.includes(q));
        if (s2) { rank = 4; via = s2.raw; }
      }
    }
    if (rank < 99) out.push({ grape: e.g, via, rank });
  }
  out.sort((a, b) => a.rank - b.rank || (b.grape.answer - a.grape.answer) || b.grape.areaHa - a.grape.areaHa);
  return out.slice(0, limit);
}

/** Exact match on name or synonym (for typed text without picking from the list). */
export function exact(query) {
  const q = norm(query);
  if (!q) return null;
  for (const e of index) if (e.name === q) return e.g;
  for (const e of index) if (e.syn.some((s) => s.key === q)) return e.g;
  return null;
}
