import { byId, countries, descriptors, schedule } from './data.js';
import { COLUMNS, STATUS_SYMBOL, trendClass } from './feedback.js';
import { createGame, shareText, MAX_GUESSES } from './game.js';
import { makeT, pickLang } from './i18n.js';
import { search, exact } from './search.js';
import { createStore, computeStats } from './storage.js';
import { puzzleNumber, msUntilNextPuzzle } from './date.js';
import { loadProducts, formatPrice, categoriesFor } from './shop.js';

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

export function mount(root) {
  const q = readQuery();
  const store = createStore();
  if (q.get('reset') === '1') store.reset();
  let lang = pickLang(q.get('lang'), store.state.lang);
  if (q.get('lang')) { store.state.lang = lang; store.save(); }
  let t = makeT(lang);
  const mock = q.get('mockShop');
  const dayParam = parseInt(q.get('day'), 10);
  const debugDay = Number.isFinite(dayParam) && dayParam > 0 ? dayParam : null;

  const numFmt = () => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'nl-NL');
  let game, products = null, toastTimer = null, tickTimer = null, justAdded = false, resultTries = null;

  root.textContent = '';
  root.classList.add('gd-root');
  const uid = 'gd' + Math.random().toString(36).slice(2, 7);

  // ---- skeleton ----
  const headerEl = h('header', { class: 'gd-header' });
  const noteEl = h('p', { class: 'gd-note', hidden: true });
  const playEl = h('div', { class: 'gd-play' });
  const endEl = h('section', { class: 'gd-end', hidden: true, 'aria-labelledby': uid + '-end' });
  const boardEl = h('div', { class: 'gd-board' });
  const live = h('div', { class: 'gd-sr', 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status' });
  const modalHost = h('div', { class: 'gd-modals' });
  const app = h('div', { class: 'gd-app' }, headerEl, noteEl, playEl, endEl, boardEl, live, modalHost);
  root.appendChild(app);

  // layout follows the width of the host column, not the viewport
  function setLayout() {
    const w = root.clientWidth || (globalThis.innerWidth || 0);
    root.setAttribute('data-gd-layout', w >= 640 ? 'wide' : 'narrow');
  }
  setLayout();
  try { new ResizeObserver(setLayout).observe(root); } catch (e) { globalThis.addEventListener && globalThis.addEventListener('resize', setLayout); }

  const announce = (msg) => { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); };

  // ---- helpers ----
  const countryName = (c) => (c && countries[c] ? countries[c][lang] : '?');
  const grapeName = (id) => (byId.get(id) ? byId.get(id).name : id);
  const fmtNum = (n) => numFmt().format(n);

  function tileValue(key, g, cell) {
    switch (key) {
      case 'colour': return t('v_' + g.colour);
      case 'origin': return countryName(g.origin);
      case 'top': return g.topCountries && g.topCountries.length ? countryName(g.topCountries[0]) : null;
      case 'parents': return g.parents && g.parents.length ? g.parents.map(grapeName).join(' × ') : null;
      case 'climate': return g.climate ? t('v_' + g.climate) : null;
      case 'ripening': return g.ripening ? t('v_' + g.ripening) : null;
      case 'area': return g.areaHa ? fmtNum(g.areaHa) : null;
      case 'trend': return trendText(g.trendPct);
      default: return null;
    }
  }

  function flavourNodes(g, cell) {
    if (!g.flavours || !g.flavours.length) return null;
    const shared = new Set(cell.shared || []);
    return g.flavours.map((d) => {
      const name = descriptors[d] ? descriptors[d][lang] : d;
      return h('span', { class: 'gd-chip' + (shared.has(d) ? ' gd-chip-hit' : '') }, name);
    });
  }

  function trendText(pct) {
    const c = trendClass(pct);
    if (c < 0) return null;
    let r = Math.round(pct);
    const txt = trendClass(r) === c ? String(Math.abs(r)) : Math.abs(pct).toFixed(1);
    const sign = pct > 0 && r !== 0 ? '+' : pct < 0 ? '\u2212' : '';
    const glyph = c >= 3 ? '\u2197' : c === 2 ? '\u2192' : '\u2198';
    return `${sign}${txt}% ${glyph}`;
  }
  const trendLabel = (pct) => { const c = trendClass(pct); return c < 0 ? null : t('trend_' + c); };

  const colLabel = (k) => t('col_' + k);
  const shortLabel = (k) => (k === 'top' || k === 'trend' ? t('short_' + k) : k === 'area' ? t('col_area') : colLabel(k));

  function buildTile(cell, g, i) {
    const val = cell.key === 'flavour' ? flavourNodes(g, cell) : tileValue(cell.key, g, cell);
    const known = val !== null && !(Array.isArray(val) && !val.length);
    const arrow = cell.arrow ? (cell.arrow === 'up' ? '↑' : '↓') : '';
    const plain = cell.key === 'flavour'
      ? (g.flavours || []).map((d) => (descriptors[d] ? descriptors[d][lang] : d)).join(', ')
      : cell.key === 'trend' && val ? `${val.replace(/ .$/, '')} (${trendLabel(g.trendPct)})` : (val || t('unknownValue'));
    const srText = `${colLabel(cell.key)}: ${plain || t('unknownValue')}${cell.arrow ? ', ' + (cell.arrow === 'up' ? t('up') : t('down')) : ''}, ${t('st_' + cell.status)}`;
    const valEl = h('span', { class: 'gd-val' + (cell.key === 'flavour' ? ' gd-val-chips' : '') },
      cell.key === 'flavour' ? (known ? val : '–') : (known ? val : '–'),
      arrow ? h('span', { class: 'gd-arrow' }, arrow) : null);
    return h('div', { class: 'gd-tile gd-s-' + cell.status, style: `--i:${i}` },
      h('span', { class: 'gd-lbl', 'aria-hidden': 'true' }, shortLabel(cell.key)),
      h('span', { class: 'gd-sym', 'aria-hidden': 'true' }, STATUS_SYMBOL[cell.status]),
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
      h('h2', { class: 'gd-title' }, t('puzzle', { n: game.puzzle })),
      h('div', { class: 'gd-tools' },
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
    const rows = game.rows();
    boardEl.textContent = '';
    if (!rows.length) return;
    const cols = h('div', { class: 'gd-cols', 'aria-hidden': 'true' }, h('span', { class: 'gd-colname' }, t('grapeCol')),
      h('div', { class: 'gd-colgrid' }, COLUMNS.map((k) => h('span', { class: 'gd-col' }, colLabel(k)))));
    const list = h('ol', { class: 'gd-rows', reversed: true });
    rows.slice().reverse().forEach((r, idx) => {
      const isNew = justAdded && idx === 0;
      list.appendChild(h('li', { class: 'gd-row' + (isNew ? ' gd-new' : '') },
        h('div', { class: 'gd-name' }, r.grape.name),
        h('div', { class: 'gd-tiles' }, r.cells.map((c, i) => buildTile(c, r.grape, i)))));
    });
    boardEl.append(cols, list);
    justAdded = false;
  }

  // ---- input / autocomplete ----
  let results = [], active = -1, input, listEl, msgEl, counterEl;
  function renderPlay() {
    playEl.textContent = '';
    playEl.hidden = game.status !== 'playing';
    if (game.status !== 'playing') return;
    const listId = uid + '-list';
    input = h('input', {
      type: 'text', class: 'gd-input', role: 'combobox', 'aria-expanded': 'false', 'aria-controls': listId,
      'aria-autocomplete': 'list', 'aria-label': t('placeholder'), placeholder: t('placeholder'),
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go',
    });
    listEl = h('ul', { class: 'gd-list', id: listId, role: 'listbox', hidden: true, 'aria-label': t('placeholder') });
    msgEl = h('p', { class: 'gd-msg' });
    counterEl = h('p', { class: 'gd-counter' }, t('attempt', { n: game.guesses.length + 1, max: MAX_GUESSES }));
    const btn = h('button', { type: 'submit', class: 'gd-btn' }, t('guessBtn'));
    const form = h('form', { class: 'gd-form', autocomplete: 'off', novalidate: true, onsubmit: (e) => { e.preventDefault(); submitTyped(); } },
      h('div', { class: 'gd-field' }, input, listEl), btn);
    playEl.append(form, msgEl, counterEl);

    input.addEventListener('input', () => { msgEl.textContent = ''; results = search(input.value); active = results.findIndex((r) => !game.has(r.grape.id)); renderList(); });
    input.addEventListener('blur', () => setTimeout(closeList, 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!results.length) return;
        e.preventDefault();
        const dir = e.key === 'ArrowDown' ? 1 : -1;
        let i = active;
        for (let n = 0; n < results.length; n++) {
          i = (i + dir + results.length) % results.length;
          if (!game.has(results[i].grape.id)) { active = i; break; }
        }
        renderList();
      } else if (e.key === 'Escape') { closeList(); }
    });
  }

  function renderList() {
    listEl.textContent = '';
    const open = results.length > 0;
    listEl.hidden = !open;
    input.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (active >= 0) input.setAttribute('aria-activedescendant', uid + '-o' + active); else input.removeAttribute('aria-activedescendant');
    results.forEach((r, i) => {
      const done = game.has(r.grape.id);
      const li = h('li', {
        id: uid + '-o' + i, role: 'option', class: 'gd-opt' + (i === active ? ' gd-opt-on' : '') + (done ? ' gd-opt-done' : ''),
        'aria-selected': i === active ? 'true' : 'false', 'aria-disabled': done ? 'true' : null,
        onmousedown: (e) => { e.preventDefault(); if (!done) submit(r.grape.id); },
      }, ...(r.via ? [h('span', { class: 'gd-opt-via' }, r.via), h('span', { class: 'gd-opt-arrow', 'aria-hidden': 'true' }, '\u2192'), h('span', { class: 'gd-opt-name' }, r.grape.name)]
        : [h('span', { class: 'gd-opt-name' }, r.grape.name)]),
      done ? h('span', { class: 'gd-opt-note' }, t('alreadyGuessed')) : null);
      listEl.appendChild(li);
    });
    const on = listEl.querySelector('.gd-opt-on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }
  function closeList() { if (!listEl) return; results = []; active = -1; renderList(); }

  function submitTyped() {
    const v = input.value.trim();
    if (!v) return;
    if (active >= 0 && results[active]) return submit(results[active].grape.id);
    const g = exact(v);
    if (g) {
      if (game.has(g.id)) { msgEl.textContent = t('alreadyGuessed'); return; }
      return submit(g.id);
    }
    const top = search(v).find((r) => !game.has(r.grape.id));
    if (top) return submit(top.grape.id);
    msgEl.textContent = t('unknownGrape');
    announce(t('unknownGrape'));
  }

  function submit(id) {
    const row = game.guess(id);
    if (!row) return;
    justAdded = true;
    const parts = row.cells.map((c) => `${colLabel(c.key)} ${t('st_' + c.status)}`).join(', ');
    const left = MAX_GUESSES - game.guesses.length;
    announce(`${row.grape.name}. ${parts}.` + (game.status === 'playing' ? ' ' + t('guessesLeft', { n: left }) : ''));
    results = []; active = -1;
    renderBoard();
    if (game.status === 'playing') {
      input.value = ''; closeList(); msgEl.textContent = '';
      counterEl.textContent = t('attempt', { n: game.guesses.length + 1, max: MAX_GUESSES });
      input.focus();
    } else {
      renderPlay(); renderEnd();
      const hd = endEl.querySelector('.gd-end-title');
      if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: false }); }
      announce(endMessage());
    }
  }

  // ---- end panel ----
  function endMessage() {
    if (game.status === 'won') { const n = game.guesses.length; return n === 1 ? t('win1') : t('win', { n }); }
    return t('lose', { grape: game.answer.name });
  }

  function facts(g) {
    const rows = [
      [colLabel('colour'), t('v_' + g.colour)],
      [colLabel('origin'), countryName(g.origin)],
      [colLabel('top'), g.topCountries.length ? g.topCountries.map(countryName).join(', ') : null],
      [colLabel('parents'), g.parents && g.parents.length ? g.parents.map(grapeName).join(' × ') : null],
      [colLabel('climate'), g.climate ? t('v_' + g.climate) : null],
      [colLabel('ripening'), g.ripening ? t('v_' + g.ripening) : null],
      [colLabel('flavour'), g.flavours && g.flavours.length ? g.flavours.map((d) => (descriptors[d] ? descriptors[d][lang] : d)).join(', ') : null],
      [colLabel('area'), g.areaHa ? fmtNum(g.areaHa) : null],
      [colLabel('trend'), trendText(g.trendPct) ? trendText(g.trendPct) + ' (' + trendLabel(g.trendPct) + ')' : null],
    ].filter((r) => r[1]);
    return h('dl', { class: 'gd-facts' }, rows.map((r) => h('div', { class: 'gd-fact' }, h('dt', null, r[0]), h('dd', null, r[1]))));
  }

  function productTiles(list) {
    return h('ul', { class: 'gd-products' }, list.map((p) => h('li', { class: 'gd-product' },
      h('a', { class: 'gd-product-link', href: p.url },
        p.image ? h('img', { class: 'gd-product-img', src: p.image, alt: '', loading: 'lazy' }) : h('span', { class: 'gd-product-img gd-product-ph' }),
        h('span', { class: 'gd-product-title' }, p.title),
        p.price ? h('span', { class: 'gd-product-price' }, formatPrice(p.price, lang)) : null))));
  }

  function renderEnd() {
    const over = game.status !== 'playing';
    endEl.hidden = !over;
    endEl.textContent = '';
    if (!over) return;
    const won = game.status === 'won';
    const shopBox = h('div', { class: 'gd-shop' });
    const fillShop = (list) => {
      shopBox.textContent = '';
      shopBox.append(h('h3', { class: 'gd-h3' }, t('shopTitle')));
      if (list === null) shopBox.append(h('p', { class: 'gd-muted' }, t('shopLoading')));
      else if (list.length) shopBox.append(productTiles(list));
      else shopBox.append(h('p', { class: 'gd-muted' }, t('shopNone')));
      if (list !== null) shopBox.append(h('a', { class: 'gd-btn gd-btn-ghost', href: '/winkel' }, t('shopCta')));
    };
    fillShop(products);
    if (products === null) {
      const gid = game.answer.id;
      loadProducts(gid, { mock }).then((l) => { products = l; if (game.answer.id === gid) fillShop(l); });
    }
    const shareBtn = h('button', { type: 'button', class: 'gd-btn', onclick: doShare }, t('share'));
    const countdown = h('p', { class: 'gd-countdown' }, t('next') + ' ', h('strong', { class: 'gd-clock' }, clockText()));
    endEl.append(
      h('h3', { class: 'gd-end-title', id: uid + '-end' }, endMessage()),
      h('div', { class: 'gd-answer' + (won ? ' gd-answer-won' : '') },
        h('p', { class: 'gd-kicker' }, t('answerTitle')),
        h('p', { class: 'gd-answer-name' }, game.answer.name),
        facts(game.answer)),
      shopBox,
      h('div', { class: 'gd-share' }, shareBtn, countdown));
  }

  function clockText() {
    const s = Math.max(0, Math.floor(msUntilNextPuzzle(new Date()) / 1000));
    const p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }

  async function doShare(e) {
    const btn = e.currentTarget;
    const text = shareText({ puzzle: game.puzzle, rows: game.rows(), won: game.status === 'won' });
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
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { dlg.remove(); if (opener && opener.focus && opener.isConnected) opener.focus(); else if (input && input.isConnected) input.focus(); });
    modalHost.textContent = '';
    modalHost.appendChild(dlg);
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    return dlg;
  }

  function openHelp(opener) {
    const body = h('div', { class: 'gd-dialog-body' },
      h('p', null, t('helpIntro')),
      h('ul', { class: 'gd-help-list' }, COLUMNS.map((k, i) => h('li', null, h('strong', null, colLabel(k) + ': '), t('help_' + k)))),
      h('p', { class: 'gd-help-legend' }, t('helpLegend')),
      h('div', { class: 'gd-help-demo', 'aria-hidden': 'true' }, ['green', 'yellow', 'red', 'grey'].map((s) => h('span', { class: 'gd-tile gd-demo gd-s-' + s }, h('span', { class: 'gd-sym' }, STATUS_SYMBOL[s])))),
      h('p', { class: 'gd-muted' }, t('helpFooter')),
      h('button', { type: 'button', class: 'gd-btn', onclick: (e) => e.currentTarget.closest('dialog').close() }, t('gotIt')));
    openModal(t('helpTitle'), body, opener);
  }

  function openStats(opener) {
    const st = computeStats(store.state.history, game.puzzle);
    const max = Math.max(1, ...st.dist);
    const todayTries = store.state.history[game.puzzle];
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

  // ---- lifecycle ----
  function currentPuzzle() {
    if (debugDay) return { n: debugDay, persist: false };
    const raw = puzzleNumber(new Date(), schedule.start);
    return raw < 1 ? { n: 1, persist: false, preview: true } : { n: raw, persist: true };
  }

  function renderAll() {
    renderHeader(); renderPlay(); renderBoard(); renderEnd();
    root.setAttribute('lang', lang);
    noteEl.hidden = !(cur && cur.preview);
    noteEl.textContent = cur && cur.preview ? t('preview') : '';
  }

  let cur;
  function start() {
    cur = currentPuzzle();
    game = createGame({ puzzle: cur.n, store, persist: cur.persist });
    products = null;
    renderAll();
    if (!store.state.seenHelp && game.guesses.length === 0) {
      store.state.seenHelp = true; store.save();
      openHelp(null);
    }
  }
  start();

  clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    const clock = root.querySelector('.gd-clock');
    if (clock) clock.textContent = clockText();
    if (!debugDay && root.isConnected) {
      const n = currentPuzzle().n;
      if (n !== game.puzzle && cur.persist) start();
    }
  }, 1000);

  return { store, get game() { return game; } };
}
