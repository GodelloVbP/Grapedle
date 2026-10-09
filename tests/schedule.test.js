import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import schedule from '../data/schedule.json' with { type: 'json' };
import grapes from '../data/grapes.json' with { type: 'json' };
import { answerIdFor } from '../src/schedule.js';
import { amsterdamYmd, puzzleNumber, msUntilNextPuzzle } from '../src/date.js';

const byId = new Map(grapes.map((g) => [g.id, g]));
const answers = grapes.filter((g) => g.answer).map((g) => g.id);
const N = answers.length;
/** Weekday (0 = Sunday) of puzzle day index i (0-based) on the Amsterdam calendar. */
const weekday = (i) => new Date(Date.UTC(...schedule.start.split('-').map((x, k) => (k === 1 ? Number(x) - 1 : Number(x))))  + i * 86400000).getUTCDay();

test('schedule covers >= 2 years of answer-pool grapes, in whole cycles', () => {
  assert.equal(schedule.start, '2026-11-01');
  assert.ok(schedule.days.length >= 730);
  assert.equal(schedule.days.length % N, 0);
  const pool = new Set(answers);
  for (const id of schedule.days) assert.ok(pool.has(id), id);
});

test('no repeat within a cycle, the same grape at least 20 days apart across cycle boundaries', () => {
  for (let i = 0; i + N <= schedule.days.length; i += N) {
    assert.equal(new Set(schedule.days.slice(i, i + N)).size, N, 'cycle at ' + i);
  }
  const last = new Map();
  schedule.days.forEach((id, i) => {
    if (last.has(id)) assert.ok(i - last.get(id) >= 20, `${id} repeats after ${i - last.get(id)} days`);
    last.set(id, i);
  });
});

test('weekend-only grapes appear only on Saturday and Sunday (Europe/Amsterdam calendar)', () => {
  const only = new Set(grapes.filter((g) => g.weekendOnly).map((g) => g.id));
  assert.ok(only.size >= 9 && only.size <= 36, 'weekend-only grapes must fit the weekend slots of a cycle');
  let seen = 0;
  schedule.days.forEach((id, i) => {
    if (!only.has(id)) return;
    seen++;
    const w = weekday(i);
    assert.ok(w === 0 || w === 6, `${id} on day ${i} (weekday ${w})`);
  });
  assert.ok(seen >= only.size * Math.floor(schedule.days.length / N));
  assert.equal(weekday(0), 0, '2026-11-01 is a Sunday');
});

test('grapes sharing a signature region are at least 7 days apart', () => {
  const lastIn = new Map();
  schedule.days.forEach((id, i) => {
    const r = byId.get(id).regions[0].name; // primary region only
    if (!r) return; // no named signature region: nothing to keep apart
    if (lastIn.has(r)) {
      const [j, other] = lastIn.get(r);
      if (other !== id) assert.ok(i - j >= 7, `${other} (day ${j}) and ${id} (day ${i}) share ${r}`);
    }
    lastIn.set(r, [i, id]);
  });
});

test('Corvina family spacing: Corvina and Corvinone 21 days, Rondinella 14 days from both', () => {
  const gap = { 'corvina-veronese|corvinone': 21, 'corvinone|corvina-veronese': 21, 'rondinella|corvina-veronese': 14, 'corvina-veronese|rondinella': 14, 'rondinella|corvinone': 14, 'corvinone|rondinella': 14 };
  const fam = new Set(['corvina-veronese', 'corvinone', 'rondinella']);
  const hist = [];
  schedule.days.forEach((id, i) => {
    if (!fam.has(id)) return;
    for (const [j, o] of hist) if (o !== id) assert.ok(i - j >= gap[`${id}|${o}`], `${o} (day ${j}) and ${id} (day ${i})`);
    hist.push([i, id]);
  });
  assert.ok(hist.length >= 3 * (schedule.days.length / N));
});

test('week 1 (first 7 days) only features well-known grapes', () => {
  const known = new Set(['cabernet-sauvignon', 'merlot', 'syrah', 'pinot-noir', 'chardonnay', 'sauvignon-blanc', 'riesling', 'pinot-gris',
    'garnacha-tinta', 'tempranillo', 'sangiovese', 'cot', 'prosecco', 'gewurztraminer']);
  for (const id of known) assert.ok(byId.get(id) && byId.get(id).answer, id);
  const week = schedule.days.slice(0, 7);
  assert.equal(new Set(week).size, 7);
  for (const id of week) assert.ok(known.has(id), `${id} in week 1`);
  const only = new Set(grapes.filter((g) => g.weekendOnly).map((g) => g.id));
  for (const id of week) assert.ok(!only.has(id), `weekend-only ${id} in week 1`);
});

const daysLeft = (today) => {
  const start = Date.UTC(...schedule.start.split('-').map((x, k) => (k === 1 ? Number(x) - 1 : Number(x))));
  const end = start + schedule.days.length * 86400000;
  return Math.round((end - Math.max(start, Date.parse(today))) / 86400000);
};

test('the schedule has at least 90 days left (extend it with --days before it runs out)', () => {
  const left = daysLeft(new Date().toISOString().slice(0, 10));
  assert.ok(left >= 90, `only ${left} days of schedule left: run python3 scripts/build_data.py --days <more> and release`);
});

test('the builder warns when fewer than 90 days are left', () => {
  const root = resolve(import.meta.dirname, '..');
  const tmp = mkdtempSync(join(tmpdir(), 'gd-'));
  try {
    cpSync(join(root, 'scripts'), join(tmp, 'scripts'), { recursive: true });
    cpSync(join(root, 'data'), join(tmp, 'data'), { recursive: true });
    const run = (today) => {
      const r = spawnSync('python3', ['-I', join(tmp, 'scripts', 'build_data.py'), '--today', today], { encoding: 'utf-8' });
      assert.equal(r.status, 0, r.stderr + r.stdout);
      return r.stdout;
    };
    const endDay = new Date(Date.UTC(2026, 10, 1) + schedule.days.length * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);
    assert.match(run(iso(new Date(endDay.getTime() - 89 * 86400000))), /WARNING: only 89 days of schedule left/);
    assert.doesNotMatch(run(iso(new Date(endDay.getTime() - 90 * 86400000))), /WARNING/);
    assert.doesNotMatch(run('2026-10-01'), /WARNING/, 'before launch the whole schedule is ahead');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('after launch the schedule only grows: it starts with the days of the last release (data/schedule.released.json)', () => {
  const file = resolve(import.meta.dirname, '..', 'data', 'schedule.released.json');
  if (!existsSync(file)) return; // created by the release script at the first tagged release
  const released = JSON.parse(readFileSync(file, 'utf-8'));
  assert.equal(schedule.start, released.start, 'start date is frozen');
  assert.ok(schedule.days.length >= released.days.length);
  assert.deepEqual(schedule.days.slice(0, released.days.length), released.days, 'released days must never change');
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
      assert.equal(r.status, 0, r.stderr + r.stdout);
      return JSON.parse(readFileSync(join(tmp, 'data', 'schedule.json'), 'utf-8')).days;
    };
    const a = run(N * 3), b = run(N * 5), c = run(N * 5);
    assert.equal(a.length, N * 3);
    assert.deepEqual(b.slice(0, N * 3), a, 'extending keeps existing days');
    assert.deepEqual(c, b, 'rerun is a no-op');
    assert.deepEqual(a, schedule.days.slice(0, N * 3), 'matches committed schedule');
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
