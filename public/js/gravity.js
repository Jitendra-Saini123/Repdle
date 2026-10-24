// Real "up" in the camera picture, from the phone's motion sensor.
// Needed because a phone lying on its side with rotation lock on delivers a
// picture turned by 90°: "level" and "upright" can't come from the picture's
// edges (plank, push-ups, wall sit). Laptops have no sensor; then the
// picture's own up is used (cameras there are upright anyway).

let g = null; // smoothed accelerationIncludingGravity, device axes
let lastAt = 0;
let listening = false;
// Only the axis of "up" is used (tilt takes |cos|), so the sign differences
// between browsers' accelerationIncludingGravity don't matter.

// iOS asks the player once; it must be called straight from a tap.
export function requestMotionPermission() {
  const DM = window.DeviceMotionEvent;
  if (DM && typeof DM.requestPermission === 'function') return DM.requestPermission().catch(() => 'denied');
  return Promise.resolve('granted');
}

export function startGravity() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('devicemotion', (e) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null) return;
    const k = 0.2; // low-pass: keep gravity, drop the shaking of a jump
    g = g ? { x: g.x + k * (a.x - g.x), y: g.y + k * (a.y - g.y), z: g.z + k * ((a.z ?? 0) - g.z) } : { x: a.x, y: a.y, z: a.z ?? 0 };
    lastAt = performance.now();
  });
}

// Unit "up" vector in picture space (x right, y down, x scaled by the aspect
// ratio), or null when unknown (no sensor, or the phone lies flat).
export function pictureUp({ mirrored = false } = {}) {
  if (!g || performance.now() - lastAt > 1500) return null;
  const total = Math.hypot(g.x, g.y, g.z);
  if (!total || Math.hypot(g.x, g.y) / total < 0.5) return null;
  // device axes (x → right edge, y → top edge) → current screen axes
  const ang = (((screen.orientation?.angle ?? window.orientation ?? 0) % 360) + 360) % 360;
  const r = (ang * Math.PI) / 180; // angle = how far the device is turned counter-clockwise
  const ux = g.x, uy = g.y; // spec: points away from the ground (sign unused)
  const sx = ux * Math.cos(r) - uy * Math.sin(r);
  const sy = ux * Math.sin(r) + uy * Math.cos(r);
  // screen y points up, picture y points down; front-camera frames are the
  // camera's own view, i.e. left-right swapped against the screen
  let px = sx, py = -sy;
  if (mirrored) px = -px;
  const n = Math.hypot(px, py);
  return [px / n, py / n];
}

export const hasMotionReadings = () => g != null && performance.now() - lastAt < 1500;
