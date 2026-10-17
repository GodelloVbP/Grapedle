import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { celebrate, TIERS, tierOf } from '../src/celebrate.js';

function root(reduce = false) {
  const dom = new JSDOM('<div id="grapedle-root"><div class="gd-row"></div></div>', { pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: reduce && /reduce/.test(q) });
  return { w, el: w.document.getElementById('grapedle-root') };
}

test('fewer guesses means a bigger celebration', () => {
  const counts = [];
  for (let n = 1; n <= 6; n++) {
    const { w, el } = root();
    const stop = celebrate(el, n);
    counts.push(el.querySelectorAll('.gd-cf').length);
    assert.equal(el.getAttribute('data-gd-tier'), String(n));
    stop(); w.close();
  }
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] < counts[i - 1], `tier ${i + 1} smaller than tier ${i}: ${counts}`);
  assert.deepEqual(counts, TIERS.slice(1).map((t) => t.count));
});

test('cancel removes the layer and the tier attribute; no timer left over', () => {
  const { w, el } = root();
  const stop = celebrate(el, 3);
  assert.ok(el.querySelector('.gd-confetti'));
  stop();
  assert.equal(el.querySelector('.gd-confetti'), null);
  assert.equal(el.getAttribute('data-gd-tier'), null);
  stop(); // idempotent
  w.close();
});

test('reduced motion: nothing is added', () => {
  const { w, el } = root(true);
  celebrate(el, 1)();
  assert.equal(el.querySelector('.gd-confetti'), null);
  assert.equal(el.getAttribute('data-gd-tier'), null);
  w.close();
});

test('tierOf clamps', () => {
  assert.equal(tierOf(0), 1);
  assert.equal(tierOf(9), 6);
});
