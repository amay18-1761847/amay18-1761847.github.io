// RFC-4180-ish CSV parser plus header auto-detection for common bank,
// Mint and Monarch export formats.

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = text.replace(/^﻿/, '');
  const delim = sniffDelimiter(s);
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((x) => x.trim()));
}

function sniffDelimiter(s) {
  const line = s.split(/\r?\n/, 1)[0] || '';
  const counts = [',', ';', '\t', '|'].map((d) => [d, line.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 1 ? counts[0][0] : ',';
}

const PATTERNS = {
  date: /^(transaction |posted |posting |trans\.? )?date$|^date posted$/i,
  description: /^(description|name|payee|merchant|memo|details|transaction|original description|original statement)$/i,
  original: /^(original description|original statement|statement description|full description)$/i,
  amount: /^(amount|transaction amount|amt|value)( \(\w+\))?$/i,
  debit: /^(debit|withdrawal|withdrawals|money out|outflow|debit amount|charges?)$/i,
  credit: /^(credit|deposit|deposits|money in|inflow|credit amount|payments?)$/i,
  type: /^(transaction type|type|debit\/credit|cr\/dr)$/i,
  category: /^(category|categories)$/i,
  account: /^(account|account name)$/i,
  notes: /^(notes?|memo)$/i,
  tags: /^(tags|labels)$/i,
};

// Returns a mapping { field: columnIndex } guessed from headers.
export function guessMapping(headers) {
  const map = {};
  const used = new Set();
  const take = (field, idx) => { if (idx >= 0 && !used.has(idx) && map[field] == null) { map[field] = idx; used.add(idx); } };
  // Original description first so "Description" can claim the merchant slot.
  const order = ['date', 'original', 'amount', 'debit', 'credit', 'type', 'category', 'account', 'tags', 'description', 'notes'];
  for (const f of order) take(f, headers.findIndex((h, i) => !used.has(i) && PATTERNS[f].test(h.trim())));
  // "Merchant" beats "Description" when both exist (Monarch export).
  const merch = headers.findIndex((h) => /^merchant$/i.test(h.trim()));
  if (merch >= 0 && map.description !== merch) {
    if (map.description != null) used.delete(map.description);
    map.description = merch; used.add(merch);
  }
  return map;
}

// Heuristic: does the data look headerless (first row contains a date and a number)?
export function looksHeaderless(firstRow) {
  return firstRow.some((c) => /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(c)) && firstRow.some((c) => /^-?\(?\$?[\d,]+\.\d{2}\)?$/.test(c));
}

export function toCSV(rows) {
  return rows.map((r) => r.map((v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
}
