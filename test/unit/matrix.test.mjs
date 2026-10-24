// Every exercise × variant × phone/camera situation, with synthetic skeletons.
// A real rep must count the same however the phone is held, whichever side
// the player faces, near or far, portrait or landscape, noisy or slow; and
// "level/upright" exercises must never count a standing player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzer } from '../../public/js/reps.js';
import { run, cycle, squatPose, pushupPose, curlPose, jackPose, lungePose, plankPose, wallsitPose, TRANSFORMS, transform } from './skeleton.mjs';

const jack = (t) => {
  const p = t < 0 ? 0 : (1 - Math.cos((2 * Math.PI * t) / 1000)) / 2;
  return jackPose(15 + 155 * p, 0.02 + 0.16 * p);
};
// [exercise, variant, pose over time, expected score in 60 s]
const MOVES = [
  ['squat', 0, (t) => squatPose(cycle(t, 172, 85, 3000)), 20],
  ['squat', 1, (t) => squatPose(cycle(t, 172, 108, 3000)), 20],
  ['pushup', 0, (t) => pushupPose(cycle(t, 170, 80, 2000)), 30],
  ['pushup', 1, (t) => pushupPose(cycle(t, 170, 80, 2000), { knees: true }), 30],
  ['jack', 0, jack, 60],
  ['jack', 1, jack, 60],
  ['lunge', 0, (t) => lungePose(cycle(t, 170, 92, 2500)), 24],
  ['lunge', 1, (t) => lungePose(cycle(t, 170, 110, 2500)), 24],
  ['plank', 0, () => plankPose(0), 60],
  ['plank', 1, () => plankPose(0), 60],
  ['wallsit', 0, () => wallsitPose(90), 60],
  ['wallsit', 1, () => wallsitPose(125), 60],
];
const GRAVITY = new Set(['pushup', 'plank', 'wallsit']); // need the real up

for (const [ex, v, pose, expected] of MOVES) {
  test(`${ex}${v ? ' (low-impact)' : ''}: same score in every situation`, () => {
    const got = {};
    for (const [name, tr] of Object.entries(TRANSFORMS)) {
      const opts = { aspect: tr.aspect || 1, ...(tr.up ? { up: tr.up } : {}) };
      const score = run(createAnalyzer(ex, v), (t) => transform(pose(t), name), { opts }).result.score;
      got[name] = score;
      if (name === 'rot90, no sensor' && GRAVITY.has(ex)) {
        // without a sensor a sideways phone can't tell level from upright: never more than the truth
        assert.ok(score <= expected, `${name}: ${score}`);
      } else {
        assert.equal(score, expected, `${name}: got ${score}, all: ${JSON.stringify(got)}`);
      }
    }
    assert.equal(run(createAnalyzer(ex, v), pose, { opts: { jitter: 0.005 } }).result.score, expected, 'loose clothes (jitter)');
    for (const fps of [12, 8]) {
      const score = run(createAnalyzer(ex, v), pose, { fps }).result.score;
      assert.ok(Math.abs(score - expected) <= (ex === 'jack' ? 3 : 1), `${fps} fps: ${score}`);
    }
  });
}

test('standing still never scores, in any situation (no sensor included)', () => {
  const standing = () => plankPose(0, { standing: true }); // upright body, arms down
  for (const ex of ['squat', 'pushup', 'jack', 'lunge', 'plank', 'wallsit']) {
    for (const [name, tr] of Object.entries(TRANSFORMS)) {
      const opts = { aspect: tr.aspect || 1, ...(tr.up ? { up: tr.up } : {}) };
      const score = run(createAnalyzer(ex, 0), () => transform(standing(), name), { opts }).result.score;
      assert.equal(score, 0, `${ex}, ${name}: ${score}`);
    }
  }
});

test('standing arm curls never count as push-ups, even on a sideways phone without a sensor', () => {
  for (const name of ['upright', 'rot90, no sensor', 'rot90 + sensor', 'mirrored']) {
    const tr = TRANSFORMS[name];
    const opts = tr.up ? { up: tr.up } : {};
    const score = run(createAnalyzer('pushup', 0), (t) => transform(curlPose(cycle(t, 170, 40, 1500)), name), { opts }).result.score;
    assert.equal(score, 0, `${name}: ${score}`);
  }
});

test('fast but human-possible reps are all counted', () => {
  // 100 jumping jacks a minute, 40 squats a minute, 60 push-ups a minute
  // (the 100th jack ends exactly on the buzzer, so 99–100 is right)
  assert.ok(run(createAnalyzer('jack', 0), (t) => {
    const p = t < 0 ? 0 : (1 - Math.cos((2 * Math.PI * t) / 600)) / 2;
    return jackPose(15 + 155 * p, 0.02 + 0.16 * p);
  }, { fps: 30 }).result.score >= 99);
  assert.equal(run(createAnalyzer('squat', 0), (t) => squatPose(cycle(t, 172, 85, 1500))).result.score, 40);
  assert.equal(run(createAnalyzer('pushup', 0), (t) => pushupPose(cycle(t, 170, 80, 1000))).result.score, 60);
});
