// Rep counting from MediaPipe pose landmarks. Pure functions, no DOM: the unit
// tests in test/unit/reps.test.mjs drive it with synthetic skeletons.
//
// A frame is { t, lm, wl, aspect }:
//   t      – ms since the session started (negative during the countdown)
//   lm     – 33 normalized image landmarks {x, y, z, visibility} (y points down)
//   wl     – 33 world landmarks in metres (optional; used for 3D joint angles)
//   aspect – video width / height (x is scaled by it for 2D geometry)
import { EXERCISES, DURATION_MS } from './rules.js';

export const LM = { nose: 0, ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28 };
const L = LM;

const DEG = 180 / Math.PI;
const SIDES = {
  l: { s: L.ls, e: L.le, w: L.lw, h: L.lh, k: L.lk, a: L.la },
  r: { s: L.rs, e: L.re, w: L.rw, h: L.rh, k: L.rk, a: L.ra },
};

// ---------- geometry ----------
function vec(a, b, aspect = 1, use3d = true) {
  return [(b.x - a.x) * aspect, b.y - a.y, use3d ? (b.z || 0) - (a.z || 0) : 0];
}
function angleBetween(u, v) {
  const d = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const n = Math.hypot(...u) * Math.hypot(...v);
  if (!n) return 180;
  return Math.acos(Math.max(-1, Math.min(1, d / n))) * DEG;
}
// Angle at joint b (degrees). 3D with world landmarks, else 2D image space.
export function jointAngle(f, a, b, c) {
  if (f.wl) return angleBetween(vec(f.wl[b], f.wl[a]), vec(f.wl[b], f.wl[c]));
  const asp = f.aspect || 1;
  return angleBetween(vec(f.lm[b], f.lm[a], asp, false), vec(f.lm[b], f.lm[c], asp, false));
}
function angle2d(f, a, b, c) {
  const asp = f.aspect || 1;
  return angleBetween(vec(f.lm[b], f.lm[a], asp, false), vec(f.lm[b], f.lm[c], asp, false));
}
// 0° = the line a→b is horizontal in the picture, 90° = vertical.
export function tilt(f, a, b) {
  const dx = Math.abs((f.lm[b].x - f.lm[a].x) * (f.aspect || 1));
  const dy = Math.abs(f.lm[b].y - f.lm[a].y);
  return Math.atan2(dy, dx) * DEG;
}
function dist(f, a, b, world = true) {
  if (world && f.wl) return Math.hypot(...vec(f.wl[a], f.wl[b]));
  return Math.hypot(...vec(f.lm[a], f.lm[b], f.aspect || 1, false));
}

// ---------- visibility ----------
// MediaPipe also *guesses* joints that are outside the picture (often with a
// high visibility score), so a joint only counts if it is inside the frame.
// `f.strict` (the "get in position" check before the countdown) demands a
// clearly visible joint with a margin from the edges; during the minute a
// joint may brush the edge without losing tracking.
function visible(f, ids, min) {
  const [lo, hi, minVis] = f.strict ? [0.01, 0.99, Math.max(min, 0.65)] : [-0.02, 1.02, min];
  return ids.every((i) => {
    const p = f.lm[i];
    return p && (p.visibility ?? 1) >= minVis && (p.presence ?? 1) >= 0.5 && p.x > lo && p.x < hi && p.y > lo && p.y < hi;
  });
}
const sideScore = (f, ids) => ids.reduce((s, i) => s + (f.lm[i]?.visibility ?? 1), 0) / ids.length;

// Which body side(s) the camera sees well enough for the given joints.
function pickSides(f, joints, min = 0.5) {
  const ok = ['l', 'r'].filter((s) => visible(f, joints.map((j) => SIDES[s][j]), min));
  if (ok.length < 2) return ok;
  const [l, r] = ok.map((s) => sideScore(f, joints.map((j) => SIDES[s][j])));
  if (Math.min(l, r) >= 0.75) return ok; // front-ish view: average both sides
  return [l >= r ? 'l' : 'r'];
}
function meanOver(sides, fn) {
  return sides.reduce((s, side) => s + fn(SIDES[side]), 0) / sides.length;
}

// ---------- per-exercise measurements ----------
// Each returns { ok, msg, metric, form } for one frame.
//   ok=false   → body not usable this frame (msg says why)
//   metric     → value the rep state machine tracks (lower = deeper)
//   form       → null if the form at the bottom is fine, else a correction
const NEED_BODY = 'Step back — I need to see your whole body';
const NEED_FEET = 'Step back until your feet are in the picture 👣';
// The most useful "what's missing" message for this frame.
function bodyMsg(f) {
  const seen = (i) => visible(f, [i], 0.5);
  const upper = [L.ls, L.rs, L.lh, L.rh].some(seen);
  const feet = [L.la, L.ra].some(seen) && [L.lk, L.rk].some(seen);
  return upper && !feet ? NEED_FEET : NEED_BODY;
}

const MEASURE = {
  squat(f, v) {
    const sides = pickSides(f, ['h', 'k', 'a']);
    if (!sides.length) return { ok: false, msg: bodyMsg(f) };
    return { ok: true, metric: meanOver(sides, (s) => jointAngle(f, s.h, s.k, s.a)), form: null };
  },
  pushup(f, v) {
    const end = v === 1 ? 'k' : 'a';
    const sides = pickSides(f, ['s', 'e', 'w', 'h', end]);
    if (!sides.length) return { ok: false, msg: bodyMsg(f) };
    const side = SIDES[sides[0]];
    if (tilt(f, side.s, side.h) > 40) return { ok: false, msg: 'Get into push-up position, side-on to the camera' };
    const line = meanOver(sides, (s) => jointAngle(f, s.s, s.h, s[end]));
    return {
      ok: true,
      metric: meanOver(sides, (s) => jointAngle(f, s.s, s.e, s.w)),
      form: line >= 145 ? null : 'Keep your body straight',
    };
  },
  jack(f, v) {
    if (!visible(f, [L.ls, L.rs, L.lw, L.rw, L.lh, L.rh, L.la, L.ra], 0.5)) return { ok: false, msg: 'Face the camera — hands and feet in frame' };
    const raise = (angle2d(f, L.lh, L.ls, L.lw) + angle2d(f, L.rh, L.rs, L.rw)) / 2; // 0 arms down … 180 overhead
    const leg = (dist(f, L.lh, L.la, false) + dist(f, L.rh, L.ra, false)) / 2;
    const spread = dist(f, L.la, L.ra, false) / (leg || 1);
    return { ok: true, metric: 180 - raise, form: spread >= (v === 1 ? 0.35 : 0.45) ? null : 'Feet wider ↔' };
  },
  lunge(f, v) {
    if (!visible(f, [L.lh, L.rh, L.lk, L.rk, L.la, L.ra], 0.4)) return { ok: false, msg: bodyMsg(f) };
    const knees = (jointAngle(f, L.lh, L.lk, L.la) + jointAngle(f, L.rh, L.rk, L.ra)) / 2;
    const leg = (dist(f, L.lh, L.lk) + dist(f, L.lk, L.la) + dist(f, L.rh, L.rk) + dist(f, L.rk, L.ra)) / 2;
    const stance = dist(f, L.la, L.ra) / (leg || 1);
    return { ok: true, metric: knees, form: stance >= 0.5 ? null : 'Bigger step — one foot forward' };
  },
  plank(f, v) {
    const end = v === 1 ? 'k' : 'a';
    const sides = pickSides(f, ['s', 'h', end]);
    if (!sides.length) return { ok: false, msg: bodyMsg(f) };
    const s = SIDES[sides[0]];
    if (tilt(f, s.s, s[end]) > 35) return { ok: true, valid: false, msg: 'Get down into a plank, side-on to the camera' };
    const line = meanOver(sides, (x) => jointAngle(f, x.s, x.h, x[end]));
    if (line >= (v === 1 ? 150 : 155)) return { ok: true, valid: true };
    // Hip above or below the shoulder→heel line (image y points down)?
    const S = f.lm[s.s], E = f.lm[s[end]], H = f.lm[s.h];
    const yLine = Math.abs(E.x - S.x) > 1e-6 ? S.y + ((E.y - S.y) * (H.x - S.x)) / (E.x - S.x) : H.y;
    return { ok: true, valid: false, msg: H.y < yLine ? 'Lower your hips' : 'Lift your hips' };
  },
  wallsit(f, v) {
    const sides = pickSides(f, ['s', 'h', 'k', 'a']);
    if (!sides.length) return { ok: false, msg: bodyMsg(f) };
    const s = SIDES[sides[0]];
    const knee = meanOver(sides, (x) => jointAngle(f, x.h, x.k, x.a));
    const [lo, hi] = v === 1 ? [100, 150] : [65, 115];
    if (knee > hi) return { ok: true, valid: false, msg: 'Slide lower ⬇️' };
    if (knee < lo) return { ok: true, valid: false, msg: 'Come up a little ⬆️' };
    if (tilt(f, s.s, s.h) < 55) return { ok: true, valid: false, msg: 'Back flat against the wall' };
    if (tilt(f, s.h, s.k) > (v === 1 ? 60 : 35)) return { ok: true, valid: false, msg: 'Thighs closer to parallel' };
    return { ok: true, valid: true };
  },
};

// Rep thresholds on the metric (degrees). Start the rep above `top`, go under
// `start` to begin, reach `bottom` with good form, come back over `top` = 1 rep.
// Coming back without reaching `bottom` is a partial rep: shown, never counted.
const REP_CFG = {
  squat: [{ top: 155, start: 140, bottom: 100, partial: 'Go lower ⬇️' }, { top: 155, start: 140, bottom: 115, partial: 'Sit back to the chair ⬇️' }],
  pushup: [{ top: 150, start: 135, bottom: 100, partial: 'Chest lower ⬇️' }, { top: 150, start: 135, bottom: 100, partial: 'Chest lower ⬇️' }],
  jack: [{ top: 130, start: 100, bottom: 40, partial: 'Arms all the way up ⬆️' }, { top: 130, start: 100, bottom: 40, partial: 'Arms all the way up ⬆️' }],
  lunge: [{ top: 155, start: 140, bottom: 115, partial: 'Lower — both knees bend ⬇️' }, { top: 155, start: 140, bottom: 125, partial: 'Lower ⬇️' }],
};

const TAU_MS = 60; // smoothing time constant
const LOST_RESET_MS = 1500;
const HOLD_GRACE_MS = 600; // pose flicker shorter than this doesn't stop the hold clock
const HELD_SECOND_MS = 500; // a second counts if ≥ 500 ms of it was held

export function createAnalyzer(exKey, v = 0) {
  const ex = EXERCISES[exKey];
  if (!ex) throw new Error(`unknown exercise ${exKey}`);
  return ex.kind === 'hold' ? holdAnalyzer(exKey, v) : repAnalyzer(exKey, v);
}

function repAnalyzer(exKey, v) {
  const cfg = REP_CFG[exKey][v];
  const minGap = EXERCISES[exKey].minGapMs[v];
  const st = { phase: 'unarmed', count: 0, partial: 0, times: [], reached: false, formMsg: null, value: null, lastT: null, lastSeen: -1e9, lastRep: -1e9, msg: null, msgUntil: 0, minSeen: 180 };

  function say(msg, t, ms = 1400) {
    st.msg = msg;
    st.msgUntil = t + ms;
  }

  function update(f) {
    const m = MEASURE[exKey](f, v);
    let event = null;
    if (!m.ok) {
      if (f.t - st.lastSeen > 700) say(m.msg, f.t, 300);
      if (f.t - st.lastSeen > LOST_RESET_MS) st.value = null;
      return snapshot(f.t, false, event);
    }
    st.lastSeen = f.t;
    const dt = st.lastT == null ? 1e9 : Math.max(1, f.t - st.lastT);
    st.lastT = f.t;
    const a = st.value == null ? 1 : 1 - Math.exp(-dt / TAU_MS);
    st.value = st.value == null ? m.metric : st.value + a * (m.metric - st.value);
    const x = st.value;
    const active = f.t >= 0 && f.t <= DURATION_MS;

    if (st.phase === 'unarmed') {
      if (x >= cfg.top) st.phase = 'up';
    } else if (st.phase === 'up') {
      if (x < cfg.start) Object.assign(st, { phase: 'moving', reached: false, formMsg: null, minSeen: x });
    } else if (st.phase === 'moving') {
      st.minSeen = Math.min(st.minSeen, x);
      if (x <= cfg.bottom) {
        if (m.form) st.formMsg = m.form;
        else st.reached = true;
      }
      if (x >= cfg.top) {
        st.phase = 'up';
        if (!active) {
          // reps during the countdown don't count
        } else if (st.reached && f.t - st.lastRep >= minGap) {
          st.count++;
          st.lastRep = f.t;
          st.times.push(Math.round(f.t));
          event = 'rep';
          say('', f.t, 0);
        } else if (!st.reached) {
          st.partial++;
          event = 'partial';
          say(st.formMsg && st.minSeen <= cfg.bottom ? st.formMsg : cfg.partial, f.t);
        }
      }
    }
    return snapshot(f.t, true, event);
  }

  function snapshot(t, seen, event) {
    const progress = st.value == null ? 0 : Math.max(0, Math.min(1.15, (cfg.top - st.value) / (cfg.top - cfg.bottom)));
    return { kind: 'reps', count: st.count, partial: st.partial, seen, event, progress, armed: st.phase !== 'unarmed', msg: t < st.msgUntil ? st.msg : null };
  }

  return {
    kind: 'reps',
    update,
    check: (f) => MEASURE[exKey]({ ...f, strict: true }, v),
    result: () => ({ score: st.count, times: st.times.slice(), partial: st.partial }),
  };
}

function holdAnalyzer(exKey, v) {
  const buckets = new Array(DURATION_MS / 1000).fill(0);
  const st = { lastT: null, lastValid: -1e9, msg: null, holding: false };

  const heldString = () => buckets.map((ms) => (ms >= HELD_SECOND_MS ? '1' : '0')).join('');
  const seconds = () => buckets.filter((ms) => ms >= HELD_SECOND_MS).length;

  function update(f) {
    const m = MEASURE[exKey](f, v);
    const validNow = m.ok && m.valid;
    if (validNow) st.lastValid = f.t;
    st.holding = validNow || f.t - st.lastValid <= HOLD_GRACE_MS;
    st.msg = validNow ? null : m.msg;
    if (st.holding && st.lastT != null && f.t > 0 && f.t <= DURATION_MS) {
      const dt = Math.min(250, f.t - Math.max(0, st.lastT));
      const i = Math.min(buckets.length - 1, Math.floor((f.t - 1) / 1000));
      if (dt > 0) buckets[i] += dt;
    }
    st.lastT = f.t;
    return { kind: 'hold', count: seconds(), holding: st.holding, seen: m.ok, event: null, progress: st.holding ? 1 : 0, armed: true, msg: st.msg };
  }

  return {
    kind: 'hold',
    update,
    check: (f) => MEASURE[exKey]({ ...f, strict: true }, v),
    result: () => {
      const held = heldString();
      return { score: seconds(), held };
    },
  };
}

// Tap mode (no camera / slow phone): every tap is a rep, holds count while the
// button is pressed. Same output shape as the camera analyzers. Never ranked.
export function createTapCounter(exKey, v = 0) {
  const ex = EXERCISES[exKey];
  const minGap = ex.kind === 'reps' ? ex.minGapMs[v] : 0;
  const times = [];
  const buckets = new Array(DURATION_MS / 1000).fill(0);
  let pressedAt = null;
  const creditHold = (from, to) => {
    for (let t = Math.max(0, from); t < Math.min(DURATION_MS, to); t += 50) buckets[Math.floor(t / 1000)] += Math.min(50, to - t);
  };
  return {
    kind: ex.kind,
    tap(t) {
      if (t < 0 || t > DURATION_MS) return false;
      if (times.length && t - times[times.length - 1] < minGap) return false;
      times.push(Math.round(t));
      return true;
    },
    press(t) { pressedAt = t; },
    release(t) { if (pressedAt != null) creditHold(pressedAt, t); pressedAt = null; },
    count(t) {
      if (ex.kind === 'reps') return times.length;
      const extra = pressedAt != null ? [...buckets] : buckets;
      if (pressedAt != null) for (let x = Math.max(0, pressedAt); x < Math.min(DURATION_MS, t); x += 50) extra[Math.floor(x / 1000)] += Math.min(50, t - x);
      return extra.filter((ms) => ms >= HELD_SECOND_MS).length;
    },
    result(t = DURATION_MS) {
      if (pressedAt != null) this.release(t);
      if (ex.kind === 'reps') return { score: times.length, times: times.slice(), partial: 0 };
      const held = buckets.map((ms) => (ms >= HELD_SECOND_MS ? '1' : '0')).join('');
      return { score: [...held].filter((c) => c === '1').length, held };
    },
  };
}
