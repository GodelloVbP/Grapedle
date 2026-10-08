import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import grapes from '../data/grapes.json' with { type: 'json' };
import countries from '../data/countries.json' with { type: 'json' };
import descriptors from '../data/descriptors.json' with { type: 'json' };
import shopGrapes from '../data/shop-grapes.json' with { type: 'json' };
import { exact, search } from '../src/search.js';
import { norm } from '../src/text.js';

const byId = new Map(grapes.map((g) => [g.id, g]));
const pool = grapes.filter((g) => g.answer);
const csv = (f) => readFileSync(new URL('../data/source/' + f, import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
const poolIds = csv('answer_pool.csv').map((r) => r[0]);
const CLUSTERS = new Set(['nutty', 'earthy', 'floral', 'green-fruit', 'citrus', 'stone-fruit', 'tropical', 'red-fruit', 'black-fruit', 'dried-fruit', 'herbaceous', 'herbal', 'pungent-spice', 'other']);

test('answer pool is exactly the 55 ids in answer_pool.csv; every other grape stays guessable', () => {
  assert.equal(poolIds.length, 55);
  assert.deepEqual(pool.map((g) => g.id).sort(), [...poolIds].sort());
  assert.ok(grapes.length >= 240 && grapes.length <= 280, String(grapes.length));
  assert.equal(byId.size, grapes.length, 'unique ids');
  for (const g of grapes) assert.match(g.id, /^[a-z0-9-]+$/);
  assert.ok(!byId.has('silvaner-r'), 'silvaner-r is dropped');
  for (const g of grapes.filter((x) => !x.answer)) assert.equal(g.answer, false);
});

test('every grape has colour, country, area; pool grapes also region, climate and a hint', () => {
  for (const g of grapes) {
    assert.ok(['white', 'red'].includes(g.colour), g.id);
    assert.ok(countries[g.country], `${g.id} country ${g.country}`);
    assert.ok(g.areaHa > 0, g.id);
    assert.ok(g.sources && typeof g.sources === 'object', g.id);
    assert.ok(g.climate === null || ['koel', 'warm', 'heet'].includes(g.climate), g.id);
    for (const old of ['origin', 'topCountries', 'parents', 'ripening', 'trendPct']) assert.ok(!(old in g), `${g.id}.${old}`);
  }
  for (const g of pool) {
    assert.ok(g.region && typeof g.region === 'string', g.id);
    assert.ok(Number.isFinite(g.lat) && Number.isFinite(g.lon), g.id);
    assert.ok(['koel', 'warm', 'heet'].includes(g.climate), g.id);
    assert.ok(g.hint && g.hint.nl && g.hint.en, g.id);
    assert.ok(g.sources.region && g.sources.climate && g.sources.hint, g.id);
  }
});

test('signature regions: file coordinates and climate land in the records; others use a country point', () => {
  const sig = csv('signature_regions.csv');
  assert.equal(sig.length, 110);
  for (const r of sig) {
    const g = byId.get(r[0]);
    assert.ok(g, r[0]);
    assert.equal(g.region, r[1]); assert.equal(g.country, r[2]);
    assert.equal(g.lat, Number(r[3])); assert.equal(g.lon, Number(r[4])); assert.equal(g.climate, r[5]);
  }
  const sigIds = new Set(sig.map((r) => r[0]));
  for (const g of grapes.filter((x) => !sigIds.has(x.id))) {
    assert.equal(g.region, null, g.id); assert.equal(g.lat, null, g.id);
  }
  for (const [c, v] of Object.entries(countries)) {
    assert.ok(v.nl && v.en, c);
    assert.ok(Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180, c);
  }
  assert.deepEqual([countries.FR.lat, countries.FR.lon], [46.5, 2.5]);
  assert.deepEqual([countries.US.lat, countries.US.lon], [37.5, -120.5]);
  assert.deepEqual([countries.AR.lat, countries.AR.lon], [-33, -68.8]);
  const used = new Set(grapes.map((g) => g.country));
  for (const c of used) assert.ok(countries[c], 'missing ' + c);
  for (const c of Object.keys(countries)) assert.ok(used.has(c), 'unused country ' + c);
});

test('flavours: 1-4 known descriptors, book overrides batches, unknown stays null', () => {
  const d = (id) => byId.get(id).flavours;
  for (const g of grapes) {
    if (g.flavours === null) { assert.ok(!g.sources.flavours, g.id); continue; }
    assert.ok(g.flavours.length >= 1 && g.flavours.length <= 4, g.id);
    assert.equal(new Set(g.flavours).size, g.flavours.length, g.id);
    for (const a of g.flavours) assert.ok(descriptors[a], `${g.id}: ${a}`);
    assert.ok(Array.isArray(g.sources.flavours) && g.sources.flavours.length, g.id);
  }
  const book = JSON.parse(readFileSync(new URL('../data/source/aromas_book.json', import.meta.url), 'utf8'));
  for (const b of book) {
    assert.deepEqual(d(b.id), b.aromas.map((a) => a.d).slice(0, 4), b.id);
    assert.equal(byId.get(b.id).sources.flavours[0].name, 'Gatinois, Explore Wine Maps');
  }
  // batch ordering: aromas backed by 2+ sites first, then file order, max 4
  assert.deepEqual(d('cabernet-sauvignon'), ['blackcurrant', 'mint', 'black-cherry', 'green-pepper']);
  assert.deepEqual(byId.get('chardonnay').sources.flavours.map((s) => s.name).sort(), ['Jancis Robinson', 'Wikipedia', 'Wine Folly']);
  // pool grapes that lack aroma data are listed here so a new gap does not slip in unnoticed
  assert.deepEqual(pool.filter((g) => !g.flavours).map((g) => g.id), [], 'every pool grape has aromas');
});

test('display names and small print', () => {
  const want = {
    'garnacha-tinta': 'Grenache', mazuelo: 'Carignan', melon: 'Muscadet', prosecco: 'Glera', cot: 'Malbec',
    tribidrag: 'Zinfandel / Primitivo', alvarinho: 'Albariño', grasevina: 'Welschriesling', sauvignonasse: 'Friulano',
    monastrell: 'Monastrell / Mourvèdre', 'corvina-veronese': 'Corvina', 'lambrusco-salamino': 'Lambrusco',
    'verdicchio-bianco': 'Verdicchio', 'muller-thurgau': 'Müller-Thurgau', blaufrankisch: 'Blaufränkisch', silvaner: 'Silvaner', trousseau: 'Trousseau',
  };
  for (const [id, name] of Object.entries(want)) assert.equal(byId.get(id).name, name, id);
  assert.deepEqual(byId.get('prosecco').small, { nl: 'druif van Prosecco', en: 'the Prosecco grape' });
  assert.equal(byId.get('garnacha-tinta').official, 'Garnacha Tinta');
  assert.equal(byId.get('melon').official, 'Melon');
  assert.equal(byId.get('corvina-veronese').official, 'Corvina Veronese');
});

test('stocked and weekend-only flags match answer_pool.csv', () => {
  for (const [id, stocked, weekend] of csv('answer_pool.csv')) {
    const g = byId.get(id);
    assert.equal(!!g.stocked, stocked === 'yes', id);
    assert.equal(!!g.weekendOnly, weekend === 'yes', id);
  }
  assert.ok(grapes.filter((g) => !g.answer).every((g) => !g.stocked && !g.weekendOnly));
  assert.equal(pool.filter((g) => g.weekendOnly).length, 9);
});

test('shop-grapes: every category maps to a stocked grape in the answer pool', () => {
  const required = ['Auxerrois', 'Cabernet Sauvignon', 'Cinsault', 'Corvina', 'Corvinone', 'Croatina', 'Garnacha', 'Gewurztraminer', 'Graciano', 'Grenache', 'Grenache Blanc', 'Grüner Veltliner', 'Marsanne', 'Maturana Tinta', 'Mazuelo', 'Merlot', 'Pinot Blanc', 'Pinot Gris', 'Pinot Noir', 'Riesling', 'Rondinella', 'Roter Sylvaner', 'Roussanne', 'Garganega', 'Trebbiano di Soave', 'Syrah', 'Tempranillo', 'Tinta de Toro (Tempranillo)'];
  for (const k of required) assert.ok(shopGrapes[k], 'missing key ' + k);
  assert.equal(Object.keys(shopGrapes).length, required.length);
  const poolSet = new Set(poolIds);
  for (const [k, id] of Object.entries(shopGrapes)) {
    assert.ok(poolSet.has(id), `${k} -> ${id} is not in the answer pool`);
    assert.ok(byId.get(id).stocked, `${k} -> ${id} is not flagged stocked`);
  }
  assert.equal(new Set(Object.values(shopGrapes)).size, 26, 'the shop sells 26 grapes');
  assert.equal(shopGrapes.Grenache, 'garnacha-tinta');
  assert.equal(shopGrapes['Roter Sylvaner'], 'silvaner');
  assert.equal(shopGrapes['Maturana Tinta'], 'trousseau');
  assert.equal(shopGrapes['Trebbiano di Soave'], 'verdicchio-bianco');
  assert.equal(pool.filter((g) => g.stocked).length, 26);
});

test('synonyms are unique across grapes, short, and never equal another grape name', () => {
  const seen = new Map();
  for (const g of grapes) {
    for (const k of [g.name, ...g.synonyms].map(norm)) {
      assert.ok(!seen.has(k) || seen.get(k) === g.id, `"${k}" used by ${seen.get(k)} and ${g.id}`);
      seen.set(k, g.id);
    }
    for (const s of g.synonyms) {
      assert.ok(s.length <= 30, `${g.id}: ${s}`);
      assert.ok(!/[()]/.test(s), `${g.id}: ${s}`);
      assert.notEqual(norm(s), norm(g.name), `${g.id} synonym equals its name`);
    }
  }
  assert.ok(grapes.reduce((n, g) => n + g.synonyms.length, 0) < 500);
});

test('required names resolve to the right grape (display, official and old names all work)', () => {
  const want = {
    'Grenache': 'garnacha-tinta', 'Garnacha': 'garnacha-tinta', 'Garnacha Tinta': 'garnacha-tinta', 'Carignan': 'mazuelo', 'Mazuelo': 'mazuelo', 'Cariñena': 'mazuelo',
    'Tinta de Toro': 'tempranillo', 'Tinto Fino': 'tempranillo', 'Tinta del País': 'tempranillo',
    'Trebbiano di Soave': 'verdicchio-bianco', 'Verdicchio Bianco': 'verdicchio-bianco', 'Verdicchio': 'verdicchio-bianco',
    'Glera': 'prosecco', 'Prosecco': 'prosecco', 'Malbec': 'cot', 'Côt': 'cot', 'Zinfandel': 'tribidrag', 'Primitivo': 'tribidrag', 'Tribidrag': 'tribidrag', 'Zinfandel / Primitivo': 'tribidrag',
    'Shiraz': 'syrah', 'Grauburgunder': 'pinot-gris', 'Pinot Grigio': 'pinot-gris', 'Spätburgunder': 'pinot-noir', 'Pinot Nero': 'pinot-noir',
    'Blauburgunder': 'pinot-noir', 'Weissburgunder': 'pinot-blanc', 'Pinot Bianco': 'pinot-blanc', 'Albariño': 'alvarinho', 'Alvarinho': 'alvarinho',
    'Mourvèdre': 'monastrell', 'Monastrell': 'monastrell', 'Mataro': 'monastrell', 'Friulano': 'sauvignonasse', 'Sauvignonasse': 'sauvignonasse',
    'Welschriesling': 'grasevina', 'Grasevina': 'grasevina', 'Lemberger': 'blaufrankisch', 'Kékfrankos': 'blaufrankisch',
    'Muscadet': 'melon', 'Melon': 'melon', 'Rolle': 'vermentino', 'Cinsault': 'cinsaut',
    'Maturana Tinta': 'trousseau', 'Corvina': 'corvina-veronese', 'Corvina Veronese': 'corvina-veronese',
    'Lambrusco': 'lambrusco-salamino', 'Lambrusco Salamino': 'lambrusco-salamino', 'Müller-Thurgau': 'muller-thurgau', 'Muller Thurgau': 'muller-thurgau',
    'Roter Silvaner': 'silvaner', 'Roter Sylvaner': 'silvaner', 'Sylvaner': 'silvaner',
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
  assert.equal(search('primitivo')[0].grape.id, 'tribidrag');
  assert.deepEqual(search('   '), []);
  assert.deepEqual(search('zzzzqq'), []);
});

test('descriptors use WSET clusters, including nutty and earthy', () => {
  for (const [id, d] of Object.entries(descriptors)) {
    assert.ok(d.nl && d.en, id);
    assert.ok(CLUSTERS.has(d.cluster), `${id}: ${d.cluster}`);
  }
  assert.ok(Object.values(descriptors).some((d) => d.cluster === 'nutty'));
  assert.ok(Object.values(descriptors).some((d) => d.cluster === 'earthy'));
});
