// App shell: hash router, navigation, theme, first-run welcome.

import { getState, subscribe, update, replaceState, getSaveError } from './store.js';
import { $, $$ } from './util.js';
import { hideTip } from './charts.js';
import { refreshRecurring } from './engine.js';
import { buildDemo } from './demo.js';
import { toast } from './ui.js';

import * as dashboard from './views/dashboard.js';
import * as accounts from './views/accounts.js';
import * as transactions from './views/transactions.js';
import * as cashflow from './views/cashflow.js';
import * as reports from './views/reports.js';
import * as budget from './views/budget.js';
import * as recurring from './views/recurring.js';
import * as goals from './views/goals.js';
import * as investments from './views/investments.js';
import * as settings from './views/settings.js';

const ROUTES = { dashboard, accounts, transactions, cashflow, reports, budget, recurring, goals, investments, settings };
const TITLES = {
  dashboard: 'Dashboard', accounts: 'Accounts', transactions: 'Transactions', cashflow: 'Cash flow', reports: 'Reports',
  budget: 'Budget', recurring: 'Recurring', goals: 'Goals', investments: 'Investments', settings: 'Settings',
};

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [route, ...rest] = path.split('/').filter(Boolean);
  return { route: ROUTES[route] ? route : 'dashboard', params: rest, query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

export function navigate(route, query) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  location.hash = `#/${route}${qs && qs !== '?' ? qs : ''}`;
}

// Page header helpers used by views.
export function setActions(html) { $('#page-actions').innerHTML = html; }
export function setTitle(t) { $('#page-title').textContent = t; document.title = `${t} · Ledgerly`; }

let currentView = null;
let scrollKey = null;
function render({ keepScroll = false } = {}) {
  hideTip();
  const { route, params, query } = parseHash();
  const s = getState();
  $$('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === route));
  setTitle(TITLES[route]);
  setActions('');
  const root = $('#view');
  const y = window.scrollY;
  const focusKey = document.activeElement?.dataset?.focus;
  if (!s.accounts.length && !s.transactions.length && route !== 'settings' && route !== 'accounts') {
    renderWelcome(root);
    return;
  }
  currentView = ROUTES[route];
  try {
    currentView.render(root, { params, query, state: s });
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="card card-body"><h2>Something went wrong</h2><p class="muted">${String(e.message)}</p></div>`;
  }
  const key = location.hash;
  if (keepScroll && scrollKey === key) window.scrollTo(0, y);
  // Inline editors re-render on save; put focus back where the user was.
  if (focusKey) {
    const el = root.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
    if (el) { el.focus({ preventScroll: true }); el.select?.(); }
  }
  scrollKey = key;
}

function renderWelcome(root) {
  setTitle('Welcome');
  root.innerHTML = `<div class="card" style="max-width:720px;margin:24px auto">
    <div class="card-body" style="padding:32px">
      <div style="font-size:40px">👋</div>
      <h2 style="font-size:24px;margin:8px 0">Welcome to Ledgerly</h2>
      <p class="ink2">A private, local-first personal finance app: track every account, categorize transactions automatically,
      budget with rollovers or flex budgeting, watch cash flow and net worth, catch recurring bills, and plan goals.</p>
      <p class="ink2">Your data never leaves this browser. There is no server and no bank login. Add accounts manually, or import
      CSV exports from your bank, Mint or Monarch.</p>
      <div class="row wrap" style="margin-top:20px;gap:12px">
        <button class="btn primary" id="w-demo">Explore with sample data</button>
        <a class="btn" href="#/accounts?new=1">Add my first account</a>
        <a class="btn ghost" href="#/settings?tab=data">Restore a backup</a>
      </div>
    </div></div>`;
  $('#w-demo').addEventListener('click', () => { replaceState(buildDemo()); toast('Sample data loaded. Reset it any time in Settings.'); navigate('dashboard'); });
}

// Theme: system / light / dark, persisted in settings.
function applyTheme() {
  const t = getState().settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
$('#theme-toggle').addEventListener('click', () => {
  const isDark = document.documentElement.dataset.theme === 'dark'
    || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  update((s) => { s.settings.theme = isDark ? 'light' : 'dark'; });
});

$('#menu-btn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$('#nav').addEventListener('click', () => $('#sidebar').classList.remove('open'));
document.addEventListener('click', (e) => {
  const sb = $('#sidebar');
  if (sb.classList.contains('open') && !sb.contains(e.target) && e.target.id !== 'menu-btn') sb.classList.remove('open');
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
let pending = false;
let lastSaveWarn = 0;
subscribe(() => {
  applyTheme();
  if (getSaveError() && Date.now() - lastSaveWarn > 10000) {
    lastSaveWarn = Date.now();
    toast('Could not save — browser storage is full or blocked. Export a backup from Settings.', { timeout: 8000 });
  }
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; render({ keepScroll: true }); });
});

// Keep recurring items aligned with posted transactions on startup.
if (getState().recurring.length) update((s) => refreshRecurring(s));
applyTheme();
render();

// Keyboard: "/" focuses the page search box if present.
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) {
    const search = $('#view input[type=search]');
    if (search) { e.preventDefault(); search.focus(); }
  }
});
