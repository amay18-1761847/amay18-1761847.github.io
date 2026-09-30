// Shared UI pieces: modal dialogs, toasts, confirm, select builders.

import { esc, html, raw } from './util.js';
import { sortedCategories } from './engine.js';
import { ACCOUNT_TYPES, ACCOUNT_GROUP_ORDER } from './defaults.js';

// ---------- modal ----------
let modalStack = [];
export function openModal({ title, body, footer = '', wide = false, onMount, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></header>
    <div class="modal-body">${body}</div>
    ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
  </div>`;
  document.body.appendChild(wrap);
  const close = () => {
    wrap.remove();
    modalStack = modalStack.filter((m) => m !== close);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === close) close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  modalStack.push(close);
  const modal = wrap.querySelector('.modal');
  onMount?.(modal, close);
  const first = modal.querySelector('input:not([type=hidden]):not([type=checkbox]), select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return { el: modal, close };
}

export function confirmDialog(message, { title = 'Are you sure?', ok = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    openModal({
      title,
      body: `<p>${esc(message)}</p>`,
      footer: `<button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>`,
      onMount: (m, close) => m.querySelector('[data-ok]').addEventListener('click', () => { done = true; close(); resolve(true); }),
      onClose: () => { if (!done) resolve(false); },
    });
  });
}

// ---------- toast ----------
export function toast(message, { action, onAction, timeout = 4000 } = {}) {
  let host = document.getElementById('toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(message)}</span>${action ? `<button class="link">${esc(action)}</button>` : ''}`;
  host.appendChild(t);
  const kill = () => t.remove();
  if (action) t.querySelector('button').addEventListener('click', () => { onAction?.(); kill(); });
  setTimeout(kill, timeout);
}

// ---------- form helpers ----------
export function formData(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.multiple) out[el.name] = [...el.selectedOptions].map((o) => o.value);
    else out[el.name] = el.value;
  });
  return out;
}

export function categoryOptions(s, selected, { includeEmpty = false, emptyLabel = 'Any category' } = {}) {
  let out = includeEmpty ? `<option value="">${esc(emptyLabel)}</option>` : '';
  for (const { group, categories } of sortedCategories(s)) {
    out += `<optgroup label="${esc(group.name)}">`;
    for (const c of categories) out += `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.icon + ' ' + c.name)}</option>`;
    out += '</optgroup>';
  }
  return out;
}

export function accountOptions(s, selected, { includeEmpty = false, emptyLabel = 'All accounts', filter } = {}) {
  let out = includeEmpty ? `<option value="">${esc(emptyLabel)}</option>` : '';
  const accts = s.accounts.filter((a) => !filter || filter(a));
  for (const g of ACCOUNT_GROUP_ORDER) {
    const inG = accts.filter((a) => ACCOUNT_TYPES[a.type]?.group === g);
    if (!inG.length) continue;
    out += `<optgroup label="${esc(g)}">`;
    for (const a of inG) out += `<option value="${a.id}"${a.id === selected ? ' selected' : ''}>${esc(a.name)}</option>`;
    out += '</optgroup>';
  }
  return out;
}

export function accountTypeOptions(selected) {
  return ACCOUNT_GROUP_ORDER.map((g) => {
    const types = Object.entries(ACCOUNT_TYPES).filter(([, v]) => v.group === g);
    return `<optgroup label="${esc(g)}">${types.map(([k, v]) => `<option value="${k}"${k === selected ? ' selected' : ''}>${esc(v.label)}</option>`).join('')}</optgroup>`;
  }).join('');
}

export const amountClass = (n) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');

export function progressBar(frac, { over = false, pace = null, label = '' } = {}) {
  const w = Math.max(0, Math.min(1, frac)) * 100;
  return html`<div class="progress${over ? ' over' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(w)}" aria-label="${label}">
    <div class="progress-fill" style="width:${w}%"></div>${pace != null && pace > 0 && pace < 1 ? raw(`<div class="progress-pace" style="left:${pace * 100}%" title="Today"></div>`) : ''}
  </div>`;
}

export const emptyState = (icon, title, text, action = '') => html`<div class="empty">
  <div class="empty-icon" aria-hidden="true">${icon}</div><h3>${title}</h3><p>${text}</p>${raw(action)}</div>`;
