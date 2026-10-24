// Repdle API on Cloudflare Workers + D1 (free tier). Static files in /public
// are served by Workers Static Assets and never reach this code; only /api/*
// does (see run_worker_first in wrangler.jsonc).
import challenges from '../public/challenges.json';
import { EXERCISES, DURATION_MS, cleanNick } from '../public/js/rules.js';
import { segmentsFromTimes, segmentsFromHeld, encodeSeg } from '../public/js/grid.js';
import { dayNumber, challengeFor, msIntoDay } from '../public/js/day.js';
import { pidOf, UID_RE, PID_RE, DUEL_RE, LEAGUE_RE } from '../public/js/id.js';
import { START, tableOf, withTable, bumpCounter } from './db.js';
import { getSnapshot, trimSnapshot, runCron } from './stats.js';

const MAX_BODY = 8 * 1024;
const LATE_GRACE_MS = 15 * 60_000; // a session that started before 00:00 UTC may submit until 00:15
const LEAGUE_MAX_MEMBERS = 200;
const LEAGUES_PER_PLAYER = 5;
const KINDS = ['friends', 'office', 'college', 'gym', 'family', 'other'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    Object.assign(this, { status, code, extra });
  }
}
const bad = (code, extra) => { throw new HttpError(400, code, extra); };
const implausible = (code) => { throw new HttpError(422, 'implausible', { reason: code }); };

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

// Same-origin by default. If the static site is hosted elsewhere (e.g. Pages),
// list its origin in ALLOWED_ORIGINS.
function corsHeaders(req, env) {
  const origin = req.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' };
}

const isDev = (env) => env.DEV === '1';

function nowOf(req, env) {
  const fake = isDev(env) && Number(req.headers.get('x-repdle-now'));
  return fake || Date.now();
}

// Country comes from Cloudflare's own IP lookup. The IP itself is never stored.
function countryOf(req, env) {
  const cc = (isDev(env) && req.headers.get('x-repdle-country')) || req.cf?.country || 'XX';
  return /^[A-Z]{2}$/.test(cc) && cc !== 'T1' ? cc : 'XX';
}

// Best-effort per-isolate limiter (no storage, nothing persisted). Real
// protection: a free Cloudflare rate-limiting rule, see README.
const hits = new Map();
function rateLimit(req, env, bucket, max, windowMs = 60_000) {
  if (isDev(env)) return; // tests fire hundreds of requests from one address
  const ip = req.headers.get('cf-connecting-ip') || 'local';
  const key = `${bucket}|${ip}`;
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.start > windowMs) {
    if (hits.size > 5000) hits.clear();
    hits.set(key, { start: now, n: 1 });
    return;
  }
  if (++h.n > max) throw new HttpError(429, 'slow_down');
}

async function readJson(req) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > MAX_BODY) bad('too_big');
  const text = await req.text();
  if (text.length > MAX_BODY) bad('too_big');
  try {
    const b = JSON.parse(text);
    if (!b || typeof b !== 'object' || Array.isArray(b)) bad('json');
    return b;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    bad('json');
  }
}

async function pidFrom(b) {
  if (typeof b.uid !== 'string' || !UID_RE.test(b.uid)) bad('uid');
  return pidOf(b.uid);
}

const int = (x) => (Number.isInteger(x) ? x : NaN);

// ---------------- scores ----------------

async function submitScore(req, env, ctx, now) {
  rateLimit(req, env, 'score', 20);
  const b = await readJson(req);
  const pid = await pidFrom(b);
  const today = dayNumber(now, START);
  const n = int(b.n);
  const late = n === today - 1 && msIntoDay(now) < LATE_GRACE_MS;
  if (n !== today && !late) throw new HttpError(409, 'wrong_day', { today });
  const ch = challengeFor(challenges, n);
  if (b.ex !== ch.ex) bad('exercise', { expected: ch.ex });
  const ex = EXERCISES[ch.ex];
  if (b.v !== 0 && b.v !== 1) bad('variant');
  const v = b.v;
  if (b.mode !== 'cam' && b.mode !== 'tap') bad('mode');
  const cam = b.mode === 'cam' ? 1 : 0;

  // Plausibility: the score is rebuilt from the raw timeline, so the count, the
  // pace grid and the timing must all agree.
  let seg;
  if (ex.kind === 'reps') {
    const times = b.times;
    if (!Array.isArray(times)) implausible('times');
    if (times.length > ex.max[v]) implausible('too_many');
    let prev = -Infinity;
    for (const t of times) {
      if (!Number.isInteger(t) || t < 0 || t > DURATION_MS + 500) implausible('timing');
      if (t - prev < ex.minGapMs[v] * 0.9) implausible('too_fast');
      prev = t;
    }
    seg = segmentsFromTimes(times);
  } else {
    if (typeof b.held !== 'string' || !/^[01]{60}$/.test(b.held)) implausible('held');
    seg = segmentsFromHeld(b.held);
  }
  const reps = seg.reduce((s, x) => s + x, 0);
  if (b.reps !== reps) implausible('count');
  if (reps > ex.max[v]) implausible('too_many');
  if (cam && !(Number(b.fps) >= 4)) implausible('fps'); // camera scores need a running pose loop

  const ref = typeof b.ref === 'string' && PID_RE.test(b.ref) && b.ref !== pid ? b.ref : null;
  const nick = cleanNick(b.nick) || 'Player';
  const fd = Number.isInteger(b.fd) && b.fd >= 1 && b.fd <= n ? b.fd : n;
  const cc = b.cc === 'hide' ? 'XX' : countryOf(req, env);
  const fb = Number.isInteger(b.fb) && b.fb >= 0 && b.fb <= 9 ? b.fb : 0;
  const ts = Math.floor(msIntoDay(now) / 1000);

  const res = await withTable(
    env.DB,
    n,
    (t) =>
      env.DB.prepare(`INSERT INTO ${t} (n, pid, v, cam, reps, seg, cc, nick, fd, ref, fb, ts) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) ON CONFLICT (n, pid) DO NOTHING`)
        .bind(n, pid, v, cam, reps, encodeSeg(seg), cc, nick, fd, ref, fb, late ? ts + 86400 : ts)
        .run(),
    { create: true },
  );
  let score = { reps, seg: encodeSeg(seg), v, cam, cc };
  let scoreAt = now;
  const dup = res.meta.changes === 0;
  if (dup) {
    // Already played today: return the stored score (Wordle rule — one per day).
    const row = await env.DB.prepare(`SELECT reps, seg, v, cam, cc, ts FROM ${tableOf(n)} WHERE n = ?1 AND pid = ?2`).bind(n, pid).first();
    score = { reps: row.reps, seg: row.seg, v: row.v, cam: row.cam, cc: row.cc };
    scoreAt = now - msIntoDay(now) + row.ts * 1000;
  }
  const [snap, leagues, duel] = await Promise.all([
    getSnapshot(env, n, now, ctx),
    leagueBoards(env, n, pid, b.leagues),
    ref ? duelScore(env, n, ref) : null,
  ]);
  // `included`: whether this score is already inside the histogram (the app
  // adds the player on top of an older snapshot itself).
  const statsOut = { ...trimSnapshot(snap, score.v, score.cc), included: Boolean(score.cam) && snap.at >= scoreAt };
  return json({ ok: true, dup, pid, n, score, stats: statsOut, leagues, duel });
}

async function markShared(req, env, now) {
  rateLimit(req, env, 'share', 20);
  const b = await readJson(req);
  const pid = await pidFrom(b);
  const n = int(b.n);
  const today = dayNumber(now, START);
  if (!(n === today || n === today - 1)) return json({ ok: false, reason: 'old' });
  const r = await withTable(env.DB, n, (t) => env.DB.prepare(`UPDATE ${t} SET sh = 1 WHERE n = ?1 AND pid = ?2 AND sh = 0`).bind(n, pid).run());
  return json({ ok: true, changed: r?.meta?.changes || 0 });
}

async function stats(req, env, ctx, now, n, url) {
  const today = dayNumber(now, START);
  if (!(n >= 1 && n <= today)) throw new HttpError(404, 'no_day');
  // Edge cache: works on a custom domain; on *.workers.dev the Cache API is a
  // no-op and the per-isolate memory cache in getSnapshot does the job.
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(`${url.origin}/api/stats/${n}?h=${Math.floor(now / 600_000)}`);
  if (cache && !isDev(env)) {
    const hit = await cache.match(key);
    if (hit) return new Response(hit.body, hit);
  }
  const snap = await getSnapshot(env, n, now, ctx);
  const maxAge = n < today ? 86400 : 300;
  const res = json(snap, 200, { 'cache-control': `public, max-age=${maxAge}` });
  if (cache && !isDev(env)) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

// ---------------- duels ----------------
// A duel id is "<day>-<pid>". It points at that player's score of that day.

function parseDuel(id, today) {
  const m = DUEL_RE.exec(id || '');
  if (!m) bad('duel_id');
  const n = Number(m[1]);
  if (n < 1 || n > today) throw new HttpError(404, 'not_found');
  return { n, owner: m[2] };
}

async function duelScore(env, n, owner) {
  const row = await withTable(env.DB, n, (t) => env.DB.prepare(`SELECT pid, v, cam, reps, seg, nick, cc FROM ${t} WHERE n = ?1 AND pid = ?2`).bind(n, owner).first());
  return row ? { ...row, ex: challengeFor(challenges, n).ex } : null;
}

async function getDuel(req, env, ctx, now, id, url) {
  const today = dayNumber(now, START);
  const { n, owner } = parseDuel(id, today);
  const [score, accepts] = await Promise.all([
    duelScore(env, n, owner),
    // INDEXED BY: without table statistics SQLite would scan the whole day via the
    // primary key instead of the partial index (measured: 1 row read vs. all rows).
    withTable(env.DB, n, (tt) => env.DB.prepare(`SELECT pid, nick, reps, v, cam FROM ${tt} INDEXED BY ${tt}_ref WHERE n = ?1 AND ref = ?2 ORDER BY reps DESC LIMIT 20`).bind(n, owner).all().then((r) => r.results), { empty: [] }),
  ]);
  if (!score) throw new HttpError(404, 'not_found', { n, today });
  // Count a duel "open" once per device (the app sends o=1 only on the first visit).
  if (url.searchParams.get('o') === '1') ctx.waitUntil(bumpCounter(env.DB, today, 'duel_open').catch(() => {}));
  return json({ id, n, today, ...score, kind: EXERCISES[score.ex].kind, accepts });
}

async function acceptDuel(req, env, now, id) {
  rateLimit(req, env, 'accept', 20);
  const b = await readJson(req);
  const pid = await pidFrom(b);
  const today = dayNumber(now, START);
  const { n, owner } = parseDuel(id, today);
  if (pid === owner) bad('own_duel');
  if (n < today && !(n === today - 1 && msIntoDay(now) < LATE_GRACE_MS)) {
    // Replay of an old duel: counted (for the metrics) but not stored per player.
    await bumpCounter(env.DB, today, 'duel_late');
    return json({ ok: true, late: true });
  }
  // Link today's existing score to this duel.
  const r = await withTable(env.DB, n, (t) => env.DB.prepare(`UPDATE ${t} SET ref = ?1 WHERE n = ?2 AND pid = ?3 AND ref IS NULL`).bind(owner, n, pid).run());
  if (!r?.meta?.changes) {
    const mine = await withTable(env.DB, n, (t) => env.DB.prepare(`SELECT ref FROM ${t} WHERE n = ?1 AND pid = ?2`).bind(n, pid).first());
    if (!mine) throw new HttpError(409, 'not_played');
    return json({ ok: true, linked: mine.ref === owner });
  }
  return json({ ok: true, linked: true });
}

// ---------------- leagues ----------------

function cleanLeagueName(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, 30);
  if (s.length < 3 || !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ._'&!-]+$/u.test(s)) return null;
  return cleanNick(s.slice(0, 20)) ? s : null; // reuse the nickname word filter
}

function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map((x) => CODE_CHARS[x % CODE_CHARS.length]).join('');
}

async function createLeague(req, env, now) {
  rateLimit(req, env, 'league', 5);
  const b = await readJson(req);
  const pid = await pidFrom(b);
  const name = cleanLeagueName(b.name);
  if (!name) bad('name');
  const kind = KINDS.includes(b.kind) ? b.kind : 'friends';
  const nick = cleanNick(b.nick) || 'Player';
  for (let i = 0; i < 4; i++) {
    const code = newCode();
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO leagues (code, name, kind, owner, created, members) VALUES (?1, ?2, ?3, ?4, ?5, 1)').bind(code, name, kind, pid, now),
        env.DB.prepare('INSERT INTO members (code, pid, nick, joined) VALUES (?1, ?2, ?3, ?4)').bind(code, pid, nick, now),
      ]);
      return json({ ok: true, code, name, kind, members: 1 });
    } catch (e) {
      if (!/UNIQUE|constraint/i.test(String(e?.message))) throw e;
    }
  }
  throw new HttpError(503, 'try_again');
}

function leagueCode(code) {
  const c = String(code || '').toUpperCase();
  if (!LEAGUE_RE.test(c)) bad('code');
  return c;
}

async function joinLeague(req, env, now, rawCode) {
  rateLimit(req, env, 'league', 10);
  const code = leagueCode(rawCode);
  const b = await readJson(req);
  const pid = await pidFrom(b);
  const nick = cleanNick(b.nick) || 'Player';
  const lg = await env.DB.prepare('SELECT code, name, kind, members FROM leagues WHERE code = ?1').bind(code).first();
  if (!lg) throw new HttpError(404, 'no_league');
  // Insert only while the league has room; an existing member just updates the nickname.
  const ins = await env.DB.prepare('INSERT INTO members (code, pid, nick, joined) SELECT ?1, ?2, ?3, ?4 WHERE (SELECT members FROM leagues WHERE code = ?1) < ?5 ON CONFLICT (code, pid) DO NOTHING')
    .bind(code, pid, nick, now, LEAGUE_MAX_MEMBERS)
    .run();
  if (ins.meta.changes) {
    await env.DB.prepare('UPDATE leagues SET members = members + 1 WHERE code = ?1').bind(code).run();
    lg.members++;
  } else {
    const upd = await env.DB.prepare('UPDATE members SET nick = ?3 WHERE code = ?1 AND pid = ?2 AND nick <> ?3').bind(code, pid, nick).run();
    if (!upd.meta.changes && !(await env.DB.prepare('SELECT 1 AS x FROM members WHERE code = ?1 AND pid = ?2').bind(code, pid).first())) {
      throw new HttpError(409, 'full');
    }
  }
  return json({ ok: true, code, name: lg.name, kind: lg.kind, members: lg.members });
}

async function leaveLeague(req, env, rawCode) {
  rateLimit(req, env, 'league', 10);
  const code = leagueCode(rawCode);
  const pid = await pidFrom(await readJson(req));
  const r = await env.DB.prepare('DELETE FROM members WHERE code = ?1 AND pid = ?2').bind(code, pid).run();
  if (r.meta.changes) await env.DB.prepare('UPDATE leagues SET members = MAX(0, members - 1) WHERE code = ?1').bind(code).run();
  return json({ ok: true });
}

// Today's board of one league: one PK lookup per member.
async function boardOf(env, code, n) {
  const rows = await withTable(
    env.DB,
    n,
    (t) => env.DB.prepare(`SELECT m.pid, m.nick, s.reps, s.v, s.cam FROM members m LEFT JOIN ${t} s ON s.n = ?1 AND s.pid = m.pid WHERE m.code = ?2`).bind(n, code).all().then((r) => r.results),
    { empty: null },
  );
  const list = rows || (await env.DB.prepare('SELECT pid, nick FROM members WHERE code = ?1').bind(code).all()).results;
  return list
    .map((r) => ({ pid: r.pid, nick: r.nick, reps: r.reps ?? null, v: r.v ?? null, cam: r.cam ?? null }))
    .sort((a, b) => (b.reps ?? -1) - (a.reps ?? -1) || (a.v ?? 9) - (b.v ?? 9) || a.nick.localeCompare(b.nick));
}

async function leagueBoards(env, n, pid, codes) {
  if (!Array.isArray(codes) || !codes.length) return [];
  const list = [...new Set(codes.map((c) => String(c).toUpperCase()).filter((c) => LEAGUE_RE.test(c)))].slice(0, LEAGUES_PER_PLAYER);
  const out = [];
  for (const code of list) {
    const lg = await env.DB.prepare('SELECT l.code, l.name, l.kind, l.members FROM leagues l JOIN members m ON m.code = l.code AND m.pid = ?2 WHERE l.code = ?1').bind(code, pid).first();
    if (!lg) {
      out.push({ code, gone: true });
      continue;
    }
    out.push({ ...lg, today: (await boardOf(env, code, n)).slice(0, 50) });
  }
  return out;
}

async function getLeague(req, env, now, rawCode) {
  const code = leagueCode(rawCode);
  const n = dayNumber(now, START);
  const lg = await env.DB.prepare('SELECT code, name, kind, members, created FROM leagues WHERE code = ?1').bind(code).first();
  if (!lg) throw new HttpError(404, 'no_league');
  const today = await boardOf(env, code, n);
  // This week (last 7 days): days played and daily wins. Days are grouped by
  // month table and looked up by primary key (n, pid) — never a range scan.
  const byTable = new Map();
  for (let d = Math.max(1, n - 6); d <= n; d++) {
    const t = tableOf(d);
    if (!byTable.has(t)) byTable.set(t, []);
    byTable.get(t).push(d);
  }
  const rows = [];
  for (const days of byTable.values()) {
    const values = days.map((_, i) => `(?${i + 2})`).join(', ');
    const r = await withTable(
      env.DB,
      days[0],
      (t) => env.DB.prepare(`WITH d(n) AS (VALUES ${values}) SELECT s.n, s.pid, s.reps, s.v FROM members m CROSS JOIN d JOIN ${t} s ON s.n = d.n AND s.pid = m.pid WHERE m.code = ?1`).bind(code, ...days).all().then((x) => x.results),
      { empty: [] },
    );
    rows.push(...r);
  }
  const week = new Map(today.map((m) => [m.pid, { pid: m.pid, nick: m.nick, days: 0, wins: 0 }]));
  const perDay = new Map();
  for (const r of rows) {
    const w = week.get(r.pid);
    if (!w) continue;
    w.days++;
    if (!perDay.has(r.n)) perDay.set(r.n, []);
    perDay.get(r.n).push(r);
  }
  for (const list of perDay.values()) {
    const pool = list.some((r) => r.v === 0) ? list.filter((r) => r.v === 0) : list;
    const best = Math.max(...pool.map((r) => r.reps));
    for (const r of pool) if (r.reps === best && best > 0) week.get(r.pid).wins++;
  }
  return json({
    ...lg,
    n,
    today: today.slice(0, 200),
    week: [...week.values()].filter((w) => w.days).sort((a, b) => b.wins - a.wins || b.days - a.days),
  });
}

// ---------------- router ----------------

async function route(req, env, ctx, url) {
  const now = nowOf(req, env);
  const p = url.pathname.replace(/\/+$/, '');
  const m = req.method;
  let x;
  if (p === '/api/health') return json({ ok: true, n: dayNumber(now, START), now });
  if (p === '/api/score' && m === 'POST') return submitScore(req, env, ctx, now);
  if (p === '/api/share' && m === 'POST') return markShared(req, env, now);
  if ((x = /^\/api\/stats\/(\d{1,5})$/.exec(p)) && m === 'GET') return stats(req, env, ctx, now, Number(x[1]), url);
  if ((x = /^\/api\/duel\/([^/]+)$/.exec(p)) && m === 'GET') return getDuel(req, env, ctx, now, x[1], url);
  if ((x = /^\/api\/duel\/([^/]+)\/accept$/.exec(p)) && m === 'POST') return acceptDuel(req, env, now, x[1]);
  if (p === '/api/league' && m === 'POST') return createLeague(req, env, now);
  if ((x = /^\/api\/league\/([^/]+)$/.exec(p)) && m === 'GET') return getLeague(req, env, now, x[1]);
  if ((x = /^\/api\/league\/([^/]+)\/join$/.exec(p)) && m === 'POST') return joinLeague(req, env, now, x[1]);
  if ((x = /^\/api\/league\/([^/]+)\/leave$/.exec(p)) && m === 'POST') return leaveLeague(req, env, x[1]);
  if (p === '/api/dev/cron' && m === 'POST' && isDev(env)) return json(await runCron(env, now));
  throw new HttpError(404, 'no_route');
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found', { status: 404 });
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env, ctx, url);
      for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
      return res;
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, ...e.extra }, e.status, cors);
      console.error('api error', e?.stack || e);
      return json({ error: 'server' }, 500, cors);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runCron(env, event.scheduledTime));
  },
};

