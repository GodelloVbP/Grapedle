import { shopGrapes } from './data.js';
import mockShop from '../tests/fixtures/shop.json' with { type: 'json' };
import { norm } from './text.js';

const SHOP_URL = '/winkel';
let cache = null;

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

async function fetchJson(url) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('shop ' + res.status);
  return res.json();
}

async function loadAll() {
  if (cache) return cache;
  const items = [];
  let url = SHOP_URL + '?format=json';
  for (let page = 0; page < 8 && url; page++) {
    const data = await fetchJson(url);
    if (Array.isArray(data.items)) items.push(...data.items);
    const next = data.pagination && data.pagination.nextPageUrl;
    url = next ? (next.includes('format=json') ? next : next + (next.includes('?') ? '&' : '?') + 'format=json') : null;
  }
  return (cache = items);
}

/**
 * Resolve up to 4 product tiles for a grape. Never throws: failure or no match gives [].
 * ?mockShop=1 uses the fixture (re-categorised to today's grape); ?mockShop=none returns no products.
 */
export async function loadProducts(grapeId, { mock = null, map = shopGrapes } = {}) {
  try {
    let items;
    if (mock) {
      if (mock === 'none') return [];
      const cat = categoriesFor(grapeId, map)[0];
      items = mockShop.items.map((it) => (cat ? { ...it, categories: [cat] } : it));
    } else items = await loadAll();
    return matchItems(items, grapeId, map).slice(0, 4).map((it) => ({
      title: it.title, url: it.fullUrl, image: it.assetUrl || '', price: priceOf(it),
    }));
  } catch (e) {
    return [];
  }
}

export function formatPrice(p, lang) {
  if (!p) return '';
  try {
    const s = new Intl.NumberFormat(lang === 'en' ? 'en-NL' : 'nl-NL', { style: 'currency', currency: p.currency }).format(p.value);
    return (p.from ? (lang === 'en' ? 'from ' : 'vanaf ') : '') + s;
  } catch (e) { return String(p.value); }
}
