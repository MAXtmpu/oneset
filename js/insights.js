// Analytics: strength trend and the "what affects my performance" insights. Pure functions.
//
// Two measures per set:
//  • change: capacity vs the previous comparable set. Used for recovery questions (rest
//    interval), because recovery is about progress *since the last stimulus*.
//  • residual: log(capacity) minus the average of up to 3 neighbouring sessions on each side for
//    that exercise. This removes the long-term trend, which leaves the day-to-day effect. Used
//    for acute factors: time of day, exercise order, transition time and readiness.

import { capacity, repSeconds, familyOf, isLogged, byStart, compareSet } from './engine.js';
import { mean, calendarDays } from './util.js';

const WINDOW = 3;

/** Per-set observations across all sessions. */
export function buildObservations(sessions) {
  const sorted = [...sessions].sort(byStart);
  // Group logged sets by exercise + family.
  const groups = new Map();
  for (const session of sorted) {
    const logged = (session.sets || []).filter(isLogged).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    logged.forEach((set, i) => {
      const key = set.exerciseId + '|' + familyOf(set.technique);
      if (!groups.has(key)) groups.set(key, []);
      const prevSet = i > 0 ? logged[i - 1] : null;
      const transition = prevSet && set.startedAt && prevSet.endedAt
        ? Math.max(0, (set.startedAt - prevSet.endedAt) / 1000) : null;
      groups.get(key).push({ session, set, position: i + 1, transition });
    });
  }

  const obs = [];
  for (const list of groups.values()) {
    const r = repSeconds(list.map((o) => o.set));
    const logs = list.map((o) => Math.log(capacity(o.set, r)));
    list.forEach((o, i) => {
      const prev = i > 0 ? list[i - 1].set : null;
      const comparable = prev && (Number(prev.weight) > 0) === (Number(o.set.weight) > 0);
      const change = comparable ? Math.exp(logs[i] - logs[i - 1]) - 1 : null;
      const neighbours = [];
      for (let j = Math.max(0, i - WINDOW); j <= Math.min(list.length - 1, i + WINDOW); j++) {
        if (j !== i && (Number(list[j].set.weight) > 0) === (Number(o.set.weight) > 0)) neighbours.push(logs[j]);
      }
      const residual = neighbours.length >= 2 ? logs[i] - mean(neighbours) : null;
      obs.push({
        sessionId: o.session.id,
        startedAt: o.session.startedAt,
        exerciseId: o.set.exerciseId,
        position: o.position,
        transition: o.transition,
        readiness: o.session.readiness || 'normal',
        change,
        residual,
      });
    });
  }
  return obs;
}

/** Bucket observations and average a metric. Returns [{label, mean, n}] in bucket order. */
function bucketize(items, buckets, keyFn, valueFn) {
  return buckets.map((label) => {
    const vals = items.filter((x) => keyFn(x) === label).map(valueFn).filter((v) => v != null && isFinite(v));
    return { label, mean: vals.length ? mean(vals) : null, n: vals.length };
  });
}

const timeBucket = (ts) => {
  const h = new Date(ts).getHours();
  if (h < 9) return 'Early (<9)';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
};
const TIME_BUCKETS = ['Early (<9)', 'Morning', 'Afternoon', 'Evening'];

const restBucket = (d) => (d <= 3 ? '≤3 days' : d <= 5 ? '4–5 days' : d <= 7 ? '6–7 days' : d <= 10 ? '8–10 days' : '11+ days');
const REST_BUCKETS = ['≤3 days', '4–5 days', '6–7 days', '8–10 days', '11+ days'];

const transBucket = (s) => (s < 45 ? '<45s' : s < 90 ? '45–90s' : s < 180 ? '1.5–3 min' : '3 min+');
const TRANS_BUCKETS = ['<45s', '45–90s', '1.5–3 min', '3 min+'];


const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Session-level summaries: one row per session. */
export function sessionSummaries(sessions, obs = buildObservations(sessions)) {
  const sorted = [...sessions].sort(byStart);
  return sorted.map((s, i) => {
    const mine = obs.filter((o) => o.sessionId === s.id);
    const changes = mine.map((o) => o.change).filter((v) => v != null);
    const residuals = mine.map((o) => o.residual).filter((v) => v != null);
    const logged = (s.sets || []).filter(isLogged);
    return {
      session: s,
      interval: i > 0 ? calendarDays(sorted[i - 1].startedAt, s.startedAt) : null,
      change: changes.length ? mean(changes) : null,
      residual: residuals.length ? mean(residuals) : null,
      duration: s.endedAt ? (s.endedAt - s.startedAt) / 1000 : null,
      totalTul: logged.reduce((t, x) => t + x.tul, 0),
    };
  });
}

/**
 * Strength score: for each exercise, capacity relative to your first session (=100), carried
 * forward and averaged over every exercise seen so far. A/B splits still give a smooth line.
 */
export function strengthScoreSeries(sessions) {
  const sorted = [...sessions].sort(byStart);
  const first = new Map();
  const latest = new Map();
  const history = new Map();
  const out = [];
  for (const s of sorted) {
    let touched = false;
    for (const set of (s.sets || []).filter(isLogged)) {
      if (familyOf(set.technique) !== 'standard' || !(Number(set.weight) > 0)) continue;
      const h = history.get(set.exerciseId) || [];
      h.push(set);
      history.set(set.exerciseId, h);
      const r = repSeconds(h);
      // Re-anchor with the current cadence estimate so early sets aren't measured on a different scale.
      const baseCap = capacity(first.get(set.exerciseId) || set, r);
      if (!first.has(set.exerciseId)) first.set(set.exerciseId, set);
      latest.set(set.exerciseId, (capacity(set, r) / baseCap) * 100);
      touched = true;
    }
    if (touched) out.push({ x: s.startedAt, y: mean([...latest.values()]) });
  }
  return out;
}

/** Per-exercise series for charts. */
export function exerciseSeries(sessions, exerciseId, family = 'standard') {
  const sorted = [...sessions].sort(byStart);
  const rows = [];
  const hist = [];
  for (const s of sorted) {
    for (const set of (s.sets || [])) {
      if (set.exerciseId !== exerciseId || !isLogged(set) || familyOf(set.technique) !== family) continue;
      const cmp = compareSet(set, hist.map((x) => ({ set: x })));
      hist.push(set);
      rows.push({ x: set.startedAt ?? s.startedAt, set, session: s, change: cmp.change });
    }
  }
  const r = repSeconds(hist);
  rows.forEach((row) => { row.capacity = capacity(row.set, r); });
  return rows;
}

/** Which exercises have the most data (for the progress picker). */
export function exerciseUsage(sessions) {
  const m = new Map();
  for (const s of sessions) for (const set of (s.sets || [])) {
    if (!isLogged(set)) continue;
    const e = m.get(set.exerciseId) || { exerciseId: set.exerciseId, name: set.exerciseName, count: 0, last: 0 };
    e.count++; e.last = Math.max(e.last, s.startedAt); e.name = set.exerciseName || e.name;
    m.set(set.exerciseId, e);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

const MIN_N = 3;
const pct = (x) => `${Math.abs(x * 100).toFixed(1)}%`;

function bestWorst(buckets) {
  const ok = buckets.filter((b) => b.n >= MIN_N && b.mean != null);
  if (ok.length < 2) return null;
  const sorted = [...ok].sort((a, b) => b.mean - a.mean);
  return { best: sorted[0], worst: sorted[sorted.length - 1], diff: sorted[0].mean - sorted[sorted.length - 1].mean };
}

/**
 * Full insight report. Every analysis returns its buckets (for charts), and a sentence when
 * there's enough data and a big enough difference to be worth mentioning.
 */
export function insightReport(sessions) {
  const obs = buildObservations(sessions);
  const summaries = sessionSummaries(sessions, obs);
  const withResidual = obs.filter((o) => o.residual != null);
  const report = { sessionCount: sessions.length, sections: [] };

  // 1. Rest interval vs progress since last session.
  const rest = bucketize(summaries.filter((s) => s.interval != null), REST_BUCKETS,
    (s) => restBucket(s.interval), (s) => s.change);
  const restBW = bestWorst(rest);
  report.sections.push({
    id: 'rest', title: 'Rest between workouts', metric: 'Avg progress since previous session',
    buckets: rest,
    text: restBW && restBW.diff > 0.01
      ? `You progress most after ${restBW.best.label} of rest (${restBW.best.mean >= 0 ? '+' : '−'}${pct(restBW.best.mean)} per session) and least after ${restBW.worst.label}.`
      : null,
  });

  // 2. Time of day.
  const tod = bucketize(withResidual, TIME_BUCKETS, (o) => timeBucket(o.startedAt), (o) => o.residual);
  const todBW = bestWorst(tod);
  report.sections.push({
    id: 'time', title: 'Time of day', metric: 'Performance vs your trend',
    buckets: tod,
    text: todBW && todBW.diff > 0.015
      ? `${todBW.best.label} sessions run ${pct(todBW.diff)} stronger than ${todBW.worst.label.toLowerCase()} sessions, relative to your trend.`
      : null,
  });

  // 3. Exercise order. Each exercise is compared with itself: does it come in below trend when
  //    it gets pushed later than its usual slot (busy gym, routine change)?
  const posCounts = new Map();
  withResidual.forEach((o) => {
    const m = posCounts.get(o.exerciseId) || new Map();
    m.set(o.position, (m.get(o.position) || 0) + 1);
    posCounts.set(o.exerciseId, m);
  });
  const modal = new Map([...posCounts].map(([id, m]) => [id, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  const orderVaries = [...posCounts.values()].some((m) => m.size >= 2);
  const shiftLabel = (o) => {
    const d = o.position - modal.get(o.exerciseId);
    return d < 0 ? 'Earlier' : d > 0 ? 'Later' : 'Usual slot';
  };
  const order = bucketize(withResidual, ['Earlier', 'Usual slot', 'Later'], shiftLabel, (o) => o.residual);
  const [earlier, usual, later] = order;
  let orderText = null;
  if (!orderVaries && withResidual.length) {
    orderText = 'You always do your exercises in the same order, so the app can’t measure order effects yet. Change the order now and then (or tap "Machine busy, do later") and it can.';
  } else if (later.n >= MIN_N && usual.n >= MIN_N && usual.mean - later.mean > 0.01) {
    orderText = `When an exercise gets pushed later than its usual slot, it comes in ${pct(usual.mean - later.mean)} below trend. Pre-fatigue from earlier sets is costing you. Keep the exercises you most want to progress near the front.`;
  } else if (earlier.n >= MIN_N && usual.n >= MIN_N && earlier.mean - usual.mean > 0.01) {
    orderText = `Exercises moved earlier than usual run ${pct(earlier.mean - usual.mean)} above trend. Position matters for you.`;
  } else if (later.n >= MIN_N && usual.n >= MIN_N) {
    orderText = 'Moving an exercise later in the workout hasn’t measurably hurt it. Your order is flexible.';
  }
  report.sections.push({
    id: 'order', title: 'Exercise order', metric: 'Performance vs trend, compared with each exercise’s usual slot',
    buckets: orderVaries ? order : [],
    text: orderText,
  });

  // 4. Transition time between exercises.
  const trans = bucketize(withResidual.filter((o) => o.transition != null), TRANS_BUCKETS,
    (o) => transBucket(o.transition), (o) => o.residual);
  const transBW = bestWorst(trans);
  const avgTrans = mean(obs.filter((o) => o.transition != null).map((o) => o.transition));
  report.sections.push({
    id: 'transition', title: 'Rest between exercises', metric: 'Performance vs trend',
    buckets: trans,
    extra: avgTrans != null ? `Average transition: ${Math.round(avgTrans)}s` : null,
    text: transBW && transBW.diff > 0.015
      ? `Sets after a ${transBW.best.label} transition run ${pct(transBW.diff)} better than after ${transBW.worst.label}. Body by Science recommends moving quickly between machines for the metabolic effect. Weigh that against this.`
      : null,
  });

  // 5. Readiness.
  const ready = bucketize(withResidual, ['low', 'normal', 'high'], (o) => o.readiness, (o) => o.residual)
    .map((b) => ({ ...b, label: b.label[0].toUpperCase() + b.label.slice(1) }));
  const readyBW = bestWorst(ready);
  report.sections.push({
    id: 'readiness', title: 'How you felt beforehand', metric: 'Performance vs trend',
    buckets: ready,
    text: readyBW && readyBW.diff > 0.015
      ? `When you felt "${readyBW.best.label.toLowerCase()}" you performed ${pct(readyBW.diff)} better than when you felt "${readyBW.worst.label.toLowerCase()}". Your readiness check predicts how you'll perform.`
      : null,
  });

  // 6. Day of week.
  const dow = bucketize(withResidual, DOW, (o) => DOW[new Date(o.startedAt).getDay()], (o) => o.residual)
    .filter((b) => b.n > 0);
  const dowBW = bestWorst(dow);
  report.sections.push({
    id: 'dow', title: 'Day of week', metric: 'Performance vs trend',
    buckets: dow,
    text: dowBW && dowBW.diff > 0.02 ? `${dowBW.best.label} is your strongest training day; ${dowBW.worst.label} your weakest.` : null,
  });

  // Headline stats.
  const recent = summaries.slice(-8);
  report.stats = {
    avgInterval: mean(summaries.map((s) => s.interval).filter((v) => v != null)),
    avgDuration: mean(summaries.map((s) => s.duration).filter((v) => v != null)),
    avgTransition: avgTrans,
    recentChange: mean(recent.map((s) => s.change).filter((v) => v != null)),
    last90: sessions.filter((s) => s.startedAt > Date.now() - 90 * 86400000).length,
  };

  // Stalled / top movers.
  const usage = exerciseUsage(sessions);
  report.movers = usage.filter((u) => u.count >= 2).map((u) => {
    const ser = exerciseSeries(sessions, u.exerciseId).filter((r) => Number(r.set.weight) > 0);
    if (ser.length < 2) return null;
    const total = ser[ser.length - 1].capacity / ser[0].capacity - 1;
    // Stalled: the average of the last 3 sessions is no better than the 3 before (smoothed, so
    // one lucky day doesn't set an unbeatable bar).
    const avg = (rows) => mean(rows.map((r) => r.capacity));
    const stalled = ser.length >= 6 && avg(ser.slice(-3)) <= avg(ser.slice(-6, -3)) * 1.005;
    return { ...u, total, stalled, sessions: ser.length };
  }).filter(Boolean).sort((a, b) => b.total - a.total);

  return report;
}
