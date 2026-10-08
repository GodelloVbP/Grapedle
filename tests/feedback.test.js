import test from 'node:test';
import assert from 'node:assert/strict';
import grapes from '../data/grapes.json' with { type: 'json' };
import {
  compare, area, flavour, region, climate, COLUMNS, ARROWS, distanceKm, bearingDeg, directionIndex, roundKm, shareSymbol,
} from '../src/feedback.js';
import { overlap, similarGrapes } from '../src/similar.js';

const byId = new Map(grapes.map((g) => [g.id, g]));
const desc = {
  a: { cluster: 'citrus' }, b: { cluster: 'citrus' }, c: { cluster: 'green-fruit' }, d: { cluster: 'green-fruit' },
  e: { cluster: 'floral' }, f: { cluster: 'floral' }, g: { cluster: 'herbal' }, h: { cluster: 'herbal' },
};
const ctry = { FR: { lat: 46.5, lon: 2.5 }, DE: { lat: 49.8, lon: 8.5 }, NZ: { lat: -41.5, lon: 174 } };
const g = (o) => ({ id: 'x', colour: 'red', country: 'FR', region: 'Rhône', lat: 44.3, lon: 4.8, climate: 'warm', flavours: null, areaHa: 1000, ...o });
const st = (guess, answer, key) => compare(guess, answer, { descriptors: desc, countries: ctry }).find((c) => c.key === key);

test('five columns in plan order', () => {
  assert.deepEqual(COLUMNS, ['colour', 'region', 'climate', 'area', 'flavour']);
  assert.equal(compare(g({}), g({ id: 'y' }), { descriptors: desc, countries: ctry }).length, 5);
});

test('self compare is all green with no arrows or distances', () => {
  const a = g({ id: 'same', flavours: ['a'] });
  for (const c of compare(a, a, { descriptors: desc, countries: ctry })) {
    assert.equal(c.status, 'green', c.key); assert.equal(c.arrow, null); assert.equal(c.km, null);
  }
  const unk = g({ id: 's', climate: null, flavours: null, areaHa: null });
  for (const c of compare(unk, unk, { descriptors: desc, countries: ctry })) assert.equal(c.status, 'green');
});

test('colour', () => {
  assert.equal(st(g({ id: 'a' }), g({ id: 'b' }), 'colour').status, 'green');
  assert.equal(st(g({ id: 'a', colour: 'white' }), g({ id: 'b' }), 'colour').status, 'red');
});

test('region: same region is green even for different grapes; same country yellow; else red', () => {
  const r = (a, b) => st(g({ id: 'a', ...a }), g({ id: 'b', ...b }), 'region');
  const same = r({}, {});
  assert.equal(same.status, 'green'); assert.equal(same.km, null); assert.equal(same.dir, null);
  const fr = r({ region: 'Bordeaux', lat: 44.9, lon: -0.35 }, {});
  assert.equal(fr.status, 'yellow'); assert.ok(fr.km > 0); assert.ok(fr.dir >= 0 && fr.dir < 8);
  const far = r({ country: 'DE', region: 'Mosel', lat: 49.9, lon: 7 }, {});
  assert.equal(far.status, 'red'); assert.ok(far.km > 0);
  // a grape without a signature region sits at its country point and never matches a region
  const noReg = r({ region: null, lat: null, lon: null }, {});
  assert.equal(noReg.status, 'yellow');
  assert.equal(noReg.km, roundKm(distanceKm([46.5, 2.5], [44.3, 4.8])));
  // same region name in another country is not the same region
  assert.equal(r({ country: 'DE' }, {}).status, 'red');
});

test('distance is rounded to 50 km, never below 50', () => {
  assert.equal(roundKm(11), 50);
  assert.equal(roundKm(24), 50);
  assert.equal(roundKm(74), 50);
  assert.equal(roundKm(76), 100);
  assert.equal(roundKm(111.2), 100);
  assert.equal(roundKm(124), 100);
  assert.equal(roundKm(126), 150);
  assert.equal(roundKm(649), 650);
  const km = distanceKm([0, 0], [0, 1]);
  assert.ok(Math.abs(km - 111.19) < 0.1, String(km));
  assert.ok(Math.abs(distanceKm([48.85, 2.35], [51.5, -0.12]) - 344) < 5, 'Paris to London');
  assert.equal(distanceKm([10, 10], [10, 10]), 0);
});

test('bearing and 8-way arrows', () => {
  const o = [0, 0];
  assert.equal(directionIndex(bearingDeg(o, [1, 0])), 0);
  assert.equal(directionIndex(bearingDeg(o, [1, 1])), 1);
  assert.equal(directionIndex(bearingDeg(o, [0, 1])), 2);
  assert.equal(directionIndex(bearingDeg(o, [-1, 1])), 3);
  assert.equal(directionIndex(bearingDeg(o, [-1, 0])), 4);
  assert.equal(directionIndex(bearingDeg(o, [-1, -1])), 5);
  assert.equal(directionIndex(bearingDeg(o, [0, -1])), 6);
  assert.equal(directionIndex(bearingDeg(o, [1, -1])), 7);
  assert.deepEqual(ARROWS, ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']);
  assert.equal(directionIndex(22.4), 0); assert.equal(directionIndex(22.6), 1);
  assert.equal(directionIndex(337.4), 7); assert.equal(directionIndex(337.6), 0);
  assert.equal(directionIndex(359.9), 0); assert.equal(directionIndex(-10), 0);
  // great circle: over the pole the initial bearing is not the rhumb line
  assert.ok(bearingDeg([60, 0], [60, 90]) < 90, 'initial bearing bends toward the pole');
});

test('bearing on real data: Mosel to Rhône points south, Rioja to Rhône east/north-east', () => {
  const mosel = byId.get('riesling'), rioja = byId.get('tempranillo'), rhone = byId.get('syrah');
  assert.equal(mosel.region, 'Mosel'); assert.equal(rioja.region, 'Rioja'); assert.equal(rhone.region, 'Rhône');
  const a = compare(mosel, rhone).find((c) => c.key === 'region');
  assert.equal(a.status, 'red');
  assert.ok([4, 5].includes(a.dir), 'Mosel to Rhône: S or SW, got ' + ARROWS[a.dir]);
  const b = compare(rioja, rhone).find((c) => c.key === 'region');
  assert.ok([1, 2].includes(b.dir), 'Rioja to Rhône: NE or E, got ' + ARROWS[b.dir]);
  const back = compare(rhone, rioja).find((c) => c.key === 'region');
  assert.ok([5, 6].includes(back.dir), 'Rhône to Rioja: SW or W, got ' + ARROWS[back.dir]);
  assert.equal(a.km % 50, 0);
  assert.ok(a.km >= 600 && a.km <= 700, String(a.km));
});

test('climate: three classes, exact or red, grey when unknown', () => {
  const c = (a, b) => st(g({ id: 'a', climate: a }), g({ id: 'b', climate: b }), 'climate').status;
  assert.equal(c('warm', 'warm'), 'green');
  assert.equal(c('koel', 'warm'), 'red');
  assert.equal(c('heet', 'warm'), 'red');
  assert.equal(c('koel', 'heet'), 'red');
  assert.equal(c(null, 'heet'), 'grey');
  assert.equal(c('heet', null), 'grey');
  assert.equal(climate({ climate: 'koel' }, { climate: 'koel' }), 'green');
});

test('area: neutral arrow toward the answer, green only for the same grape, tie shows =', () => {
  assert.deepEqual(area(500, 1000), { status: 'neutral', arrow: 'up', tie: false }, 'answer has more');
  assert.deepEqual(area(5000, 1000), { status: 'neutral', arrow: 'down', tie: false }, 'answer has less');
  assert.deepEqual(area(999, 1000), { status: 'neutral', arrow: 'up', tie: false }, 'no partial credit near the answer');
  assert.deepEqual(area(1000, 1000), { status: 'neutral', arrow: null, tie: true });
  assert.equal(area(null, 1000).status, 'grey');
  assert.equal(area(1000, 0).status, 'grey');
  const same = st(g({ id: 'q', areaHa: 5 }), g({ id: 'q', areaHa: 5 }), 'area');
  assert.equal(same.status, 'green');
  const tie = st(g({ id: 'a', areaHa: 5 }), g({ id: 'b', areaHa: 5 }), 'area');
  assert.equal(tie.status, 'neutral'); assert.equal(tie.tie, true);
});

test('flavour: green >=2 identical, yellow 1 identical or >=3 shared families, red otherwise, grey unknown', () => {
  const f = (a, b) => flavour({ flavours: a }, { flavours: b }, desc);
  assert.equal(f(['a', 'c'], ['a', 'c', 'e']).status, 'green');
  assert.deepEqual(f(['a', 'c'], ['a', 'c', 'e']).shared, ['a', 'c']);
  assert.equal(f(['a', 'e'], ['a', 'c']).status, 'yellow', 'one identical');
  assert.equal(f(['a', 'c', 'e'], ['b', 'd', 'f']).status, 'yellow', 'no identical, three shared families');
  assert.equal(f(['a', 'c', 'e', 'g'], ['b', 'd', 'f', 'h']).families, 4);
  assert.equal(f(['a', 'c'], ['b', 'd']).status, 'red', 'two shared families are not enough');
  assert.equal(f(['a'], ['e']).status, 'red');
  assert.equal(f(['a', 'c', 'e'], ['a', 'x']).status, 'yellow');
  assert.equal(f(null, ['a']).status, 'grey');
  assert.equal(f(['a'], null).status, 'grey');
  assert.equal(f([], ['a']).status, 'grey');
  // the tile lists the guess's aromas; identical ones are returned for bolding
  const cell = st(g({ id: 'a', flavours: ['a', 'e'] }), g({ id: 'b', flavours: ['a', 'c'] }), 'flavour');
  assert.deepEqual(cell.shared, ['a']);
});

test('share symbols per cell', () => {
  const cells = compare(g({ id: 'a', areaHa: 5 }), g({ id: 'b', areaHa: 9, colour: 'white' }), { descriptors: desc, countries: ctry });
  assert.deepEqual(cells.map(shareSymbol), ['🟥', '🟩', '🟩', '⬆️', '⬜']);
  const down = compare(g({ id: 'a', areaHa: 9 }), g({ id: 'b', areaHa: 5 }), { descriptors: desc, countries: ctry });
  assert.equal(shareSymbol(down[3]), '⬇️');
  const tie = compare(g({ id: 'a', areaHa: 9 }), g({ id: 'b', areaHa: 9 }), { descriptors: desc, countries: ctry });
  assert.equal(shareSymbol(tie[3]), '🟰');
  const win = compare(g({ id: 'a' }), g({ id: 'a' }), { descriptors: desc, countries: ctry });
  assert.deepEqual(win.map(shareSymbol), Array(5).fill('🟩'));
});

test('similar grapes: same colour, stocked, most identical aromas, tie-break shared families', () => {
  const ans = { id: 'ans', colour: 'white', flavours: ['a', 'c', 'e'] };
  const pool = [
    { id: 'p1', name: 'P1', stocked: true, colour: 'white', flavours: ['a', 'c'] },
    { id: 'p2', name: 'P2', stocked: true, colour: 'white', flavours: ['a', 'x'] },
    { id: 'p3', name: 'P3', stocked: true, colour: 'white', flavours: ['b', 'd', 'f'] },
    { id: 'p4', name: 'P4', stocked: true, colour: 'red', flavours: ['a', 'c', 'e'] },
    { id: 'p5', name: 'P5', stocked: false, colour: 'white', flavours: ['a', 'c', 'e'] },
    { id: 'p6', name: 'P6', stocked: true, colour: 'white', flavours: null },
    { id: 'ans', name: 'Ans', stocked: true, colour: 'white', flavours: ['a', 'c', 'e'] },
  ];
  assert.deepEqual(similarGrapes(ans, pool, desc, 3).map((x) => x.id), ['p1', 'p2', 'p3']);
  assert.deepEqual(overlap(['a', 'c'], ['a', 'c', 'e'], desc), { identical: 2, families: 2 });
  assert.deepEqual(similarGrapes({ ...ans, flavours: null }, pool, desc), []);
  // p2 (1 identical) beats p3 (0 identical, 3 families); with equal identical counts families decide
  const tie = [
    { id: 't1', name: 'T1', stocked: true, colour: 'white', flavours: ['a', 'x'] },
    { id: 't2', name: 'T2', stocked: true, colour: 'white', flavours: ['a', 'd'] },
  ];
  assert.deepEqual(similarGrapes({ id: 'z', colour: 'white', flavours: ['a', 'c'] }, tie, desc).map((x) => x.id), ['t2', 't1']);
});
