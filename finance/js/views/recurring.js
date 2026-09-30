import { setActions } from '../app.js';
import { getState, update } from '../store.js';
import { esc, money, currentMonth, addMonths, fmtMonth, fmtDate, monthEnd, today, parseISO, daysInMonth, uid, round2, parseAmount, sum } from '../util.js';
import { detectRecurring, upcoming, FREQ_LABEL, monthlyEquivalent, catLabel, acctMap, merchantKey, advance } from '../engine.js';
import { openModal, formData, categoryOptions, accountOptions, toast, confirmDialog, emptyState } from '../ui.js';

let tab = 'upcoming';
let month = null;

export function render(root, { state: s }) {
  if (!month) month = currentMonth();
  const suggestions = detectRecurring(s);
  setActions('<button class="btn primary" id="add-rec">+ Add recurring</button>');
  document.getElementById('add-rec').onclick = () => recForm();

  const active = s.recurring.filter((r) => r.active !== false);
  const monthlyOut = round2(sum(active.filter((r) => r.amount < 0), (r) => -monthlyEquivalent(r.amount, r.frequency)));
  const monthlyIn = round2(sum(active.filter((r) => r.amount > 0), (r) => monthlyEquivalent(r.amount, r.frequency)));
  const thisMonth = upcoming(s, `${currentMonth()}-01`, monthEnd(currentMonth()));
  const remaining = round2(sum(thisMonth.filter((x) => !x.paid && x.amount < 0 && x.date >= today()), (x) => -x.amount));

  root.innerHTML = `<div class="grid cols-3" style="margin-bottom:16px">
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Recurring expenses</div><div class="value">${money(monthlyOut, { cents: false })}<span class="muted small"> /mo</span></div><div class="delta muted">${active.filter((r) => r.amount < 0).length} bills &amp; subscriptions</div></div>
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Recurring income</div><div class="value pos">${money(monthlyIn, { cents: false })}<span class="muted small"> /mo</span></div></div>
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Still due this month</div><div class="value">${money(remaining, { cents: false })}</div><div class="delta muted">${thisMonth.filter((x) => !x.paid && x.date >= today()).length} upcoming</div></div>
    </div>
    <div class="tabs" id="rec-tabs" style="margin-bottom:16px">
      <button class="${tab === 'upcoming' ? 'active' : ''}" data-t="upcoming">Calendar</button>
      <button class="${tab === 'all' ? 'active' : ''}" data-t="all">All recurring (${s.recurring.length})</button>
      <button class="${tab === 'suggest' ? 'active' : ''}" data-t="suggest">Suggestions${suggestions.length ? ` <span class="pill warn">${suggestions.length}</span>` : ''}</button>
    </div>
    <div id="rec-body"></div>`;
  root.querySelectorAll('#rec-tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t; render(root, { state: getState() }); }));
  const body = root.querySelector('#rec-body');
  if (tab === 'upcoming') calendar(body, s);
  else if (tab === 'all') allList(body, s);
  else suggestList(body, s, suggestions);
}

function calendar(el, s) {
  const first = parseISO(`${month}-01`);
  const lead = first.getDay();
  const n = daysInMonth(month);
  const items = upcoming(s, `${month}-01`, monthEnd(month));
  const byDay = {};
  for (const it of items) (byDay[Number(it.date.slice(8))] ||= []).push(it);
  let cells = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < lead; i++) cells += '<div class="day out"></div>';
  for (let d = 1; d <= n; d++) {
    const iso = `${month}-${String(d).padStart(2, '0')}`;
    const evs = byDay[d] || [];
    cells += `<div class="day${iso === today() ? ' today' : ''}${evs.length ? ' has' : ''}"><div class="n">${d}</div>${evs.map((e) => `<span class="ev${e.paid ? ' paid' : ''}${e.amount > 0 ? ' income' : ''}" title="${esc(e.merchant)} ${esc(money(e.amount))}${e.paid ? ' (paid)' : ''}">${esc(e.merchant)} ${esc(money(Math.abs(e.amount), { cents: false }))}</span>`).join('')}</div>`;
  }
  el.innerHTML = `<div class="grid side">
    <section class="card"><div class="card-head"><div class="month-nav"><button class="icon-btn" id="cp" aria-label="Previous month">‹</button><strong>${esc(fmtMonth(month, true))}</strong><button class="icon-btn" id="cn" aria-label="Next month">›</button></div></div>
      <div class="card-body"><div class="cal">${cells}</div></div></section>
    <section class="card"><div class="card-head"><h2>${esc(fmtMonth(month, true))}</h2><span class="sub">${money(sum(items.filter((i) => i.amount < 0), (i) => -i.amount), { cents: false })} out</span></div>
      <div class="card-body flush">${items.length ? `<ul class="list">${items.map((i) => `<li class="clickable" data-rec="${i.id}"><div class="main"><div class="title">${esc(i.merchant)}</div>
        <div class="sub">${esc(fmtDate(i.date))} · ${esc(FREQ_LABEL[i.frequency])}</div></div>
        ${i.paid ? '<span class="pill good">✓ Paid</span>' : i.date < today() ? '<span class="pill bad">! Missed?</span>' : ''}
        <div class="num ${i.amount > 0 ? 'pos' : ''}">${money(i.amount)}</div></li>`).join('')}</ul>`
        : '<p class="muted" style="padding:0 18px">Nothing scheduled. Confirm suggestions or add recurring items.</p>'}</div></section></div>`;
  el.querySelector('#cp').onclick = () => { month = addMonths(month, -1); calendar(el, s); };
  el.querySelector('#cn').onclick = () => { month = addMonths(month, 1); calendar(el, s); };
  el.querySelectorAll('[data-rec]').forEach((li) => li.addEventListener('click', () => recForm(s.recurring.find((r) => r.id === li.dataset.rec))));
}

function allList(el, s) {
  if (!s.recurring.length) { el.innerHTML = `<div class="card">${emptyState('🔁', 'No recurring items yet', 'Check Suggestions — Ledgerly scans your history for subscriptions, bills and paychecks.')}</div>`; return; }
  const am = acctMap(s);
  const sorted = [...s.recurring].sort((a, b) => (a.active === false) - (b.active === false) || (a.nextDate < b.nextDate ? -1 : 1));
  el.innerHTML = `<section class="card"><div class="card-body flush table-scroll"><table class="data"><thead><tr><th>Merchant</th><th>Frequency</th><th class="hide-sm">Category</th><th class="hide-sm">Account</th><th>Next</th><th class="amt">Amount</th><th class="amt hide-sm">Per month</th></tr></thead><tbody>
    ${sorted.map((r) => `<tr class="clickable${r.active === false ? ' muted' : ''}" data-rec="${r.id}"><td><b>${esc(r.merchant)}</b>${r.active === false ? ' <span class="pill">Paused</span>' : ''}</td>
      <td>${esc(FREQ_LABEL[r.frequency])}</td><td class="hide-sm">${esc(catLabel(s, r.categoryId))}</td><td class="hide-sm ink2">${esc(am[r.accountId]?.name || '—')}</td>
      <td class="nowrap">${esc(fmtDate(r.nextDate))}</td><td class="amt ${r.amount > 0 ? 'pos' : ''}">${money(r.amount)}</td><td class="amt hide-sm muted">${money(monthlyEquivalent(r.amount, r.frequency))}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  el.querySelectorAll('[data-rec]').forEach((tr) => tr.addEventListener('click', () => recForm(s.recurring.find((r) => r.id === tr.dataset.rec))));
}

function suggestList(el, s, list) {
  if (!list.length) { el.innerHTML = `<div class="card">${emptyState('🔍', 'No new suggestions', 'When a merchant charges you on a regular schedule (3+ times), it shows up here.')}</div>`; return; }
  el.innerHTML = `<p class="ink2" style="margin-bottom:12px">These merchants look like they repeat on a schedule. Confirm them to track upcoming bills.</p>
    <section class="card"><ul class="list">${list.map((r, i) => `<li><div class="avatar">${esc(r.merchant[0])}</div>
      <div class="main"><div class="title">${esc(r.merchant)} ${r.variable ? '<span class="pill">varies</span>' : ''}</div>
      <div class="sub">${esc(FREQ_LABEL[r.frequency])} · ${r.count} payments · last ${esc(fmtDate(r.lastDate))} · next ≈ ${esc(fmtDate(r.nextDate))} · ${esc(catLabel(s, r.categoryId))}</div></div>
      <div class="num ${r.amount > 0 ? 'pos' : ''}" style="min-width:90px;text-align:right">${money(r.amount)}</div>
      <button class="btn small primary" data-ok="${i}">Confirm</button><button class="btn small ghost" data-no="${i}" aria-label="Dismiss">Dismiss</button></li>`).join('')}</ul></section>
    <div class="row" style="margin-top:12px"><button class="btn" id="ok-all">Confirm all ${list.length}</button></div>`;
  const confirmOne = (st, r) => {
    let next = r.nextDate;
    while (next < today()) next = advance(next, r.frequency);
    st.recurring.push({ id: uid('rec'), merchantKey: r.merchantKey, merchant: r.merchant, amount: r.amount, frequency: r.frequency, categoryId: r.categoryId, accountId: r.accountId, lastDate: r.lastDate, nextDate: next, active: true });
  };
  el.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', () => { const r = list[+b.dataset.ok]; update((st) => confirmOne(st, r)); toast(`${r.merchant} added to recurring`); }));
  el.querySelectorAll('[data-no]').forEach((b) => b.addEventListener('click', () => { const r = list[+b.dataset.no]; update((st) => { st.dismissedRecurring.push(r.merchantKey); }); }));
  el.querySelector('#ok-all').addEventListener('click', () => { update((st) => list.forEach((r) => confirmOne(st, r))); toast(`${list.length} recurring items added`); });
}

function recForm(r = null) {
  const s = getState();
  const isNew = !r;
  const freqs = Object.entries(FREQ_LABEL).map(([k, v]) => `<option value="${k}" ${r?.frequency === k || (!r && k === 'monthly') ? 'selected' : ''}>${v}</option>`).join('');
  openModal({
    title: isNew ? 'Add recurring item' : `Edit ${r.merchant}`,
    body: `<form id="rec-form" class="form-grid">
      <label class="field full">Merchant<input type="text" name="merchant" value="${esc(r?.merchant || '')}" required></label>
      <label class="field">Amount<div class="row"><select name="dir" style="width:auto;min-width:120px;flex:none"><option value="-" ${!r || r.amount < 0 ? 'selected' : ''}>Expense −</option><option value="+" ${r?.amount > 0 ? 'selected' : ''}>Income +</option></select>
        <input type="text" inputmode="decimal" name="amount" value="${r ? Math.abs(r.amount).toFixed(2) : ''}" required></div></label>
      <label class="field">Frequency<select name="frequency">${freqs}</select></label>
      <label class="field">Next due<input type="date" name="nextDate" value="${esc(r?.nextDate || today())}" required></label>
      <label class="field">Category<select name="categoryId">${categoryOptions(s, r?.categoryId)}</select></label>
      <label class="field full">Account<select name="accountId">${accountOptions(s, r?.accountId, { includeEmpty: true, emptyLabel: 'Any account' })}</select></label>
      <label class="check full"><input type="checkbox" name="active" ${!r || r.active !== false ? 'checked' : ''}> Active</label>
      <p class="full muted small">Marked paid automatically when a matching ${esc(r?.merchant || 'merchant')} transaction posts within a few days of the due date.</p>
    </form>`,
    footer: `${!isNew ? '<button class="btn ghost left" data-del style="color:var(--critical)">Delete</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>`,
    onMount: (m, close) => {
      m.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDialog(`Stop tracking ${r.merchant}?`, { ok: 'Delete', danger: true }))) return;
        update((st) => { st.recurring = st.recurring.filter((x) => x.id !== r.id); st.dismissedRecurring.push(r.merchantKey); });
        close();
      });
      m.querySelector('[data-save]').addEventListener('click', () => {
        const form = m.querySelector('#rec-form');
        if (!form.reportValidity()) return;
        const d = formData(form);
        const amt = parseAmount(d.amount);
        if (isNaN(amt)) { toast('Enter a valid amount'); return; }
        const fields = { merchant: d.merchant.trim(), merchantKey: merchantKey(d.merchant), amount: round2((d.dir === '-' ? -1 : 1) * Math.abs(amt)), frequency: d.frequency, nextDate: d.nextDate, categoryId: d.categoryId, accountId: d.accountId || null, active: !!d.active };
        update((st) => {
          if (isNew) st.recurring.push({ id: uid('rec'), ...fields });
          else Object.assign(st.recurring.find((x) => x.id === r.id), fields);
        });
        close();
      });
    },
  });
}
