export const DAY = 86400000;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

export function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export const roundTo = (x, step) => {
  if (!step || step <= 0) return Math.round(x * 100) / 100;
  return Math.round(Math.round(x / step) * step * 100) / 100;
};

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const addDays = (ts, n) => {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() + n);
  return d.getTime();
};

/** Whole calendar days between two timestamps (DST-safe). */
export const calendarDays = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtSec(sec) {
  if (sec == null || isNaN(sec)) return '–';
  sec = Math.round(sec);
  return sec >= 60 ? fmtClock(sec) : `${sec}s`;
}

export const fmtPct = (x, digits = 1) => {
  if (x == null || isNaN(x)) return '–';
  const v = (x * 100).toFixed(digits);
  return (x > 0 ? '+' : '') + v + '%';
};

export const fmtNum = (x, digits = 1) => {
  if (x == null || isNaN(x)) return '–';
  return Number.isInteger(x) ? String(x) : x.toFixed(digits).replace(/\.0+$/, '');
};

export const fmtDate = (ts, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(ts).toLocaleDateString(undefined, opts);

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export function relDays(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export const plural = (n, word, pl = word + 's') => `${n} ${n === 1 ? word : pl}`;
