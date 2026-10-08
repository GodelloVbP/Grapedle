import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, computeStats, KEY } from '../src/storage.js';
import { createGame, shareText, MAX_GUESSES } from '../src/game.js';
import { schedule } from '../src/data.js';
import { priceOf, matchItems, lastSegment, loadProducts, formatPrice } from '../src/shop.js';
import { pickLang, makeT, STRINGS } from '../src/i18n.js';
import { norm } from '../src/text.js';

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

test('share text', () => {
  const store = createStore();
  const game = createGame({ puzzle: 42, store, persist: false });
  const other = schedule.days.find((id) => id !== game.answer.id);
  game.guess(other); game.guess(game.answer.id);
  const lines = shareText({ puzzle: 42, rows: game.rows(), won: true }).split('\n');
  assert.equal(lines[0], 'Grapedle #42 2/6');
  assert.equal(lines.length, 4);
  assert.match(lines[1], /^[🟩🟨🟥⬜]{9}$/u);
  assert.equal(lines[2], '🟩'.repeat(9));
  assert.equal(lines[3], 'vinobypalazzo.nl/grapedle');
});

test('shop: category matching handles nested names, price, mock', async () => {
  assert.equal(lastSegment('Druivensoort/Syrah'), 'Syrah');
  assert.equal(lastSegment('Syrah'), 'Syrah');
  const items = [
    { title: 'A', categories: ['Druivensoort/Syrah'] }, { title: 'B', categories: ['Syrah', 'Wijn'] },
    { title: 'C', categories: ['Merlot'] }, { title: 'D' },
  ];
  assert.deepEqual(matchItems(items, 'syrah').map((i) => i.title), ['A', 'B']);
  assert.deepEqual(matchItems([{ title: 'T', categories: ['Tinta de Toro (Tempranillo)'] }, { title: 'U', categories: ['Druiven/Tempranillo'] }], 'tempranillo').length, 2);
  assert.deepEqual(matchItems([{ title: 'G', categories: ['Grenache'] }, { title: 'H', categories: ['Garnacha'] }], 'garnacha-tinta').length, 2);
  assert.equal(matchItems(items, 'riesling').length, 0);
  assert.deepEqual(priceOf({ structuredContent: { priceMoney: { value: '14.95', currency: 'EUR' } } }), { value: 14.95, currency: 'EUR', from: false });
  assert.equal(priceOf({ structuredContent: { variants: [{ priceMoney: { value: '21.00' } }, { priceMoney: { value: '18.50' } }] } }).value, 18.5);
  assert.equal(priceOf({}), null);
  assert.match(formatPrice({ value: 14.95, currency: 'EUR', from: false }, 'nl'), /14,95/);
  const mock = await loadProducts('merlot', { mock: '1' });
  assert.ok(mock.length >= 1 && mock.length <= 4);
  assert.ok(mock[0].title && mock[0].url);
  assert.deepEqual(await loadProducts('merlot', { mock: 'none' }), []);
  // fetch failure: no throw, empty list
  const f = globalThis.fetch; globalThis.fetch = () => Promise.reject(new Error('offline'));
  try { assert.deepEqual(await loadProducts('merlot'), []); } finally { globalThis.fetch = f; }
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
  assert.equal(makeT('nl')('trend_0'), 'sterk krimpend');
  assert.equal(makeT('en')('trend_4'), 'growing fast');
  assert.equal(norm('Spätburgunder'), 'spatburgunder');
});
