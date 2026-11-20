// Persistence: one JSON document in localStorage, plus a separate key for an in-progress workout
// so a killed or reloaded app resumes exactly where you were.

import { BUILT_IN_ROUTINES } from './data/routines.js';
import { EXERCISES } from './data/exercises.js';
import { evaluateSession, byStart, isLogged } from './engine.js';
import { uid } from './util.js';

const KEY = 'myodose.v1';
const RUN_KEY = 'myodose.runner.v1';
const SCHEMA = 1;

export const DEFAULT_SETTINGS = {
  unit: 'kg',
  increment: 2.5,
  prepSeconds: 10,
  sound: true,
  cadence: 'off', // off | 4-4 | 5-5 | 10-10
  wakeLock: true,
  readinessPrompt: true,
};

function blank() {
  return {
    schema: SCHEMA,
    settings: { ...DEFAULT_SETTINGS },
    activeRoutineId: 'big-five',
    customRoutines: [],
    customExercises: [],
    exerciseSettings: {}, // { [exerciseId]: { setup: 'Seat 4', increment: 5 } }
    sessions: [],
  };
}

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function safeDel(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } }

// The app was called OneSet until November 2026. Move data saved under the old keys so nothing is lost.
for (const [oldKey, newKey] of [['oneset.v1', KEY], ['oneset.runner.v1', RUN_KEY]]) {
  const old = safeGet(oldKey);
  if (old !== null && safeGet(newKey) === null && safeSet(newKey, old)) safeDel(oldKey);
}

// Built-in workouts were renamed in v1.1. Older sessions keep the old label, so map them on load.
const RENAMED_WORKOUTS = { 'Big Five': 'Foundation Five', 'Big Three': 'Consolidated Three', 'Big Five+': 'Foundation Five+' };
const RENAMED_ROUTINES = {
  'The Big Five': 'Foundation Five', 'Big Five Split (A/B)': 'Foundation Split (A/B)',
  'Consolidated Big Three': 'Consolidated Three', 'Big Five: Intensified': 'Foundation Five: Intensified',
};
function migrate(data) {
  for (const s of data.sessions || []) {
    if (RENAMED_WORKOUTS[s.workoutName]) s.workoutName = RENAMED_WORKOUTS[s.workoutName];
    if (RENAMED_ROUTINES[s.routineName]) s.routineName = RENAMED_ROUTINES[s.routineName];
  }
  return data;
}

function load() {
  const raw = safeGet(KEY);
  if (!raw) return blank();
  try {
    const data = migrate(JSON.parse(raw));
    return { ...blank(), ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } };
  } catch {
    return blank();
  }
}

let state = load();
const listeners = new Set();

export const getState = () => state;

export function save() {
  const ok = safeSet(KEY, JSON.stringify(state));
  listeners.forEach((fn) => fn(state));
  return ok;
}
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function update(fn) { fn(state); return save(); }

// Ask the browser not to evict our data (Home Screen apps on iOS are already exempt from the
// 7-day script-storage cap; this is belt and braces).
export function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
}

// ── Lookups ─────────────────────────────────────────────────────────────────────────────────
export const allRoutines = () => [...BUILT_IN_ROUTINES, ...state.customRoutines];
export const getRoutine = (id) => allRoutines().find((r) => r.id === id) || null;
export const activeRoutine = () => getRoutine(state.activeRoutineId) || BUILT_IN_ROUTINES[0];

export const allExercises = () => [...EXERCISES, ...state.customExercises];
export const getExercise = (id) => allExercises().find((e) => e.id === id) || { id, name: id, cues: '', pattern: 'Other' };
export const exSettings = (id) => state.exerciseSettings[id] || {};
export const incrementFor = (id) => Number(exSettings(id).increment) || Number(state.settings.increment) || 2.5;

export function setExSetting(id, patch) {
  update((s) => { s.exerciseSettings[id] = { ...(s.exerciseSettings[id] || {}), ...patch }; });
}

export const sortedSessions = () => [...state.sessions].sort(byStart);

// ── Sessions ────────────────────────────────────────────────────────────────────────────────
/** Re-run verdicts in chronological order (after an edit/delete/import). */
export function recomputeVerdicts() {
  const sorted = sortedSessions();
  for (const s of sorted) {
    s.verdict = stripRows(evaluateSession(s, sorted, getRoutine(s.routineId)));
  }
}
// rows contain object references to sets; store only a light summary.
function stripRows(v) {
  const { rows, ...rest } = v;
  return { ...rest, rows: rows.map((r) => ({ exerciseId: r.exerciseId, change: r.change, status: r.status })) };
}

export function addSession(session) {
  update((s) => {
    s.sessions.push(session);
    session.verdict = stripRows(evaluateSession(session, s.sessions, getRoutine(session.routineId)));
  });
  return session;
}

export function updateSession(id, fn) {
  update((s) => {
    const sess = s.sessions.find((x) => x.id === id);
    if (sess) fn(sess);
    recomputeVerdicts();
  });
}

export function deleteSession(id) {
  update((s) => {
    s.sessions = s.sessions.filter((x) => x.id !== id);
    recomputeVerdicts();
  });
}

export const getSession = (id) => state.sessions.find((s) => s.id === id) || null;

// ── Routines ────────────────────────────────────────────────────────────────────────────────
export function duplicateRoutine(id) {
  const src = getRoutine(id);
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = 'r-' + uid();
  copy.name = src.name + ' (copy)';
  copy.builtIn = false;
  copy.workouts.forEach((w) => { w.id = w.id || uid(); });
  update((s) => s.customRoutines.push(copy));
  return copy;
}

export function saveRoutine(routine) {
  update((s) => {
    const i = s.customRoutines.findIndex((r) => r.id === routine.id);
    if (i >= 0) s.customRoutines[i] = routine; else s.customRoutines.push(routine);
  });
}

export function deleteRoutine(id) {
  update((s) => {
    s.customRoutines = s.customRoutines.filter((r) => r.id !== id);
    if (s.activeRoutineId === id) s.activeRoutineId = 'big-five';
  });
}

export function addCustomExercise(name, pattern) {
  const ex = { id: 'x-' + uid(), name: name.trim(), pattern: pattern || 'Other', equipment: 'machine', cues: '', custom: true };
  update((s) => s.customExercises.push(ex));
  return ex;
}

// ── In-progress workout ─────────────────────────────────────────────────────────────────────
export function loadRunner() {
  const raw = safeGet(RUN_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
export const saveRunner = (r) => safeSet(RUN_KEY, JSON.stringify(r));
export const clearRunner = () => safeDel(RUN_KEY);

// ── Backup ──────────────────────────────────────────────────────────────────────────────────
export function exportJSON() {
  return JSON.stringify({ app: 'Myodose', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.sessions)) throw new Error('Not a Myodose backup file.');
  migrate(data);
  const next = { ...blank(), ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } };
  delete next.app; delete next.exportedAt;
  state = next;
  recomputeVerdicts();
  save();
  return state.sessions.length;
}

export function exportCSV() {
  const head = ['date', 'time', 'routine', 'workout', 'order', 'exercise', 'weight', 'unit', 'reps', 'tul_s',
    'technique', 'extra_reps', 'extra_s', 'to_failure', 'transition_s', 'readiness', 'verdict', 'notes'];
  const rows = [head];
  for (const s of sortedSessions()) {
    const sets = (s.sets || []).filter(isLogged).sort((a, b) => a.order - b.order);
    sets.forEach((set, i) => {
      const d = new Date(set.startedAt || s.startedAt);
      const prev = sets[i - 1];
      rows.push([
        d.toISOString().slice(0, 10), d.toTimeString().slice(0, 5), s.routineName, s.workoutName, set.order,
        set.exerciseName, set.weight, set.unit, set.reps, Math.round(set.tul), set.technique || 'none',
        set.extraReps || 0, Math.round(set.extraSeconds || 0), set.failed === false ? 'no' : 'yes',
        prev && prev.endedAt ? Math.round((set.startedAt - prev.endedAt) / 1000) : '',
        s.readiness || '', s.verdict?.type || '', (set.notes || '').replace(/\n/g, ' '),
      ]);
    });
  }
  return rows.map((r) => r.map((c) => {
    const v = String(c ?? '');
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',')).join('\n');
}

export function resetAll() {
  state = blank();
  clearRunner();
  save();
}

/** Replace sessions wholesale (used by demo data). */
export function replaceSessions(sessions) {
  update((s) => { s.sessions = sessions; });
  update(() => recomputeVerdicts());
}
