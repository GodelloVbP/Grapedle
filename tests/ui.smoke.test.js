// UI smoke test in jsdom: mount, six guesses, end screen, practice, teardown leaves no timers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function setup(url) {
  const dom = new JSDOM('<!doctype html><div id="grapedle-root"></div>', { url, pretendToBeVisual: true });
  const w = dom.window;
  // jsdom has no <dialog> behaviour: give it the two methods the game uses
  const D = w.HTMLDialogElement && w.HTMLDialogElement.prototype;
  if (D && !D.showModal) D.showModal = function () { this.setAttribute('open', ''); };
  if (D && !D.close) D.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  const intervals = new Set();
  const g = globalThis;
  g.window = w; g.document = w.document; g.localStorage = w.localStorage; g.location = w.location;
  Object.defineProperty(g, 'navigator', { value: w.navigator, configurable: true }); g.HTMLElement = w.HTMLElement; g.getComputedStyle = w.getComputedStyle.bind(w);
  g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  g.__GD_DEV__ = true;
  const si = g.setInterval, ci = g.clearInterval;
  g.setInterval = (fn, ms) => { const id = si(fn, ms); intervals.add(id); return id; };
  g.clearInterval = (id) => { intervals.delete(id); ci(id); };
  return { w, intervals, restore() {
    const r = w.document.getElementById('grapedle-root');
    try { if (r && r._gdTeardown) r._gdTeardown(); } catch (e) { /* ignore */ }
    for (const id of intervals) ci(id);
    g.setInterval = si; g.clearInterval = ci; w.close();
  } };
}

test('mount, six wrong guesses, end screen, practice, clean teardown', async () => {
  const env = setup('https://example.test/grapedle?day=3');
  try {
    const { mount } = await import('../src/ui.js');
    const { schedule } = await import('../src/data.js');
    const root = document.getElementById('grapedle-root');
    const api = mount(root);
    assert.ok(api && api.game, 'game mounted');
    assert.equal(api.game.puzzle, 3);
    assert.ok(root.querySelector('.gd-intro:not([hidden])'), 'first visit shows the inline intro, not a pop-up');
    assert.equal(root.querySelector('dialog'), null);

    const wrong = [...new Set(schedule.days)].filter((id) => id !== api.game.answer.id).slice(0, 6);
    const { byId } = await import('../src/data.js');
    for (const id of wrong) {
      const input = root.querySelector('.gd-input');
      input.value = byId.get(id).name;
      root.querySelector('.gd-form').dispatchEvent(new env.w.Event('submit', { cancelable: true, bubbles: true }));
    }
    assert.equal(api.game.status, 'lost');
    assert.ok(!root.querySelector('.gd-end').hidden, 'end panel visible');
    assert.equal(root.querySelectorAll('.gd-row').length, 6);
    assert.ok(root.querySelector('.gd-intro').hidden, 'intro gone after the first guess');
    assert.match(root.querySelector('.gd-answer-name').textContent, new RegExp(api.game.answer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    // practice from the end screen starts a fresh board that does not touch stats
    const before = JSON.stringify(api.store.state.history);
    [...root.querySelectorAll('button')].find((b) => /Oefenen|Practice/.test(b.textContent)).click();
    const pick = [...root.querySelectorAll('dialog button')].find((b) => /Willekeurig|Random/.test(b.textContent));
    if (pick) pick.click();
    assert.equal(api.game.status, 'playing');
    assert.equal(api.game.guesses.length, 0);
    assert.equal(JSON.stringify(api.store.state.history), before);

    root._gdTeardown();
    assert.equal(env.intervals.size, 0, 'no intervals left after teardown');
  } finally { env.restore(); }
});
