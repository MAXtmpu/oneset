// Demo data generator: about 5 months of simulated Foundation Five training. Weights are picked with the
// app's own suggestion engine, and TUL comes from a hidden "true strength" with realistic effects
// (recovery, time of day, order fatigue, readiness), so the insights have something to find.

import { BUILT_IN_ROUTINES } from './data/routines.js';
import { EXERCISES } from './data/exercises.js';
import { suggestNext, evaluateSession } from './engine.js';
import { uid, clamp } from './util.js';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function generateDemo({ unit = 'kg', sessions: count = 22, seed = 7 } = {}) {
  const rand = rng(seed);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  const routine = BUILT_IN_ROUTINES[0];
  const slots = routine.workouts[0].slots;
  const startCap = { 'seated-row': 95, 'chest-press': 85, pulldown: 90, 'overhead-press': 55, 'leg-press': 230 };
  const repSec = 10;
  const out = [];
  let t = Date.now() - 150 * 86400000;
  let fitness = 1; // multiplier on true capacity

  for (let n = 0; n < count; n++) {
    // Interval: mostly 6–8 days, sometimes short or long.
    const r = rand();
    const interval = n === 0 ? 0 : r < 0.15 ? 4 : r < 0.25 ? 5 : r < 0.75 ? 7 : r < 0.9 ? 9 : 12;
    t += interval * 86400000;
    const morning = rand() < 0.5;
    const d = new Date(t);
    d.setHours(morning ? 7 + Math.floor(rand() * 3) : 17 + Math.floor(rand() * 3), Math.floor(rand() * 60), 0, 0);
    const start = d.getTime();

    // Adaptation: short gaps blunt progress, long gaps begin to detrain.
    if (n > 0) {
      const gain = interval <= 4 ? -0.01 : interval === 5 ? 0.005 : interval <= 9 ? 0.022 : 0.008;
      fitness *= 1 + gain * Math.max(0.5, 1 - n / 60);
    }
    const readiness = rand() < 0.15 ? 'low' : rand() < 0.2 ? 'high' : 'normal';
    const dayEffect = (morning ? 0.02 : -0.01) + (readiness === 'low' ? -0.035 : readiness === 'high' ? 0.02 : 0);

    const session = { id: uid(), routineId: routine.id, routineName: routine.name, workoutId: 'A', workoutName: routine.workouts[0].name,
      readiness, startedAt: start, sets: [], notes: '', demo: true };
    let clock = start + 60000;
    // Now and then the gym is busy and one exercise gets pushed to the end.
    const order = [...slots];
    if (rand() < 0.3) { const k = Math.floor(rand() * 4); order.push(order.splice(k, 1)[0]); }
    order.forEach((slot, i) => {
      const ex = EXERCISES.find((e) => e.id === slot.exerciseId);
      const sug = suggestNext({ slot, routine, sessions: out, unit, increment: unit === 'kg' ? 2.5 : 5 });
      const trueCap = startCap[slot.exerciseId] * fitness * (1 + dayEffect - 0.012 * i + gauss() * 0.015);
      const weight = sug.weight ?? Math.round((trueCap / (1 + 100 / (30 * repSec))) / 2.5) * 2.5;
      const tul = clamp(Math.round((trueCap / weight - 1) * 30 * repSec), 25, 200);
      const transition = 30000 + Math.floor(rand() * 120000);
      clock += i === 0 ? 0 : transition;
      const set = {
        exerciseId: slot.exerciseId, exerciseName: ex.name, order: i + 1, slotIndex: slots.indexOf(slot), weight, unit,
        reps: Math.max(1, Math.round(tul / repSec)), tul, startedAt: clock, endedAt: clock + tul * 1000,
        technique: 'none', extraReps: 0, extraSeconds: 0, failed: true, notes: '', suggestedWeight: sug.weight,
      };
      clock = set.endedAt;
      session.sets.push(set);
    });
    session.endedAt = clock;
    session.verdict = evaluateSession(session, out, routine);
    delete session.verdict.rows;
    out.push(session);
  }
  return out;
}
