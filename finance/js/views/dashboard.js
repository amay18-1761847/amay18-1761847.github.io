import { setActions } from '../app.js';
import { esc, money, moneyCompact, currentMonth, addMonths, fmtMonth, fmtDate, today, addDays, monthRange, pct, monthEnd, daysBetween, fmtAxisDate } from '../util.js';
import {
  netWorthSeries, netWorthAt, cashflowByMonth, budgetMonth, breakdown, rowsBetween, upcoming, goalProgress,
  monthProgress, holdingsSummary,
} from '../engine.js';
import { lineChart, columnChart, donut, foldTop, SERIES } from '../charts.js';
import { progressBar } from '../ui.js';
import { txnTable, bindTxnTable, openAddTransaction } from './txnEdit.js';

let nwRange = '1Y';
const RANGES = { '1M': 30, '3M': 91, '6M': 182, '1Y': 365, All: 3650 };

export function render(root, { state: s }) {
  setActions('<button class="btn primary" id="add-txn">+ Transaction</button>');
  document.getElementById('add-txn').onclick = () => openAddTransaction();

  const mk = currentMonth();
  const nwNow = netWorthAt(s, today());
  const nwMonthAgo = netWorthAt(s, addDays(today(), -30));
  const nwDelta = nwNow.net - nwMonthAgo.net;
  const cf = summarizeMonth(s, mk);
  const b = budgetMonth(s, mk);
  const prog = monthProgress(mk);
  const unreviewed = s.transactions.filter((t) => !t.reviewed).length;
  const up = upcoming(s, today(), addDays(today(), 30)).filter((x) => !x.paid).slice(0, 6);
  const inv = holdingsSummary(s);

  root.innerHTML = `
    ${s.demo ? `<div class="banner"><span>👀 You're exploring sample data. Clear it and start with your own in <a href="#/settings?tab=data">Settings → Data</a>.</span></div>` : ''}
    <div class="grid side">
      <div class="stack">
        <section class="card">
          <div class="card-head">
            <div class="stat hero"><div class="label">Net worth</div><div class="value">${money(nwNow.net, { cents: false })}</div>
              <div class="delta ${nwDelta >= 0 ? 'pos' : 'neg'}">${nwDelta >= 0 ? '▲' : '▼'} ${money(Math.abs(nwDelta), { cents: false })} past 30 days</div></div>
            <div class="tabs" role="tablist" id="nw-range">${Object.keys(RANGES).map((r) => `<button role="tab" class="${r === nwRange ? 'active' : ''}" data-r="${r}">${r}</button>`).join('')}</div>
          </div>
          <div class="card-body"><div class="chart" id="nw-chart"></div>
            <div class="stat-row" style="margin-top:8px"><div class="stat"><div class="label">Assets</div><div class="value" style="font-size:18px">${money(nwNow.assets, { cents: false })}</div></div>
            <div class="stat"><div class="label">Liabilities</div><div class="value" style="font-size:18px">${money(nwNow.liabilities, { cents: false })}</div></div></div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Cash flow · ${esc(fmtMonth(mk, true))}</h2><a class="more" href="#/cashflow">View cash flow →</a></div>
          <div class="card-body">
            <div class="stat-row">
              <div class="stat"><div class="label">Income</div><div class="value pos">${money(cf.income, { cents: false })}</div></div>
              <div class="stat"><div class="label">Spending</div><div class="value">${money(cf.expense, { cents: false })}</div></div>
              <div class="stat"><div class="label">Net</div><div class="value ${cf.net >= 0 ? 'pos' : 'neg'}">${money(cf.net, { cents: false, sign: true })}</div></div>
              <div class="stat"><div class="label">Savings rate</div><div class="value">${cf.income > 0 ? pct(cf.savingsRate) : '—'}</div></div>
            </div>
            <div class="legend" style="margin:14px 0 4px"><span><i style="background:${SERIES(2)}"></i>Income</span><span><i style="background:${SERIES(1)}"></i>Spending</span></div>
            <div class="chart" id="cf-chart"></div>
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Recent transactions</h2>
            <div class="row">${unreviewed ? `<a class="pill warn" href="#/transactions?review=1">${unreviewed} to review</a>` : ''}<a class="more" href="#/transactions">All transactions →</a></div></div>
          <div class="card-body flush" id="recent"></div>
        </section>
      </div>
      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>Budget</h2><a class="more" href="#/budget">View budget →</a></div>
          <div class="card-body budget-summary">
            ${budgetSummary(s, b, prog)}
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Spending this month</h2><a class="more" href="#/reports">Reports →</a></div>
          <div class="card-body" id="spend-donut"></div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Upcoming bills</h2><a class="more" href="#/recurring">Recurring →</a></div>
          <div class="card-body flush">${up.length ? `<ul class="list">${up.map((u) => `<li><div class="avatar">${esc(u.merchant[0] || '?')}</div>
            <div class="main"><div class="title">${esc(u.merchant)}</div><div class="sub">${esc(fmtDate(u.date))} · ${dueIn(u.date)}</div></div>
            <div class="num ${u.amount > 0 ? 'pos' : ''}">${money(u.amount)}</div></li>`).join('')}</ul>`
            : '<p class="muted" style="padding:0 18px">Nothing due in the next 30 days. Confirm recurring items on the Recurring page.</p>'}</div>
        </section>
        ${s.goals.length ? `<section class="card"><div class="card-head"><h2>Goals</h2><a class="more" href="#/goals">Goals →</a></div>
          <div class="card-body">${s.goals.slice(0, 4).map((g) => {
            const p = goalProgress(s, g);
            return `<div style="margin-bottom:12px"><div class="row between small"><span><b>${esc(g.icon || '🏁')} ${esc(g.name)}</b></span><span class="ink2">${money(p.current, { cents: false })} / ${money(p.target, { cents: false })}</span></div>
              <div style="margin-top:6px">${progressBar(p.pct, { label: g.name })}</div></div>`;
          }).join('')}</div></section>` : ''}
        ${inv.rows.length ? `<section class="card"><div class="card-head"><h2>Investments</h2><a class="more" href="#/investments">Holdings →</a></div>
          <div class="card-body"><div class="stat"><div class="label">Total value</div><div class="value">${money(inv.value, { cents: false })}</div>
          <div class="delta ${inv.gain >= 0 ? 'pos' : 'neg'}">${money(inv.gain, { cents: false, sign: true })} (${pct(inv.cost ? inv.gain / inv.cost : 0, 1)}) all-time</div></div></div></section>` : ''}
      </div>
    </div>`;

  // Net worth chart
  const drawNW = () => {
    const from = addDays(today(), -RANGES[nwRange]);
    const series = netWorthSeries(s, from);
    lineChart(root.querySelector('#nw-chart'), {
      series: [{ name: 'Net worth', color: SERIES(0), points: series.map((p) => ({ x: p.date, y: p.net })) }],
      height: 220, zeroBased: false, xLabel: (d) => fmtAxisDate(d, RANGES[nwRange]), tipTitle: (d) => fmtDate(d, true), label: 'Net worth over time',
    });
  };
  drawNW();
  root.querySelectorAll('#nw-range button').forEach((btn) => btn.addEventListener('click', () => {
    nwRange = btn.dataset.r;
    root.querySelectorAll('#nw-range button').forEach((x) => x.classList.toggle('active', x === btn));
    drawNW();
  }));

  // Cash flow mini chart: last 6 months
  const months = monthRange(addMonths(mk, -5), mk);
  const flows = cashflowByMonth(s, months);
  columnChart(root.querySelector('#cf-chart'), {
    labels: months.map((m) => fmtMonth(m)), height: 180, label: 'Income and spending by month',
    series: [{ name: 'Income', color: SERIES(2), values: flows.map((f) => f.income) }, { name: 'Spending', color: SERIES(0), values: flows.map((f) => f.expense) }],
    tipTitle: (i) => fmtMonth(months[i], true),
    tipExtra: (i) => `<div class="tip-row" style="margin-top:4px"><span></span><span>Net</span><b>${money(flows[i].net)}</b></div>`,
    onClick: (i) => { location.hash = `#/cashflow?month=${months[i]}`; },
  });

  // Spending donut
  const rows = rowsBetween(s, `${mk}-01`, monthEnd(mk));
  const items = foldTop(breakdown(s, rows, 'group', 'expense'), 6).map((x, i) => ({ ...x, value: x.amount, color: SERIES(i) }));
  const donutEl = root.querySelector('#spend-donut');
  donutEl.innerHTML = `<div class="donut-layout"><div id="dn"></div><ul class="legend-list">${items.map((it) => `<li data-k="${esc(it.key)}"><i style="background:${it.color}"></i><span class="l">${esc(it.label)}</span><span class="num small">${moneyCompact(it.value)}</span><span class="muted small num">${pct(it.value / (cf.expense || 1))}</span></li>`).join('')}</ul></div>`;
  donut(donutEl.querySelector('#dn'), { items, size: 150, center: moneyCompact(cf.expense), sub: 'spent', onClick: () => { location.hash = '#/reports'; } });

  // Recent transactions
  const recent = [...s.transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 8);
  const rEl = root.querySelector('#recent');
  rEl.innerHTML = txnTable(s, recent, { showAccount: true });
  bindTxnTable(rEl);
}

export function dueIn(date) {
  const n = daysBetween(today(), date);
  return n <= 0 ? 'due today' : n === 1 ? 'tomorrow' : `in ${n} days`;
}

function summarizeMonth(s, mk) {
  return cashflowByMonth(s, [mk])[0];
}

function budgetSummary(s, b, prog) {
  const { expenseBudget, expenseActual, incomeBudget, incomeActual } = b.totals;
  if (!expenseBudget && !incomeBudget) {
    return '<p class="muted">No budget set yet.</p><a class="btn small" href="#/budget">Set up a budget</a>';
  }
  const left = expenseBudget - expenseActual;
  const over = [];
  for (const sec of b.sections) for (const r of sec.rows) if (sec.group.type === 'expense' && r.budget > 0) over.push(r);
  over.sort((a, z) => (z.actual / (z.budget + z.rollover || 1)) - (a.actual / (a.budget + a.rollover || 1)));
  return `<div class="row between small"><span class="ink2">Spending</span><span><b>${money(expenseActual, { cents: false })}</b> <span class="muted">of ${money(expenseBudget, { cents: false })}</span></span></div>
    <div style="margin:6px 0 4px">${progressBar(expenseBudget ? expenseActual / expenseBudget : 0, { over: left < 0, pace: prog, label: 'Spending vs budget' })}</div>
    <p class="small ${left < 0 ? 'neg' : 'ink2'}">${left >= 0 ? `${money(left, { cents: false })} left` : `${money(-left, { cents: false })} over budget`}</p>
    <div class="row between small" style="margin-top:10px"><span class="ink2">Income</span><span><b>${money(incomeActual, { cents: false })}</b> <span class="muted">of ${money(incomeBudget, { cents: false })}</span></span></div>
    <div style="margin:6px 0 14px">${progressBar(incomeBudget ? incomeActual / incomeBudget : 0, { label: 'Income vs budget' }).toString().replace('class="progress"', 'class="progress good"')}</div>
    <div class="small ink2" style="font-weight:600;margin-bottom:6px">Watch list</div>
    ${over.slice(0, 5).map((r) => {
      const avail = r.budget + r.rollover;
      const rem = avail - r.actual;
      return `<div style="margin-bottom:8px"><div class="row between small"><span>${esc(r.cat.icon)} ${esc(r.cat.name)}</span><span class="${rem < 0 ? 'neg' : 'ink2'}">${rem < 0 ? money(-rem, { cents: false }) + ' over' : money(rem, { cents: false }) + ' left'}</span></div>
        <div style="margin-top:4px">${progressBar(avail > 0 ? r.actual / avail : 1, { over: rem < 0, pace: prog, label: r.cat.name })}</div></div>`;
    }).join('')}`;
}
