// Exercise rules shared by the browser app and the Worker. Keep this file DOM-free.
// Every challenge lasts 60 seconds. "reps" exercises count repetitions, "hold"
// exercises count the seconds the pose was held correctly.

export const DURATION_MS = 60000;
export const SEGMENTS = 6; // pace grid: one square per 10 seconds
export const VARIANTS = 2; // 0 = standard, 1 = low-impact (ranked separately)

export const EXERCISES = {
  squat: {
    key: 'squat',
    kind: 'reps',
    emoji: '🦵',
    name: 'Squats',
    variants: ['Squats', 'Chair squats'],
    variantNotes: ['Thighs to parallel, stand tall.', 'Sit back until you touch a chair, then stand.'],
    setup: 'Stand 2–3 m from the camera, head to feet in frame. Side view works best.',
    tips: ['Heels stay down.', 'Push the hips back first.', 'Chest up, knees follow the toes.'],
    max: [80, 70], // most reps accepted in 60 s, per variant
    minGapMs: [500, 550], // two counted reps can never be closer than this
    floor: false,
  },
  pushup: {
    key: 'pushup',
    kind: 'reps',
    emoji: '💪',
    name: 'Push-ups',
    variants: ['Push-ups', 'Knee push-ups'],
    variantNotes: ['Chest down until elbows pass 90°, body straight.', 'Knees on the floor, body straight from knees to head.'],
    setup: 'Phone on the floor about 2 m away, side view, whole body in frame.',
    tips: ['Squeeze your glutes to stay straight.', 'Hands just wider than shoulders.', 'Lower slowly, push fast.'],
    max: [100, 110],
    minGapMs: [400, 380],
    floor: true,
    gravity: true, // 'level'/'upright' checks need the real up (gravity.js)
  },
  jack: {
    key: 'jack',
    kind: 'reps',
    emoji: '⭐',
    name: 'Jumping jacks',
    variants: ['Jumping jacks', 'Step jacks'],
    variantNotes: ['Hands overhead, feet wide, back together.', 'No jumping: step one foot out as the arms go up.'],
    setup: 'Face the camera, 2–3 m away, hands and feet in frame.',
    tips: ['Land softly on the balls of your feet.', 'Full arm swing — hands meet overhead.', 'Keep a steady rhythm.'],
    max: [130, 90],
    minGapMs: [300, 450],
    floor: false,
  },
  lunge: {
    key: 'lunge',
    kind: 'reps',
    emoji: '🚶',
    name: 'Lunges',
    variants: ['Lunges', 'Supported split squats'],
    variantNotes: ['Alternate legs. Both knees near 90°.', 'Hold a chair or wall, stay in a split stance, go down and up.'],
    setup: 'Side view works best, 2–3 m away, whole body in frame.',
    tips: ['Long step, upright torso.', 'Front knee over the ankle.', 'Back knee drops toward the floor.'],
    max: [70, 60],
    minGapMs: [550, 600],
    floor: false,
  },
  plank: {
    key: 'plank',
    kind: 'hold',
    emoji: '🪵',
    name: 'Plank',
    variants: ['Plank', 'Knee plank'],
    variantNotes: ['Forearms or hands, straight line from head to heels.', 'Knees down, straight line from head to knees.'],
    setup: 'Phone on the floor about 2 m away, side view, whole body in frame.',
    tips: ['Squeeze glutes and belly.', 'Look at the floor, neck long.', 'Breathe — don’t hold your breath.'],
    max: [60, 60],
    floor: true,
    gravity: true, // 'level'/'upright' checks need the real up (gravity.js)
  },
  wallsit: {
    key: 'wallsit',
    kind: 'hold',
    emoji: '🧱',
    name: 'Wall sit',
    variants: ['Wall sit', 'High wall sit'],
    variantNotes: ['Back on the wall, thighs parallel to the floor.', 'Back on the wall, knees bent only halfway.'],
    setup: 'Side view, 2–3 m away, whole body in frame.',
    tips: ['Knees over the ankles.', 'Press your whole back into the wall.', 'Hands off the thighs.'],
    max: [60, 60],
    floor: false,
    gravity: true, // 'level'/'upright' checks need the real up (gravity.js)
  },
};

export const EXERCISE_KEYS = Object.keys(EXERCISES);

export function exerciseName(ex, v = 0) {
  const e = EXERCISES[ex];
  return e ? e.variants[v] || e.name : ex;
}

export function scoreLabel(kind, score) {
  return kind === 'hold' ? `${score}s` : String(score);
}

// Nicknames: 2–20 letters/numbers in any script, plus space . _ -
// (\p{M} keeps Devanagari and other scripts with combining vowel signs working.)
const NICK_RE = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]{1,19}$/u;
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'chut', 'bhosd', 'madarc', 'behenc', 'randi', 'gaand', 'lund'];

export function cleanNick(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (s.length < 2 || !NICK_RE.test(s)) return null;
  const low = s.toLowerCase().replace(/[^\p{L}]/gu, '');
  if (BLOCKED.some((w) => low.includes(w))) return null;
  return s;
}
