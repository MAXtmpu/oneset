// App shell: hash router, tab bar, service worker registration.
import * as train from './views/train.js';
import * as runner from './views/runner.js';
import * as summary from './views/summary.js';
import * as historyView from './views/history.js';
import * as progress from './views/progress.js';
import * as routines from './views/routines.js';
import * as settings from './views/settings.js';
import { loadRunner, requestPersistence, getState } from './store.js';
import { setSoundEnabled } from './audio.js';

const ROUTES = [
  [/^#\/train$/, train, 'train'],
  [/^#\/run$/, runner, null],
  [/^#\/summary\/(.+)$/, summary, 'train'],
  [/^#\/history$/, historyView, 'history'],
  [/^#\/history\/(.+)$/, historyView, 'history'],
  [/^#\/progress$/, progress, 'progress'],
  [/^#\/routines$/, routines, 'routines'],
  [/^#\/routines\/([^/]+)$/, routines, 'routines'],
  [/^#\/routines\/([^/]+)\/edit$/, routines, 'routines'],
  [/^#\/settings$/, settings, 'settings'],
];

const root = document.getElementById('app');
let cleanup = null;
let lastHash = null;

function route() {
  let hash = location.hash || '#/train';
  // An unfinished workout always takes over: you never lose a session mid-gym.
  if (loadRunner() && hash !== '#/run' && lastHash === null) hash = '#/run';
  if (hash !== location.hash) { history.replaceState(null, '', hash); }

  let match = null;
  for (const [re, view, tab] of ROUTES) {
    const m = hash.match(re);
    if (m) { match = { view, tab, params: m.slice(1), edit: hash.endsWith('/edit') }; break; }
  }
  if (!match) { location.hash = '#/train'; return; }

  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
  setSoundEnabled(getState().settings.sound);
  document.body.classList.toggle('running', match.view === runner);
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.tab === match.tab));

  root.innerHTML = match.view.render(match.params, match);
  cleanup = match.view.mount?.(root, match.params, match) || null;
  if (hash !== lastHash) window.scrollTo(0, 0);
  lastHash = hash;
}

window.addEventListener('hashchange', route);
window.addEventListener('app:rerender', () => {
  const y = window.scrollY;
  lastHash = location.hash; // keep scroll
  route();
  window.scrollTo(0, y);
});

requestPersistence();
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller && !loadRunner()) {
          const t = document.getElementById('toast');
          t.textContent = 'Update ready, tap to reload';
          t.classList.add('show');
          t.onclick = () => location.reload();
        }
      });
    });
  }).catch(() => {});
}
