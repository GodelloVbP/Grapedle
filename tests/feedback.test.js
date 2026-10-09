import test from 'node:test';
import assert from 'node:assert/strict';
import grapes from '../data/grapes.json' with { type: 'json' };
import {
  compare, area, roundArea, formatArea, flavour, region, sharedRegions, COLUMNS, body, ARROWS, distanceKm, bearingDeg, directionIndex, roundKm, shareSymbol,
} from '../src/feedback.js';
import { overlap, similarGrapes } from '../src/similar.js';

const byId = new Map(grapes.map((g) => [g.id, g]));
const desc = {
  a: { cluster: 'citrus' }, b: { cluster: 'citrus' }, c: { cluster: 'green-fruit' }, d: { cluster: 'green-fruit' },
  e: { cluster: 'floral' }, f: { cluster: 'floral' }, g: { cluster: 'herbal' }, h: { cluster: 'herbal' },
};
const ctry = { FR: { lat: 46.5, lon: 2.5 }, DE: { lat: 49.8, lon: 8.5 }, NZ: { lat: -41.5, lon: 174 } };
// Flat shortcuts (country, region, lat, lon) describe one region; `regions` gives the full list.
const g = ({ country = 'FR', region = 'Rhône', lat = 44.3, lon = 4.8, regions, ...o } = {}) => ({
  id: 'x', colour: 'red', flavours: null, areaHa: 1000,
  regions: regions || [{ name: region, country, lat, lon }], ...o,
});
const R = {
  Alsace: { name: 'Alsace', country: 'FR', lat: 48.2, lon: 7.35 },
  Veneto: { name: 'Veneto', country: 'IT', lat: 45.55, lon: 11.2 },
  Rhone: { name: 'Rhône', country: 'FR', lat: 44.3, lon: 4.8 },
  Aragon: { name: 'Aragón', country: 'ES', lat: 41.6, lon: -1.3 },
  Loire: { name: 'Loire', country: 'FR', lat: 47.3, lon: 0 },
  Marlborough: { name: 'Marlborough', country: 'NZ', lat: -41.5, lon: 173.9 },
  Mendoza: { name: 'Mendoza', country: 'AR', lat: -33.3, lon: -68.8 },
};
const st = (guess, answer, key) => compare(guess, answer, { descriptors: desc, countries: ctry }).find((c) => c.key === key);

test('five columns in plan order (no climate column)', () => {
  assert.deepEqual(COLUMNS, ['colour', 'region', 'body', 'area', 'flavour']);
  assert.equal(compare(g({}), g({ id: 'y' }), { descriptors: desc, countries: ctry }).length, 5);
});

test('self compare is all green with no arrows or distances', () => {
  const a = g({ id: 'same', flavours: ['a'] });
  for (const c of compare(a, a, { descriptors: desc, countries: ctry })) {
    assert.equal(c.status, 'green', c.key); assert.equal(c.arrow, null); assert.equal(c.km, null);
  }
  const unk = g({ id: 's', flavours: null, areaHa: null });
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
  assert.equal(mosel.regions[0].name, 'Mosel'); assert.equal(rioja.regions[0].name, 'Rioja'); assert.equal(rhone.regions[0].name, 'Rhône');
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

test('area: arrow points to the answer, value is the guess area rounded to 2 significant figures', () => {
  assert.deepEqual(area(280000, 19000), { status: 'red', arrow: 'down', value: 280000 }, 'answer has less: down');
  assert.deepEqual(area(19000, 280000), { status: 'red', arrow: 'up', value: 19000 }, 'answer has more: up');
  assert.deepEqual(area(1000, 1000), { status: 'yellow', arrow: null, value: 1000 }, 'exactly equal: no arrow');
  assert.equal(area(1000, 1001).arrow, 'up'); assert.equal(area(1001, 1000).arrow, 'down');
  assert.equal(area(null, 1000).status, 'grey'); assert.equal(area(1000, 0).status, 'grey');
  assert.equal(area(null, 1000).value, null);
  const same = st(g({ id: 'q', areaHa: 5 }), g({ id: 'q', areaHa: 5 }), 'area');
  assert.equal(same.status, 'green'); assert.equal(same.arrow, null); assert.equal(same.value, 5);
  const other = st(g({ id: 'a', areaHa: 5 }), g({ id: 'b', areaHa: 5 }), 'area');
  assert.equal(other.status, 'yellow', 'green only for the same grape'); assert.equal(other.arrow, null);
  const cs = st(g({ id: 'cab', areaHa: 276543 }), g({ id: 'gv', areaHa: 19012 }), 'area');
  assert.equal(cs.arrow, 'down'); assert.equal(cs.value, 280000);
});

test('area rounding: 2 significant figures', () => {
  assert.equal(roundArea(276543), 280000); assert.equal(roundArea(19012), 19000);
  assert.equal(roundArea(19500), 20000); assert.equal(roundArea(1234), 1200);
  assert.equal(roundArea(99), 99); assert.equal(roundArea(7), 7); assert.equal(roundArea(1), 1);
  assert.equal(roundArea(994999), 990000); assert.equal(roundArea(995000), 1000000);
});

test('area locale formatting: nl dot, en comma', () => {
  assert.equal(formatArea(276543, 'nl'), '280.000 ha'); assert.equal(formatArea(276543, 'en'), '280,000 ha');
  assert.equal(formatArea(19012, 'nl'), '19.000 ha'); assert.equal(formatArea(19012, 'en'), '19,000 ha');
  assert.equal(formatArea(1234567, 'nl'), '1.200.000 ha'); assert.equal(formatArea(1234567, 'en'), '1,200,000 ha');
  assert.equal(formatArea(850, 'nl'), '850 ha'); assert.equal(formatArea(12, 'en'), '12 ha');
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
  assert.deepEqual(cells.map(shareSymbol), ['🟥', '🟩', '⬜', '⬆️', '⬜']);
  const down = compare(g({ id: 'a', areaHa: 9 }), g({ id: 'b', areaHa: 5 }), { descriptors: desc, countries: ctry });
  assert.equal(shareSymbol(down[3]), '⬇️');
  const tie = compare(g({ id: 'a', areaHa: 9 }), g({ id: 'b', areaHa: 9 }), { descriptors: desc, countries: ctry });
  assert.equal(shareSymbol(tie[3]), '↔️', 'exactly equal areas');
  const win = compare(g({ id: 'a' }), g({ id: 'a' }), { descriptors: desc, countries: ctry });
  assert.deepEqual(win.map(shareSymbol), Array(5).fill('🟩'));
});

test('body: equal green, fuller/lighter arrow towards the answer, unknown either side grey', () => {
  const b = (gb, ab) => st(g({ id: 'a', body: gb }), g({ id: 'b', body: ab }), 'body');
  const eq = b(3, 3);
  assert.equal(eq.status, 'green'); assert.equal(eq.arrow, null); assert.equal(eq.value, 3);
  const fuller = b(2, 5);
  assert.equal(fuller.status, 'red'); assert.equal(fuller.arrow, 'up'); assert.equal(fuller.value, 2, 'shows the guess body');
  const lighter = b(5, 1);
  assert.equal(lighter.status, 'red');
  assert.equal(b(3, 4).status, 'yellow'); assert.equal(b(4, 3).status, 'yellow');
  assert.equal(area(1000, 2000).status, 'yellow'); assert.equal(area(1000, 2001).status, 'red'); assert.equal(lighter.arrow, 'down'); assert.equal(lighter.value, 5);
  assert.equal(b(null, 3).status, 'grey'); assert.equal(b(null, 3).value, null);
  assert.equal(b(3, null).status, 'grey'); assert.equal(b(3, null).value, 3);
  assert.equal(b(undefined, undefined).status, 'grey');
  assert.equal(body(3, 4).arrow, 'up');
  assert.deepEqual([b(3, 3), b(2, 5), b(5, 1), b(null, 1)].map(shareSymbol), ['🟩', '⬆️', '⬇️', '⬜']);
  // same grape is green even when its body is unknown
  assert.equal(st(g({ id: 'q', body: null }), g({ id: 'q', body: null }), 'body').status, 'green');
});

test('similar grapes: same colour, stocked, most identical aromas, tie-break shared families', () => {
  const FR = [{ name: 'X', country: 'FR' }], DE = [{ name: 'Y', country: 'DE' }];
  const ans = { id: 'ans', colour: 'white', flavours: ['a', 'c', 'e'], regions: FR };
  const pool = [
    { id: 'p1', name: 'P1', stocked: true, colour: 'white', flavours: ['a', 'c'], regions: DE },
    { id: 'p2', name: 'P2', stocked: true, colour: 'white', flavours: ['a', 'x'], regions: FR },
    { id: 'p3', name: 'P3', stocked: true, colour: 'white', flavours: ['a', 'x'], regions: DE },
    { id: 'p7', name: 'P7', stocked: true, colour: 'white', flavours: ['a', 'e'], regions: DE },
    { id: 'p4', name: 'P4', stocked: true, colour: 'red', flavours: ['a', 'c', 'e'] },
    { id: 'p5', name: 'P5', stocked: false, colour: 'white', flavours: ['a', 'c', 'e'] },
    { id: 'p6', name: 'P6', stocked: true, colour: 'white', flavours: null },
    { id: 'ans', name: 'Ans', stocked: true, colour: 'white', flavours: ['a', 'c', 'e'] },
  ];
  // p3: 1 identical aroma but another country is not similar enough; p2: 1 identical + same country is
  assert.deepEqual(similarGrapes(ans, pool, desc, 5).map((x) => x.id), ['p1', 'p7', 'p2']);
  assert.ok(!similarGrapes(ans, pool, desc, 9).some((x) => x.id === 'p3'));
  assert.deepEqual(overlap(['a', 'c'], ['a', 'c', 'e'], desc), { identical: 2, families: 2 });
  assert.deepEqual(similarGrapes({ ...ans, flavours: null }, pool, desc), []);
  // with equal identical counts the shared families decide
  const tie = [
    { id: 't1', name: 'T1', stocked: true, colour: 'white', flavours: ['a', 'c', 'x'] },
    { id: 't2', name: 'T2', stocked: true, colour: 'white', flavours: ['a', 'c', 'h'] },
  ];
  assert.deepEqual(similarGrapes({ id: 'z', colour: 'white', flavours: ['a', 'c', 'g'] }, tie, desc).map((x) => x.id), ['t2', 't1']);
  // nothing close enough: no wine tiles
  assert.deepEqual(similarGrapes({ id: 'z', colour: 'white', flavours: ['g', 'h'], regions: FR }, pool, desc), []);
});

// ---- up to two signature regions ----
const reg = (guess, answer) => st(g({ id: 'a', regions: guess }), g({ id: 'b', regions: answer }), 'region');

test('region, single vs single: same green, other region same country yellow with km, other country red', () => {
  assert.equal(reg([R.Rhone], [R.Rhone]).status, 'green');
  const fr = reg([R.Alsace], [R.Rhone]);
  assert.equal(fr.status, 'yellow'); assert.ok(fr.km > 0 && fr.dir !== null); assert.deepEqual(fr.hit, []);
  const far = reg([R.Marlborough], [R.Rhone]);
  assert.equal(far.status, 'red'); assert.ok(far.km > 15000 && far.dir !== null);
});

test('region, dual answer vs single guess: overlap is yellow without km, matching region listed', () => {
  const c = reg([R.Alsace], [R.Alsace, R.Veneto]);
  assert.equal(c.status, 'yellow'); assert.equal(c.km, null); assert.equal(c.dir, null);
  assert.deepEqual(c.hit, ['Alsace']);
  assert.deepEqual(sharedRegions(g({ regions: [R.Veneto, R.Alsace] }), g({ regions: [R.Alsace, R.Loire] })), ['Alsace']);
  // overlap beats the country rule even when the other guess region is in the answer's country
  assert.equal(reg([R.Alsace, R.Rhone], [R.Alsace, R.Veneto]).km, null);
});

test('region, dual vs dual: identical sets green (order and grape irrelevant), partial yellow overlap', () => {
  assert.equal(reg([R.Alsace, R.Veneto], [R.Veneto, R.Alsace]).status, 'green');
  assert.equal(reg([R.Alsace], [R.Alsace]).status, 'green');
  const p = reg([R.Loire, R.Rhone], [R.Rhone, R.Aragon]);
  assert.equal(p.status, 'yellow'); assert.equal(p.km, null); assert.deepEqual(p.hit, ['Rhône']);
  // a subset is not identical
  assert.equal(reg([R.Alsace], [R.Alsace, R.Veneto]).status, 'yellow');
});

test('region, no common region: same country anywhere is yellow with distance, else red', () => {
  const c = reg([R.Loire, R.Marlborough], [R.Rhone, R.Aragon]);
  assert.equal(c.status, 'yellow'); assert.ok(c.km > 0);
  const r = reg([R.Marlborough, R.Mendoza], [R.Rhone, R.Aragon]);
  assert.equal(r.status, 'red');
});

test('region: closest pair decides km and arrow', () => {
  // guess Marlborough + Loire vs answer Rhône + Aragón: the closest pair is Loire to Rhône
  const c = reg([R.Marlborough, R.Loire], [R.Aragon, R.Rhone]);
  const d = distanceKm([R.Loire.lat, R.Loire.lon], [R.Rhone.lat, R.Rhone.lon]);
  assert.equal(c.km, roundKm(d));
  assert.equal(c.dir, directionIndex(bearingDeg([R.Loire.lat, R.Loire.lon], [R.Rhone.lat, R.Rhone.lon])));
  assert.equal(ARROWS[c.dir], '↘', 'Loire to Rhône points south-east');
  // Mendoza + Veneto guess vs Alsace answer: Veneto is nearer, Alsace lies north-west of Veneto
  const v = reg([R.Mendoza, R.Veneto], [R.Alsace]);
  assert.equal(v.status, 'red');
  assert.equal(v.km, roundKm(distanceKm([R.Veneto.lat, R.Veneto.lon], [R.Alsace.lat, R.Alsace.lon])));
  assert.equal(v.dir, directionIndex(bearingDeg([R.Veneto.lat, R.Veneto.lon], [R.Alsace.lat, R.Alsace.lon])));
  assert.equal(ARROWS[v.dir], '↖');
  // order of the answer's regions does not matter
  assert.deepEqual(reg([R.Marlborough, R.Loire], [R.Rhone, R.Aragon]), c);
});

test('share emoji follow tile colour for the new yellow states', () => {
  const cells = compare(g({ id: 'a', regions: [R.Alsace] }), g({ id: 'b', regions: [R.Alsace, R.Veneto] }), { descriptors: desc, countries: ctry });
  assert.equal(shareSymbol(cells[1]), '🟨');
});

test('flavour: familyHit lists non-identical guess aromas whose family the answer has', () => {
  const f = flavour({ flavours: ['a', 'c', 'g'] }, { flavours: ['b', 'c', 'e'] }, desc);
  assert.deepEqual(f.shared, ['c']);
  assert.deepEqual(f.familyHit, ['a'], 'a is citrus like b; g (herbal) has no family match; c is identical, not family');
  assert.deepEqual(flavour({ flavours: null }, { flavours: ['a'] }, desc).familyHit, []);
  const cell = st(g({ id: 'x', flavours: ['a', 'g'] }), g({ id: 'y', flavours: ['b'] }), 'flavour');
  assert.deepEqual(cell.familyHit, ['a']);
});

test('region parts: one entry per guess region, shared ones without distance, others with their own km and arrow', () => {
  const c = reg([R.Rhone, R.Veneto], [R.Rhone, R.Alsace]);
  assert.equal(c.parts.length, 2);
  assert.equal(c.parts[0].name, R.Rhone.name); assert.equal(c.parts[0].hit, true); assert.equal(c.parts[0].km, null);
  assert.equal(c.parts[1].name, R.Veneto.name); assert.equal(c.parts[1].hit, false);
  assert.ok(c.parts[1].km > 0 && c.parts[1].dir >= 0 && c.parts[1].dir < 8);
  const far = reg([R.Rhone], [R.Veneto]);
  assert.equal(far.parts.length, 1); assert.ok(far.parts[0].km > 0);
});
