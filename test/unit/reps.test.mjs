import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzer, createTapCounter, jointAngle, LM } from '../../public/js/reps.js';
import { frame, run, cycle, squatPose, pushupPose, curlPose, jackPose, lungePose, plankPose, wallsitPose, rotate90, UP_ROTATED, bendPose } from './skeleton.mjs';

test('skeleton helper produces the knee angle it was asked for', () => {
  for (const k of [170, 120, 90]) {
    const f = frame(0, squatPose(k));
    assert.ok(Math.abs(jointAngle(f, LM.lh, LM.lk, LM.la) - k) < 0.5, `knee ${k}`);
  }
});

// ---------- squats ----------
test('squats: 20 full reps in 60 s are counted', () => {
  const r = run(createAnalyzer('squat', 0), (t) => squatPose(cycle(t, 172, 85, 3000)));
  assert.equal(r.result.score, 20);
  assert.equal(r.result.partial, 0);
  assert.equal(r.result.times.length, 20);
  assert.ok(r.result.times.every((t) => t >= 0 && t <= 60000));
});

test('squats: half reps are rejected and coached', () => {
  const r = run(createAnalyzer('squat', 0), (t) => squatPose(cycle(t, 172, 125, 2000)));
  assert.equal(r.result.score, 0);
  assert.ok(r.result.partial >= 25);
  assert.ok(r.msgs.includes('Go lower ⬇️'));
});

test('squats: mix of full and half reps counts only the full ones', () => {
  // even cycles full depth, odd cycles half depth
  const pose = (t) => squatPose(t < 0 ? 172 : cycle(t, 172, Math.floor(t / 3000) % 2 ? 125 : 85, 3000));
  const r = run(createAnalyzer('squat', 0), pose);
  assert.equal(r.result.score, 10);
  assert.equal(r.result.partial, 10);
});

test('squats: noisy landmarks and a slow phone (8 fps) still count right', () => {
  const noisy = run(createAnalyzer('squat', 0), (t) => squatPose(cycle(t, 172, 85, 3000)), { opts: { jitter: 0.004 } });
  assert.equal(noisy.result.score, 20);
  const slow = run(createAnalyzer('squat', 0), (t) => squatPose(cycle(t, 172, 85, 3000)), { fps: 8 });
  assert.equal(slow.result.score, 20);
});

test('squats: reps during the countdown do not count', () => {
  const r = run(createAnalyzer('squat', 0), (t) => squatPose(t < 0 ? cycle(t + 3000, 172, 85, 1500) : 172), { from: -3000, to: 60000 });
  assert.equal(r.result.score, 0);
});

test('chair squats (low-impact) accept a higher bottom than standard squats', () => {
  const pose = (t) => squatPose(cycle(t, 172, 110, 3000));
  assert.equal(run(createAnalyzer('squat', 0), pose).result.score, 0);
  assert.equal(run(createAnalyzer('squat', 1), pose).result.score, 20);
});

test('squats: body out of frame → nothing counted, coached to step back', () => {
  const r = run(createAnalyzer('squat', 0), (t) => squatPose(cycle(t, 172, 85, 3000)), { opts: { vis: 0.1 } });
  assert.equal(r.result.score, 0);
  assert.ok(r.msgs.some((m) => /whole body/.test(m)));
});

test('squats: legs outside the picture (MediaPipe guesses them) never start the countdown or count', () => {
  // laptop on a desk: head to hips in frame, knees/ankles guessed below the frame with high visibility
  const cutOff = (knee) => {
    const p = squatPose(knee);
    for (const j of ['lk', 'rk']) p[j] = [p[j][0], 1.08];
    for (const j of ['la', 'ra']) p[j] = [p[j][0], 1.3];
    return p;
  };
  const a = createAnalyzer('squat', 0);
  const ready = a.check(frame(0, cutOff(170)));
  assert.equal(ready.ok, false);
  assert.equal(ready.msg, 'Step back until your feet are in the picture 👣');
  assert.equal(run(createAnalyzer('squat', 0), (t) => cutOff(cycle(t, 172, 85, 3000))).result.score, 0);
  // feet right on the bottom edge: fine while playing, but not good enough to start
  const edge = squatPose(170);
  for (const j of ['la', 'ra']) edge[j] = [edge[j][0], 0.995];
  assert.equal(createAnalyzer('squat', 0).check(frame(0, edge)).ok, false);
  assert.equal(createAnalyzer('squat', 0).check(frame(0, squatPose(170))).ok, true);
});

test('squats: impossible speed is capped by the minimum gap between reps', () => {
  // 0.3 s per squat: faster than any human — the min-gap rule drops half of them
  const r = run(createAnalyzer('squat', 0), (t) => squatPose(cycle(t, 172, 85, 300)), { fps: 60 });
  assert.ok(r.result.score <= 120, `got ${r.result.score}`);
  const gaps = r.result.times.slice(1).map((t, i) => t - r.result.times[i]);
  assert.ok(gaps.every((g) => g >= 500));
});

// ---------- push-ups ----------
test('push-ups: full reps counted, half reps rejected', () => {
  assert.equal(run(createAnalyzer('pushup', 0), (t) => pushupPose(cycle(t, 170, 80, 2000))).result.score, 30);
  const half = run(createAnalyzer('pushup', 0), (t) => pushupPose(cycle(t, 170, 125, 2000)));
  assert.equal(half.result.score, 0);
  assert.ok(half.msgs.includes('Chest lower ⬇️'));
});

test('push-ups: sagging body at the bottom is not a rep', () => {
  const r = run(createAnalyzer('pushup', 0), (t) => pushupPose(cycle(t, 170, 80, 2000), { sag: t > 0 && cycle(t, 170, 80, 2000) < 110 ? 0.12 : 0 }));
  assert.equal(r.result.score, 0);
  assert.ok(r.msgs.includes('Keep your body straight'));
});

test('push-ups: standing arm curls never count (body must be horizontal)', () => {
  const r = run(createAnalyzer('pushup', 0), (t) => curlPose(cycle(t, 170, 40, 1500)));
  assert.equal(r.result.score, 0);
  assert.ok(r.msgs.some((m) => /push-up position/.test(m)));
});

test('knee push-ups use the shoulder–hip–knee line', () => {
  assert.equal(run(createAnalyzer('pushup', 1), (t) => pushupPose(cycle(t, 170, 80, 2000), { knees: true })).result.score, 30);
});

// ---------- jumping jacks ----------
test('jumping jacks: arms overhead + feet wide = 1 rep', () => {
  const pose = (t) => {
    const p = t < 0 ? 0 : (1 - Math.cos((2 * Math.PI * t) / 1000)) / 2;
    return jackPose(15 + 155 * p, 0.02 + 0.16 * p);
  };
  assert.equal(run(createAnalyzer('jack', 0), pose).result.score, 60);
});

test('jumping jacks: arms only (feet together) are rejected', () => {
  const pose = (t) => jackPose(15 + 155 * (t < 0 ? 0 : (1 - Math.cos((2 * Math.PI * t) / 1000)) / 2), 0.02);
  const r = run(createAnalyzer('jack', 0), pose);
  assert.equal(r.result.score, 0);
  assert.ok(r.msgs.includes('Feet wider ↔'));
});

test('jumping jacks: arms only to shoulder height are rejected', () => {
  const pose = (t) => {
    const p = t < 0 ? 0 : (1 - Math.cos((2 * Math.PI * t) / 1000)) / 2;
    return jackPose(15 + 85 * p, 0.02 + 0.16 * p);
  };
  const r = run(createAnalyzer('jack', 0), pose);
  assert.equal(r.result.score, 0);
  assert.ok(r.msgs.includes('Arms all the way up ⬆️'));
});

// ---------- lunges ----------
test('lunges: split stance with both knees bent counts; squatting in place does not', () => {
  assert.equal(run(createAnalyzer('lunge', 0), (t) => lungePose(cycle(t, 170, 92, 2500))).result.score, 24);
  const squat = run(createAnalyzer('lunge', 0), (t) => lungePose(cycle(t, 170, 92, 2500), 0.06));
  assert.equal(squat.result.score, 0);
  assert.ok(squat.msgs.some((m) => /Bigger step/.test(m)));
  assert.equal(run(createAnalyzer('lunge', 0), (t) => lungePose(cycle(t, 170, 130, 2500))).result.score, 0);
});

// ---------- holds ----------
test('plank: 60 s straight hold = 60; sag or pike is not held', () => {
  assert.equal(run(createAnalyzer('plank', 0), () => plankPose(0)).result.score, 60);
  const sag = run(createAnalyzer('plank', 0), () => plankPose(0.1));
  assert.equal(sag.result.score, 0);
  assert.ok(sag.msgs.includes('Lift your hips'));
  const pike = run(createAnalyzer('plank', 0), () => plankPose(-0.1));
  assert.ok(pike.msgs.includes('Lower your hips'));
  assert.equal(run(createAnalyzer('plank', 0), () => plankPose(0, { standing: true })).result.score, 0);
});

test('plank: dropping after 30 s scores ~30; short flickers are bridged', () => {
  const r = run(createAnalyzer('plank', 0), (t) => plankPose(t < 30000 ? 0 : 0.12));
  assert.ok(Math.abs(r.result.score - 30) <= 1, `got ${r.result.score}`);
  assert.equal(r.result.held.length, 60);
  // 300 ms of bad frames every 5 s (tracking glitches) — still a full minute
  const flicker = run(createAnalyzer('plank', 0), (t) => plankPose(t % 5000 < 300 ? 0.12 : 0));
  assert.equal(flicker.result.score, 60);
});

test('wall sit: thighs parallel = held; standing = not', () => {
  assert.equal(run(createAnalyzer('wallsit', 0), () => wallsitPose(90)).result.score, 60);
  const stand = run(createAnalyzer('wallsit', 0), () => wallsitPose(170));
  assert.equal(stand.result.score, 0);
  assert.ok(stand.msgs.includes('Slide lower ⬇️'));
  assert.equal(run(createAnalyzer('wallsit', 1), () => wallsitPose(125)).result.score, 60, 'high wall sit');
});

// ---------- tap mode ----------
test('tap mode: taps faster than the min gap are ignored; holds count while pressed', () => {
  const tap = createTapCounter('squat', 0);
  for (let t = 0; t < 10000; t += 100) tap.tap(t);
  assert.equal(tap.result().score, 20); // 500 ms min gap
  const hold = createTapCounter('plank', 0);
  hold.press(0);
  hold.release(20000);
  hold.press(30000);
  assert.equal(hold.count(40000), 30);
  const r = hold.result(40000);
  assert.equal(r.score, 30);
  assert.equal(r.held, '1'.repeat(20) + '0'.repeat(10) + '1'.repeat(10) + '0'.repeat(20));
});

// ---------- phone on its side (rotation lock on): the picture is turned 90° ----------
// Reported 24 Oct 2026: standing in front of the phone counted plank seconds,
// a real plank counted nothing. "Horizontal" must follow gravity (phone sensor),
// not the picture's edges.
test('plank, phone on its side: real plank counts, standing does not (gravity from the sensor)', () => {
  const opts = { up: UP_ROTATED };
  assert.equal(run(createAnalyzer('plank', 0), () => rotate90(plankPose(0)), { opts }).result.score, 60);
  assert.equal(run(createAnalyzer('plank', 0), () => rotate90(plankPose(0, { standing: true })), { opts }).result.score, 0);
});

test('plank: standing with arms down never counts, even when the phone orientation is unknown', () => {
  // no sensor (laptop, or motion permission denied) and the picture is rotated
  assert.equal(run(createAnalyzer('plank', 0), () => rotate90(plankPose(0, { standing: true }))).result.score, 0);
  // lying flat on the floor with the arms along the body is not a plank either
  const lying = plankPose(0);
  lying.le = lying.re = [0.38, 0.64];
  lying.lw = lying.rw = [0.5, 0.66];
  const r = run(createAnalyzer('plank', 0), () => lying);
  assert.equal(r.result.score, 0);
  assert.ok(r.msgs.some((m) => /under your shoulders/.test(m)));
});

test('push-ups and wall sit also follow gravity on a sideways phone', () => {
  const opts = { up: UP_ROTATED };
  assert.equal(run(createAnalyzer('pushup', 0), (t) => rotate90(pushupPose(cycle(t, 170, 80, 2000))), { opts }).result.score, 30);
  assert.equal(run(createAnalyzer('pushup', 0), (t) => rotate90(curlPose(cycle(t, 170, 40, 1500))), { opts }).result.score, 0);
  assert.equal(run(createAnalyzer('wallsit', 0), () => rotate90(wallsitPose(90)), { opts }).result.score, 60);
  assert.equal(run(createAnalyzer('wallsit', 0), () => rotate90(wallsitPose(170)), { opts }).result.score, 0);
});

test('plank hips hint is right whichever way the phone lies', () => {
  for (const [name, pose, opts] of [
    ['upright', (h) => plankPose(h), {}],
    ['sideways + sensor', (h) => rotate90(plankPose(h)), { up: UP_ROTATED }],
    ['sideways, sensor sign flipped', (h) => rotate90(plankPose(h)), { up: [-1, 0] }],
  ]) {
    assert.ok(run(createAnalyzer('plank', 0), () => pose(0.1), { opts }).msgs.includes('Lift your hips'), `${name}: sag`);
    assert.ok(run(createAnalyzer('plank', 0), () => pose(-0.1), { opts }).msgs.includes('Lower your hips'), `${name}: pike`);
  }
});

// Found 24 Oct 2026 on a real clip: getting up from a toe touch / burpee was
// counted as a jumping jack (hanging arms look "overhead" relative to a folded
// torso). A real jack has the hands further from the feet than the shoulders.
test('jumping jacks: forward bends and burpee get-ups never count', () => {
  const r = run(createAnalyzer('jack', 0), (t) => bendPose(t < 0 ? 0 : (1 - Math.cos((2 * Math.PI * t) / 3000)) / 2));
  assert.equal(r.result.score, 0);
  // and real jacks still count
  assert.equal(run(createAnalyzer('jack', 0), (t) => {
    const p = t < 0 ? 0 : (1 - Math.cos((2 * Math.PI * t) / 1000)) / 2;
    return jackPose(15 + 155 * p, 0.02 + 0.16 * p);
  }).result.score, 60);
});

test('squats and lunges: legs-only close-ups never count (shoulders must be in the picture)', () => {
  const legsOnly = (pose) => (t) => {
    const p = pose(t);
    for (const j of ['ls', 'rs', 'le', 're', 'lw', 'rw']) p[j] = [p[j][0], -0.3]; // above the top edge
    return p;
  };
  const sq = run(createAnalyzer('squat', 0), legsOnly((t) => squatPose(cycle(t, 172, 85, 3000))));
  assert.equal(sq.result.score, 0);
  assert.ok(sq.msgs.some((m) => /shoulders/.test(m)));
  assert.equal(run(createAnalyzer('lunge', 0), legsOnly((t) => lungePose(cycle(t, 170, 92, 2500)))).result.score, 0);
});

test('standing exercises: head out of the picture never counts (scrambled skeletons)', () => {
  const noHead = (pose) => (t) => ({ ...pose(t), nose: [0.5, -0.2] });
  assert.equal(run(createAnalyzer('squat', 0), noHead((t) => squatPose(cycle(t, 172, 85, 3000)))).result.score, 0);
  assert.equal(run(createAnalyzer('lunge', 0), noHead((t) => lungePose(cycle(t, 170, 92, 2500)))).result.score, 0);
  const jackNoHead = run(createAnalyzer('jack', 0), noHead((t) => {
    const p = t < 0 ? 0 : (1 - Math.cos((2 * Math.PI * t) / 1000)) / 2;
    return jackPose(15 + 155 * p, 0.02 + 0.16 * p);
  }));
  assert.equal(jackNoHead.result.score, 0);
});
