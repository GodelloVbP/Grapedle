import { countries, descriptors, styles as styleDefs, schedule, grapes } from './data.js';
import { COLUMNS, ARROWS, STATUS_SYMBOL, regionsOf, formatArea } from './feedback.js';
import { createGame, shareText, firstLetter, MAX_GUESSES, HINT_AT } from './game.js';
import { answerIdFor } from './schedule.js';
import { makeT, pickLang } from './i18n.js';
import { search, exact } from './search.js';
import { createStore, computeStats } from './storage.js';
import { puzzleNumber, msUntilNextPuzzle, msUntilStart, puzzleDate, formatYmd } from './date.js';
import { loadItems, productsFor, similarProducts, formatPrice, withUtm, TASTINGS_URL, SHOP_PAGE } from './shop.js';
import { norm } from './text.js';

const ICON_HELP = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9.5"/><path d="M9.2 9.3a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4.2"/><path d="M12 17.6v.1"/></svg>';
const ICON_STATS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 20V11M12 20V4M19 20v-6"/></svg>';

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
  }
  return el;
}

function readQuery() {
  try { return new URLSearchParams(globalThis.location.search); } catch (e) { return new URLSearchParams(); }
}


const DEV = typeof __GD_DEV__ !== 'undefined' && __GD_DEV__;
const AGE_VERIFIED_KEY = 'vinoByPalazzoAgeVerified';
const PRACTICE_MAX_LIST = 60;
/** Puzzle numbers whose 'start' event already fired in this page view. */
const startedPuzzles = new Set();

/**
 * True while the host page's age gate (#age-gate) is on screen. When the gate is not in the DOM yet
 * and the visitor is not verified, treat it as blocking for a short grace period (it may still be injected).
 */
function ageGateBlocking(graceUntil) {
  const gate = document.getElementById('age-gate');
  if (gate) {
    if (gate.classList.contains('hidden') || gate.hidden) return false;
    try {
      const cs = globalThis.getComputedStyle(gate);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    } catch (e) { /* treat as visible */ }
    return true;
  }
  let verified = false;
  try { verified = globalThis.localStorage.getItem(AGE_VERIFIED_KEY) === 'true'; } catch (e) { /* unknown */ }
  return !verified && Date.now() < graceUntil;
}

/** Runs `cb` once the age gate is gone (immediately when it is not showing). Returns a cancel function. */
function whenAgeGateClear(isAlive, cb) {
  const grace = Date.now() + 1500;
  const cleanups = [];
  let stopped = false;
  const stop = () => { stopped = true; while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ignore */ } } };
  const check = () => {
    if (stopped) return;
    if (!isAlive()) { stop(); return; }
    if (!ageGateBlocking(grace)) { stop(); cb(); }
  };
  if (!ageGateBlocking(grace)) { cb(); return stop; }
  try {
    const mo = new MutationObserver(check);
    const gate = document.getElementById('age-gate');
    if (gate) {
      mo.observe(gate, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      if (gate.parentNode) mo.observe(gate.parentNode, { childList: true });
    }
    // the gate may still be injected during the first seconds
    mo.observe(document.documentElement, { childList: true, subtree: true });
    cleanups.push(() => mo.disconnect());
    const t0 = setTimeout(() => { if (!stopped && !gate) check(); }, 1550);
    cleanups.push(() => clearTimeout(t0));
  } catch (e) { /* the poll below still works */ }
  const poll = setInterval(check, 500);
  cleanups.push(() => clearInterval(poll));
  for (const [target, ev] of [[globalThis, 'storage'], [document, 'visibilitychange']]) {
    if (target && target.addEventListener) { target.addEventListener(ev, check); cleanups.push(() => target.removeEventListener(ev, check)); }
  }
  return stop;
}

export function mount(root, opts) {
  if (typeof root._gdTeardown === 'function') { try { root._gdTeardown(); } catch (e) { /* ignore */ } root._gdTeardown = null; }
  try {
    return mountInner(root, opts || {});
  } catch (e) {
    if (typeof root._gdTeardown === 'function') { try { root._gdTeardown(); } catch (e2) { /* ignore */ } root._gdTeardown = null; }
    try { globalThis.localStorage.removeItem('gd:v2'); } catch (e2) { /* no storage */ }
    if (opts && opts.retried) {
      root.textContent = '';
      const p = document.createElement('p');
      p.textContent = 'Grapedle kon niet starten. Vernieuw de pagina.';
      root.appendChild(p);
      return null;
    }
    return mount(root, { ...(opts || {}), retried: true });
  }
}

function mountInner(root, opts) {
  const q = readQuery();
  const store = createStore();
  if (q.get('reset') === '1') store.reset();
  let lang = pickLang(q.get('lang'), store.state.lang);
  if (q.get('lang')) { store.state.lang = lang; store.save(); }
  let t = makeT(lang);
  const mock = q.get('mockShop');
  // Dev-only: ?day=N (data-day on the root, used by the preview page) shows puzzle N without saving,
  // ?now=YYYY-MM-DD[THH:MM] pretends it is that moment in Amsterdam time (clock keeps running).
  const dayParam = DEV ? parseInt(q.get('day') || root.getAttribute('data-day'), 10) : NaN;
  const debugDay = Number.isFinite(dayParam) && dayParam > 0 ? dayParam : null;
  let fakeBase = null;
  if (DEV && q.get('now')) {
    const raw = q.get('now');
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T10:00:00Z' : raw);
    if (!isNaN(d.getTime())) fakeBase = { at: d.getTime(), real: Date.now() };
  }
  const now = () => (fakeBase ? new Date(fakeBase.at + (Date.now() - fakeBase.real)) : new Date());

  const numFmt = () => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'nl-NL');
  let game, shopItems, shopPhase = 'loading', toastTimer = null, justAdded = false, justWon = false;
  let mode = 'daily'; // 'daily' | 'teaser' | 'practice'
  let practiceN = null; // puzzle number of a practice game, null for a random pre-launch grape or random pick
  let cur;
  let alive = true;
  let tickTimer = null;
  const cleanups = [];

  root.textContent = '';
  root.style.removeProperty('min-height'); // the Code Block placeholder reserves height until the game is here
  root.classList.add('gd-root');
  const uid = 'gd' + Math.random().toString(36).slice(2, 7);

  // ---- skeleton ----
  const headerEl = h('header', { class: 'gd-header' });
  const noteEl = h('div', { class: 'gd-note', hidden: true });
  const teaserEl = h('section', { class: 'gd-teaser', hidden: true });
  const playEl = h('div', { class: 'gd-play' });
  const hintsEl = h('div', { class: 'gd-hints', hidden: true });
  const endEl = h('section', { class: 'gd-end', hidden: true, 'aria-labelledby': uid + '-end' });
  const boardEl = h('div', { class: 'gd-board' });
  const live = h('div', { class: 'gd-sr', 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status' });
  const modalHost = h('div', { class: 'gd-modals' });
  const app = h('div', { class: 'gd-app' }, headerEl, noteEl, teaserEl, playEl, hintsEl, endEl, boardEl, live, modalHost);
  root.appendChild(app);

  // layout follows the width of the host column, not the viewport
  function setLayout() {
    const w = root.clientWidth || (globalThis.innerWidth || 0);
    root.setAttribute('data-gd-layout', w >= 640 ? 'wide' : 'narrow');
  }
  setLayout();
  try {
    const ro = new ResizeObserver(setLayout);
    ro.observe(root);
    cleanups.push(() => ro.disconnect());
  } catch (e) {
    globalThis.addEventListener && globalThis.addEventListener('resize', setLayout);
    cleanups.push(() => globalThis.removeEventListener && globalThis.removeEventListener('resize', setLayout));
  }

  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };

  // ---- helpers ----
  const countryName = (c) => (c && countries[c] ? countries[c][lang] : '?');
  const fmtNum = (n) => numFmt().format(n);
  const regionNames = (g) => regionsOf(g).map((r) => r.name || countryName(r.country));
  /** "A / B" as nodes, names in `hit` bold. */
  const joined = (names, hit) => {
    const bold = new Set(hit || []);
    const out = [];
    names.forEach((n, i) => {
      if (i) out.push(' / ');
      out.push(bold.has(n) ? h('strong', { class: 'gd-hit' }, n) : n);
    });
    return out;
  };
  const aromaName = (d) => (descriptors[d] ? descriptors[d][lang] : d);
  /** Official name in small print, only when it adds something to the display name. */
  const smallName = (g) => (g.small ? g.small[lang] : norm(g.name).includes(norm(g.official)) ? null : g.official);

  /** Analytics: only when the host page runs GTM (window.dataLayer is an array). */
  function track(action, extra) {
    try {
      const dl = globalThis.dataLayer;
      if (Array.isArray(dl)) dl.push({ event: 'grapedle', action, puzzle: game && mode === 'daily' ? game.puzzle : null, ...extra });
    } catch (e) { /* analytics must never break the game */ }
  }

  /** Aroma chips "emoji label": identical aroma = filled green chip with a check, same family = yellow outline. */
  function aromaChip(d, cell, big) {
    const hit = (cell.shared || []).includes(d), fam = (cell.familyHit || []).includes(d);
    const info = descriptors[d];
    return h('span', { class: 'gd-chip' + (big ? ' gd-chip-lg' : '') + (hit ? ' gd-chip-hit' : fam ? ' gd-chip-fam' : '') },
      info && info.emoji ? h('span', { class: 'gd-chip-e', 'aria-hidden': 'true' }, info.emoji) : null,
      hit ? h('span', { class: 'gd-chip-ok', 'aria-hidden': 'true' }, '✓') : null,
      h('span', { class: 'gd-chip-t' }, aromaName(d)));
  }
  function flavourNodes(g, cell) {
    if (!g.flavours || !g.flavours.length) return null;
    return g.flavours.map((d) => aromaChip(d, cell, false));
  }
  /** Style chips: a style the answer also has is a filled green chip with a check. */
  const styleIds = (g) => (Array.isArray(g.styles) ? (g.styles.length ? g.styles : ['plain']) : null);
  const styleName = (x) => (styleDefs[x] ? styleDefs[x][lang] : x);
  function styleChip(x, cell, big) {
    const hit = (cell.shared || []).includes(x), info = styleDefs[x];
    return h('span', { class: 'gd-chip' + (big ? ' gd-chip-lg' : '') + (hit ? ' gd-chip-hit' : '') },
      info && info.emoji ? h('span', { class: 'gd-chip-e', 'aria-hidden': 'true' }, info.emoji) : null,
      hit ? h('span', { class: 'gd-chip-ok', 'aria-hidden': 'true' }, '✓') : null,
      h('span', { class: 'gd-chip-t' }, styleName(x)));
  }
  const styleSr = (g, cell) => (styleIds(g) || []).map((x) => styleName(x) + ((cell.shared || []).includes(x) ? ` (${t('sameStyle')})` : '')).join(', ');
  const flavourSr = (g, cell) => (g.flavours || []).map((d) => aromaName(d) + ((cell.shared || []).includes(d) ? ` (${t('sameAroma')})` : (cell.familyHit || []).includes(d) ? ` (${t('sameKind')})` : '')).join(', ');

  const areaArrow = (cell) => (cell.arrow === 'up' ? '↑' : cell.arrow === 'down' ? '↓' : '=');
  function areaText(cell) {
    if (cell.status === 'green') return `${formatArea(cell.value, lang)}`;
    if (cell.value === null || cell.value === undefined) return null;
    return `${formatArea(cell.value, lang)} ${areaArrow(cell)}`;
  }
  function areaSr(cell) {
    if (cell.value === null || cell.value === undefined) return t('unknownValue');
    const n = formatArea(cell.value, lang);
    if (cell.status === 'green') return `${n}, ${t('area_same_sr')}`;
    return `${n}, ${t('area_' + (cell.arrow || 'eq') + '_sr')}`;
  }

  const bodyName = (b) => t('v_body_' + b);
  function bodyText(cell) {
    if (cell.value === null || cell.value === undefined) return t('unknownValue');
    return cell.arrow === 'up' ? `${bodyName(cell.value)} ↑` : cell.arrow === 'down' ? `${bodyName(cell.value)} ↓` : bodyName(cell.value);
  }
  function bodySr(cell) {
    if (cell.value === null || cell.value === undefined) return t('unknownValue');
    return cell.arrow ? `${bodyName(cell.value)}, ${t('body_' + cell.arrow + '_sr')}` : bodyName(cell.value);
  }

  const colLabel = (k) => t('col_' + k);

  function buildTile(cell, g, i) {
    let main = null, sub = null, plain = '', nodes = null;
    switch (cell.key) {
      case 'colour': main = t('v_' + g.colour); plain = main; break;
      case 'region': {
        const parts = cell.parts || [];
        plain = parts.map((x) => {
          const nm = x.name || countryName(x.country);
          return x.hit ? `${nm} (${t('overlap')})` : x.km ? `${nm}, ${t('km', { n: fmtNum(x.km) })} ${t('toward', { dir: t('dir_' + x.dir) })}` : nm;
        }).join('; ') || regionNames(g).join(' / ');
        // one line per region: name, then km + arrow; a region the answer shares is bold and has no distance
        nodes = parts.length ? parts.map((x) => h('span', { class: 'gd-reg' },
          h('span', { class: x.hit && cell.status !== 'green' ? 'gd-reg-n gd-hit' : 'gd-reg-n' }, x.name || countryName(x.country)),
          x.km ? h('span', { class: 'gd-sub' }, `${t('km', { n: fmtNum(x.km) })} ${ARROWS[x.dir]}`) : null)) : null;
        main = regionNames(g).join(' / ');
        break;
      }
      case 'body': main = bodyText(cell); plain = bodySr(cell); break;
      case 'area': main = areaText(cell); plain = areaSr(cell); break;
      default: break;
    }
    let chips = cell.key === 'flavour' ? flavourNodes(g, cell) : null;
    if (cell.key === 'flavour') plain = flavourSr(g, cell);
    if (cell.key === 'style') {
      const ids = styleIds(g);
      chips = ids ? ids.map((x) => styleChip(x, cell, false)) : null;
      plain = ids ? styleSr(g, cell) : '';
    }
    const srStatus = t('st_' + cell.status);
    const srText = `${colLabel(cell.key)}: ${plain || t('unknownValue')}${srStatus ? ', ' + srStatus : ''}`;
    const valEl = h('span', { class: 'gd-val' + (chips ? ' gd-val-chips' : '') }, chips || nodes || main || '–',
      sub ? h('span', { class: 'gd-sub' }, sub) : null);
    return h('div', { class: `gd-tile gd-k-${cell.key} gd-s-${cell.status}`, style: `--i:${i}` },
      h('span', { class: 'gd-lbl', 'aria-hidden': 'true' }, colLabel(cell.key)),
      STATUS_SYMBOL[cell.status] ? h('span', { class: 'gd-sym', 'aria-hidden': 'true' }, STATUS_SYMBOL[cell.status]) : null,
      h('span', { 'aria-hidden': 'true', class: 'gd-body' }, valEl),
      h('span', { class: 'gd-sr' }, srText));
  }

  // ---- header ----
  function renderHeader() {
    const langBtn = (code) => h('button', {
      type: 'button', class: 'gd-seg' + (code === lang ? ' gd-seg-on' : ''), 'aria-pressed': code === lang ? 'true' : 'false',
      lang: code, onclick: () => setLang(code),
    }, code.toUpperCase());
    headerEl.textContent = '';
    headerEl.append(
      h('h2', { class: 'gd-title' }, mode === 'daily' && game ? t('puzzle', { n: game.puzzle }) : 'Grapedle'),
      h('div', { class: 'gd-tools' },
        mode === 'practice' ? null : h('button', { type: 'button', class: 'gd-btn gd-btn-ghost gd-btn-small', onclick: (e) => openPractice(e.currentTarget) }, t('practice')),
        h('div', { class: 'gd-langs', role: 'group', 'aria-label': t('lang') }, langBtn('nl'), langBtn('en')),
        h('button', { type: 'button', class: 'gd-icon', 'aria-label': t('help'), title: t('help'), html: ICON_HELP, onclick: (e) => openHelp(e.currentTarget) }),
        h('button', { type: 'button', class: 'gd-icon', 'aria-label': t('stats'), title: t('stats'), html: ICON_STATS, onclick: (e) => openStats(e.currentTarget) })));
  }

  function setLang(code) {
    if (code === lang) return;
    lang = code; t = makeT(lang);
    store.state.lang = lang; store.save();
    root.setAttribute('lang', lang);
    renderAll();
  }

  // ---- board ----
  function renderBoard() {
    const rows = game ? game.rows() : [];
    boardEl.textContent = '';
    boardEl.hidden = !game;
    if (!game) return;
    // an empty board still shows the column headers, so newcomers see what they will get
    const cols = h('div', { class: 'gd-cols' + (rows.length ? '' : ' gd-cols-empty'), 'aria-hidden': 'true' }, h('span', { class: 'gd-colname' }, t('grapeCol')),
      h('div', { class: 'gd-colgrid' }, COLUMNS.map((k) => h('span', { class: 'gd-col' }, colLabel(k)))));
    if (!rows.length) { boardEl.append(cols); return; }
    const list = h('ol', { class: 'gd-rows', reversed: true });
    rows.slice().reverse().forEach((r, idx) => {
      const isNew = justAdded && idx === 0;
      const isWin = isNew && justWon;
      list.appendChild(h('li', { class: 'gd-row' + (isNew ? ' gd-new' : '') + (isWin ? ' gd-win' : '') },
        h('div', { class: 'gd-name' }, r.grape.name),
        h('div', { class: 'gd-tiles' }, r.cells.map((c, i) => buildTile(c, r.grape, i)))));
    });
    boardEl.append(cols, list, h('p', { class: 'gd-legend' }, t('legend')));
    justAdded = false; justWon = false;
  }

  // ---- input / autocomplete ----
  let results = [], active = -1, explicit = false, input, listEl, msgEl, counterEl;
  function renderPlay() {
    playEl.textContent = '';
    playEl.hidden = !game || game.status !== 'playing';
    if (playEl.hidden) return;
    const listId = uid + '-list';
    input = h('input', {
      type: 'text', class: 'gd-input', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': listId,
      'aria-autocomplete': 'list', 'aria-label': t('placeholder'), placeholder: t('placeholder'),
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go',
    });
    listEl = h('ul', { class: 'gd-list', id: listId, role: 'listbox', hidden: true, 'aria-label': t('placeholder') });
    msgEl = h('p', { class: 'gd-msg', role: 'status' });
    counterEl = h('p', { class: 'gd-counter' }, t('attempt', { n: game.guesses.length + 1, max: MAX_GUESSES }));
    const btn = h('button', { type: 'submit', class: 'gd-btn' }, t('guessBtn'));
    const form = h('form', { class: 'gd-form', autocomplete: 'off', novalidate: true, onsubmit: (e) => { e.preventDefault(); submitTyped(); } },
      h('div', { class: 'gd-field' }, input, listEl), btn);
    playEl.append(form, msgEl, counterEl);

    input.addEventListener('input', () => { msgEl.textContent = ''; results = search(input.value); active = -1; explicit = false; renderList(); });
    input.addEventListener('blur', () => setTimeout(closeList, 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!results.length) {
          if (!input.value.trim()) return;
          results = search(input.value); renderList();
          if (!results.length) return;
        }
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        let i = active;
        for (let n = 0; n < results.length; n++) {
          i = (i + dir + results.length) % results.length;
          if (!game.has(results[i].grape.id)) { active = i; explicit = true; break; }
        }
        paintActive(true);
      } else if (e.key === 'Escape') { closeList(); }
    });
  }

  function paintActive(scroll) {
    if (!listEl) return;
    [...listEl.children].forEach((li, i) => {
      li.classList.toggle('gd-opt-on', i === active);
      li.setAttribute('aria-selected', i === active ? 'true' : 'false');
    });
    if (active >= 0) input.setAttribute('aria-activedescendant', uid + '-o' + active); else input.removeAttribute('aria-activedescendant');
    const on = listEl.querySelector('.gd-opt-on');
    if (scroll && on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function renderList() {
    listEl.textContent = '';
    const open = results.length > 0;
    listEl.hidden = !open;
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    results.forEach((r, i) => {
      const done = game.has(r.grape.id);
      const li = h('li', {
        id: uid + '-o' + i, role: 'option', class: 'gd-opt' + (done ? ' gd-opt-done' : ''),
        'aria-selected': 'false', 'aria-disabled': done ? 'true' : null,
        onmousedown: (e) => { e.preventDefault(); if (!done) submit(r.grape.id); },
        onmousemove: () => { if (!done && active !== i) { active = i; explicit = true; paintActive(false); } },
      }, ...(r.via ? [h('span', { class: 'gd-opt-via' }, r.via), h('span', { class: 'gd-opt-arrow', 'aria-hidden': 'true' }, '→'), h('span', { class: 'gd-opt-name' }, r.grape.name)]
        : [h('span', { class: 'gd-opt-name' }, r.grape.name)]),
      done ? h('span', { class: 'gd-opt-note' }, t('alreadyGuessed')) : null);
      listEl.appendChild(li);
    });
    paintActive(false);
  }
  function closeList() { if (!listEl) return; results = []; active = -1; explicit = false; renderList(); }

  function note(msg) { msgEl.textContent = msg; announce(msg); }

  /**
   * Enter submits only for an exact name/synonym, a single remaining suggestion, or a suggestion the
   * player picked with the arrow keys or the pointer. Anything else opens the list and asks to pick.
   */
  function submitTyped() {
    const v = input.value.trim();
    if (!v) return;
    if (explicit && active >= 0 && results[active] && !game.has(results[active].grape.id)) return submit(results[active].grape.id);
    const g = exact(v);
    if (g) {
      if (game.has(g.id)) return note(t('alreadyGuessed'));
      return submit(g.id);
    }
    const found = search(v);
    if (!found.length) return note(t('unknownGrape'));
    const open = found.filter((r) => !game.has(r.grape.id));
    if (found.length === 1) {
      if (!open.length) return note(t('alreadyGuessed'));
      return submit(open[0].grape.id);
    }
    results = found; active = -1; explicit = false; renderList();
    note(t('pickFromList'));
  }

  function submit(id) {
    const row = game.guess(id);
    if (!row) return;
    justAdded = true;
    justWon = game.status === 'won';
    if (mode === 'daily') track('guess', { guess: row.grape.id, n: game.guesses.length });
    const parts = row.cells.map((c) => `${colLabel(c.key)} ${t('st_' + c.status)}`).join(', ');
    const left = MAX_GUESSES - game.guesses.length;
    announce(`${row.grape.name}. ${parts}.` + (game.status === 'playing' ? ' ' + t('guessesLeft', { n: left }) : ''));
    results = []; active = -1; explicit = false;
    renderBoard();
    renderHints();
    if (game.status === 'playing') {
      input.value = ''; closeList(); msgEl.textContent = '';
      counterEl.textContent = t('attempt', { n: game.guesses.length + 1, max: MAX_GUESSES });
      input.focus();
    } else {
      renderPlay(); renderEnd();
      if (mode === 'daily') track(game.status === 'won' ? 'win' : 'loss', { tries: game.guesses.length, hints: game.hints.length });
      const hd = endEl.querySelector('.gd-end-title');
      if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: false }); }
      announce(endMessage());
    }
  }

  // ---- hints ----
  function hintText(n) {
    const v = n === 1 ? game.answer.hint[lang] : firstLetter(game.answer.name);
    return t('hint' + n, { v });
  }

  function renderHints() {
    hintsEl.textContent = '';
    if (!game) { hintsEl.hidden = true; return; }
    const over = game.status !== 'playing';
    const used = game.hints;
    const nodes = [];
    for (const n of [1, 2]) {
      if (used.includes(n)) {
        nodes.push(h('p', { class: 'gd-hint' }, hintText(n)));
      } else if (!over) {
        const ready = game.hintReady(n);
        nodes.push(h('button', {
          type: 'button', class: 'gd-btn gd-btn-ghost gd-hintbtn', disabled: !ready,
          onclick: () => {
            if (!game.useHint(n)) return;
            if (mode === 'daily') track('hint', { hint: n, guesses: game.guesses.length });
            announce(hintText(n));
            renderHints();
            if (input && input.isConnected) input.focus();
          },
        }, t('hint' + n + 'Btn'), ready ? null : h('span', { class: 'gd-hint-lock' }, ' · ' + t('hintLocked', { n: HINT_AT[n - 1] }))));
      }
    }
    hintsEl.hidden = !nodes.length;
    hintsEl.append(...nodes);
  }

  // ---- end panel ----
  function endMessage() {
    if (game.status === 'won') { const n = game.guesses.length; return n === 1 ? t('win1') : t('win', { n }); }
    return t('lose', { grape: game.answer.name });
  }

  function facts(g) {
    const rows = [
      [t('region'), regionsOf(g).length === 1 && regionsOf(g)[0].name ? `${regionsOf(g)[0].name}, ${countryName(regionsOf(g)[0].country)}` : regionNames(g).join(' / ')],
      [colLabel('body'), g.body ? bodyName(g.body) : null],
      [t('styleRow'), styleIds(g) ? h('span', { class: 'gd-chips' }, styleIds(g).map((x) => styleChip(x, {}, true))) : null],
      [t('aromas'), g.flavours && g.flavours.length ? h('span', { class: 'gd-chips' }, g.flavours.map((d) => aromaChip(d, {}, true))) : null],
    ].filter((r) => r[1]);
    return h('dl', { class: 'gd-facts' }, rows.map((r) => h('div', { class: 'gd-fact' }, h('dt', null, r[0]), h('dd', null, r[1]))));
  }

  function productTiles(list, kind) {
    return h('ul', { class: 'gd-products' }, list.map((p) => {
      const price = p.price ? formatPrice(p.price, lang) : '';
      return h('li', { class: 'gd-product' },
        h('a', { class: 'gd-product-link', href: withUtm(p.url), 'data-gd-link': kind },
          p.image ? h('img', { class: 'gd-product-img', src: p.image, alt: '', loading: 'lazy' }) : h('span', { class: 'gd-product-img gd-product-ph' }),
          h('span', { class: 'gd-product-title' }, p.title),
          price ? h('span', { class: 'gd-product-price' }, price) : null));
    }));
  }

  const tastingsBlock = () => h('div', { class: 'gd-tastings' },
    h('p', { class: 'gd-muted' }, t('tastingsText')),
    h('a', { class: 'gd-btn gd-btn-ghost', href: withUtm(TASTINGS_URL), 'data-gd-link': 'tastings' }, t('tastingsCta')));

  /**
   * Shop block. Stocked grape: its wines (up to 4) and a shop link. Not stocked: "Lijkt op", up to 3
   * wines of clearly similar stocked grapes. Without tiles (shop down, no match, nothing similar) the
   * block stays empty and only the tastings link below it remains.
   */
  function renderShop(box) {
    box.textContent = '';
    const a = game.answer;
    if (shopPhase === 'loading') {
      box.hidden = false;
      box.append(h('p', { class: 'gd-muted' }, t('shopLoading')));
      return;
    }
    const items = shopItems;
    if (a.stocked) {
      const list = items ? productsFor(items, a.id) : [];
      if (list.length) {
        box.hidden = false;
        box.append(h('h3', { class: 'gd-h3' }, t('shopTitle')), productTiles(list, 'product'),
          h('a', { class: 'gd-btn gd-btn-ghost', href: withUtm(SHOP_PAGE), 'data-gd-link': 'shop' }, t('shopCta')));
        return;
      }
    } else {
      const list = items ? similarProducts(items, a) : [];
      if (list.length) {
        box.hidden = false;
        box.append(h('h3', { class: 'gd-h3' }, t('similarTitle')), h('p', { class: 'gd-muted' }, t('similarIntro')), productTiles(list, 'similar'));
        return;
      }
    }
    box.hidden = true;
  }

  function renderEnd() {
    const over = !!game && game.status !== 'playing';
    endEl.hidden = !over;
    endEl.textContent = '';
    if (!over) return;
    const won = game.status === 'won';
    const daily = mode === 'daily';
    const shopBox = h('div', { class: 'gd-shop' });
    renderShop(shopBox);
    if (shopPhase === 'loading') {
      const gid = game.answer.id;
      loadItems({ mock }).then((l) => { shopItems = l; shopPhase = 'done'; if (alive && game && game.answer.id === gid) renderShop(shopBox); });
    }
    const small = smallName(game.answer);
    const cheer = won ? t('cheer' + Math.min(6, Math.max(1, game.guesses.length))) : null;
    const fact = game.answer.fact && game.answer.fact[lang];
    const shareBtn = h('button', { type: 'button', class: 'gd-btn gd-btn-share', onclick: doShare }, t('share'));
    endEl.append(...[
      h('h3', { class: 'gd-end-title', id: uid + '-end' }, endMessage()),
      cheer ? h('p', { class: 'gd-cheer' }, cheer) : null,
      h('div', { class: 'gd-answer' + (won ? ' gd-answer-won' : '') },
        h('p', { class: 'gd-kicker' }, daily ? t('answerTitle') : t('practiceAnswerTitle')),
        h('p', { class: 'gd-answer-name' }, game.answer.name),
        small ? h('p', { class: 'gd-answer-small' }, small) : null,
        facts(game.answer),
        fact ? h('p', { class: 'gd-did' }, h('strong', null, t('didYouKnow') + ': '), fact) : null),
      daily ? h('div', { class: 'gd-share' }, shareBtn) : null,
      daily ? h('p', { class: 'gd-countdown' }, t('next') + ' ', h('strong', { class: 'gd-clock' }, clockText())) : null,
      daily ? h('div', { class: 'gd-practice-cta' }, h('button', { type: 'button', class: 'gd-btn gd-btn-ghost', onclick: (e) => openPractice(e.currentTarget) }, t('practice')))
        : h('div', { class: 'gd-practice-cta' },
          h('button', { type: 'button', class: 'gd-btn', onclick: () => startPractice(null) }, t('practiceAgain')),
          h('button', { type: 'button', class: 'gd-btn gd-btn-ghost', onclick: () => leavePractice() }, t('practiceDaily'))),
      shopBox,
      tastingsBlock()].filter(Boolean));
  }

  function clockText() {
    const s = Math.max(0, Math.floor(msUntilNextPuzzle(now()) / 1000));
    const p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }

  function teaserClock() {
    const s = Math.max(0, Math.floor(msUntilStart(now(), schedule.start) / 1000));
    const p = (n) => String(n).padStart(2, '0');
    const d = Math.floor(s / 86400), r = s % 86400;
    return `${d} ${t('days')} ${p(Math.floor(r / 3600))}:${p(Math.floor((r % 3600) / 60))}:${p(r % 60)}`;
  }

  async function doShare(e) {
    const btn = e.currentTarget;
    const text = shareText({ puzzle: game.puzzle, rows: game.rows(), won: game.status === 'won', hints: game.hints.length });
    track('share');
    const coarse = globalThis.matchMedia && globalThis.matchMedia('(pointer: coarse)').matches;
    if (coarse && navigator.share) {
      try { await navigator.share({ text }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (err) {
      try {
        const ta = h('textarea', { class: 'gd-sr', readonly: true }); ta.value = text;
        btn.parentNode.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (e2) { ok = false; }
    }
    if (ok) {
      const old = t('share');
      btn.textContent = t('copied'); announce(t('copied'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { btn.textContent = old; }, 2000);
    }
  }

  // ---- modals ----
  function openModal(title, body, opener) {
    const dlg = h('dialog', { class: 'gd-dialog', 'aria-labelledby': uid + '-dt' },
      h('div', { class: 'gd-dialog-head' },
        h('h2', { class: 'gd-dialog-title', id: uid + '-dt' }, title),
        h('button', { type: 'button', class: 'gd-icon', 'aria-label': t('close'), onclick: () => dlg.close(), html: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' })),
      body);
    // a click on the backdrop reports the dialog as target; only close when it is really outside the box
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      const out = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      if (out) dlg.close();
    });
    dlg.addEventListener('close', () => { dlg.remove(); if (opener && opener.focus && opener.isConnected) opener.focus(); else if (input && input.isConnected) input.focus(); });
    modalHost.textContent = '';
    modalHost.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    return dlg;
  }

  function demoTile(status, label, main, sub) {
    return h('div', { class: `gd-tile gd-demo gd-s-${status}` },
      h('span', { class: 'gd-lbl gd-lbl-on' }, label),
      STATUS_SYMBOL[status] ? h('span', { class: 'gd-sym' }, STATUS_SYMBOL[status]) : null,
      h('span', { class: 'gd-body' }, h('span', { class: 'gd-val' }, main, sub ? h('span', { class: 'gd-sub' }, sub) : null)));
  }

  function openHelp(opener) {
    const body = h('div', { class: 'gd-dialog-body' },
      h('p', null, t('helpIntro')),
      h('div', { class: 'gd-help-demo', 'aria-hidden': 'true' },
        demoTile('green', colLabel('colour'), t('v_red')),
        demoTile('yellow', colLabel('region'), 'Bordeaux', `${t('km', { n: 400 })} ${ARROWS[2]}`),
        demoTile('yellow', colLabel('body'), bodyName(4) + ' ↓'),
        demoTile('yellow', colLabel('style'), '🥂 ' + styleName('sparkling')),
        demoTile('red', colLabel('area'), formatArea(280000, lang) + ' ↓'),
        demoTile('grey', colLabel('flavour'), '–')),
      h('button', { type: 'button', class: 'gd-btn', onclick: (e) => e.currentTarget.closest('dialog').close() }, t('gotIt')),
      h('details', { class: 'gd-details' },
        h('summary', null, t('helpMore')),
        h('div', { class: 'gd-details-body' },
          h('ul', { class: 'gd-help-list' }, COLUMNS.map((k) => h('li', null, h('strong', null, colLabel(k) + ': '), t('help_' + k)))),
          h('p', null, t('helpHints')),
          h('p', { class: 'gd-muted' }, t('helpExample')),
          h('p', { class: 'gd-muted' }, t('helpFooter')))));
    openModal(t('helpTitle'), body, opener);
  }

  function openStats(opener) {
    const todayN = mode === 'daily' && game ? game.puzzle : Math.max(1, puzzleNumber(now(), schedule.start));
    const st = computeStats(store.state.history, todayN);
    const max = Math.max(1, ...st.dist);
    const todayTries = store.state.history[todayN];
    const num = (v, l) => h('div', { class: 'gd-stat' }, h('strong', { class: 'gd-stat-n' }, String(v)), h('span', null, l));
    const body = h('div', { class: 'gd-dialog-body' },
      h('div', { class: 'gd-statgrid' }, num(st.played, t('played')), num(st.winPct, t('winPct')), num(st.current, t('streak')), num(st.best, t('best'))),
      h('h3', { class: 'gd-h3' }, t('dist')),
      h('ol', { class: 'gd-dist' }, st.dist.map((n, i) => h('li', { class: 'gd-dist-row' },
        h('span', { class: 'gd-dist-k' }, String(i + 1)),
        h('span', { class: 'gd-dist-bar' + (todayTries === i + 1 ? ' gd-dist-today' : ''), style: `width:${Math.max(8, Math.round((n / max) * 100))}%` }, String(n))))),
      store.persistent ? null : h('p', { class: 'gd-muted' }, t('noStorage')));
    openModal(t('statsTitle'), body, opener);
  }

  // ---- practice ----
  /** Past puzzle numbers, newest first, at most PRACTICE_MAX_LIST. Never today's or a future one. */
  function pastPuzzles() {
    const today = puzzleNumber(now(), schedule.start);
    const out = [];
    for (let n = today - 1; n >= 1 && out.length < PRACTICE_MAX_LIST; n--) out.push(n);
    return out;
  }
  /** Before launch: pool grapes, minus the first two weeks of answers so nothing upcoming is given away. */
  function prelaunchPool() {
    const soon = new Set(schedule.days.slice(0, 14));
    return grapes.filter((g) => g.answer && !soon.has(g.id));
  }

  function openPractice(opener) {
    const past = pastPuzzles();
    const dlg = { el: null };
    const pick = (n) => { dlg.el.close(); startPractice(n); };
    const body = h('div', { class: 'gd-dialog-body' },
      h('p', null, t('practiceIntro')),
      h('button', { type: 'button', class: 'gd-btn', onclick: () => pick(null) }, t('practiceRandom')),
      past.length ? h('h3', { class: 'gd-h3' }, t('practiceListLabel')) : null,
      past.length ? h('ul', { class: 'gd-practice-list' }, past.map((n) => h('li', null,
        h('button', { type: 'button', class: 'gd-btn gd-btn-ghost gd-practice-item', onclick: () => pick(n) },
          h('strong', null, '#' + n), ' ', formatYmd(puzzleDate(n, schedule.start), lang, true))))) : null);
    dlg.el = openModal(t('practiceTitle'), body, opener);
  }

  function startPractice(n) {
    const today = puzzleNumber(now(), schedule.start);
    let answerId, puzzle = null;
    if (n === null && today > 1) n = 1 + Math.floor(Math.random() * (today - 1));
    if (n !== null) { puzzle = n; answerId = answerIdFor(n, schedule); } else {
      const pool = prelaunchPool();
      answerId = pool[Math.floor(Math.random() * pool.length)].id;
    }
    if (mode !== 'practice') { returnTo = mode; }
    mode = 'practice'; practiceN = puzzle;
    game = createGame({ puzzle: puzzle || 0, store, persist: false, answerId });
    shopItems = shopItems || null;
    results = []; active = -1;
    renderAll();
    if (mode === 'practice' && input && input.isConnected) { try { input.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    try { root.scrollIntoView && root.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
  }
  let returnTo = 'daily';
  function leavePractice() { practiceN = null; start(); }

  // ---- lifecycle ----
  function currentPuzzle() {
    if (debugDay) return { mode: 'daily', n: debugDay, persist: false };
    const raw = puzzleNumber(now(), schedule.start);
    return raw < 1 ? { mode: 'teaser', n: 0, persist: false } : { mode: 'daily', n: raw, persist: true };
  }

  function renderTeaser() {
    teaserEl.textContent = '';
    teaserEl.hidden = mode !== 'teaser';
    if (mode !== 'teaser') return;
    teaserEl.append(
      h('h3', { class: 'gd-teaser-title', id: uid + '-end' }, t('teaserTitle', { date: formatYmd(schedule.start, lang) })),
      h('p', { class: 'gd-muted' }, t('teaserText')),
      h('p', { class: 'gd-teaser-clock' }, h('strong', { class: 'gd-clock gd-tclock' }, teaserClock())),
      h('button', { type: 'button', class: 'gd-btn', onclick: () => startPractice(null) }, t('teaserPractice')));
  }

  function renderNote() {
    noteEl.textContent = '';
    const practicing = mode === 'practice';
    noteEl.hidden = !practicing;
    if (!practicing) return;
    noteEl.append(
      h('span', { class: 'gd-note-text' }, practiceN ? t('practiceLabel', { n: practiceN }) : t('practiceLabelRandom')),
      h('button', { type: 'button', class: 'gd-btn gd-btn-ghost gd-btn-small', onclick: () => leavePractice() }, returnTo === 'teaser' ? t('back') : t('practiceDaily')));
  }

  function renderAll() {
    renderHeader(); renderNote(); renderTeaser(); renderPlay(); renderHints(); renderBoard(); renderEnd();
    root.setAttribute('lang', lang);
  }

  function start() {
    cur = currentPuzzle();
    mode = cur.mode;
    practiceN = null;
    shopItems = null; shopPhase = 'loading';
    if (mode === 'teaser') game = null;
    else game = createGame({ puzzle: cur.n, store, persist: cur.persist });
    renderAll();
    if (mode === 'daily' && game.status === 'playing' && game.guesses.length === 0 && !startedPuzzles.has(game.puzzle)) {
      startedPuzzles.add(game.puzzle);
      track('start');
    }
    if (mode === 'daily' && !store.state.seenHelp && game.guesses.length === 0) {
      // never open a modal over the host page's age gate: wait until it is gone
      const cancel = whenAgeGateClear(() => alive && root.isConnected, () => {
        if (!alive || mode !== 'daily' || store.state.seenHelp || game.guesses.length) return;
        store.state.seenHelp = true; store.save();
        openHelp(null);
      });
      cleanups.push(cancel);
    }
  }

  function teardown() {
    alive = false;
    clearTimeout(toastTimer);
    clearInterval(tickTimer);
    while (cleanups.length) { try { cleanups.pop()(); } catch (e) { /* ignore */ } }
  }
  root._gdTeardown = teardown;

  function safeStart() {
    try { start(); } catch (e) {
      store.reset();
      throw e;
    }
  }
  safeStart();

  const onEndClick = (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[data-gd-link]') : null;
    if (a) track('shop_click', { link: a.getAttribute('data-gd-link'), href: a.getAttribute('href') });
  };
  endEl.addEventListener('click', onEndClick);

  tickTimer = setInterval(() => {
    if (!root.isConnected) { teardown(); return; }
    const clock = root.querySelector(mode === 'teaser' ? '.gd-tclock' : '.gd-clock');
    if (clock) clock.textContent = mode === 'teaser' ? teaserClock() : clockText();
    if (!debugDay) {
      const c = currentPuzzle();
      const changed = c.mode !== cur.mode || c.n !== cur.n;
      if (changed && mode !== 'practice') { try { start(); } catch (e) { teardown(); mount(root, { retried: true }); } }
      else if (changed) { cur = c; returnTo = c.mode; }
    }
  }, 1000);

  return { store, get game() { return game; }, teardown };
}
