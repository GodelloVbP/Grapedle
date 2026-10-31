import test from 'node:test';
import assert from 'node:assert/strict';
import { nextKeys, keyQuery, KEY_ROWS } from '../src/keyboard.js';
import { search } from '../src/search.js';

test('nothing typed: every key is useful', () => {
  assert.equal(nextKeys(''), null);
  assert.equal(nextKeys('   '), null);
});

test('trailing separators count as one space, accents and case are ignored', () => {
  assert.equal(keyQuery('Pinot '), 'pinot ');
  assert.equal(keyQuery("nero d'"), 'nero d ');
  assert.equal(keyQuery('Grü'), 'gru');
});

test('after "pinot " the next letters of the Pinots are offered', () => {
  const k = nextKeys('pinot ');
  for (const c of ['n', 'g', 'b']) assert.ok(k.has(c), c);
  assert.ok(!k.has('x'));
});

test('a typo leaves no key to press', () => {
  assert.equal(nextKeys('zzqx').size, 0);
});

test('every key the keyboard allows still finds a grape', () => {
  for (const start of ['c', 'gr', 'sa', 'mo', 'pinot ']) {
    for (const c of nextKeys(start)) assert.ok(search(start + c).length > 0, JSON.stringify(start + c));
  }
});

test('the letter keys cover a-z exactly once', () => {
  assert.equal(KEY_ROWS.flat().sort().join(''), 'abcdefghijklmnopqrstuvwxyz');
});

test('touch suggestions after one letter: names starting with it first, A-Z, then synonyms, nothing cut off', async () => {
  const { default: grapes } = await import('../data/grapes.json', { with: { type: 'json' } });
  const { norm } = await import('../src/text.js');
  const res = search('m', 500, { browse: true });
  const got = res.map((r) => r.grape.id);
  const want = grapes.filter((g) => norm(g.name).startsWith('m')).map((g) => g.id);
  for (const id of want) assert.ok(got.includes(id), id);
  const starts = (n) => norm(n).startsWith('m') || norm(n).split(' ').some((w) => w.startsWith('m'));
  const first = grapes.filter((g) => starts(g.name)).map((g) => g.name).sort((a, b) => a.localeCompare(b, 'nl'));
  assert.deepEqual(res.slice(0, first.length).map((r) => r.grape.name), first, 'name matches come first, A-Z');
  assert.ok(res.length > first.length, 'synonym matches follow');
  assert.equal(search('m').length, 8, 'plain search keeps its default cap');
});

test('desktop dropdown: same set as the touch list, best matches first', () => {
  for (const q of ['g', 'ga', 'pi', 'a']) {
    const touch = search(q, 500, { browse: true }).map((r) => r.grape.id);
    const desk = search(q, 500, { browse: true, ranked: true }).map((r) => r.grape.id);
    assert.deepEqual([...desk].sort(), [...touch].sort(), q);
  }
  assert.equal(search('g', 500, { browse: true, ranked: true })[0].grape.name, search('g')[0].grape.name);
});

test('every grape shows for every start of its name or a synonym, touch and desktop', async () => {
  const { default: grapes } = await import('../data/grapes.json', { with: { type: 'json' } });
  const { norm } = await import('../src/text.js');
  const miss = [];
  for (const g of grapes) {
    for (const nm of [g.name, ...g.synonyms]) {
      const q = norm(nm);
      for (let n = 1; n <= q.length; n++) {
        const p = q.slice(0, n);
        if (!p.trim()) continue;
        for (const o of [{ browse: true }, { browse: true, ranked: true }]) {
          if (!search(p, 500, o).some((r) => r.grape.id === g.id)) miss.push(`${g.name} / ${nm} / "${p}"`);
        }
      }
    }
  }
  assert.deepEqual(miss.slice(0, 10), []);
});

test('every key the keyboard offers leads to a list that holds every grape containing that text', async () => {
  const { default: grapes } = await import('../data/grapes.json', { with: { type: 'json' } });
  const { norm } = await import('../src/text.js');
  for (const start of ['g', 'a', 'p']) {
    for (const c of nextKeys(start)) {
      if (c === ' ') continue; // a space adds nothing to the query
      const q = start + c;
      const got = new Set(search(q, 500, { browse: true }).map((r) => r.grape.id));
      for (const g of grapes) {
        if ([g.name, ...g.synonyms].some((n) => norm(n).includes(q))) assert.ok(got.has(g.id), `${g.name} for "${q}"`);
      }
    }
  }
});
