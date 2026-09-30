// Core finance logic: merchant cleanup, categorization, rules, reporting,
// budgets (incl. rollover + flex), balances / net worth, recurring detection, goals.
// Everything here is pure (takes state, returns data) and memoized by store revision.

import { getRev } from './store.js';
import { KEYWORDS, UNCATEGORIZED, isLiability } from './defaults.js';
import {
  addDays, addMonths, currentMonth, daysBetween, groupBy, median, monthEnd, monthKey, round2,
  sum, titleCase, today, byKey, monthRange, daysInMonth,
} from './util.js';

// ---------- memoization ----------
const memo = new Map();
function cached(key, fn) {
  const rev = getRev();
  const hit = memo.get(key);
  if (hit && hit.rev === rev) return hit.value;
  const value = fn();
  memo.set(key, { rev, value });
  if (memo.size > 400) memo.clear();
  return value;
}

// ---------- lookups ----------
export const catMap = (s) => cached('catMap', () => byKey(s.categories));
export const groupMap = (s) => cached('groupMap', () => byKey(s.categoryGroups));
export const acctMap = (s) => cached('acctMap', () => byKey(s.accounts));
export const tagMap = (s) => cached('tagMap', () => byKey(s.tags));
export const catType = (s, catId) => {
  const c = catMap(s)[catId];
  return c ? groupMap(s)[c.groupId]?.type || 'expense' : 'expense';
};
export const catLabel = (s, catId) => {
  const c = catMap(s)[catId];
  return c ? `${c.icon} ${c.name}` : '❓ Uncategorized';
};
export const sortedCategories = (s) => cached('sortedCats', () => {
  const groups = [...s.categoryGroups].sort((a, b) => a.order - b.order);
  return groups.map((g) => ({
    group: g,
    categories: s.categories.filter((c) => c.groupId === g.id).sort((a, b) => a.order - b.order),
  }));
});

// ---------- merchant cleanup ----------
// Well-known merchants whose statement strings are cryptic.
const ALIASES = [
  [/uber\s*\*?\s*eats/i, 'Uber Eats'], [/\buber\b/i, 'Uber'], [/\blyft\b/i, 'Lyft'],
  [/amzn|amazon/i, 'Amazon'], [/wholefds|whole foods/i, 'Whole Foods'], [/trader joe/i, "Trader Joe's"],
  [/netflix/i, 'Netflix'], [/spotify/i, 'Spotify'], [/hulu/i, 'Hulu'], [/apple\.com\/bill|itunes/i, 'Apple'],
  [/starbucks/i, 'Starbucks'], [/doordash/i, 'DoorDash'], [/grubhub/i, 'Grubhub'], [/instacart/i, 'Instacart'],
  [/\btarget\b/i, 'Target'], [/wal-?mart/i, 'Walmart'], [/costco/i, 'Costco'], [/home depot/i, 'Home Depot'],
  [/\bcvs\b/i, 'CVS'], [/walgreens/i, 'Walgreens'], [/chevron/i, 'Chevron'], [/\bshell (oil|service)\b/i, 'Shell'],
  [/airbnb/i, 'Airbnb'], [/comcast|xfinity/i, 'Comcast Xfinity'], [/t-mobile/i, 'T-Mobile'], [/chewy/i, 'Chewy'],
  [/pgande|pg&e/i, 'PG&E'], [/venmo/i, 'Venmo'], [/zelle/i, 'Zelle'], [/google \*?youtube/i, 'YouTube'],
];
const PREFIXES = [
  /^(purchase authorized on|purchase on|recurring payment authorized on)\s+\d{1,2}\/\d{1,2}\s*/i,
  /^(pos|debit|dbt|visa|ach|chk|checkcard|check card|purchase|recurring|pmnt|pmt|payment to|paid to|web|online|pre-?auth)\b[\s:*#-]*/i,
  /^(sq|tst|sp|py|pp|in|dd|bt|pay|paypal|ppl|gglpay|google|apple pay)\s?\*\s*/i,
];
const STATE = '(A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])';
const CITIES = ['san francisco', 'new york', 'los angeles', 'san diego', 'san jose', 'oakland', 'berkeley', 'seattle',
  'portland', 'chicago', 'austin', 'houston', 'dallas', 'boston', 'denver', 'atlanta', 'miami', 'phoenix', 'philadelphia',
  'brooklyn', 'washington', 'nashville', 'minneapolis', 'las vegas', 'sacramento', 'palo alto', 'mountain view',
  'sunnyvale', 'santa monica', 'cambridge', 'charlotte', 'detroit', 'baltimore', 'pittsburgh', 'orlando', 'tampa'];
const CITY_RE = new RegExp(`\\s+(${CITIES.join('|')})$`, 'i');

export function cleanMerchant(desc) {
  if (!desc) return 'Unknown';
  const original = String(desc).replace(/\s+/g, ' ').trim();
  for (const [re, name] of ALIASES) if (re.test(original)) return name;
  let s = original;
  for (let i = 0; i < 3; i++) for (const p of PREFIXES) s = s.replace(p, '');
  s = s
    .replace(/\s+(payroll|direct dep(osit)?|dir dep|ppd|ccd|ach (credit|debit|pmt)|web id)\b.*$/i, '') // ACH noise
    .replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?\b.*$/, '')        // trailing dates
    .replace(/\s+(#|no\.?|store|str)\s*\d+.*$/i, '')        // store numbers
    .replace(/\s+x{2,}\d+.*$/i, '')                        // masked card numbers
    .replace(/\s+\d{3}[-\d]{4,}.*$/, '')                   // phone numbers
    .replace(/\s+\d{3,}.*$/, '')                           // trailing reference ids
    .replace(new RegExp(`\\s+${STATE}$`), '')             // trailing state code
    .replace(CITY_RE, '')                                    // common city names
    .replace(/\.(com|net|org)\b/gi, '')
    .replace(/[*#]+/g, ' ')
    .replace(/\s+(inc|llc|co|corp|ltd)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) s = original;
  return s === s.toUpperCase() || s === s.toLowerCase() ? titleCase(s) : s;
}
export const merchantKey = (m) => String(m || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// ---------- rules ----------
// rule: { id, name, enabled, conditions: { field:'merchant'|'description', op:'contains'|'equals'|'starts',
//          value, amountOp:'any'|'gt'|'lt'|'eq'|'between', amount, amount2, direction:'any'|'debit'|'credit',
//          accountId }, actions: { categoryId, merchant, tagIds, hide, reviewed } }
export function ruleMatches(rule, t) {
  if (rule.enabled === false) return false;
  const c = rule.conditions || {};
  if (c.value) {
    const hay = (c.field === 'description' ? t.originalDescription || t.merchant : t.merchant || '').toLowerCase();
    const needle = c.value.toLowerCase();
    if (c.op === 'equals' && hay !== needle) return false;
    if (c.op === 'starts' && !hay.startsWith(needle)) return false;
    if ((!c.op || c.op === 'contains') && !hay.includes(needle)) return false;
  }
  if (c.accountId && t.accountId !== c.accountId) return false;
  if (c.direction === 'debit' && t.amount >= 0) return false;
  if (c.direction === 'credit' && t.amount <= 0) return false;
  const a = Math.abs(t.amount);
  const x = Number(c.amount), y = Number(c.amount2);
  if (c.amountOp === 'gt' && !(a > x)) return false;
  if (c.amountOp === 'lt' && !(a < x)) return false;
  if (c.amountOp === 'eq' && Math.abs(a - x) > 0.005) return false;
  if (c.amountOp === 'between' && !(a >= Math.min(x, y) && a <= Math.max(x, y))) return false;
  return true;
}

// Apply rules in priority order; the first rule to set a field wins.
export function applyRules(s, t) {
  const set = {};
  let matched = false;
  for (const r of s.rules) {
    if (!ruleMatches(r, t)) continue;
    matched = true;
    const a = r.actions || {};
    if (a.merchant && set.merchant == null) set.merchant = a.merchant;
    if (a.categoryId && set.categoryId == null) set.categoryId = a.categoryId;
    if (a.tagIds?.length) set.tagIds = [...new Set([...(set.tagIds || []), ...a.tagIds])];
    if (a.hide && set.hidden == null) set.hidden = true;
    if (a.reviewed && set.reviewed == null) set.reviewed = true;
  }
  if (!matched) return { matched, t };
  const out = { ...t };
  if (set.merchant) out.merchant = set.merchant;
  if (set.categoryId) out.categoryId = set.categoryId;
  if (set.tagIds) out.tags = [...new Set([...(t.tags || []), ...set.tagIds])];
  if (set.hidden) out.hidden = true;
  if (set.reviewed) out.reviewed = true;
  return { matched, t: out };
}

// ---------- auto-categorization ----------
// Learned: the category most often assigned to this merchant in your history.
export const merchantHistory = (s) => cached('merchantHistory', () => {
  const counts = new Map();
  for (const t of s.transactions) {
    if (!t.categoryId || t.categoryId === UNCATEGORIZED) continue;
    const k = merchantKey(t.merchant);
    if (!counts.has(k)) counts.set(k, new Map());
    const m = counts.get(k);
    m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1);
  }
  const best = new Map();
  for (const [k, m] of counts) best.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return best;
});

export function guessCategory(s, t) {
  const learned = merchantHistory(s).get(merchantKey(t.merchant));
  if (learned && catMap(s)[learned]) return learned;
  const text = `${t.merchant} ${t.originalDescription || ''}`.toLowerCase();
  for (const [re, cat] of KEYWORDS) if (re.test(text) && catMap(s)[cat]) return cat;
  if (t.amount > 0) return catMap(s).cat_other_income ? 'cat_other_income' : UNCATEGORIZED;
  return UNCATEGORIZED;
}

// Full pipeline for a freshly imported / created transaction.
export function prepareTransaction(s, t) {
  let out = { tags: [], notes: '', reviewed: false, hidden: false, ...t };
  if (!out.merchant) out.merchant = cleanMerchant(out.originalDescription);
  const r = applyRules(s, out);
  out = r.t;
  if (!out.categoryId) out.categoryId = guessCategory(s, out);
  return out;
}

// ---------- reporting rows ----------
// Expands split transactions into their parts and drops hidden ones.
export const reportingRows = (s) => cached('rows', () => {
  const rows = [];
  for (const t of s.transactions) {
    if (t.hidden) continue;
    if (t.splits?.length) {
      for (const p of t.splits) {
        rows.push({ ...t, ...p, id: t.id, splitId: p.id, merchant: p.merchant || t.merchant, amount: p.amount, categoryId: p.categoryId });
      }
    } else rows.push(t);
  }
  return rows;
});

export function rowsBetween(s, from, to) {
  return reportingRows(s).filter((r) => r.date >= from && r.date <= to);
}

export const isTransfer = (s, r) => catType(s, r.categoryId) === 'transfer';

// Income = rows in income categories; expenses = everything else except transfers
// (refunds in expense categories reduce spending, like Monarch).
export function summarize(s, rows) {
  let income = 0, expense = 0;
  for (const r of rows) {
    const type = catType(s, r.categoryId);
    if (type === 'transfer') continue;
    if (type === 'income') income += r.amount;
    else expense += -r.amount;
  }
  income = round2(income); expense = round2(expense);
  return { income, expense, net: round2(income - expense), savingsRate: income > 0 ? (income - expense) / income : 0 };
}

export const monthActuals = (s) => cached('monthActuals', () => {
  // { 'YYYY-MM': { catId: signedTotal } }
  const out = {};
  for (const r of reportingRows(s)) {
    const mk = monthKey(r.date);
    (out[mk] ||= {});
    out[mk][r.categoryId] = (out[mk][r.categoryId] || 0) + r.amount;
  }
  return out;
});

export function cashflowByMonth(s, months) {
  return months.map((mk) => {
    const rows = rowsBetween(s, `${mk}-01`, monthEnd(mk));
    return { month: mk, ...summarize(s, rows) };
  });
}

export function breakdown(s, rows, by = 'category', type = 'expense') {
  // Returns [{ key, label, amount, count }] sorted desc, amounts positive.
  const m = new Map();
  const cm = catMap(s), gm = groupMap(s);
  for (const r of rows) {
    const t = catType(s, r.categoryId);
    if (t !== type) continue;
    let key, label;
    if (by === 'category') { key = r.categoryId; label = catLabel(s, r.categoryId); }
    else if (by === 'group') { const g = gm[cm[r.categoryId]?.groupId]; key = g?.id || 'none'; label = g?.name || 'Other'; }
    else if (by === 'merchant') { key = merchantKey(r.merchant); label = r.merchant; }
    else if (by === 'account') { key = r.accountId; label = acctMap(s)[r.accountId]?.name || 'Unknown'; }
    else if (by === 'tag') {
      const tags = r.tags?.length ? r.tags : ['__none'];
      for (const tg of tags) {
        const lbl = tg === '__none' ? 'No tag' : tagMap(s)[tg]?.name || 'Unknown';
        const cur = m.get(tg) || { key: tg, label: lbl, amount: 0, count: 0 };
        cur.amount += type === 'income' ? r.amount : -r.amount; cur.count++;
        m.set(tg, cur);
      }
      continue;
    }
    const cur = m.get(key) || { key, label, amount: 0, count: 0 };
    cur.amount += type === 'income' ? r.amount : -r.amount;
    cur.count++;
    m.set(key, cur);
  }
  return [...m.values()].map((x) => ({ ...x, amount: round2(x.amount) })).filter((x) => Math.abs(x.amount) > 0.004)
    .sort((a, b) => b.amount - a.amount);
}

// ---------- balances & net worth ----------
// Cash/credit/loan accounts marked `derive` reconstruct balances from transactions
// relative to the nearest snapshot. Others (house, car, brokerage) use snapshots only.
const acctTxns = (s) => cached('acctTxns', () => {
  const m = groupBy(s.transactions, (t) => t.accountId);
  for (const arr of m.values()) arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return m;
});
const acctSnaps = (s) => cached('acctSnaps', () => {
  const m = groupBy(s.balanceHistory, (h) => h.accountId);
  for (const arr of m.values()) arr.sort((a, b) => (a.date < b.date ? -1 : 1));
  return m;
});

// Sum of balance effect of transactions with from < date <= to.
function txnEffect(s, acct, from, to) {
  const arr = acctTxns(s).get(acct.id) || [];
  const sign = isLiability(acct) ? -1 : 1;
  let total = 0;
  for (const t of arr) {
    if (t.date > from && t.date <= to) total += t.amount;
  }
  return sign * total;
}

export function balanceAt(s, acct, date) {
  return cached(`bal:${acct.id}:${date}`, () => {
    const snaps = acctSnaps(s).get(acct.id) || [];
    const txns = acctTxns(s).get(acct.id) || [];
    let before = null, after = null;
    for (const h of snaps) {
      if (h.date <= date) before = h; else { after = h; break; }
    }
    if (acct.derive) {
      if (before) return round2(before.balance + txnEffect(s, acct, before.date, date));
      if (after) {
        const first = txns[0]?.date;
        if (!first || date < addDays(first, -1)) return null;
        return round2(after.balance - txnEffect(s, acct, date, after.date));
      }
      return null;
    }
    return before ? before.balance : null;
  });
}

export const currentBalance = (s, acct) => balanceAt(s, acct, '9999-12-31') ?? 0;

// Signed contribution to net worth (liabilities negative).
export const netValue = (acct, bal) => (bal == null ? 0 : isLiability(acct) ? -bal : bal);

export function netWorthAt(s, date) {
  let assets = 0, liabilities = 0;
  for (const a of s.accounts) {
    if (a.excludeNetWorth) continue;
    if (a.closedAt && a.closedAt < date) continue;
    const b = balanceAt(s, a, date);
    if (b == null) continue;
    if (isLiability(a)) liabilities += b; else assets += b;
  }
  return { date, assets: round2(assets), liabilities: round2(liabilities), net: round2(assets - liabilities) };
}

export function netWorthSeries(s, fromDate, toDate = today()) {
  // Weekly points for ranges up to ~1y, monthly otherwise.
  const span = daysBetween(fromDate, toDate);
  const pts = [];
  if (span <= 400) {
    for (let d = fromDate; d < toDate; d = addDays(d, span <= 100 ? 1 : 7)) pts.push(d);
  } else {
    for (let mk = monthKey(fromDate); mk < monthKey(toDate); mk = addMonths(mk, 1)) pts.push(monthEnd(mk));
  }
  pts.push(toDate);
  return pts.map((d) => netWorthAt(s, d));
}

export function accountSeries(s, acct, fromDate, toDate = today()) {
  const pts = [];
  const step = daysBetween(fromDate, toDate) > 400 ? 30 : 7;
  for (let d = fromDate; d < toDate; d = addDays(d, step)) pts.push(d);
  pts.push(toDate);
  return pts.map((d) => ({ date: d, value: balanceAt(s, acct, d) }));
}

// ---------- budgets ----------
const budgetMonths = (s) => cached('budgetMonths', () => Object.keys(s.budgets).sort());

// A budget stays in effect until changed in a later month.
export function budgetFor(s, mk, key) {
  const months = budgetMonths(s);
  for (let i = months.length - 1; i >= 0; i--) {
    if (months[i] > mk) continue;
    const v = s.budgets[months[i]]?.[key];
    if (v != null) return Number(v);
  }
  return 0;
}

const spent = (s, mk, catId) => {
  const v = monthActuals(s)[mk]?.[catId] || 0;
  return catType(s, catId) === 'income' ? v : -v;
};

export function rolloverIn(s, cat, mk) {
  if (!cat.rollover || !cat.rolloverStart || cat.rolloverStart >= mk) return 0;
  return cached(`roll:${cat.id}:${mk}`, () => {
    let carry = Number(cat.rolloverStartBalance) || 0;
    for (let m = cat.rolloverStart; m < mk; m = addMonths(m, 1)) carry += budgetFor(s, m, cat.id) - spent(s, m, cat.id);
    return round2(carry);
  });
}

export function budgetMonth(s, mk) {
  return cached(`budget:${mk}`, () => {
    const flex = s.settings.budgetMode === 'flex';
    const sections = [];
    let totals = { incomeBudget: 0, incomeActual: 0, expenseBudget: 0, expenseActual: 0 };
    for (const { group, categories } of sortedCategories(s)) {
      if (group.type === 'transfer') continue;
      const rows = categories.filter((c) => !c.hideFromBudget).map((c) => {
        const budget = budgetFor(s, mk, c.id);
        const actual = round2(spent(s, mk, c.id));
        const roll = rolloverIn(s, c, mk);
        return { cat: c, budget, actual, rollover: roll, remaining: round2(budget + roll - actual) };
      });
      const b = sum(rows, (r) => r.budget), a = sum(rows, (r) => r.actual);
      if (group.type === 'income') { totals.incomeBudget += b; totals.incomeActual += a; }
      else if (!flex) { totals.expenseBudget += b; totals.expenseActual += a; }
      sections.push({ group, rows, budget: round2(b), actual: round2(a), remaining: round2(sum(rows, (r) => r.remaining)) });
    }
    let flexData = null;
    if (flex) {
      const byFlex = { fixed: [], flexible: [], non_monthly: [] };
      for (const sec of sections) {
        if (sec.group.type !== 'expense') continue;
        for (const r of sec.rows) byFlex[r.cat.flex || 'flexible'].push({ ...r, group: sec.group });
      }
      // Until a flexible pool is set, it defaults to the sum of the flexible categories' own budgets.
      const flexSet = budgetMonths(s).some((m) => m <= mk && s.budgets[m]?.__flex != null);
      const flexBudget = flexSet ? budgetFor(s, mk, '__flex') : null;
      const mk_ = (rows, budget) => {
        const b = budget ?? sum(rows, (r) => r.budget);
        const a = sum(rows, (r) => r.actual);
        const roll = budget == null ? sum(rows, (r) => r.rollover) : 0;
        return { rows, budget: round2(b), actual: round2(a), remaining: round2(b + roll - a) };
      };
      flexData = { fixed: mk_(byFlex.fixed), flexible: mk_(byFlex.flexible, flexBudget), non_monthly: mk_(byFlex.non_monthly) };
      totals.expenseBudget = flexData.fixed.budget + flexData.flexible.budget + flexData.non_monthly.budget;
      totals.expenseActual = flexData.fixed.actual + flexData.flexible.actual + flexData.non_monthly.actual;
    }
    for (const k in totals) totals[k] = round2(totals[k]);
    return { month: mk, sections, totals, flex: flexData };
  });
}

// Average monthly spend per category over the last n complete months (for budget suggestions).
export function averageSpend(s, catId, n = 3, before = currentMonth()) {
  const months = monthRange(addMonths(before, -n), addMonths(before, -1));
  return round2(sum(months, (m) => spent(s, m, catId)) / n);
}

// Share of the month elapsed (for pacing bars).
export function monthProgress(mk) {
  const cm = currentMonth();
  if (mk < cm) return 1;
  if (mk > cm) return 0;
  return Number(today().slice(8)) / daysInMonth(mk);
}

// ---------- recurring detection ----------
const FREQS = [
  ['weekly', 7, 2], ['biweekly', 14, 3], ['semimonthly', 15, 2], ['monthly', 30.4, 4],
  ['quarterly', 91, 10], ['semiannual', 182, 15], ['yearly', 365, 20],
];
export const FREQ_LABEL = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Monthly',
  quarterly: 'Quarterly', semiannual: 'Every 6 months', yearly: 'Yearly',
};
export function advance(date, freq, dir = 1) {
  switch (freq) {
    case 'weekly': return addDays(date, 7 * dir);
    case 'biweekly': return addDays(date, 14 * dir);
    case 'semimonthly': return addDays(date, 15 * dir);
    case 'quarterly': return addMonths(date, 3 * dir);
    case 'semiannual': return addMonths(date, 6 * dir);
    case 'yearly': return addMonths(date, 12 * dir);
    default: return addMonths(date, dir);
  }
}
export const monthlyEquivalent = (amount, freq) => amount * ({
  weekly: 52 / 12, biweekly: 26 / 12, semimonthly: 2, monthly: 1, quarterly: 1 / 3, semiannual: 1 / 6, yearly: 1 / 12,
}[freq] || 1);

export function detectRecurring(s) {
  return cached('detectRecurring', () => {
    const known = new Set([...s.recurring.map((r) => r.merchantKey), ...s.dismissedRecurring]);
    const rows = s.transactions.filter((t) => !t.hidden && !isTransfer(s, t));
    const groups = groupBy(rows, (t) => merchantKey(t.merchant) + (t.amount > 0 ? '+' : '-'));
    const out = [];
    for (const [k, txns] of groups) {
      const mkey = k.slice(0, -1);
      if (known.has(mkey) || txns.length < 3) continue;
      txns.sort((a, b) => (a.date < b.date ? -1 : 1));
      const intervals = [];
      for (let i = 1; i < txns.length; i++) intervals.push(daysBetween(txns[i - 1].date, txns[i].date));
      const med = median(intervals);
      const f = FREQS.find(([, d, tol]) => Math.abs(med - d) <= tol);
      if (!f) continue;
      const [freq, d, tol] = f;
      const regular = intervals.filter((x) => Math.abs(x - d) <= tol * 1.5).length / intervals.length;
      const amts = txns.map((t) => Math.abs(t.amount));
      const mAmt = median(amts);
      const stable = amts.filter((a) => Math.abs(a - mAmt) <= Math.max(1, mAmt * 0.2)).length / amts.length;
      if (regular < 0.7 || stable < 0.6) continue;
      const last = txns[txns.length - 1];
      // Stale if we've missed more than two cycles.
      if (daysBetween(last.date, today()) > d * 2 + tol * 2) continue;
      out.push({
        merchantKey: mkey, merchant: last.merchant, amount: round2(Math.sign(last.amount) * mAmt), frequency: freq,
        lastDate: last.date, nextDate: advance(last.date, freq), categoryId: last.categoryId, accountId: last.accountId,
        count: txns.length, confidence: round2((regular + stable) / 2), variable: stable < 0.95,
      });
    }
    return out.sort((a, b) => b.confidence - a.confidence || Math.abs(b.amount) - Math.abs(a.amount));
  });
}

// Next occurrences of confirmed recurring items within [from, to].
export function upcoming(s, from, to) {
  const out = [];
  for (const r of s.recurring) {
    if (r.active === false) continue;
    let d = r.nextDate || r.lastDate;
    if (!d) continue;
    // Step back to the window start (for past months), then forward into it.
    let guard = 0;
    while (d > from && guard++ < 500) {
      const prev = advance(d, r.frequency, -1);
      if (prev < from) break;
      d = prev;
    }
    while (d < from && guard++ < 1000) d = advance(d, r.frequency);
    while (d <= to && guard++ < 1000) {
      const paid = findPosted(s, r, d);
      out.push({ ...r, date: d, paid: !!paid, paidTxn: paid });
      d = advance(d, r.frequency);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// A recurring item counts as paid if a txn from that merchant posted within a few days of its due date.
export function findPosted(s, r, due) {
  const win = r.frequency === 'weekly' ? 3 : 6;
  return s.transactions.find((t) => merchantKey(t.merchant) === r.merchantKey
    && Math.abs(daysBetween(t.date, due)) <= win && Math.sign(t.amount) === Math.sign(r.amount)) || null;
}

// Keep each recurring item's lastDate / nextDate in step with posted transactions.
export function refreshRecurring(s) {
  for (const r of s.recurring) {
    const posted = s.transactions.filter((t) => merchantKey(t.merchant) === r.merchantKey && Math.sign(t.amount) === Math.sign(r.amount));
    if (!posted.length) continue;
    const last = posted.reduce((a, b) => (a.date > b.date ? a : b));
    if (!r.lastDate || last.date > r.lastDate) {
      r.lastDate = last.date;
      r.nextDate = advance(last.date, r.frequency);
    }
  }
}

// ---------- goals ----------
export function goalProgress(s, g) {
  let current;
  if (g.accountId) {
    const a = acctMap(s)[g.accountId];
    current = a ? currentBalance(s, a) : 0;
  } else {
    current = (Number(g.startingAmount) || 0) + sum(g.contributions || [], (c) => c.amount);
  }
  current = round2(current);
  const target = Number(g.target) || 0;
  const remaining = Math.max(0, round2(target - current));
  let monthsLeft = null, monthlyNeeded = null, onTrack = null;
  if (g.targetDate) {
    monthsLeft = Math.max(0, (Number(g.targetDate.slice(0, 4)) - Number(today().slice(0, 4))) * 12
      + Number(g.targetDate.slice(5, 7)) - Number(today().slice(5, 7)));
    monthlyNeeded = monthsLeft > 0 ? round2(remaining / monthsLeft) : remaining;
    if (g.monthlyContribution) onTrack = Number(g.monthlyContribution) >= monthlyNeeded - 0.01;
  }
  let projected = null;
  if (g.monthlyContribution > 0 && remaining > 0) projected = addMonths(currentMonth(), Math.ceil(remaining / g.monthlyContribution));
  return { current, target, remaining, pct: target > 0 ? Math.min(1, current / target) : 0, monthsLeft, monthlyNeeded, onTrack, projected };
}

// ---------- investments ----------
export function holdingsSummary(s, accountId = null) {
  const hs = s.holdings.filter((h) => !accountId || h.accountId === accountId);
  const rows = hs.map((h) => {
    const value = round2((Number(h.shares) || 0) * (Number(h.price) || 0));
    const cost = round2(Number(h.costBasis) || 0);
    return { ...h, value, cost, gain: round2(value - cost), gainPct: cost > 0 ? (value - cost) / cost : 0 };
  });
  const value = sum(rows, (r) => r.value), cost = sum(rows, (r) => r.cost);
  const byClass = [...groupBy(rows, (r) => r.assetClass || 'Other')]
    .map(([k, v]) => ({ key: k, label: k, amount: round2(sum(v, (x) => x.value)) }))
    .sort((a, b) => b.amount - a.amount);
  return { rows: rows.sort((a, b) => b.value - a.value), value: round2(value), cost: round2(cost), gain: round2(value - cost), byClass };
}

// ---------- duplicate detection for imports ----------
export function dupKey(t) {
  return `${t.accountId}|${t.date}|${round2(t.amount)}|${merchantKey(t.originalDescription || t.merchant)}`;
}
