// Pace grid + share text. Shared by the app and the Worker (the Worker rebuilds
// the segments from the raw rep times, so the grid can't be faked separately).
import { DURATION_MS, SEGMENTS, EXERCISES, exerciseName } from './rules.js';

const SEG_MS = DURATION_MS / SEGMENTS;

// Reps per 10-second segment from rep timestamps (ms since the session started).
export function segmentsFromTimes(times) {
  const seg = new Array(SEGMENTS).fill(0);
  for (const t of times) seg[Math.min(SEGMENTS - 1, Math.max(0, Math.floor(t / SEG_MS)))]++;
  return seg;
}

// Seconds held per segment from a 60-char "0101…" string (one char per second).
export function segmentsFromHeld(held) {
  const per = held.length / SEGMENTS;
  const seg = new Array(SEGMENTS).fill(0);
  for (let i = 0; i < held.length; i++) if (held[i] === '1') seg[Math.floor(i / per)]++;
  return seg;
}

// 🟩 kept pace · 🟨 slowed · 🟥 stopped.
// Reps: compared with your own best 10 s (it's a stamina story, spoiler-free).
// Holds: 🟩 ≥ 9 s held of 10, 🟨 ≥ 5 s, 🟥 less.
export function gridColors(kind, seg) {
  if (kind === 'hold') return seg.map((s) => (s >= 9 ? 'g' : s >= 5 ? 'y' : 'r'));
  const peak = Math.max(0, ...seg);
  return seg.map((s) => (s > 0 && s >= 0.75 * peak ? 'g' : s > 0 && s >= 0.4 * peak ? 'y' : 'r'));
}

export const SQUARE = { g: '🟩', y: '🟨', r: '🟥' };

export const gridEmoji = (kind, seg) => gridColors(kind, seg).map((c) => SQUARE[c]).join('');

// Segments travel and get stored as 6 base-36 chars ("998876").
export const encodeSeg = (seg) => seg.map((s) => Math.min(35, s).toString(36)).join('');
export const decodeSeg = (str) => [...String(str || '')].map((c) => parseInt(c, 36) || 0);

export function flagEmoji(cc) {
  if (!/^[A-Z]{2}$/.test(cc || '') || cc === 'XX') return '🌐';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

// "Repdle #142 · Squats 💪 47\n🟩🟩🟩🟩🟨🟥 Top 18% 🌍 · #3 🇮🇳\nBeat me → https://…/d/142-abc"
export function shareText(r) {
  const ex = EXERCISES[r.ex];
  const name = exerciseName(r.ex, r.v);
  const score = ex.kind === 'hold' ? `⏱️ ${r.score}s` : `💪 ${r.score}`;
  const lines = [`Repdle #${r.n} · ${name} ${score}`];
  let second = gridEmoji(ex.kind, r.seg);
  if (r.mode === 'tap') second += ' ✋ tap-counted';
  else if (r.topPct) {
    second += ` Top ${r.topPct}% 🌍`;
    if (r.countryRank && r.cc && r.cc !== 'XX') second += ` · #${r.countryRank} ${flagEmoji(r.cc)}`;
  }
  lines.push(second);
  if (r.streak > 1) lines.push(`🔥 ${r.streak}-day streak`);
  if (r.duelUrl) lines.push(`Beat me → ${r.duelUrl}`);
  return lines.join('\n');
}
