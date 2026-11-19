import { getSession, sortedSessions, getRoutine, getState, incrementFor, updateSession } from '../store.js';
import { evaluateSession, suggestNext, isLogged } from '../engine.js';
import { technique } from '../data/techniques.js';
import { esc, fmtDate, fmtTime, fmtClock, fmtNum, fmtSec, mean, plural } from '../util.js';
import { actions, navigate, deltaHtml } from '../ui.js';

/** Shared session report used by the post-workout summary and history detail. */
export function sessionReport(session, { showNext = false, editable = false } = {}) {
  const sessions = sortedSessions();
  const routine = getRoutine(session.routineId);
  const v = evaluateSession(session, sessions, routine);
  const unit = getState().settings.unit;
  const logged = session.sets.filter(isLogged).sort((a, b) => a.order - b.order);
  const skipped = session.sets.filter((s) => s.skipped);
  const transitions = logged.slice(1).map((s, i) => (s.startedAt - logged[i].endedAt) / 1000).filter((x) => x >= 0);
  const duration = session.endedAt ? (session.endedAt - session.startedAt) / 1000 : null;
  const totalTul = logged.reduce((t, s) => t + s.tul, 0);
  const daysToNext = Math.max(0, Math.round((v.nextDate - Date.now()) / 86400000));

  const rows = logged.map((set) => {
    const row = v.rows.find((r) => r.set === set) || { change: null, status: 'new' };
    const t = technique(set.technique);
    let next = '';
    if (showNext) {
      const wk = routine?.workouts.find((w) => w.id === session.workoutId);
      const slot = wk?.slots.find((s) => s.exerciseId === set.exerciseId) || { exerciseId: set.exerciseId, technique: set.technique };
      const sug = suggestNext({ slot, routine, sessions, unit, increment: incrementFor(set.exerciseId) });
      if (sug.weight != null) {
        const verb = sug.action === 'increase' ? '▲ Next time' : sug.action === 'decrease' ? '▼ Next time' : 'Next time';
        next = `${verb}: ${fmtNum(sug.weight)} ${unit}. ${sug.text}`;
      }
    }
    return `<div class="result-row" data-set-order="${set.order}">
      <div><b>${esc(set.exerciseName)}</b> ${t.short ? `<span class="pill accent">${esc(t.short)}</span>` : ''}
        ${set.failed === false ? '<span class="pill warn">not to failure</span>' : ''}</div>
      ${deltaHtml(row)}
      <div class="detail">${esc(fmtNum(set.weight))} ${esc(set.unit)} · ${fmtSec(set.tul)} · ${set.reps} reps${
        set.extraSeconds || set.extraReps ? ` · +${set.extraReps || 0} reps / ${fmtSec(set.extraSeconds)} ${esc(t.short)}` : ''}</div>
      ${editable ? `<button class="small ghost" data-act="edit-set" data-order="${set.order}">Edit</button>` : '<span></span>'}
      ${row.prev ? `<div class="next">Previous: ${esc(fmtNum(row.prev.weight))} ${esc(row.prev.unit)} · ${fmtSec(row.prev.tul)} · ${row.prev.reps} reps</div>` : ''}
      ${next ? `<div class="next">${esc(next)}</div>` : ''}
      ${set.notes ? `<div class="next">“${esc(set.notes)}”</div>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="verdict ${v.tone}">
      <div class="icon">${v.icon}</div>
      <div class="title">${esc(v.title)}</div>
      <div class="muted">${esc(session.workoutName)} · ${esc(fmtDate(session.startedAt))} ${esc(fmtTime(session.startedAt))}</div>
    </div>
    <div class="card">${v.notes.map((n) => `<p>${esc(n)}</p>`).join('')}</div>
    <div class="card next-session">
      <div class="big">${v.restDays}</div>
      <div class="grow"><b>rest day${v.restDays === 1 ? '' : 's'} minimum</b>
        <p class="muted">Next session on or after <b>${esc(fmtDate(v.nextDate))}</b>${showNext ? ` (${daysToNext === 0 ? 'today' : 'in ' + plural(daysToNext, 'day')})` : ''}. Gap of ${v.recommendedInterval} days${v.intervalUsed != null ? `; this one came after ${v.intervalUsed}` : ''}.</p></div>
    </div>
    <h2>Exercises</h2>
    <div class="list">${rows || '<div class="empty">No sets logged</div>'}</div>
    ${skipped.length ? `<p class="muted">Skipped: ${skipped.map((s) => esc(s.exerciseName)).join(', ')}</p>` : ''}
    <div class="stats-grid">
      <div class="stat"><b>${duration ? fmtClock(duration) : '–'}</b><small>duration</small></div>
      <div class="stat"><b>${fmtClock(totalTul)}</b><small>total TUL</small></div>
      <div class="stat"><b>${transitions.length ? fmtSec(mean(transitions)) : '–'}</b><small>avg transition</small></div>
    </div>
    <label class="field" style="margin-top:16px"><span>Session notes</span>
      <textarea name="session-notes" placeholder="How did it feel? Anything unusual (sleep, illness, gym busy)?">${esc(session.notes || '')}</textarea></label>`;
}

export function render([id]) {
  const s = getSession(id);
  if (!s) return `<div class="empty">Session not found. <a href="#/train">Back</a></div>`;
  return `<h1>Workout complete</h1>${sessionReport(s, { showNext: true })}
    <button class="primary big" data-act="done" style="margin-top:12px">Done</button>`;
}

export function mount(root, [id]) {
  const onChange = (ev) => {
    if (ev.target.name === 'session-notes') updateSession(id, (s) => { s.notes = ev.target.value.trim(); });
  };
  root.addEventListener('change', onChange);
  const off = actions(root, { done: () => navigate('#/train') });
  return () => { off(); root.removeEventListener('change', onChange); };
}
