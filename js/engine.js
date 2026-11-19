// Training engine: pure functions, no DOM. Covers performance comparison, the post-workout
// verdict, the recovery-interval recommendation, and next-session weight suggestions.
//
// ── Measuring a set ──────────────────────────────────────────────────────────────────────────
// HIT sets differ in both load and time under load (TUL), so neither alone tells you whether
// you got stronger. Load × TUL is misleading too: adding 10% weight and losing 25% TUL usually
// means you *are* stronger, but load × TUL says you got weaker.
//
// We use an Epley-style capacity estimate with TUL turned into rep-equivalents:
//     capacity = load × (1 + TUL / (30 × repSeconds))
// repSeconds is the median seconds-per-rep for that exercise across your own history, so the
// model adapts to your cadence (≈10 s for a 5/5 cadence, ≈6 s for 2/4). This gives a sensible
// trade-off between load and time, and it's the single number everything else is built on.

import { technique } from './data/techniques.js';
import { clamp, median, mean, roundTo, calendarDays, addDays, fmtSec, fmtPct, plural } from './util.js';

export const KG_PER_LB = 0.45359237;
export const DEFAULT_REP_SECONDS = 10;
/** A change smaller than this (±1.5% ≈ 5–6 s of TUL at the same load) counts as "held". */
export const CHANGE_THRESHOLD = 0.015;

export const toKg = (w, unit) => (unit === 'lb' ? w * KG_PER_LB : w);
export const convertWeight = (w, from, to) => {
  if (w == null || from === to) return w;
  return to === 'kg' ? w * KG_PER_LB : w / KG_PER_LB;
};

export const familyOf = (techId) => technique(techId).family;
export const isLogged = (set) => !!set && !set.skipped && Number(set.tul) > 0;
const setTime = (set, session) => set.startedAt ?? session.startedAt;

export const byStart = (a, b) => a.startedAt - b.startedAt;

/** Logged sets of one exercise (same technique family) before `beforeTs`, oldest first. */
export function exerciseHistory(sessions, exerciseId, family = 'standard', beforeTs = Infinity) {
  const out = [];
  for (const session of sessions) {
    if (session.startedAt >= beforeTs) continue;
    for (const set of session.sets || []) {
      if (set.exerciseId === exerciseId && isLogged(set) && familyOf(set.technique) === family) {
        out.push({ set, session });
      }
    }
  }
  return out.sort((a, b) => setTime(a.set, a.session) - setTime(b.set, b.session));
}

/** Median seconds per rep across the given sets (fallback: 10 s), bounded to a sane range. */
export function repSeconds(sets) {
  const d = sets.filter((s) => s && s.reps > 0 && s.tul > 0).map((s) => s.tul / s.reps);
  return clamp(median(d) ?? DEFAULT_REP_SECONDS, 3, 30);
}

const isLoaded = (set) => Number(set.weight) > 0;

/** Capacity estimate in kg-equivalents. Bodyweight sets (weight 0) use a unit load of 1. */
export function capacity(set, repSec = DEFAULT_REP_SECONDS) {
  if (!isLogged(set)) return null;
  const load = isLoaded(set) ? toKg(Number(set.weight), set.unit || 'kg') : 1;
  return load * (1 + set.tul / (30 * repSec));
}

export function classifyChange(change) {
  if (change > CHANGE_THRESHOLD) return 'improved';
  if (change < -CHANGE_THRESHOLD) return 'regressed';
  return 'held';
}

/**
 * Compare a set with the most recent comparable set in `history`.
 * status: new | improved | held | regressed | unclear (one of the two sets wasn't to failure)
 */
export function compareSet(set, history) {
  const prev = history.length ? history[history.length - 1].set : null;
  const repSec = repSeconds([...history.map((h) => h.set), set]);
  const cap = capacity(set, repSec);
  if (!prev || isLoaded(prev) !== isLoaded(set)) return { prev, change: null, status: 'new', cap, repSec };
  const change = cap / capacity(prev, repSec) - 1;
  if (set.failed === false || prev.failed === false) return { prev, change, status: 'unclear', cap, repSec };
  return { prev, change, status: classifyChange(change), cap, repSec };
}

export function routineConfig(routine) {
  const base = routine?.intervalDays ?? 7;
  return {
    base,
    min: routine?.minIntervalDays ?? Math.max(2, base - 2),
    max: routine?.maxIntervalDays ?? base * 2,
    tulMin: routine?.tulMin ?? 60,
    tulMax: routine?.tulMax ?? 90,
  };
}

/** Did the trainee actually perform this set's technique? */
export function techniquePerformed(set) {
  const t = technique(set.technique);
  if (t.id === 'none') return false;
  if (t.extension) return (set.extraSeconds || 0) > 0 || (set.extraReps || 0) > 0;
  return true;
}

export const VERDICTS = {
  baseline: { title: 'Baseline recorded', icon: '◎', tone: 'neutral' },
  progressed: { title: 'You progressed', icon: '▲', tone: 'good' },
  held: { title: 'Held steady', icon: '▶', tone: 'warn' },
  regressed: { title: 'Recover more', icon: '▼', tone: 'bad' },
};

/**
 * The post-workout verdict and the recommended minimum interval before the next session.
 * `sessions` may or may not include `session`; only sessions that started earlier are used.
 */
export function evaluateSession(session, sessions, routine) {
  const prior = sessions.filter((s) => s.id !== session.id && s.startedAt < session.startedAt).sort(byStart);
  const rows = (session.sets || []).filter(isLogged).map((set) => {
    const hist = exerciseHistory(prior, set.exerciseId, familyOf(set.technique));
    return { exerciseId: set.exerciseId, name: set.exerciseName, set, ...compareSet(set, hist) };
  });

  const compared = rows.filter((r) => ['improved', 'held', 'regressed'].includes(r.status));
  const counts = { improved: 0, held: 0, regressed: 0 };
  compared.forEach((r) => counts[r.status]++);
  const unclear = rows.filter((r) => r.status === 'unclear').length;
  const meanChange = compared.length ? mean(compared.map((r) => r.change)) : null;

  const cfg = routineConfig(routine);
  const last = prior[prior.length - 1];
  const interval = last ? calendarDays(last.startedAt, session.startedAt) : null;
  const layoff = interval != null && interval > cfg.max;
  const I = interval ?? cfg.base;

  let type;
  if (!compared.length) type = 'baseline';
  else if (counts.regressed / compared.length >= 0.5 || meanChange <= -0.02) type = 'regressed';
  else if (counts.improved / compared.length >= 0.6 || (meanChange >= 0.02 && counts.regressed <= 1)) type = 'progressed';
  else type = 'held';

  const notes = [];
  const n = compared.length;
  let rec;
  switch (type) {
    case 'baseline':
      rec = cfg.base;
      notes.push('This is your reference point. From next session you’ll get weight suggestions and a progress verdict.');
      break;
    case 'progressed':
      rec = clamp(I, cfg.min, cfg.max);
      notes.push(`${counts.improved} of ${n} exercises improved (average ${fmtPct(meanChange)}).` +
        (interval != null ? ` A ${interval}-day gap gave you enough time to recover and adapt, so keep it.` : ''));
      if (prior.length >= 2 && prior.slice(-2).every((s) => s.verdict?.type === 'progressed') && I > cfg.min) {
        notes.push('That’s three progressions in a row. If you want to, try one day less next time and see what the next verdict says.');
      }
      break;
    case 'held': {
      const add = layoff ? 0 : Math.max(1, Math.round(I * 0.2));
      rec = layoff ? cfg.base : clamp(I + add, cfg.min, cfg.max);
      notes.push(`Performance mostly held (average ${fmtPct(meanChange)}; ${counts.improved} up, ${counts.regressed} down).`);
      notes.push(layoff
        ? `This came after a ${interval}-day gap, so go back to your base gap of ${cfg.base} days.`
        : `In HIT, a plateau usually means you’re training again before adaptation has finished. It rarely means you need more work. Adding ${plural(rec - I, 'day')}.`);
      break;
    }
    case 'regressed': {
      const add = Math.max(2, Math.round(I * 0.4));
      rec = layoff ? cfg.base : clamp(Math.max(I + add, cfg.base), cfg.min, cfg.max);
      notes.push(`Performance dropped on ${counts.regressed} of ${n} exercises (average ${fmtPct(meanChange)}).`);
      notes.push(layoff
        ? `This came after a ${interval}-day gap, longer than this routine’s maximum of ${cfg.max}. Lost conditioning is a more likely cause than poor recovery. Go back to your base gap of ${cfg.base} days.`
        : `Your body hadn’t finished recovering from the last session. Wait longer before the next one: ${rec} days instead of ${I}.`);
      if (prior.length && prior[prior.length - 1].verdict?.type === 'regressed') {
        notes.push('That’s two "recover more" verdicts in a row. Consider dropping an exercise, or switching to Consolidated Three for a few sessions.');
      }
      break;
    }
  }

  const techDays = Math.min(2, rows.filter((r) => techniquePerformed(r.set))
    .reduce((s, r) => s + technique(r.set.technique).recoveryDays, 0));
  if (techDays > 0) {
    rec = Math.min(Math.round(rec + techDays), cfg.max + 2);
    notes.push(`+${techDays} day${techDays === 1 ? '' : 's'} because you used intensity techniques, which raise the recovery cost.`);
  }
  if (session.readiness === 'low' && type === 'regressed') {
    notes.push('You logged low readiness before this workout. Poor sleep, stress or illness can explain a one-off dip.');
  }
  if (unclear) notes.push(`${plural(unclear, 'set')} not taken to failure ${unclear === 1 ? 'was' : 'were'} left out of the comparison.`);

  return {
    type,
    ...VERDICTS[type],
    notes,
    counts,
    compared: n,
    meanChange,
    intervalUsed: interval,
    recommendedInterval: rec,
    restDays: Math.max(0, rec - 1),
    nextDate: addDays(session.startedAt, rec),
    rows,
  };
}

/** Which workout of the routine comes next (rotates A → B → A …). */
export function nextWorkoutIndex(routine, sessions) {
  if (!routine?.workouts?.length) return 0;
  const last = [...sessions].sort(byStart).reverse().find((s) => s.routineId === routine.id);
  if (!last) return 0;
  const i = routine.workouts.findIndex((w) => w.id === last.workoutId);
  return i < 0 ? 0 : (i + 1) % routine.workouts.length;
}

/** Recovery status relative to the most recent session's recommendation. */
export function recoveryStatus(sessions, now = Date.now()) {
  const last = [...sessions].sort(byStart).pop();
  if (!last || !last.verdict) return null;
  const daysSince = calendarDays(last.startedAt, now);
  const daysUntil = calendarDays(now, last.verdict.nextDate);
  return {
    last,
    daysSince,
    daysUntil,
    nextDate: last.verdict.nextDate,
    recommendedInterval: last.verdict.recommendedInterval,
    ready: daysUntil <= 0,
  };
}

/**
 * Weight suggestion for the next time this slot is performed.
 * Double progression on TUL: beat your time at the same load, and once you go past the top of
 * the TUL window, use the capacity model to pick a load that lands in the upper part of the
 * window (capped at +10%, at least one increment).
 */
export function suggestNext({ slot, routine, sessions, unit = 'kg', increment = 2.5 }) {
  const cfg = routineConfig(routine);
  const tulMin = slot.tulMin ?? cfg.tulMin;
  const tulMax = slot.tulMax ?? cfg.tulMax;
  const range = Math.max(1, tulMax - tulMin);
  const hist = exerciseHistory(sessions, slot.exerciseId, familyOf(slot.technique));
  const base = { tulMin, tulMax, last: null, weight: null, action: 'first' };

  if (!hist.length) {
    return { ...base, text: `First time. Pick a weight you can move slowly for ${tulMin}–${tulMax}s before failure.` };
  }
  const last = hist[hist.length - 1].set;
  const lastW = roundTo(convertWeight(Number(last.weight) || 0, last.unit || 'kg', unit), 0.01);
  const r = repSeconds(hist.map((h) => h.set));
  const cap = lastW * (1 + last.tul / (30 * r));
  const weightFor = (t) => cap / (1 + t / (30 * r));
  const out = { ...base, last, lastWeight: lastW, beatTul: last.tul };

  if (last.failed === false) {
    return { ...out, weight: lastW, action: 'hold',
      text: `Last set stopped short of failure. Same weight, and this time go to true failure.` };
  }
  if (!(lastW > 0)) {
    return { ...out, weight: 0, action: 'hold', text: `Beat ${fmtSec(last.tul)}.` };
  }
  if (last.tul > tulMax) {
    let w = Math.min(weightFor(tulMax - 0.25 * range), lastW * 1.10);
    w = roundTo(w, increment);
    if (w <= lastW) w = roundTo(lastW + increment, 0.01);
    return { ...out, weight: w, action: 'increase',
      text: `${fmtSec(last.tul)} beat the ${tulMax}s ceiling. Load goes up.` };
  }
  if (last.tul < tulMin - 5) {
    let w = Math.max(weightFor(tulMin + 0.25 * range), lastW * 0.90);
    w = roundTo(w, increment);
    if (w >= lastW) w = roundTo(Math.max(0, lastW - increment), 0.01);
    return { ...out, weight: w, action: 'decrease',
      text: `${fmtSec(last.tul)} was under the ${tulMin}s floor. Ease the load slightly.` };
  }
  return { ...out, weight: lastW, action: 'hold',
    text: `Same load. Beat ${fmtSec(last.tul)}. Past ${tulMax}s, the load goes up.` };
}
