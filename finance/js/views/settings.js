import { setActions, navigate } from '../app.js';
import { getState, update, exportJSON, replaceState, resetState } from '../store.js';
import { esc, download, today, uid } from '../util.js';
import { sortedCategories, applyRules } from '../engine.js';
import { openModal, formData, toast, confirmDialog } from '../ui.js';
import { TAG_COLORS, slug, UNCATEGORIZED } from '../defaults.js';
import { buildDemo } from '../demo.js';
import { openRuleEditor } from './ruleEdit.js';
import { catLabel, tagMap } from '../engine.js';

let tab = 'general';
const TABS = [['general', 'General'], ['categories', 'Categories'], ['rules', 'Rules'], ['tags', 'Tags'], ['data', 'Data & backup']];

export function render(root, { query, state: s }) {
  if (query.tab) { tab = query.tab; history.replaceState(null, '', '#/settings'); }
  setActions('');
  root.innerHTML = `<div class="tabs" id="set-tabs" style="margin-bottom:16px">${TABS.map(([k, l]) => `<button class="${tab === k ? 'active' : ''}" data-t="${k}">${l}</button>`).join('')}</div><div id="set-body"></div>`;
  root.querySelectorAll('#set-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; render(root, { query: {}, state: getState() }); }));
  const body = root.querySelector('#set-body');
  ({ general, categories, rules, tags, data })[tab](body, s);
}

function general(el, s) {
  const currencies = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'NZD', 'JPY', 'CHF', 'INR', 'MXN', 'SGD', 'HKD', 'SEK', 'NOK', 'DKK', 'ZAR', 'BRL'];
  el.innerHTML = `<section class="card card-body" style="padding-top:16px;max-width:640px"><form id="gen" class="form-grid">
    <label class="field">Currency<select name="currency">${currencies.map((c) => `<option ${s.settings.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <label class="field">Date format for CSV imports<select name="dateOrder"><option value="MDY" ${s.settings.dateOrder === 'MDY' ? 'selected' : ''}>Month/Day/Year</option><option value="DMY" ${s.settings.dateOrder === 'DMY' ? 'selected' : ''}>Day/Month/Year</option></select></label>
    <label class="field">Theme<select name="theme"><option value="system" ${s.settings.theme === 'system' ? 'selected' : ''}>Match system</option><option value="light" ${s.settings.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${s.settings.theme === 'dark' ? 'selected' : ''}>Dark</option></select></label>
    <label class="field">Budget style<select name="budgetMode"><option value="category" ${s.settings.budgetMode === 'category' ? 'selected' : ''}>Category budgets</option><option value="flex" ${s.settings.budgetMode === 'flex' ? 'selected' : ''}>Flex budgeting</option></select></label>
  </form></section>
  <section class="card card-body" style="padding-top:16px;max-width:640px;margin-top:16px"><h2 style="margin-bottom:8px">How Ledgerly works</h2>
    <p class="ink2 small">All data is stored in this browser’s local storage on this device. There is no account, server, or bank connection — so nothing can leak, but you are responsible for backups (Data &amp; backup tab). To use it on another device, export a backup and restore it there.</p>
    <p class="ink2 small">Amounts follow one convention: money out is negative, money in is positive. Transfers and credit-card payments are excluded from income, spending and budgets so nothing is double counted.</p>
    <p class="ink2 small">Keyboard: press <span class="kbd">/</span> to search on pages with a search box, <span class="kbd">Esc</span> to close dialogs.</p></section>`;
  el.querySelector('#gen').addEventListener('change', (e) => {
    const d = formData(el.querySelector('#gen'));
    update((st) => Object.assign(st.settings, d));
    toast('Settings saved');
  });
}

function categories(el, s) {
  const counts = {};
  for (const t of s.transactions) counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
  el.innerHTML = `<div class="row between wrap" style="margin-bottom:12px"><p class="ink2 small" style="margin:0">Click a category to rename it, change its emoji, group or budget type.</p>
      <div class="row"><button class="btn" id="add-grp">+ Group</button><button class="btn primary" id="add-cat">+ Category</button></div></div>
    <div class="grid cols-2">${sortedCategories(s).map(({ group, categories }) => `<section class="card"><div class="card-head"><h2>${esc(group.name)}</h2>
      <div class="row"><span class="pill">${esc(group.type)}</span><button class="icon-btn" data-grp="${group.id}" aria-label="Edit group">✎</button></div></div>
      <div class="card-body flush"><ul class="list">${categories.map((c) => `<li class="clickable" data-cat="${c.id}"><span style="width:22px;text-align:center">${esc(c.icon)}</span><div class="main"><div class="title">${esc(c.name)}</div></div>
        <span class="pill">${esc({ fixed: 'Fixed', flexible: 'Flexible', non_monthly: 'Non-monthly' }[c.flex] || 'Flexible')}</span><span class="muted small num" style="min-width:32px;text-align:right">${counts[c.id] || 0}</span></li>`).join('') || '<li class="muted">No categories</li>'}</ul></div></section>`).join('')}</div>`;
  el.querySelector('#add-cat').onclick = () => catForm();
  el.querySelector('#add-grp').onclick = () => groupForm();
  el.querySelectorAll('[data-cat]').forEach((li) => li.addEventListener('click', () => catForm(s.categories.find((c) => c.id === li.dataset.cat))));
  el.querySelectorAll('[data-grp]').forEach((b) => b.addEventListener('click', () => groupForm(s.categoryGroups.find((g) => g.id === b.dataset.grp))));
}

function catForm(c = null) {
  const s = getState();
  const isNew = !c;
  const n = c ? s.transactions.filter((t) => t.categoryId === c.id || t.splits?.some((p) => p.categoryId === c.id)).length : 0;
  openModal({
    title: isNew ? 'New category' : `Edit ${c.name}`,
    body: `<form id="cat-form" class="form-grid">
      <label class="field full">Name<div class="row"><input type="text" name="icon" value="${esc(c?.icon || '🏷️')}" style="width:56px;text-align:center" aria-label="Emoji"><input type="text" name="name" value="${esc(c?.name || '')}" required></div></label>
      <label class="field">Group<select name="groupId">${s.categoryGroups.map((g) => `<option value="${g.id}" ${c?.groupId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></label>
      <label class="field">Budget type (Flex)<select name="flex"><option value="fixed" ${c?.flex === 'fixed' ? 'selected' : ''}>Fixed</option><option value="flexible" ${!c || c.flex === 'flexible' ? 'selected' : ''}>Flexible</option><option value="non_monthly" ${c?.flex === 'non_monthly' ? 'selected' : ''}>Non-monthly</option></select></label>
      ${!isNew ? `<label class="field full">When deleting, move its ${n} transactions to<select name="moveTo">${s.categories.filter((x) => x.id !== c.id).map((x) => `<option value="${x.id}" ${x.id === UNCATEGORIZED ? 'selected' : ''}>${esc(x.icon + ' ' + x.name)}</option>`).join('')}</select></label>` : ''}
    </form>`,
    footer: `${!isNew && c.id !== UNCATEGORIZED ? '<button class="btn ghost left" data-del style="color:var(--critical)">Delete</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>`,
    onMount: (m, close) => {
      const form = m.querySelector('#cat-form');
      m.querySelector('[data-save]').addEventListener('click', () => {
        if (!form.reportValidity()) return;
        const d = formData(form);
        update((st) => {
          if (isNew) {
            let id = 'cat_' + slug(d.name);
            if (st.categories.some((x) => x.id === id)) id += '_' + uid('').slice(-4);
            st.categories.push({ id, name: d.name.trim(), icon: d.icon.trim() || '🏷️', groupId: d.groupId, flex: d.flex, order: 99, rollover: false });
          } else Object.assign(st.categories.find((x) => x.id === c.id), { name: d.name.trim(), icon: d.icon.trim() || '🏷️', groupId: d.groupId, flex: d.flex });
        });
        close();
      });
      m.querySelector('[data-del]')?.addEventListener('click', async () => {
        const to = form.moveTo.value;
        if (!(await confirmDialog(`Delete ${c.name}? ${n} transactions move to ${catLabel(s, to)}.`, { ok: 'Delete', danger: true }))) return;
        update((st) => {
          st.transactions.forEach((t) => { if (t.categoryId === c.id) t.categoryId = to; t.splits?.forEach((p) => { if (p.categoryId === c.id) p.categoryId = to; }); });
          st.rules.forEach((r) => { if (r.actions?.categoryId === c.id) r.actions.categoryId = to; });
          st.recurring.forEach((r) => { if (r.categoryId === c.id) r.categoryId = to; });
          Object.values(st.budgets).forEach((b) => { delete b[c.id]; });
          st.categories = st.categories.filter((x) => x.id !== c.id);
        });
        close();
      });
    },
  });
}

function groupForm(g = null) {
  const s = getState();
  const isNew = !g;
  const inUse = g && s.categories.some((c) => c.groupId === g.id);
  openModal({
    title: isNew ? 'New group' : `Edit ${g.name}`,
    body: `<form id="g-form" class="form-grid"><label class="field">Name<input type="text" name="name" value="${esc(g?.name || '')}" required></label>
      <label class="field">Type<select name="type" ${g ? 'disabled' : ''}><option value="expense">Expense</option><option value="income" ${g?.type === 'income' ? 'selected' : ''}>Income</option><option value="transfer" ${g?.type === 'transfer' ? 'selected' : ''}>Transfer</option></select></label>
      ${inUse ? '<p class="full muted small">Move or delete this group’s categories before deleting it.</p>' : ''}</form>`,
    footer: `${!isNew && !inUse ? '<button class="btn ghost left" data-del style="color:var(--critical)">Delete</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>`,
    onMount: (m, close) => {
      m.querySelector('[data-save]').addEventListener('click', () => {
        const form = m.querySelector('#g-form');
        if (!form.reportValidity()) return;
        const d = formData(form);
        update((st) => {
          if (isNew) st.categoryGroups.push({ id: 'grp_' + slug(d.name) + '_' + uid('').slice(-4), name: d.name.trim(), type: d.type, order: st.categoryGroups.length });
          else st.categoryGroups.find((x) => x.id === g.id).name = d.name.trim();
        });
        close();
      });
      m.querySelector('[data-del]')?.addEventListener('click', () => { update((st) => { st.categoryGroups = st.categoryGroups.filter((x) => x.id !== g.id); }); close(); });
    },
  });
}

function rules(el, s) {
  const tm = tagMap(s);
  const describe = (r) => {
    const c = r.conditions || {};
    const parts = [];
    if (c.value) parts.push(`${c.field === 'description' ? 'statement' : 'merchant'} ${c.op === 'equals' ? 'is' : c.op === 'starts' ? 'starts with' : 'contains'} “${c.value}”`);
    if (c.amountOp && c.amountOp !== 'any') parts.push(`amount ${{ gt: '>', lt: '<', eq: '=', between: 'between' }[c.amountOp]} ${c.amount}${c.amountOp === 'between' ? `–${c.amount2}` : ''}`);
    if (c.direction && c.direction !== 'any') parts.push(c.direction === 'debit' ? 'is an expense' : 'is income');
    if (c.accountId) parts.push(`in ${s.accounts.find((a) => a.id === c.accountId)?.name || 'account'}`);
    const a = r.actions || {};
    const acts = [];
    if (a.categoryId) acts.push(`categorize as ${catLabel(s, a.categoryId)}`);
    if (a.merchant) acts.push(`rename to “${a.merchant}”`);
    if (a.tagIds?.length) acts.push(`tag ${a.tagIds.map((t) => tm[t]?.name).filter(Boolean).join(', ')}`);
    if (a.hide) acts.push('hide');
    if (a.reviewed) acts.push('mark reviewed');
    return `If ${parts.join(' and ') || 'any'} → ${acts.join(', ')}`;
  };
  el.innerHTML = `<div class="row between wrap" style="margin-bottom:12px"><p class="ink2 small" style="margin:0">Rules run top to bottom on every new or imported transaction. The first rule to set a field wins.</p>
      <div class="row"><button class="btn" id="run-all">Re-run all rules on all transactions</button><button class="btn primary" id="add-rule">+ Rule</button></div></div>
    <section class="card">${s.rules.length ? `<ul class="list">${s.rules.map((r, i) => `<li>
      <div class="row" style="flex-direction:column;gap:0"><button class="icon-btn" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button><button class="icon-btn" data-down="${i}" ${i === s.rules.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button></div>
      <div class="main clickable" data-edit="${r.id}" style="cursor:pointer"><div class="title">${esc(r.name || 'Rule')}</div><div class="sub">${esc(describe(r))}</div></div>
      <label class="check small"><input type="checkbox" data-en="${r.id}" ${r.enabled !== false ? 'checked' : ''}> On</label></li>`).join('')}</ul>`
      : '<div class="empty"><div class="empty-icon">⚡</div><h3>No rules yet</h3><p>Recategorize a transaction and Ledgerly will offer to make a rule, or create one here.</p></div>'}</section>`;
  el.querySelector('#add-rule').onclick = () => openRuleEditor();
  el.querySelectorAll('[data-edit]').forEach((d) => d.addEventListener('click', () => openRuleEditor({}, d.dataset.edit)));
  el.querySelectorAll('[data-en]').forEach((cb) => cb.addEventListener('change', () => update((st) => { st.rules.find((r) => r.id === cb.dataset.en).enabled = cb.checked; })));
  const move = (i, d) => update((st) => { const [r] = st.rules.splice(i, 1); st.rules.splice(i + d, 0, r); });
  el.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => move(+b.dataset.up, -1)));
  el.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => move(+b.dataset.down, 1)));
  el.querySelector('#run-all').onclick = async () => {
    if (!(await confirmDialog('Apply every rule to every existing transaction? Categories set by hand may be overwritten where a rule matches.', { ok: 'Run rules' }))) return;
    let n = 0;
    update((st) => { st.transactions = st.transactions.map((t) => { const r = applyRules(st, t); if (r.matched) n++; return r.t; }); });
    toast(`Rules matched ${n} transactions`);
  };
}

function tags(el, s) {
  const counts = {};
  for (const t of s.transactions) for (const id of t.tags || []) counts[id] = (counts[id] || 0) + 1;
  el.innerHTML = `<section class="card" style="max-width:640px"><div class="card-head"><h2>Tags</h2></div>
    <div class="card-body"><form id="tag-add" class="row" style="margin-bottom:12px"><input type="text" name="name" placeholder="New tag name" required><button class="btn primary">Add tag</button></form>
    <ul class="list" style="border:1px solid var(--line);border-radius:8px">${s.tags.map((t) => `<li>
      <input type="color" value="${esc(t.color)}" data-color="${t.id}" aria-label="Tag color" style="width:32px;height:28px;border:none;background:none;padding:0">
      <input type="text" value="${esc(t.name)}" data-name="${t.id}" aria-label="Tag name" class="grow">
      <a class="small ink2" href="#/transactions?tag=${t.id}">${counts[t.id] || 0} txns</a>
      <button class="icon-btn" data-del="${t.id}" aria-label="Delete tag">✕</button></li>`).join('') || '<li class="muted">No tags yet. Tags cut across categories — e.g. “Vacation”, “Reimbursable”, “Tax deductible”.</li>'}</ul></div></section>`;
  el.querySelector('#tag-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    update((st) => st.tags.push({ id: uid('tag'), name, color: TAG_COLORS[st.tags.length % TAG_COLORS.length] }));
  });
  el.querySelectorAll('[data-color]').forEach((i) => i.addEventListener('change', () => update((st) => { st.tags.find((t) => t.id === i.dataset.color).color = i.value; })));
  el.querySelectorAll('[data-name]').forEach((i) => i.addEventListener('change', () => update((st) => { st.tags.find((t) => t.id === i.dataset.name).name = i.value.trim() || 'Tag'; })));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this tag? It will be removed from all transactions.', { ok: 'Delete', danger: true }))) return;
    update((st) => {
      st.tags = st.tags.filter((t) => t.id !== b.dataset.del);
      st.transactions.forEach((t) => { if (t.tags) t.tags = t.tags.filter((x) => x !== b.dataset.del); });
      st.rules.forEach((r) => { if (r.actions?.tagIds) r.actions.tagIds = r.actions.tagIds.filter((x) => x !== b.dataset.del); });
    });
  }));
}

function data(el, s) {
  let bytes = 0;
  try { bytes = (localStorage.getItem('ledgerly.v1') || '').length * 2; } catch { /* storage blocked */ }
  el.innerHTML = `<div class="grid cols-2">
    <section class="card card-body" style="padding-top:16px"><h2 style="margin-bottom:8px">Back up</h2>
      <p class="ink2 small">Download everything (accounts, transactions, budgets, rules, goals) as one JSON file. Do this regularly — clearing browser data erases Ledgerly.</p>
      <button class="btn primary" id="exp">Download backup</button>
      <p class="muted small" style="margin-top:10px">${s.transactions.length} transactions · ${s.accounts.length} accounts · ~${(bytes / 1024 / 1024).toFixed(2)} MB of ~5 MB browser storage</p></section>
    <section class="card card-body" style="padding-top:16px"><h2 style="margin-bottom:8px">Restore</h2>
      <p class="ink2 small">Replace all current data with a Ledgerly backup file.</p>
      <input type="file" id="imp" accept=".json,application/json"></section>
    <section class="card card-body" style="padding-top:16px"><h2 style="margin-bottom:8px">Sample data</h2>
      <p class="ink2 small">Load a year of realistic sample data to explore the app. This replaces your current data.</p>
      <button class="btn" id="demo">Load sample data</button></section>
    <section class="card card-body" style="padding-top:16px"><h2 style="margin-bottom:8px">Start over</h2>
      <p class="ink2 small">Permanently delete all data in this browser${s.demo ? ' (including the sample data)' : ''}.</p>
      <button class="btn danger" id="reset">Delete all data</button></section>
  </div>`;
  el.querySelector('#exp').onclick = () => { download(`ledgerly-backup-${today()}.json`, exportJSON()); toast('Backup downloaded'); };
  el.querySelector('#imp').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const obj = JSON.parse(String(rd.result));
        if (!Array.isArray(obj.transactions) || !Array.isArray(obj.accounts)) throw new Error('Not a Ledgerly backup');
        if (!(await confirmDialog(`Restore ${obj.transactions.length} transactions and ${obj.accounts.length} accounts? Current data will be replaced.`, { ok: 'Restore', danger: true }))) return;
        replaceState(obj);
        toast('Backup restored');
        navigate('dashboard');
      } catch (err) { toast(`Couldn't restore: ${err.message}`); }
    };
    rd.readAsText(f);
  });
  el.querySelector('#demo').onclick = async () => {
    if (s.transactions.length && !s.demo && !(await confirmDialog('Replace your data with sample data? Download a backup first if you want to keep it.', { ok: 'Load sample data', danger: true }))) return;
    replaceState(buildDemo());
    toast('Sample data loaded');
    navigate('dashboard');
  };
  el.querySelector('#reset').onclick = async () => {
    if (!(await confirmDialog('Delete ALL accounts, transactions, budgets, rules and goals from this browser? This cannot be undone.', { ok: 'Delete everything', danger: true }))) return;
    resetState();
    toast('All data deleted');
    navigate('dashboard');
  };
}
