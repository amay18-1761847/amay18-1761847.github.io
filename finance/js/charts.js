// Dependency-free SVG charts: line/area, grouped columns, donut, sparkline.
// Colors come from CSS custom properties (--series-N) so light/dark both work.

import { esc, moneyCompact, money } from './util.js';

export const SERIES = (i) => `var(--series-${(i % 8) + 1})`;

// ---------- tooltip ----------
let tipEl;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'chart-tip';
    tipEl.setAttribute('role', 'tooltip');
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
export function showTip(html, x, y) {
  const t = tip();
  t.innerHTML = html;
  t.style.display = 'block';
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y - r.height - 10;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top < 8) top = y + 16;
  t.style.left = `${Math.max(8, left)}px`;
  t.style.top = `${top}px`;
}
export const hideTip = () => { if (tipEl) tipEl.style.display = 'none'; };

const tipRow = (color, label, value) =>
  `<div class="tip-row"><span class="tip-key" style="background:${color}"></span><span>${esc(label)}</span><b>${esc(value)}</b></div>`;

// ---------- responsive mount ----------
const observers = new WeakMap();
function mount(el, draw) {
  const render = () => {
    const w = Math.max(240, el.clientWidth || el.parentElement?.clientWidth || 600);
    el.innerHTML = draw(w);
    el._bind?.(el, w);
  };
  render();
  if (!observers.has(el) && 'ResizeObserver' in window) {
    let last = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) { ro.disconnect(); return; }
      if (Math.abs(el.clientWidth - last) > 4) { last = el.clientWidth; render(); }
    });
    ro.observe(el);
    observers.set(el, ro);
  }
}

// Clean tick values for an axis.
function niceTicks(min, max, count = 4) {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || mag * 10;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

// ---------- line / area ----------
// opts: { series: [{ name, color, points: [{ x: label/date, y }] }], height, area, xLabel(x), yFormat(v), tipTitle(x) }
export function lineChart(el, opts) {
  const { series, height = 240, area = true, xLabel = (x) => x, yFormat = moneyCompact, tipTitle = xLabel } = opts;
  const n = Math.max(...series.map((s) => s.points.length));
  if (!n) { el.innerHTML = '<div class="empty-chart">No data yet</div>'; return; }
  const all = series.flatMap((s) => s.points.map((p) => p.y)).filter((v) => v != null);
  let min = Math.min(0, ...all), max = Math.max(0, ...all);
  if (opts.zeroBased === false) { min = Math.min(...all); max = Math.max(...all); const pad = (max - min) * 0.1 || 1; min -= pad; max += pad; }
  const ticks = niceTicks(min, max);
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const M = { t: 12, r: 16, b: 26, l: 56 };

  el._bind = (root, w) => bindCrosshair(root, w, n, M, series, tipTitle, opts.tipFormat || money);
  mount(el, (w) => {
    const iw = w - M.l - M.r, ih = height - M.t - M.b;
    const X = (i) => M.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = (v) => M.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
    let g = '';
    for (const t of ticks) {
      g += `<line class="gl${t === 0 ? ' base' : ''}" x1="${M.l}" x2="${w - M.r}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      g += `<text class="axis" x="${M.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(yFormat(t))}</text>`;
    }
    const pts0 = series[0].points;
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 90))));
    pts0.forEach((p, i) => {
      if (i % every === 0 || i === n - 1) {
        if (i !== n - 1 && n - 1 - i < every * 0.6) return;
        g += `<text class="axis" x="${X(i)}" y="${height - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(xLabel(p.x))}</text>`;
      }
    });
    series.forEach((s, si) => {
      const color = s.color || SERIES(si);
      const segs = [];
      let cur = [];
      s.points.forEach((p, i) => {
        if (p.y == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(p.y)]);
      });
      if (cur.length) segs.push(cur);
      for (const seg of segs) {
        const d = seg.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
        if (area && series.length === 1) {
          const base = Y(Math.max(lo, 0));
          g += `<path d="${d}L${seg[seg.length - 1][0]},${base}L${seg[0][0]},${base}Z" style="fill:${color};opacity:.1"/>`;
        }
        g += `<path d="${d}" class="line" style="stroke:${color}"/>`;
      }
      const last = [...s.points].reverse().find((p) => p.y != null);
      if (last) {
        const li = s.points.lastIndexOf(last);
        g += `<circle class="dot" cx="${X(li)}" cy="${Y(last.y)}" r="4" style="fill:${color}"/>`;
      }
    });
    g += `<line class="crosshair" x1="0" x2="0" y1="${M.t}" y2="${M.t + ih}" style="display:none"/>`;
    g += `<rect class="hit" x="${M.l}" y="${M.t}" width="${iw}" height="${ih}" fill="transparent"/>`;
    return `<svg width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img" aria-label="${esc(opts.label || 'Line chart')}">${g}</svg>`;
  });
}

function bindCrosshair(root, w, n, M, series, tipTitle, fmt) {
  const svg = root.querySelector('svg');
  const hit = root.querySelector('.hit');
  const ch = root.querySelector('.crosshair');
  if (!hit) return;
  const iw = w - M.l - M.r;
  const move = (e) => {
    const r = svg.getBoundingClientRect();
    const px = (e.touches?.[0]?.clientX ?? e.clientX) - r.left;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - M.l) / (iw || 1)) * (n - 1))));
    const x = M.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    ch.setAttribute('x1', x); ch.setAttribute('x2', x); ch.style.display = '';
    const p0 = series[0].points[i];
    let h = `<div class="tip-title">${esc(tipTitle(p0.x))}</div>`;
    series.forEach((s, si) => { const p = s.points[i]; if (p && p.y != null) h += tipRow(s.color || SERIES(si), s.name, fmt(p.y)); });
    showTip(h, r.left + x, (e.touches?.[0]?.clientY ?? e.clientY));
  };
  hit.addEventListener('mousemove', move);
  hit.addEventListener('touchmove', move, { passive: true });
  const leave = () => { ch.style.display = 'none'; hideTip(); };
  hit.addEventListener('mouseleave', leave);
  hit.addEventListener('touchend', leave);
}

// ---------- grouped / diverging columns ----------
// opts: { labels: [], series: [{ name, color, values: [] }], height, onClick(i) }
export function columnChart(el, opts) {
  const { labels, series, height = 240, yFormat = moneyCompact } = opts;
  const n = labels.length;
  if (!n) { el.innerHTML = '<div class="empty-chart">No data yet</div>'; return; }
  const all = series.flatMap((s) => s.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = ticks[0], hi = ticks[ticks.length - 1];
  const M = { t: 12, r: 12, b: 26, l: 56 };
  el._bind = (root) => {
    root.querySelectorAll('[data-i]').forEach((node) => {
      const i = +node.dataset.i;
      node.addEventListener('mousemove', (e) => {
        let h = `<div class="tip-title">${esc(opts.tipTitle ? opts.tipTitle(i) : labels[i])}</div>`;
        series.forEach((s, si) => { h += tipRow(s.color || SERIES(si), s.name, money(s.values[i])); });
        if (opts.tipExtra) h += opts.tipExtra(i);
        showTip(h, e.clientX, e.clientY);
        root.querySelectorAll(`[data-col="${i}"]`).forEach((b) => b.classList.add('hover'));
      });
      node.addEventListener('mouseleave', () => { hideTip(); root.querySelectorAll('.hover').forEach((b) => b.classList.remove('hover')); });
      if (opts.onClick) node.addEventListener('click', () => { hideTip(); opts.onClick(i); });
    });
  };
  mount(el, (w) => {
    const iw = w - M.l - M.r, ih = height - M.t - M.b;
    const Y = (v) => M.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
    const band = iw / n;
    const gap = 2;
    const bw = Math.max(3, Math.min(24, (band * 0.7 - gap * (series.length - 1)) / series.length));
    const groupW = bw * series.length + gap * (series.length - 1);
    let g = '';
    for (const t of ticks) {
      g += `<line class="gl${t === 0 ? ' base' : ''}" x1="${M.l}" x2="${w - M.r}" y1="${Y(t)}" y2="${Y(t)}"/>`;
      g += `<text class="axis" x="${M.l - 8}" y="${Y(t) + 4}" text-anchor="end">${esc(yFormat(t))}</text>`;
    }
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 48))));
    labels.forEach((lab, i) => {
      const cx = M.l + band * i + band / 2;
      series.forEach((s, si) => {
        const v = s.values[i] || 0;
        const x = cx - groupW / 2 + si * (bw + gap);
        const y0 = Y(0), y1 = Y(v);
        const top = Math.min(y0, y1), hgt = Math.max(v === 0 ? 0 : 1, Math.abs(y1 - y0));
        g += `<path data-col="${i}" class="bar" d="${roundedBar(x, top, bw, hgt, v >= 0)}" style="fill:${s.color || SERIES(si)}"/>`;
      });
      if (i % every === 0) g += `<text class="axis" x="${cx}" y="${height - 6}" text-anchor="middle">${esc(lab)}</text>`;
      g += `<rect data-i="${i}" x="${M.l + band * i}" y="${M.t}" width="${band}" height="${ih}" fill="transparent" style="cursor:${opts.onClick ? 'pointer' : 'default'}"/>`;
    });
    return `<svg width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" role="img" aria-label="${esc(opts.label || 'Column chart')}">${g}</svg>`;
  });
}

// Bar with 4px rounded data-end, square at the baseline.
function roundedBar(x, y, w, h, up) {
  const r = Math.min(4, w / 2, h);
  if (h <= 0) return '';
  if (up) {
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

// ---------- donut ----------
// items: [{ label, value, color }] — caller folds to <= 8 slices ("Other").
export function donut(el, { items, size = 200, center = '', sub = '', onClick }) {
  const total = items.reduce((a, x) => a + Math.max(0, x.value), 0);
  if (!total) { el.innerHTML = '<div class="empty-chart">No spending in this period</div>'; return; }
  const R = size / 2, r = R * 0.64;
  let a0 = -Math.PI / 2;
  let g = '';
  const gapAngle = items.length > 1 ? 0.012 : 0;
  items.forEach((it, i) => {
    const frac = Math.max(0, it.value) / total;
    const a1 = a0 + frac * Math.PI * 2;
    const s0 = a0 + gapAngle / 2, s1 = Math.max(s0, a1 - gapAngle / 2);
    const large = s1 - s0 > Math.PI ? 1 : 0;
    const p = (ang, rad) => `${(R + rad * Math.cos(ang)).toFixed(2)},${(R + rad * Math.sin(ang)).toFixed(2)}`;
    const d = frac >= 0.9999
      ? `M${p(0, R)}A${R},${R} 0 1 1 ${p(Math.PI, R)}A${R},${R} 0 1 1 ${p(0, R)}M${p(0, r)}A${r},${r} 0 1 0 ${p(Math.PI, r)}A${r},${r} 0 1 0 ${p(0, r)}Z`
      : `M${p(s0, R)}A${R},${R} 0 ${large} 1 ${p(s1, R)}L${p(s1, r)}A${r},${r} 0 ${large} 0 ${p(s0, r)}Z`;
    g += `<path class="slice" data-i="${i}" d="${d}" style="fill:${it.color || SERIES(i)}" fill-rule="evenodd"/>`;
    a0 = a1;
  });
  el.innerHTML = `<div class="donut-wrap" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Breakdown">${g}</svg>
    <div class="donut-center"><div class="donut-value">${esc(center)}</div><div class="donut-sub">${esc(sub)}</div></div></div>`;
  el.querySelectorAll('.slice').forEach((node) => {
    const it = items[+node.dataset.i];
    node.addEventListener('mousemove', (e) => showTip(tipRow(it.color || SERIES(+node.dataset.i), it.label, `${money(it.value)} · ${Math.round((it.value / total) * 100)}%`), e.clientX, e.clientY));
    node.addEventListener('mouseleave', hideTip);
    if (onClick) node.addEventListener('click', () => { hideTip(); onClick(it); });
  });
}

// Fold a sorted breakdown into at most `max` slices plus "Other".
export function foldTop(items, max = 7) {
  if (items.length <= max + 1) return items;
  const top = items.slice(0, max);
  const rest = items.slice(max);
  return [...top, { key: '__other', label: `Other (${rest.length})`, amount: rest.reduce((a, x) => a + x.amount, 0), other: rest }];
}

// ---------- sparkline ----------
export function sparkline(values, { w = 96, h = 28, color = 'var(--series-1)' } = {}) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v);
  const X = (i) => (i / (values.length - 1)) * (w - 4) + 2;
  const Y = (y) => h - 3 - ((y - min) / (max - min || 1)) * (h - 6);
  let d = '';
  values.forEach((y, i) => { if (y != null) d += `${d ? 'L' : 'M'}${X(i).toFixed(1)},${Y(y).toFixed(1)}`; });
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" style="stroke:${color}" class="line thin"/></svg>`;
}

// ---------- sankey (income sources → spending groups + savings) ----------
// left/right: [{ label, value, color }]. Values on each side should sum to the same total
// (caller adds "Savings" or "Deficit" to balance).
export function sankey(el, { left, right, height = 360 }) {
  const total = Math.max(left.reduce((a, x) => a + x.value, 0), right.reduce((a, x) => a + x.value, 0));
  if (!total) { el.innerHTML = '<div class="empty-chart">No income or spending in this period</div>'; return; }
  mount(el, (w) => {
    const narrow = w < 560;
    const labelW = narrow ? 104 : 170;
    const nodeW = 10, gap = 6;
    const x0 = labelW, x1 = w - labelW - nodeW;
    const layout = (items) => {
      const avail = height - gap * (items.length - 1);
      let y = 0;
      return items.map((it) => { const h = Math.max(2, (it.value / total) * avail); const n = { ...it, y, h }; y += h + gap; return n; });
    };
    const L = layout(left), R = layout(right);
    let g = '';
    // Flows: distribute each left node proportionally across right nodes (in order).
    const rOff = R.map(() => 0);
    L.forEach((l) => {
      let lOff = 0;
      R.forEach((r, j) => {
        const share = (l.value / total) * r.value;
        const hl = (share / l.value) * l.h;
        const hr = (share / r.value) * r.h;
        if (!(hl > 0.2)) return;
        const ya = l.y + lOff, yb = r.y + rOff[j];
        const mx = (x0 + nodeW + x1) / 2;
        g += `<path class="flow" d="M${x0 + nodeW},${ya}C${mx},${ya} ${mx},${yb} ${x1},${yb}L${x1},${yb + hr}C${mx},${yb + hr} ${mx},${ya + hl} ${x0 + nodeW},${ya + hl}Z" style="fill:${r.color};opacity:.18"><title>${esc(l.label)} → ${esc(r.label)}: ${esc(money(share))}</title></path>`;
        lOff += hl; rOff[j] += hr;
      });
    });
    const trunc = (s) => (narrow && s.length > 11 ? s.slice(0, 10) + '…' : s);
    // Narrow screens: name and value on two lines so both fit in the gutter.
    const label = (x, n, anchor) => {
      const y = n.y + n.h / 2 + 4;
      if (!narrow) return `<text class="axis" x="${x}" y="${y}" text-anchor="${anchor}" style="fill:var(--ink-2)">${esc(n.label)} · ${esc(moneyCompact(n.value))}</text>`;
      const two = n.h > 24;
      return `<text class="axis" x="${x}" y="${two ? y - 6 : y}" text-anchor="${anchor}" style="fill:var(--ink-2)">${esc(trunc(n.label))}${two ? `<tspan x="${x}" dy="13">${esc(moneyCompact(n.value))}</tspan>` : ''}</text>`;
    };
    L.forEach((n) => {
      g += `<rect x="${x0}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="2" style="fill:${n.color}"><title>${esc(n.label)}: ${esc(money(n.value))}</title></rect>`;
      if (n.h > 11) g += label(x0 - 8, n, 'end');
    });
    R.forEach((n) => {
      g += `<rect x="${x1}" y="${n.y}" width="${nodeW}" height="${n.h}" rx="2" style="fill:${n.color}"><title>${esc(n.label)}: ${esc(money(n.value))}</title></rect>`;
      if (n.h > 11) g += label(x1 + nodeW + 8, n, 'start');
    });
    const hh = Math.max(L.length ? L[L.length - 1].y + L[L.length - 1].h : 0, R.length ? R[R.length - 1].y + R[R.length - 1].h : 0);
    return `<svg width="${w}" height="${hh + 4}" viewBox="0 -2 ${w} ${hh + 4}" role="img" aria-label="Cash flow from income to spending">${g}</svg>`;
  });
}
