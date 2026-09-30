import { esc, money, moneyCompact, currentMonth, addMonths, fmtMonth, monthRange, monthEnd, pct } from '../util.js';
import { cashflowByMonth, rowsBetween, summarize, breakdown } from '../engine.js';
import { columnChart, sankey, foldTop, SERIES } from '../charts.js';
import { navigate } from '../app.js';

let view = { months: 12, month: null, by: 'group', mode: 'bars' };

export function render(root, { query, state: s }) {
  if (query.month) view.month = query.month;
  const end = currentMonth();
  const months = monthRange(addMonths(end, -(view.months - 1)), end);
  if (!view.month || !months.includes(view.month)) view.month = end;
  const flows = cashflowByMonth(s, months);
  const sel = view.month === 'all' ? null : view.month;
  const from = sel ? `${sel}-01` : `${months[0]}-01`;
  const to = sel ? monthEnd(sel) : monthEnd(end);
  const rows = rowsBetween(s, from, to);
  const sum = summarize(s, rows);
  const avg = {
    income: flows.reduce((a, f) => a + f.income, 0) / flows.length,
    expense: flows.reduce((a, f) => a + f.expense, 0) / flows.length,
  };
  const label = sel ? fmtMonth(sel, true) : `Last ${view.months} months`;

  root.innerHTML = `<div class="filters">
      <div class="tabs" id="cf-range">${[[6, '6 months'], [12, '12 months'], [24, '24 months']].map(([n, l]) => `<button class="${view.months === n ? 'active' : ''}" data-n="${n}">${l}</button>`).join('')}</div>
      <select id="cf-month" aria-label="Period" style="width:auto"><option value="all" ${view.month === 'all' ? 'selected' : ''}>Whole range</option>${[...months].reverse().map((m) => `<option value="${m}" ${m === view.month ? 'selected' : ''}>${esc(fmtMonth(m, true))}</option>`).join('')}</select>
    </div>
    <section class="card"><div class="card-head"><h2>Income vs. spending</h2><div class="legend"><span><i style="background:${SERIES(2)}"></i>Income</span><span><i style="background:${SERIES(0)}"></i>Spending</span></div></div>
      <div class="card-body"><div class="chart" id="cf-bars"></div><p class="muted small">Click a month to drill in. Transfers and credit-card payments are excluded so money isn’t double counted.</p></div></section>
    <div class="grid cols-4" style="margin:16px 0">
      ${stat('Income', sum.income, 'pos', `avg ${moneyCompact(avg.income)}/mo`)}
      ${stat('Spending', sum.expense, '', `avg ${moneyCompact(avg.expense)}/mo`)}
      ${stat('Net savings', sum.net, sum.net >= 0 ? 'pos' : 'neg', label)}
      ${stat('Savings rate', null, '', label, sum.income > 0 ? pct(sum.savingsRate) : '—')}
    </div>
    <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Where the money went · ${esc(label)}</h2></div>
      <div class="card-body"><div class="chart" id="cf-sankey"></div></div></section>
    <div class="row between wrap" style="margin-bottom:12px"><h2>Breakdown · ${esc(label)}</h2>
      <div class="tabs" id="cf-by">${[['group', 'Groups'], ['category', 'Categories'], ['merchant', 'Merchants']].map(([k, l]) => `<button class="${view.by === k ? 'active' : ''}" data-k="${k}">${l}</button>`).join('')}</div></div>
    <div class="grid cols-2">
      <section class="card"><div class="card-head"><h2>Income</h2><b class="pos num">${money(sum.income)}</b></div><div class="card-body" id="cf-inc"></div></section>
      <section class="card"><div class="card-head"><h2>Spending</h2><b class="num">${money(sum.expense)}</b></div><div class="card-body" id="cf-exp"></div></section>
    </div>`;

  columnChart(root.querySelector('#cf-bars'), {
    labels: months.map((m) => fmtMonth(m)), height: 260, label: 'Monthly income and spending',
    series: [{ name: 'Income', color: SERIES(2), values: flows.map((f) => f.income) }, { name: 'Spending', color: SERIES(0), values: flows.map((f) => f.expense) }],
    tipTitle: (i) => fmtMonth(months[i], true),
    tipExtra: (i) => `<div class="tip-row" style="margin-top:4px"><span></span><span>Net</span><b>${money(flows[i].net)}</b></div><div class="tip-row"><span></span><span>Savings rate</span><b>${flows[i].income > 0 ? pct(flows[i].savingsRate) : '—'}</b></div>`,
    onClick: (i) => { view.month = months[i]; history.replaceState(null, '', `#/cashflow?month=${months[i]}`); render(root, { query: {}, state: s }); },
  });

  // Sankey: income categories → expense groups (+ savings / shortfall)
  const inc = foldTop(breakdown(s, rows, 'category', 'income'), 4).map((x) => ({ label: x.label.replace(/^\S+\s/, ''), value: x.amount, color: 'var(--line-strong)' }));
  const exp = foldTop(breakdown(s, rows, 'group', 'expense'), 4).map((x, i) => ({ label: x.label, value: Math.max(0, x.amount), color: SERIES(i) }));
  if (sum.net > 0) exp.push({ label: 'Saved', value: sum.net, color: SERIES(5) });
  else if (sum.net < 0) inc.push({ label: 'From savings', value: -sum.net, color: SERIES(7) });
  sankey(root.querySelector('#cf-sankey'), { left: inc, right: exp, height: 300 });

  const bars = (el, items, type) => {
    const max = Math.max(1, ...items.map((x) => x.amount));
    el.innerHTML = items.length ? items.slice(0, 25).map((x, i) => `<div class="hbar clickable" data-k="${esc(x.key)}" data-label="${esc(x.label)}" title="${esc(x.label)}">
      <span class="lbl small">${esc(x.label)}</span>
      <span class="track"><span class="fill" style="display:block;width:${Math.max(0, x.amount / max) * 100}%;background:${type === 'income' ? SERIES(2) : SERIES(0)}"></span></span>
      <span class="num small"><b>${money(x.amount, { cents: false })}</b> <span class="muted">${pct(x.amount / ((type === 'income' ? sum.income : sum.expense) || 1))}</span></span></div>`).join('')
      : '<p class="muted">Nothing in this period.</p>';
    el.querySelectorAll('[data-k]').forEach((row) => row.addEventListener('click', () => {
      const q = sel ? { month: sel } : { from, to };
      if (view.by === 'category') q.category = row.dataset.k;
      else if (view.by === 'merchant') q.merchant = row.dataset.label;
      else q.type = type;
      navigate('transactions', q);
    }));
  };
  bars(root.querySelector('#cf-inc'), breakdown(s, rows, view.by, 'income'), 'income');
  bars(root.querySelector('#cf-exp'), breakdown(s, rows, view.by, 'expense'), 'expense');

  root.querySelectorAll('#cf-range button').forEach((b) => b.addEventListener('click', () => { view.months = +b.dataset.n; render(root, { query: {}, state: s }); }));
  root.querySelector('#cf-month').addEventListener('change', (e) => { view.month = e.target.value; history.replaceState(null, '', '#/cashflow'); render(root, { query: {}, state: s }); });
  root.querySelectorAll('#cf-by button').forEach((b) => b.addEventListener('click', () => { view.by = b.dataset.k; render(root, { query: {}, state: s }); }));
}

const stat = (label, v, cls, sub, text) => `<div class="card card-body stat" style="padding-top:16px"><div class="label">${esc(label)}</div>
  <div class="value ${cls}">${text ?? money(v, { cents: false })}</div><div class="delta muted">${esc(sub)}</div></div>`;
