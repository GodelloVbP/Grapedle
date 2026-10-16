import test from 'node:test';
import assert from 'node:assert/strict';
import { nextKeys, keyQuery, KEY_ROWS } from '../src/keyboard.js';
import { search } from '../src/search.js';

test('nothing typed: every key is useful', () => {
  assert.equal(nextKeys(''), null);
  assert.equal(nextKeys('   '), null);
});

test('trailing separators count as one space, accents and case are ignored', () => {
  assert.equal(keyQuery('Pinot '), 'pinot ');
  assert.equal(keyQuery("nero d'"), 'nero d ');
  assert.equal(keyQuery('Grü'), 'gru');
});

test('after "pinot " the next letters of the Pinots are offered', () => {
  const k = nextKeys('pinot ');
  for (const c of ['n', 'g', 'b']) assert.ok(k.has(c), c);
  assert.ok(!k.has('x'));
});

test('a typo leaves no key to press', () => {
  assert.equal(nextKeys('zzqx').size, 0);
});

test('every key the keyboard allows still finds a grape', () => {
  for (const start of ['c', 'gr', 'sa', 'mo', 'pinot ']) {
    for (const c of nextKeys(start)) assert.ok(search(start + c).length > 0, JSON.stringify(start + c));
  }
});

test('the letter keys cover a-z exactly once', () => {
  assert.equal(KEY_ROWS.flat().sort().join(''), 'abcdefghijklmnopqrstuvwxyz');
});
