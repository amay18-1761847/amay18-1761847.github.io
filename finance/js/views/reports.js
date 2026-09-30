import { esc, money, moneyCompact, currentMonth, addMonths, fmtMonth, monthRange, monthEnd, today, addDays, pct, monthKey, download } from '../util.js';
import { rowsBetween, breakdown, catType, merchantKey, catMap } from '../engine.js';
import { donut, foldTop, sparkline, SERIES, lineChart } from '../charts.js';
import { navigate, setActions } from '../app.js';
import { toCSV } from '../csv.js';

let r = { type: 'expense', by: 'category', range: '6m', from: '', to: '' };
const RANGES = [['this', 'This month'], ['last', 'Last month'], ['3m', 'Last 3 months'], ['6m', 'Last 6 months'], ['12m', 'Last 12 months'], ['ytd', 'Year to date'], ['custom', 'Custom']];

function dates() {
  const cm = currentMonth();
  switch (r.range) {
    case 'this': return [`${cm}-01`, monthEnd(cm)];
    case 'last': { const m = addMonths(cm, -1); return [`${m}-01`, monthEnd(m)]; }
    case '3m': return [`${addMonths(cm, -2)}-01`, monthEnd(cm)];
    case '12m': return [`${addMonths(cm, -11)}-01`, monthEnd(cm)];
    case 'ytd': return [`${cm.slice(0, 4)}-01-01`, monthEnd(cm)];
    case 'custom': return [r.from || addDays(today(), -90), r.to || today()];
    default: return [`${addMonths(cm, -5)}-01`, monthEnd(cm)];
  }
}

export function render(root, { state: s }) {
  const [from, to] = dates();
  const rows = rowsBetween(s, from, to);
  const items = breakdown(s, rows, r.by, r.type);
  const total = items.reduce((a, x) => a + x.amount, 0);
  const months = monthRange(monthKey(from), monthKey(to));
  const folded = foldTop(items, 7).map((x, i) => ({ ...x, value: x.amount, color: SERIES(i) }));

  // Monthly matrix for the table: key -> month -> amount
  const matrix = new Map();
  const cm = catMap(s);
  for (const row of rows) {
    if (catType(s, row.categoryId) !== r.type) continue;
    let keys;
    if (r.by === 'category') keys = [row.categoryId];
    else if (r.by === 'group') keys = [cm[row.categoryId]?.groupId || 'none'];
    else if (r.by === 'merchant') keys = [merchantKey(row.merchant)];
    else if (r.by === 'account') keys = [row.accountId];
    else keys = row.tags?.length ? row.tags : ['__none'];
    const v = r.type === 'income' ? row.amount : -row.amount;
    for (const k of keys) {
      if (!matrix.has(k)) matrix.set(k, {});
      const mm = matrix.get(k);
      const mk = monthKey(row.date);
      mm[mk] = (mm[mk] || 0) + v;
    }
  }
  const totalsByMonth = months.map((m) => [...matrix.values()].reduce((a, mm) => a + (mm[m] || 0), 0));

  setActions('<button class="btn" id="rep-exp">Export CSV</button>');
  document.getElementById('rep-exp').onclick = () => {
    const out = [[r.by[0].toUpperCase() + r.by.slice(1), ...months.map((m) => fmtMonth(m)), 'Total']];
    for (const it of items) out.push([it.label, ...months.map((m) => (matrix.get(it.key)?.[m] || 0).toFixed(2)), it.amount.toFixed(2)]);
    download(`report-${r.type}-${r.by}-${today()}.csv`, toCSV(out), 'text/csv');
  };

  root.innerHTML = `<div class="filters">
      <div class="tabs" id="rp-type"><button class="${r.type === 'expense' ? 'active' : ''}" data-v="expense">Spending</button><button class="${r.type === 'income' ? 'active' : ''}" data-v="income">Income</button></div>
      <select id="rp-by" aria-label="Group by" style="width:auto">${[['category', 'By category'], ['group', 'By category group'], ['merchant', 'By merchant'], ['account', 'By account'], ['tag', 'By tag']].map(([v, l]) => `<option value="${v}" ${r.by === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select id="rp-range" aria-label="Date range" style="width:auto">${RANGES.map(([v, l]) => `<option value="${v}" ${r.range === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      ${r.range === 'custom' ? `<input type="date" id="rp-from" value="${from}" aria-label="From" style="width:auto"><input type="date" id="rp-to" value="${to}" aria-label="To" style="width:auto">` : ''}
    </div>
    <div class="grid side">
      <section class="card"><div class="card-head"><h2>${r.type === 'expense' ? 'Spending' : 'Income'} over time</h2><span class="sub">Total ${money(total, { cents: false })} · avg ${money(total / months.length, { cents: false })}/mo</span></div>
        <div class="card-body"><div class="chart" id="rp-line"></div></div></section>
      <section class="card"><div class="card-head"><h2>Breakdown</h2></div>
        <div class="card-body"><div style="display:flex;justify-content:center;margin-bottom:12px" id="rp-donut"></div>
        <ul class="legend-list">${folded.map((it) => `<li data-k="${esc(it.key)}" data-label="${esc(it.label)}"><i style="background:${it.color}"></i><span class="l">${esc(it.label)}</span><span class="num small">${money(it.value, { cents: false })}</span><span class="muted small num">${pct(it.value / (total || 1))}</span></li>`).join('')}</ul></div></section>
    </div>
    <section class="card" style="margin-top:16px"><div class="card-head"><h2>By month</h2><span class="sub">${items.length} ${esc(r.by === 'category' ? 'categories' : r.by + 's')}</span></div>
      <div class="card-body flush table-scroll"><table class="data">
        <thead><tr><th>${esc(r.by === 'group' ? 'Group' : r.by[0].toUpperCase() + r.by.slice(1))}</th><th class="hide-sm">Trend</th>${months.slice(-6).map((m) => `<th class="amt">${esc(fmtMonth(m))}</th>`).join('')}<th class="amt">Avg/mo</th><th class="amt">Total</th></tr></thead>
        <tbody>${items.slice(0, 60).map((it) => {
          const mm = matrix.get(it.key) || {};
          const series = months.map((m) => mm[m] || 0);
          return `<tr class="clickable" data-k="${esc(it.key)}" data-label="${esc(it.label)}"><td>${esc(it.label)}</td><td class="hide-sm">${sparkline(series, { w: 80, h: 22, color: SERIES(r.type === 'income' ? 2 : 0) })}</td>
            ${months.slice(-6).map((m) => `<td class="amt">${mm[m] ? money(mm[m], { cents: false }) : '<span class="muted">—</span>'}</td>`).join('')}
            <td class="amt">${money(it.amount / months.length, { cents: false })}</td><td class="amt"><b>${money(it.amount, { cents: false })}</b></td></tr>`;
        }).join('') || `<tr><td colspan="10" class="muted">Nothing in this period.</td></tr>`}
        ${items.length ? `<tr><td><b>Total</b></td><td class="hide-sm"></td>${totalsByMonth.slice(-6).map((v) => `<td class="amt"><b>${money(v, { cents: false })}</b></td>`).join('')}<td class="amt"><b>${money(total / months.length, { cents: false })}</b></td><td class="amt"><b>${money(total, { cents: false })}</b></td></tr>` : ''}
        </tbody></table></div></section>`;

  lineChart(root.querySelector('#rp-line'), {
    series: [{ name: r.type === 'expense' ? 'Spending' : 'Income', color: SERIES(r.type === 'income' ? 2 : 0), points: months.map((m, i) => ({ x: m, y: totalsByMonth[i] })) }],
    height: 260, xLabel: (m) => fmtMonth(m), tipTitle: (m) => fmtMonth(m, true), label: 'Total by month',
  });
  donut(root.querySelector('#rp-donut'), { items: folded, size: 190, center: moneyCompact(total), sub: r.type === 'expense' ? 'spent' : 'earned', onClick: (it) => drill(it.key, it.label) });

  function drill(key, label) {
    if (key === '__other') return;
    const q = { from, to };
    if (r.by === 'category') q.category = key;
    else if (r.by === 'merchant') q.merchant = label;
    else if (r.by === 'account') q.account = key;
    else if (r.by === 'tag' && key !== '__none') q.tag = key;
    else q.type = r.type;
    navigate('transactions', q);
  }
  root.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('click', () => drill(el.dataset.k, el.dataset.label)));
  root.querySelectorAll('#rp-type button').forEach((b) => b.addEventListener('click', () => { r.type = b.dataset.v; render(root, { state: s }); }));
  root.querySelector('#rp-by').addEventListener('change', (e) => { r.by = e.target.value; render(root, { state: s }); });
  root.querySelector('#rp-range').addEventListener('change', (e) => { r.range = e.target.value; render(root, { state: s }); });
  root.querySelector('#rp-from')?.addEventListener('change', (e) => { r.from = e.target.value; r.to = to; render(root, { state: s }); });
  root.querySelector('#rp-to')?.addEventListener('change', (e) => { r.to = e.target.value; r.from = from; render(root, { state: s }); });
}
