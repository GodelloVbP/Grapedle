import test from 'node:test';
import assert from 'node:assert/strict';
import { report, statsPayload, STATS_URL } from '../src/stats.js';

test('payload holds only puzzle, outcome, tries, hints, language and time zone', () => {
  const p = statsPayload('win', { puzzle: 3, tries: 4, hints: 1, lang: 'nl', tz: 'Europe/Amsterdam' });
  assert.deepEqual(Object.keys(p).sort(), ['a', 'h', 'l', 'p', 't', 'v', 'z']);
  assert.deepEqual(p, { v: 1, a: 'win', p: 3, t: 4, h: 1, l: 'nl', z: 'Europe/Amsterdam' });
});

test('report sends a text/plain beacon, and stays off without a url, for unknown actions or data-gd-stats="off"', () => {
  const sent = [];
  const orig = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { value: { sendBeacon: (u, b) => { sent.push([u, b]); return true; } }, configurable: true });
  try {
    const root = { getAttribute: (k) => (k === 'data-gd-stats' ? null : null) };
    assert.equal(report(root, 'win', { puzzle: 1, tries: 3, hints: 0, lang: 'nl' }, 'https://script.google.com/macros/s/x/exec'), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][1].type, 'text/plain;charset=utf-8');
    assert.equal(report(root, 'win', { puzzle: 1 }, ''), false);
    assert.equal(report(root, 'cheat', { puzzle: 1 }, 'https://x.test/exec'), false);
    assert.equal(report(root, 'win', { puzzle: 1 }, 'http://x.test/exec'), false, 'https only');
    const off = { getAttribute: (k) => (k === 'data-gd-stats' ? 'off' : null) };
    assert.equal(report(off, 'win', { puzzle: 1 }, 'https://x.test/exec'), false);
    assert.equal(sent.length, 1);
  } finally { Object.defineProperty(globalThis, 'navigator', { value: orig, configurable: true }); }
});

test('the shipped url is empty or an Apps Script web app', () => {
  assert.ok(STATS_URL === '' || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(STATS_URL), STATS_URL);
});
