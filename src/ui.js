import { countries, descriptors, schedule } from './data.js';
import { COLUMNS, ARROWS, STATUS_SYMBOL, regionsOf, climatesOf } from './feedback.js';
import { createGame, shareText, letterPattern, MAX_GUESSES, HINT_AT } from './game.js';
import { makeT, pickLang } from './i18n.js';
import { search, exact } from './search.js';
import { createStore, computeStats } from './storage.js';
import { puzzleNumber, msUntilNextPuzzle } from './date.js';
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

export function mount(root) {
  const q = readQuery();
  const store = createStore();
  if (q.get('reset') === '1') store.reset();
  let lang = pickLang(q.get('lang'), store.state.lang);
  if (q.get('lang')) { store.state.lang = lang; store.save(); }
  let t = makeT(lang);
  const mock = q.get('mockShop');
  // ?day=N, or data-day="N" on the root (used by the preview page, where
  // the query string is not available).
  const dayParam = parseInt(q.get('day') || root.getAttribute('data-day'), 10);
  const debugDay = Number.isFinite(dayParam) && dayParam > 0 ? dayParam : null;

  const numFmt = () => new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'nl-NL');
  let game, shopItems, shopPhase = 'loading', toastTimer = null, tickTimer = null, justAdded = false;

  root.textContent = '';
  root.classList.add('gd-root');
  const uid = 'gd' + Math.random().toString(36).slice(2, 7);

  // ---- skeleton ----
  const headerEl = h('header', { class: 'gd-header' });
  const noteEl = h('p', { class: 'gd-note', hidden: true });
  const playEl = h('div', { class: 'gd-play' });
  const hintsEl = h('div', { class: 'gd-hints', hidden: true });
  const endEl = h('section', { class: 'gd-end', hidden: true, 'aria-labelledby': uid + '-end' });
  const boardEl = h('div', { class: 'gd-board' });
  const live = h('div', { class: 'gd-sr', 'aria-live': 'polite', 'aria-atomic': 'true', role: 'status' });
  const modalHost = h('div', { class: 'gd-modals' });
  const app = h('div', { class: 'gd-app' }, headerEl, noteEl, playEl, hintsEl, endEl, boardEl, live, modalHost);
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
  const fmtNum = (n) => numFmt().format(n);
  const regionNames = (g) => regionsOf(g).map((r) => r.name || countryName(r.country));
  const climateNames = (g) => climatesOf(g).map((c) => t('v_' + c));
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
      if (Array.isArray(dl)) dl.push({ event: 'grapedle', action, puzzle: game ? game.puzzle : null, ...extra });
    } catch (e) { /* analytics must never break the game */ }
  }

  function flavourNodes(g, cell) {
    if (!g.flavours || !g.flavours.length) return null;
    const shared = new Set(cell.shared || []);
    return g.flavours.map((d) => h('span', { class: 'gd-chip' + (shared.has(d) ? ' gd-chip-hit' : '') }, aromaName(d)));
  }

  function areaText(cell) {
    if (cell.status === 'green') return t('area_same');
    if (cell.arrow === 'up') return t('area_more');
    if (cell.arrow === 'down') return t('area_less');
    return cell.tie ? t('area_tie') : null;
  }
  function areaSr(cell) {
    if (cell.status === 'green') return t('area_same_sr');
    if (cell.arrow === 'up') return t('area_more_sr');
    if (cell.arrow === 'down') return t('area_less_sr');
    return cell.tie ? t('area_tie_sr') : t('unknownValue');
  }

  const colLabel = (k) => t('col_' + k);

  function buildTile(cell, g, i) {
    let main = null, sub = null, plain = '', nodes = null;
    switch (cell.key) {
      case 'colour': main = t('v_' + g.colour); plain = main; break;
      case 'region':
        main = regionNames(g).join(' / '); plain = main;
        nodes = cell.status === 'yellow' && cell.hit && cell.hit.length && regionNames(g).length > 1 ? joined(regionNames(g), cell.hit)
          : cell.status === 'yellow' && cell.hit && cell.hit.length ? [h('strong', { class: 'gd-hit' }, main)] : null;
        if (cell.hit && cell.hit.length) plain += `, ${t('overlap')}: ${cell.hit.join(', ')}`;
        if (cell.km) {
          sub = `${t('km', { n: fmtNum(cell.km) })} ${ARROWS[cell.dir]}`;
          plain += `, ${t('km', { n: fmtNum(cell.km) })} ${t('toward', { dir: t('dir_' + cell.dir) })}`;
        }
        break;
      case 'climate': {
        const names = climateNames(g);
        main = names.length ? names.join(' / ') : null; plain = main;
        if (cell.status === 'yellow' && cell.hit && cell.hit.length) nodes = joined(names, cell.hit.map((c) => t('v_' + c)));
        break;
      }
      case 'area': main = areaText(cell); plain = areaSr(cell); break;
      default: break;
    }
    const chips = cell.key === 'flavour' ? flavourNodes(g, cell) : null;
    if (cell.key === 'flavour') plain = (g.flavours || []).map(aromaName).join(', ');
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
    track('guess', { guess: row.grape.id, n: game.guesses.length });
    const parts = row.cells.map((c) => `${colLabel(c.key)} ${t('st_' + c.status)}`).join(', ');
    const left = MAX_GUESSES - game.guesses.length;
    announce(`${row.grape.name}. ${parts}.` + (game.status === 'playing' ? ' ' + t('guessesLeft', { n: left }) : ''));
    results = []; active = -1;
    renderBoard();
    renderHints();
    if (game.status === 'playing') {
      input.value = ''; closeList(); msgEl.textContent = '';
      counterEl.textContent = t('attempt', { n: game.guesses.length + 1, max: MAX_GUESSES });
      input.focus();
    } else {
      renderPlay(); renderEnd();
      track(game.status === 'won' ? 'win' : 'loss', { tries: game.guesses.length, hints: game.hints.length });
      const hd = endEl.querySelector('.gd-end-title');
      if (hd) { hd.setAttribute('tabindex', '-1'); hd.focus({ preventScroll: false }); }
      announce(endMessage());
    }
  }

  // ---- hints ----
  function hintText(n) {
    const v = n === 1 ? game.answer.hint[lang] : letterPattern(game.answer.name);
    return t('hint' + n, { v });
  }

  function renderHints() {
    hintsEl.textContent = '';
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
            track('hint', { hint: n, guesses: game.guesses.length });
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
      [colLabel('climate'), climateNames(g).join(' / ') || null],
      [t('aromas'), g.flavours && g.flavours.length ? g.flavours.map(aromaName).join(', ') : null],
    ].filter((r) => r[1]);
    return h('dl', { class: 'gd-facts' }, rows.map((r) => h('div', { class: 'gd-fact' }, h('dt', null, r[0]), h('dd', null, r[1]))));
  }

  function productTiles(list, kind) {
    return h('ul', { class: 'gd-products' }, list.map((p) => h('li', { class: 'gd-product' },
      h('a', { class: 'gd-product-link', href: withUtm(p.url), 'data-gd-link': kind },
        p.image ? h('img', { class: 'gd-product-img', src: p.image, alt: '', loading: 'lazy' }) : h('span', { class: 'gd-product-img gd-product-ph' }),
        h('span', { class: 'gd-product-title' }, p.title),
        p.price ? h('span', { class: 'gd-product-price' }, formatPrice(p.price, lang)) : null))));
  }

  const tastingsLink = () => h('a', { class: 'gd-btn gd-btn-ghost', href: withUtm(TASTINGS_URL), 'data-gd-link': 'tastings' }, t('tastingsCta'));

  /**
   * Shop block. Stocked grape: its wines (up to 4) and a shop link. Not stocked: "Lijkt op", up to 3
   * wines of similar stocked grapes. If the shop does not answer in time or nothing matches, the
   * answer card stays and a tastings link replaces the tiles.
   */
  function renderShop(box) {
    box.textContent = '';
    const a = game.answer;
    if (shopPhase === 'loading') {
      box.append(h('h3', { class: 'gd-h3' }, a.stocked ? t('shopTitle') : t('similarTitle')), h('p', { class: 'gd-muted' }, t('shopLoading')));
      return;
    }
    const items = shopItems;
    if (a.stocked) {
      const list = items ? productsFor(items, a.id) : [];
      if (list.length) {
        box.append(h('h3', { class: 'gd-h3' }, t('shopTitle')), productTiles(list, 'product'),
          h('a', { class: 'gd-btn gd-btn-ghost', href: withUtm(SHOP_PAGE), 'data-gd-link': 'shop' }, t('shopCta')));
        return;
      }
    } else {
      const list = items ? similarProducts(items, a) : [];
      if (list.length) {
        box.append(h('h3', { class: 'gd-h3' }, t('similarTitle')), h('p', { class: 'gd-muted' }, t('similarIntro')), productTiles(list, 'similar'), tastingsLink());
        return;
      }
    }
    box.append(h('p', { class: 'gd-muted' }, t('tastingsText')), tastingsLink());
  }

  function renderEnd() {
    const over = game.status !== 'playing';
    endEl.hidden = !over;
    endEl.textContent = '';
    if (!over) return;
    const won = game.status === 'won';
    const shopBox = h('div', { class: 'gd-shop' });
    renderShop(shopBox);
    if (shopPhase === 'loading') {
      const gid = game.answer.id;
      loadItems({ mock }).then((l) => { shopItems = l; shopPhase = 'done'; if (game.answer.id === gid) renderShop(shopBox); });
    }
    const small = smallName(game.answer);
    const shareBtn = h('button', { type: 'button', class: 'gd-btn', onclick: doShare }, t('share'));
    const countdown = h('p', { class: 'gd-countdown' }, t('next') + ' ', h('strong', { class: 'gd-clock' }, clockText()));
    endEl.append(
      h('h3', { class: 'gd-end-title', id: uid + '-end' }, endMessage()),
      h('div', { class: 'gd-answer' + (won ? ' gd-answer-won' : '') },
        h('p', { class: 'gd-kicker' }, t('answerTitle')),
        h('p', { class: 'gd-answer-name' }, game.answer.name),
        small ? h('p', { class: 'gd-answer-small' }, small) : null,
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
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
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
      h('ul', { class: 'gd-help-list' }, COLUMNS.map((k) => h('li', null, h('strong', null, colLabel(k) + ': '), t('help_' + k)))),
      h('p', null, t('helpHints')),
      h('div', { class: 'gd-help-demo', 'aria-hidden': 'true' },
        demoTile('green', colLabel('colour'), t('v_red')),
        demoTile('yellow', colLabel('region'), 'Bordeaux', `${t('km', { n: 400 })} ${ARROWS[2]}`),
        demoTile('red', colLabel('climate'), t('v_koel')),
        demoTile('neutral', colLabel('area'), t('area_less')),
        demoTile('grey', colLabel('flavour'), '–')),
      h('p', { class: 'gd-muted' }, t('helpExample')),
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
    renderHeader(); renderPlay(); renderHints(); renderBoard(); renderEnd();
    root.setAttribute('lang', lang);
    noteEl.hidden = !(cur && cur.preview);
    noteEl.textContent = cur && cur.preview ? t('preview') : '';
  }

  let cur;
  function start() {
    cur = currentPuzzle();
    game = createGame({ puzzle: cur.n, store, persist: cur.persist });
    shopItems = null; shopPhase = 'loading';
    renderAll();
    if (game.status === 'playing' && game.guesses.length === 0) track('start');
    if (!store.state.seenHelp && game.guesses.length === 0) {
      store.state.seenHelp = true; store.save();
      openHelp(null);
    }
  }
  start();
  endEl.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[data-gd-link]') : null;
    if (a) track('shop_click', { link: a.getAttribute('data-gd-link'), href: a.getAttribute('href') });
  });

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
