// Built-in routines. Each routine is a rotation of one or more workouts.
//
// intervalDays      default days from one session to the next (7 = same weekday next week)
// minIntervalDays   floor for the adaptive recommendation
// maxIntervalDays   ceiling; a gap longer than this is treated as a layoff, not recovery
// tulMin / tulMax   target time-under-load window (seconds) for the primary set
// Slots may override tulMin/tulMax and carry a technique (see techniques.js).

const slot = (exerciseId, technique = 'none', extra = {}) => ({ exerciseId, technique, ...extra });

export const BUILT_IN_ROUTINES = [
  {
    id: 'big-five',
    name: 'Foundation Five',
    builtIn: true,
    tagline: 'Five compound movements, once a week. The core slow-strength workout.',
    description:
      'Five compound machine movements covering the whole body, done in a fixed order with as little rest as possible between them. ' +
      'Each set runs roughly 1.5–2 minutes of time under load at a very slow cadence (after McGuff & Little, 2009). When you go past the top of that range, add weight. ' +
      'Start with 7 days between sessions. The app lengthens the gap if your progress stalls.',
    intervalDays: 7, minIntervalDays: 5, maxIntervalDays: 14,
    tulMin: 90, tulMax: 120,
    workouts: [
      { id: 'A', name: 'Foundation Five', slots: [
        slot('seated-row'), slot('chest-press'), slot('pulldown'), slot('overhead-press'), slot('leg-press'),
      ] },
    ],
  },
  {
    id: 'big-five-split',
    name: 'Foundation Split (A/B)',
    builtIn: true,
    tagline: 'Shorter alternating sessions for when the full Foundation Five gets too taxing.',
    description:
      'As you get stronger, each set takes more out of you. Splitting the work into two shorter workouts keeps the intensity high and lets you train a little more often. ' +
      'Each muscle group is still hit hard about once a week. A covers legs, pulling and pressing. B covers the posterior chain, rowing and overhead work.',
    intervalDays: 4, minIntervalDays: 3, maxIntervalDays: 10,
    tulMin: 90, tulMax: 120,
    workouts: [
      { id: 'A', name: 'Workout A', slots: [slot('leg-press'), slot('pulldown'), slot('chest-press')] },
      { id: 'B', name: 'Workout B', slots: [slot('leg-curl'), slot('seated-row'), slot('overhead-press'), slot('lower-back')] },
    ],
  },
  {
    id: 'consolidated-three',
    name: 'Consolidated Three',
    builtIn: true,
    tagline: 'Minimum effective dose for advanced trainees, or for breaking a stall.',
    description:
      'Three movements that together load almost all the musculature: leg press, pulldown and chest press. ' +
      'Use it when recovery has become the limiting factor, for example two "recover more" verdicts in a row, or when you are very strong relative to your recovery ability. ' +
      'Expect long gaps between sessions.',
    intervalDays: 10, minIntervalDays: 7, maxIntervalDays: 21,
    tulMin: 90, tulMax: 120,
    workouts: [
      { id: 'A', name: 'Consolidated Three', slots: [slot('leg-press'), slot('pulldown'), slot('chest-press')] },
    ],
  },
  {
    id: 'full-body-ab',
    name: 'Full-Body A/B',
    builtIn: true,
    tagline: 'Classic HIT A/B. Two alternating full-body workouts, 60–90 s sets.',
    description:
      'Two full-body workouts done alternately, each with 5–6 exercises at a slow, controlled cadence. Every set goes to momentary muscular failure. ' +
      'The shorter TUL window (60–90 s) suits a slightly heavier load. Start with 3–4 days between sessions. Every major muscle group is trained in both workouts, from different angles.',
    intervalDays: 3, minIntervalDays: 2, maxIntervalDays: 8,
    tulMin: 60, tulMax: 90,
    workouts: [
      { id: 'A', name: 'Workout A', slots: [
        slot('leg-press'), slot('pullover'), slot('chest-press'), slot('seated-row'), slot('calf-raise'), slot('abdominal'),
      ] },
      { id: 'B', name: 'Workout B', slots: [
        slot('leg-curl'), slot('leg-extension'), slot('pulldown'), slot('overhead-press'), slot('lower-back'), slot('biceps-curl'),
      ] },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    builtIn: true,
    tagline: 'Alternate upper and lower days. More exercises per area, each trained about weekly.',
    description:
      'Good if you want more volume for a particular area while still doing one set per exercise. Alternate Upper and Lower with about 3 days between sessions, so each half of the body gets roughly 6 days to recover. ' +
      'Upper alternates pulling and pushing so you can keep moving between machines. Lower puts leg extension straight before leg press as a pre-exhaust.',
    intervalDays: 3, minIntervalDays: 2, maxIntervalDays: 8,
    tulMin: 60, tulMax: 90,
    workouts: [
      { id: 'U', name: 'Upper', slots: [
        slot('pullover'), slot('chest-press'), slot('pulldown'), slot('overhead-press'), slot('biceps-curl'), slot('triceps-extension'),
      ] },
      { id: 'L', name: 'Lower', slots: [
        slot('leg-extension', 'preExhaust'), slot('leg-press'), slot('leg-curl'), slot('hip-adduction'), slot('calf-raise'), slot('abdominal'),
      ] },
    ],
  },
  {
    id: 'pre-exhaust',
    name: 'Pre-Exhaust Circuit',
    builtIn: true,
    tagline: 'Isolation into compound with zero rest. Very demanding.',
    description:
      'Each pair starts with an isolation movement taken to failure, then goes straight into a compound movement for the same muscle. In the compound lift the fresh helper muscles push the pre-fatigued target muscle past its normal failure point. ' +
      'Move straight from one machine to the next. Log both sets after the pair. Very demanding, so allow 5+ days between sessions.',
    intervalDays: 5, minIntervalDays: 4, maxIntervalDays: 12,
    tulMin: 60, tulMax: 90,
    workouts: [
      { id: 'A', name: 'Pre-Exhaust', slots: [
        slot('leg-extension', 'preExhaust'), slot('leg-press'),
        slot('pullover', 'preExhaust'), slot('pulldown'),
        slot('pec-fly', 'preExhaust'), slot('chest-press'),
        slot('lateral-raise', 'preExhaust'), slot('overhead-press'),
      ] },
    ],
  },
  {
    id: 'big-five-advanced',
    name: 'Foundation Five: Intensified',
    builtIn: true,
    tagline: 'Short block with intensifiers. Use for 3–4 sessions, then go back to standard.',
    description:
      'Foundation Five with one intensifier on most exercises, for breaking through a plateau. Forced negatives and forced reps need a training partner. ' +
      'Each technique raises the recovery cost, so the default gap is longer and the post-workout recommendation adds rest for every technique you actually do. ' +
      'The primary set is still compared like-for-like, so the progress charts stay honest.',
    intervalDays: 9, minIntervalDays: 7, maxIntervalDays: 16,
    tulMin: 90, tulMax: 120,
    workouts: [
      { id: 'A', name: 'Foundation Five+', slots: [
        slot('seated-row', 'restPause'), slot('chest-press', 'forcedNegatives'), slot('pulldown', 'staticHold'),
        slot('overhead-press'), slot('leg-press', 'restPause'),
      ] },
    ],
  },
];
