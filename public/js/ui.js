// Small DOM helpers: escaping, toasts, bottom sheets, share/copy, sounds.
import { store } from './store.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(msg, ms = 2400) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), ms);
}

// Bottom sheet. Returns { el, close }. `html` is trusted markup built with esc().
export function sheet(html, { onClose, wide = false } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="sheet-x" aria-label="Close">✕</button>${html}</div>`;
  document.body.append(wrap);
  setTimeout(() => wrap.classList.add('open'), 16); // not rAF: it doesn't fire in covered windows
  const close = () => {
    wrap.classList.remove('open');
    setTimeout(() => wrap.remove(), 200);
    onClose?.();
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('.sheet-x')) close();
  });
  return { el: wrap.firstElementChild, close };
}

// In-app yes/no dialog. Native confirm()/alert() are silently blocked in many
// embedded and in-app browsers (Instagram, Facebook, some WebViews) — exactly
// where duel links get opened — so the app never uses them.
export function confirmSheet({ title, body = '', ok = 'Yes', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const sh = sheet(
      `<h2>${esc(title)}</h2>${body ? `<p class="muted">${esc(body)}</p>` : ''}
      <div class="row2 confirm-row"><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(ok)}</button><button class="btn ghost" data-no>${esc(cancel)}</button></div>`,
      { onClose: () => resolve(answer) },
    );
    sh.el.querySelector('[data-yes]').onclick = () => {
      answer = true;
      sh.close();
    };
    sh.el.querySelector('[data-no]').onclick = () => sh.close();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}

// Native share sheet on phones (WhatsApp, Instagram, X…), clipboard elsewhere.
export async function shareOrCopy(text) {
  const touch = matchMedia('(pointer: coarse)').matches;
  if (navigator.share && touch) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

// ---- sound + haptics (WebAudio beeps, no audio files) ----
let ctx;
export function beep(freq = 880, ms = 90, vol = 0.18) {
  if (!store.get('sound', true)) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.type = 'sine';
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
  } catch {}
}
export const unlockAudio = () => beep(1, 1, 0.0001);
export const buzz = (ms = 15) => navigator.vibrate?.(ms);

export function speak(text) {
  if (!store.get('sound', true) || !window.speechSynthesis) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.1;
    speechSynthesis.speak(u);
  } catch {}
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function countryName(cc) {
  if (!cc || cc === 'XX') return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc;
  } catch {
    return cc;
  }
}
