import { mount } from './ui.js';

function boot() {
  const root = document.getElementById('grapedle-root');
  if (!root || root.getAttribute('data-gd-mounted')) return;
  root.setAttribute('data-gd-mounted', '1');
  mount(root);
}
// Preview/testing hook: re-mount on a given puzzle number without a reload.
globalThis.GrapedlePreview = {
  play(day) {
    const root = document.getElementById('grapedle-root');
    if (!root) return;
    root.setAttribute('data-day', String(day));
    mount(root);
  },
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
