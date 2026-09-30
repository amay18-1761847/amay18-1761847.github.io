// Persistent app state. Everything lives in one JSON document in localStorage,
// with export/import for backups. Views subscribe to changes and re-render.

import { defaultCategories } from './defaults.js';
import { setCurrency } from './util.js';

const KEY = 'ledgerly.v1';
export const SCHEMA_VERSION = 1;

export function emptyState() {
  const { groups, categories } = defaultCategories();
  return {
    version: SCHEMA_VERSION,
    settings: { currency: 'USD', budgetMode: 'category', dateOrder: 'MDY', theme: 'system' },
    accounts: [],
    balanceHistory: [], // { accountId, date, balance }
    categoryGroups: groups,
    categories,
    transactions: [],
    tags: [],
    rules: [],
    budgets: {}, // { 'YYYY-MM': { [categoryId|'__flex']: amount } }
    recurring: [],
    dismissedRecurring: [], // merchant keys the user rejected
    goals: [],
    holdings: [],
  };
}

let state = load();
let rev = 0; // bumps on every change; used to memoize derived data
const listeners = new Set();
let saveError = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return emptyState();
}

function migrate(s) {
  const base = emptyState();
  const out = { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) } };
  for (const k of Object.keys(base)) if (out[k] == null) out[k] = base[k];
  out.version = SCHEMA_VERSION;
  return out;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = null;
  } catch (e) {
    saveError = e;
    console.error('Save failed', e);
  }
}

export const getState = () => state;
export const getRev = () => rev;
export const getSaveError = () => saveError;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Mutate state via a function, then persist and notify.
export function update(fn) {
  fn(state);
  rev++;
  setCurrency(state.settings.currency);
  persist();
  listeners.forEach((l) => l(state));
}

export function replaceState(next) {
  state = migrate(next);
  update(() => {});
}

export function resetState() {
  state = emptyState();
  update(() => {});
}

export function exportJSON() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: 'Ledgerly' }, null, 2);
}

setCurrency(state.settings.currency);
