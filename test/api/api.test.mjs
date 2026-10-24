// End-to-end API tests against a running `npm run dev`. Sequential on purpose:
// later tests read what earlier ones wrote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { call, player, submit, scoreBody, cron, dayWith, exOf, repTimes, data } from './helpers.mjs';
import { placeIn } from '../../public/js/stats.js';
import { EXERCISES } from '../../public/js/rules.js';
import { dateOfN, dayNumber } from '../../public/js/day.js';

const SQ = dayWith('squat');
const PL = dayWith('plank', SQ);
const owner = await player('Ravi');
const friend = await player('Priya');
const friend2 = await player('राहुल');

test('health reports the day for the faked clock', async () => {
  const r = await call('GET', '/api/health', null, { n: SQ });
  assert.equal(r.status, 200);
  assert.equal(r.body.n, SQ);
});

test('valid camera score is stored; pid derives from uid; pace grid rebuilt from rep times', async () => {
  const times = [...repTimes(30, { gap: 1000, startAt: 500 }), ...repTimes(12, { gap: 2400, startAt: 31000 })];
  const r = await call('POST', '/api/score', { ...scoreBody(owner, SQ, times.length), times }, { n: SQ });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.pid, owner.pid);
  assert.equal(r.body.dup, false);
  assert.equal(r.body.score.reps, 42);
  assert.equal(r.body.score.seg, 'aaa444'); // 10,10,10,4,4,4 in base 36
  assert.equal(r.body.score.cc, 'IN');
  assert.ok(r.body.stats && Array.isArray(r.body.stats.world));
});

test('second score the same day is refused and the first one returned (one per day)', async () => {
  const r = await submit(owner, SQ, 70);
  assert.equal(r.status, 200);
  assert.equal(r.body.dup, true);
  assert.equal(r.body.score.reps, 42);
});

test('plausibility checks reject impossible scores', async () => {
  const p = await player();
  const cases = [
    [{ n: SQ + 1 }, 409, 'wrong_day', 'future day'],
    [{ ex: exOf(SQ) === 'squat' ? 'pushup' : 'squat' }, 400, 'exercise', 'wrong exercise'],
    [{ reps: 81, times: repTimes(81, { gap: 700 }) }, 422, 'too_many', 'above the per-exercise max'],
    [{ reps: 20, times: repTimes(20, { gap: 200 }) }, 422, 'too_fast', 'reps 0.2 s apart'],
    [{ reps: 25 }, 422, 'count', 'count ≠ rep timeline'],
    [{ reps: 2, times: [100, 61500] }, 422, 'timing', 'rep after the 60 s'],
    [{ fps: 2 }, 422, 'fps', 'camera mode with no real pose loop'],
    [{ mode: 'robot' }, 400, 'mode', 'unknown mode'],
    [{ uid: 'short' }, 400, 'uid', 'bad anonymous id'],
  ];
  for (const [patch, status, code, why] of cases) {
    const n = patch.n || SQ;
    const body = { ...scoreBody(p, SQ, 20), ...patch, n };
    const r = await call('POST', '/api/score', body, { n: SQ });
    assert.equal(r.status, status, `${why}: ${r.text}`);
    assert.ok(r.body.error === code || r.body.reason === code, `${why}: got ${r.text}`);
  }
  const big = await call('POST', '/api/score', null, { n: SQ, raw: JSON.stringify({ uid: p.uid, pad: 'x'.repeat(9000) }) });
  assert.equal(big.status, 400);
});

test('a session that started before midnight may submit until 00:15 UTC', async () => {
  const p = await player();
  const ok = await call('POST', '/api/score', scoreBody(p, SQ, 20), { n: SQ + 1, h: 0, min: 10 });
  assert.equal(ok.status, 200, ok.text);
  const p2 = await player();
  const late = await call('POST', '/api/score', scoreBody(p2, SQ, 20), { n: SQ + 1, h: 0, min: 20 });
  assert.equal(late.status, 409);
});

test('hold exercise counts held seconds from the 60-char timeline', async () => {
  const p = await player();
  const held = '1'.repeat(45) + '0'.repeat(10) + '1'.repeat(5);
  const r = await call('POST', '/api/score', { ...scoreBody(p, PL, 50), held }, { n: PL });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.score.reps, 50);
  assert.equal(r.body.score.seg, 'aaaa55'); // 10,10,10,10,5,5
  const bad = await call('POST', '/api/score', { ...scoreBody(await player(), PL, 3), held: '111' }, { n: PL });
  assert.equal(bad.status, 422);
});

test('every exercise and variant: the server accepts the max and rejects beyond it', async () => {
  for (const ex of Object.keys(EXERCISES)) {
    const e = EXERCISES[ex];
    const n = dayWith(ex, SQ + 14); // away from the days the metrics tests count
    for (const v of [0, 1]) {
      if (e.kind === 'reps') {
        const max = e.max[v];
        const gap = Math.max(e.minGapMs[v], Math.floor(59000 / max));
        const ok = await submit(await player(), n, max, { v, times: repTimes(max, { gap, startAt: 300 }) }, { n });
        assert.equal(ok.status, 200, `${ex} v${v} at max ${max}: ${ok.text}`);
        const over = await submit(await player(), n, max + 1, { v, times: repTimes(max + 1, { gap: Math.floor(59000 / (max + 1)), startAt: 300 }) }, { n });
        assert.equal(over.status, 422, `${ex} v${v} above max`);
        const fast = await submit(await player(), n, 10, { v, times: repTimes(10, { gap: Math.floor(e.minGapMs[v] * 0.5) }) }, { n });
        assert.equal(fast.body.reason, 'too_fast', `${ex} v${v} reps closer than the minimum gap`);
        const tap = await submit(await player(), n, 12, { v, mode: 'tap', fps: 0 }, { n });
        assert.equal(tap.status, 200, `${ex} v${v} tap mode`);
        assert.equal(tap.body.score.cam, 0);
      } else {
        const full = await submit(await player(), n, 60, { v }, { n });
        assert.equal(full.status, 200, `${ex} v${v} full minute`);
        assert.equal(full.body.score.seg, 'aaaaaa');
        const tap = await submit(await player(), n, 33, { v, mode: 'tap', fps: 0 }, { n });
        assert.equal(tap.status, 200, `${ex} v${v} tap hold`);
        const bad = await call('POST', '/api/score', { ...scoreBody(await player(), n, 60, { v }), reps: 61, held: '1'.repeat(61) }, { n });
        assert.equal(bad.status, 422, `${ex} v${v} 61 s`);
      }
    }
  }
});

test('duel: friend opens link, plays with ref, owner sees the accept', async () => {
  const id = `${SQ}-${owner.pid}`;
  const open = await call('GET', `/api/duel/${id}?o=1`, null, { n: SQ });
  assert.equal(open.status, 200, open.text);
  assert.equal(open.body.reps, 42);
  assert.equal(open.body.nick, 'Ravi');
  assert.equal(open.body.ex, exOf(SQ));
  const r = await submit(friend, SQ, 47, { ref: owner.pid }, { cc: 'BR' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.duel.reps, 42, 'submit response carries the challenger score for the comparison');
  const after = await call('GET', `/api/duel/${id}`, null, { n: SQ });
  assert.deepEqual(after.body.accepts.map((a) => [a.nick, a.reps]), [['Priya', 47]]);
});

test('duel: someone who already played links their score; own duel is refused', async () => {
  const id = `${SQ}-${owner.pid}`;
  await submit(friend2, SQ, 30, {}, { cc: 'IN' });
  const r = await call('POST', `/api/duel/${id}/accept`, { uid: friend2.uid }, { n: SQ });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.linked, true);
  const own = await call('POST', `/api/duel/${id}/accept`, { uid: owner.uid }, { n: SQ });
  assert.equal(own.status, 400);
  const nobody = await call('POST', `/api/duel/${id}/accept`, { uid: (await player()).uid }, { n: SQ });
  assert.equal(nobody.status, 409);
  const after = await call('GET', `/api/duel/${id}`, null, { n: SQ });
  assert.equal(after.body.accepts.length, 2);
  assert.equal(after.body.accepts[1].nick, 'राहुल');
});

test('duel: opening an old duel the next day is a counted late replay', async () => {
  const id = `${SQ}-${owner.pid}`;
  const r = await call('POST', `/api/duel/${id}/accept`, { uid: (await player()).uid }, { n: SQ + 2 });
  assert.equal(r.status, 200);
  assert.equal(r.body.late, true);
  const missing = await call('GET', `/api/duel/${SQ}-aaaaaaaaaaaa`, null, { n: SQ });
  assert.equal(missing.status, 404);
  const future = await call('GET', `/api/duel/${SQ + 5}-${owner.pid}`, null, { n: SQ });
  assert.equal(future.status, 404);
});

test('share marks the score once', async () => {
  const a = await call('POST', '/api/share', { uid: owner.uid, n: SQ }, { n: SQ });
  assert.equal(a.body.changed, 1);
  const b = await call('POST', '/api/share', { uid: owner.uid, n: SQ }, { n: SQ });
  assert.equal(b.body.changed, 0);
});

let code;
test('leagues: create, join, board, standings in the score response, leave', async () => {
  const c = await call('POST', '/api/league', { uid: owner.uid, name: 'Office Warriors', kind: 'office', nick: 'Ravi' }, { n: SQ });
  assert.equal(c.status, 200, c.text);
  code = c.body.code;
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
  const j = await call('POST', `/api/league/${code.toLowerCase()}/join`, { uid: friend.uid, nick: 'Priya' }, { n: SQ });
  assert.equal(j.status, 200, j.text);
  assert.equal(j.body.members, 2);
  const again = await call('POST', `/api/league/${code}/join`, { uid: friend.uid, nick: 'Priya K' }, { n: SQ });
  assert.equal(again.body.members, 2, 'rejoining does not double count');
  const j3 = await call('POST', `/api/league/${code}/join`, { uid: friend2.uid, nick: 'राहुल' }, { n: SQ });
  assert.equal(j3.body.members, 3);
  const g = await call('GET', `/api/league/${code}`, null, { n: SQ });
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.today.map((m) => [m.nick, m.reps]), [['Priya K', 47], ['Ravi', 42], ['राहुल', 30]]);
  assert.deepEqual(g.body.week.map((w) => [w.nick, w.days, w.wins]), [['Priya K', 1, 1], ['Ravi', 1, 0], ['राहुल', 1, 0]]);
  // next day: a new member's score arrives with league standings attached
  const n2 = SQ + 1;
  const s = await submit(friend, n2, 10, { leagues: [code, 'ZZZZZZ'] });
  assert.equal(s.status, 200, s.text);
  const lg = s.body.leagues.find((l) => l.code === code);
  assert.equal(lg.name, 'Office Warriors');
  assert.equal(lg.today[0].reps, 10);
  assert.equal(s.body.leagues.find((l) => l.code === 'ZZZZZZ').gone, true);
  const week = await call('GET', `/api/league/${code}`, null, { n: n2 });
  assert.deepEqual(week.body.week.find((w) => w.nick === 'Priya K'), { pid: friend.pid, nick: 'Priya K', days: 2, wins: 2 });
  const leave = await call('POST', `/api/league/${code}/leave`, { uid: friend2.uid }, { n: n2 });
  assert.equal(leave.status, 200);
  const after = await call('GET', `/api/league/${code}`, null, { n: n2 });
  assert.equal(after.body.members, 2);
  const bad = await call('POST', '/api/league', { uid: owner.uid, name: 'x' }, { n: SQ });
  assert.equal(bad.status, 400);
  const rude = await call('POST', '/api/league', { uid: owner.uid, name: 'Shit Squad' }, { n: SQ });
  assert.equal(rude.status, 400);
  const none = await call('GET', '/api/league/QQQQQQ', null, { n: SQ });
  assert.equal(none.status, 404);
});

test('histogram snapshot: cron builds world + country histograms; tap scores are unranked', async () => {
  const n = dayWith('squat', SQ + 1);
  const scores = { IN: [20, 25, 30, 30, 35, 40], BR: [28, 33, 45], US: [15, 50] };
  for (const [cc, list] of Object.entries(scores)) for (const reps of list) assert.equal((await submit(await player(), n, reps, {}, { cc })).status, 200);
  assert.equal((await submit(await player(), n, 79, { mode: 'tap', fps: 0, fb: 1 }, { cc: 'IN' })).status, 200);
  assert.equal((await submit(await player(), n, 12, { v: 1 }, { cc: 'IN' })).status, 200);
  const c = await cron(n, 13, 4);
  assert.equal(c.status, 200, c.text);
  assert.equal(c.body.snapshot, 12, '11 standard + 1 low-impact camera scores; the tap score is left out');
  const s = await call('GET', `/api/stats/${n}`, null, { n });
  assert.equal(s.status, 200);
  assert.equal(s.body.v[0].total, 11);
  assert.equal(s.body.v[1].total, 1);
  assert.deepEqual(s.body.v[0].cc.IN, [[20, 1], [25, 1], [30, 2], [35, 1], [40, 1]]);
  // ranked countries (≥3 players) first, by average: BR 35.3, IN 30; then US (2 players)
  assert.deepEqual(s.body.v[0].board.map((b) => [b.cc, b.n, b.avg]), [['BR', 3, 35.3], ['IN', 6, 30], ['US', 2, 32.5]]);
  // Small day (< 100 ranked scores): the snapshot is rebuilt on the spot, so it already contains this score.
  const me = await submit(await player(), n, 34, {}, { cc: 'IN', h: 13, min: 5 });
  const st = me.body.stats;
  assert.equal(st.total, 12);
  assert.equal(st.included, true);
  const world = placeIn(st.world, 34, st.included);
  const country = placeIn(st.country.hist, 34, st.included);
  assert.deepEqual([world.rank, world.total, world.topPct], [5, 12, 42]);
  assert.deepEqual([country.rank, country.total], [3, 7]);
  // Bigger day (≥ 100): served from the cached snapshot; the app adds the player itself.
  for (let i = 0; i < 95; i++) await submit(await player(), n, 10 + (i % 40), {}, { cc: 'BR', h: 13, min: 6 });
  const c2 = await cron(n, 13, 10);
  assert.equal(c2.body.snapshot, 108);
  const late = await submit(await player(), n, 60, {}, { cc: 'US', h: 13, min: 12 });
  assert.equal(late.body.stats.total, 107, 'standard-variant total from the 13:10 snapshot');
  assert.equal(late.body.stats.included, false);
  assert.equal(placeIn(late.body.stats.world, 60, false).rank, 1);
});

test('daily metrics: midnight cron writes share rate, duel and retention counts', async () => {
  const n = SQ;
  const returning = await player();
  await submit(returning, n, 20, { fd: n }); // new on day n
  await submit(returning, n + 1, 20, { fd: n }); // back on day n+1
  const c = await cron(n + 1, 0, 5); // 00:05 on day n+1 → metrics for day n (and n-1)
  assert.equal(c.status, 200, c.text);
  const m = c.body.metrics.find((x) => x.n === n);
  // day n: owner, friend, friend2, the 00:10 late player, returning
  assert.equal(m.players, 5);
  assert.equal(m.new_users, 5);
  assert.equal(m.sharers, 1);
  assert.equal(m.accepts, 2);
  assert.equal(m.duel_open, 1);
  const c2 = await cron(n + 3, 0, 5); // → metrics for n+2 and n+1
  const m1 = c2.body.metrics.find((x) => x.n === n + 1);
  assert.equal(m1.ret_d1, 1, 'the returning player came back on day 1');
  const m2 = c2.body.metrics.find((x) => x.n === n + 2);
  assert.equal(m2?.duel_late ?? 0, 1, 'late duel replay counted on the day it happened');
});

test('CORS: only listed origins get CORS headers', async () => {
  const r = await call('GET', '/api/health', null, { origin: 'https://evil.example' });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
});

test('month partitions: a new month gets its own table; the 1st drops months older than last month', async () => {
  // pick the first day of a month after this run's days
  let n = SQ + 40;
  while (!dateOfN(n, data.start).endsWith('-01')) n++;
  const p = await player();
  assert.equal((await submit(p, n, 20)).status, 200);
  const c = await cron(n, 0, 5);
  assert.equal(c.status, 200, c.text);
  assert.ok(Array.isArray(c.body.dropped));
  const prevMonth = dateOfN(n - 1, data.start).slice(0, 7).replace('-', '');
  for (const t of c.body.dropped) assert.ok(t.slice(2) < prevMonth, `${t} should be older than ${prevMonth}`);
  // the duel from this run's first days is now expired → 404, not a crash
  if (c.body.dropped.includes(`s_${dateOfN(SQ, data.start).slice(0, 7).replace('-', '')}`)) {
    const gone = await call('GET', `/api/duel/${SQ}-${owner.pid}`, null, { n });
    assert.equal(gone.status, 404);
  }
  assert.equal(dayNumber(Date.parse(`${dateOfN(n, data.start)}T05:00:00Z`), data.start), n);
});
