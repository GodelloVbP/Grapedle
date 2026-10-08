import { mount } from './ui.js';

function boot() {
  const root = document.getElementById('grapedle-root');
  if (!root || root.getAttribute('data-gd-mounted')) return;
  root.setAttribute('data-gd-mounted', '1');
  mount(root);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
