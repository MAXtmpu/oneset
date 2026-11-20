// Small dependency-free SVG charts (the app must work offline, so no CDN libraries).
// Colours come from CSS custom properties (--series-1, --div-pos, --div-neg, --grid…), so light
// and dark mode each get their own validated steps.
//
// Interaction: drag or tap across a line chart; a crosshair snaps to the nearest session and the
// readout row above the chart shows the value. Bars carry direct labels, so nothing is
// hover-only.

import { esc, fmtDate } from './util.js';

const W = 340;
const H = 170;
const PAD = { l: 38, r: 12, t: 10, b: 22 };

function niceRange(min, max) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / 3)));
  const s = [1, 2, 2.5, 5, 10].map((m) => m * step).find((x) => span / x <= 4) || step * 10;
  return { lo: Math.floor(min / s) * s, hi: Math.ceil(max / s) * s, step: s };
}

let chartSeq = 0;

/**
 * Line chart over time.
 * points: [{x: timestamp, y: number, label?: string}]
 * opts: { format: v => string, band: [lo, hi] (shaded target zone), baseline: number, unit }
 */
export function lineChart(points, opts = {}) {
  const id = 'c' + (++chartSeq);
  if (!points.length) return `<div class="chart-empty">No data yet</div>`;
  const fmt = opts.format || ((v) => v.toFixed(1));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  let yMin = Math.min(...ys, ...(opts.band || []), opts.baseline ?? Infinity);
  let yMax = Math.max(...ys, ...(opts.band || []), opts.baseline ?? -Infinity);
  const pad = (yMax - yMin) * 0.08 || 1;
  const { lo, hi, step } = niceRange(yMin - pad, yMax + pad);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const sx = (x) => (x1 === x0 ? (PAD.l + W - PAD.r) / 2 : PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r));
  const sy = (y) => PAD.t + (1 - (y - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

  let grid = '';
  for (let v = lo; v <= hi + 1e-9; v += step) {
    grid += `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(v)}" y2="${sy(v)}"/>` +
      `<text class="axis" x="${PAD.l - 6}" y="${sy(v) + 3.5}" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  const band = opts.band
    ? `<rect class="band" x="${PAD.l}" width="${W - PAD.l - PAD.r}" y="${sy(opts.band[1])}" height="${sy(opts.band[0]) - sy(opts.band[1])}"/>` : '';
  const baseline = opts.baseline != null
    ? `<line class="baseline" x1="${PAD.l}" x2="${W - PAD.r}" y1="${sy(opts.baseline)}" y2="${sy(opts.baseline)}"/>` : '';
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
  const dots = points.length <= 40
    ? points.map((p) => `<circle class="dot" cx="${sx(p.x)}" cy="${sy(p.y)}" r="3.5"/>`).join('') : '';
  const xLabels = `<text class="axis" x="${PAD.l}" y="${H - 5}">${esc(fmtDate(x0, { day: 'numeric', month: 'short' }))}</text>` +
    (x1 !== x0 ? `<text class="axis" x="${W - PAD.r}" y="${H - 5}" text-anchor="end">${esc(fmtDate(x1, { day: 'numeric', month: 'short' }))}</text>` : '');

  const data = JSON.stringify(points.map((p) => [sx(p.x), sy(p.y), fmt(p.y), fmtDate(p.x), p.label || '']));
  const last = points[points.length - 1];
  return `
  <figure class="chart" id="${id}" data-points='${esc(data)}'>
    <figcaption class="readout"><strong>${esc(fmt(last.y))}${opts.unit ? ' ' + esc(opts.unit) : ''}</strong>
      <span>${esc(fmtDate(last.x))}${last.label ? ' · ' + esc(last.label) : ''}</span></figcaption>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'chart')}">
      ${band}${grid}${baseline}
      <path class="line" d="${path}"/>
      ${dots}
      <line class="crosshair" x1="0" x2="0" y1="${PAD.t}" y2="${H - PAD.b}" visibility="hidden"/>
      <circle class="focus" r="5.5" visibility="hidden"/>
      ${xLabels}
      <rect class="hit" x="${PAD.l}" y="0" width="${W - PAD.l - PAD.r}" height="${H}" fill="transparent"/>
    </svg>
  </figure>`;
}

/** Wire crosshair interaction for every line chart under `root`. Call after rendering. */
export function bindCharts(root, unit = '') {
  root.querySelectorAll('figure.chart[data-points]').forEach((fig) => {
    const pts = JSON.parse(fig.dataset.points);
    const svg = fig.querySelector('svg');
    const cross = svg.querySelector('.crosshair');
    const focus = svg.querySelector('.focus');
    const readout = fig.querySelector('.readout');
    const u = fig.dataset.unit || unit;
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * W;
      let best = pts[0];
      for (const p of pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p;
      cross.setAttribute('x1', best[0]); cross.setAttribute('x2', best[0]);
      cross.setAttribute('visibility', 'visible');
      focus.setAttribute('cx', best[0]); focus.setAttribute('cy', best[1]);
      focus.setAttribute('visibility', 'visible');
      readout.innerHTML = '';
      const s = document.createElement('strong'); s.textContent = best[2] + (u ? ' ' + u : '');
      const sp = document.createElement('span'); sp.textContent = best[3] + (best[4] ? ' · ' + best[4] : '');
      readout.append(s, ' ', sp);
    };
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointermove', move);
  });
}

/**
 * Diverging horizontal bars around zero, e.g. performance vs trend.
 * buckets: [{label, mean, n}], values as fractions (0.03 = +3%).
 */
export function divergingBars(buckets, opts = {}) {
  const rows = buckets.filter((b) => b.n > 0);
  if (!rows.length) return `<div class="chart-empty">Not enough data yet</div>`;
  const maxAbs = Math.max(0.01, ...rows.map((b) => Math.abs(b.mean || 0)));
  const fmt = opts.format || ((v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(1) + '%');
  return `<div class="dbars" role="table" aria-label="${esc(opts.title || '')}">` + rows.map((b) => {
    const v = b.mean || 0;
    const w = (Math.abs(v) / maxAbs) * 50;
    const weak = b.n < 3;
    return `<div class="dbar-row${weak ? ' weak' : ''}" role="row">
      <span class="dbar-label" role="cell">${esc(b.label)}</span>
      <span class="dbar-track" role="cell">
        <span class="dbar-mid"></span>
        <span class="dbar ${v >= 0 ? 'pos' : 'neg'}" style="${v >= 0 ? 'left:50%' : `right:50%`};width:${w}%"></span>
      </span>
      <span class="dbar-val" role="cell">${esc(fmt(v))}<small> n=${b.n}</small></span>
    </div>`;
  }).join('') + `</div>`;
}
