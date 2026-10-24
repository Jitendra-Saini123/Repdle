// Synthetic MediaPipe-style skeletons for unit tests. Joints are placed with
// simple 2D geometry (x right, y down, picture coordinates 0..1) and copied into
// "world" landmarks (metres, small z offset between body sides).
import { LM } from '../../public/js/reps.js';

const R = Math.PI / 180;
let seed = 7;
export function noise(amount) {
  // deterministic gaussian-ish noise
  seed = (seed * 16807) % 2147483647;
  const a = seed / 2147483647;
  seed = (seed * 16807) % 2147483647;
  const b = seed / 2147483647;
  return (a + b - 1) * amount;
}

// joints: { ls:[x,y], ... } (both sides may share coordinates for side views)
export function frame(t, joints, { vis = 0.95, jitter = 0, aspect = 1 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.2 }));
  const wl = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0.2 }));
  for (const [name, [x, y]] of Object.entries(joints)) {
    const i = LM[name];
    const jx = x + noise(jitter), jy = y + noise(jitter);
    const side = name.startsWith('l') ? -1 : 1;
    lm[i] = { x: jx, y: jy, z: 0, visibility: vis };
    wl[i] = { x: (jx - 0.5) * 1.8, y: (jy - 0.5) * 1.8, z: side * 0.08, visibility: vis };
  }
  return { t, lm, wl, aspect };
}

const both = (o) => {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    out[`l${k}`] = v;
    out[`r${k}`] = v;
  }
  return out;
};

// Side-view squat with knee angle `knee` (degrees).
export function squatPose(knee) {
  const h = ((180 - knee) / 2) * R;
  const A = [0.5, 0.9];
  const K = [A[0] + 0.2 * Math.sin(h), A[1] - 0.2 * Math.cos(h)];
  const H = [K[0] - 0.2 * Math.sin(h), K[1] - 0.2 * Math.cos(h)];
  const lean = h * 0.7;
  const S = [H[0] + 0.28 * Math.sin(lean), H[1] - 0.28 * Math.cos(lean)];
  const E = [S[0] + 0.08, S[1] + 0.1];
  const W = [S[0] + 0.16, S[1] + 0.05];
  return both({ s: S, e: E, w: W, h: H, k: K, a: A });
}

// Side-view push-up with elbow angle `elbow`; `sag` moves the hip down (+) or up (−).
export function pushupPose(elbow, { sag = 0, knees = false } = {}) {
  const a = 0.13, b = 0.13;
  const d = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(elbow * R));
  const W = [0.3, 0.82];
  const S = [0.3, W[1] - d];
  // elbow: behind the shoulder–wrist line
  const mid = [(S[0] + W[0]) / 2, (S[1] + W[1]) / 2];
  const off = Math.sqrt(Math.max(0, a * a - (d / 2) ** 2));
  const E = [mid[0] + off, mid[1]];
  const A = knees ? [0.68, 0.84] : [0.85, 0.84];
  const H = [(S[0] + A[0]) / 2, (S[1] + A[1]) / 2 + sag];
  const K = [(H[0] + A[0]) / 2, (H[1] + A[1]) / 2];
  return both({ s: S, e: E, w: W, h: H, k: knees ? A : K, a: A });
}

// Standing person bending the elbows (arm curl): must never count as push-ups.
export function curlPose(elbow) {
  const S = [0.5, 0.35], H = [0.5, 0.6], K = [0.5, 0.75], A = [0.5, 0.9];
  const E = [0.5, 0.48];
  const W = [E[0] + 0.13 * Math.sin((180 - elbow) * R), E[1] + 0.13 * Math.cos((180 - elbow) * R)];
  return both({ s: S, e: E, w: W, h: H, k: K, a: A });
}

// Front-view jumping jack. raise: 0 arms down … 180 overhead. spread: foot offset.
export function jackPose(raise, spread) {
  const S = { l: [0.43, 0.3], r: [0.57, 0.3] };
  const H = { l: [0.46, 0.52], r: [0.54, 0.52] };
  const arm = (s, dir) => [s[0] + dir * 0.25 * Math.sin(raise * R), s[1] + 0.25 * Math.cos(raise * R)];
  return {
    ls: S.l, rs: S.r, lh: H.l, rh: H.r,
    le: [(S.l[0] + arm(S.l, -1)[0]) / 2, (S.l[1] + arm(S.l, -1)[1]) / 2],
    re: [(S.r[0] + arm(S.r, 1)[0]) / 2, (S.r[1] + arm(S.r, 1)[1]) / 2],
    lw: arm(S.l, -1), rw: arm(S.r, 1),
    lk: [H.l[0] - spread / 2, 0.71], rk: [H.r[0] + spread / 2, 0.71],
    la: [H.l[0] - spread, 0.9], ra: [H.r[0] + spread, 0.9],
  };
}

// Split stance (lunge) with hip height giving both knees ≈ `knee` degrees.
// stance = distance between the feet.
export function lungePose(knee, stance = 0.36) {
  const L = 0.2;
  const d = Math.sqrt(2 * L * L - 2 * L * L * Math.cos(knee * R)); // hip–ankle distance
  const F = [0.5 - stance / 2, 0.9], B = [0.5 + stance / 2, 0.9];
  const half = stance / 2;
  const H = [0.5, 0.9 - Math.sqrt(Math.max(0.0001, d * d - half * half))];
  const kneeOf = (A, dir) => {
    const mid = [(H[0] + A[0]) / 2, (H[1] + A[1]) / 2];
    const off = Math.sqrt(Math.max(0, L * L - (d / 2) ** 2));
    const vx = A[0] - H[0], vy = A[1] - H[1];
    const n = Math.hypot(vx, vy) || 1;
    return [mid[0] + dir * (-vy / n) * off, mid[1] + dir * (vx / n) * off];
  };
  const S = [H[0], H[1] - 0.28];
  return { ls: S, rs: S, le: [S[0], S[1] + 0.12], re: [S[0], S[1] + 0.12], lw: [S[0], S[1] + 0.24], rw: [S[0], S[1] + 0.24], lh: H, rh: H, lk: kneeOf(F, -1), rk: kneeOf(B, 1), la: F, ra: B };
}

// Side-view plank. hip: vertical offset of the hip from the straight line.
export function plankPose(hip = 0, { standing = false } = {}) {
  if (standing) return both({ s: [0.5, 0.3], e: [0.5, 0.42], w: [0.5, 0.55], h: [0.5, 0.55], k: [0.5, 0.72], a: [0.5, 0.9] });
  const S = [0.25, 0.62], A = [0.85, 0.7];
  const H = [0.55, (S[1] + A[1]) / 2 + hip];
  return both({ s: S, e: [0.25, 0.72], w: [0.3, 0.8], h: H, k: [0.7, (H[1] + A[1]) / 2], a: A });
}

// Side-view wall sit with knee angle `knee` (shin vertical, torso vertical).
export function wallsitPose(knee) {
  const A = [0.5, 0.9], K = [0.5, 0.7];
  const t = (180 - knee) * R; // thigh direction from vertical-up toward +x
  const H = [K[0] + 0.2 * Math.sin(t), K[1] - 0.2 * Math.cos(t)];
  const S = [H[0], H[1] - 0.28];
  return both({ s: S, e: [S[0] - 0.05, S[1] + 0.12], w: [S[0] - 0.08, S[1] + 0.22], h: H, k: K, a: A });
}

// Drive an analyzer through time. poseAt(t) → joints. Returns final state + events.
export function run(analyzer, poseAt, { fps = 30, from = -2000, to = 60000, opts = {}, optsAt } = {}) {
  const dt = 1000 / fps;
  let last = null;
  const events = [];
  const msgs = new Set();
  for (let t = from; t <= to; t += dt) {
    const s = analyzer.update(frame(t, poseAt(t), optsAt ? optsAt(t) : opts));
    if (s.event) events.push([s.event, t]);
    if (s.msg) msgs.add(s.msg);
    last = s;
  }
  return { last, events, msgs: [...msgs], result: analyzer.result() };
}

// Smooth repetition between `top` and `bottom` with the given period (ms).
export const cycle = (t, top, bottom, period) => (t < 0 ? top : top - ((top - bottom) * (1 - Math.cos((2 * Math.PI * t) / period))) / 2);
