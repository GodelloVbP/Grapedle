import { shopGrapes, grapes, descriptors } from './data.js';
import { norm } from './text.js';
import { similarGrapes } from './similar.js';

const SHOP_URL = '/winkel';
export const SHOP_PAGE = '/winkel';
export const TASTINGS_URL = 'https://www.vinobypalazzo.nl/wijnproeverijen';
export const FETCH_TIMEOUT_MS = 4000;
const UTM = 'utm_source=grapedle&utm_medium=game';
let cache = null;

/** Append the Grapedle UTM parameters, respecting an existing query string and fragment. */
export function withUtm(url) {
  const s = String(url == null ? '' : url);
  if (!s) return s;
  const hash = s.indexOf('#');
  const base = hash >= 0 ? s.slice(0, hash) : s, frag = hash >= 0 ? s.slice(hash) : '';
  if (/[?&]utm_source=/.test(base)) return s;
  return base + (base.includes('?') ? (/[?&]$/.test(base) ? '' : '&') : '?') + UTM + frag;
}

/** Shop category names that map to a grape id. */
export function categoriesFor(grapeId, map = shopGrapes) {
  return Object.keys(map).filter((c) => map[c] === grapeId);
}

export function priceOf(item) {
  const sc = item.structuredContent || {};
  const vals = [];
  const push = (m) => { if (m && m.value !== undefined && !isNaN(parseFloat(m.value))) vals.push({ v: parseFloat(m.value), cur: m.currency || 'EUR' }); };
  push(sc.priceMoney);
  if (Array.isArray(sc.variants)) sc.variants.forEach((v) => push(v.priceMoney));
  if (!vals.length) return null;
  vals.sort((a, b) => a.v - b.v);
  return { value: vals[0].v, currency: vals[0].cur, from: vals.length > 1 && vals[vals.length - 1].v !== vals[0].v };
}

/** Squarespace nested categories may come as "Druivensoort/Syrah": take the last path segment. */
export function lastSegment(c) {
  const parts = String(c == null ? '' : c).split('/');
  return parts[parts.length - 1];
}

/** Items whose categories map to the grape. Pure, for tests. */
export function matchItems(items, grapeId, map = shopGrapes) {
  const cats = new Set(categoriesFor(grapeId, map).map(norm));
  if (!cats.size) return [];
  return items.filter((it) => Array.isArray(it.categories) && it.categories.some((c) => cats.has(norm(lastSegment(c)))));
}

/** Only https: and relative URLs from the shop feed are used for href/src; anything else is dropped (''). */
export function safeUrl(u) {
  const s = String(u == null ? '' : u).trim();
  if (!s || /[\u0000-\u001f\\]/.test(s)) return '';
  if (/^https:\/\/[^/\s]/i.test(s)) return s;
  if (/^\/(?![/\\])/.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('//')) return '';
  return /^[\w.~-]/.test(s) ? s : '';
}

const toProduct = (it) => ({ title: String(it.title == null ? '' : it.title), url: safeUrl(it.fullUrl), image: safeUrl(it.assetUrl), price: priceOf(it) });
const hasLink = (p) => !!p.url;

/** Up to `limit` product tiles for a grape. */
export function productsFor(items, grapeId, { map = shopGrapes, limit = 4 } = {}) {
  return matchItems(items, grapeId, map).map(toProduct).filter(hasLink).slice(0, limit);
}

/**
 * Up to `limit` wines of the stocked grapes that look most like the answer (same colour, most
 * identical aromas, then shared families). One wine per grape first, then second wines.
 */
export function similarProducts(items, answer, { map = shopGrapes, limit = 3, all = grapes, desc = descriptors } = {}) {
  const lists = similarGrapes(answer, all, desc, 8).map((g) => matchItems(items, g.id, map).map(toProduct).filter(hasLink)).filter((l) => l.length);
  const out = [];
  for (let round = 0; out.length < limit; round++) {
    let any = false;
    for (const l of lists) {
      if (l[round] && out.length < limit) { out.push(l[round]); any = true; }
    }
    if (!any) break;
  }
  return out;
}

async function fetchJson(url, signal) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
  if (!res.ok) throw new Error('shop ' + res.status);
  return res.json();
}

async function loadAll(signal) {
  const items = [];
  let url = SHOP_URL + '?format=json';
  for (let page = 0; page < 8 && url; page++) {
    const data = await fetchJson(url, signal);
    if (Array.isArray(data.items)) items.push(...data.items);
    const next = data.pagination && data.pagination.nextPageUrl;
    url = next ? (next.includes('format=json') ? next : next + (next.includes('?') ? '&' : '?') + 'format=json') : null;
  }
  return items;
}

/** Dev-only fixture (never in the production bundle: the flag is a build-time constant). */
async function mockItems(mode, map) {
  if (mode === 'fail') throw new Error('mock failure');
  if (mode === 'none') return [];
  const fx = (await import('../tests/fixtures/shop.json', { with: { type: 'json' } })).default;
  const cats = [...new Set(Object.values(map))].map((id) => categoriesFor(id, map)[0]);
  return cats.flatMap((cat) => fx.items.map((it) => ({ ...it, title: `${it.title} (${cat})`, categories: [cat] })));
}

/**
 * All shop items, or null when the shop cannot be reached within the timeout (4 s by default).
 * Never throws. ?mockShop=1|none|fail uses the fixture in the dev build only.
 */
export async function loadItems({ mock = null, map = shopGrapes, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  if (mock && typeof __GD_DEV__ !== 'undefined' && __GD_DEV__) {
    try { return await mockItems(mock, map); } catch (e) { return null; }
  }
  if (cache) return cache;
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => { if (ctl) ctl.abort(); rej(new Error('shop timeout')); }, timeoutMs); });
  try {
    const items = await Promise.race([loadAll(ctl && ctl.signal), timeout]);
    return (cache = items);
  } catch (e) {
    return null;
  } finally { clearTimeout(timer); }
}

/** Product tiles for one grape; [] on failure or no match. */
export async function loadProducts(grapeId, opts = {}) {
  const items = await loadItems(opts);
  return items ? productsFor(items, grapeId, { map: opts.map || shopGrapes }) : [];
}

export function formatPrice(p, lang) {
  if (!p) return '';
  try {
    const s = new Intl.NumberFormat(lang === 'en' ? 'en-NL' : 'nl-NL', { style: 'currency', currency: p.currency }).format(p.value);
    return (p.from ? (lang === 'en' ? 'from ' : 'vanaf ') : '') + s;
  } catch (e) { return String(p.value); }
}
