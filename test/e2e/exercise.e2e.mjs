// One practice session of any exercise in real Chrome, a video file as the
// webcam. Checks the score lands in an expected range.
//
//   REPDLE_Y4M=clip.y4m REPDLE_EX=plank REPDLE_EXPECT=35-45 node test/e2e/exercise.e2e.mjs
//
// REPDLE_V=1 picks the low-impact variant. REPDLE_GRAVITY="x,y,z" feeds a fake
// motion sensor (accelerationIncludingGravity, m/s²) — e.g. a phone lying on
// its side whose picture is turned by 90° (make such a clip with
// ffmpeg -vf transpose=1). Needs `npm run dev`.
import { runPractice } from './lib.mjs';

const { REPDLE_Y4M: y4m, REPDLE_EX: ex = 'plank', REPDLE_V: v = '0', REPDLE_EXPECT: EXPECT = '', REPDLE_GRAVITY } = process.env;
if (!y4m) throw new Error('set REPDLE_Y4M');
const gravity = REPDLE_GRAVITY ? REPDLE_GRAVITY.split(',').map(Number) : null;
const r = await runPractice({ y4m, ex, v: Number(v), gravity });
console.log(`${ex}${v === '1' ? ' (low-impact)' : ''}: score ${r.score}, partial ${r.partial}, ${r.fps} fps, up ${r.up ? JSON.stringify(r.up) : 'unknown (picture up)'}${r.held ? `\n  held ${r.held}` : ''}`);
if (r.errors.length) console.log('page errors:', r.errors);
if (EXPECT) {
  const [lo, hi] = EXPECT.split('-').map(Number);
  const pass = r.score >= lo && r.score <= hi;
  console.log(pass ? `PASS (expected ${EXPECT})` : `FAIL (expected ${EXPECT})`);
  process.exitCode = pass ? 0 : 1;
}
