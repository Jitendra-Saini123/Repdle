// Generates public/challenges.json: 365 days of daily challenges, the same for
// everyone, keyed by UTC date. Repdle #1 = --start (default: today, UTC).
//
//   node scripts/gen-challenges.mjs --start 2026-11-01
//
// Rules: each 6-day block uses all six exercises once (fair mix), never the same
// exercise two days in a row, never two floor exercises (push-ups, plank) in a
// row, and day #1 is squats (the easiest to film and to count). Seeded, so the
// same start date always gives the same calendar.
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXERCISES, EXERCISE_KEYS } from '../public/js/rules.js';
import { dateOfN } from '../public/js/day.js';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : null;
};
const start = arg('start') || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(start))) throw new Error('--start must be YYYY-MM-DD');
const DAYS = Number(arg('days') || 365);

// mulberry32
let seed = [...start].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 0x5eed);
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const floor = (ex) => EXERCISES[ex].floor;
const okAfter = (prev, ex) => !prev || (prev !== ex && !(floor(prev) && floor(ex)));

const days = [];
while (days.length < DAYS) {
  let block;
  for (let tries = 0; ; tries++) {
    block = shuffle([...EXERCISE_KEYS]);
    if (days.length === 0) block = ['squat', ...block.filter((e) => e !== 'squat')];
    const prev = days[days.length - 1]?.ex;
    if (block.every((ex, i) => okAfter(i ? block[i - 1] : prev, ex))) break;
    if (tries > 500) throw new Error('could not build a valid block');
  }
  for (const ex of block) if (days.length < DAYS) days.push({ n: days.length + 1, date: dateOfN(days.length + 1, start), ex });
}

const out = { version: 1, start, days };
const file = join(dirname(fileURLToPath(import.meta.url)), '../public/challenges.json');
await writeFile(file, JSON.stringify(out) + '\n');
const count = Object.fromEntries(EXERCISE_KEYS.map((k) => [k, days.filter((d) => d.ex === k).length]));
console.log(`wrote ${days.length} days from ${start} (#1 = ${days[0].ex}) →`, count);
