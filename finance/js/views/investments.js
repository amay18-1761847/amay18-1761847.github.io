import { setActions } from '../app.js';
import { getState, update } from '../store.js';
import { esc, money, moneyCompact, pct, today, uid, parseAmount, round2, addDays, fmtDate, fmtAxisDate } from '../util.js';
import { holdingsSummary, acctMap, balanceAt, currentBalance } from '../engine.js';
import { donut, lineChart, foldTop, SERIES } from '../charts.js';
import { openModal, formData, accountOptions, toast, confirmDialog, emptyState } from '../ui.js';
import { isInvestment } from '../defaults.js';

const CLASSES = ['US stocks', 'International stocks', 'Bonds', 'Cash', 'Real estate', 'Crypto', 'Other'];

export function render(root, { state: s }) {
  const invAccts = s.accounts.filter((a) => isInvestment(a) && !a.closedAt);
  setActions(`${s.holdings.length ? '<button class="btn" id="prices">Update prices</button>' : ''}<button class="btn primary" id="add-h">+ Holding</button>`);
  document.getElementById('add-h').onclick = () => holdingForm();
  document.getElementById('prices') && (document.getElementById('prices').onclick = () => pricesForm());

  if (!invAccts.length) {
    root.innerHTML = `<div class="card">${emptyState('💹', 'No investment accounts', 'Add a brokerage, retirement or crypto account on the Accounts page, then add holdings here.', '<a class="btn primary" href="#/accounts?new=1">+ Add account</a>')}</div>`;
    return;
  }
  const sum = holdingsSummary(s);
  const acctTotal = invAccts.reduce((t, a) => t + currentBalance(s, a), 0);
  const from = addDays(today(), -365);
  const pts = [];
  for (let d = from; d < today(); d = addDays(d, 14)) pts.push(d);
  pts.push(today());
  const series = pts.map((d) => ({ x: d, y: invAccts.reduce((t, a) => t + (balanceAt(s, a, d) ?? 0), 0) }));
  const alloc = foldTop(sum.byClass, 7).map((x, i) => ({ ...x, value: x.amount, color: SERIES(i) }));
  const am = acctMap(s);

  root.innerHTML = `<div class="grid cols-4" style="margin-bottom:16px">
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Investment accounts</div><div class="value">${money(acctTotal, { cents: false })}</div><div class="delta muted">${invAccts.length} accounts</div></div>
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Holdings value</div><div class="value">${money(sum.value, { cents: false })}</div></div>
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Cost basis</div><div class="value">${money(sum.cost, { cents: false })}</div></div>
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Unrealized gain</div><div class="value ${sum.gain >= 0 ? 'pos' : 'neg'}">${money(sum.gain, { cents: false, sign: true })}</div><div class="delta muted">${pct(sum.cost ? sum.gain / sum.cost : 0, 1)}</div></div>
    </div>
    <div class="grid side" style="margin-bottom:16px">
      <section class="card"><div class="card-head"><h2>Investment balance · 12 months</h2></div><div class="card-body"><div class="chart" id="inv-line"></div></div></section>
      <section class="card"><div class="card-head"><h2>Allocation</h2></div><div class="card-body">
        <div style="display:flex;justify-content:center;margin-bottom:12px" id="inv-donut"></div>
        <ul class="legend-list">${alloc.map((a) => `<li><i style="background:${a.color}"></i><span class="l">${esc(a.label)}</span><span class="num small">${moneyCompact(a.value)}</span><span class="muted small num">${pct(a.value / (sum.value || 1))}</span></li>`).join('')}</ul></div></section>
    </div>
    ${invAccts.map((a) => {
      const h = holdingsSummary(s, a.id);
      const bal = currentBalance(s, a);
      const drift = h.rows.length && Math.abs(h.value - bal) > Math.max(5, h.value * 0.001);
      return `<section class="card" style="margin-bottom:16px"><div class="card-head"><div><h2>${esc(a.name)}</h2><span class="sub">${esc(a.institution || '')} · balance ${money(bal)}</span></div>
        <div class="row">${drift ? `<button class="btn small" data-sync="${a.id}" title="Record today's balance as the holdings total">Set balance to ${money(h.value, { cents: false })}</button>` : ''}<button class="btn small" data-addto="${a.id}">+ Holding</button></div></div>
        <div class="card-body flush table-scroll">${h.rows.length ? `<table class="data"><thead><tr><th>Ticker</th><th class="hide-sm">Name</th><th class="amt">Shares</th><th class="amt">Price</th><th class="amt">Value</th><th class="amt hide-sm">Cost basis</th><th class="amt">Gain</th><th class="amt hide-sm">Weight</th></tr></thead><tbody>
          ${h.rows.map((r) => `<tr class="clickable" data-h="${r.id}"><td><b>${esc(r.ticker)}</b><div class="tiny muted">${esc(r.assetClass || '')}</div></td><td class="hide-sm ink2">${esc(r.name)}</td>
            <td class="amt">${Number(r.shares).toLocaleString(undefined, { maximumFractionDigits: 4 })}</td><td class="amt">${money(r.price)}<div class="tiny muted">${esc(fmtDate(r.priceDate))}</div></td>
            <td class="amt"><b>${money(r.value)}</b></td><td class="amt hide-sm">${money(r.cost)}</td>
            <td class="amt ${r.gain >= 0 ? 'pos' : 'neg'}">${money(r.gain, { sign: true, cents: false })}<div class="tiny">${pct(r.gainPct, 1)}</div></td><td class="amt hide-sm">${pct(r.value / (h.value || 1), 1)}</td></tr>`).join('')}
          </tbody></table>` : '<p class="muted" style="padding:0 18px 8px">No holdings yet — the account balance is tracked on its own.</p>'}</div></section>`;
    }).join('')}`;

  lineChart(root.querySelector('#inv-line'), {
    series: [{ name: 'Investments', color: SERIES(0), points: series }], height: 220, zeroBased: false,
    xLabel: (d) => fmtAxisDate(d, 365), tipTitle: (d) => fmtDate(d, true), label: 'Investment balances over time',
  });
  donut(root.querySelector('#inv-donut'), { items: alloc, size: 180, center: moneyCompact(sum.value), sub: 'holdings' });
  root.querySelectorAll('[data-h]').forEach((tr) => tr.addEventListener('click', () => holdingForm(s.holdings.find((h) => h.id === tr.dataset.h))));
  root.querySelectorAll('[data-addto]').forEach((b) => b.addEventListener('click', () => holdingForm(null, b.dataset.addto)));
  root.querySelectorAll('[data-sync]').forEach((b) => b.addEventListener('click', () => {
    const v = holdingsSummary(getState(), b.dataset.sync).value;
    update((st) => {
      st.balanceHistory = st.balanceHistory.filter((h) => !(h.accountId === b.dataset.sync && h.date === today()));
      st.balanceHistory.push({ accountId: b.dataset.sync, date: today(), balance: v });
    });
    toast(`${am[b.dataset.sync].name} balance set to ${money(v)}`);
  }));
}

function holdingForm(h = null, accountId = null) {
  const s = getState();
  const isNew = !h;
  openModal({
    title: isNew ? 'Add holding' : `Edit ${h.ticker}`,
    body: `<form id="h-form" class="form-grid">
      <label class="field">Ticker / symbol<input type="text" name="ticker" value="${esc(h?.ticker || '')}" required style="text-transform:uppercase"></label>
      <label class="field">Account<select name="accountId">${accountOptions(s, h?.accountId || accountId, { filter: isInvestment })}</select></label>
      <label class="field full">Name<input type="text" name="name" value="${esc(h?.name || '')}" placeholder="e.g. Vanguard Total Stock Market ETF"></label>
      <label class="field">Shares<input type="text" inputmode="decimal" name="shares" value="${esc(h?.shares ?? '')}" required></label>
      <label class="field">Price per share<input type="text" inputmode="decimal" name="price" value="${esc(h?.price ?? '')}" required></label>
      <label class="field">Total cost basis<input type="text" inputmode="decimal" name="costBasis" value="${esc(h?.costBasis ?? '')}" placeholder="What you paid in total"></label>
      <label class="field">Asset class<select name="assetClass">${CLASSES.map((c) => `<option ${h?.assetClass === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <p class="full muted small">Prices are entered manually (there is no live market-data feed). Use “Update prices” to refresh them in one go.</p>
    </form>`,
    footer: `${!isNew ? '<button class="btn ghost left" data-del style="color:var(--critical)">Delete</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>`,
    onMount: (m, close) => {
      m.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDialog(`Delete ${h.ticker}?`, { ok: 'Delete', danger: true }))) return;
        update((st) => { st.holdings = st.holdings.filter((x) => x.id !== h.id); });
        close();
      });
      m.querySelector('[data-save]').addEventListener('click', () => {
        const form = m.querySelector('#h-form');
        if (!form.reportValidity()) return;
        const d = formData(form);
        const shares = parseAmount(d.shares), price = parseAmount(d.price), cost = parseAmount(d.costBasis);
        if (isNaN(shares) || isNaN(price)) { toast('Shares and price must be numbers'); return; }
        if (!d.accountId) { toast('Choose an investment account'); return; }
        const fields = { ticker: d.ticker.trim().toUpperCase(), name: d.name.trim(), accountId: d.accountId, shares, price, costBasis: isNaN(cost) ? round2(shares * price) : cost, assetClass: d.assetClass, priceDate: (!h || h.price !== price) ? today() : h.priceDate };
        update((st) => {
          if (isNew) st.holdings.push({ id: uid('hold'), ...fields });
          else Object.assign(st.holdings.find((x) => x.id === h.id), fields);
        });
        close();
      });
    },
  });
}

function pricesForm() {
  const s = getState();
  const tickers = [...new Map(s.holdings.map((h) => [h.ticker, h])).values()];
  openModal({
    title: 'Update prices',
    body: `<form id="p-form" class="stack"><p class="muted small">Enter today’s price for each symbol. Every holding with that symbol updates.</p>
      ${tickers.map((h) => `<label class="row"><b style="width:80px">${esc(h.ticker)}</b><span class="grow small ink2">${esc(h.name)}</span><input type="text" inputmode="decimal" name="${esc(h.ticker)}" value="${h.price}" style="width:120px"></label>`).join('')}</form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save prices</button>',
    onMount: (m, close) => m.querySelector('[data-save]').addEventListener('click', () => {
      const d = formData(m.querySelector('#p-form'));
      let n = 0;
      update((st) => st.holdings.forEach((h) => {
        const v = parseAmount(d[h.ticker]);
        if (!isNaN(v) && v !== h.price) { h.price = v; h.priceDate = today(); n++; }
      }));
      close();
      toast(`Updated ${n} holding${n === 1 ? '' : 's'}`);
    }),
  });
}
