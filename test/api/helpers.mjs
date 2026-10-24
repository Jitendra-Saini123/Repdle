// Helpers for the API tests. They run against `npm run dev` (wrangler dev with
// DEV=1 from .dev.vars, which lets tests fake the clock and the country).
import { readFileSync } from 'node:fs';
import { pidOf, newUid } from '../../public/js/id.js';
import { EXERCISES } from '../../public/js/rules.js';

export const BASE = process.env.REPDLE_URL || 'http://127.0.0.1:8787';
export const data = JSON.parse(readFileSync(new URL('../../public/challenges.json', import.meta.url)));
const DAY = 86400000;
const START_MS = Date.parse(`${data.start}T00:00:00Z`);

export const at = (n, h = 12, min = 0) => START_MS + (n - 1) * DAY + h * 3600e3 + min * 60e3;
export const exOf = (n) => data.days[(n - 1) % data.days.length].ex;

// Each run uses its own block of days so reruns never collide with old data.
const RUN = 40 + (Math.floor(Date.now() / 1000) % 250);
export function dayWith(ex, from = RUN) {
  for (let n = from; n < from + 30; n++) if (exOf(n) === ex) return n;
  throw new Error(`no ${ex} day near ${from}`);
}
export const runBase = RUN;

export async function call(method, path, body, { n, h = 12, min = 0, cc = 'IN', origin, raw } = {}) {
  const headers = { 'content-type': 'application/json', 'x-repdle-country': cc };
  if (n) headers['x-repdle-now'] = String(at(n, h, min));
  if (origin) headers.origin = origin;
  const res = await fetch(BASE + path, { method, headers, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text, headers: res.headers };
}

export async function player(nick = 'Tester') {
  const uid = newUid();
  return { uid, pid: await pidOf(uid), nick };
}

// Rep times for `reps` reps spread evenly (or with a fade) over 60 s.
export function repTimes(reps, { gap, startAt = 800 } = {}) {
  const step = gap || Math.floor(58000 / Math.max(1, reps));
  return Array.from({ length: reps }, (_, i) => startAt + i * step);
}

export function scoreBody(p, n, reps, extra = {}) {
  const ex = exOf(n);
  const base = { uid: p.uid, n, ex, v: 0, mode: 'cam', fps: 24, nick: p.nick, fd: n, reps };
  if (EXERCISES[ex].kind === 'hold') {
    const held = '1'.repeat(reps) + '0'.repeat(60 - reps);
    return { ...base, held, ...extra };
  }
  return { ...base, times: repTimes(reps), ...extra };
}

export const submit = (p, n, reps, extra = {}, opts = {}) => call('POST', '/api/score', scoreBody(p, n, reps, extra), { n, ...opts });
export const cron = (n, h = 12, min = 5) => call('POST', '/api/dev/cron', {}, { n, h, min });
