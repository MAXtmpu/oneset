// Intensity techniques ("intensifiers"). Each is a structured modifier on a routine slot.
//
// extension: the runner offers a post-failure phase that is timed separately. Progression
//            always compares the *primary* set only, so intensifiers never distort the trend.
// restSeconds: for rest-pause, the pause before each extra burst.
// linkNext: go straight into the next exercise with no rest (pre-exhaust).
// family: sets are only compared with sets of the same family (negative-only work is not
//         comparable to normal sets).
// recoveryDays: extra rest added to the post-workout recommendation when the technique was
//               actually performed. HIT authors consistently warn these raise recovery cost.

export const TECHNIQUES = {
  none: {
    id: 'none', name: 'Standard', short: '',
    description: 'One set to momentary muscular failure at a slow, controlled cadence.',
    extension: false, recoveryDays: 0, family: 'standard',
  },
  restPause: {
    id: 'restPause', name: 'Rest-Pause', short: 'RP',
    description: 'At failure, rest ~15 s, then continue to failure again. Up to 2 extra bursts.',
    extension: true, restSeconds: 15, maxRounds: 2, recoveryDays: 1, family: 'standard',
    extLabel: 'Rest-pause burst',
  },
  forcedReps: {
    id: 'forcedReps', name: 'Forced Reps', short: 'FR',
    description: 'At failure, a partner assists the lifting phase for 2–3 more reps; you lower slowly.',
    extension: true, recoveryDays: 1, family: 'standard', extLabel: 'Forced reps',
  },
  forcedNegatives: {
    id: 'forcedNegatives', name: 'Forced Negatives', short: 'FN',
    description: 'At failure, a partner (or your other limb) lifts the weight; you resist the lowering for 8–10 s. 2–3 reps.',
    extension: true, recoveryDays: 1, family: 'standard', extLabel: 'Forced negatives',
  },
  staticHold: {
    id: 'staticHold', name: 'Timed Static Hold', short: 'SH',
    description: 'At failure, hold the weight in the strongest position you can, pushing hard until it lowers despite your effort.',
    extension: true, recoveryDays: 0.5, family: 'standard', extLabel: 'Static hold',
  },
  dropSet: {
    id: 'dropSet', name: 'Breakdown (Drop Set)', short: 'DS',
    description: 'At failure, immediately reduce the weight 20–30% and continue to failure again.',
    extension: true, recoveryDays: 1, family: 'standard', extLabel: 'Breakdown',
  },
  negativeOnly: {
    id: 'negativeOnly', name: 'Negative-Only', short: 'NEG',
    description: 'Use ~20–40% more weight than normal. A partner lifts; you lower each rep over 8–10 s. Compared only with other negative-only sets.',
    extension: false, recoveryDays: 1, family: 'negative',
  },
  preExhaust: {
    id: 'preExhaust', name: 'Pre-Exhaust (into next)', short: 'PE',
    description: 'Isolation movement taken to failure, then go straight into the next (compound) exercise with zero rest. You log both afterwards.',
    extension: false, linkNext: true, recoveryDays: 0, family: 'standard',
  },
};

export const TECHNIQUE_LIST = Object.values(TECHNIQUES);
export const technique = (id) => TECHNIQUES[id] || TECHNIQUES.none;
