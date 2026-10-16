import { index } from './data.js';
import { norm } from './text.js';

/** On-screen keyboard rows. ' ' is the space key; hyphens and apostrophes normalise to a space anyway. */
export const KEY_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

/**
 * Normalised query as the keyboard sees it: like norm(), but a trailing separator the player typed is
 * kept as one space, so "pinot " asks what may follow the space.
 */
export function keyQuery(raw) {
  const base = norm(raw);
  if (!base) return '';
  return /[^a-z0-9]$/i.test(String(raw).normalize('NFD').replace(/[̀-ͯ]/g, '')) ? base + ' ' : base;
}

/**
 * The characters (a-z or ' ') that can follow the typed text somewhere in a grape name or synonym.
 * Mirrors search(), which matches anywhere in a name or synonym. Returns null when nothing is typed
 * (every key is useful), an empty Set when the text matches nothing.
 */
export function nextKeys(raw) {
  const q = keyQuery(raw);
  if (!q) return null;
  const out = new Set();
  for (const e of index) {
    for (const s of [e.name, ...e.syn.map((x) => x.key)]) {
      let i = s.indexOf(q);
      while (i !== -1) {
        const c = s[i + q.length];
        if (c && /[a-z ]/.test(c)) out.add(c);
        i = s.indexOf(q, i + 1);
      }
    }
  }
  return out;
}
