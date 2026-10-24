import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentsFromTimes, segmentsFromHeld, gridEmoji, encodeSeg, decodeSeg, flagEmoji, shareText } from '../../public/js/grid.js';
import { placeIn } from '../../public/js/stats.js';
import { dayNumber, dateOfN, challengeFor, monthKey, msUntilNextDay } from '../../public/js/day.js';
import { cleanNick } from '../../public/js/rules.js';
import { pidOf, newUid, PID_RE, UID_RE } from '../../public/js/id.js';
import { readFileSync } from 'node:fs';

test('pace grid: segments from rep times, colours relative to your best 10 s', () => {
  const seg = [9, 9, 8, 7, 5, 2];
  assert.equal(gridEmoji('reps', seg), '🟩🟩🟩🟩🟨🟥');
  assert.equal(gridEmoji('reps', [0, 0, 0, 0, 0, 0]), '🟥🟥🟥🟥🟥🟥');
  assert.deepEqual(segmentsFromTimes([0, 9999, 10000, 59999, 60300]), [2, 1, 0, 0, 0, 2]);
  assert.equal(gridEmoji('hold', segmentsFromHeld('1'.repeat(45) + '0'.repeat(15))), '🟩🟩🟩🟩🟨🟥');
  assert.deepEqual(decodeSeg(encodeSeg([10, 35, 0, 3, 12, 40])), [10, 35, 0, 3, 12, 35]);
});

test('share text matches the Repdle format', () => {
  const text = shareText({ n: 142, ex: 'squat', v: 0, score: 47, seg: [9, 9, 8, 8, 7, 6], mode: 'cam', topPct: 18, countryRank: 3, cc: 'IN', streak: 5, duelUrl: 'https://repdle.app/d/142-abcdefghijkl' });
  assert.equal(text, 'Repdle #142 · Squats 💪 47\n🟩🟩🟩🟩🟩🟨 Top 18% 🌍 · #3 🇮🇳\n🔥 5-day streak\nBeat me → https://repdle.app/d/142-abcdefghijkl');
  const hold = shareText({ n: 3, ex: 'plank', v: 1, score: 52, seg: [10, 10, 10, 10, 7, 5], mode: 'tap', streak: 1 });
  assert.equal(hold, 'Repdle #3 · Knee plank ⏱️ 52s\n🟩🟩🟩🟩🟨🟨 ✋ tap-counted');
  assert.equal(flagEmoji('BR'), '🇧🇷');
  assert.equal(flagEmoji('XX'), '🌐');
});

test('percentile and rank from a histogram', () => {
  const hist = [[10, 2], [20, 5], [30, 2], [40, 1]];
  assert.deepEqual(placeIn(hist, 35), { rank: 2, total: 11, topPct: 19 });
  assert.deepEqual(placeIn(hist, 50), { rank: 1, total: 11, topPct: 10 });
  assert.deepEqual(placeIn([], 12), { rank: 1, total: 1, topPct: 100 });
  assert.deepEqual(placeIn(hist, 20, true), { rank: 4, total: 10, topPct: 40 });
});

test('day numbers are UTC: same challenge everywhere at the same instant', () => {
  const data = JSON.parse(readFileSync(new URL('../../public/challenges.json', import.meta.url)));
  assert.equal(data.days.length, 365);
  const s = data.start;
  assert.equal(dayNumber(Date.parse(`${s}T00:00:00Z`), s), 1);
  assert.equal(dayNumber(Date.parse(`${s}T23:59:59Z`), s), 1);
  // 23:30 in Los Angeles (UTC−7) is already 06:30 UTC on the next day → day 2 everywhere
  assert.equal(dayNumber(Date.parse(`${s}T23:30:00-07:00`), s), 2);
  assert.equal(dateOfN(1, s), s);
  assert.equal(challengeFor(data, 1).ex, 'squat');
  assert.equal(challengeFor(data, 366).ex, challengeFor(data, 1).ex, 'calendar wraps after a year');
  assert.match(monthKey(1, s), /^\d{6}$/);
  assert.equal(msUntilNextDay(Date.parse('2026-01-01T23:00:00Z')), 3600000);
});

test('nicknames: unicode names ok, junk and slurs refused', () => {
  assert.equal(cleanNick('  Priya  K '), 'Priya K');
  assert.equal(cleanNick('राहुल'), 'राहुल');
  assert.equal(cleanNick('a'), null);
  assert.equal(cleanNick('<script>'), null);
  assert.equal(cleanNick('fuckboy'), null);
});

test('anonymous ids: pid is a stable 12-char hash of the secret uid', async () => {
  const uid = newUid();
  assert.match(uid, UID_RE);
  const pid = await pidOf(uid);
  assert.match(pid, PID_RE);
  assert.equal(await pidOf(uid), pid);
  assert.notEqual(await pidOf(newUid()), pid);
});
