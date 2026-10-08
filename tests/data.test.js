import test from 'node:test';
import assert from 'node:assert/strict';
import grapes from '../data/grapes.json' with { type: 'json' };
import countries from '../data/countries.json' with { type: 'json' };
import descriptors from '../data/descriptors.json' with { type: 'json' };
import shopGrapes from '../data/shop-grapes.json' with { type: 'json' };
import { exact, search } from '../src/search.js';
import { norm } from '../src/text.js';

const byId = new Map(grapes.map((g) => [g.id, g]));
// Known source gaps, reported in the build notes. None in the answer pool at present.
const KNOWN_GAPS = {};
const CLUSTERS = new Set(['floral', 'green-fruit', 'citrus', 'stone-fruit', 'tropical', 'red-fruit', 'black-fruit', 'dried-fruit', 'herbaceous', 'herbal', 'pungent-spice', 'other']);

test('pool sizes and ids', () => {
  assert.equal(grapes.filter((g) => g.answer).length, 111);
  assert.ok(grapes.length >= 240 && grapes.length <= 280, String(grapes.length));
  assert.equal(byId.size, grapes.length, 'unique ids');
  for (const g of grapes) assert.match(g.id, /^[a-z0-9-]+$/);
});

test('every answer grape has the core fields', () => {
  for (const g of grapes.filter((x) => x.answer)) {
    const gaps = KNOWN_GAPS[g.id] || [];
    for (const f of ['colour', 'origin', 'topCountries', 'areaHa', 'climate']) {
      if (gaps.includes(f)) continue;
      const v = g[f];
      assert.ok(Array.isArray(v) ? v.length : v, `${g.id}.${f}`);
    }
    assert.ok(['white', 'red'].includes(g.colour));
    assert.ok(['cool', 'temperate', 'warm', 'hot'].includes(g.climate), g.id);
  }
});

test('record shape: trendPct number or null, no firstMention', () => {
  for (const g of grapes) {
    assert.ok(g.trendPct === null || typeof g.trendPct === 'number', g.id);
    assert.ok(!('firstMention' in g), g.id);
    assert.ok(g.topCountries.length <= 3);
    assert.ok(g.areaHa === null || g.areaHa > 0);
    assert.ok(g.sources && typeof g.sources === 'object');
  }
  assert.equal(grapes.filter((g) => g.answer && g.trendPct !== null).length >= 100, true);
  assert.equal(byId.get('croatina').origin, 'IT');
});

test('every ISO code used exists in countries.json, borders valid and symmetric', () => {
  const used = new Set(grapes.flatMap((g) => [g.origin, ...g.topCountries]).filter(Boolean));
  for (const c of used) assert.ok(countries[c], 'missing ' + c);
  for (const [c, v] of Object.entries(countries)) {
    assert.ok(v.nl && v.en, c);
    for (const b of v.borders) {
      assert.ok(countries[b], `${c} border ${b} unknown`);
      assert.ok(countries[b].borders.includes(c), `asymmetric ${c}-${b}`);
      assert.notEqual(b, c);
    }
  }
});

test('border spot checks', () => {
  const B = (c) => [...countries[c].borders].sort();
  const has = (c, ...l) => l.forEach((x) => assert.ok(countries[c].borders.includes(x), `${c} should border ${x}`));
  const lacks = (c, ...l) => l.forEach((x) => assert.ok(!countries[c].borders.includes(x), `${c} must not border ${x}`));
  has('FR', 'DE', 'IT', 'ES', 'CH', 'BE', 'LU'); lacks('FR', 'PT', 'AT', 'NL');
  has('IT', 'FR', 'CH', 'AT', 'SI'); lacks('IT', 'DE', 'HR', 'ES');
  has('ES', 'PT', 'FR'); lacks('ES', 'IT', 'MA');
  assert.deepEqual(B('PT'), ['ES']);
  has('DE', 'FR', 'AT', 'CH', 'CZ', 'PL', 'NL', 'BE', 'LU'); lacks('DE', 'IT', 'HU');
  has('AT', 'DE', 'CH', 'IT', 'SI', 'HU', 'SK', 'CZ'); lacks('AT', 'FR', 'HR');
  has('CH', 'DE', 'FR', 'IT', 'AT');
  has('HU', 'AT', 'SK', 'UA', 'RO', 'RS', 'HR', 'SI'); lacks('HU', 'CZ', 'DE');
  has('SI', 'IT', 'AT', 'HU', 'HR'); lacks('SI', 'RS');
  has('HR', 'SI', 'HU', 'RS', 'ME'); lacks('HR', 'IT', 'AT');
  has('GR', 'AL', 'MK', 'BG', 'TR'); lacks('GR', 'IT');
  has('MK', 'GR', 'AL', 'BG', 'RS'); lacks('MK', 'HR');
  has('RS', 'HU', 'RO', 'BG', 'MK', 'ME', 'HR'); lacks('RS', 'SI');
  has('GE', 'AM', 'TR', 'RU'); lacks('GE', 'UA');
  has('AM', 'GE', 'TR');
  assert.deepEqual(B('ZA'), []);
  has('AR', 'CL', 'UY', 'BR'); has('CL', 'AR', 'PE'); lacks('CL', 'BR');
  has('US', 'CA', 'MX'); has('CA', 'US'); lacks('CA', 'MX');
  assert.deepEqual(B('AU'), []);
  assert.deepEqual(B('NZ'), []);
});

test('shop-grapes: required keys and all targets exist', () => {
  const required = ['Auxerrois', 'Cabernet Sauvignon', 'Cinsault', 'Corvina', 'Corvinone', 'Croatina', 'Garnacha', 'Gewurztraminer', 'Graciano', 'Grenache', 'Grenache Blanc', 'Grüner Veltliner', 'Marsanne', 'Maturana Tinta', 'Mazuelo', 'Merlot', 'Pinot Blanc', 'Pinot Gris', 'Pinot Noir', 'Riesling', 'Rondinella', 'Roter Sylvaner', 'Roussanne', 'Garganega', 'Trebbiano di Soave', 'Syrah', 'Tempranillo', 'Tinta de Toro (Tempranillo)'];
  for (const k of required) assert.ok(shopGrapes[k], 'missing key ' + k);
  for (const [k, id] of Object.entries(shopGrapes)) assert.ok(byId.has(id), `${k} -> ${id}`);
  assert.equal(shopGrapes.Grenache, 'garnacha-tinta');
  assert.equal(shopGrapes['Tinta de Toro (Tempranillo)'], 'tempranillo');
  assert.equal(shopGrapes['Trebbiano di Soave'], 'verdicchio-bianco');
});

test('synonyms are unique across grapes and never equal another grape name', () => {
  const seen = new Map();
  for (const g of grapes) {
    for (const k of [g.name, ...g.synonyms].map(norm)) {
      assert.ok(!seen.has(k) || seen.get(k) === g.id, `"${k}" used by ${seen.get(k)} and ${g.id}`);
      seen.set(k, g.id);
    }
  }
});

test('required synonyms resolve to the right grape', () => {
  const want = {
    'Grenache': 'garnacha-tinta', 'Garnacha': 'garnacha-tinta', 'Carignan': 'mazuelo', 'Cariñena': 'mazuelo',
    'Tinta de Toro': 'tempranillo', 'Tinto Fino': 'tempranillo', 'Tinta del País': 'tempranillo',
    'Trebbiano di Soave': 'verdicchio-bianco', 'Glera': 'prosecco', 'Malbec': 'cot', 'Zinfandel': 'tribidrag', 'Primitivo': 'tribidrag',
    'Shiraz': 'syrah', 'Grauburgunder': 'pinot-gris', 'Pinot Grigio': 'pinot-gris', 'Spätburgunder': 'pinot-noir', 'Pinot Nero': 'pinot-noir',
    'Blauburgunder': 'pinot-noir', 'Weissburgunder': 'pinot-blanc', 'Pinot Bianco': 'pinot-blanc', 'Albariño': 'alvarinho',
    'Mourvèdre': 'monastrell', 'Mataro': 'monastrell', 'Friulano': 'sauvignonasse', 'Tocai Friulano': 'sauvignonasse',
    'Welschriesling': 'grasevina', 'Riesling Italico': 'grasevina', 'Olaszrizling': 'grasevina', 'Lemberger': 'blaufrankisch',
    'Kékfrankos': 'blaufrankisch', 'Trollinger': 'schiava-grossa', 'Vernatsch': 'schiava-grossa', 'Ugni Blanc': 'trebbiano-toscano',
    'Muscadet': 'melon', 'Rolle': 'vermentino', 'Cinsault': 'cinsaut', 'Maturana Tinta': 'trousseau',
    'Roter Silvaner': 'silvaner-r', 'Roter Sylvaner': 'silvaner-r',
  };
  for (const [name, id] of Object.entries(want)) {
    const hit = exact(name);
    assert.ok(hit, 'no match for ' + name);
    assert.equal(hit.id, id, name);
  }
});

test('search: accent/case-insensitive, synonym shown via', () => {
  const r = search('spatburg');
  assert.equal(r[0].grape.id, 'pinot-noir');
  assert.equal(r[0].via, 'Spätburgunder');
  assert.equal(search('RIESLING')[0].grape.id, 'riesling');
  assert.equal(search('albarino')[0].grape.id, 'alvarinho');
  assert.deepEqual(search('   '), []);
  assert.deepEqual(search('zzzzqq'), []);
});

test('descriptors use WSET clusters', () => {
  for (const [id, d] of Object.entries(descriptors)) {
    assert.ok(d.nl && d.en, id);
    assert.ok(CLUSTERS.has(d.cluster), `${id}: ${d.cluster}`);
  }
});
