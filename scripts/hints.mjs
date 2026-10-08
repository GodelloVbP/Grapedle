// Hint validator (JS twin of check_hints in build_data.py; the build runs the Python one, tests run this).
import { norm } from '../src/text.js';

/** Terms of 4+ letters conflict as substrings (spaces and punctuation ignored); shorter terms only as whole words. */
export function hintConflicts(hint, terms) {
  const h = norm(hint), hc = h.replace(/ /g, '');
  const bad = [];
  for (const [label, text] of terms) {
    const t = norm(text);
    if (!t) continue;
    const tc = t.replace(/ /g, '');
    if (tc.length >= 4 ? hc.includes(tc) : new RegExp('(^| )' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)').test(h)) bad.push([label, text]);
  }
  return bad;
}

/** Failure messages for the answer pool in `grapes` (empty = all hints fine). */
export function checkHints(grapes) {
  const pool = grapes.filter((g) => g.answer);
  const fails = [];
  for (const g of pool) {
    if (!g.hint) { fails.push(`${g.id}: no hint`); continue; }
    const terms = [['name', g.name], ['official', g.official], ...g.synonyms.map((s) => ['synonym', s]),
      ...pool.filter((o) => o.id !== g.id).map((o) => ['other grape', o.name])];
    for (const lang of ['nl', 'en']) {
      for (const [label, text] of hintConflicts(g.hint[lang], terms)) fails.push(`${g.id}: hint_${lang} '${g.hint[lang]}' contains ${label} '${text}'`);
    }
  }
  return fails;
}
