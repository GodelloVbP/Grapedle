// Win celebration scaled to the number of guesses: 1 = full confetti, 6 = a small sprinkle.
// Pure DOM + CSS keyframes (no animation loop), clipped to the game root, removed after it ends.

/** Per tier (guesses used, 1..6): particle count, horizontal reach, rise and duration in seconds, burst origins (share of width). */
export const TIERS = [
  null,
  { count: 90, reach: 340, rise: 260, dur: 3.0, origins: [0.12, 0.5, 0.88] },
  { count: 64, reach: 280, rise: 220, dur: 2.6, origins: [0.2, 0.8] },
  { count: 44, reach: 220, rise: 180, dur: 2.3, origins: [0.5] },
  { count: 30, reach: 170, rise: 150, dur: 2.0, origins: [0.5] },
  { count: 18, reach: 130, rise: 115, dur: 1.8, origins: [0.5] },
  { count: 9, reach: 90, rise: 80, dur: 1.5, origins: [0.5] },
];

const COLOURS = 5;
// the winning row flips in over about 0.8 s; the burst starts when it lands
const LEAD = 0.8;

export function tierOf(tries) {
  return Math.min(6, Math.max(1, tries | 0));
}

/**
 * Burst confetti from the end-card title. Returns a cancel function.
 * Does nothing when the visitor prefers reduced motion.
 */
export function celebrate(root, tries, rnd = Math.random) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const tier = tierOf(tries);
  const cfg = TIERS[tier];
  let reduce = false;
  try { reduce = !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignore */ }
  if (reduce) return () => {};

  root.setAttribute('data-gd-tier', String(tier));
  const layer = doc.createElement('div');
  layer.className = 'gd-confetti';
  layer.setAttribute('aria-hidden', 'true');

  const rootRect = root.getBoundingClientRect();
  // the page scrolls to the end card on a win, so burst from its title (the board row is the fallback)
  const rows = root.querySelectorAll('.gd-row');
  const anchor = root.querySelector('.gd-end-title') || rows[rows.length - 1];
  const r = anchor ? anchor.getBoundingClientRect() : null;
  const y0 = r ? r.top - rootRect.top + r.height / 2 : 120;
  const width = rootRect.width || 320;
  const reach = Math.min(cfg.reach, width * 0.7);
  // the rise is capped to the room above the title, inside the game and on screen (phones scroll the title to the top),
  // so the burst stays visible and the rest falls as a shower over the answer card
  const onScreen = r ? Math.max(0, r.top + r.height / 2) : y0;
  const rise = Math.max(12, Math.min(cfg.rise, y0 * 0.85, onScreen * 0.8));

  for (let i = 0; i < cfg.count; i++) {
    const o = cfg.origins[i % cfg.origins.length];
    const side = rnd() * 2 - 1;
    const p = doc.createElement('span');
    p.className = 'gd-cf gd-cf-' + Math.floor(rnd() * COLOURS) + (rnd() < 0.3 ? ' gd-cf-round' : '');
    p.style.cssText =
      `--x:${(o * width).toFixed(0)}px;--y:${y0.toFixed(0)}px;` +
      `--dx:${(side * reach).toFixed(0)}px;--up:${(-(0.45 + rnd() * 0.55) * rise).toFixed(0)}px;` +
      `--fall:${((0.4 + rnd()) * cfg.rise + 40).toFixed(0)}px;--r:${Math.round((rnd() * 2 - 1) * 900)}deg;` +
      `--t:${(cfg.dur * (0.75 + rnd() * 0.35)).toFixed(2)}s;--w:${(5 + rnd() * 5).toFixed(0)}px;` +
      `animation-delay:${(LEAD + rnd() * 0.15).toFixed(2)}s`;
    layer.appendChild(p);
  }
  root.appendChild(layer);

  let timer = setTimeout(done, (LEAD + cfg.dur * 1.2 + 0.4) * 1000);
  function done() {
    clearTimeout(timer); timer = null;
    if (layer.parentNode) layer.parentNode.removeChild(layer);
    if (root.getAttribute('data-gd-tier') === String(tier)) root.removeAttribute('data-gd-tier');
  }
  return done;
}
