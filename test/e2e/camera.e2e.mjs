// Camera flow in real Chrome, with a video file as the fake webcam.
//
//   REPDLE_Y4M=/path/squats.y4m node test/e2e/camera.e2e.mjs
//
// Needs `npm run dev` running and Google Chrome installed. Make a fixture from
// any clip of a person squatting, side view, whole body in frame:
//   ffmpeg -i clip.webm -vf "fps=25,format=yuv420p" -f yuv4mpegpipe squats.y4m
// Chrome loops the file. Optional: REPDLE_SQUATS="2.3,9.6,…" (bottom of each
// squat in seconds, one loop) and REPDLE_LOOP=42.8 to check every counted rep
// against a real squat.
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.REPDLE_URL || 'http://127.0.0.1:8787';
const Y4M = process.env.REPDLE_Y4M;
const OUT = process.env.REPDLE_SHOTS || 'test/e2e/shots';
// REPDLE_NO_RAF=1 simulates a window covered by another window (macOS Chrome
// stops requestAnimationFrame there): counting must still work.
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!Y4M) throw new Error('set REPDLE_Y4M to a .y4m video of someone squatting');
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${Y4M}`, '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
});
const step = (msg) => console.log(`• ${msg}`);
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
async function acceptSafety(p) {
  await p.waitForSelector('.sheet-wrap.open [data-c]');
  await new Promise((r) => setTimeout(r, 400)); // sheet slide-in animation
  for (const box of await p.$$('.sheet [data-c]')) await box.click();
}
const events = (page) => page.evaluate(() => window.__repdle || []);
async function waitEvent(page, type, timeout) {
  await page.waitForFunction((t) => (window.__repdle || []).some((e) => e.type === t || e.phase === t), { timeout, polling: 250 }, type);
}

try {
  // ---------- player A: camera ----------
  const ctxA = await browser.createBrowserContext();
  const page = await ctxA.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // MediaPipe prints its own "INFO: Created TensorFlow Lite XNNPACK delegate" via console.error: not an error
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('INFO:') && errors.push(m.text()));
  // CPU (WASM) delegate: headless Chrome has only a software GPU. REPDLE_GPU=1 to try the GPU.
  await page.goto(`${BASE}/?debug&nosw${process.env.REPDLE_GPU ? '' : '&cpu=1'}`, { waitUntil: 'networkidle0' });
  step(`home: ${await page.$eval('h1', (h) => h.textContent)}`);
  await shot(page, '01-home');
  await page.click('[data-play="cam"]');
  await acceptSafety(page);
  await shot(page, '02-safety');
  await page.click('[data-ok]');
  if (process.env.REPDLE_NO_RAF) {
    await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
    step('requestAnimationFrame switched off for the session (simulated covered window)');
  }
  await waitEvent(page, 'camera', 20000);
  await waitEvent(page, 'model', 60000);
  const model = (await events(page)).find((e) => e.type === 'model');
  step(`pose model running on ${model.delegate}`);
  await waitEvent(page, 'position', 10000);
  await new Promise((r) => setTimeout(r, 1500));
  await shot(page, '03-position');
  const slow = await page.$('[data-act="keep"]');
  if (slow) {
    step('slow-device prompt shown → keeping the camera');
    await slow.click();
  }
  await waitEvent(page, 'countdown', 30000);
  step('body detected → countdown started automatically');
  await waitEvent(page, 'active', 10000);
  await new Promise((r) => setTimeout(r, 20000));
  await shot(page, '04-active');
  await waitEvent(page, 'result', 70000);
  const log = await events(page);
  const result = log.find((e) => e.type === 'result');
  step(`result: ${result.score} reps, ${result.partial} partial, ${result.fps} fps`);

  // Map every counted rep to the looping video's timeline.
  const cam = log.find((e) => e.type === 'camera').at;
  const loop = Number(process.env.REPDLE_LOOP || 0);
  const squats = (process.env.REPDLE_SQUATS || '').split(',').filter(Boolean).map(Number);
  const reps = log.filter((e) => e.type === 'rep');
  for (const r of reps) {
    const vt = loop ? ((r.at - cam) / 1000) % loop : (r.at - cam) / 1000;
    const near = squats.length ? Math.min(...squats.map((s) => Math.abs(vt - s))) : null;
    console.log(`   rep ${r.count} at session ${(r.t / 1000).toFixed(1)}s → video ${vt.toFixed(1)}s${near != null ? ` (nearest real squat bottom ${near.toFixed(1)}s away)` : ''}`);
  }
  for (const p of log.filter((e) => e.type === 'partial')) console.log(`   partial at session ${(p.t / 1000).toFixed(1)}s → video ${(loop ? ((p.at - cam) / 1000) % loop : (p.at - cam) / 1000).toFixed(1)}s`);

  await page.waitForSelector('.result .score b', { timeout: 10000, polling: 250 });
  await page.waitForFunction(() => !document.querySelector('.chips')?.textContent.includes('ranking you'), { timeout: 15000, polling: 250 });
  await shot(page, '05-result');
  const share = await page.$eval('.share-preview', (el) => el.textContent);
  step(`share text:\n${share.replace(/^/gm, '     ')}`);
  const duelUrl = share.match(/https?:\/\/\S+\/d\/\S+/)?.[0];
  if (!duelUrl) throw new Error('no duel link in the share text');

  // ---------- player B opens the duel link, plays in tap mode ----------
  const ctxB = await browser.createBrowserContext();
  const b = await ctxB.newPage();
  await b.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  b.on('pageerror', (e) => errors.push(`B: ${e.message}`));
  await b.goto(duelUrl, { waitUntil: 'networkidle0' });
  await b.waitForSelector('[data-accept-tap]');
  step(`duel page: ${await b.$eval('.duel h1', (h) => h.textContent)} — ${await b.$eval('.duel .sub', (h) => h.textContent.trim())}`);
  await shot(b, '06-duel');
  await b.click('[data-accept-tap]');
  await acceptSafety(b);
  await b.click('[data-ok]');
  await b.waitForFunction(() => !document.querySelector('.sheet-wrap'), { timeout: 5000, polling: 250 }); // sheet closed
  await b.waitForSelector('[data-act-tap]');
  await b.click('[data-act-tap]');
  await b.waitForFunction(() => document.querySelector('.session')?.dataset.phase === 'active', { timeout: 10000, polling: 250 });
  const target = result.score + 3;
  for (let i = 0; i < target; i++) {
    await b.tap('.tap-btn');
    await new Promise((r) => setTimeout(r, 650));
  }
  await shot(b, '07-tap');
  await b.waitForSelector('.vs', { timeout: 70000 });
  await b.waitForFunction(() => !document.querySelector('.chips')?.textContent.includes('ranking you'), { timeout: 15000, polling: 250 });
  await shot(b, '08-duel-result');
  step(`duel verdict: ${await b.$eval('.verdict', (v) => v.textContent)}`);

  // ---------- player A sees the accept ----------
  await page.goto(duelUrl, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.board li');
  step(`owner view: ${await page.$eval('.board', (el) => el.textContent.replace(/\s+/g, ' ').trim())}`);
  await shot(page, '09-owner');
  if (errors.length) console.log('page errors:\n  ' + errors.join('\n  '));
  console.log(errors.length ? 'E2E FINISHED WITH PAGE ERRORS' : 'E2E OK');
} finally {
  await browser.close();
}
