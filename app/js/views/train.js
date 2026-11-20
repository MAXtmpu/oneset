import { getState, activeRoutine, sortedSessions, loadRunner, getExercise, incrementFor } from '../store.js';
import { nextWorkoutIndex, recoveryStatus, suggestNext, VERDICTS } from '../engine.js';
import { technique } from '../data/techniques.js';
import { esc, fmtDate, fmtNum, relDays, plural, fmtSec } from '../util.js';
import { actions, navigate } from '../ui.js';
import { startWorkout } from './runner.js';

let chosenWorkout = null; // index override for this visit
let readiness = 'normal';

export function render() {
  const st = getState();
  const routine = activeRoutine();
  const sessions = sortedSessions();
  const runner = loadRunner();
  const nextIdx = nextWorkoutIndex(routine, sessions);
  const idx = chosenWorkout != null && chosenWorkout < routine.workouts.length ? chosenWorkout : nextIdx;
  const workout = routine.workouts[idx];
  const rec = recoveryStatus(sessions);
  const unit = st.settings.unit;

  const recovery = rec ? (() => {
    const frac = Math.min(1, rec.daysSince / Math.max(1, rec.recommendedInterval));
    const C = 2 * Math.PI * 26;
    const cls = rec.ready ? 'status-good' : 'status-warn';
    const v = VERDICTS[rec.last.verdict.type];
    return `<div class="card hero-status">
      <svg class="ring-sm ${cls}" viewBox="0 0 64 64" aria-hidden="true">
        <circle class="bg" cx="32" cy="32" r="26"/>
        <circle class="fg" cx="32" cy="32" r="26" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/>
      </svg>
      <div class="grow">
        <h3 class="${cls}">${rec.ready ? 'Recovered, ready to train' : `Rest ${plural(rec.daysUntil, 'more day')}`}</h3>
        <p class="muted">Last session ${relDays(-rec.daysSince)} · ${esc(v.icon)} ${esc(v.title)}</p>
        <p class="muted">Recommended next: <b>${esc(fmtDate(rec.nextDate))}</b> (${rec.recommendedInterval}-day gap)</p>
      </div>
    </div>`;
  })() : `<div class="card"><h3>Welcome to Myodose</h3>
      <p class="muted">One set per exercise, taken slowly to momentary muscular failure. Your first session sets the baseline. After that you’ll get weight suggestions, a progress verdict and a recommended rest period.</p></div>`;

  const slots = workout.slots.map((slot, i) => {
    const ex = getExercise(slot.exerciseId);
    const sug = suggestNext({ slot, routine, sessions, unit, increment: incrementFor(slot.exerciseId) });
    const t = technique(slot.technique);
    const arrow = sug.action === 'increase' ? '<span class="arrow-up">▲</span> ' : sug.action === 'decrease' ? '<span class="arrow-down">▼</span> ' : '';
    return `<div class="slot-line"><span class="n">${i + 1}</span>
      <span class="grow">${esc(ex.name)} ${t.short ? `<span class="pill accent">${esc(t.short)}</span>` : ''}
        ${sug.beatTul ? `<br><small>beat ${fmtSec(sug.beatTul)}</small>` : ''}</span>
      <span class="w">${sug.weight != null ? arrow + esc(fmtNum(sug.weight)) + ' ' + unit : '<small>new</small>'}</span></div>`;
  }).join('');

  const tooSoon = rec && !rec.ready;

  return `
    <h1>${runner ? 'Workout in progress' : 'Train'}</h1>
    <p class="sub">${esc(routine.name)} · <a href="#/routines/${esc(routine.id)}">change</a></p>
    ${runner ? `<button class="primary big" data-act="resume">Resume workout</button>` : ''}
    ${recovery}
    <div class="card">
      <div class="row between"><h3>${esc(workout.name)}</h3><small>${plural(workout.slots.length, 'exercise')} · ${routine.tulMin}–${routine.tulMax}s TUL</small></div>
      ${routine.workouts.length > 1 ? `<div class="chips" style="margin:8px 0 10px">${routine.workouts.map((w, i) =>
        `<button class="chip ${i === idx ? 'on' : ''}" data-act="pick" data-i="${i}">${esc(w.name)}${i === nextIdx ? ' · next' : ''}</button>`).join('')}</div>` : ''}
      <div class="stack" style="margin-top:8px">${slots}</div>
    </div>
    ${st.settings.readinessPrompt && !runner ? `
    <div class="card tight">
      <div class="row between"><span>How do you feel?</span>
        <div class="seg" style="width:60%">${['low', 'normal', 'high'].map((r) =>
          `<button data-act="ready" data-r="${r}" class="${readiness === r ? 'on' : ''}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('')}</div>
      </div>
    </div>` : ''}
    ${!runner ? `<button class="primary big" data-act="start" style="margin-top:8px">Start workout</button>
      ${tooSoon ? `<p class="muted" style="text-align:center;font-size:13px">You’re ${plural(rec.daysUntil, 'day')} ahead of the recommended rest. Starting early is allowed. It just tends to hold back progress.</p>` : ''}` : ''}
  `;
}

export function mount(root) {
  return actions(root, {
    pick: (el) => { chosenWorkout = Number(el.dataset.i); root.innerHTML = render(); },
    ready: (el) => { readiness = el.dataset.r; root.querySelectorAll('[data-act="ready"]').forEach((b) => b.classList.toggle('on', b === el)); },
    resume: () => navigate('#/run'),
    start: () => {
      const routine = activeRoutine();
      const idx = chosenWorkout ?? nextWorkoutIndex(routine, sortedSessions());
      startWorkout(routine, idx, readiness);
      chosenWorkout = null; readiness = 'normal';
      navigate('#/run');
    },
  });
}
