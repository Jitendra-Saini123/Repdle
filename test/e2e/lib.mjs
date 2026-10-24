// Shared helper for the camera e2e scripts: one practice session of any
// exercise in headless Chrome, with a .y4m video as the webcam.
import puppeteer from 'puppeteer-core';

export const BASE = process.env.REPDLE_URL || 'http://127.0.0.1:8787';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// gravity: [x, y, z] fake accelerationIncludingGravity (m/s²) or null for "no sensor"
export async function runPractice({ y4m, ex, v = 0, gravity = null, timeoutMs = 150000 }) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/?debug&nosw&cpu=1`, { waitUntil: 'networkidle0' });
    if (gravity) {
      const [x, y, z] = gravity;
      await page.evaluate((g) => setInterval(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: g })), 50), { x, y, z });
    }
    await page.evaluate((e, vv) => { window.repdle.practice(e, vv); }, ex, v); // don't await the whole session
    await page.waitForSelector('.sheet-wrap.open [data-c]', { timeout: 10000 });
    await new Promise((r) => setTimeout(r, 400));
    for (const box of await page.$$('.sheet [data-c]')) await box.click();
    await page.click('[data-ok]');
    // keep the camera if the slow-device prompt shows; stop when the result is in
    // and press "Start now" like a player would if the auto-countdown hasn't
    // started 12 s into positioning (e.g. nobody in push-up position).
    const t0 = Date.now();
    let keptCamera = false, pressedStart = false, positionSince = null;
    for (;;) {
      if (Date.now() - t0 > timeoutMs) throw new Error('timeout');
      const state = await page.evaluate(() => ({
        done: (window.__repdle || []).some((e) => e.type === 'result'),
        slow: !!document.querySelector('[data-act="keep"]'),
        phase: document.querySelector('.session')?.dataset.phase,
      }));
      if (state.done) break;
      if (state.slow && !keptCamera) {
        keptCamera = true;
        await page.click('[data-act="keep"]');
      }
      if (state.phase === 'position') {
        positionSince ??= Date.now();
        if (!pressedStart && Date.now() - positionSince > 12000 && (await page.$('[data-act="start"]'))) {
          pressedStart = true;
          await page.click('[data-act="start"]');
        }
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    const log = await page.evaluate(() => window.__repdle);
    const r = log.find((e) => e.type === 'result');
    const phases = log.filter((e) => e.type === 'phase').map((e) => e.phase);
    return {
      score: r.score,
      partial: r.partial,
      fps: r.fps,
      held: r.held,
      times: r.times,
      up: log.find((e) => e.type === 'gravity')?.up || null,
      slowPrompt: keptCamera,
      pressedStart,
      countdownStarted: phases.includes('countdown'),
      // seconds since the camera opened (≈ position in a looping fake-camera clip)
      repClip: (() => { const cam = log.find((e) => e.type === 'camera')?.at; return log.filter((e) => e.type === 'rep').map((e) => Math.round((e.at - cam) / 100) / 10); })(),
      partialClip: (() => { const cam = log.find((e) => e.type === 'camera')?.at; return log.filter((e) => e.type === 'partial').map((e) => Math.round((e.at - cam) / 100) / 10); })(),
      trace: (() => { const cam = log.find((e) => e.type === 'camera')?.at; return log.filter((e) => e.type === 'm').map((e) => [Math.round((e.at - cam) / 100) / 10, e.v, e.ph]); })(),
      reps: log.filter((e) => e.type === 'rep').map((e) => e.t),
      partials: log.filter((e) => e.type === 'partial').map((e) => e.t),
      errors,
    };
  } finally {
    await browser.close();
  }
}
