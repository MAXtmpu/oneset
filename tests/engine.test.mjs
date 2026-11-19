import test from 'node:test';
import assert from 'node:assert/strict';
import { capacity, compareSet, evaluateSession, suggestNext, nextWorkoutIndex, exerciseHistory } from '../js/engine.js';
import { insightReport, strengthScoreSeries } from '../js/insights.js';
import { BUILT_IN_ROUTINES } from '../js/data/routines.js';
import { generateDemo } from '../js/demo.js';

const DAY = 86400000;
const bigFive = BUILT_IN_ROUTINES.find((r) => r.id === 'big-five');
const split = BUILT_IN_ROUTINES.find((r) => r.id === 'big-five-split');

let n = 0;
function mkSession(daysAgo, sets, extra = {}) {
  const startedAt = Date.now() - daysAgo * DAY;
  return {
    id: 's' + (++n), routineId: 'big-five', workoutId: 'A', workoutName: 'Foundation Five', startedAt, endedAt: startedAt + 900000,
    sets: sets.map(([exerciseId, weight, tul, reps], i) => ({
      exerciseId, exerciseName: exerciseId, order: i + 1, weight, unit: 'kg', tul, reps: reps ?? Math.round(tul / 10),
      startedAt: startedAt + i * 180000, endedAt: startedAt + i * 180000 + tul * 1000, technique: 'none', failed: true,
    })),
    ...extra,
  };
}

test('heavier-but-shorter counts as progress; load × time would not', () => {
  const a = { weight: 100, tul: 90, unit: 'kg', reps: 9 };
  const b = { weight: 110, tul: 65, unit: 'kg', reps: 6 };
  assert.ok(capacity(b, 10) > capacity(a, 10));
  assert.ok(110 * 65 < 100 * 90);
});

test('compareSet classifies changes', () => {
  const prev = { set: { weight: 100, tul: 90, reps: 9, unit: 'kg' } };
  assert.equal(compareSet({ weight: 100, tul: 105, reps: 10, unit: 'kg' }, [prev]).status, 'improved');
  assert.equal(compareSet({ weight: 100, tul: 91, reps: 9, unit: 'kg' }, [prev]).status, 'held');
  assert.equal(compareSet({ weight: 100, tul: 70, reps: 7, unit: 'kg' }, [prev]).status, 'regressed');
  assert.equal(compareSet({ weight: 100, tul: 70, reps: 7, unit: 'kg', failed: false }, [prev]).status, 'unclear');
  assert.equal(compareSet({ weight: 100, tul: 70, unit: 'kg' }, []).status, 'new');
});

test('verdict: baseline, progressed keeps interval, regressed adds rest', () => {
  const s1 = mkSession(14, [['leg-press', 200, 100], ['chest-press', 80, 100]]);
  const v1 = evaluateSession(s1, [s1], bigFive);
  assert.equal(v1.type, 'baseline');
  assert.equal(v1.recommendedInterval, 7);

  const s2 = mkSession(7, [['leg-press', 200, 112], ['chest-press', 80, 110]]);
  const v2 = evaluateSession(s2, [s1, s2], bigFive);
  assert.equal(v2.type, 'progressed');
  assert.equal(v2.intervalUsed, 7);
  assert.equal(v2.recommendedInterval, 7);
  assert.equal(v2.restDays, 6);

  const s3 = mkSession(3, [['leg-press', 200, 95], ['chest-press', 80, 92]]);
  const v3 = evaluateSession(s3, [s1, s2, s3], bigFive);
  assert.equal(v3.type, 'regressed');
  assert.ok(v3.recommendedInterval >= 7, `got ${v3.recommendedInterval}`);
});

test('held adds a day or more', () => {
  const s1 = mkSession(7, [['leg-press', 200, 100], ['pulldown', 80, 100]]);
  const s2 = mkSession(0, [['leg-press', 200, 101], ['pulldown', 80, 99]]);
  const v = evaluateSession(s2, [s1, s2], bigFive);
  assert.equal(v.type, 'held');
  assert.ok(v.recommendedInterval > 7);
});

test('a long layoff is not treated as under-recovery', () => {
  const s1 = mkSession(30, [['leg-press', 200, 100]]);
  const s2 = mkSession(0, [['leg-press', 200, 80]]);
  const v = evaluateSession(s2, [s1, s2], bigFive);
  assert.equal(v.type, 'regressed');
  assert.equal(v.recommendedInterval, 7);
});

test('intensifiers add recovery days', () => {
  const s1 = mkSession(7, [['leg-press', 200, 100]]);
  const s2 = mkSession(0, [['leg-press', 200, 112]]);
  s2.sets[0].technique = 'restPause';
  s2.sets[0].extraSeconds = 20;
  const v = evaluateSession(s2, [s1, s2], bigFive);
  assert.equal(v.type, 'progressed');
  assert.equal(v.recommendedInterval, 8);
});

test('suggestNext: increase over ceiling, decrease under floor, hold in range', () => {
  const slot = { exerciseId: 'leg-press', technique: 'none' };
  const over = suggestNext({ slot, routine: bigFive, sessions: [mkSession(7, [['leg-press', 100, 130]])], increment: 2.5 });
  assert.equal(over.action, 'increase');
  assert.ok(over.weight > 100 && over.weight <= 110, `got ${over.weight}`);

  const under = suggestNext({ slot, routine: bigFive, sessions: [mkSession(7, [['leg-press', 100, 70]])], increment: 2.5 });
  assert.equal(under.action, 'decrease');
  assert.ok(under.weight < 100 && under.weight >= 90, `got ${under.weight}`);

  const hold = suggestNext({ slot, routine: bigFive, sessions: [mkSession(7, [['leg-press', 100, 100]])], increment: 2.5 });
  assert.equal(hold.action, 'hold');
  assert.equal(hold.weight, 100);

  const first = suggestNext({ slot, routine: bigFive, sessions: [], increment: 2.5 });
  assert.equal(first.weight, null);
});

test('suggestNext converts units', () => {
  const slot = { exerciseId: 'leg-press', technique: 'none' };
  const s = suggestNext({ slot, routine: bigFive, sessions: [mkSession(7, [['leg-press', 100, 100]])], unit: 'lb', increment: 5 });
  assert.ok(Math.abs(s.weight - 220.46) < 0.1);
});

test('negative-only sets are not compared with standard sets', () => {
  const s1 = mkSession(7, [['leg-press', 100, 100]]);
  const s2 = mkSession(0, [['leg-press', 130, 60]]);
  s2.sets[0].technique = 'negativeOnly';
  assert.equal(exerciseHistory([s1], 'leg-press', 'negative').length, 0);
  const v = evaluateSession(s2, [s1, s2], bigFive);
  assert.equal(v.type, 'baseline');
});

test('A/B rotation', () => {
  assert.equal(nextWorkoutIndex(split, []), 0);
  const s = mkSession(1, [['leg-press', 100, 100]], { routineId: 'big-five-split', workoutId: 'A' });
  assert.equal(nextWorkoutIndex(split, [s]), 1);
  const s2 = mkSession(0, [['leg-curl', 50, 100]], { routineId: 'big-five-split', workoutId: 'B' });
  assert.equal(nextWorkoutIndex(split, [s, s2]), 0);
});

test('demo data produces progress and insights', () => {
  const demo = generateDemo({ sessions: 24 });
  assert.equal(demo.length, 24);
  const score = strengthScoreSeries(demo);
  assert.ok(score[score.length - 1].y > 105, `strength score ${score[score.length - 1].y}`);
  const report = insightReport(demo);
  const texts = report.sections.map((s) => s.text).filter(Boolean);
  assert.ok(texts.length >= 2, 'expected at least two insights: ' + JSON.stringify(texts));
  const types = new Set(demo.map((s) => s.verdict.type));
  assert.ok(types.has('progressed'));
});
