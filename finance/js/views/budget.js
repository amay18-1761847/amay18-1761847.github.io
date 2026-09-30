import { setActions, navigate } from '../app.js';
import { getState, update } from '../store.js';
import { esc, money, currentMonth, addMonths, fmtMonth, parseAmount, round2 } from '../util.js';
import { budgetMonth, monthProgress, averageSpend, budgetFor, sortedCategories } from '../engine.js';
import { progressBar, openModal, formData, toast, confirmDialog } from '../ui.js';

let month = null;

export function render(root, { query, state: s }) {
  if (query.month) month = query.month;
  if (!month) month = currentMonth();
  const b = budgetMonth(s, month);
  const prog = monthProgress(month);
  const flex = s.settings.budgetMode === 'flex';
  const t = b.totals;
  const leftToBudget = round2(t.incomeBudget - t.expenseBudget);

  setActions(`<div class="tabs" id="mode"><button class="${!flex ? 'active' : ''}" data-m="category">Category</button><button class="${flex ? 'active' : ''}" data-m="flex">Flex</button></div>
    <button class="btn" id="tools">Budget tools ▾</button>`);
  document.querySelectorAll('#mode button').forEach((btn) => btn.addEventListener('click', () => update((st) => { st.settings.budgetMode = btn.dataset.m; })));
  document.getElementById('tools').onclick = () => toolsMenu();

  root.innerHTML = `<div class="row between wrap" style="margin-bottom:16px">
      <div class="month-nav"><button class="icon-btn" id="prev" aria-label="Previous month">‹</button><strong>${esc(fmtMonth(month, true))}</strong><button class="icon-btn" id="next" aria-label="Next month">›</button>
      ${month !== currentMonth() ? '<button class="btn ghost small" id="now">Today</button>' : ''}</div>
      <span class="muted small">Budgets carry forward to later months until you change them.</span>
    </div>
    <div class="grid cols-3" style="margin-bottom:16px">
      ${summaryCard('Income', t.incomeActual, t.incomeBudget, 'income', prog)}
      ${summaryCard('Expenses', t.expenseActual, t.expenseBudget, 'expense', prog)}
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Left to budget</div>
        <div class="value ${leftToBudget < 0 ? 'neg' : ''}">${money(leftToBudget, { cents: false })}</div>
        <div class="delta muted">${leftToBudget < 0 ? 'You’ve budgeted more than your expected income' : leftToBudget > 0 ? 'Unassigned income — budget it or save it' : 'Every dollar has a job ✓'}</div></div>
    </div>
    ${flex ? flexView(s, b, prog) : categoryView(b, prog)}`;

  root.querySelector('#prev').onclick = () => { month = addMonths(month, -1); clearQuery(); render(root, { query: {}, state: getState() }); };
  root.querySelector('#next').onclick = () => { month = addMonths(month, 1); clearQuery(); render(root, { query: {}, state: getState() }); };
  root.querySelector('#now')?.addEventListener('click', () => { month = currentMonth(); clearQuery(); render(root, { query: {}, state: getState() }); });

  root.querySelectorAll('input[data-budget]').forEach((inp) => {
    inp.addEventListener('focus', () => inp.select());
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
    inp.addEventListener('change', () => {
      const v = inp.value.trim() === '' ? 0 : parseAmount(inp.value);
      if (isNaN(v)) { toast('Enter a number'); return; }
      update((st) => { (st.budgets[month] ||= {})[inp.dataset.budget] = round2(Math.max(0, v)); });
    });
  });
  root.querySelectorAll('[data-catopen]').forEach((el) => el.addEventListener('click', () => categoryModal(el.dataset.catopen)));
}

function clearQuery() { if (location.hash.includes('?')) history.replaceState(null, '', '#/budget'); }

function summaryCard(label, actual, budget, type, prog) {
  const rem = round2(budget - actual);
  const over = type === 'expense' ? rem < 0 : false;
  return `<div class="card card-body stat budget-summary" style="padding-top:16px"><div class="label">${esc(label)}</div>
    <div class="value">${money(actual, { cents: false })} <span class="muted" style="font-size:14px;font-weight:500">of ${money(budget, { cents: false })}</span></div>
    <div style="margin:8px 0 4px">${progressBar(budget ? actual / budget : 0, { over, pace: type === 'expense' ? prog : null, label })}</div>
    <div class="delta ${over ? 'neg' : 'muted'}">${type === 'income' ? (rem > 0 ? `${money(rem, { cents: false })} still expected` : `${money(-rem, { cents: false })} above plan`) : over ? `${money(-rem, { cents: false })} over budget` : `${money(rem, { cents: false })} remaining`}</div></div>`;
}

function rowHtml(r, type, prog, { input = true } = {}) {
  const avail = r.budget + r.rollover;
  const rem = type === 'income' ? r.actual - r.budget : avail - r.actual;
  const over = type === 'expense' && rem < -0.004;
  const frac = avail > 0 ? r.actual / avail : r.actual > 0 ? 1 : 0;
  return `<tr>
    <td><button class="link" style="color:inherit;font-weight:500" data-catopen="${r.cat.id}" data-focus="bc-${r.cat.id}">${esc(r.cat.icon)} ${esc(r.cat.name)}</button>${r.cat.rollover ? ' <span class="pill" title="Unspent budget rolls over">↻ rollover</span>' : ''}</td>
    <td class="amt">${input ? `<input class="inline-input num" data-budget="${r.cat.id}" data-focus="b-${r.cat.id}" value="${r.budget ? r.budget.toFixed(0) : ''}" placeholder="0" inputmode="decimal" aria-label="Budget for ${esc(r.cat.name)}">` : '<span class="muted">—</span>'}</td>
    <td class="amt">${money(r.actual, { cents: false })}</td>
    <td class="amt ${over ? 'neg' : type === 'income' && rem >= 0 ? 'pos' : ''}">${type === 'income' ? money(rem, { cents: false, sign: true }) : money(rem, { cents: false })}
      ${r.rollover ? `<div class="tiny muted">${money(r.rollover, { cents: false, sign: true })} rolled over</div>` : ''}</td>
    <td class="bar-cell hide-sm">${input || type === 'income' ? progressBar(frac, { over, pace: type === 'expense' ? prog : null, label: r.cat.name }) : ''}</td></tr>`;
}

function categoryView(b, prog) {
  let out = '';
  for (const sec of b.sections) {
    if (!sec.rows.length) continue;
    const type = sec.group.type;
    out += `<section class="card" style="margin-bottom:16px"><div class="card-body flush table-scroll"><table class="data budget-table">
      <thead><tr><th>${esc(sec.group.name)}</th><th class="amt">Budget</th><th class="amt">Actual</th><th class="amt">${type === 'income' ? 'Difference' : 'Remaining'}</th><th class="hide-sm"></th></tr></thead>
      <tbody>${sec.rows.filter((r) => r.budget || r.actual || r.rollover || !r.cat.hideIfEmpty).map((r) => rowHtml(r, type, prog)).join('')}
      <tr class="group-row"><td>Total</td><td class="amt">${money(sec.budget, { cents: false })}</td><td class="amt">${money(sec.actual, { cents: false })}</td><td class="amt">${money(type === 'income' ? sec.actual - sec.budget : sec.remaining, { cents: false })}</td><td class="hide-sm"></td></tr>
      </tbody></table></div></section>`;
  }
  return out;
}

function flexView(s, b, prog) {
  const f = b.flex;
  const card = (title, d, desc) => `<div class="card flex-card"><div class="small ink2" style="font-weight:600">${esc(title)}</div>
    <div class="value">${money(d.actual, { cents: false })} <span class="muted small">of ${money(d.budget, { cents: false })}</span></div>
    <div style="margin:8px 0">${progressBar(d.budget ? d.actual / d.budget : 0, { over: d.remaining < 0, pace: title === 'Flexible' ? prog : null, label: title })}</div>
    <div class="small ${d.remaining < 0 ? 'neg' : 'muted'}">${d.remaining < 0 ? `${money(-d.remaining, { cents: false })} over` : `${money(d.remaining, { cents: false })} left`} · ${esc(desc)}</div></div>`;
  const table = (title, rows, withInput, extra = '') => `<section class="card" style="margin-bottom:16px"><div class="card-head"><h2>${esc(title)}</h2>${extra}</div>
    <div class="card-body flush table-scroll"><table class="data budget-table"><thead><tr><th>Category</th><th class="amt">Budget</th><th class="amt">Actual</th><th class="amt">Remaining</th><th class="hide-sm"></th></tr></thead>
    <tbody>${rows.filter((r) => r.budget || r.actual || withInput).map((r) => rowHtml(r, 'expense', prog, { input: withInput })).join('') || '<tr><td colspan="5" class="muted">No categories</td></tr>'}</tbody></table></div></section>`;
  const income = b.sections.find((x) => x.group.type === 'income');
  return `<div class="note" style="margin-bottom:16px">Flex budgeting: set a budget for each <b>fixed</b> bill and <b>non-monthly</b> expense, then give yourself one number for everything <b>flexible</b>. Change a category’s type by clicking its name.</div>
    <div class="grid cols-3" style="margin-bottom:16px">${card('Fixed', f.fixed, 'bills that don’t change')}${card('Flexible', f.flexible, 'one budget for day-to-day spending')}${card('Non-monthly', f.non_monthly, 'set aside monthly for irregular costs')}</div>
    ${table('Fixed', f.fixed.rows, true)}
    ${table('Flexible', f.flexible.rows, false, `<label class="row small ink2">Flexible budget <input class="inline-input num" data-budget="__flex" data-focus="b-flex" value="${f.flexible.budget ? f.flexible.budget.toFixed(0) : ''}" placeholder="0" inputmode="decimal" aria-label="Flexible budget" style="border-color:var(--line-strong)"></label>`)}
    ${table('Non-monthly', f.non_monthly.rows, true)}
    ${income ? `<section class="card"><div class="card-body flush"><table class="data budget-table"><thead><tr><th>Income</th><th class="amt">Budget</th><th class="amt">Actual</th><th class="amt">Difference</th><th class="hide-sm"></th></tr></thead>
      <tbody>${income.rows.map((r) => rowHtml(r, 'income', prog)).join('')}</tbody></table></div></section>` : ''}`;
}

function categoryModal(catId) {
  const s = getState();
  const c = s.categories.find((x) => x.id === catId);
  if (!c) return;
  const avg3 = averageSpend(s, catId, 3, month);
  const avg12 = averageSpend(s, catId, 12, month);
  const cur = budgetFor(s, month, catId);
  openModal({
    title: `${c.icon} ${c.name}`,
    body: `<form id="bc-form" class="form-grid">
      <div class="full note">This month budget: <b>${money(cur)}</b> · 3-month avg: <b>${money(avg3)}</b> · 12-month avg: <b>${money(avg12)}</b>
        <div class="row" style="margin-top:8px"><button type="button" class="btn small" data-use="${avg3}">Use 3-mo avg</button><button type="button" class="btn small" data-use="${avg12}">Use 12-mo avg</button></div></div>
      <label class="field">Flex type<select name="flex"><option value="fixed" ${c.flex === 'fixed' ? 'selected' : ''}>Fixed</option><option value="flexible" ${c.flex === 'flexible' ? 'selected' : ''}>Flexible</option><option value="non_monthly" ${c.flex === 'non_monthly' ? 'selected' : ''}>Non-monthly</option></select></label>
      <label class="check" style="align-self:end"><input type="checkbox" name="hideFromBudget" ${c.hideFromBudget ? 'checked' : ''}> Hide from budget</label>
      <label class="check full"><input type="checkbox" name="rollover" ${c.rollover ? 'checked' : ''}> Roll over unspent (or overspent) budget into next month</label>
      <label class="field">Rollover starts<input type="month" name="rolloverStart" value="${esc(c.rolloverStart || month)}"></label>
      <label class="field">Starting rollover balance<input type="text" inputmode="decimal" name="rolloverStartBalance" value="${esc(c.rolloverStartBalance || 0)}"></label>
    </form>`,
    footer: `<button class="btn ghost left" data-tx>View transactions</button><button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>`,
    onMount: (m, close) => {
      m.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => {
        update((st) => { (st.budgets[month] ||= {})[catId] = Math.round(Number(b.dataset.use)); });
        close();
        toast(`Budget set to ${money(Math.round(Number(b.dataset.use)))}`);
      }));
      m.querySelector('[data-tx]').addEventListener('click', () => { close(); navigate('transactions', { category: catId, month }); });
      m.querySelector('[data-save]').addEventListener('click', () => {
        const d = formData(m.querySelector('#bc-form'));
        update(() => Object.assign(c, {
          flex: d.flex, hideFromBudget: !!d.hideFromBudget, rollover: !!d.rollover,
          rolloverStart: d.rollover ? d.rolloverStart || month : null, rolloverStartBalance: Number(parseAmount(d.rolloverStartBalance)) || 0,
        }));
        close();
      });
    },
  });
}

function toolsMenu() {
  openModal({
    title: `Budget tools · ${fmtMonth(month, true)}`,
    body: `<div class="stack">
      <button class="btn" data-a="avg3">Set every category to its 3-month average</button>
      <button class="btn" data-a="avg12">Set every category to its 12-month average</button>
      <button class="btn" data-a="copy">Copy last month’s budget into this month</button>
      <button class="btn" data-a="clear">Clear this month’s changes (revert to earlier budget)</button>
      <p class="muted small">Averages exclude this month and round to whole dollars. Categories with no history are left unchanged.</p></div>`,
    onMount: (m, close) => m.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
      const a = b.dataset.a;
      const s = getState();
      if (a === 'clear') {
        if (!(await confirmDialog(`Remove budget values set in ${fmtMonth(month, true)}?`, { ok: 'Clear', danger: true }))) return;
        update((st) => { delete st.budgets[month]; });
      } else if (a === 'copy') {
        const prev = addMonths(month, -1);
        update((st) => {
          const out = {};
          for (const { categories } of sortedCategories(st)) for (const c of categories) out[c.id] = budgetFor(st, prev, c.id);
          out.__flex = budgetFor(st, prev, '__flex');
          st.budgets[month] = out;
        });
      } else {
        const n = a === 'avg3' ? 3 : 12;
        let set = 0;
        update((st) => {
          const out = { ...(st.budgets[month] || {}) };
          let flexTotal = 0;
          for (const { group, categories } of sortedCategories(s)) {
            if (group.type === 'transfer') continue;
            for (const c of categories) {
              const v = Math.round(averageSpend(s, c.id, n, month));
              if (v > 0) { out[c.id] = v; set++; if (group.type === 'expense' && (c.flex || 'flexible') === 'flexible') flexTotal += v; }
            }
          }
          if (flexTotal) out.__flex = flexTotal;
          st.budgets[month] = out;
        });
        toast(`Updated ${set} categories`);
      }
      close();
    })),
  });
}
