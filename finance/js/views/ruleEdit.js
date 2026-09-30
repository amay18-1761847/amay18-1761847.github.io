// Rule editor: conditions (merchant / description / amount / account / direction)
// and actions (category, rename, tags, hide, mark reviewed), with a live match preview.

import { getState, update } from '../store.js';
import { esc, uid, money, fmtDate } from '../util.js';
import { ruleMatches, applyRules } from '../engine.js';
import { openModal, formData, categoryOptions, accountOptions, toast, confirmDialog } from '../ui.js';

export function openRuleEditor(prefill = {}, existingId = null) {
  const s = getState();
  const existing = existingId ? s.rules.find((r) => r.id === existingId) : null;
  const r = existing ? JSON.parse(JSON.stringify(existing)) : { id: uid('rule'), enabled: true, name: '', conditions: {}, actions: {}, ...prefill };
  const c = { field: 'merchant', op: 'contains', amountOp: 'any', direction: 'any', ...r.conditions };
  const a = { tagIds: [], ...r.actions };
  const sel = (v, x) => (v === x ? 'selected' : '');
  const body = `<form id="rule-form" class="stack" autocomplete="off">
    <label class="field">Rule name<input type="text" name="name" value="${esc(r.name || '')}" placeholder="e.g. Coffee shops"></label>
    <div class="card" style="padding:14px;box-shadow:none"><h3 style="margin-bottom:10px">If a transaction…</h3>
      <div class="form-grid">
        <label class="field">Field<select name="field"><option value="merchant" ${sel(c.field, 'merchant')}>Merchant name</option><option value="description" ${sel(c.field, 'description')}>Original statement</option></select></label>
        <label class="field">Match<select name="op"><option value="contains" ${sel(c.op, 'contains')}>contains</option><option value="equals" ${sel(c.op, 'equals')}>equals</option><option value="starts" ${sel(c.op, 'starts')}>starts with</option></select></label>
        <label class="field full">Text<input type="text" name="value" value="${esc(c.value || '')}" placeholder="Leave blank to match any"></label>
        <label class="field">Amount<select name="amountOp">
          <option value="any" ${sel(c.amountOp, 'any')}>Any amount</option><option value="gt" ${sel(c.amountOp, 'gt')}>Greater than</option>
          <option value="lt" ${sel(c.amountOp, 'lt')}>Less than</option><option value="eq" ${sel(c.amountOp, 'eq')}>Exactly</option>
          <option value="between" ${sel(c.amountOp, 'between')}>Between</option></select></label>
        <div class="row" style="align-items:flex-end"><label class="field grow">Value<input type="number" step="0.01" name="amount" value="${esc(c.amount ?? '')}"></label>
          <label class="field grow" data-between>and<input type="number" step="0.01" name="amount2" value="${esc(c.amount2 ?? '')}"></label></div>
        <label class="field">Direction<select name="direction"><option value="any" ${sel(c.direction, 'any')}>Any</option><option value="debit" ${sel(c.direction, 'debit')}>Expense (money out)</option><option value="credit" ${sel(c.direction, 'credit')}>Income (money in)</option></select></label>
        <label class="field">Account<select name="accountId">${accountOptions(s, c.accountId, { includeEmpty: true, emptyLabel: 'Any account' })}</select></label>
      </div></div>
    <div class="card" style="padding:14px;box-shadow:none"><h3 style="margin-bottom:10px">Then…</h3>
      <div class="form-grid">
        <label class="field">Set category<select name="categoryId">${categoryOptions(s, a.categoryId, { includeEmpty: true, emptyLabel: "Don't change" })}</select></label>
        <label class="field">Rename merchant to<input type="text" name="merchant" value="${esc(a.merchant || '')}" placeholder="Don't change"></label>
        <div class="full"><div class="small ink2" style="font-weight:550;margin-bottom:4px">Add tags</div>
          ${s.tags.map((t) => `<label class="check small" style="margin-right:10px"><input type="checkbox" name="tag_${t.id}" ${a.tagIds?.includes(t.id) ? 'checked' : ''}> ${esc(t.name)}</label>`).join('') || '<span class="muted small">No tags yet</span>'}</div>
        <label class="check"><input type="checkbox" name="hide" ${a.hide ? 'checked' : ''}> Hide transaction</label>
        <label class="check"><input type="checkbox" name="reviewed" ${a.reviewed ? 'checked' : ''}> Mark as reviewed</label>
      </div></div>
    <label class="check"><input type="checkbox" name="applyExisting" checked> Apply to existing matching transactions</label>
    <div id="rule-preview" class="note"></div>
  </form>`;
  openModal({
    title: existing ? 'Edit rule' : 'Create rule', wide: true, body,
    footer: `${existing ? '<button class="btn ghost left" data-del style="color:var(--critical)">Delete rule</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save rule</button>`,
    onMount: (m, close) => {
      const form = m.querySelector('#rule-form');
      const read = () => {
        const d = formData(form);
        return {
          ...r, name: d.name.trim(),
          conditions: { field: d.field, op: d.op, value: d.value.trim(), amountOp: d.amountOp, amount: d.amount === '' ? null : Number(d.amount), amount2: d.amount2 === '' ? null : Number(d.amount2), direction: d.direction, accountId: d.accountId || null },
          actions: { categoryId: d.categoryId || null, merchant: d.merchant.trim() || null, tagIds: s.tags.filter((t) => d[`tag_${t.id}`]).map((t) => t.id), hide: !!d.hide, reviewed: !!d.reviewed },
          apply: !!d.applyExisting,
        };
      };
      const preview = () => {
        const rule = read();
        m.querySelector('[data-between]').style.visibility = rule.conditions.amountOp === 'between' ? 'visible' : 'hidden';
        const hits = getState().transactions.filter((t) => ruleMatches(rule, t));
        const pv = m.querySelector('#rule-preview');
        pv.innerHTML = `<b>${hits.length}</b> existing transaction${hits.length === 1 ? '' : 's'} match.` + (hits.length
          ? `<div style="margin-top:6px">${hits.slice(0, 5).map((t) => `${esc(fmtDate(t.date))} · ${esc(t.merchant)} · ${money(t.amount)}`).join('<br>')}${hits.length > 5 ? '<br>…' : ''}</div>` : '');
      };
      form.addEventListener('input', preview);
      form.addEventListener('change', preview);
      preview();
      m.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDialog('Delete this rule? Transactions it already changed stay as they are.', { ok: 'Delete', danger: true }))) return;
        update((st) => { st.rules = st.rules.filter((x) => x.id !== r.id); });
        close();
      });
      m.querySelector('[data-save]').addEventListener('click', () => {
        const rule = read();
        const hasCond = rule.conditions.value || rule.conditions.amountOp !== 'any' || rule.conditions.accountId || rule.conditions.direction !== 'any';
        const hasAct = rule.actions.categoryId || rule.actions.merchant || rule.actions.tagIds.length || rule.actions.hide || rule.actions.reviewed;
        if (!hasCond) { toast('Add at least one condition.'); return; }
        if (!hasAct) { toast('Choose at least one action.'); return; }
        const { apply, ...clean } = rule;
        if (!clean.name) clean.name = clean.conditions.value ? `“${clean.conditions.value}”` : 'Untitled rule';
        let changed = 0;
        update((st) => {
          const i = st.rules.findIndex((x) => x.id === clean.id);
          if (i >= 0) st.rules[i] = clean; else st.rules.unshift(clean);
          if (apply) {
            // Apply only this rule to existing transactions.
            const only = { ...st, rules: [clean] };
            st.transactions = st.transactions.map((t) => {
              const res = applyRules(only, t);
              if (res.matched) changed++;
              return res.t;
            });
          }
        });
        close();
        toast(`Rule saved${apply ? ` · ${changed} transaction${changed === 1 ? '' : 's'} updated` : ''}`);
      });
    },
  });
}
