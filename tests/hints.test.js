import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import grapes from '../data/grapes.json' with { type: 'json' };
import { hintConflicts, checkHints } from '../scripts/hints.mjs';

const pool = grapes.filter((g) => g.answer);

test('every pool hint passes the validator (no name, official name, synonym or other pool grape)', () => {
  assert.deepEqual(checkHints(grapes), []);
  for (const g of pool) {
    assert.ok(g.hint.nl.length > 1 && g.hint.en.length > 1, g.id);
    assert.ok(/^https?:\/\//.test(g.sources.hint), `${g.id} hint source`);
  }
});

test('validator catches names, synonyms and other pool grapes, accent and case insensitive', () => {
  const terms = [['name', 'Merlot'], ['synonym', 'Cot'], ['other grape', 'Müller-Thurgau'], ['synonym', 'Prosecco']];
  assert.deepEqual(hintConflicts('Pomerol', terms), []);
  assert.equal(hintConflicts('Pomerol Merlot', terms).length, 1);
  assert.equal(hintConflicts('MERLOT-blend', terms).length, 1, 'substring of 4+ letters');
  assert.equal(hintConflicts('merlotte', terms).length, 1, 'substring, even inside a longer word');
  assert.equal(hintConflicts('Prosecco DOC', terms).length, 1);
  assert.equal(hintConflicts('Muller Thurgau', terms).length, 1, 'accents and hyphen ignored');
  assert.equal(hintConflicts('Mueller-Thurgau', [['x', 'Müller-Thurgau']]).length, 0, 'ue is not u: write the umlaut name');
  // short terms (< 4 letters) only count as whole words
  assert.equal(hintConflicts('Cot de Nuits', terms).length, 1);
  assert.equal(hintConflicts('Cotes du Rhône', terms).length, 0);
  assert.equal(hintConflicts('Coteaux', terms).length, 0);
});

test('the validator would have caught the obvious leaks in the real data', () => {
  const lazy = (g) => ({ ...g, hint: { nl: g.name, en: g.name } });
  const bad = checkHints(grapes.map((g) => (g.id === 'prosecco' ? { ...g, hint: { nl: 'Prosecco DOC', en: 'Prosecco DOC' } } : g)));
  assert.ok(bad.some((m) => m.startsWith('prosecco:') && m.includes("synonym 'Prosecco'")), bad.join('\n'));
  const melon = checkHints(grapes.map((g) => (g.id === 'melon' ? { ...g, hint: { nl: 'Muscadet', en: 'Muscadet' } } : g)));
  assert.ok(melon.some((m) => m.startsWith('melon:')));
  const other = checkHints(grapes.map((g) => (g.id === 'merlot' ? { ...g, hint: { nl: 'Zoals Syrah', en: 'Like Syrah' } } : g)));
  assert.ok(other.some((m) => m.includes('other grape')));
  assert.ok(checkHints(grapes.map(lazy)).length >= 55);
});

test('Burgenland (Zweigelt) and Mittelburgenland (Blaufränkisch) are distinct and do not overlap', () => {
  const z = grapes.find((g) => g.id === 'zweigelt').hint, b = grapes.find((g) => g.id === 'blaufrankisch').hint;
  for (const lang of ['nl', 'en']) {
    assert.ok(!z[lang].toLowerCase().includes('burgenland'), z[lang]);
    assert.ok(!b[lang].toLowerCase().includes(z[lang].toLowerCase()), 'no hint is a substring of another');
  }
});

test('the Python builder runs the same check and fails loudly', async () => {
  const src = readFileSync(new URL('../scripts/build_data.py', import.meta.url), 'utf8');
  assert.match(src, /def check_hints/);
  assert.match(src, /HINT VALIDATION FAILED/);
});
