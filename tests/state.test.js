import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, computeStats, normaliseState, KEY } from '../src/storage.js';
import { createGame, shareText, firstLetter, MAX_GUESSES, HINT_AT } from '../src/game.js';
import { schedule } from '../src/data.js';
import { safeUrl, priceOf, matchItems, lastSegment, loadProducts, loadItems, productsFor, similarProducts, withUtm, formatPrice, TASTINGS_URL } from '../src/shop.js';
import { pickLang, makeT, STRINGS } from '../src/i18n.js';
import { norm } from '../src/text.js';
import { grapes as allGrapes, byId, shopGrapes } from '../src/data.js';

function withStorage(impl, fn) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: impl });
  try { return fn(); } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete globalThis.localStorage;
  }
}
const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

test('storage that throws on access: store and game still work', () => {
  withStorage(() => { throw new Error('SecurityError'); }, () => {
    const store = createStore();
    assert.equal(store.persistent, false);
    const game = createGame({ puzzle: 1, store });
    const wrong = [...new Set(schedule.days)].find((id) => id !== game.answer.id);
    assert.ok(game.guess(wrong));
    assert.equal(game.guesses.length, 1);
    assert.equal(game.status, 'playing');
    assert.ok(game.guess(game.answer.id));
    assert.equal(game.status, 'won');
    store.reset();
  });
});

test('storage whose methods throw: store and game still work', () => {
  const boom = () => { throw new Error('QuotaExceeded'); };
  withStorage(() => ({ getItem: boom, setItem: boom, removeItem: boom }), () => {
    const store = createStore();
    const game = createGame({ puzzle: 3, store });
    assert.ok(game.guess(game.answer.id));
    assert.equal(game.status, 'won');
    store.reset();
  });
});

test('storage round trip, corrupt data ignored', () => {
  const ls = memory();
  withStorage(() => ls, () => {
    let store = createStore();
    let game = createGame({ puzzle: 5, store });
    const other = schedule.days.find((id) => id !== game.answer.id);
    game.guess(other);
    store = createStore();
    game = createGame({ puzzle: 5, store });
    assert.deepEqual(game.guesses, [other]);
    ls.setItem(KEY, '{not json');
    assert.deepEqual(createStore().state.guesses, {});
  });
});

test('storage normalises damaged state: null, wrong types, duplicates, unknown ids, too many guesses', () => {
  const load = (obj, raw) => { const ls = memory(); ls.setItem(KEY, raw !== undefined ? raw : JSON.stringify(obj)); return withStorage(() => ls, () => createStore().state); };
  const dedupe = load({ v: 2, guesses: null });
  assert.deepEqual(dedupe.guesses, {});
  assert.deepEqual(load({ v: 2, history: null }).history, {});
  assert.deepEqual(load({ v: 2, guesses: 'x', hints: 5, history: [] }).guesses, {});
  assert.deepEqual(load({ v: 2, guesses: { 3: 'merlot' } }).guesses, {}, 'a string instead of a list');
  assert.deepEqual(load({ v: 2, guesses: { 3: ['merlot', 'merlot', 'nope', 7, null, 'syrah'] } }).guesses, { 3: ['merlot', 'syrah'] });
  const many = allGrapes.slice(0, 12).map((g) => g.id);
  assert.equal(load({ v: 2, guesses: { 4: many } }).guesses[4].length, 6, 'clamped to six');
  assert.deepEqual(load({ v: 2, hints: { 5: [1, 1, 3, 'x', 2] } }).hints, { 5: [1, 2] });
  assert.deepEqual(load({ v: 2, history: { 1: 3, 2: 9, 3: -1, 4: 'a', 5: 2.5, 6: 0, abc: 1 } }).history, { 1: 3, 6: 0 });
  assert.equal(load({ v: 2, lang: 'fr', seenHelp: 'yes' }).lang, null);
  assert.equal(load({ v: 2, seenHelp: 'yes' }).seenHelp, false);
  assert.deepEqual(load(null, 'null').guesses, {});
  assert.deepEqual(load(null, '[1,2]').guesses, {});
  assert.deepEqual(load(null, '"text"').history, {});
  assert.deepEqual(normaliseState(undefined).guesses, {});
  // a game created from damaged state still plays
  const ls = memory(); ls.setItem(KEY, '{"v":2,"guesses":null,"hints":null,"history":null}');
  withStorage(() => ls, () => {
    const game = createGame({ puzzle: 3, store: createStore() });
    assert.ok(game.guess(game.answer.id)); assert.equal(game.status, 'won');
  });
  // duplicates stored for one puzzle never count twice
  const ls2 = memory(); ls2.setItem(KEY, JSON.stringify({ v: 2, guesses: { 3: ['merlot', 'merlot', 'merlot'] } }));
  withStorage(() => ls2, () => assert.equal(createGame({ puzzle: 3, store: createStore() }).guesses.length <= 1, true));
});

test('old gd:v1 key is removed on load', () => {
  const ls = memory();
  ls.setItem('gd:v1', '{"v":1}');
  withStorage(() => ls, () => { createStore(); assert.equal(ls.getItem('gd:v1'), null); });
});

test('six wrong guesses lose and are recorded; debug mode does not persist', () => {
  const ls = memory();
  withStorage(() => ls, () => {
    const store = createStore();
    const game = createGame({ puzzle: 2, store });
    const wrongs = [...new Set(schedule.days)].filter((id) => id !== game.answer.id).slice(0, 7);
    for (const id of wrongs) game.guess(id);
    assert.equal(game.guesses.length, MAX_GUESSES);
    assert.equal(game.status, 'lost');
    assert.equal(store.state.history[2], 0);
    const dbg = createGame({ puzzle: 9, store, persist: false });
    dbg.guess(dbg.answer.id);
    assert.equal(store.state.guesses[9], undefined);
  });
});

test('duplicate and unknown guesses are rejected', () => {
  const store = createStore();
  const game = createGame({ puzzle: 1, store, persist: false });
  const other = schedule.days.find((id) => id !== game.answer.id);
  assert.ok(game.guess(other));
  assert.equal(game.guess(other), null);
  assert.equal(game.guess('nope'), null);
});

test('stats and streaks', () => {
  const s = computeStats({ 1: 3, 2: 4, 3: 0, 4: 2, 5: 1 }, 5);
  assert.deepEqual([s.played, s.wins, s.winPct, s.current, s.best], [5, 4, 80, 2, 2]);
  assert.deepEqual(s.dist, [1, 1, 1, 1, 0, 0]);
  assert.equal(computeStats({ 4: 3 }, 5).current, 1, 'streak alive until today ends');
  assert.equal(computeStats({ 3: 3 }, 5).current, 0);
  assert.equal(computeStats({}, 1).winPct, 0);
});

test('storage key is gd:v2 and old v1 data is ignored', () => {
  assert.equal(KEY, 'gd:v2');
  const ls = memory();
  ls.setItem('gd:v1', JSON.stringify({ v: 1, guesses: { 1: ['merlot'] }, history: {} }));
  withStorage(() => ls, () => assert.deepEqual(createStore().state.guesses, {}));
});

test('hints unlock after 3 and 5 guesses, lock when the game ends, and persist', () => {
  const ls = memory();
  withStorage(() => ls, () => {
    let store = createStore();
    let game = createGame({ puzzle: 7, store });
    assert.deepEqual(HINT_AT, [3, 5]);
    const wrongs = [...new Set(schedule.days)].filter((id) => id !== game.answer.id);
    assert.equal(game.hintReady(1), false);
    assert.equal(game.useHint(1), false);
    game.guess(wrongs[0]); game.guess(wrongs[1]);
    assert.equal(game.hintReady(1), false, 'locked at 2 guesses');
    game.guess(wrongs[2]);
    assert.equal(game.hintReady(1), true);
    assert.equal(game.hintReady(2), false);
    assert.equal(game.useHint(1), true);
    assert.equal(game.useHint(1), false, 'once only');
    game.guess(wrongs[3]);
    assert.equal(game.hintReady(2), false);
    game.guess(wrongs[4]);
    assert.equal(game.hintReady(2), true);
    store = createStore();
    game = createGame({ puzzle: 7, store });
    assert.deepEqual(game.hints, [1], 'used hints survive a reload');
    assert.equal(game.useHint(2), true);
    game.guess(game.answer.id);
    assert.equal(game.status, 'won');
    assert.deepEqual(game.hints, [1, 2]);
    // locked once the game is over: an unused hint can no longer be opened
    const g2 = createGame({ puzzle: 8, store });
    const w2 = wrongs.filter((id) => id !== g2.answer.id);
    for (let i = 0; i < 6; i++) g2.guess(w2[i]);
    assert.equal(g2.status, 'lost');
    assert.equal(g2.hintReady(1), false); assert.equal(g2.hintReady(2), false);
    const dbg = createGame({ puzzle: 9, store, persist: false });
    for (let i = 0; i < 3; i++) dbg.guess(wrongs.filter((id) => id !== dbg.answer.id)[i]);
    dbg.useHint(1);
    assert.equal(store.state.hints[9], undefined, 'debug mode does not persist hints');
  });
});

test('hint 2: the first letter only, no length', () => {
  assert.equal(firstLetter('Corvina'), 'C');
  assert.equal(firstLetter('Corvinone'), 'C');
  assert.equal(firstLetter('müller-Thurgau'), 'M');
  assert.equal(firstLetter("Nero d'Avola"), 'N');
  assert.equal(firstLetter('Albariño'), 'A');
  assert.equal(makeT('nl')('hint2', { v: 'C' }), 'Begint met C');
  assert.equal(makeT('en')('hint2', { v: 'C' }), 'Starts with C');
});

test('share text: head line with hints, X/6 on loss, one emoji line per guess', () => {
  const store = createStore();
  const game = createGame({ puzzle: 42, store, persist: false });
  const other = schedule.days.find((id) => id !== game.answer.id);
  game.guess(other); game.guess(game.answer.id);
  const lines = shareText({ puzzle: 42, rows: game.rows(), won: true }).split('\n');
  assert.equal(lines[0], 'Grapedle #42 2/6');
  assert.equal(lines.length, 4);
  assert.match(lines[1], /^(🟩|🟥)(🟩|🟨|🟥)(⬆️|⬇️|🟩|⬜)(⬆️|⬇️|↔️|🟩)(🟩|🟨|🟥|⬜)$/u);
  assert.equal(lines[2], '🟩'.repeat(5));
  assert.equal(lines[3], 'vinobypalazzo.nl/grapedle');
  assert.equal(shareText({ puzzle: 42, rows: game.rows(), won: true, hints: 1 }).split('\n')[0], 'Grapedle #42 2/6 💡');
  assert.equal(shareText({ puzzle: 42, rows: game.rows(), won: true, hints: 2 }).split('\n')[0], 'Grapedle #42 2/6 💡💡');
  // loss: X/6 and six lines
  const lost = createGame({ puzzle: 43, store, persist: false });
  const wr = [...new Set(schedule.days)].filter((id) => id !== lost.answer.id);
  for (let i = 0; i < 6; i++) lost.guess(wr[i]);
  const l = shareText({ puzzle: 43, rows: lost.rows(), won: false, hints: 2 }).split('\n');
  assert.equal(l[0], 'Grapedle #43 X/6 💡💡');
  assert.equal(l.length, 8);
  for (const row of l.slice(1, 7)) assert.equal([...row.replace(/⬆️|⬇️|↔️/g, 'A')].length, 5);
  // exact example from the plan: a won game where the last row is all green
  const fake = (cells) => ({ cells: cells.map((s, i) => ({ key: ['colour', 'region', 'body', 'area', 'flavour'][i], status: s[0], arrow: s[1] || null })) });
  const rows = [
    fake([['red'], ['yellow'], ['neutral', 'up'], ['neutral', 'down'], ['yellow']]),
    fake([['red'], ['green'], ['green'], ['neutral', 'up'], ['yellow']]),
    fake([['green'], ['green'], ['grey'], ['neutral'], ['green']]),
    fake([['green'], ['green'], ['green'], ['green'], ['green']]),
  ];
  assert.equal(shareText({ puzzle: 12, rows, won: true, hints: 1 }),
    'Grapedle #12 4/6 💡\n🟥🟨⬆️⬇️🟨\n🟥🟩🟩⬆️🟨\n🟩🟩⬜↔️🟩\n🟩🟩🟩🟩🟩\nvinobypalazzo.nl/grapedle');
  const unknown = shareText({ puzzle: 1, rows: [fake([['green'], ['red'], ['neutral', 'up'], ['grey']])], won: false }).split('\n')[1];
  assert.equal(unknown, '🟩🟥⬆️⬜');
});

test('UTM parameters are appended correctly', () => {
  assert.equal(withUtm('/winkel'), '/winkel?utm_source=grapedle&utm_medium=game');
  assert.equal(withUtm('https://www.vinobypalazzo.nl/wijnproeverijen'), 'https://www.vinobypalazzo.nl/wijnproeverijen?utm_source=grapedle&utm_medium=game');
  assert.equal(withUtm('/winkel/x?variant=2'), '/winkel/x?variant=2&utm_source=grapedle&utm_medium=game');
  assert.equal(withUtm('/winkel/x?'), '/winkel/x?utm_source=grapedle&utm_medium=game');
  assert.equal(withUtm('/winkel/x#top'), '/winkel/x?utm_source=grapedle&utm_medium=game#top');
  assert.equal(withUtm('/winkel/x?a=1#top'), '/winkel/x?a=1&utm_source=grapedle&utm_medium=game#top');
  const once = withUtm('/winkel/x');
  assert.equal(withUtm(once), once, 'never doubled');
  assert.equal(TASTINGS_URL, 'https://www.vinobypalazzo.nl/wijnproeverijen');
});

test('shop: category matching handles nested names, price, products', () => {
  assert.equal(lastSegment('Druivensoort/Syrah'), 'Syrah');
  assert.equal(lastSegment('Syrah'), 'Syrah');
  const items = [
    { title: 'A', categories: ['Druivensoort/Syrah'] }, { title: 'B', categories: ['Syrah', 'Wijn'] },
    { title: 'C', categories: ['Merlot'] }, { title: 'D' },
  ];
  assert.deepEqual(matchItems(items, 'syrah').map((i) => i.title), ['A', 'B']);
  assert.deepEqual(matchItems([{ title: 'T', categories: ['Tinta de Toro (Tempranillo)'] }, { title: 'U', categories: ['Druiven/Tempranillo'] }], 'tempranillo').length, 2);
  assert.deepEqual(matchItems([{ title: 'G', categories: ['Grenache'] }, { title: 'H', categories: ['Garnacha'] }], 'garnacha-tinta').length, 2);
  assert.deepEqual(matchItems([{ title: 'S', categories: ['Roter Sylvaner'] }], 'silvaner').length, 1);
  assert.equal(matchItems(items, 'riesling').length, 0);
  assert.equal(productsFor(Array.from({ length: 9 }, (_, i) => ({ title: 'S' + i, categories: ['Syrah'], fullUrl: '/winkel/s' + i })), 'syrah').length, 4, 'at most 4 tiles');
  assert.deepEqual(priceOf({ structuredContent: { priceMoney: { value: '14.95', currency: 'EUR' } } }), { value: 14.95, currency: 'EUR', from: false });
  assert.equal(priceOf({ structuredContent: { variants: [{ priceMoney: { value: '21.00' } }, { priceMoney: { value: '18.50' } }] } }).value, 18.5);
  assert.equal(priceOf({}), null);
  assert.match(formatPrice({ value: 14.95, currency: 'EUR', from: false }, 'nl'), /14,95/);
});

test('shop: only https and relative URLs reach href/src', () => {
  assert.equal(safeUrl('https://www.vinobypalazzo.nl/winkel/x'), 'https://www.vinobypalazzo.nl/winkel/x');
  assert.equal(safeUrl('/winkel/x'), '/winkel/x');
  assert.equal(safeUrl('winkel/x'), 'winkel/x');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<b>', 'http://example.com/x', '//evil.example/x', '/\\evil.example', 'vbscript:x', 'ftp://x', '', null, undefined, ' javascript:alert(1)', 'https:///x', 'https://', '\tjavascript:x', '/ok\nevil'])
    assert.equal(safeUrl(bad), '', String(bad));
  const items = [
    { title: 'Bad link', categories: ['Syrah'], fullUrl: 'javascript:alert(1)', assetUrl: 'https://cdn.example/x.jpg' },
    { title: 'Bad image', categories: ['Syrah'], fullUrl: '/winkel/a', assetUrl: 'data:image/svg+xml,<svg onload=alert(1)>' },
    { title: 'Http image', categories: ['Syrah'], fullUrl: 'https://www.vinobypalazzo.nl/winkel/b', assetUrl: 'http://cdn.example/x.jpg' },
  ];
  const out = productsFor(items, 'syrah');
  assert.deepEqual(out.map((p) => p.title), ['Bad image', 'Http image'], 'a product without a safe link is dropped');
  assert.equal(out[0].image, ''); assert.equal(out[1].image, ''); assert.equal(out[1].url, 'https://www.vinobypalazzo.nl/winkel/b');
});

test('shop: similar wines for a grape we do not stock (max 3, same colour, one per grape first)', () => {
  const answer = byId.get('chardonnay'); // not stocked
  assert.ok(!answer.stocked);
  const cats = (id) => Object.keys(shopGrapes).filter((c) => shopGrapes[c] === id)[0];
  const stockedWhite = allGrapes.filter((g) => g.stocked && g.colour === 'white');
  const items = stockedWhite.flatMap((g) => [1, 2].map((n) => ({ title: `${g.id}-${n}`, categories: [cats(g.id)], fullUrl: '/x' })));
  const out = similarProducts(items, answer);
  assert.equal(out.length, 3);
  const grapesOut = out.map((p) => p.title.replace(/-\d$/, ''));
  assert.equal(new Set(grapesOut).size, 3, 'three different grapes first');
  for (const id of grapesOut) assert.equal(byId.get(id).colour, 'white');
  // only one similar grape in the shop: its wines fill the slots
  const one = similarProducts(items.filter((i) => i.title.startsWith('pinot-gris')), answer);
  assert.deepEqual(one.map((p) => p.title), ['pinot-gris-1', 'pinot-gris-2']);
  assert.deepEqual(similarProducts([], answer), []);
});

test('shop: dev fixture works only with the dev flag; failures and timeouts give null / []', async () => {
  globalThis.__GD_DEV__ = true;
  try {
    const items = await loadItems({ mock: '1' });
    assert.ok(items.length >= 1);
    const mock = await loadProducts('merlot', { mock: '1' });
    assert.ok(mock.length >= 1 && mock.length <= 4);
    assert.ok(mock[0].title && mock[0].url);
    assert.deepEqual(await loadProducts('merlot', { mock: 'none' }), []);
    assert.equal(await loadItems({ mock: 'fail' }), null);
  } finally { delete globalThis.__GD_DEV__; }
  // without the flag a ?mockShop= value is ignored and the real fetch runs
  const f = globalThis.fetch;
  try {
    globalThis.fetch = () => Promise.reject(new Error('offline'));
    assert.equal(await loadItems({ mock: '1' }), null);
    assert.deepEqual(await loadProducts('merlot'), []);
    // a shop that never answers is cut off at the timeout
    globalThis.fetch = (url, opts) => new Promise((_, rej) => { opts.signal.addEventListener('abort', () => rej(new Error('aborted'))); });
    const t0 = Date.now();
    assert.equal(await loadItems({ timeoutMs: 80 }), null);
    assert.ok(Date.now() - t0 < 1000);
    // an HTTP error is a failure too
    globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
    assert.equal(await loadItems({}), null);
  } finally { globalThis.fetch = f; }
});

test('i18n: both languages complete, lang selection', () => {
  const nl = Object.keys(STRINGS.nl).sort(), en = Object.keys(STRINGS.en).sort();
  assert.deepEqual(nl, en);
  assert.equal(pickLang(null, null), 'nl');
  assert.equal(pickLang('en', 'nl'), 'en');
  assert.equal(pickLang(null, 'en'), 'en');
  assert.equal(pickLang('fr', 'xx'), 'nl');
  assert.equal(makeT('nl')('win', { n: 4 }), 'Goed geraden in 4 pogingen');
  assert.equal(makeT('en')('lose', { grape: 'Syrah' }), 'Unlucky! It was Syrah');
  assert.equal(makeT('nl')('hint1', { v: 'Barolo' }), 'Bekend van: Barolo');
  assert.equal(makeT('en')('hint1', { v: 'Barolo' }), 'Known for: Barolo');
  assert.equal(makeT('nl')('help_area'), 'hoeveel hectare jouw druif wereldwijd heeft. De pijl wijst naar het antwoord: ↑ meer, ↓ minder.');
  assert.equal(makeT('nl')('legend'), '✓ groen = zelfde aroma, gele rand = zelfde soort aroma');
  assert.ok(!('area_up3' in STRINGS.nl) && !('area_up3' in STRINGS.en), 'band strings are gone');
  assert.match(makeT('nl')('help_flavour'), /minstens 2 aroma/);
  assert.match(makeT('en')('help_flavour'), /at least 2 aromas/);
  for (const lang of ['nl', 'en']) for (const k of ['colour', 'region', 'body', 'area', 'flavour']) assert.ok(STRINGS[lang]['help_' + k] && STRINGS[lang]['col_' + k], k);
  for (let i = 1; i <= 5; i++) for (const lang of ['nl', 'en']) assert.ok(STRINGS[lang]['v_body_' + i], 'v_body_' + i);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => STRINGS.nl['v_body_' + i]), ['Licht', 'Medium-licht', 'Medium', 'Medium-vol', 'Vol']);
  assert.deepEqual([1, 2, 3, 4, 5].map((i) => STRINGS.en['v_body_' + i]), ['Light', 'Medium-light', 'Medium', 'Medium-full', 'Full']);
  assert.equal(STRINGS.nl.col_body, 'Body'); assert.equal(STRINGS.en.col_body, 'Body');
  for (const lang of ['nl', 'en']) for (let n = 1; n <= 6; n++) assert.ok(STRINGS[lang]['cheer' + n], 'cheer' + n);
  assert.equal(makeT('nl')('cheer1'), 'Onwaarschijnlijk!');
  assert.equal(makeT('nl')('cheer6'), 'Op het nippertje');
  assert.equal(makeT('nl')('pickFromList'), 'Kies een druif uit de lijst');
  assert.equal(makeT('en')('pickFromList'), 'Pick a grape from the list');
  assert.equal(makeT('nl')('practiceLabel', { n: 12 }), 'Oefenpuzzel #12 — telt niet mee');
  assert.equal(makeT('nl')('teaserTitle', { date: '1 november 2026' }), 'Grapedle start op 1 november 2026');
  assert.ok(!('col_climate' in STRINGS.nl), 'no climate strings');
  assert.equal(norm('Spätburgunder'), 'spatburgunder');
});
