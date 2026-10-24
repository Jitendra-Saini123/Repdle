// Tap-mode fallback (no camera) in real Chrome, for a reps exercise and a hold:
//   node test/e2e/tap.e2e.mjs        (needs `npm run dev`)
// Reps: every tap is a rep (taps closer than the exercise's minimum gap are
// ignored). Holds: the clock runs from GO until the player taps "I stopped".
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { BASE } from './lib.mjs';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function tapSession(page, ex, act) {
  await page.evaluate((e) => {
    window.__tapResult = null;
    window.repdle.runSession({ n: window.repdle.S.today, ex: e, v: 0, mode: 'tap', label: 'Tap test' }).then((r) => (window.__tapResult = r));
  }, ex);
  await page.waitForSelector('[data-act-tap]');
  await page.click('[data-act-tap]');
  await page.waitForFunction(() => document.querySelector('.session')?.dataset.phase === 'active', { timeout: 10000, polling: 100 });
  await act(page);
  await page.waitForFunction(() => window.__tapResult, { timeout: 75000, polling: 250 });
  return page.evaluate(() => window.__tapResult);
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE}/?debug&nosw`, { waitUntil: 'networkidle0' });

  // squats: 12 taps 700 ms apart + 5 double-taps 100 ms apart (too fast → ignored)
  const squat = await tapSession(page, 'squat', async (p) => {
    for (let i = 0; i < 12; i++) { await p.tap('.tap-btn'); await wait(700); }
    for (let i = 0; i < 5; i++) { await p.tap('.tap-btn'); await wait(100); }
  });
  console.log(`tap squats: ${squat.score} (mode ${squat.mode}), grid ${squat.seg.join(',')}`);
  assert.equal(squat.mode, 'tap');
  // 12 spaced taps all count; of the 5 rapid ones only those ≥ 500 ms after the previous counted tap do
  assert.ok(squat.score >= 13 && squat.score <= 15, `squats ${squat.score}`);
  const gaps = squat.times.slice(1).map((t, i) => t - squat.times[i]);
  assert.ok(gaps.every((g) => g >= 500), `gaps ${gaps}`);

  // plank: hold for ~15 s, then tap "I stopped" → session ends early with ~15 s
  const plank = await tapSession(page, 'plank', async (p) => { await wait(15200); await p.tap('.tap-btn'); });
  console.log(`tap plank: ${plank.score}s held, ${plank.held}`);
  assert.ok(plank.score >= 14 && plank.score <= 16, `plank ${plank.score}`);
  assert.equal(plank.held.length, 60);
  console.log('TAP E2E OK');
} finally {
  await browser.close();
}
