// CSV import wizard: upload → map columns → preview → import (with dedupe,
// merchant cleanup, rules and auto-categorization). Understands bank exports,
// Mint exports and Monarch exports.

import { getState, update } from '../store.js';
import { esc, money, parseDateLoose, parseAmount, uid, round2, today, addDays, fmtDate } from '../util.js';
import { parseCSV, guessMapping, looksHeaderless } from '../csv.js';
import { cleanMerchant, prepareTransaction, dupKey, catLabel, refreshRecurring, applyRules } from '../engine.js';
import { openModal, accountOptions, toast } from '../ui.js';
import { TAG_COLORS, slug } from '../defaults.js';

const FIELDS = [
  ['date', 'Date', true], ['description', 'Merchant / description', true], ['amount', 'Amount'], ['debit', 'Debit (money out)'],
  ['credit', 'Credit (money in)'], ['type', 'Debit/credit type'], ['original', 'Original statement'], ['category', 'Category'],
  ['account', 'Account name'], ['notes', 'Notes'], ['tags', 'Tags'],
];

export function openImport(accountId = null) {
  const s = getState();
  let rows = null, headers = [], map = {}, hasHeader = true;
  openModal({
    title: 'Import transactions from CSV', wide: true,
    body: `<div id="imp-step1" class="stack">
        <p class="ink2">Download a CSV from your bank’s website (usually under Statements or Activity → Export), or export from Mint or Monarch. Everything is processed in your browser.</p>
        <label class="field">CSV file<input type="file" id="imp-file" accept=".csv,text/csv,.txt"></label>
        <details><summary class="small ink2" style="cursor:pointer">…or paste CSV text</summary><textarea id="imp-paste" rows="6" placeholder="Date,Description,Amount&#10;2026-09-01,STARBUCKS #123,-5.25" style="margin-top:8px"></textarea>
          <button class="btn small" id="imp-parse" type="button" style="margin-top:6px">Use pasted text</button></details>
      </div>
      <div id="imp-step2" class="stack hidden"></div>`,
    footer: '<span class="left muted small" id="imp-status"></span><button class="btn" data-close>Cancel</button><button class="btn primary hidden" id="imp-go">Import</button>',
    onMount: (m, close) => {
      const load = (text) => {
        rows = parseCSV(text);
        if (!rows.length) { toast('That file looks empty.'); return; }
        hasHeader = !looksHeaderless(rows[0]);
        headers = hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`);
        map = hasHeader ? guessMapping(headers) : guessHeaderless(rows[0]);
        m.querySelector('#imp-step1').classList.add('hidden');
        m.querySelector('#imp-step2').classList.remove('hidden');
        m.querySelector('#imp-go').classList.remove('hidden');
        drawMapping();
      };
      m.querySelector('#imp-file').addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => load(String(rd.result));
        rd.readAsText(f);
      });
      m.querySelector('#imp-parse').addEventListener('click', () => load(m.querySelector('#imp-paste').value));

      const colSelect = (field) => `<select data-map="${field}"><option value="">—</option>${headers.map((h, i) => `<option value="${i}" ${map[field] === i ? 'selected' : ''}>${esc(h || `Column ${i + 1}`)}</option>`).join('')}</select>`;
      const opts = { accountId: accountId || '', dateOrder: s.settings.dateOrder || 'MDY', flip: false, skipDup: true, createCats: false };

      function drawMapping() {
        const step = m.querySelector('#imp-step2');
        step.innerHTML = `<div class="row between"><b>${rows.length - (hasHeader ? 1 : 0)} rows found</b><label class="check small"><input type="checkbox" id="imp-hdr" ${hasHeader ? 'checked' : ''}> First row is a header</label></div>
          <div class="map-grid">${FIELDS.map(([f, label, req]) => `<label class="field">${esc(label)}${req ? ' *' : ''}${colSelect(f)}</label>`).join('')}</div>
          <div class="form-grid">
            <label class="field">Import into account<select id="imp-acct">${map.account != null ? '<option value="">Use the Account column (create if new)</option>' : ''}${accountOptions(s, opts.accountId, { includeEmpty: map.account == null && !s.accounts.length, emptyLabel: 'Create a new account…' })}${s.accounts.length ? '<option value="__new">Create a new account…</option>' : ''}</select></label>
            <label class="field">Date format<select id="imp-order"><option value="MDY" ${opts.dateOrder === 'MDY' ? 'selected' : ''}>Month/Day/Year</option><option value="DMY" ${opts.dateOrder === 'DMY' ? 'selected' : ''}>Day/Month/Year</option></select></label>
            <label class="field full hidden" id="imp-newname">New account name<input type="text" id="imp-newacct" placeholder="e.g. Chase Checking"></label>
            <label class="check"><input type="checkbox" id="imp-flip" ${opts.flip ? 'checked' : ''}> Expenses are positive numbers in this file (flip signs)</label>
            <label class="check"><input type="checkbox" id="imp-dup" ${opts.skipDup ? 'checked' : ''}> Skip duplicates already imported</label>
            ${map.category != null ? `<label class="check full"><input type="checkbox" id="imp-cats" ${opts.createCats ? 'checked' : ''}> Create categories from the file that don't exist yet (otherwise auto-categorize them)</label>` : ''}
          </div>
          <div><h3 style="margin-bottom:6px">Preview</h3><div class="table-scroll" id="imp-preview"></div></div>`;
        step.querySelectorAll('[data-map]').forEach((sel) => sel.addEventListener('change', () => {
          map[sel.dataset.map] = sel.value === '' ? undefined : Number(sel.value);
          drawMapping();
        }));
        step.querySelector('#imp-hdr').addEventListener('change', (e) => {
          hasHeader = e.target.checked;
          headers = hasHeader ? rows[0] : rows[0].map((_, i) => `Column ${i + 1}`);
          map = hasHeader ? guessMapping(headers) : guessHeaderless(rows[0]);
          drawMapping();
        });
        const acctSel = step.querySelector('#imp-acct');
        const syncNew = () => step.querySelector('#imp-newname').classList.toggle('hidden', !(acctSel.value === '__new' || (acctSel.value === '' && map.account == null)));
        acctSel.addEventListener('change', () => { opts.accountId = acctSel.value; syncNew(); drawPreview(); });
        syncNew();
        step.querySelector('#imp-order').addEventListener('change', (e) => { opts.dateOrder = e.target.value; drawPreview(); });
        step.querySelector('#imp-flip').addEventListener('change', (e) => { opts.flip = e.target.checked; drawPreview(); });
        step.querySelector('#imp-dup').addEventListener('change', (e) => { opts.skipDup = e.target.checked; drawPreview(); });
        step.querySelector('#imp-cats')?.addEventListener('change', (e) => { opts.createCats = e.target.checked; });
        opts.accountId = acctSel.value;
        drawPreview();
      }

      function parsed() {
        const data = hasHeader ? rows.slice(1) : rows;
        const out = [], errors = [];
        data.forEach((r, i) => {
          const get = (f) => (map[f] != null ? r[map[f]] ?? '' : '');
          const date = parseDateLoose(get('date'), opts.dateOrder);
          let amount;
          if (map.amount != null) {
            amount = parseAmount(get('amount'));
            const type = get('type').toLowerCase();
            if (map.type != null && !isNaN(amount)) amount = /debit|dr|withdraw|out/.test(type) ? -Math.abs(amount) : /credit|cr|deposit|in/.test(type) ? Math.abs(amount) : amount;
          } else {
            const dr = parseAmount(get('debit')), cr = parseAmount(get('credit'));
            amount = (isNaN(cr) ? 0 : Math.abs(cr)) - (isNaN(dr) ? 0 : Math.abs(dr));
            if (isNaN(dr) && isNaN(cr)) amount = NaN;
          }
          if (opts.flip && !isNaN(amount)) amount = -amount;
          const desc = get('description') || get('original');
          if (!date || isNaN(amount) || !desc) { errors.push(i + (hasHeader ? 2 : 1)); return; }
          out.push({
            date, amount: round2(amount), desc, original: get('original') || desc, category: get('category'),
            account: get('account'), notes: get('notes'), tags: get('tags'),
          });
        });
        return { out, errors };
      }

      function drawPreview() {
        const { out, errors } = parsed();
        const st = getState();
        const sample = out.slice(0, 8).map((p) => {
          const merchant = p.desc === p.original ? cleanMerchant(p.desc) : p.desc;
          const t = prepareTransaction(st, { merchant, originalDescription: p.original, amount: p.amount, date: p.date, accountId: opts.accountId });
          const cat = matchCategory(st, p.category) || t.categoryId;
          return `<tr><td class="nowrap">${esc(fmtDate(p.date, true))}</td><td>${esc(t.merchant)}<div class="muted tiny">${esc(p.original)}</div></td><td>${esc(catLabel(st, cat))}</td><td class="amt ${p.amount > 0 ? 'pos' : ''}">${money(p.amount)}</td></tr>`;
        }).join('');
        m.querySelector('#imp-preview').innerHTML = `<table class="data preview-table"><thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th class="amt">Amount</th></tr></thead><tbody>${sample || '<tr><td colspan="4" class="muted">Map the Date, Description and Amount columns to see a preview.</td></tr>'}</tbody></table>`;
        const inflow = out.filter((x) => x.amount > 0).length;
        m.querySelector('#imp-status').textContent = `${out.length} valid${errors.length ? ` · ${errors.length} skipped (rows ${errors.slice(0, 5).join(', ')}${errors.length > 5 ? '…' : ''})` : ''}${out.length && inflow / out.length > 0.7 ? ' · Most amounts are positive — flip signs?' : ''}`;
      }

      m.querySelector('#imp-go').addEventListener('click', () => {
        const { out } = parsed();
        if (!out.length) { toast('No valid rows to import. Check the column mapping.'); return; }
        const newName = m.querySelector('#imp-newacct')?.value.trim();
        const useCol = opts.accountId === '' && map.account != null;
        const makeNew = opts.accountId === '__new' || (opts.accountId === '' && map.account == null);
        if (makeNew && !newName) { toast('Name the new account.'); m.querySelector('#imp-newacct').focus(); return; }
        let added = 0, dups = 0, created = 0;
        update((st) => {
          const byName = new Map(st.accounts.map((a) => [a.name.toLowerCase(), a]));
          const newAccount = (name) => {
            const a = { id: uid('acct'), name, type: /card|credit|visa|amex|mastercard/i.test(name) ? 'credit' : /saving/i.test(name) ? 'savings' : 'checking', institution: '', derive: true, createdAt: today() };
            st.accounts.push(a); byName.set(name.toLowerCase(), a); created++;
            return a;
          };
          let fixed = null;
          if (makeNew) fixed = newAccount(newName);
          else if (!useCol) fixed = st.accounts.find((a) => a.id === opts.accountId);
          const existing = new Set(st.transactions.map(dupKey));
          const tagByName = new Map(st.tags.map((t) => [t.name.toLowerCase(), t]));
          const batch = [];
          for (const p of out) {
            const acct = fixed || byName.get((p.account || 'Imported').toLowerCase()) || newAccount(p.account || 'Imported');
            const merchant = p.desc === p.original ? cleanMerchant(p.desc) : p.desc;
            let t = { id: uid('txn'), date: p.date, accountId: acct.id, merchant, originalDescription: p.original, amount: p.amount, notes: p.notes || '', tags: [], reviewed: false, hidden: false };
            if (opts.skipDup && existing.has(dupKey(t))) { dups++; continue; }
            existing.add(dupKey(t));
            if (p.tags) {
              t.tags = p.tags.split(/[,;|]/).map((x) => x.trim()).filter(Boolean).map((name) => {
                let tg = tagByName.get(name.toLowerCase());
                if (!tg) { tg = { id: uid('tag'), name, color: TAG_COLORS[st.tags.length % TAG_COLORS.length] }; st.tags.push(tg); tagByName.set(name.toLowerCase(), tg); }
                return tg.id;
              });
            }
            let cat = matchCategory(st, p.category);
            if (!cat && p.category && opts.createCats) cat = createCategory(st, p.category, p.amount);
            if (cat) { t.categoryId = cat; t = applyRules(st, t).t; } else t = prepareTransaction(st, t);
            batch.push(t);
            added++;
          }
          st.transactions.push(...batch);
          // New derived accounts: anchor an opening balance of 0 so the balance equals the imported history.
          for (const a of st.accounts) {
            if (!a.derive || st.balanceHistory.some((h) => h.accountId === a.id)) continue;
            const first = batch.filter((t) => t.accountId === a.id).map((t) => t.date).sort()[0];
            if (first) st.balanceHistory.push({ accountId: a.id, date: addDays(first, -1), balance: 0 });
          }
          st.settings.dateOrder = opts.dateOrder;
          refreshRecurring(st);
        });
        close();
        toast(`Imported ${added} transaction${added === 1 ? '' : 's'}${dups ? ` · skipped ${dups} duplicate${dups === 1 ? '' : 's'}` : ''}${created ? ` · created ${created} account${created === 1 ? '' : 's'}` : ''}`, { timeout: 7000 });
        if (created) toast('New accounts start from a $0 opening balance — set the real balance on the account page.', { timeout: 9000 });
      });
    },
  });
}

function guessHeaderless(first) {
  const map = {};
  first.forEach((c, i) => {
    if (map.date == null && /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(c)) map.date = i;
    else if (map.amount == null && /^-?\(?\$?[\d,]+\.\d{2}\)?$/.test(c)) map.amount = i;
    else if (map.description == null && /[a-z]/i.test(c)) map.description = i;
  });
  return map;
}

// Common Mint / Monarch / bank category names mapped onto our defaults.
const CAT_ALIASES = {
  'restaurants': 'cat_restaurants_and_bars', 'fast food': 'cat_restaurants_and_bars', 'food & dining': 'cat_restaurants_and_bars', 'dining': 'cat_restaurants_and_bars',
  'alcohol & bars': 'cat_restaurants_and_bars', 'gas & fuel': 'cat_gas', 'gasoline': 'cat_gas', 'fuel': 'cat_gas', 'coffee': 'cat_coffee_shops',
  'paycheck': 'cat_paychecks', 'income': 'cat_other_income', 'salary': 'cat_paychecks', 'utilities': 'cat_gas_and_electric',
  'mobile phone': 'cat_phone', 'television': 'cat_internet_and_cable', 'internet': 'cat_internet_and_cable', 'ride share': 'cat_taxi_and_ride_shares',
  'auto insurance': 'cat_insurance', 'health insurance': 'cat_insurance', 'life insurance': 'cat_insurance', 'doctor': 'cat_medical',
  'pharmacy': 'cat_medical', 'gym': 'cat_fitness', 'movies & dvds': 'cat_entertainment_and_recreation', 'entertainment': 'cat_entertainment_and_recreation',
  'music': 'cat_subscriptions', 'books': 'cat_shopping', 'hair': 'cat_personal', 'pet food & supplies': 'cat_pets', 'vacation': 'cat_travel_and_vacation',
  'air travel': 'cat_travel_and_vacation', 'hotel': 'cat_travel_and_vacation', 'rental car & taxi': 'cat_taxi_and_ride_shares', 'transfer': 'cat_transfer',
  'credit card payment': 'cat_credit_card_payment', 'atm fee': 'cat_financial_fees', 'bank fee': 'cat_financial_fees', 'service fee': 'cat_financial_fees',
  'federal tax': 'cat_taxes', 'state tax': 'cat_taxes', 'home improvement': 'cat_home_improvement', 'mortgage & rent': 'cat_mortgage',
  'charity': 'cat_charity', 'gift': 'cat_gifts', 'uncategorized': 'cat_uncategorized', 'cash & atm': 'cat_cash_and_atm', 'interest income': 'cat_interest',
};

function matchCategory(s, name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  const exact = s.categories.find((c) => c.name.toLowerCase() === n);
  if (exact) return exact.id;
  const alias = CAT_ALIASES[n];
  if (alias && s.categories.some((c) => c.id === alias)) return alias;
  return null;
}

function createCategory(s, name, amount) {
  const group = amount > 0 ? s.categoryGroups.find((g) => g.type === 'income') : s.categoryGroups.find((g) => g.id === 'grp_other') || s.categoryGroups.find((g) => g.type === 'expense');
  let id = 'cat_' + slug(name);
  if (s.categories.some((c) => c.id === id)) id += '_' + uid('').slice(-4);
  s.categories.push({ id, groupId: group.id, name: name.trim(), icon: '🏷️', flex: 'flexible', order: 99, rollover: false });
  return id;
}
