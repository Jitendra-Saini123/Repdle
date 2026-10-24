// The 60-second session: camera + on-device pose AI, or tap mode as fallback.
// Resolves with a result object, or null if the player stopped early.
import { EXERCISES, DURATION_MS, exerciseName } from './rules.js';
import { createAnalyzer, createTapCounter } from './reps.js';
import { loadPose, openCamera, stopCamera, drawSkeleton } from './pose.js';
import { segmentsFromTimes, segmentsFromHeld } from './grid.js';
import { startGravity, pictureUp, hasMotionReadings } from './gravity.js';
import { esc, beep, buzz, speak, unlockAudio, toast, confirmSheet, copyText, $ } from './ui.js';
import { store } from './store.js';

// Why a player ended up in tap mode (sent with the score, for the metrics).
export const FB = { none: 0, denied: 1, noCamera: 2, slow: 3, model: 4, manual: 5 };

const SLOW_FPS = 6;
// In-app browsers (Instagram, Facebook, Snapchat, LINE, Android WebViews) often
// can't use the camera at all — and that's where shared duel links open.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Snapchat|Line\/|; wv\)/i.test(navigator.userAgent);
// ?debug in the URL: keep an event log on window.__repdle (used by test/e2e).
const DEBUG = /[?&]debug\b/.test(location.search);
const log = (type, data = {}) => DEBUG && (window.__repdle ||= []).push({ type, at: performance.now(), ...data });

export function runSession(o) {
  return new Promise((resolve) => {
    const ex = EXERCISES[o.ex];
    const isHold = ex.kind === 'hold';
    // Floor exercises and holds (walk to the wall, get down into a plank) need
    // more time between "ready" and GO than standing reps.
    const slowStart = ex.floor || isHold;
    const name = exerciseName(o.ex, o.v);
    const root = document.createElement('div');
    root.className = isHold ? 'session hold' : 'session';
    root.innerHTML = `
      <div class="stage"><video playsinline muted></video><canvas class="skel"></canvas></div>
      <header class="s-top">
        <div class="s-title"><span>${esc(o.label)}</span><b>${esc(ex.emoji)} ${esc(name)}</b></div>
        <div class="s-btns"><button class="s-eye" aria-label="Skeleton-only view" title="Hide the camera picture (skeleton only)">👤</button><button class="s-x" aria-label="Stop">✕</button></div>
      </header>
      <div class="s-timer" aria-hidden="true"><i></i></div>
      <div class="s-clock">60</div>
      <div class="s-count"><b>0</b><small>${isHold ? 'seconds held' : 'reps'}</small></div>
      <div class="s-depth" aria-hidden="true"><i></i><span></span></div>
      <div class="s-msg" aria-live="polite"></div>
      <div class="s-panel"></div>
      <div class="s-big"></div>
      <div class="s-privacy">🔒 On-device AI · your video never leaves this device</div>`;
    document.body.append(root);
    document.body.classList.add('in-session');
    // Skeleton-only view: hides the camera picture (privacy, faceless recording).
    root.classList.toggle('skel-only', Boolean(store.get('skelOnly')));
    $('.s-eye', root).onclick = () => {
      store.set('skelOnly', !store.get('skelOnly'));
      root.classList.toggle('skel-only', Boolean(store.get('skelOnly')));
    };

    const video = $('video', root);
    const canvas = $('canvas', root);
    const ctx2d = canvas.getContext('2d');
    const panel = $('.s-panel', root);
    const big = $('.s-big', root);
    const countEl = $('.s-count b', root);
    const msgEl = $('.s-msg', root);
    const clockEl = $('.s-clock', root);
    const barEl = $('.s-timer i', root);
    const depthEl = $('.s-depth i', root);

    let phase = '';
    let stream = null, landmarker = null, analyzer = null, tap = null;
    let raf = 0, loopTimer = 0, iv = 0, wakeLock = null;
    let startAt = null; // performance.now() at t = 0 (end of the countdown)
    let lastVT = -1, readySince = null, activeFrames = 0, slowShown = false, positionSince = 0, slowSince = null;
    let lastBeepSec = null, tenWarned = false, lastCount = 0;
    let facing = store.get('facing', 'user');
    let fb = o.fb || FB.none;
    let mode = o.mode;
    const fpsWin = [];
    let done = false;

    const setPhase = (p) => { phase = p; root.dataset.phase = p; log('phase', { phase: p }); };
    const showPanel = (html) => { panel.innerHTML = html; };
    const t = () => (startAt == null ? -1e9 : performance.now() - startAt);

    function cleanup() {
      stopLoop();
      clearInterval(iv);
      stopCamera(stream);
      stream = null;
      wakeLock?.release?.().catch(() => {});
      document.removeEventListener('visibilitychange', onVis);
      document.body.classList.remove('in-session');
      root.remove();
    }
    function finish(result) {
      if (done) return;
      done = true;
      cleanup();
      resolve(result);
    }
    function onVis() {
      if (document.hidden && (phase === 'countdown' || phase === 'active')) {
        finish(null);
        setTimeout(() => toast('Stopped: Repdle went to the background. This attempt didn’t count — start again when ready.', 6000), 50);
      }
    }
    document.addEventListener('visibilitychange', onVis);
    $('.s-x', root).onclick = async () => {
      if (phase === 'active' || phase === 'countdown') {
        const stop = await confirmSheet({ title: 'Stop now?', body: 'This attempt won’t count — you can start again.', ok: 'Stop', cancel: 'Keep going', danger: true });
        if (!stop || done) return;
      }
      finish(null);
    };
    navigator.wakeLock?.request?.('screen').then((w) => (wakeLock = w)).catch(() => {});
    unlockAudio();

    // ---------- timer (runs even if the camera stalls) ----------
    function tick() {
      const now = t();
      if (phase === 'countdown') {
        const left = Math.ceil(-now / 1000);
        if (left !== lastBeepSec && left > 0) {
          lastBeepSec = left;
          beep(660, 120);
          showPanel(`<div class="count-in">${left}</div><p class="hint">${esc(isHold ? 'Get into position and hold' : 'Get ready…')}</p>`);
        }
        if (now >= 0) {
          setPhase('active');
          showPanel('');
          beep(990, 220);
          speak('Go');
          if (mode === 'tap' && isHold) tap.press(0);
        }
      } else if (phase === 'active') {
        const left = Math.max(0, DURATION_MS - now);
        clockEl.textContent = String(Math.ceil(left / 1000));
        barEl.style.transform = `scaleX(${left / DURATION_MS})`;
        if (!tenWarned && left <= 10000) {
          tenWarned = true;
          beep(520, 160);
          speak('Ten seconds');
          root.classList.add('final');
        }
        if (mode === 'tap') countEl.textContent = String(tap.count(now));
        if (now >= DURATION_MS) complete();
      }
    }
    iv = setInterval(tick, 100);

    function beginCountdown(ms) {
      if (phase === 'countdown' || phase === 'active') return;
      startAt = performance.now() + ms;
      lastBeepSec = null;
      setPhase('countdown');
      tick();
    }

    function complete() {
      if (phase === 'done') return;
      setPhase('done');
      const r = (mode === 'tap' ? tap : analyzer).result(DURATION_MS);
      const seg = isHold ? segmentsFromHeld(r.held) : segmentsFromTimes(r.times);
      const fps = mode === 'cam' ? Math.round((activeFrames / (DURATION_MS / 1000)) * 10) / 10 : 0;
      log('result', { score: r.score, partial: r.partial || 0, fps, times: r.times, held: r.held });
      beep(1200, 300);
      buzz(200);
      speak(isHold ? `${r.score} seconds` : `${r.score} reps`);
      showPanel(`<div class="done-big">${r.score}${isHold ? 's' : ''}</div><p class="hint">Done! Nice work 💪</p>`);
      setTimeout(() => finish({ n: o.n, ex: o.ex, v: o.v, kind: ex.kind, mode, score: r.score, times: r.times, held: r.held, seg, fps, fb, partial: r.partial || 0 }), 1100);
    }

    // ---------- camera mode ----------
    async function startCamera() {
      setPhase('camera');
      showPanel(`<p class="big-line">Allow the camera</p><p class="hint">🔒 The pose AI runs inside this browser. The video is never uploaded or saved.</p>`);
      // A camera request can hang silently while the OS asks for permission
      // (macOS/Windows privacy settings) — explain after a few seconds.
      const slowAsk = setTimeout(() => {
        if (phase !== 'camera') return;
        showPanel(`<p class="big-line">Waiting for camera permission…</p>
          <p class="hint">Look for a permission pop-up next to the address bar or from your system. On a Mac: System Settings → Privacy &amp; Security → Camera → turn on your browser. On a phone: Settings → your browser → Camera.</p>
          <div class="row"><button class="btn ghost small" data-act="tap">✋ Play in Tap mode instead</button></div>`);
      }, 8000);
      try {
        const opened = await openCamera(video, facing);
        clearTimeout(slowAsk);
        if (done || mode === 'tap') return stopCamera(opened); // player moved on while the OS was asking
        stream = opened;
        log('camera', { w: video.videoWidth, h: video.videoHeight });
      } catch (e) {
        clearTimeout(slowAsk);
        const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
        const none = e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' || e?.name === 'NotSupportedError';
        return showError(denied ? FB.denied : none ? FB.noCamera : FB.denied, denied
          ? 'Camera access is blocked. Allow the camera for this site in your browser settings, then try again.'
          : none ? 'No usable camera found on this device.' : `Camera error: ${e?.message || e}`);
      }
      root.classList.toggle('mirror', facing === 'user');
      if (ex.gravity) startGravity();
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (!landmarker) {
        setPhase('loading');
        showPanel(`<p class="big-line">Loading the pose AI</p><div class="bar"><i style="transform:scaleX(0)"></i></div><p class="hint">≈6 MB, once. Next time it starts instantly.</p>`);
        try {
          const loaded = await loadPose((p) => { const i = $('.bar i', panel); if (i) i.style.transform = `scaleX(${p})`; });
          landmarker = loaded.landmarker;
          log('model', { delegate: loaded.delegate });
        } catch (e) {
          console.warn('pose model failed', e);
          return showError(FB.model, 'The pose AI could not start in this browser.');
        }
      }
      analyzer = createAnalyzer(o.ex, o.v);
      setPhase('position');
      positionSince = performance.now();
      lastPosMsg = undefined;
      renderPosition('Looking for you…');
      loop();
    }

    function renderPosition(msg) {
      showPanel(`
        <p class="big-line">Get in position</p>
        <p class="hint">${esc(ex.setup)}</p>
        <p class="hint">💻 Laptop or phone on a table? Put it lower (a chair or the floor) or step back until your feet show.</p>
        ${ex.gravity && matchMedia('(pointer: coarse)').matches && !hasMotionReadings() ? '<p class="hint">📱 Phone on its side? Allow “motion & orientation” if asked, or keep the phone upright.</p>' : ''}
        <p class="check ${msg ? 'no' : 'yes'}">${msg ? '✗ ' + esc(msg) : '✓ Body in frame — starting…'}</p>
        <div class="row">
          <button class="btn primary" data-act="start">Start now (${slowStart ? 8 : 5}s to get ready)</button>
        </div>
        <div class="row">
          <button class="btn ghost small" data-act="flip">↺ Switch camera</button>
          <button class="btn ghost small" data-act="tap">✋ Tap mode</button>
        </div>`);
    }

    panel.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      if (act === 'start') beginCountdown(slowStart ? 8000 : 5000);
      if (act === 'flip') flip();
      if (act === 'tap') switchToTap(fb || FB.manual);
      if (act === 'retry') { showPanel(''); startCamera(); }
      if (act === 'copylink') copyText(location.origin + location.pathname).then((ok) => toast(ok ? 'Link copied — paste it in Chrome or Safari' : location.origin + location.pathname, 4000));
      if (act === 'keep') { slowShown = true; fb = FB.none; renderPosition('Looking for you…'); }
    });

    async function flip() {
      facing = facing === 'user' ? 'environment' : 'user';
      store.set('facing', facing);
      stopCamera(stream);
      stopLoop();
      startCamera();
    }

    function showError(code, text) {
      fb = code;
      setPhase('error');
      const browserHint = code === FB.model
        ? ''
        : IN_APP
          ? `<p class="hint"><b>You’re inside another app’s browser</b>, where the camera usually can’t be used. Copy the link and open it in Chrome or Safari.</p>`
          : `<p class="hint">Opened from Instagram, Facebook or WhatsApp? Open the link in Chrome or Safari instead.</p>`;
      showPanel(`<p class="big-line">😕 ${esc(text)}</p>
        ${browserHint}
        ${code === FB.model ? '' : `<div class="row"><button class="btn ghost small" data-act="copylink">🔗 Copy link to open in Chrome/Safari</button></div>`}
        <p class="hint">Or play today in <b>Tap mode</b>: tap a button for every rep. Tap scores keep your streak but are not ranked.</p>
        <div class="row"><button class="btn primary" data-act="tap">✋ Play in Tap mode</button></div>
        <div class="row"><button class="btn ghost small" data-act="retry">Try the camera again</button></div>`);
    }

    let lastPosMsg;
    let loggedUp = false;
    function stopLoop() {
      cancelAnimationFrame(raf);
      clearTimeout(loopTimer);
    }
    // requestAnimationFrame when the window is painting, plus a timer: macOS
    // Chrome stops rAF for a window covered by another window while the page
    // still reports "visible", and the minute must keep counting anyway.
    function loop() {
      stopLoop();
      if (done) return;
      raf = requestAnimationFrame(loop);
      loopTimer = setTimeout(loop, 40);
      step();
    }

    function step() {
      if (!landmarker || video.readyState < 2 || video.currentTime === lastVT) return;
      lastVT = video.currentTime;
      const now = performance.now();
      let res;
      try {
        res = landmarker.detectForVideo(video, now);
      } catch (e) {
        console.warn(e);
        return;
      }
      fpsWin.push(now);
      while (fpsWin.length && fpsWin[0] < now - 2000) fpsWin.shift();
      const fps = fpsWin.length / 2;
      const lm = res.landmarks?.[0];
      const wl = res.worldLandmarks?.[0];
      drawSkeleton(ctx2d, lm, canvas.width, canvas.height, phase === 'active' ? '#34d399' : '#facc15');
      const up = ex.gravity ? pictureUp({ mirrored: facing === 'user' }) : null;
      if (up && !loggedUp) {
        loggedUp = true;
        log('gravity', { up: up.map((x) => Math.round(x * 100) / 100) });
      }
      const f = lm ? { t: t(), lm, wl, aspect: video.videoWidth / video.videoHeight, ...(up ? { up } : {}) } : null;
      root.dataset.fps = fps.toFixed(0);

      if (phase === 'position') {
        // Slow only if it stays slow for 3 s after a warm-up (the first GPU frames
        // compile shaders and would otherwise look like 1 fps).
        slowSince = fps < SLOW_FPS ? slowSince ?? now : null;
        if (!slowShown && now - positionSince > 4000 && slowSince != null && now - slowSince > 3000) {
          slowShown = true;
          fb = FB.slow;
          showPanel(`<p class="big-line">🐢 This device runs the AI at ${fps.toFixed(0)} fps</p>
            <p class="hint">Counting may miss reps. Tap mode always works (unranked).</p>
            <div class="row"><button class="btn primary" data-act="tap">✋ Use Tap mode</button></div>
            <div class="row"><button class="btn ghost small" data-act="keep">Keep the camera</button></div>`);
          return;
        }
        if (slowShown && fb === FB.slow && panel.querySelector('[data-act="keep"]')) return;
        const m = f ? analyzer.check(f) : { ok: false, msg: 'Step into the frame' };
        const msg = m.ok ? null : m.msg;
        if (msg !== lastPosMsg) {
          lastPosMsg = msg;
          const line = $('.check', panel);
          if (line) {
            line.className = `check ${msg ? 'no' : 'yes'}`;
            line.textContent = msg ? `✗ ${msg}` : '✓ Body in frame — starting…';
          }
        }
        if (m.ok) {
          readySince ??= now;
          if (now - readySince > 1000) beginCountdown(slowStart ? 5000 : 3000);
        } else readySince = null;
        return;
      }
      if (phase !== 'countdown' && phase !== 'active') return;
      if (phase === 'active') activeFrames++;
      if (!f) {
        msgEl.textContent = 'Step into the frame';
        return;
      }
      const st = analyzer.update(f);
      countEl.textContent = String(st.count);
      // bar = 0…115% of the depth target; the white line marks 100%
      if (st.kind === 'reps') depthEl.style.transform = `scaleY(${Math.min(1.15, st.progress) / 1.15})`;
      root.classList.toggle('holding', st.kind === 'hold' && st.holding && phase === 'active');
      msgEl.textContent = st.msg || '';
      if (st.event) log(st.event, { t: Math.round(f.t), count: st.count, fps });
      if (DEBUG && st.value != null) log('m', { t: Math.round(f.t), v: Math.round(st.value), ph: st.phase[0] }); // metric trace for e2e analysis
      if (st.event === 'rep') {
        beep(880, 80);
        buzz(20);
        root.classList.remove('pulse');
        void root.offsetWidth;
        root.classList.add('pulse');
      } else if (st.event === 'partial') beep(220, 120, 0.12);
      if (st.kind === 'hold' && st.count !== lastCount && phase === 'active') {
        lastCount = st.count;
        if (st.count % 10 === 0) beep(880, 60);
      }
    }

    // ---------- tap mode ----------
    function switchToTap(reason) {
      fb = reason;
      stopLoop();
      stopCamera(stream);
      stream = null;
      startTap();
    }

    function startTap() {
      mode = 'tap';
      root.classList.add('tap-mode');
      root.classList.remove('mirror');
      tap = createTapCounter(o.ex, o.v);
      setPhase('position');
      showPanel(`<p class="big-line">✋ Tap mode <span class="tag">unranked</span></p>
        <p class="hint">${isHold ? 'The clock runs from GO. Tap the big button the moment you stop holding.' : 'Put the phone where you can reach it and tap the big button once for every full rep.'} Be honest — your friends will check! 😄</p>
        <div class="row"><button class="btn primary" data-act-tap="go">Start (5s countdown)</button></div>`);
      big.innerHTML = `<button class="tap-btn" aria-label="${isHold ? 'Tap when you stop' : 'Tap for each rep'}">${isHold ? 'Tap when<br>you stop' : 'TAP<br><small>each rep</small>'}</button>`;
      panel.querySelector('[data-act-tap]').onclick = () => beginCountdown(5000);
      const btn = $('.tap-btn', big);
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (phase !== 'active') return;
        const now = t();
        if (isHold) {
          tap.release(now);
          complete();
          return;
        }
        if (tap.tap(now)) {
          beep(880, 60);
          buzz(15);
          countEl.textContent = String(tap.count(now));
          btn.classList.remove('hit');
          void btn.offsetWidth;
          btn.classList.add('hit');
        }
      });
    }

    if (mode === 'tap') startTap();
    else startCamera();
  });
}
