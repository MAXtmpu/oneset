// Exercise catalogue. Machine-first, as in most single-set-to-failure training.
// `pattern` groups exercises for the picker; `cues` are short form reminders shown in the gym.

export const EXERCISES = [
  // Foundation Five
  { id: 'seated-row', name: 'Seated Row', pattern: 'Pull', equipment: 'machine',
    cues: 'Chest on pad, shoulders down. Pull elbows back past the torso, pause, return slowly without letting the stack touch.' },
  { id: 'chest-press', name: 'Chest Press', pattern: 'Push', equipment: 'machine',
    cues: 'Handles at mid-chest. Press smoothly, stop just short of lockout, lower under control. Keep head back.' },
  { id: 'pulldown', name: 'Pulldown', pattern: 'Pull', equipment: 'machine',
    cues: 'Underhand or neutral grip. Pull to upper chest, squeeze, return slowly. Avoid swinging or leaning back.' },
  { id: 'overhead-press', name: 'Overhead Press', pattern: 'Push', equipment: 'machine',
    cues: 'Press up just short of lockout, lower until hands are near shoulders. No arching the low back.' },
  { id: 'leg-press', name: 'Leg Press', pattern: 'Legs', equipment: 'machine',
    cues: 'Feet hip-width, mid-plate. Push through heels, stop short of lockout, lower until knees are well bent. Breathe freely.' },

  // Common machine additions
  { id: 'pullover', name: 'Pullover', pattern: 'Pull', equipment: 'machine',
    cues: 'Elbows on pads, drive arc with elbows (not hands) down to torso, pause, return to full stretch slowly.' },
  { id: 'pec-fly', name: 'Pec Fly', pattern: 'Push', equipment: 'machine',
    cues: 'Forearms on pads, bring elbows together in front, pause, open to a comfortable stretch.' },
  { id: 'lateral-raise', name: 'Lateral Raise', pattern: 'Push', equipment: 'machine',
    cues: 'Lead with elbows to shoulder height, pause, lower slowly. Keep traps relaxed.' },
  { id: 'leg-extension', name: 'Leg Extension', pattern: 'Legs', equipment: 'machine',
    cues: 'Knee aligned with machine axis. Extend to full contraction, pause, lower slowly. Grip handles, hips down.' },
  { id: 'leg-curl', name: 'Leg Curl', pattern: 'Legs', equipment: 'machine',
    cues: 'Knee aligned with axis. Curl heels toward glutes, pause, extend slowly. Keep hips pinned.' },
  { id: 'calf-raise', name: 'Calf Raise', pattern: 'Legs', equipment: 'machine',
    cues: 'Balls of feet on edge. Rise fully onto toes, pause, lower to deep stretch slowly.' },
  { id: 'hip-adduction', name: 'Hip Adduction', pattern: 'Legs', equipment: 'machine',
    cues: 'Squeeze knees together, pause, open slowly to a comfortable stretch.' },
  { id: 'hip-abduction', name: 'Hip Abduction', pattern: 'Legs', equipment: 'machine',
    cues: 'Push knees apart, pause, return slowly without letting the stack touch.' },
  { id: 'lower-back', name: 'Lower Back Extension', pattern: 'Core', equipment: 'machine',
    cues: 'Extend smoothly to upright/slight extension, pause, return slowly. No jerking.' },
  { id: 'abdominal', name: 'Abdominal Crunch', pattern: 'Core', equipment: 'machine',
    cues: 'Curl ribcage toward pelvis, exhale and squeeze, return slowly without fully unloading.' },
  { id: 'torso-rotation', name: 'Torso Rotation', pattern: 'Core', equipment: 'machine',
    cues: 'Rotate from the trunk, not the arms. Pause at end range, return slowly. Do both sides.' },
  { id: 'biceps-curl', name: 'Biceps Curl', pattern: 'Arms', equipment: 'machine',
    cues: 'Elbows on pad aligned with axis. Curl fully, pause, lower slowly to near-straight.' },
  { id: 'triceps-extension', name: 'Triceps Extension', pattern: 'Arms', equipment: 'machine',
    cues: 'Elbows fixed. Extend fully, pause, return slowly.' },
  { id: 'shrug', name: 'Shrug', pattern: 'Pull', equipment: 'machine',
    cues: 'Elevate shoulders straight up, pause, lower to full stretch. No rolling.' },
  { id: 'neck-flexion', name: 'Neck Flexion', pattern: 'Core', equipment: 'machine',
    cues: 'Very controlled, small range. Never jerk. Pause at contraction.' },
  { id: 'neck-extension', name: 'Neck Extension', pattern: 'Core', equipment: 'machine',
    cues: 'Very controlled, small range. Never jerk. Pause at contraction.' },

  // Free-weight / bodyweight options
  { id: 'trap-bar-deadlift', name: 'Trap Bar Deadlift', pattern: 'Legs', equipment: 'free',
    cues: 'Slow and smooth, no bouncing at the bottom. Stand tall, lower under control.' },
  { id: 'squat', name: 'Squat', pattern: 'Legs', equipment: 'free',
    cues: 'Use safety pins. Smooth descent, stop short of lockout at top to keep tension.' },
  { id: 'chin-up', name: 'Chin-up', pattern: 'Pull', equipment: 'bodyweight',
    cues: 'Weight field = added load (0 for bodyweight). Slow up, pause, slow down.' },
  { id: 'dip', name: 'Dip', pattern: 'Push', equipment: 'bodyweight',
    cues: 'Weight field = added load (0 for bodyweight). Lower to a comfortable depth, press up slowly.' },
  { id: 'push-up', name: 'Push-up', pattern: 'Push', equipment: 'bodyweight',
    cues: 'Weight field = added load (0 for bodyweight). Rigid body, slow tempo.' },
];

export const PATTERNS = ['Push', 'Pull', 'Legs', 'Core', 'Arms'];
