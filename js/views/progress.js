import { sortedSessions, getState } from '../store.js';
import { convertWeight } from '../engine.js';
import { strengthScoreSeries, exerciseSeries, exerciseUsage, insightReport } from '../insights.js';
import { lineChart, divergingBars, bindCharts } from '../charts.js';
import { esc, fmtNum, fmtPct, fmtSec, fmtClock, fmtDate } from '../util.js';
import { actions } from '../ui.js';

let selected = null;
let metric = 'strength';

export function render() {
  const sessions = sortedSessions();
  const unit = getState().settings.unit;
  if (sessions.length < 1) {
    return `<h1>Progress</h1><div class="empty"><p>Your charts and insights will appear here after your first workout.</p>
      <p><small>To explore first, load demo data under Settings.</small></p></div>`;
  }
  const usage = exerciseUsage(sessions);
  if (!selected || !usage.find((u) => u.exerciseId === selected)) selected = usage[0]?.exerciseId;
  const report = insightReport(sessions);
  const score = strengthScoreSeries(sessions);
  const latestScore = score.length ? score[score.length - 1].y : null;

  // Exercise chart.
  const series = selected ? exerciseSeries(sessions, selected) : [];
  let chart = '';
  if (series.length) {
    if (metric === 'strength') {
      const base = series[0].capacity;
      chart = lineChart(series.map((r) => ({ x: r.x, y: (r.capacity / base) * 100, label: `${fmtNum(r.set.weight)} ${r.set.unit} × ${fmtSec(r.set.tul)}` })),
        { format: (v) => v.toFixed(0), baseline: 100, title: 'Strength index' });
    } else if (metric === 'weight') {
      chart = lineChart(series.map((r) => ({ x: r.x, y: convertWeight(Number(r.set.weight), r.set.unit, unit), label: `${fmtSec(r.set.tul)}, ${r.set.reps} reps` })),
        { format: (v) => fmtNum(v, 1), unit, title: 'Weight' });
    } else {
      chart = lineChart(series.map((r) => ({ x: r.x, y: r.set.tul, label: `${fmtNum(r.set.weight)} ${r.set.unit}` })),
        { format: (v) => Math.round(v) + 's', title: 'Time under load' });
    }
  }
  const ex = usage.find((u) => u.exerciseId === selected);
  const first = series[0];
  const last = series[series.length - 1];
  const best = series.reduce((b, r) => (!b || r.capacity > b.capacity ? r : b), null);

  const insightCards = report.sections.map((sec) => {
    const hasData = sec.buckets.some((b) => b.n > 0);
    return `<div class="card">
      <div class="row between"><h3>${esc(sec.title)}</h3><small>${esc(sec.metric)}</small></div>
      ${hasData ? divergingBars(sec.buckets, { title: sec.title }) : sec.text ? '' : '<div class="chart-empty">Not enough data yet</div>'}
      ${sec.text ? `<p class="insight-text">${esc(sec.text)}</p>` : hasData ? `<p class="legend-note">No clear pattern yet. A finding appears once each group has 3+ data points and the difference is meaningful.</p>` : ''}
      ${sec.extra ? `<p class="legend-note">${esc(sec.extra)}</p>` : ''}
    </div>`;
  }).join('');

  const movers = report.movers.length ? `<div class="list">${report.movers.map((m) => `
      <div class="item"><span class="grow"><span class="title">${esc(m.name)}</span>
        <div class="meta">${m.sessions} sessions${m.stalled ? ' · <span class="pill warn">stalled</span>' : ''}</div></span>
        <b class="num ${m.total >= 0 ? 'arrow-up' : 'arrow-down'}">${fmtPct(m.total)}</b></div>`).join('')}</div>` : '';

  return `
    <h1>Progress</h1>
    <p class="sub">${sessions.length} workouts since ${esc(fmtDate(sessions[0].startedAt, { day: 'numeric', month: 'short', year: 'numeric' }))}</p>
    <div class="stats-grid">
      <div class="stat"><b>${latestScore != null ? fmtPct(latestScore / 100 - 1, 0) : '–'}</b><small>strength vs start</small></div>
      <div class="stat"><b>${report.stats.avgInterval != null ? report.stats.avgInterval.toFixed(1) + 'd' : '–'}</b><small>avg gap</small></div>
      <div class="stat"><b>${report.stats.avgDuration != null ? fmtClock(report.stats.avgDuration) : '–'}</b><small>avg session</small></div>
    </div>

    <h2>Overall strength</h2>
    <div class="card">${lineChart(score, { format: (v) => v.toFixed(0), baseline: 100, title: 'Overall strength score' })}
      <p class="legend-note">Each exercise is indexed to your first session (=100) using a load + time-under-load capacity estimate, then averaged. Drag across the chart to read values.</p></div>

    <h2>By exercise</h2>
    <div class="card">
      <select name="exercise" aria-label="Exercise">${usage.map((u) =>
        `<option value="${esc(u.exerciseId)}" ${u.exerciseId === selected ? 'selected' : ''}>${esc(u.name)} (${u.count})</option>`).join('')}</select>
      <div class="seg" style="margin:10px 0">
        ${[['strength', 'Strength'], ['weight', 'Weight'], ['tul', 'TUL']].map(([k, l]) =>
          `<button data-act="metric" data-m="${k}" class="${metric === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      ${chart}
      ${series.length >= 2 ? `<div class="stats-grid" style="margin-top:10px">
        <div class="stat"><b>${fmtPct(last.capacity / first.capacity - 1, 0)}</b><small>since first</small></div>
        <div class="stat"><b>${esc(fmtNum(best.set.weight))}</b><small>${esc(best.set.unit)} at best</small></div>
        <div class="stat"><b>${fmtSec(best.set.tul)}</b><small>TUL at best</small></div>
      </div>` : ''}
      ${ex ? `<details style="margin-top:8px"><summary>All entries</summary><div class="list">${[...series].reverse().map((r) => `
        <div class="item"><span class="grow">${esc(fmtDate(r.x))}<div class="meta">${esc(fmtNum(r.set.weight))} ${esc(r.set.unit)} · ${fmtSec(r.set.tul)} · ${r.set.reps} reps</div></span>
        <span class="num ${r.change > 0.015 ? 'arrow-up' : r.change < -0.015 ? 'arrow-down' : ''}">${r.change != null ? fmtPct(r.change) : ''}</span></div>`).join('')}</div></details>` : ''}
    </div>

    ${movers ? `<h2>Exercise progress</h2>${movers}` : ''}

    <h2>Insights</h2>
    ${sessions.length < 6 ? `<p class="muted">Insights get more reliable with more sessions (you have ${sessions.length}). Faded rows have fewer than 3 data points.</p>` : ''}
    <p class="legend-note">"Performance vs trend" compares each set with your surrounding sessions on that exercise, so long-term progress doesn’t skew the comparison.</p>
    ${insightCards}
  `;
}

export function mount(root) {
  bindCharts(root);
  const onChange = (ev) => {
    if (ev.target.name === 'exercise') { selected = ev.target.value; root.innerHTML = render(); bindCharts(root); }
  };
  root.addEventListener('change', onChange);
  const off = actions(root, {
    metric: (el) => { metric = el.dataset.m; root.innerHTML = render(); bindCharts(root); },
  });
  return () => { off(); root.removeEventListener('change', onChange); };
}
