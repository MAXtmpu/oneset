// The in-gym workout runner. A small state machine, persisted after every transition so a
// killed/reloaded app resumes mid-set. All timing comes from absolute timestamps, never from
// counting ticks, so it stays accurate even when iOS throttles a backgrounded page.
//
// phases: ready → prep (countdown) → load (TUL running) → [extReady → extRest? → extLoad]* → record
//         pre-exhaust: load → prep of the next exercise (3 s), then both sets are recorded together.

import {
  getState, sortedSessions, getExercise, incrementFor, exSettings, setExSetting,
  saveRunner, loadRunner, clearRunner, addSession,
} from '../store.js';
import { suggestNext, exerciseHistory, repSeconds, familyOf } from '../engine.js';
import { technique } from '../data/techniques.js';
import { esc, fmtClock, fmtNum, fmtSec, uid } from '../util.js';
import { actions, navigate, stepper, bindSteppers, toast } from '../ui.js';
import { beep, unlock, keepAwake, buzz } from '../audio.js';

let R = null;
const C = 2 * Math.PI * 140; // timer ring circumference

const persist = () => saveRunner(R);
const cur = () => (R.queue.length ? R.slots[R.queue[0]] : null);

export function startWorkout(routine, idx, readiness) {
  const st = getState();
  const sessions = sortedSessions();
  const w = routine.workouts[idx];
  const unit = st.settings.unit;
  const slots = w.slots.map((slot, i) => {
    const ex = getExercise(slot.exerciseId);
    const sug = suggestNext({ slot, routine, sessions, unit, increment: incrementFor(slot.exerciseId) });
    return {
      i, exerciseId: slot.exerciseId, exerciseName: ex.name, technique: slot.technique || 'none',
      tulMin: sug.tulMin, tulMax: sug.tulMax, suggestion: sug.weight, sugText: sug.text, action: sug.action,
      last: sug.last ? { weight: sug.lastWeight, reps: sug.last.reps, tul: sug.last.tul } : null,
      weight: sug.weight,
    };
  });
  R = {
    id: uid(), routineId: routine.id, routineName: routine.name, workoutId: w.id, workoutName: w.name,
    readiness, unit, startedAt: Date.now(), slots, queue: slots.map((s) => s.i), done: [],
    phase: 'ready', pending: [], sets: [], lastEndedAt: null,
  };
  persist();
}

// ── Transitions ─────────────────────────────────────────────────────────────────────────────
function setPhase(phase, patch = {}) {
  Object.assign(R, patch, { phase });
  persist();
  redraw();
}

function finishPrimary() {
  const slot = cur();
  const rounds = R.ext?.rounds || [];
  const endedAt = rounds.length ? rounds[rounds.length - 1].end : R.loadEndedAt;
  R.pending.push({
    slot: slot.i, weight: slot.weight, startedAt: R.loadStartedAt, endedAt,
    tul: Math.round((R.loadEndedAt - R.loadStartedAt) / 100) / 10,
    extraSeconds: Math.round(rounds.reduce((s, r) => s + (r.end - r.start), 0) / 1000),
    rounds: rounds.length,
  });
  R.ext = null;
  if (technique(slot.technique).linkNext && R.queue.length > 1) {
    // Pre-exhaust: straight into the next exercise, minimal countdown.
    R.done.push(R.queue.shift());
    toast('Pre-exhaust: straight into the next exercise');
    setPhase('prep', { prepStartedAt: Date.now(), prepSeconds: 3 });
  } else {
    setPhase('record');
  }
}

function estimateReps(exerciseId, tech, tul) {
  const hist = exerciseHistory(sortedSessions(), exerciseId, familyOf(tech)).map((h) => h.set);
  return Math.max(1, Math.round(tul / repSeconds(hist)));
}

function saveRecords(root) {
  const nextOrder = () => R.sets.filter((s) => !s.skipped).length + 1;
  for (let k = 0; k < R.pending.length; k++) {
    const p = R.pending[k];
    const slot = R.slots[p.slot];
    const val = (name) => root.querySelector(`[name="${name}-${k}"]`);
    const weight = Number(val('w').value);
    const reps = Number(val('r').value);
    const tul = Number(val('t').value);
    if (!(tul > 0)) { toast('Enter the time under load'); return false; }
    if (val('w').value === '') { toast(`Enter the weight for ${slot.exerciseName} (0 for bodyweight)`); return false; }
    slot.weight = weight;
    R.sets.push({
      exerciseId: slot.exerciseId, exerciseName: slot.exerciseName, order: nextOrder(), slotIndex: slot.i,
      weight: isNaN(weight) ? 0 : weight, unit: R.unit, reps: isNaN(reps) ? 0 : reps, tul,
      startedAt: p.startedAt, endedAt: p.endedAt, technique: slot.technique,
      extraReps: Number(val('x')?.value) || 0, extraSeconds: p.extraSeconds || 0,
      failed: val('f').checked, notes: val('n').value.trim(), suggestedWeight: slot.suggestion,
    });
    R.lastEndedAt = p.endedAt;
  }
  const lastSlot = R.pending[R.pending.length - 1].slot;
  R.pending = [];
  if (R.queue[0] === lastSlot) R.done.push(R.queue.shift());
  return true;
}

function finishWorkout() {
  const logged = R.sets.filter((s) => !s.skipped);
  clearRunner();
  keepAwake(false);
  if (!logged.length) { R = null; toast('Workout discarded (nothing logged)'); navigate('#/train'); return; }
  const session = {
    id: R.id, routineId: R.routineId, routineName: R.routineName, workoutId: R.workoutId,
    workoutName: R.workoutName, readiness: R.readiness, startedAt: R.startedAt,
    endedAt: R.lastEndedAt || Date.now(), sets: R.sets, notes: '',
  };
  addSession(session);
  R = null;
  navigate('#/summary/' + session.id);
}

function advanceOrFinish() {
  if (!R.queue.length) finishWorkout();
  else setPhase('ready');
}

// ── Rendering ───────────────────────────────────────────────────────────────────────────────
let rootEl = null;
function redraw() { if (rootEl) { rootEl.innerHTML = render(); afterRender(); } }

function topBar() {
  const dots = R.slots.map((s) => {
    const cls = R.done.includes(s.i) ? 'done' : (R.queue[0] === s.i ? 'cur' : '');
    return `<i class="${cls}"></i>`;
  }).join('');
  return `<div class="run-top">
    <div class="dots" aria-label="progress">${dots}</div>
    <span class="muted num" data-clock>${fmtClock((Date.now() - R.startedAt) / 1000)}</span>
    <button class="small ghost" data-act="menu" aria-label="Workout menu">•••</button>
  </div>
  <div class="card tight hidden" data-menu>
    <div class="btn-row"><button class="small" data-act="end">End &amp; save</button><button class="small danger" data-act="discard">Discard</button></div>
  </div>`;
}

function ring(cls, label, big) {
  return `<div class="timer-wrap ${cls}" data-ring>
    <svg viewBox="0 0 320 320" aria-hidden="true">
      <circle class="bg" cx="160" cy="160" r="140"/>
      <circle class="fg" cx="160" cy="160" r="140" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-fg/>
      ${cls.includes('zone-') && R.phase === 'load' ? (() => {
        const s = cur(); const f = s.tulMin / s.tulMax;
        return `<circle class="mark" cx="160" cy="160" r="140" stroke-dasharray="3 ${C}" stroke-dashoffset="${-f * C}"/>`;
      })() : ''}
    </svg>
    <div class="timer-center"><div class="timer-big" data-timer>${big}</div><div class="timer-label" data-label>${label}</div></div>
  </div>`;
}

function renderReady() {
  const s = cur();
  const t = technique(s.technique);
  const set = exSettings(s.exerciseId);
  const inc = incrementFor(s.exerciseId);
  const ex = getExercise(s.exerciseId);
  const pos = R.done.length + 1;
  return `${topBar()}
    ${R.lastEndedAt ? `<div class="transition">Since last set <b class="num" data-trans>0:00</b> · keep moving</div>` : ''}
    <div class="ex-name">${esc(s.exerciseName)}</div>
    <div class="ex-meta">Exercise ${pos} of ${R.slots.length} · target ${s.tulMin}–${s.tulMax}s${set.setup ? ` · <b>${esc(set.setup)}</b>` : ''}</div>
    ${t.id !== 'none' ? `<div class="tech-box"><b>${esc(t.name)}.</b> ${esc(t.description)}</div>` : ''}
    ${s.last ? `<div class="last-time" style="margin-top:12px">
        <div><b>${esc(fmtNum(s.last.weight))}</b><small>last ${R.unit}</small></div>
        <div><b>${fmtSec(s.last.tul)}</b><small>last TUL</small></div>
        <div><b>${s.last.reps ?? '–'}</b><small>last reps</small></div></div>` : ''}
    <p class="muted" style="margin:10px 0">${esc(s.sugText)}</p>
    ${stepper({ name: 'weight', value: s.weight, unit: R.unit, step: inc })}
    <details style="margin-top:10px"><summary>Machine setup &amp; cues</summary>
      <label class="field"><span>Setup (seat, pads, grip), remembered for next time</span>
        <input name="setup" value="${esc(set.setup || '')}" placeholder="e.g. Seat 4, back pad 2"></label>
      <label class="field"><span>Weight increment on this machine (${R.unit})</span>
        <input name="increment" type="number" inputmode="decimal" step="any" value="${esc(set.increment || '')}" placeholder="${esc(fmtNum(inc))}"></label>
      ${ex.cues ? `<p class="muted" style="font-size:14px">${esc(ex.cues)}</p>` : ''}
    </details>
    <button class="primary huge" data-act="start" style="margin-top:14px">Start exercise</button>
    <div class="btn-row" style="margin-top:10px">
      <button class="small" data-act="later" ${R.queue.length > 1 ? '' : 'disabled'}>Machine busy, do later</button>
      <button class="small ghost" data-act="skip">Skip</button>
    </div>`;
}

function renderPrep() {
  const s = cur();
  return `${topBar()}
    <div class="ex-name" style="text-align:center">${esc(s.exerciseName)}</div>
    <div class="prep-weight">${s.weight != null ? esc(fmtNum(s.weight)) + ' ' + R.unit : ''}</div>
    ${ring('zone-prep', 'Get ready', R.prepSeconds)}
    <p class="muted" style="text-align:center">Get set up and take the slack out. Slow, smooth turnarounds.</p>
    <button class="ghost big" data-act="cancel">Cancel</button>`;
}

function renderLoad() {
  const s = cur();
  return `${topBar()}
    <div class="row between"><b style="font-size:20px">${esc(s.exerciseName)}</b><span class="muted">${s.weight != null ? esc(fmtNum(s.weight)) + ' ' + R.unit : ''}</span></div>
    ${ring('zone-below', 'Keep going', '0:00')}
    <div class="cadence" data-cadence></div>
    <button class="primary huge" data-act="done">Failure: done</button>
    <button class="ghost big" data-act="cancel" style="margin-top:6px">Restart set</button>`;
}

function renderExtReady() {
  const s = cur();
  const t = technique(s.technique);
  const rounds = R.ext?.rounds?.length || 0;
  return `${topBar()}
    <div class="ex-name">${esc(s.exerciseName)}</div>
    <p class="ex-meta">Primary set: <b>${fmtSec((R.loadEndedAt - R.loadStartedAt) / 1000)}</b>${rounds ? ` · ${rounds} ${esc(t.extLabel.toLowerCase())}${rounds > 1 ? 's' : ''} done` : ''}</p>
    <div class="tech-box"><b>${esc(t.name)}.</b> ${esc(t.description)}</div>
    <button class="primary huge" data-act="extStart">${t.restSeconds ? `Rest ${t.restSeconds}s, then go` : `Start ${esc(t.extLabel.toLowerCase())}`}</button>
    <button class="ghost big" data-act="extSkip" style="margin-top:6px">${rounds ? 'Finish exercise' : 'Skip technique'}</button>`;
}

function renderExtRest() {
  const s = cur();
  const t = technique(s.technique);
  return `${topBar()}
    <div class="ex-name" style="text-align:center">${esc(s.exerciseName)}</div>
    ${ring('zone-prep', 'Rest, stay in the machine', t.restSeconds)}`;
}

function renderExtLoad() {
  const s = cur();
  const t = technique(s.technique);
  return `${topBar()}
    <div class="ex-name" style="text-align:center">${esc(s.exerciseName)}</div>
    ${ring('zone-in', esc(t.extLabel), '0:00')}
    <button class="primary huge" data-act="extDone">Done</button>`;
}

function renderRecord() {
  const blocks = R.pending.map((p, k) => {
    const s = R.slots[p.slot];
    const t = technique(s.technique);
    const reps = estimateReps(s.exerciseId, s.technique, p.tul);
    return `<div class="record-card">
      <h3>${esc(s.exerciseName)} ${t.short ? `<span class="pill accent">${esc(t.short)}</span>` : ''}</h3>
      <div class="record-grid">
        <div><div class="lbl">Weight (${R.unit})</div>${stepper({ name: `w-${k}`, value: p.weight, step: incrementFor(s.exerciseId) })}</div>
        <div><div class="lbl">Reps (full reps completed)</div>${stepper({ name: `r-${k}`, value: reps, step: 1, decimals: 0 })}</div>
        <div><div class="lbl">Time under load (s), recorded automatically</div>${stepper({ name: `t-${k}`, value: Math.round(p.tul), step: 1, decimals: 0 })}</div>
        ${t.extension ? `<div><div class="lbl">Extra reps from ${esc(t.name.toLowerCase())} (${fmtSec(p.extraSeconds)} extra)</div>${stepper({ name: `x-${k}`, value: p.rounds ? 2 : 0, step: 1, decimals: 0 })}</div>` : ''}
        <label class="switch"><span>Reached true momentary failure</span><input type="checkbox" name="f-${k}" checked></label>
        <input name="n-${k}" placeholder="Note (optional)">
      </div>
    </div>`;
  }).join('');
  const lastPending = R.pending[R.pending.length - 1]?.slot;
  const last = R.queue.length === 0 || (R.queue.length === 1 && R.queue[0] === lastPending);
  return `${topBar()}
    <h1>Log set${R.pending.length > 1 ? 's' : ''}</h1>
    ${blocks}
    <button class="primary big" data-act="save">${last ? 'Save &amp; finish workout' : 'Save &amp; next exercise'}</button>`;
}

export function render() {
  if (!R) R = loadRunner();
  if (!R) return `<div class="empty"><p>No workout in progress.</p><a class="btn primary" href="#/train">Go to Train</a></div>`;
  if (!R.queue.length && R.phase !== 'record') { setTimeout(finishWorkout); return ''; }
  switch (R.phase) {
    case 'prep': return renderPrep();
    case 'load': return renderLoad();
    case 'extReady': return renderExtReady();
    case 'extRest': return renderExtRest();
    case 'extLoad': return renderExtLoad();
    case 'record': return renderRecord();
    default: return renderReady();
  }
}

// ── Live updates ────────────────────────────────────────────────────────────────────────────
let fired = {};
function afterRender() {
  fired = {};
  if (R?.phase === 'load') {
    // Don't re-fire milestone beeps when resuming mid-set.
    const t = (Date.now() - R.loadStartedAt) / 1000;
    const s = cur();
    if (t >= s.tulMin) fired.min = true;
    if (t >= s.tulMax) fired.max = true;
  }
  tick();
}

function cadenceCue(t) {
  const c = getState().settings.cadence;
  if (!c || c === 'off') return '';
  const [up, down] = c.split('-').map(Number);
  const pos = t % (up + down);
  const lifting = pos < up;
  const phaseKey = Math.floor(t / (up + down)) * 2 + (lifting ? 0 : 1);
  if (fired.cad !== phaseKey) { fired.cad = phaseKey; beep.cadence(lifting); }
  const left = Math.ceil(lifting ? up - pos : up + down - pos);
  return `${lifting ? 'LIFT' : 'LOWER'} ${left}`;
}

function tick() {
  if (!R || !rootEl) return;
  const now = Date.now();
  const $ = (sel) => rootEl.querySelector(sel);
  const clock = $('[data-clock]');
  if (clock) clock.textContent = fmtClock((now - R.startedAt) / 1000);
  const trans = $('[data-trans]');
  if (trans && R.lastEndedAt) trans.textContent = fmtClock((now - R.lastEndedAt) / 1000);
  const fg = $('[data-fg]');
  const timer = $('[data-timer]');

  if (R.phase === 'prep' || R.phase === 'extRest') {
    const startKey = R.phase === 'prep' ? 'prepStartedAt' : 'restStartedAt';
    const total = R.phase === 'prep' ? R.prepSeconds : technique(cur().technique).restSeconds;
    const remain = total - (now - R[startKey]) / 1000;
    if (remain <= 0) {
      beep.go(); buzz(80);
      const startAt = R[startKey] + total * 1000;
      if (R.phase === 'prep') setPhase('load', { loadStartedAt: startAt });
      else { R.ext.start = startAt; setPhase('extLoad'); }
      return;
    }
    const sec = Math.ceil(remain);
    if (sec <= 3 && fired.count !== sec) { fired.count = sec; beep.tick(); buzz(20); }
    if (timer) timer.textContent = sec;
    if (fg) fg.setAttribute('stroke-dashoffset', C * (1 - remain / total));
  } else if (R.phase === 'load') {
    const s = cur();
    const t = (now - R.loadStartedAt) / 1000;
    if (timer) timer.textContent = fmtClock(t);
    if (fg) fg.setAttribute('stroke-dashoffset', C * (1 - Math.min(1, t / s.tulMax)));
    const ringEl = $('[data-ring]');
    const label = $('[data-label]');
    let zone = 'zone-below', text = `Keep going · ${s.tulMin}s target`;
    if (t >= s.tulMax) { zone = 'zone-over'; text = 'Past target · heavier next time'; }
    else if (t >= s.tulMin) { zone = 'zone-in'; text = 'In target zone'; }
    if (ringEl && !ringEl.classList.contains(zone)) {
      ringEl.classList.remove('zone-below', 'zone-in', 'zone-over'); ringEl.classList.add(zone);
    }
    if (label) label.textContent = text;
    if (t >= s.tulMin && !fired.min) { fired.min = true; beep.target(); buzz(60); }
    if (t >= s.tulMax && !fired.max) { fired.max = true; beep.ceiling(); buzz(60); }
    const cad = $('[data-cadence]');
    if (cad) cad.textContent = cadenceCue(t);
  } else if (R.phase === 'extLoad') {
    const t = (now - R.ext.start) / 1000;
    if (timer) timer.textContent = fmtClock(t);
    if (fg) fg.setAttribute('stroke-dashoffset', C * (1 - Math.min(1, t / 60)));
  }
}

export function mount(root) {
  rootEl = root;
  if (!R) return null;
  if (getState().settings.wakeLock) keepAwake(true);
  afterRender();
  const iv = setInterval(tick, 100);

  const offSteppers = bindSteppers(root, (name, v) => {
    if (name === 'weight' && R.phase === 'ready') { cur().weight = v; persist(); }
  });
  const onChange = (ev) => {
    const el = ev.target;
    if (!R || R.phase !== 'ready') return;
    if (el.name === 'setup') setExSetting(cur().exerciseId, { setup: el.value.trim() });
    if (el.name === 'increment') {
      setExSetting(cur().exerciseId, { increment: Number(el.value) || null });
      redraw();
    }
  };
  root.addEventListener('change', onChange);

  const offActs = actions(root, {
    menu: () => root.querySelector('[data-menu]')?.classList.toggle('hidden'),
    end: () => {
      if (!confirm('End the workout now and save what you’ve logged?')) return;
      R.queue = []; R.pending = []; finishWorkout();
    },
    discard: () => {
      if (!confirm('Discard this workout? Nothing will be saved.')) return;
      clearRunner(); R = null; keepAwake(false); navigate('#/train');
    },
    start: () => {
      unlock();
      if (cur().weight == null) { toast('Set a weight first'); return; }
      setPhase('prep', { prepStartedAt: Date.now(), prepSeconds: Number(getState().settings.prepSeconds) || 10 });
    },
    cancel: () => {
      // If we were mid pre-exhaust pair, the pending first set stays and is logged with this one.
      setPhase('ready');
    },
    done: () => {
      beep.done();
      R.loadEndedAt = Date.now();
      if (technique(cur().technique).extension) setPhase('extReady', { ext: { rounds: [] } });
      else finishPrimary();
    },
    extStart: () => {
      const t = technique(cur().technique);
      if (t.restSeconds) setPhase('extRest', { restStartedAt: Date.now() });
      else { R.ext.start = Date.now(); setPhase('extLoad'); }
    },
    extDone: () => {
      beep.done();
      R.ext.rounds.push({ start: R.ext.start, end: Date.now() });
      const t = technique(cur().technique);
      if (t.maxRounds && R.ext.rounds.length < t.maxRounds) setPhase('extReady');
      else finishPrimary();
    },
    extSkip: () => finishPrimary(),
    save: () => { if (saveRecords(root)) advanceOrFinish(); },
    later: () => {
      if (R.pending.length) { toast('Finish the pre-exhaust pair first'); return; }
      R.queue.push(R.queue.shift());
      toast('Moved to the end of the workout');
      setPhase('ready');
    },
    skip: () => {
      if (!confirm(`Skip ${cur().exerciseName} this session?`)) return;
      const s = cur();
      R.sets.push({ exerciseId: s.exerciseId, exerciseName: s.exerciseName, slotIndex: s.i, skipped: true, technique: s.technique });
      R.done.push(R.queue.shift());
      // A pre-exhaust partner already performed still gets logged.
      if (R.pending.length) setPhase('record');
      else advanceOrFinish();
    },
  });

  return () => {
    clearInterval(iv);
    offSteppers(); offActs();
    root.removeEventListener('change', onChange);
    rootEl = null;
  };
}
