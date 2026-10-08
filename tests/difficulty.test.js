import test from 'node:test';
import assert from 'node:assert/strict';
import grapes from '../data/grapes.json' with { type: 'json' };
import schedule from '../data/schedule.json' with { type: 'json' };
import { compare } from '../src/feedback.js';
import { letterPattern, MAX_GUESSES } from '../src/game.js';

/**
 * A casual player knows 15 grapes. Guesses 1-5 are known grapes that are still consistent with
 * all feedback so far (any unguessed known grape when none is). Hint 2 (first letter + length) opens
 * after guess 5, so guess 6 is any pool grape consistent with all feedback and the letter pattern.
 * Hint 1 ("Bekend van") is not modelled. Reported separately for weekdays and weekends.
 */
const KNOWN = ['cabernet-sauvignon', 'merlot', 'pinot-noir', 'syrah', 'chardonnay', 'sauvignon-blanc', 'riesling', 'pinot-gris',
  'garnacha-tinta', 'tempranillo', 'sangiovese', 'cot', 'prosecco', 'gewurztraminer', 'chenin-blanc'];
const PLAYERS = 40;

const byId = new Map(grapes.map((g) => [g.id, g]));
const pool = grapes.filter((g) => g.answer);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// feedback signature of guess g against answer a (what the player sees)
const sigCache = new Map();
function sig(gid, aid) {
  const k = gid + '>' + aid;
  let v = sigCache.get(k);
  if (v === undefined) {
    v = compare(byId.get(gid), byId.get(aid)).map((c) => `${c.status}${c.arrow || ''}${c.km || ''}${c.dir === null || c.dir === undefined ? '' : c.dir}${c.key === 'flavour' ? (c.shared || []).join('+') : ''}`).join('|');
    sigCache.set(k, v);
  }
  return v;
}

/**
 * mode 'spec': guess 6 is any pool grape consistent with all feedback and the letter pattern (as specified).
 * mode 'pattern': guess 6 only uses the letter pattern (no deduction from the tiles).
 * mode 'known': no hint 2 help, the player only ever guesses grapes from the 15 they know.
 */
function play(answerId, rand, mode = 'spec') {
  const guessed = [];
  const seen = []; // [guessId, signature]
  const consistent = (cid) => seen.every(([g, s]) => sig(g, cid) === s);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  for (let turn = 1; turn <= MAX_GUESSES; turn++) {
    let choice;
    if (turn === MAX_GUESSES && mode !== 'known') {
      const first = byId.get(answerId);
      const pattern = letterPattern(first.name);
      const cands = pool.filter((g) => !guessed.includes(g.id) && letterPattern(g.name) === pattern && (mode === 'pattern' || consistent(g.id)));
      choice = cands.length ? pick(cands).id : pick(pool.filter((g) => !guessed.includes(g.id)).map((g) => g.id));
    } else {
      const unguessed = KNOWN.filter((id) => !guessed.includes(id));
      const cands = unguessed.filter(consistent);
      choice = pick(cands.length ? cands : unguessed);
    }
    guessed.push(choice);
    if (choice === answerId) return turn;
    seen.push([choice, sig(choice, answerId)]);
  }
  return 0;
}

function simulate(mode) {
  const stats = { weekday: { n: 0, wins: 0, tries: 0 }, weekend: { n: 0, wins: 0, tries: 0 } };
  const start = Date.UTC(2026, 10, 1);
  const rand = rng(20261101);
  const perGrape = new Map();
  schedule.days.forEach((id, i) => {
    const wd = new Date(start + i * 86400000).getUTCDay();
    const bucket = wd === 0 || wd === 6 ? stats.weekend : stats.weekday;
    for (let p = 0; p < PLAYERS; p++) {
      const r = play(id, rand, mode);
      bucket.n++; if (r) { bucket.wins++; bucket.tries += r; }
      const pg = perGrape.get(id) || { n: 0, w: 0 }; pg.n++; if (r) pg.w++; perGrape.set(id, pg);
    }
  });
  return { stats, perGrape };
}
const pct = (b) => (b.wins / b.n * 100).toFixed(1) + '%';

test('difficulty simulation: casual player with 15 known grapes and both hints', () => {
  const { stats, perGrape } = simulate('spec');
  const rate = (b) => b.wins / b.n;
  const avg = (b) => (b.tries / Math.max(1, b.wins)).toFixed(2);
  console.log(`difficulty sim, as specified (${PLAYERS} players/day, ${schedule.days.length} days): weekday win ${pct(stats.weekday)} (avg ${avg(stats.weekday)} guesses), weekend win ${pct(stats.weekend)} (avg ${avg(stats.weekend)})`);
  const worst = [...perGrape.entries()].map(([id, v]) => [id, v.w / v.n]).sort((a, b) => a[1] - b[1]).slice(0, 6);
  console.log('hardest grapes: ' + worst.map(([id, r]) => `${id} ${(r * 100).toFixed(0)}%`).join(', '));
  for (const mode of ['pattern', 'known']) {
    const v = simulate(mode).stats;
    console.log(`difficulty sim, variant '${mode}': weekday ${pct(v.weekday)}, weekend ${pct(v.weekend)}`);
  }
  assert.ok(rate(stats.weekday) >= 0.6, `weekday win rate ${(rate(stats.weekday) * 100).toFixed(1)}% is below 60%`);
});
