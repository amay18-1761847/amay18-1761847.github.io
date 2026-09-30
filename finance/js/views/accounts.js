import { setActions, navigate } from '../app.js';
import { getState, update } from '../store.js';
import { esc, money, today, addDays, fmtDate, uid, parseAmount, round2, fmtAxisDate, daysBetween } from '../util.js';
import { ACCOUNT_TYPES, ACCOUNT_GROUP_ORDER, isLiability } from '../defaults.js';
import { currentBalance, balanceAt, netWorthAt, accountSeries, acctMap, holdingsSummary } from '../engine.js';
import { lineChart, sparkline, SERIES } from '../charts.js';
import { openModal, formData, accountTypeOptions, confirmDialog, toast, emptyState } from '../ui.js';
import { txnTable, bindTxnTable, openAddTransaction } from './txnEdit.js';
import { openImport } from './import.js';

export function render(root, { params, query, state: s }) {
  if (params[0]) return renderDetail(root, s, params[0]);
  setActions(`<button class="btn" id="imp">Import CSV</button><button class="btn primary" id="add-acct">+ Add account</button>`);
  document.getElementById('add-acct').onclick = () => accountForm();
  document.getElementById('imp').onclick = () => openImport();
  if (query.new) { history.replaceState(null, '', '#/accounts'); setTimeout(() => accountForm(), 0); }

  if (!s.accounts.length) {
    root.innerHTML = `<div class="card">${emptyState('🏦', 'No accounts yet', 'Add checking, savings, credit cards, loans, investments, property — anything that makes up your net worth.',
      '<button class="btn primary" id="e-add">+ Add account</button>')}</div>`;
    root.querySelector('#e-add').onclick = () => accountForm();
    return;
  }
  const nw = netWorthAt(s, today());
  const from = addDays(today(), -90);
  let out = `<div class="grid cols-3" style="margin-bottom:16px">
    <div class="card card-body stat" style="padding-top:16px"><div class="label">Net worth</div><div class="value">${money(nw.net, { cents: false })}</div></div>
    <div class="card card-body stat" style="padding-top:16px"><div class="label">Assets</div><div class="value">${money(nw.assets, { cents: false })}</div></div>
    <div class="card card-body stat" style="padding-top:16px"><div class="label">Liabilities</div><div class="value">${money(nw.liabilities, { cents: false })}</div></div>
  </div>`;
  const open = s.accounts.filter((a) => !a.closedAt);
  for (const g of ACCOUNT_GROUP_ORDER) {
    const accts = open.filter((a) => ACCOUNT_TYPES[a.type]?.group === g);
    if (!accts.length) continue;
    const total = accts.reduce((t, a) => t + currentBalance(s, a), 0);
    out += `<section class="card acct-group"><div class="acct-group-head"><h3>${esc(g)}</h3><b class="num">${money(total)}</b></div><ul class="list">`;
    for (const a of accts) {
      const bal = currentBalance(s, a);
      const series = accountSeries(s, a, from).map((p) => p.value);
      const last = s.balanceHistory.filter((h) => h.accountId === a.id).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
      out += `<li class="clickable" data-acct="${a.id}"><div class="avatar">${esc((a.institution || a.name)[0])}</div>
        <div class="main"><div class="title">${esc(a.name)}${a.excludeNetWorth ? ' <span class="pill">Excluded</span>' : ''}</div>
        <div class="sub">${esc(a.institution || ACCOUNT_TYPES[a.type].label)} · ${a.derive ? 'Balance tracks transactions' : `Updated ${esc(fmtDate(last?.date || today()))}`}</div></div>
        <div class="hide-sm">${sparkline(series, { color: SERIES(isLiability(a) ? 1 : 0) })}</div>
        <div class="num" style="min-width:110px;text-align:right;font-weight:600">${money(bal)}</div></li>`;
    }
    out += '</ul></section>';
  }
  const closed = s.accounts.filter((a) => a.closedAt);
  if (closed.length) {
    out += `<details class="card acct-group"><summary class="acct-group-head"><h3>Closed accounts (${closed.length})</h3></summary><ul class="list">
      ${closed.map((a) => `<li class="clickable" data-acct="${a.id}"><div class="main"><div class="title">${esc(a.name)}</div><div class="sub">Closed ${esc(fmtDate(a.closedAt, true))}</div></div></li>`).join('')}</ul></details>`;
  }
  root.innerHTML = out;
  root.querySelectorAll('[data-acct]').forEach((li) => li.addEventListener('click', () => navigate(`accounts/${li.dataset.acct}`)));
}

function renderDetail(root, s, id) {
  const a = acctMap(s)[id];
  if (!a) { root.innerHTML = '<p>Account not found. <a href="#/accounts">Back to accounts</a></p>'; return; }
  document.getElementById('page-title').textContent = a.name;
  setActions(`<a class="btn ghost" href="#/accounts">← Accounts</a><button class="btn" id="edit">Edit</button>
    <button class="btn" id="bal">Update balance</button>${a.derive || ['checking', 'savings', 'credit', 'cash'].includes(a.type) ? '<button class="btn" id="imp">Import CSV</button><button class="btn primary" id="add">+ Transaction</button>' : ''}`);
  document.getElementById('edit').onclick = () => accountForm(a);
  document.getElementById('bal').onclick = () => balanceForm(a);
  document.getElementById('imp') && (document.getElementById('imp').onclick = () => openImport(a.id));
  document.getElementById('add') && (document.getElementById('add').onclick = () => openAddTransaction({ accountId: a.id }));

  const bal = currentBalance(s, a);
  const txns = s.transactions.filter((t) => t.accountId === id).sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  const snaps = s.balanceHistory.filter((h) => h.accountId === id).sort((x, y) => (x.date < y.date ? 1 : -1));
  const firstDate = [snaps[snaps.length - 1]?.date, txns[txns.length - 1]?.date].filter(Boolean).sort()[0] || today();
  const from = firstDate < addDays(today(), -365) ? addDays(today(), -365) : firstDate;
  const monthAgo = balanceAt(s, a, addDays(today(), -30));
  const change = monthAgo == null ? null : bal - monthAgo;
  const inv = holdingsSummary(s, id);

  root.innerHTML = `<div class="grid side">
    <section class="card"><div class="card-head"><div class="stat"><div class="label">${esc(ACCOUNT_TYPES[a.type].label)} · ${esc(a.institution || '')}</div>
      <div class="value" style="font-size:32px">${money(bal)}</div>
      ${change != null ? `<div class="delta ink2">${money(change, { sign: true })} past 30 days</div>` : ''}</div></div>
      <div class="card-body"><div class="chart" id="acct-chart"></div></div></section>
    <section class="card"><div class="card-head"><h2>Balance history</h2></div>
      <div class="card-body flush"><ul class="list">${snaps.slice(0, 8).map((h) => `<li><div class="main"><div class="title num">${money(h.balance)}</div><div class="sub">${esc(fmtDate(h.date, true))}</div></div>
        <button class="icon-btn" data-del-snap="${esc(h.date)}" aria-label="Delete balance entry">✕</button></li>`).join('') || '<li class="muted">No balance updates yet</li>'}</ul>
      <p class="muted small" style="padding:8px 18px 0">${a.derive ? 'This balance moves automatically with the transactions you add or import, anchored to the balances you enter.' : 'Update this balance whenever you check it; history builds the net worth chart.'}</p></div></section>
  </div>
  ${inv.rows.length ? `<section class="card" style="margin-top:16px"><div class="card-head"><h2>Holdings</h2><a class="more" href="#/investments">Manage →</a></div>
    <div class="card-body flush"><table class="data"><thead><tr><th>Ticker</th><th class="hide-sm">Name</th><th class="amt">Value</th><th class="amt">Gain</th></tr></thead><tbody>
    ${inv.rows.map((h) => `<tr><td><b>${esc(h.ticker)}</b></td><td class="hide-sm ink2">${esc(h.name)}</td><td class="amt">${money(h.value)}</td><td class="amt ${h.gain >= 0 ? 'pos' : 'neg'}">${money(h.gain, { sign: true })}</td></tr>`).join('')}
    </tbody></table></div></section>` : ''}
  <section class="card" style="margin-top:16px"><div class="card-head"><h2>Transactions</h2><a class="more" href="#/transactions?account=${a.id}">Filter in Transactions →</a></div>
    <div class="card-body flush" id="acct-txns"></div></section>`;

  lineChart(root.querySelector('#acct-chart'), {
    series: [{ name: a.name, color: SERIES(isLiability(a) ? 1 : 0), points: accountSeries(s, a, from).map((p) => ({ x: p.date, y: p.value })) }],
    height: 220, zeroBased: false, xLabel: (d) => fmtAxisDate(d, daysBetween(from, today())), tipTitle: (d) => fmtDate(d, true), label: `${a.name} balance`,
  });
  const tEl = root.querySelector('#acct-txns');
  tEl.innerHTML = txnTable(s, txns, { showAccount: false, limit: 100 });
  bindTxnTable(tEl);
  root.querySelectorAll('[data-del-snap]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmDialog('Delete this balance entry?', { ok: 'Delete', danger: true }))) return;
    update((st) => { st.balanceHistory = st.balanceHistory.filter((h) => !(h.accountId === id && h.date === b.dataset.delSnap)); });
  }));
}

export function accountForm(a = null) {
  const s = getState();
  const isNew = !a;
  const cur = a ? currentBalance(s, a) : '';
  const body = `<form class="form-grid" id="acct-form" autocomplete="off">
    <label class="field full">Account name<input type="text" name="name" value="${esc(a?.name || '')}" required placeholder="e.g. Everyday Checking"></label>
    <label class="field">Type<select name="type">${accountTypeOptions(a?.type || 'checking')}</select></label>
    <label class="field">Institution<input type="text" name="institution" value="${esc(a?.institution || '')}" placeholder="e.g. Chase"></label>
    ${isNew ? `<label class="field">Current balance<input type="text" inputmode="decimal" name="balance" value="" placeholder="0.00" required></label>
    <label class="field">As of<input type="date" name="asOf" value="${today()}"></label>` : ''}
    <div class="full note" id="liab-note"></div>
    <label class="check full"><input type="checkbox" name="derive" ${a ? (a.derive ? 'checked' : '') : 'checked'}> Update the balance automatically from transactions</label>
    <label class="check full"><input type="checkbox" name="excludeNetWorth" ${a?.excludeNetWorth ? 'checked' : ''}> Exclude from net worth</label>
  </form>`;
  openModal({
    title: isNew ? 'Add account' : 'Edit account', body,
    footer: `${!isNew ? `<button class="btn ghost left" data-del style="color:var(--critical)">Delete</button><button class="btn ghost" data-closeacct>${a.closedAt ? 'Reopen' : 'Close account'}</button>` : ''}
      <button class="btn" data-close>Cancel</button><button class="btn primary" data-save>${isNew ? 'Add account' : 'Save'}</button>`,
    onMount: (m, close) => {
      const form = m.querySelector('#acct-form');
      const hint = () => {
        const t = form.type.value;
        const liab = ACCOUNT_TYPES[t].liability;
        form.derive.checked = isNew ? ['checking', 'savings', 'credit', 'cash'].includes(t) : form.derive.checked;
        m.querySelector('#liab-note').textContent = liab
          ? 'Liability: enter the amount you owe as a positive number. It is subtracted from net worth.'
          : 'Asset: enter the current value. It is added to net worth.';
      };
      form.type.addEventListener('change', hint);
      hint();
      if (!isNew) form.derive.checked = !!a.derive;
      m.querySelector('[data-save]').addEventListener('click', () => {
        if (!form.reportValidity()) return;
        const d = formData(form);
        if (isNew) {
          const bal = parseAmount(d.balance);
          if (isNaN(bal)) { toast('Enter a valid balance.'); return; }
          const acct = { id: uid('acct'), name: d.name.trim(), type: d.type, institution: d.institution.trim(), derive: !!d.derive, excludeNetWorth: !!d.excludeNetWorth, createdAt: today() };
          update((st) => { st.accounts.push(acct); st.balanceHistory.push({ accountId: acct.id, date: d.asOf || today(), balance: round2(bal) }); if (st.demo && st.accounts.length === 1) delete st.demo; });
          close();
          toast(`${acct.name} added`);
          navigate(`accounts/${acct.id}`);
        } else {
          update(() => Object.assign(a, { name: d.name.trim(), type: d.type, institution: d.institution.trim(), derive: !!d.derive, excludeNetWorth: !!d.excludeNetWorth }));
          close();
        }
      });
      m.querySelector('[data-closeacct]')?.addEventListener('click', () => {
        update(() => { a.closedAt = a.closedAt ? null : today(); });
        close();
        toast(a.closedAt ? 'Account closed — its history stays in reports.' : 'Account reopened');
      });
      m.querySelector('[data-del]')?.addEventListener('click', async () => {
        const n = s.transactions.filter((t) => t.accountId === a.id).length;
        if (!(await confirmDialog(`Delete ${a.name} and its ${n} transactions? This can't be undone. (Closing keeps history instead.)`, { ok: 'Delete account', danger: true }))) return;
        update((st) => {
          st.accounts = st.accounts.filter((x) => x.id !== a.id);
          st.transactions = st.transactions.filter((t) => t.accountId !== a.id);
          st.balanceHistory = st.balanceHistory.filter((h) => h.accountId !== a.id);
          st.holdings = st.holdings.filter((h) => h.accountId !== a.id);
          st.goals.forEach((g) => { if (g.accountId === a.id) g.accountId = null; });
        });
        close();
        navigate('accounts');
      });
    },
  });
}

export function balanceForm(a) {
  const s = getState();
  openModal({
    title: `Update balance · ${a.name}`,
    body: `<form class="form-grid" id="bal-form"><label class="field">Balance${isLiability(a) ? ' owed' : ''}<input type="text" inputmode="decimal" name="balance" value="${currentBalance(s, a).toFixed(2)}" required></label>
      <label class="field">As of<input type="date" name="date" value="${today()}" required></label>
      <p class="full muted small">${a.derive ? 'Transactions dated after this will keep adjusting the balance from here.' : 'Adds a point to this account’s history.'}</p></form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>',
    onMount: (m, close) => m.querySelector('[data-save]').addEventListener('click', () => {
      const form = m.querySelector('#bal-form');
      if (!form.reportValidity()) return;
      const d = formData(form);
      const v = parseAmount(d.balance);
      if (isNaN(v)) { toast('Enter a valid number.'); return; }
      update((st) => {
        st.balanceHistory = st.balanceHistory.filter((h) => !(h.accountId === a.id && h.date === d.date));
        st.balanceHistory.push({ accountId: a.id, date: d.date, balance: round2(v) });
      });
      close();
      toast('Balance updated');
    }),
  });
}
