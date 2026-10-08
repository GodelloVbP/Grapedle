import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, area, trend, trendClass, parentage, flavour, COLUMNS } from '../src/feedback.js';

const desc = {
  a: { cluster: 'citrus' }, b: { cluster: 'citrus' }, c: { cluster: 'green-fruit' }, d: { cluster: 'green-fruit' },
  e: { cluster: 'floral' }, f: { cluster: 'floral' },
};
const ctry = { FR: { borders: ['DE', 'IT'] }, DE: { borders: ['FR'] }, IT: { borders: ['FR'] }, NZ: { borders: [] }, ES: { borders: ['FR'] } };
const g = (o) => ({ id: 'x', colour: 'red', origin: 'FR', topCountries: ['FR', 'US', 'CL'], climate: 'warm', ripening: 'mid',
  flavours: null, parents: null, areaHa: 1000, trendPct: 0, ...o });
const st = (guess, answer, key) => compare(guess, answer, { descriptors: desc, countries: ctry }).find((c) => c.key === key);

test('nine columns, trend last', () => {
  assert.equal(COLUMNS.length, 9);
  assert.equal(COLUMNS[8], 'trend');
  assert.equal(compare(g({}), g({ id: 'y' }), { descriptors: desc, countries: ctry }).length, 9);
});

test('self compare is all green', () => {
  const a = g({ id: 'same', flavours: ['a'], parents: ['p', 'q'] });
  for (const c of compare(a, a, { descriptors: desc, countries: ctry })) { assert.equal(c.status, 'green', c.key); assert.equal(c.arrow, null); }
  // unknown fields stay green on a self compare
  for (const c of compare(g({ id: 's', climate: null, trendPct: null }), g({ id: 's', climate: null, trendPct: null }), { descriptors: desc, countries: ctry })) assert.equal(c.status, 'green');
});

test('colour', () => {
  assert.equal(st(g({ id: 'a' }), g({ id: 'b' }), 'colour').status, 'green');
  assert.equal(st(g({ id: 'a', colour: 'white' }), g({ id: 'b' }), 'colour').status, 'red');
});

test('origin: same, shared border, other, island', () => {
  const o = (a, b) => st(g({ id: 'a', origin: a }), g({ id: 'b', origin: b }), 'origin').status;
  assert.equal(o('FR', 'FR'), 'green');
  assert.equal(o('DE', 'FR'), 'yellow');
  assert.equal(o('FR', 'DE'), 'yellow');
  assert.equal(o('DE', 'IT'), 'red');
  assert.equal(o('NZ', 'FR'), 'red');
  assert.equal(o('FR', 'NZ'), 'red');
});

test('most planted: same top, in answer top 3, else red', () => {
  const t = (gt, at) => st(g({ id: 'a', topCountries: gt }), g({ id: 'b', topCountries: at }), 'top').status;
  assert.equal(t(['FR'], ['FR', 'IT']), 'green');
  assert.equal(t(['IT'], ['FR', 'US', 'IT']), 'yellow');
  assert.equal(t(['IT'], ['FR', 'US', 'CL', 'IT']), 'red');
  assert.equal(t(['AU'], ['FR']), 'red');
});

test('parentage with fixtures', () => {
  const P = (id, parents) => ({ id, parents });
  const pn = P('pinot-noir', ['pinot-noir-x', 'p2']);
  assert.equal(parentage(P('a', ['p1', 'p2']), P('b', ['p2', 'p1'])), 'green', 'same two parents, any order');
  assert.equal(parentage(P('a', ['p1', 'p2']), P('b', ['p1', 'p3'])), 'yellow', 'one shared parent');
  assert.equal(parentage(P('a', ['p1', 'p2']), P('b', ['p3', 'p4'])), 'red');
  assert.equal(parentage(P('p1', ['z1', 'z2']), P('b', ['p1', 'p3'])), 'yellow', 'guess is parent of answer');
  assert.equal(parentage(P('a', ['b', 'z']), P('b', ['y1', 'y2'])), 'yellow', 'answer is parent of guess');
  assert.equal(parentage(P('a', null), P('b', ['p1', 'p2'])), 'grey');
  assert.equal(parentage(P('a', ['p1', 'p2']), P('b', null)), 'grey');
  assert.equal(parentage(P('a', []), P('b', [])), 'grey');
  assert.equal(parentage(pn, pn), 'green');
  assert.equal(parentage(P('a', ['p1', 'p2']), P('a', null)), 'green', 'same grape');
  // known-unknown mixed: a one-parent record
  assert.equal(parentage(P('a', ['p1']), P('b', ['p1', 'p2'])), 'yellow');
});

test('climate and ripening ordinal', () => {
  const c = (a, b) => st(g({ id: 'a', climate: a }), g({ id: 'b', climate: b }), 'climate').status;
  assert.equal(c('warm', 'warm'), 'green');
  assert.equal(c('cool', 'temperate'), 'yellow');
  assert.equal(c('hot', 'warm'), 'yellow');
  assert.equal(c('cool', 'warm'), 'red');
  assert.equal(c('cool', 'hot'), 'red');
  assert.equal(c(null, 'hot'), 'grey');
  const r = (a, b) => st(g({ id: 'a', ripening: a }), g({ id: 'b', ripening: b }), 'ripening').status;
  assert.equal(r('early', 'early'), 'green');
  assert.equal(r('early', 'mid'), 'yellow');
  assert.equal(r('mid', 'late'), 'yellow');
  assert.equal(r('early', 'late'), 'red');
  assert.equal(r(null, 'late'), 'grey');
  assert.equal(r('late', null), 'grey');
});

test('flavour: green >=2 shared, yellow 1 shared or >=2 shared clusters, red else, grey unknown', () => {
  const f = (a, b) => flavour({ flavours: a }, { flavours: b }, desc);
  assert.equal(f(['a', 'c'], ['a', 'c', 'e']).status, 'green');
  assert.deepEqual(f(['a', 'c'], ['a', 'c', 'e']).shared, ['a', 'c']);
  assert.equal(f(['a', 'e'], ['a', 'c']).status, 'yellow', 'one shared');
  assert.equal(f(['a', 'c'], ['b', 'd']).status, 'yellow', 'none shared, two shared clusters');
  assert.equal(f(['a'], ['b']).status, 'red', 'one shared cluster only');
  assert.equal(f(['a'], ['e']).status, 'red');
  assert.equal(f(null, ['a']).status, 'grey');
  assert.equal(f(['a'], null).status, 'grey');
});

test('area: exact 10 % and 50 % edges, arrows toward the answer', () => {
  assert.deepEqual(area(1000, 1000), { status: 'green', arrow: null });
  assert.equal(area(900, 1000).status, 'green');
  assert.equal(area(1100, 1000).status, 'green');
  assert.equal(area(899, 1000).status, 'yellow');
  assert.equal(area(1101, 1000).status, 'yellow');
  assert.equal(area(500, 1000).status, 'yellow');
  assert.equal(area(1500, 1000).status, 'yellow');
  assert.equal(area(499, 1000).status, 'red');
  assert.equal(area(1501, 1000).status, 'red');
  assert.equal(area(100, 1000).arrow, 'up');
  assert.equal(area(5000, 1000).arrow, 'down');
  assert.equal(area(900, 1000).arrow, null, 'green has no arrow');
  assert.equal(area(null, 1000).status, 'grey');
  assert.equal(area(1000, null).status, 'grey');
});

test('trend classes and exact boundaries', () => {
  const k = trendClass;
  assert.equal(k(-57), 0); assert.equal(k(-20), 0); assert.equal(k(-19.9), 1);
  assert.equal(k(-5), 1); assert.equal(k(-4.9), 2);
  assert.equal(k(0), 2); assert.equal(k(5), 2); assert.equal(k(5.1), 3);
  assert.equal(k(29.9), 3); assert.equal(k(30), 4); assert.equal(k(250), 4);
  assert.equal(k(null), -1); assert.equal(k(undefined), -1); assert.equal(k(NaN), -1);
});

test('trend tile status', () => {
  assert.equal(trend(34, 31), 'green');
  assert.equal(trend(-20, -30), 'green');
  assert.equal(trend(-5, -20), 'yellow');
  assert.equal(trend(5, 5.1), 'yellow');
  assert.equal(trend(30, 29.9), 'yellow');
  assert.equal(trend(-30, 0), 'red');
  assert.equal(trend(40, -10), 'red');
  assert.equal(trend(null, 10), 'grey');
  assert.equal(trend(10, null), 'grey');
  assert.equal(st(g({ id: 'a', trendPct: 34 }), g({ id: 'b', trendPct: 12 }), 'trend').status, 'yellow');
  assert.equal(st(g({ id: 'a', trendPct: 34 }), g({ id: 'b', trendPct: 12 }), 'trend').arrow, null);
});
