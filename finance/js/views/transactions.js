import { setActions } from '../app.js';
import { update } from '../store.js';
import { esc, money, debounce, monthStart, monthEnd, today, addDays, download, currentMonth, addMonths } from '../util.js';
import { catType, acctMap, catMap, tagMap, merchantKey } from '../engine.js';
import { categoryOptions, accountOptions, confirmDialog, toast } from '../ui.js';
import { toCSV } from '../csv.js';
import { txnTable, bindTxnTable, openAddTransaction } from './txnEdit.js';
import { openImport } from './import.js';

let f = null; // filter state, survives re-renders
let pageSize = 150;
const selected = new Set();
let lastQuery = '';

const defaults = () => ({ q: '', account: '', category: '', tag: '', type: '', range: 'all', from: '', to: '', review: '', hidden: 'exclude', sort: 'date_desc' });

export function render(root, { query, state: s }) {
  const qs = JSON.stringify(query);
  if (!f || qs !== lastQuery) {
    f = { ...defaults() };
    if (query.account) f.account = query.account;
    if (query.category) f.category = query.category;
    if (query.tag) f.tag = query.tag;
    if (query.q) f.q = query.q;
    if (query.merchant) f.q = query.merchant;
    if (query.review) f.review = 'unreviewed';
    if (query.month) { f.range = 'custom'; f.from = monthStart(query.month); f.to = monthEnd(query.month); }
    if (query.from) { f.range = 'custom'; f.from = query.from; f.to = query.to || today(); }
    if (query.type) f.type = query.type;
    lastQuery = qs;
    selected.clear();
    pageSize = 150;
  }
  setActions(`<button class="btn" id="exp">Export CSV</button><button class="btn" id="imp">Import CSV</button><button class="btn primary" id="add">+ Transaction</button>`);
  document.getElementById('add').onclick = () => openAddTransaction(f.account ? { accountId: f.account } : {});
  document.getElementById('imp').onclick = () => openImport(f.account || null);

  const list = filtered(s);
  document.getElementById('exp').onclick = () => exportCSV(s, list);
  let income = 0, spend = 0;
  for (const t of list) {
    const ty = catType(s, t.categoryId);
    if (t.hidden || ty === 'transfer') continue;
    if (ty === 'income') income += t.amount; else spend -= t.amount;
  }

  root.innerHTML = `<div class="filters" role="search">
      <input type="search" id="f-q" placeholder="Search merchant, notes, amount…  ( / )" value="${esc(f.q)}" aria-label="Search transactions">
      <select id="f-range" aria-label="Date range">
        ${[['all', 'All dates'], ['this', 'This month'], ['last', 'Last month'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['ytd', 'Year to date'], ['365', 'Last 12 months'], ['custom', 'Custom…']]
          .map(([v, l]) => `<option value="${v}" ${f.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${f.range === 'custom' ? `<input type="date" id="f-from" value="${esc(f.from)}" aria-label="From"><input type="date" id="f-to" value="${esc(f.to)}" aria-label="To">` : ''}
      <select id="f-account" aria-label="Account">${accountOptions(s, f.account, { includeEmpty: true })}</select>
      <select id="f-category" aria-label="Category">${categoryOptions(s, f.category, { includeEmpty: true, emptyLabel: 'All categories' })}</select>
      <select id="f-type" aria-label="Type"><option value="">Income &amp; expenses</option><option value="expense" ${f.type === 'expense' ? 'selected' : ''}>Expenses</option><option value="income" ${f.type === 'income' ? 'selected' : ''}>Income</option><option value="transfer" ${f.type === 'transfer' ? 'selected' : ''}>Transfers</option></select>
      ${s.tags.length ? `<select id="f-tag" aria-label="Tag"><option value="">All tags</option>${s.tags.map((t) => `<option value="${t.id}" ${f.tag === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}
      <select id="f-review" aria-label="Review status"><option value="">Any status</option><option value="unreviewed" ${f.review === 'unreviewed' ? 'selected' : ''}>Needs review</option><option value="reviewed" ${f.review === 'reviewed' ? 'selected' : ''}>Reviewed</option><option value="uncat" ${f.review === 'uncat' ? 'selected' : ''}>Uncategorized</option><option value="split" ${f.review === 'split' ? 'selected' : ''}>Split</option></select>
      <select id="f-hidden" aria-label="Hidden"><option value="exclude" ${f.hidden === 'exclude' ? 'selected' : ''}>Hide hidden</option><option value="include" ${f.hidden === 'include' ? 'selected' : ''}>Show hidden</option><option value="only" ${f.hidden === 'only' ? 'selected' : ''}>Only hidden</option></select>
      <select id="f-sort" aria-label="Sort"><option value="date_desc" ${f.sort === 'date_desc' ? 'selected' : ''}>Newest first</option><option value="date_asc" ${f.sort === 'date_asc' ? 'selected' : ''}>Oldest first</option><option value="amt_desc" ${f.sort === 'amt_desc' ? 'selected' : ''}>Largest first</option><option value="amt_asc" ${f.sort === 'amt_asc' ? 'selected' : ''}>Smallest first</option></select>
      ${JSON.stringify(f) !== JSON.stringify(defaults()) ? '<button class="btn ghost small" id="f-clear">Clear filters</button>' : ''}
    </div>
    <div class="row wrap between" style="margin-bottom:10px">
      <div class="small ink2"><b>${list.length}</b> transactions · Income <b class="pos">${money(income)}</b> · Spending <b>${money(spend)}</b></div>
    </div>
    <section class="card" id="tx-card"></section>
    <div id="bulk"></div>`;

  const card = root.querySelector('#tx-card');
  card.innerHTML = txnTable(s, list.slice(0, pageSize), { selectable: true, selected, groupByDate: f.sort.startsWith('date') })
    + (list.length > pageSize ? `<div style="padding:12px;text-align:center"><button class="btn" id="more">Show ${Math.min(150, list.length - pageSize)} more of ${list.length - pageSize}</button></div>` : '');
  bindTxnTable(card, { onSelect: (id, on, silent) => { if (id) on ? selected.add(id) : selected.delete(id); if (!silent) drawBulk(); } });
  card.querySelector('#more')?.addEventListener('click', () => { pageSize += 150; update(() => {}); });

  const bulkEl = root.querySelector('#bulk');
  function drawBulk() {
    if (!selected.size) { bulkEl.innerHTML = ''; return; }
    bulkEl.innerHTML = `<div class="bulk-bar" role="toolbar" aria-label="Bulk edit"><b>${selected.size} selected</b>
      <select id="b-cat" aria-label="Set category"><option value="">Set category…</option>${categoryOptions(s)}</select>
      ${s.tags.length ? `<select id="b-tag" aria-label="Add tag"><option value="">Add tag…</option>${s.tags.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>` : ''}
      <button class="btn small" id="b-rev">Mark reviewed</button><button class="btn small" id="b-hide">Hide / unhide</button>
      <button class="btn small" id="b-del">Delete</button><button class="btn small" id="b-none">Deselect</button></div>`;
    const apply = (fn, msg) => { const n = selected.size; update((st) => st.transactions.forEach((t) => { if (selected.has(t.id)) fn(t); })); toast(`${msg} · ${n} transaction${n === 1 ? '' : 's'}`); };
    bulkEl.querySelector('#b-cat').addEventListener('change', (e) => { if (e.target.value) apply((t) => { if (!t.splits?.length) { t.categoryId = e.target.value; t.reviewed = true; } }, 'Category updated'); });
    bulkEl.querySelector('#b-tag')?.addEventListener('change', (e) => { const id = e.target.value; if (id) apply((t) => { t.tags = [...new Set([...(t.tags || []), id])]; }, 'Tag added'); });
    bulkEl.querySelector('#b-rev').addEventListener('click', () => apply((t) => { t.reviewed = true; }, 'Marked reviewed'));
    bulkEl.querySelector('#b-hide').addEventListener('click', () => apply((t) => { t.hidden = !t.hidden; }, 'Visibility toggled'));
    bulkEl.querySelector('#b-none').addEventListener('click', () => { selected.clear(); update(() => {}); });
    bulkEl.querySelector('#b-del').addEventListener('click', async () => {
      if (!(await confirmDialog(`Delete ${selected.size} transactions? This can't be undone.`, { ok: 'Delete', danger: true }))) return;
      const n = selected.size;
      update((st) => { st.transactions = st.transactions.filter((t) => !selected.has(t.id)); });
      selected.clear();
      toast(`Deleted ${n} transactions`);
    });
  }
  drawBulk();

  const on = (id, key, ev = 'change') => root.querySelector(id)?.addEventListener(ev, (e) => { f[key] = e.target.value; pageSize = 150; update(() => {}); });
  root.querySelector('#f-q').addEventListener('input', debounce((e) => { f.q = e.target.value; pageSize = 150; update(() => {}); }, 250));
  root.querySelector('#f-q').dataset.focus = 'txn-search';
  on('#f-range', 'range'); on('#f-from', 'from'); on('#f-to', 'to'); on('#f-account', 'account'); on('#f-category', 'category');
  on('#f-type', 'type'); on('#f-tag', 'tag'); on('#f-review', 'review'); on('#f-hidden', 'hidden'); on('#f-sort', 'sort');
  root.querySelector('#f-range').addEventListener('change', () => {
    if (f.range === 'custom' && !f.from) { f.from = addDays(today(), -30); f.to = today(); }
  });
  root.querySelector('#f-clear')?.addEventListener('click', () => { f = defaults(); lastQuery = JSON.stringify({}); history.replaceState(null, '', '#/transactions'); update(() => {}); });
}

function rangeDates() {
  const t = today();
  switch (f.range) {
    case 'this': return [monthStart(currentMonth()), monthEnd(currentMonth())];
    case 'last': { const m = addMonths(currentMonth(), -1); return [monthStart(m), monthEnd(m)]; }
    case '30': return [addDays(t, -30), '9999'];
    case '90': return [addDays(t, -90), '9999'];
    case '365': return [addDays(t, -365), '9999'];
    case 'ytd': return [`${t.slice(0, 4)}-01-01`, '9999'];
    case 'custom': return [f.from || '0000', f.to || '9999'];
    default: return ['0000', '9999'];
  }
}

export function filtered(s) {
  const [from, to] = rangeDates();
  const q = f.q.trim().toLowerCase();
  const qNum = q && /^[-$\d.,]+$/.test(q) ? Math.abs(parseFloat(q.replace(/[$,]/g, ''))) : null;
  const tm = tagMap(s), cm = catMap(s);
  const list = s.transactions.filter((t) => {
    if (t.date < from || t.date > to) return false;
    if (f.account && t.accountId !== f.account) return false;
    if (f.category && t.categoryId !== f.category && !t.splits?.some((p) => p.categoryId === f.category)) return false;
    if (f.tag && !t.tags?.includes(f.tag)) return false;
    if (f.type && catType(s, t.categoryId) !== f.type) return false;
    if (f.review === 'unreviewed' && t.reviewed) return false;
    if (f.review === 'reviewed' && !t.reviewed) return false;
    if (f.review === 'uncat' && t.categoryId !== 'cat_uncategorized') return false;
    if (f.review === 'split' && !t.splits?.length) return false;
    if (f.hidden === 'exclude' && t.hidden) return false;
    if (f.hidden === 'only' && !t.hidden) return false;
    if (q) {
      if (qNum != null && !isNaN(qNum)) return Math.abs(Math.abs(t.amount) - qNum) < 0.005 || String(Math.abs(t.amount)).startsWith(String(qNum));
      const hay = `${t.merchant} ${t.originalDescription || ''} ${t.notes || ''} ${cm[t.categoryId]?.name || ''} ${(t.tags || []).map((x) => tm[x]?.name).join(' ')}`.toLowerCase();
      if (!hay.includes(q) && !merchantKey(t.merchant).includes(merchantKey(q))) return false;
    }
    return true;
  });
  const cmp = {
    date_desc: (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
    date_asc: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
    amt_desc: (a, b) => Math.abs(b.amount) - Math.abs(a.amount),
    amt_asc: (a, b) => Math.abs(a.amount) - Math.abs(b.amount),
  }[f.sort];
  return list.sort(cmp);
}

function exportCSV(s, list) {
  const am = acctMap(s), cm = catMap(s), tm = tagMap(s);
  const rows = [['Date', 'Merchant', 'Category', 'Account', 'Original Statement', 'Notes', 'Amount', 'Tags']];
  for (const t of list) {
    if (t.splits?.length) {
      for (const p of t.splits) rows.push([t.date, p.merchant || t.merchant, cm[p.categoryId]?.name || '', am[t.accountId]?.name || '', t.originalDescription || '', t.notes || '', p.amount.toFixed(2), (t.tags || []).map((x) => tm[x]?.name).join(', ')]);
    } else rows.push([t.date, t.merchant, cm[t.categoryId]?.name || '', am[t.accountId]?.name || '', t.originalDescription || '', t.notes || '', t.amount.toFixed(2), (t.tags || []).map((x) => tm[x]?.name).join(', ')]);
  }
  download(`transactions-${today()}.csv`, toCSV(rows), 'text/csv');
  toast(`Exported ${list.length} transactions`);
}

