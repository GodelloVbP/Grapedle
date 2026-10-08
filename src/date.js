const TZ = 'Europe/Amsterdam';
let fmt = null;
function formatter() {
  return fmt || (fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }));
}

/** 'YYYY-MM-DD' of the given instant on the Amsterdam calendar. */
export function amsterdamYmd(date) {
  const p = {};
  for (const part of formatter().formatToParts(date)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

export function ymdToDayNumber(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Puzzle number: days since schedule start + 1 (Amsterdam calendar days). */
export function puzzleNumber(date, startYmd) {
  return ymdToDayNumber(amsterdamYmd(date)) - ymdToDayNumber(startYmd) + 1;
}

/** Milliseconds until the Amsterdam calendar day changes (handles 23/25 hour DST days). */
export function msUntilNextPuzzle(date) {
  const today = amsterdamYmd(date);
  const t0 = date.getTime();
  let lo = t0, hi = t0 + 26 * 3600 * 1000; // lo: still today, hi: already tomorrow
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (amsterdamYmd(new Date(mid)) === today) lo = mid; else hi = mid;
  }
  return hi - t0;
}
