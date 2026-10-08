import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import schedule from '../data/schedule.json' with { type: 'json' };
import grapes from '../data/grapes.json' with { type: 'json' };
import { answerIdFor } from '../src/schedule.js';
import { amsterdamYmd, puzzleNumber, msUntilNextPuzzle } from '../src/date.js';

const answers = grapes.filter((g) => g.answer).map((g) => g.id);

test('schedule covers >= 2 years of answer-pool grapes', () => {
  assert.equal(schedule.start, '2026-11-01');
  assert.ok(schedule.days.length >= 730);
  const pool = new Set(answers);
  for (const id of schedule.days) assert.ok(pool.has(id), id);
});

test('no repeat within a cycle, no consecutive duplicates', () => {
  const n = answers.length;
  for (let i = 0; i + n <= schedule.days.length; i += n) {
    assert.equal(new Set(schedule.days.slice(i, i + n)).size, n, 'cycle at ' + i);
  }
  const tail = schedule.days.slice(Math.floor(schedule.days.length / n) * n);
  assert.equal(new Set(tail).size, tail.length);
  for (let i = 1; i < schedule.days.length; i++) assert.notEqual(schedule.days[i], schedule.days[i - 1], 'day ' + i);
});

test('answerIdFor is deterministic, 1-based, never throws', () => {
  assert.equal(answerIdFor(1, schedule), schedule.days[0]);
  assert.equal(answerIdFor(2, schedule), schedule.days[1]);
  assert.equal(answerIdFor(1, schedule), answerIdFor(1, schedule));
  assert.ok(answerIdFor(0, schedule) && answerIdFor(-4, schedule) && answerIdFor(99999, schedule));
});

test('builder is append-only and deterministic', () => {
  const root = resolve(import.meta.dirname, '..');
  const tmp = mkdtempSync(join(tmpdir(), 'gd-'));
  try {
    cpSync(join(root, 'scripts'), join(tmp, 'scripts'), { recursive: true });
    cpSync(join(root, 'data'), join(tmp, 'data'), { recursive: true });
    rmSync(join(tmp, 'data', 'schedule.json'));
    const run = (days) => {
      const r = spawnSync('python3', ['-I', join(tmp, 'scripts', 'build_data.py'), '--days', String(days)], { encoding: 'utf-8' });
      assert.equal(r.status, 0, r.stderr);
      return JSON.parse(readFileSync(join(tmp, 'data', 'schedule.json'), 'utf-8')).days;
    };
    const a = run(150), b = run(400), c = run(400);
    assert.equal(a.length, 150);
    assert.deepEqual(b.slice(0, 150), a, 'extending keeps existing days');
    assert.deepEqual(c, b, 'rerun is a no-op');
    assert.deepEqual(a, schedule.days.slice(0, 150), 'matches committed schedule');
    for (let i = 1; i < b.length; i++) assert.notEqual(b[i], b[i - 1]);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

// ---- Amsterdam day calculation ----
const at = (iso) => new Date(iso);

test('rollover at 00:00 Amsterdam on a normal winter day', () => {
  assert.equal(amsterdamYmd(at('2026-11-10T22:59:59Z')), '2026-11-10'); // 23:59:59 CET
  assert.equal(amsterdamYmd(at('2026-11-10T23:00:00Z')), '2026-11-11'); // 00:00 CET
  assert.equal(puzzleNumber(at('2026-11-10T22:59:59Z'), '2026-11-01'), 10);
  assert.equal(puzzleNumber(at('2026-11-10T23:00:00Z'), '2026-11-01'), 11);
});

test('rollover on the 25 h day 2026-10-25 (clocks back)', () => {
  assert.equal(amsterdamYmd(at('2026-10-25T22:59:59Z')), '2026-10-25'); // 23:59:59 CET
  assert.equal(amsterdamYmd(at('2026-10-25T23:00:00Z')), '2026-10-26');
  assert.equal(amsterdamYmd(at('2026-10-24T22:00:00Z')), '2026-10-25'); // 00:00 CEST
  assert.equal(puzzleNumber(at('2026-10-25T22:59:59Z'), '2026-10-01'), 25);
  assert.equal(puzzleNumber(at('2026-10-25T23:00:00Z'), '2026-10-01'), 26);
  assert.equal(msUntilNextPuzzle(at('2026-10-24T22:00:00Z')), 25 * 3600 * 1000);
});

test('rollover on the 23 h day 2027-03-28 (clocks forward)', () => {
  assert.equal(amsterdamYmd(at('2027-03-28T21:59:59Z')), '2027-03-28'); // 23:59:59 CEST
  assert.equal(amsterdamYmd(at('2027-03-28T22:00:00Z')), '2027-03-29');
  assert.equal(amsterdamYmd(at('2027-03-27T23:00:00Z')), '2027-03-28'); // 00:00 CET
  assert.equal(puzzleNumber(at('2027-03-28T21:59:59Z'), '2027-03-01'), 28);
  assert.equal(puzzleNumber(at('2027-03-28T22:00:00Z'), '2027-03-01'), 29);
  assert.equal(msUntilNextPuzzle(at('2027-03-27T23:00:00Z')), 23 * 3600 * 1000);
});

test('puzzle number counts calendar days across a DST change', () => {
  assert.equal(puzzleNumber(at('2027-01-01T12:00:00Z'), '2026-11-01'), 62);
  assert.equal(puzzleNumber(at('2027-04-01T12:00:00Z'), '2026-11-01'), 152);
});
