import { setActions } from '../app.js';
import { getState, update } from '../store.js';
import { esc, money, fmtMonth, fmtDate, today, uid, parseAmount, round2, addMonths } from '../util.js';
import { goalProgress, acctMap } from '../engine.js';
import { openModal, formData, accountOptions, toast, confirmDialog, emptyState, progressBar } from '../ui.js';
import { isLiability } from '../defaults.js';

export function render(root, { state: s }) {
  setActions('<button class="btn primary" id="add-goal">+ New goal</button>');
  document.getElementById('add-goal').onclick = () => goalForm();
  if (!s.goals.length) {
    root.innerHTML = `<div class="card">${emptyState('🏁', 'Set your first goal', 'Emergency fund, down payment, a trip, paying off a card — link a savings account or log contributions manually.', '<button class="btn primary" id="e-goal">+ New goal</button>')}</div>`;
    root.querySelector('#e-goal').onclick = () => goalForm();
    return;
  }
  const am = acctMap(s);
  const totals = s.goals.reduce((t, g) => { const p = goalProgress(s, g); t.cur += Math.min(p.current, p.target); t.tgt += p.target; t.mo += Number(g.monthlyContribution) || 0; return t; }, { cur: 0, tgt: 0, mo: 0 });
  root.innerHTML = `<div class="grid cols-3" style="margin-bottom:16px">
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Saved toward goals</div><div class="value">${money(totals.cur, { cents: false })}</div><div class="delta muted">of ${money(totals.tgt, { cents: false })}</div></div>
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Planned monthly contributions</div><div class="value">${money(totals.mo, { cents: false })}</div></div>
      <div class="card card-body stat" style="padding-top:16px"><div class="label">Goals</div><div class="value">${s.goals.length}</div><div class="delta muted">${s.goals.filter((g) => goalProgress(s, g).pct >= 1).length} complete</div></div>
    </div>
    <div class="grid cols-3">${s.goals.map((g) => {
      const p = goalProgress(s, g);
      const done = p.pct >= 1;
      const status = done ? '<span class="pill good">✓ Reached</span>' : p.onTrack === true ? '<span class="pill good">On track</span>' : p.onTrack === false ? '<span class="pill warn">⚠ Behind</span>' : '';
      return `<section class="card goal-card" data-goal="${g.id}">
        <div class="row between"><span class="icon" aria-hidden="true">${esc(g.icon || '🏁')}</span>${status}</div>
        <h2>${esc(g.name)}</h2>
        <div><span style="font-size:22px;font-weight:650">${money(p.current, { cents: false })}</span> <span class="muted">of ${money(p.target, { cents: false })}</span></div>
        ${progressBar(p.pct, { label: g.name }).toString().replace('class="progress"', `class="progress${done ? ' good' : ''}"`)}
        <div class="small ink2">${Math.round(p.pct * 100)}% · ${money(p.remaining, { cents: false })} to go</div>
        <div class="small muted">
          ${g.targetDate ? `Target ${esc(fmtMonth(g.targetDate.slice(0, 7), true))}${!done && p.monthlyNeeded != null ? ` · needs ${money(p.monthlyNeeded, { cents: false })}/mo` : ''}<br>` : ''}
          ${g.monthlyContribution ? `Contributing ${money(g.monthlyContribution, { cents: false })}/mo${p.projected && !done ? ` · reach it ≈ ${esc(fmtMonth(p.projected, true))}` : ''}<br>` : ''}
          ${g.accountId ? `Tracks <b>${esc(am[g.accountId]?.name || 'account')}</b> balance` : `${(g.contributions || []).length} contributions logged`}
        </div>
        <div class="row" style="margin-top:auto">${!g.accountId ? `<button class="btn small" data-contrib="${g.id}">+ Contribution</button>` : ''}<button class="btn small ghost" data-edit="${g.id}">Edit</button></div>
      </section>`;
    }).join('')}</div>`;
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => goalForm(s.goals.find((g) => g.id === b.dataset.edit))));
  root.querySelectorAll('[data-contrib]').forEach((b) => b.addEventListener('click', () => contribForm(s.goals.find((g) => g.id === b.dataset.contrib))));
}

function goalForm(g = null) {
  const s = getState();
  const isNew = !g;
  openModal({
    title: isNew ? 'New goal' : `Edit ${g.name}`,
    body: `<form id="goal-form" class="form-grid">
      <label class="field full">Name<div class="row"><input type="text" name="icon" value="${esc(g?.icon || '🏁')}" style="width:56px;text-align:center" aria-label="Emoji"><input type="text" name="name" value="${esc(g?.name || '')}" required placeholder="e.g. House down payment"></div></label>
      <label class="field">Target amount<input type="text" inputmode="decimal" name="target" value="${esc(g?.target ?? '')}" required></label>
      <label class="field">Target date<input type="month" name="targetDate" value="${esc(g?.targetDate?.slice(0, 7) || addMonths(today(), 12).slice(0, 7))}"></label>
      <label class="field full">Track progress with<select name="accountId"><option value="">Manual contributions</option>${accountOptions(s, g?.accountId, { filter: (a) => !isLiability(a) && !a.closedAt })}</select></label>
      <label class="field" data-manual>Already saved<input type="text" inputmode="decimal" name="startingAmount" value="${esc(g?.startingAmount ?? 0)}"></label>
      <label class="field">Planned monthly contribution<input type="text" inputmode="decimal" name="monthlyContribution" value="${esc(g?.monthlyContribution ?? '')}"></label>
      ${g?.contributions?.length ? `<div class="full"><h3 style="margin-bottom:6px">Contributions</h3><ul class="list" style="border:1px solid var(--line);border-radius:8px">${g.contributions.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((c) => `<li><div class="main">${esc(fmtDate(c.date, true))}</div><b class="num">${money(c.amount)}</b><button type="button" class="icon-btn" data-rmc="${c.id}" aria-label="Remove">✕</button></li>`).join('')}</ul></div>` : ''}
    </form>`,
    footer: `${!isNew ? '<button class="btn ghost left" data-del style="color:var(--critical)">Delete</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>`,
    onMount: (m, close) => {
      const form = m.querySelector('#goal-form');
      const sync = () => { m.querySelector('[data-manual]').style.display = form.accountId.value ? 'none' : ''; };
      form.accountId.addEventListener('change', sync); sync();
      m.querySelectorAll('[data-rmc]').forEach((b) => b.addEventListener('click', () => { update(() => { g.contributions = g.contributions.filter((c) => c.id !== b.dataset.rmc); }); b.closest('li').remove(); }));
      m.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDialog(`Delete the goal “${g.name}”?`, { ok: 'Delete', danger: true }))) return;
        update((st) => { st.goals = st.goals.filter((x) => x.id !== g.id); });
        close();
      });
      m.querySelector('[data-save]').addEventListener('click', () => {
        if (!form.reportValidity()) return;
        const d = formData(form);
        const target = parseAmount(d.target);
        if (!(target > 0)) { toast('Enter a target amount'); return; }
        const fields = {
          name: d.name.trim(), icon: d.icon.trim() || '🏁', target: round2(target), targetDate: d.targetDate ? `${d.targetDate}-01` : null,
          accountId: d.accountId || null, startingAmount: round2(parseAmount(d.startingAmount) || 0), monthlyContribution: round2(parseAmount(d.monthlyContribution) || 0),
        };
        update((st) => {
          if (isNew) st.goals.push({ id: uid('goal'), contributions: [], ...fields });
          else Object.assign(st.goals.find((x) => x.id === g.id), fields);
        });
        close();
      });
    },
  });
}

function contribForm(g) {
  openModal({
    title: `Contribute to ${g.name}`,
    body: `<form id="c-form" class="form-grid"><label class="field">Amount<input type="text" inputmode="decimal" name="amount" value="${esc(g.monthlyContribution || '')}" required></label>
      <label class="field">Date<input type="date" name="date" value="${today()}" required></label>
      <p class="full muted small">Use a negative amount to record a withdrawal.</p></form>`,
    footer: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Add</button>',
    onMount: (m, close) => m.querySelector('[data-save]').addEventListener('click', () => {
      const d = formData(m.querySelector('#c-form'));
      const v = parseAmount(d.amount);
      if (isNaN(v) || !v) { toast('Enter an amount'); return; }
      update((st) => { const x = st.goals.find((y) => y.id === g.id); (x.contributions ||= []).push({ id: uid('c'), date: d.date, amount: round2(v) }); });
      close();
      toast(`${money(v)} added to ${g.name}`);
    }),
  });
}
