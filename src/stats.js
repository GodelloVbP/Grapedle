// Anonymous play statistics. One tiny message per event to the owner's Google Apps Script web app,
// which appends a row to a Google Sheet. No cookies, no ids, no IP (Apps Script never sees it):
// only the puzzle number, the outcome, tries, hints, the language and the browser's time zone (for a country).
// Never throws, never waits: if the endpoint is down or blocked the game does not notice.

/** Apps Script web app URL (ends in /exec). Empty = statistics off. */
export const STATS_URL = '';

const ACTIONS = new Set(['play', 'win', 'loss']);

/** Build the message; exported for tests. */
export function statsPayload(action, { puzzle, tries = null, hints = null, lang = null, tz = null }) {
  return {
    v: 1,
    a: action,
    p: puzzle,
    t: tries,
    h: hints,
    l: lang,
    z: tz,
  };
}

function timeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
}

/**
 * Send one event. `root` may switch it off with data-gd-stats="off" on the Code Block's div.
 * `url` is for tests; the bundle uses STATS_URL.
 */
export function report(root, action, info, url = STATS_URL) {
  try {
    if (!url || !/^https:\/\//.test(url) || !ACTIONS.has(action)) return false;
    if (root && root.getAttribute && root.getAttribute('data-gd-stats') === 'off') return false;
    const body = JSON.stringify(statsPayload(action, { ...info, tz: timeZone() }));
    const nav = globalThis.navigator;
    // text/plain keeps it a "simple" request: no CORS preflight, which Apps Script cannot answer
    if (nav && typeof nav.sendBeacon === 'function') {
      const blob = typeof Blob === 'function' ? new Blob([body], { type: 'text/plain;charset=utf-8' }) : body;
      if (nav.sendBeacon(url, blob)) return true;
    }
    if (typeof fetch === 'function') {
      fetch(url, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body }).catch(() => {});
      return true;
    }
  } catch (e) { /* statistics must never break the game */ }
  return false;
}
