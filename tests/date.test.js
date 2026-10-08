import test from 'node:test';
import assert from 'node:assert/strict';
import { msUntilStart, puzzleDate, dayNumberToYmd, ymdToDayNumber, formatYmd, puzzleNumber } from '../src/date.js';

test('puzzleDate and day numbers round trip', () => {
  assert.equal(puzzleDate(1, '2026-11-01'), '2026-11-01');
  assert.equal(puzzleDate(12, '2026-11-01'), '2026-11-12');
  assert.equal(puzzleDate(31, '2026-11-01'), '2026-12-01');
  assert.equal(dayNumberToYmd(ymdToDayNumber('2027-03-28')), '2027-03-28');
});

test('countdown to launch ends exactly at 00:00 Amsterdam (CET in November)', () => {
  assert.equal(msUntilStart(new Date('2026-10-31T22:59:59Z'), '2026-11-01'), 1000);
  assert.equal(msUntilStart(new Date('2026-10-31T23:00:00Z'), '2026-11-01'), 0);
  assert.equal(msUntilStart(new Date('2026-11-05T12:00:00Z'), '2026-11-01'), 0);
  assert.equal(msUntilStart(new Date('2026-10-09T10:00:00Z'), '2026-11-01'), (22 * 24 + 13) * 3600 * 1000);
});

test('puzzle number is 0 or less before launch, 1 on launch day', () => {
  assert.ok(puzzleNumber(new Date('2026-10-31T22:59:59Z'), '2026-11-01') < 1);
  assert.equal(puzzleNumber(new Date('2026-10-31T23:00:00Z'), '2026-11-01'), 1);
});

test('dates are formatted in the page language', () => {
  assert.equal(formatYmd('2026-11-01', 'nl'), '1 november 2026');
  assert.equal(formatYmd('2026-11-01', 'en'), '1 November 2026');
  assert.match(formatYmd('2026-11-19', 'nl', true), /^19 nov/);
});
