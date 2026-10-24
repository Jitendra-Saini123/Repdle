// Runs many camera sessions in a row: each case = a source clip + video
// transforms (rotated phone, mirrored side, far away, dark, low fps, fast),
// one exercise, optional fake motion sensor, and an expected score range.
//
//   node test/e2e/matrix.mjs cases.json results.json
//
// cases.json: { "clips": { "squat": { "file": "/abs/kb.webm", "ss": 4, "to": 46.8, "vf": "crop=320:360:160:60" } },
//               "cases": [ { "name": "squat rotated", "clip": "squat", "t": ["rot90"], "ex": "squat",
//                            "gravity": [-9.81, 0, 0], "expect": [7, 9] } ] }
// Needs ffmpeg and `npm run dev`. Sessions run one at a time (parallel
// headless Chromes with fake cameras stall).
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { runPractice } from './lib.mjs';

const [casesFile, outFile] = process.argv.slice(2);
const { clips, cases } = JSON.parse(readFileSync(casesFile, 'utf8'));
const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;

const T = {
  rot90: 'transpose=1', // phone on its side, picture turned clockwise
  rot270: 'transpose=2',
  rot180: 'hflip,vflip',
  flip: 'hflip', // facing the other way (left vs right side-on)
  far: 'scale=iw/2:-2,pad=iw*2:ih*2:(ow-iw)/2:(oh-ih)/2:color=0x707070', // half size: far away / short player
  dark: 'eq=brightness=-0.22:contrast=0.55:saturation=0.6,noise=alls=14:allf=t', // dim room, sensor noise
  fast2: 'setpts=0.5*PTS', // twice the speed
};

function build(c) {
  const clip = clips[c.clip];
  const out = join(process.env.MATRIX_TMP || dirname(resolve(casesFile)), `repdle-${process.pid}-${Math.random().toString(36).slice(2)}.y4m`);
  const t = c.t || [];
  const vf = [clip.vf, ...t.filter((x) => T[x]).map((x) => T[x]), `fps=${t.includes('fps8') ? 8 : 20}`, 'scale=trunc(iw/2)*2:trunc(ih/2)*2', 'format=yuv420p'].filter(Boolean).join(',');
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...(clip.ss != null ? ['-ss', String(clip.ss)] : []), ...(clip.to != null ? ['-to', String(clip.to)] : []), '-i', clip.file, '-an', '-vf', vf, '-f', 'yuv4mpegpipe', out]);
  return out;
}

const results = [];
for (const c of cases) {
  if (only && !only.test(c.name)) continue;
  const started = Date.now();
  let row;
  try {
    const y4m = build(c);
    try {
      const r = await runPractice({ y4m, ex: c.ex, v: c.v || 0, gravity: c.gravity || null });
      const [lo, hi] = c.expect || [0, Infinity];
      row = { name: c.name, ex: c.ex, v: c.v || 0, score: r.score, expect: c.expect || null, pass: r.score >= lo && r.score <= hi, partial: r.partial, fps: r.fps, up: r.up, slowPrompt: r.slowPrompt, autoCountdown: r.countdownStarted && !r.pressedStart, reps: r.reps, repClip: r.repClip, partialClip: r.partialClip, partials: r.partials, held: r.held, errors: r.errors };
    } finally {
      rmSync(y4m, { force: true });
    }
  } catch (e) {
    row = { name: c.name, ex: c.ex, error: String(e.message || e), pass: false };
  }
  row.secs = Math.round((Date.now() - started) / 1000);
  results.push(row);
  const exp = row.expect ? `${row.expect[0]}–${row.expect[1]}` : 'record';
  console.log(`${row.error ? 'ERR ' : row.pass ? (row.expect ? 'PASS' : 'INFO') : 'FAIL'}  ${row.name.padEnd(44)} ${String(row.score ?? row.error).padStart(4)}  (expect ${exp}, ${row.fps ?? '-'} fps${row.slowPrompt ? ', slow prompt' : ''}${row.autoCountdown === false ? ', no auto-start' : ''})`);
  if (outFile) writeFileSync(outFile, JSON.stringify(results, null, 2));
}
const failed = results.filter((r) => r.expect && !r.pass).length;
console.log(`\n${results.length} cases, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
