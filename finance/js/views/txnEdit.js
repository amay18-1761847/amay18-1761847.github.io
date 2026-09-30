// Transaction editor modal (edit / add / split / delete), shared transaction table,
// and the "apply to similar + create rule" flow that follows a recategorization.

import { getState, update } from '../store.js';
import { esc, money, fmtDate, uid, today, round2, parseAmount, sum } from '../util.js';
import { acctMap, catLabel, merchantKey, prepareTransaction, tagMap, catMap } from '../engine.js';
import { openModal, formData, categoryOptions, accountOptions, confirmDialog, toast } from '../ui.js';
import { UNCATEGORIZED } from '../defaults.js';
import { openRuleEditor } from './ruleEdit.js';

const initials = (m) => (m || '?').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

export function tagChips(s, ids = []) {
  const tm = tagMap(s);
  return ids.map((id) => tm[id]).filter(Boolean)
    .map((t) => `<span class="tag"><i style="background:${esc(t.color)}"></i>${esc(t.name)}</span>`).join('');
}

// Renders a transaction table grouped by date. Rows open the editor on click.
export function txnTable(s, txns, { showAccount = true, selectable = false, selected = new Set(), groupByDate = true, limit = 0 } = {}) {
  const am = acctMap(s);
  const list = limit ? txns.slice(0, limit) : txns;
  if (!list.length) return '<div class="empty"><div class="empty-icon">🧾</div><h3>No transactions</h3><p>Nothing matches these filters.</p></div>';
  let out = `<div class="table-scroll"><table class="data txn-table"><thead><tr>
    ${selectable ? '<th style="width:32px"><input type="checkbox" data-select-all aria-label="Select all"></th>' : ''}
    <th>Merchant</th><th class="hide-sm">Category</th>${showAccount ? '<th class="hide-sm">Account</th>' : ''}<th class="amt">Amount</th></tr></thead><tbody>`;
  let lastDate = null;
  const cols = 3 + (showAccount ? 1 : 0) + (selectable ? 1 : 0);
  for (const t of list) {
    if (groupByDate && t.date !== lastDate) {
      lastDate = t.date;
      out += `<tr class="date-head"><td colspan="${cols}">${esc(fmtDate(t.date, true))}</td></tr>`;
    }
    const split = t.splits?.length;
    const cat = split ? `✂️ Split (${t.splits.length})` : catLabel(s, t.categoryId);
    const uncat = !split && (!t.categoryId || t.categoryId === UNCATEGORIZED);
    out += `<tr class="clickable${t.hidden ? ' muted' : ''}" data-txn="${t.id}">
      ${selectable ? `<td><input type="checkbox" data-sel="${t.id}" ${selected.has(t.id) ? 'checked' : ''} aria-label="Select"></td>` : ''}
      <td class="mcell"><div class="txn-merchant"><div class="avatar" aria-hidden="true">${esc(initials(t.merchant))}</div>
        <div style="min-width:0"><div class="name">${!t.reviewed ? '<span class="unreviewed-dot" title="Needs review"></span> ' : ''}${esc(t.merchant)}${t.hidden ? ' <span class="pill">Hidden</span>' : ''}${t.pending ? ' <span class="pill">Pending</span>' : ''}</div>
        <div class="sub"><button class="cat-chip show-sm${uncat ? ' uncat' : ''}" data-cat="${t.id}">${esc(cat)}</button>${t.notes ? '📝 ' + esc(t.notes) + ' ' : ''}${tagChips(s, t.tags)}</div></div></div></td>
      <td class="hide-sm"><button class="cat-chip${uncat ? ' uncat' : ''}" data-cat="${t.id}" title="Change category">${esc(cat)}</button></td>
      ${showAccount ? `<td class="hide-sm ink2 small nowrap">${esc(am[t.accountId]?.name || '—')}</td>` : ''}
      <td class="amt ${t.amount > 0 ? 'pos' : ''}">${money(t.amount, { sign: true })}</td></tr>`;
  }
  out += '</tbody></table></div>';
  if (limit && txns.length > limit) out += `<p class="muted small" style="padding:8px 12px">Showing ${limit} of ${txns.length}</p>`;
  return out;
}

// Wire up click handlers after txnTable() HTML is in the DOM.
export function bindTxnTable(root, { onSelect } = {}) {
  root.querySelectorAll('tr[data-txn]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('input[type=checkbox]')) return;
      if (e.target.closest('[data-cat]')) { quickCategory(tr.dataset.txn, e.target.closest('[data-cat]')); return; }
      openTxn(tr.dataset.txn);
    });
  });
  if (onSelect) {
    root.querySelectorAll('[data-sel]').forEach((cb) => cb.addEventListener('change', () => onSelect(cb.dataset.sel, cb.checked)));
    root.querySelector('[data-select-all]')?.addEventListener('change', (e) => {
      root.querySelectorAll('[data-sel]').forEach((cb) => { cb.checked = e.target.checked; onSelect(cb.dataset.sel, cb.checked, true); });
      onSelect(null, null);
    });
  }
}

// Inline category picker popover (a native select, positioned over the chip).
function quickCategory(id, anchor) {
  const s = getState();
  const t = s.transactions.find((x) => x.id === id);
  if (!t) return;
  if (t.splits?.length) { openTxn(id); return; }
  const sel = document.createElement('select');
  sel.innerHTML = categoryOptions(s, t.categoryId);
  sel.className = 'quick-cat';
  sel.style.cssText = 'width:220px';
  anchor.replaceWith(sel);
  sel.focus();
  try { sel.showPicker?.(); } catch { /* not supported everywhere */ }
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    if (commit && sel.value !== t.categoryId) setCategory(id, sel.value);
    else update(() => {}); // re-render to restore the chip
  };
  sel.addEventListener('change', () => finish(true));
  sel.addEventListener('blur', () => finish(true));
  sel.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(false); });
}

// Recategorize one transaction, then offer to apply to the rest of that merchant + make a rule.
export function setCategory(id, categoryId) {
  const s = getState();
  const t = s.transactions.find((x) => x.id === id);
  if (!t) return;
  const before = t.categoryId;
  update(() => { t.categoryId = categoryId; t.reviewed = true; });
  const key = merchantKey(t.merchant);
  const others = s.transactions.filter((x) => x.id !== id && merchantKey(x.merchant) === key && x.categoryId !== categoryId && !x.splits?.length);
  const hasRule = s.rules.some((r) => r.conditions?.value && key.includes(merchantKey(r.conditions.value)) && r.actions?.categoryId === categoryId);
  if (others.length || !hasRule) {
    toast(`Categorized as ${catLabel(s, categoryId)}`, {
      action: others.length ? `Apply to ${others.length} more & create rule` : 'Create rule',
      timeout: 7000,
      onAction: () => {
        update(() => { others.forEach((o) => { o.categoryId = categoryId; }); });
        openRuleEditor({ conditions: { field: 'merchant', op: 'contains', value: t.merchant }, actions: { categoryId }, name: `${t.merchant} → ${catMap(s)[categoryId]?.name || ''}` });
      },
    });
  }
  return before;
}

export function openTxn(id) {
  const s = getState();
  const t = s.transactions.find((x) => x.id === id);
  if (!t) return;
  txnForm(t);
}

export function openAddTransaction(defaults = {}) {
  const s = getState();
  if (!s.accounts.length) { toast('Add an account first.'); location.hash = '#/accounts?new=1'; return; }
  txnForm({ date: today(), amount: 0, accountId: defaults.accountId || s.accounts[0].id, merchant: '', categoryId: '', tags: [], notes: '', ...defaults }, true);
}

function txnForm(t, isNew = false) {
  const s = getState();
  let splits = (t.splits || []).map((p) => ({ ...p }));
  const tagBoxes = s.tags.map((tg) => `<label class="check small"><input type="checkbox" name="tag_${tg.id}" ${t.tags?.includes(tg.id) ? 'checked' : ''}>
    <span class="tag"><i style="background:${esc(tg.color)}"></i>${esc(tg.name)}</span></label>`).join(' ');
  const expense = isNew ? true : t.amount < 0;
  const body = `<form class="form-grid" id="txn-form" autocomplete="off">
    <label class="field full">Merchant<input type="text" name="merchant" value="${esc(t.merchant)}" required placeholder="e.g. Whole Foods"></label>
    <label class="field">Date<input type="date" name="date" value="${esc(t.date)}" required></label>
    <label class="field">Amount
      <div class="row"><select name="dir" style="width:auto;min-width:120px;flex:none"><option value="-" ${expense ? 'selected' : ''}>Expense −</option><option value="+" ${!expense ? 'selected' : ''}>Income +</option></select>
      <input type="text" inputmode="decimal" name="amount" value="${t.amount ? Math.abs(t.amount).toFixed(2) : ''}" required placeholder="0.00"></div></label>
    <label class="field">Account<select name="accountId">${accountOptions(s, t.accountId)}</select></label>
    <label class="field">Category<select name="categoryId" ${splits.length ? 'disabled' : ''}>${categoryOptions(s, t.categoryId, { includeEmpty: isNew, emptyLabel: 'Auto-categorize' })}</select></label>
    ${t.originalDescription ? `<div class="full note">Original statement: <b>${esc(t.originalDescription)}</b></div>` : ''}
    <div class="full"><div class="small ink2" style="font-weight:550;margin-bottom:4px">Tags</div>${tagBoxes || '<span class="muted small">No tags yet — create them in Settings → Tags.</span>'}</div>
    <label class="field full">Notes<textarea name="notes" rows="2">${esc(t.notes || '')}</textarea></label>
    <div class="full row wrap" style="gap:16px">
      <label class="check"><input type="checkbox" name="reviewed" ${t.reviewed || isNew ? 'checked' : ''}> Reviewed</label>
      <label class="check"><input type="checkbox" name="hidden" ${t.hidden ? 'checked' : ''}> Hide from budgets &amp; reports</label>
    </div>
    ${isNew ? '' : `<div class="full" id="split-area"></div>`}
  </form>`;
  const footer = `${isNew ? '' : '<button class="btn ghost left" data-del style="color:var(--critical)">Delete</button><button class="btn ghost" data-split>✂️ Split</button><button class="btn ghost" data-rule>Create rule</button>'}
    <button class="btn" data-close>Cancel</button><button class="btn primary" data-save>${isNew ? 'Add transaction' : 'Save'}</button>`;

  openModal({
    title: isNew ? 'Add transaction' : 'Edit transaction', body, footer,
    onMount: (m, close) => {
      const form = m.querySelector('#txn-form');
      const splitArea = m.querySelector('#split-area');
      const total = () => {
        const v = parseAmount(form.amount.value);
        return round2((form.dir.value === '-' ? -1 : 1) * Math.abs(v || 0));
      };
      const drawSplits = () => {
        if (!splitArea) return;
        form.categoryId.disabled = splits.length > 0;
        if (!splits.length) { splitArea.innerHTML = ''; return; }
        const left = round2(total() - sum(splits, (p) => p.amount));
        splitArea.innerHTML = `<div class="card" style="padding:12px;box-shadow:none"><div class="row between" style="margin-bottom:8px"><h3>Split transaction</h3>
          <span class="small ${Math.abs(left) > 0.004 ? 'neg' : 'pos'}">${Math.abs(left) > 0.004 ? `${money(left)} unassigned` : 'Fully allocated ✓'}</span></div>
          ${splits.map((p, i) => `<div class="split-row" data-i="${i}">
            <input type="text" data-f="merchant" value="${esc(p.merchant || '')}" placeholder="${esc(form.merchant.value || 'Merchant')}" aria-label="Split merchant">
            <select data-f="categoryId" aria-label="Split category">${categoryOptions(s, p.categoryId)}</select>
            <input type="text" inputmode="decimal" data-f="amount" value="${Math.abs(p.amount).toFixed(2)}" aria-label="Split amount">
            <button type="button" class="icon-btn" data-rm="${i}" aria-label="Remove split">✕</button></div>`).join('')}
          <div class="row"><button type="button" class="btn small" data-add-split>+ Add split</button>
          <button type="button" class="btn small ghost" data-unsplit>Remove all splits</button></div></div>`;
        splitArea.querySelectorAll('.split-row').forEach((row) => {
          const i = +row.dataset.i;
          row.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('change', () => {
            const f = inp.dataset.f;
            if (f === 'amount') splits[i].amount = round2(Math.sign(total() || -1) * Math.abs(parseAmount(inp.value) || 0));
            else splits[i][f] = inp.value;
            drawSplits();
          }));
        });
        splitArea.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { splits.splice(+b.dataset.rm, 1); if (splits.length === 1) splits = []; drawSplits(); }));
        splitArea.querySelector('[data-add-split]').addEventListener('click', () => {
          const rem = round2(total() - sum(splits, (p) => p.amount));
          splits.push({ id: uid('spl'), amount: rem, categoryId: UNCATEGORIZED, merchant: '' });
          drawSplits();
        });
        splitArea.querySelector('[data-unsplit]').addEventListener('click', () => { splits = []; drawSplits(); });
      };
      drawSplits();
      m.querySelector('[data-split]')?.addEventListener('click', () => {
        if (!splits.length) {
          const tot = total();
          const half = round2(tot / 2);
          splits = [
            { id: uid('spl'), amount: half, categoryId: form.categoryId.value || UNCATEGORIZED, merchant: '' },
            { id: uid('spl'), amount: round2(tot - half), categoryId: UNCATEGORIZED, merchant: '' },
          ];
        } else splits.push({ id: uid('spl'), amount: 0, categoryId: UNCATEGORIZED, merchant: '' });
        drawSplits();
      });
      m.querySelector('[data-rule]')?.addEventListener('click', () => {
        close();
        openRuleEditor({ conditions: { field: 'merchant', op: 'contains', value: t.merchant }, actions: { categoryId: t.categoryId }, name: `${t.merchant} rule` });
      });
      m.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!(await confirmDialog(`Delete this ${money(t.amount)} transaction from ${t.merchant}?`, { ok: 'Delete', danger: true }))) return;
        const snapshot = { ...t };
        update((st) => { st.transactions = st.transactions.filter((x) => x.id !== t.id); });
        close();
        toast('Transaction deleted', { action: 'Undo', onAction: () => update((st) => { st.transactions.push(snapshot); }) });
      });
      m.querySelector('[data-save]').addEventListener('click', () => {
        if (!form.reportValidity()) return;
        const d = formData(form);
        const amount = total();
        if (!amount) { form.amount.setCustomValidity('Enter an amount'); form.amount.reportValidity(); form.amount.setCustomValidity(''); return; }
        if (splits.length && Math.abs(round2(amount - sum(splits, (p) => p.amount))) > 0.004) {
          toast('Split amounts must add up to the transaction total.');
          return;
        }
        const tags = s.tags.filter((tg) => d[`tag_${tg.id}`]).map((tg) => tg.id);
        const fields = {
          merchant: d.merchant.trim(), date: d.date, amount, accountId: d.accountId, notes: d.notes.trim(), tags,
          reviewed: !!d.reviewed, hidden: !!d.hidden,
        };
        if (isNew) {
          const nt = prepareTransaction(getState(), { id: uid('txn'), originalDescription: fields.merchant, ...fields, categoryId: d.categoryId || null });
          if (d.categoryId) nt.categoryId = d.categoryId;
          update((st) => { st.transactions.push(nt); });
          toast(`Added ${money(amount)} · ${catLabel(getState(), nt.categoryId)}`);
          close();
          return;
        }
        const catChanged = !splits.length && d.categoryId && d.categoryId !== t.categoryId;
        update(() => {
          Object.assign(t, fields);
          if (splits.length) {
            t.splits = splits.map((p) => ({ ...p, merchant: p.merchant?.trim() || '' }));
            t.categoryId = t.splits[0].categoryId;
          } else {
            delete t.splits;
            if (d.categoryId) t.categoryId = d.categoryId;
          }
        });
        close();
        if (catChanged) {
          const cat = d.categoryId;
          t.categoryId = cat; // already set; re-run offer flow
          const key = merchantKey(t.merchant);
          const others = getState().transactions.filter((x) => x.id !== t.id && merchantKey(x.merchant) === key && x.categoryId !== cat && !x.splits?.length);
          if (others.length) {
            toast(`Update ${others.length} other ${t.merchant} transaction${others.length > 1 ? 's' : ''} too?`, {
              action: 'Apply & create rule', timeout: 8000,
              onAction: () => {
                update(() => others.forEach((o) => { o.categoryId = cat; }));
                openRuleEditor({ conditions: { field: 'merchant', op: 'contains', value: t.merchant }, actions: { categoryId: cat }, name: `${t.merchant} rule` });
              },
            });
          }
        }
      });
    },
  });
}

export { initials };
