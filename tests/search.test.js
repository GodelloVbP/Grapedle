import test from 'node:test';
import assert from 'node:assert/strict';
import grapes from '../data/grapes.json' with { type: 'json' };
import { search, exact } from '../src/search.js';

const top = (q) => search(q)[0] && search(q)[0].grape.id;

test('exact name or synonym beats everything else', () => {
  assert.equal(top('Prosecco'), 'prosecco', 'the pool grape, not Prosecco Lungo');
  assert.ok(search('prosecco').some((r) => r.grape.id === 'prosecco-lungo'));
  assert.equal(top('Moscato'), 'muscat-blanc-a-petits-grains');
  assert.equal(top("moscato d'asti"), 'muscat-blanc-a-petits-grains');
  assert.equal(top('Cava'), 'macabeo');
  assert.equal(top('shiraz'), 'syrah');
  assert.equal(top('Glera'), 'prosecco');
  assert.equal(search('Cava')[0].exact, true);
});

test('Rioja is a region, not a grape alias', () => {
  assert.equal(exact('Rioja'), null);
  assert.ok(!search('rioja').some((r) => r.exact));
});

test('a prefix gives a list, never an exact hit: pool grapes first', () => {
  const r = search('pinot');
  assert.ok(r.length > 1 && r.every((x) => !x.exact));
  assert.equal(exact('pinot'), null);
  const firstNonPool = r.findIndex((x) => !x.grape.answer);
  if (firstNonPool >= 0) assert.ok(r.slice(firstNonPool).every((x) => !x.grape.answer), 'no pool grape after a non-pool one');
});

test('a non-pool grape without flavour data never takes the top slot while a pool grape matches', () => {
  const thin = grapes.filter((g) => !g.answer && !(g.flavours && g.flavours.length));
  assert.ok(thin.length > 10);
  for (const g of thin.slice(0, 60)) {
    const q = g.name.slice(0, 4);
    const r = search(q);
    if (r.some((x) => x.grape.answer)) assert.ok(r[0].grape.answer || (r[0].grape.flavours && r[0].grape.flavours.length), `${q}: ${r[0].grape.id}`);
  }
});

test('search of nothing or nonsense is empty; accents and case do not matter', () => {
  assert.deepEqual(search(''), []);
  assert.deepEqual(search('zzzzqq'), []);
  assert.equal(top('GEWÜRZTRAMINER'), 'gewurztraminer');
  assert.equal(top('albarino'), 'alvarinho');
});
