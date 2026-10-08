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

/** 'YYYY-MM-DD' of a day number (inverse of ymdToDayNumber). */
export function dayNumberToYmd(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

/** Calendar date (Amsterdam) of puzzle n. */
export function puzzleDate(n, startYmd) {
  return dayNumberToYmd(ymdToDayNumber(startYmd) + n - 1);
}

/** Milliseconds until 00:00 Europe/Amsterdam on startYmd (0 once it has begun). */
export function msUntilStart(date, startYmd) {
  const target = ymdToDayNumber(startYmd);
  const t0 = date.getTime();
  if (ymdToDayNumber(amsterdamYmd(date)) >= target) return 0;
  let lo = t0, hi = t0 + (target - ymdToDayNumber(amsterdamYmd(date)) + 2) * 86400000; // lo: before, hi: started
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ymdToDayNumber(amsterdamYmd(new Date(mid))) >= target) hi = mid; else lo = mid;
  }
  return hi - t0;
}

/** '1 november 2026' / '1 November 2026' for a YYYY-MM-DD string (calendar date, no time zone shift). */
export function formatYmd(ymd, lang, short = false) {
  const [y, m, d] = ymd.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: short ? 'short' : 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  } catch (e) { return ymd; }
}
