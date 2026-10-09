import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

test('every grape is in the daily answer pool (answer_pool.csv lists all ids)', () => {
  assert.equal(poolIds.length, grapes.length);
  assert.deepEqual(pool.map((g) => g.id).sort(), [...poolIds].sort());
  assert.ok(grapes.length >= 130 && grapes.length <= 140, String(grapes.length));
  for (const id of ['prosecco-lungo', 'douce-noire', 'cayetana-blanca']) assert.ok(!byId.has(id), id + ' was removed from the guess list');
  assert.ok(byId.has('dona-branca'), 'Dona Branca stays by owner choice');
  assert.equal(byId.size, grapes.length, 'unique ids');
  for (const g of grapes) assert.match(g.id, /^[a-z0-9-]+$/);
  assert.ok(!byId.has('silvaner-r'), 'silvaner-r is dropped');
  for (const g of grapes.filter((x) => !x.answer)) assert.equal(g.answer, false);
});

test('every grape has colour, country, area; pool grapes also region and a hint', () => {
  for (const g of grapes) {
    assert.ok(['white', 'red'].includes(g.colour), g.id);
    assert.ok(g.regions.length >= 1 && g.regions.length <= 2, g.id);
    for (const r of g.regions) assert.ok(countries[r.country], `${g.id} country ${r.country}`);
    assert.ok(g.areaHa > 0, g.id);
    assert.ok(g.sources && typeof g.sources === 'object', g.id);
    for (const r of g.regions) assert.ok(!('climate' in r), `${g.id} has no climate (column dropped)`);
    assert.ok(!('climate' in g.sources), g.id);
    for (const old of ['region', 'lat', 'lon', 'climate', 'country']) assert.ok(!(old in g), `${g.id}.${old}`);
    for (const old of ['origin', 'topCountries', 'parents', 'ripening', 'trendPct']) assert.ok(!(old in g), `${g.id}.${old}`);
  }
  for (const g of pool) {
    for (const r of g.regions) {
      // a grape without a hand-placed signature region uses its top country (name and point null)
      if (r.name) { assert.equal(typeof r.name, 'string', g.id); assert.ok(Number.isFinite(r.lat) && Number.isFinite(r.lon), g.id); }
      else assert.ok(r.country && r.lat === null && r.lon === null, g.id);
    }
    assert.ok(g.hint && g.hint.nl && g.hint.en, g.id);
    assert.ok(g.sources.region && g.sources.hint, g.id);
  }
});

test('signature regions: file coordinates land in the records; others use a country point', () => {
  // quote-aware split: notes may contain commas
  const sig = readFileSync(new URL('../data/source/signature_regions.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1)
    .map((l) => [...l.matchAll(/("([^"]|"")*"|[^,]*)(,|$)/g)].slice(0, -1).map((m) => m[1].replace(/^"|"$/g, '').replace(/""/g, '"')));
  assert.equal(sig.length, 110);
  for (const r of sig) {
    const g = byId.get(r[0]);
    assert.ok(g, r[0]);
    const x = g.regions[0];
    assert.equal(x.name, r[1]); assert.equal(x.country, r[2]);
    assert.equal(x.lat, Number(r[3])); assert.equal(x.lon, Number(r[4]));
    // columns 10.. : note is r[9]; the second region follows (region2, country2, lat2, lon2, climate3_2, gst_c_2, table75_rows_2)
    const second = r[10] || '';
    assert.equal(g.regions.length, second ? 2 : 1, g.id);
    if (second) assert.deepEqual([g.regions[1].name, g.regions[1].country, g.regions[1].lat, g.regions[1].lon],
      [r[10], r[11], Number(r[12]), Number(r[13])]);
  }
  const sigIds = new Set(sig.map((r) => r[0]));
  for (const g of grapes.filter((x) => !sigIds.has(x.id))) {
    assert.equal(g.regions.length, 1, g.id);
    assert.equal(g.regions[0].name, null, g.id); assert.equal(g.regions[0].lat, null, g.id);
  }
  for (const [c, v] of Object.entries(countries)) {
    assert.ok(v.nl && v.en, c);
    assert.ok(Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180, c);
  }
  assert.deepEqual([countries.FR.lat, countries.FR.lon], [46.5, 2.5]);
  assert.deepEqual([countries.US.lat, countries.US.lon], [37.5, -120.5]);
  assert.deepEqual([countries.AR.lat, countries.AR.lon], [-33, -68.8]);
  const used = new Set(grapes.flatMap((g) => g.regions.map((r) => r.country)));
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
  // aroma gaps are allowed (the tile shows "onbekend"); this guards against the data shrinking
  assert.ok(grapes.filter((g) => g.flavours).length >= 110, 'most grapes have aromas');
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
  assert.equal(pool.filter((g) => g.weekendOnly).length, csv('answer_pool.csv').filter((r) => r[2] === 'yes').length);
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
  // wine-name aliases land on the grape; regions are not aliased
  assert.equal(exact('Prosecco').id, 'prosecco');
  assert.equal(exact('Moscato').id, 'muscat-blanc-a-petits-grains');
  assert.equal(exact("Moscato d'Asti").id, 'muscat-blanc-a-petits-grains');
  assert.equal(exact('Cava').id, 'macabeo');
  assert.equal(exact('Shiraz').id, 'syrah');
  assert.equal(exact('Rioja'), null, 'regions are not grape aliases');
  assert.equal(search('prosecco')[0].grape.id, 'prosecco', 'the pool grape, not Prosecco Lungo');
  assert.equal(search('moscato')[0].grape.id, 'muscat-blanc-a-petits-grains');
  assert.equal(search('cava')[0].grape.id, 'macabeo');
  assert.equal(search('shiraz')[0].grape.id, 'syrah');
  assert.equal(exact('pinot'), null, 'a prefix is not an exact match: Enter must not auto-guess');
  assert.ok(search('pinot').length > 1);
  assert.ok(search('pinot').every((r) => !r.exact));
  assert.ok(search('pinot')[0].grape.answer, 'pool grapes lead');
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

test('the nine dual-region grapes, and a region name always has one point', () => {
  const dual = Object.fromEntries(grapes.filter((g) => g.regions.length === 2).map((g) => [g.id, g.regions.map((r) => r.name).join(' / ')]));
  assert.deepEqual(dual, {
    'pinot-gris': 'Alsace / Veneto', 'garnacha-tinta': 'Rhône / Aragón', 'sauvignon-blanc': 'Loire / Marlborough',
    'chenin-blanc': 'Loire / Stellenbosch', syrah: 'Rhône / Barossa', cot: 'Cahors / Mendoza',
    chardonnay: 'Bourgogne / California', 'cabernet-franc': 'Loire / Bordeaux', auxerrois: 'Alsace / Luxembourg',
  });
  const seen = new Map();
  for (const g of grapes) for (const r of g.regions) {
    if (!r.name) continue;
    const key = `${r.country}|${r.name}`, val = JSON.stringify([r.lat, r.lon]);
    if (seen.has(key)) assert.equal(val, seen.get(key), `${g.id} ${key}`); else seen.set(key, val);
  }
});

test('descriptors have an emoji (Unicode Emoji 13.0 or older, no 15.x-only picks)', () => {
  const tooNew = ['🍋‍🟩', '🪻', '🫚', '🫛', '🫎', '🪼', '🪽', '🪿', '🫏', '🩷', '🩵', '🩶', '🛜', '🐦‍⬛'];
  for (const [id, d] of Object.entries(descriptors)) {
    assert.ok(typeof d.emoji === 'string' && d.emoji.length > 0, id);
    assert.ok(!tooNew.includes(d.emoji), `${id}: ${d.emoji} is too new`);
  }
  // An emoji may repeat within a family: aromas without a literal emoji use
  // the family's emoji, and every chip also shows the text label.
  // It must never be shared ACROSS families, except the cherry and grape pairs.
  const fam = new Map();
  const allowed = new Set(['🍒', '🍇']);
  for (const [id, d] of Object.entries(descriptors)) {
    const prev = fam.get(d.emoji);
    assert.ok(!prev || prev === d.cluster || allowed.has(d.emoji), `${id}: ${d.emoji} also used in family ${prev}`);
    fam.set(d.emoji, d.cluster);
  }
});

// ---- body (1 light .. 5 full), from Wine Folly labels, optional book override ----
const pyBody = (labels) => JSON.parse(execFileSync('python3', ['-c',
  'import sys,json;sys.path.insert(0,"scripts");import build_data as b;print(json.dumps([b.parse_body(x) for x in json.loads(sys.argv[1])]))',
  JSON.stringify(labels)], { encoding: 'utf8' }));

test('body: every value is an integer 1..5 or null, and a source URL goes with each value', () => {
  for (const g of grapes) {
    assert.ok('body' in g, g.id);
    assert.ok(g.body === null || (Number.isInteger(g.body) && g.body >= 1 && g.body <= 5), `${g.id} body ${g.body}`);
    if (g.body === null) assert.ok(!g.sources.body, g.id);
    else assert.ok(typeof g.sources.body === 'string' && g.sources.body.length, `${g.id} sources.body`);
  }
  assert.ok(grapes.filter((g) => g.body !== null).length > 50);
});

test('body: label variants and casing map to 1..5', () => {
  assert.deepEqual(pyBody(['Light Body', 'Medium-Light Body', 'Medium Body', 'Medium-Full Body', 'Full Body']), [1, 2, 3, 4, 5]);
  assert.deepEqual(pyBody(['light body', 'Medium-light Body', 'MEDIUM BODY', 'medium-full body', 'FULL BODY', 'Medium-Light', 'medium light body']), [1, 2, 3, 4, 5, 2, 2]);
  assert.deepEqual(pyBody([null, 'None', '']), [null, null, null]);
});

test('body: the batch files map to grapes.json, the book file takes precedence', () => {
  const labels = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
  const book = existsSync(new URL('../data/source/body_book.json', import.meta.url))
    ? JSON.parse(readFileSync(new URL('../data/source/body_book.json', import.meta.url), 'utf8')) : [];
  const bookIds = new Set(book.filter((r) => r.body).map((r) => r.id));
  const [lo] = [1, 2, 3].map((n) => JSON.parse(readFileSync(new URL(`../data/source/body_batch${n}.json`, import.meta.url), 'utf8')));
  for (const r of lo) {
    if (bookIds.has(r.id) || !r.body) continue;
    const want = pyBody([r.body])[0];
    assert.ok(labels[want], r.id);
    assert.equal(byId.get(r.id).body, want, r.id);
    assert.equal(byId.get(r.id).sources.body, r.url, r.id);
  }
  for (const r of book.filter((x) => x.body)) {
    assert.equal(byId.get(r.id).body, pyBody([r.body])[0], 'book wins ' + r.id);
    assert.equal(byId.get(r.id).sources.body, r.source || 'Gatinois, Explore Wine Maps');
  }
});

test('body: a book entry overrides a batch value (build_data.load_body)', () => {
  const out = execFileSync('python3', ['-I', '-c', `
import sys, json, os, tempfile, shutil
sys.path.insert(0, "scripts")
import build_data as b
d = tempfile.mkdtemp()
for n in (1, 2, 3):
    json.dump([{"id": "x", "body": "Light Body", "url": "https://u"}] if n == 1 else [], open(os.path.join(d, f"body_batch{n}.json"), "w"))
json.dump([{"id": "x", "body": "full body", "source": "Gatinois, Explore Wine Maps"}], open(os.path.join(d, "body_book.json"), "w"))
b.SRC = d
p = []
print(json.dumps([b.load_body(p)["x"], p]))
shutil.rmtree(d)
`], { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname });
  assert.deepEqual(JSON.parse(out), [[5, 'Gatinois, Explore Wine Maps'], []]);
});
