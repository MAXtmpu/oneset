// Shared UI helpers used by views.
import { esc, fmtNum } from './util.js';

export const navigate = (hash) => { if (location.hash !== hash) location.hash = hash; else window.dispatchEvent(new HashChangeEvent('hashchange')); };
export const rerender = () => window.dispatchEvent(new Event('app:rerender'));

let toastTimer;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/** Delegated event helper: on(root, 'click', '[data-act="x"]', fn). */
export function on(root, type, selector, fn) {
  const h = (ev) => {
    const el = ev.target.closest(selector);
    if (el && root.contains(el)) fn(el, ev);
  };
  root.addEventListener(type, h);
  return () => root.removeEventListener(type, h);
}

/** Bind a map of data-act names to handlers. */
export function actions(root, map) {
  return on(root, 'click', '[data-act]', (el, ev) => {
    const fn = map[el.dataset.act];
    if (fn) { ev.preventDefault(); fn(el, ev); }
  });
}

export function stepper({ name, value, unit = '', step = 1, min = 0, decimals = 2 }) {
  return `<div class="stepper" data-stepper="${esc(name)}" data-step="${step}" data-min="${min}" data-dec="${decimals}">
    <button type="button" data-step-dir="-1" aria-label="decrease">−</button>
    <input name="${esc(name)}" type="number" inputmode="decimal" step="any" value="${value == null ? '' : esc(fmtNum(value, decimals))}">
    <button type="button" data-step-dir="1" aria-label="increase">+</button>
    ${unit ? `<span class="unit">${esc(unit)}</span>` : ''}
  </div>`;
}

/** Wire all steppers under root. onChange(name, value) fires on every change. */
export function bindSteppers(root, onChange = () => {}) {
  const offClick = on(root, 'click', '[data-step-dir]', (btn) => {
    const wrap = btn.closest('[data-stepper]');
    const input = wrap.querySelector('input');
    const step = Number(wrap.dataset.step) || 1;
    const min = Number(wrap.dataset.min);
    const cur = Number(input.value) || 0;
    let next = Math.round((cur + step * Number(btn.dataset.stepDir)) * 100) / 100;
    if (!isNaN(min)) next = Math.max(min, next);
    input.value = fmtNum(next, Number(wrap.dataset.dec));
    onChange(wrap.dataset.stepper, next);
  });
  const offInput = on(root, 'input', '[data-stepper] input', (input) => {
    const v = input.value === '' ? null : Number(input.value);
    onChange(input.closest('[data-stepper]').dataset.stepper, v);
  });
  return () => { offClick(); offInput(); };
}

/** Share a file with the iOS share sheet; fall back to a download link. */
export async function shareFile(name, text, type) {
  const file = new File([text], name, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const deltaHtml = (row) => {
  if (row.change == null) return `<span class="delta">${row.status === 'new' ? 'new' : '–'}</span>`;
  const arrow = row.change > 0.015 ? '▲' : row.change < -0.015 ? '▼' : '▶';
  const cls = row.status === 'unclear' ? '' : row.status;
  return `<span class="delta ${cls}">${arrow} ${(row.change > 0 ? '+' : '') + (row.change * 100).toFixed(1)}%</span>`;
};
