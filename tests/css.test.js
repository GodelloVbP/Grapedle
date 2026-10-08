import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
// flat list of [selectorText, body] for rules outside @keyframes
function rules(text) {
  const out = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '');
  while ((m = re.exec(stripped))) out.push([m[1].trim(), m[2]]);
  return out;
}

test('every selector is scoped under #grapedle-root', () => {
  for (const [sel] of rules(css)) for (const part of sel.replace(/:where\([^)]*\)/g, ':where()').split(',').map((s) => s.trim()).filter(Boolean)) {
    assert.ok(part.startsWith('#grapedle-root'), `unscoped selector: ${part}`);
  }
});

test('every class is gd- prefixed', () => {
  for (const [sel] of rules(css)) for (const m of sel.matchAll(/\.([\w-]+)/g)) assert.ok(m[1].startsWith('gd-'), `${m[1]} in ${sel}`);
});

test('button and input visuals are !important (Squarespace form styles are very specific)', () => {
  const base = rules(css).find(([sel, body]) => /#grapedle-root button/.test(sel) && /#grapedle-root input/.test(sel) && /background/.test(body));
  assert.ok(base, 'base button/input reset exists');
  for (const prop of ['background', 'border', 'padding', 'color', 'font', 'text-transform', 'letter-spacing', 'border-radius', 'box-shadow']) {
    assert.match(base[1], new RegExp(`${prop}:[^;]*!important`), prop);
  }
  for (const cls of ['gd-btn', 'gd-input', 'gd-seg', 'gd-icon']) {
    const r = rules(css).find(([sel]) => sel === `#grapedle-root .${cls}`);
    assert.ok(r, cls);
    for (const prop of ['background', 'border', 'color', 'border-radius']) if (new RegExp(`(^|;|\\s)${prop}:`).test(r[1])) assert.match(r[1], new RegExp(`${prop}:[^;]*!important`), `${cls} ${prop}`);
  }
});

test('the box-sizing reset and the content reset are present, and nothing fights a placeholder min-height', () => {
  assert.match(css, /#grapedle-root :where\(\*, \*::before, \*::after\) \{ box-sizing: border-box; \}/);
  for (const el of ['p', 'li', 'ul', 'strong', 'h2', 'h3', 'dt', 'dd']) assert.match(css, new RegExp(`#grapedle-root ${el}[,\\s]`));
  assert.ok(!/min-height:\s*[1-9]\d{2,}px/.test(rules(css).filter(([s]) => s === '#grapedle-root').map((r) => r[1]).join('')), 'no fixed min-height on the root');
});

test('help area: contrast of the already-guessed option does not use opacity', () => {
  const done = rules(css).find(([sel]) => sel === '#grapedle-root .gd-opt-done');
  assert.ok(done && /color: var\(--gd-ink-soft\)/.test(done[1]) && !/opacity/.test(done[1]));
});

test('reduced motion: animations only under prefers-reduced-motion: no-preference', () => {
  const i = css.indexOf('animation:');
  assert.ok(i > css.indexOf('@media (prefers-reduced-motion: no-preference)'));
  assert.equal([...css.matchAll(/animation:/g)].length, [...css.slice(css.indexOf('@media (prefers-reduced-motion')).matchAll(/animation:/g)].length);
});
