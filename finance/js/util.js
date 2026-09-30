// Small shared helpers: ids, dates, money formatting, DOM building.

export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ---------- Dates (all dates are local 'YYYY-MM-DD' strings) ----------
const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISO(new Date());
export const parseISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const monthKey = (s) => s.slice(0, 7); // 'YYYY-MM'
export const currentMonth = () => monthKey(today());
export const addDays = (s, n) => {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const addMonths = (s, n) => {
  // Works for both 'YYYY-MM' and 'YYYY-MM-DD'; clamps day to month length.
  const isMonth = s.length === 7;
  const [y, m, dd] = (isMonth ? s + '-01' : s).split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(dd, last));
  const iso = toISO(target);
  return isMonth ? iso.slice(0, 7) : iso;
};
export const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
export const monthStart = (mk) => `${mk}-01`;
export const monthEnd = (mk) => {
  const [y, m] = mk.split('-').map(Number);
  return toISO(new Date(y, m, 0));
};
export const daysInMonth = (mk) => Number(monthEnd(mk).slice(8));
export const monthRange = (fromMk, toMk) => {
  const out = [];
  for (let m = fromMk; m <= toMk; m = addMonths(m, 1)) out.push(m);
  return out;
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtMonth = (mk, long = false) => {
  const [y, m] = mk.split('-').map(Number);
  return long
    ? new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
    : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
};
// Short axis label: 'Sep 30' within ~3 months spans, otherwise "Sep '25".
export const fmtAxisDate = (s, spanDays) => {
  const d = parseISO(s);
  return spanDays > 100
    ? `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
    : `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};
export const fmtDate = (s, withYear = false) => {
  if (!s) return '';
  const d = parseISO(s);
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', ...(withYear || d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
};

// Parse many common bank-export date formats into ISO.
export function parseDateLoose(raw, order = 'MDY') {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let [a, b, y] = [+m[1], +m[2], +m[3]];
    if (y < 100) y += y > 69 ? 1900 : 2000;
    let mo = a, d = b;
    if (order === 'DMY' || a > 12) { mo = b; d = a; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  const d = new Date(s);
  return isNaN(d) ? null : toISO(d);
}

// ---------- Money ----------
let currency = 'USD';
export const setCurrency = (c) => { currency = c || 'USD'; };
const fmtCache = new Map();
const nf = (digits) => {
  const k = currency + digits;
  if (!fmtCache.has(k)) {
    fmtCache.set(k, new Intl.NumberFormat(undefined, {
      style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
    }));
  }
  return fmtCache.get(k);
};
export const money = (n, { cents = true, sign = false } = {}) => {
  const v = Number(n) || 0;
  const s = nf(cents ? 2 : 0).format(Math.abs(v));
  if (v < 0) return '-' + s;
  return sign && v > 0 ? '+' + s : s;
};
export const moneyCompact = (n) => {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sym = nf(0).format(0).replace(/[\d.,\s]/g, '');
  let out;
  if (a >= 1e9) out = (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
  else if (a >= 1e6) out = (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  else if (a >= 1e4) out = (a / 1e3).toFixed(0) + 'K';
  else if (a >= 1e3) out = (a / 1e3).toFixed(1) + 'K';
  else out = a.toFixed(0);
  return (v < 0 ? '-' : '') + sym + out.replace('.0', '');
};
export const pct = (n, digits = 0) => `${(Number(n) * 100).toFixed(digits)}%`;
export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const parseAmount = (raw) => {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  s = s.replace(/[^0-9.\-]/g, '');
  let v = parseFloat(s);
  if (isNaN(v)) return NaN;
  return neg ? -Math.abs(v) : v;
};

// ---------- Collections ----------
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
export const groupBy = (arr, f) => {
  const m = new Map();
  for (const x of arr) {
    const k = f(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};
export const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
export const byKey = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));

// ---------- DOM ----------
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Tagged template that escapes interpolations unless wrapped with raw().
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((str, i) => {
    out += str;
    if (i < vals.length) {
      const v = vals[i];
      if (v instanceof Raw) out += v.s;
      else if (Array.isArray(v)) out += v.map((x) => (x instanceof Raw ? x.s : esc(x))).join('');
      else if (v === false || v == null) out += '';
      else out += esc(v);
    }
  });
  return raw(out);
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

export const titleCase = (s) =>
  s.toLowerCase().replace(/\b([a-z])([a-z']*)/g, (_, a, b) => a.toUpperCase() + b)
    .replace(/\b(Llc|Inc|Usa|Atm|Ach|Ups|Usps|Cvs|Bp|Tj|Hbo|Nyc|Aws|Ib)\b/g, (w) => w.toUpperCase());
