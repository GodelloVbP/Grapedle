/**
 * Grapedle — anonymous play statistics (Google Apps Script, bound to a Google Sheet).
 *
 * Install: new Google Sheet → Extensions → Apps Script → paste this file → run setup() once
 * (allow access) → Deploy → New deployment → type "Web app", Execute as "Me",
 * Who has access "Anyone" → copy the URL ending in /exec into src/stats.js (STATS_URL).
 *
 * What arrives per event (sent by the game, see src/stats.js):
 *   { v:1, a:"play"|"win"|"loss", p:<puzzle>, t:<tries>, h:<hints>, l:"nl"|"en", z:"Europe/Amsterdam" }
 * Nothing identifies a player: no cookie, no id, and Apps Script does not see the IP address.
 * The time zone becomes a country here; the zone itself is not stored.
 */

const START = '2026-10-17';           // schedule.start of the game (puzzle 1)
const TZ = 'Europe/Amsterdam';
const SHEET = 'Events';

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const row = clean(d);
    if (row) SpreadsheetApp.getActive().getSheetByName(SHEET).appendRow(row);
  } catch (err) { /* ignore bad input */ }
  return ContentService.createTextOutput('ok');
}

function doGet() {
  return ContentService.createTextOutput('Grapedle stats: ok');
}

/** Validate one event; returns a sheet row or null. Keeps junk and replays of old puzzles out. */
function clean(d) {
  if (!d || d.v !== 1) return null;
  if (['play', 'win', 'loss'].indexOf(d.a) < 0) return null;
  const p = Number(d.p);
  const today = puzzleToday();
  if (!Number.isInteger(p) || p < today - 1 || p > today) return null; // today's puzzle (or yesterday's, around midnight)
  let t = '', h = '';
  if (d.a !== 'play') {
    t = Number(d.t); h = Number(d.h);
    if (!Number.isInteger(t) || t < 1 || t > 6) return null;
    if (!Number.isInteger(h) || h < 0 || h > 2) return null;
  }
  const lang = d.l === 'en' ? 'en' : 'nl';
  const now = new Date();
  return [
    Utilities.formatDate(now, TZ, 'yyyy-MM-dd HH:mm'),
    Utilities.formatDate(now, TZ, 'yyyy-MM-dd'),
    p, d.a, t, h, countryOf(String(d.z || '')), lang,
  ];
}

function puzzleToday() {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const ms = Date.parse(today + 'T00:00:00Z') - Date.parse(START + 'T00:00:00Z');
  return Math.round(ms / 86400000) + 1;
}

const ZONES = {
  'Europe/Amsterdam': 'Nederland', 'Europe/Brussels': 'België', 'Europe/Luxembourg': 'Luxemburg',
  'Europe/Berlin': 'Duitsland', 'Europe/Busingen': 'Duitsland', 'Europe/Paris': 'Frankrijk', 'Europe/Monaco': 'Monaco',
  'Europe/London': 'Verenigd Koninkrijk', 'Europe/Dublin': 'Ierland', 'Europe/Zurich': 'Zwitserland',
  'Europe/Vienna': 'Oostenrijk', 'Europe/Madrid': 'Spanje', 'Atlantic/Canary': 'Spanje', 'Europe/Lisbon': 'Portugal',
  'Europe/Rome': 'Italië', 'Europe/Copenhagen': 'Denemarken', 'Europe/Stockholm': 'Zweden', 'Europe/Oslo': 'Noorwegen',
  'Europe/Helsinki': 'Finland', 'Europe/Warsaw': 'Polen', 'Europe/Prague': 'Tsjechië', 'Europe/Budapest': 'Hongarije',
  'Europe/Athens': 'Griekenland', 'Europe/Istanbul': 'Turkije', 'Europe/Bucharest': 'Roemenië', 'Europe/Sofia': 'Bulgarije',
  'Europe/Zagreb': 'Kroatië', 'Europe/Ljubljana': 'Slovenië', 'Europe/Belgrade': 'Servië', 'Europe/Kyiv': 'Oekraïne',
  'Europe/Kiev': 'Oekraïne', 'Europe/Tallinn': 'Estland', 'Europe/Riga': 'Letland', 'Europe/Vilnius': 'Litouwen',
  'Europe/Bratislava': 'Slowakije', 'Europe/Malta': 'Malta', 'Asia/Nicosia': 'Cyprus', 'Atlantic/Reykjavik': 'IJsland',
  'America/New_York': 'Verenigde Staten', 'America/Chicago': 'Verenigde Staten', 'America/Denver': 'Verenigde Staten',
  'America/Phoenix': 'Verenigde Staten', 'America/Los_Angeles': 'Verenigde Staten', 'America/Anchorage': 'Verenigde Staten',
  'America/Detroit': 'Verenigde Staten', 'Pacific/Honolulu': 'Verenigde Staten',
  'America/Toronto': 'Canada', 'America/Vancouver': 'Canada', 'America/Edmonton': 'Canada', 'America/Halifax': 'Canada',
  'America/Curacao': 'Curaçao', 'America/Aruba': 'Aruba', 'America/Kralendijk': 'Bonaire', 'America/Lower_Princes': 'Sint Maarten',
  'America/Paramaribo': 'Suriname', 'America/Sao_Paulo': 'Brazilië', 'America/Argentina/Buenos_Aires': 'Argentinië',
  'America/Santiago': 'Chili', 'America/Mexico_City': 'Mexico', 'America/Bogota': 'Colombia', 'America/Lima': 'Peru',
  'America/Montevideo': 'Uruguay', 'Africa/Johannesburg': 'Zuid-Afrika', 'Africa/Casablanca': 'Marokko', 'Africa/Cairo': 'Egypte',
  'Asia/Tokyo': 'Japan', 'Asia/Seoul': 'Zuid-Korea', 'Asia/Shanghai': 'China', 'Asia/Hong_Kong': 'Hongkong',
  'Asia/Singapore': 'Singapore', 'Asia/Bangkok': 'Thailand', 'Asia/Jakarta': 'Indonesië', 'Asia/Kolkata': 'India',
  'Asia/Dubai': 'Verenigde Arabische Emiraten', 'Asia/Jerusalem': 'Israël', 'Asia/Tel_Aviv': 'Israël',
  'Australia/Sydney': 'Australië', 'Australia/Melbourne': 'Australië', 'Australia/Brisbane': 'Australië',
  'Australia/Perth': 'Australië', 'Australia/Adelaide': 'Australië', 'Pacific/Auckland': 'Nieuw-Zeeland',
};

function countryOf(zone) {
  if (ZONES[zone]) return ZONES[zone];
  const part = zone.split('/')[0];
  return part && /^[A-Za-z]+$/.test(part) ? 'Overig (' + part + ')' : 'Onbekend';
}

/** Run once: creates the Events tab and the two summary tabs. Safe to run again (rebuilds the summaries). */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const ev = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (ev.getLastRow() === 0) {
    ev.appendRow(['Tijd', 'Datum', 'Puzzel', 'Actie', 'Pogingen', 'Hints', 'Land', 'Taal']);
    ev.setFrozenRows(1);
    ev.getRange('A:B').setNumberFormat('@'); // keep dates as text: sorts the same in every locale
  }

  const day = ss.getSheetByName('Per dag') || ss.insertSheet('Per dag');
  day.clear();
  day.getRange('A1:H1').setValues([['Datum', 'Puzzel', 'Spelers', 'Gewonnen', 'Verloren', 'Win %', 'Gem. pogingen (gewonnen)', 'Gem. hints']]).setFontWeight('bold');
  day.setFrozenRows(1);
  day.getRange('A2').setFormula('=IFERROR(SORT(UNIQUE(FILTER(Events!B2:B, Events!B2:B<>"")), 1, FALSE), "")');
  day.getRange('B2').setFormula('=BYROW(A2:A, LAMBDA(d, IF(d="", "", IFERROR(MAX(FILTER(Events!C2:C, Events!B2:B=d)), ""))))');
  day.getRange('C2').setFormula('=BYROW(A2:A, LAMBDA(d, IF(d="", "", COUNTIFS(Events!B2:B, d, Events!D2:D, "play"))))');
  day.getRange('D2').setFormula('=BYROW(A2:A, LAMBDA(d, IF(d="", "", COUNTIFS(Events!B2:B, d, Events!D2:D, "win"))))');
  day.getRange('E2').setFormula('=BYROW(A2:A, LAMBDA(d, IF(d="", "", COUNTIFS(Events!B2:B, d, Events!D2:D, "loss"))))');
  day.getRange('F2').setFormula('=BYROW(A2:A, LAMBDA(d, IF(d="", "", IFERROR(COUNTIFS(Events!B2:B, d, Events!D2:D, "win") / (COUNTIFS(Events!B2:B, d, Events!D2:D, "win") + COUNTIFS(Events!B2:B, d, Events!D2:D, "loss")), ""))))');
  day.getRange('G2').setFormula('=BYROW(A2:A, LAMBDA(d, IF(d="", "", IFERROR(AVERAGEIFS(Events!E2:E, Events!B2:B, d, Events!D2:D, "win"), ""))))');
  day.getRange('H2').setFormula('=BYROW(A2:A, LAMBDA(d, IF(d="", "", IFERROR(AVERAGE(FILTER(Events!F2:F, Events!B2:B=d, Events!D2:D<>"play")), ""))))');
  day.getRange('F2:F').setNumberFormat('0%');
  day.getRange('G2:H').setNumberFormat('0.0');

  const land = ss.getSheetByName('Landen') || ss.insertSheet('Landen');
  land.clear();
  land.getRange('A1').setFormula('=QUERY(Events!A2:H, "select G, count(G) where D = \'play\' group by G order by count(G) desc label G \'Land\', count(G) \'Spelers\'", 0)');
}
