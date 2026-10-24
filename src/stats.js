// Histogram snapshots (hourly cron + cheap early-day refresh), daily metrics and
// the monthly clean-up.
import { VARIANTS } from '../public/js/rules.js';
import { dayNumber, dateOfN, monthKey } from '../public/js/day.js';
import { START, ensureTable, withTable } from './db.js';

const MEM_TTL_MS = 60_000; // per-isolate cache at each Cloudflare edge location
// Small days are refreshed on the spot (cheap: the recompute reads 2 rows per
// score): every 5 s below 100 ranked scores, every 10 min below 1,000, then
// only the hourly cron. That keeps the first players' ranks exact.
const SMALL = 100;
const refreshAfter = (total) => (total < SMALL ? 5_000 : total < 1000 ? 10 * 60_000 : Infinity);
const BOARD_MIN = 3; // a country needs 3 players to be ranked on the board

const mem = new Map(); // n → { snap, loadedAt }

export async function computeSnapshot(env, n, now) {
  const rows = await withTable(
    env.DB,
    n,
    (t) => env.DB.prepare(`SELECT v, cc, reps, COUNT(*) AS c FROM ${t} WHERE n = ?1 AND cam = 1 GROUP BY v, cc, reps`).bind(n).all().then((r) => r.results),
    { empty: [] },
  );
  const vs = Array.from({ length: VARIANTS }, () => ({ total: 0, world: new Map(), cc: {} }));
  for (const { v, cc, reps, c } of rows) {
    const x = vs[v];
    if (!x) continue;
    x.total += c;
    x.world.set(reps, (x.world.get(reps) || 0) + c);
    (x.cc[cc] ||= []).push([reps, c]);
  }
  const snap = {
    n,
    at: now,
    total: vs.reduce((s, x) => s + x.total, 0),
    v: vs.map((x) => {
      for (const h of Object.values(x.cc)) h.sort((a, b) => a[0] - b[0]);
      return { total: x.total, world: [...x.world].sort((a, b) => a[0] - b[0]), cc: x.cc, board: boardOf(x.cc) };
    }),
  };
  await env.DB.prepare(
    'INSERT INTO snapshots (n, at, total, body) VALUES (?1, ?2, ?3, ?4) ON CONFLICT (n) DO UPDATE SET at = excluded.at, total = excluded.total, body = excluded.body',
  )
    .bind(n, now, snap.total, JSON.stringify(snap))
    .run();
  mem.set(n, { snap, loadedAt: now });
  return snap;
}

function boardOf(ccHists) {
  return Object.entries(ccHists)
    .filter(([cc]) => cc !== 'XX')
    .map(([cc, h]) => {
      let count = 0, sum = 0, best = 0;
      for (const [s, c] of h) { count += c; sum += s * c; best = Math.max(best, s); }
      let mid = count / 2, med = 0;
      for (const [s, c] of h) { if ((mid -= c) <= 0) { med = s; break; } }
      return { cc, n: count, avg: Math.round((sum / count) * 10) / 10, med, best };
    })
    .sort((a, b) => (b.n >= BOARD_MIN) - (a.n >= BOARD_MIN) || b.avg - a.avg || b.n - a.n);
}

// Latest snapshot for day n. Fresh enough is: < 1 min in this isolate, else the
// D1 row (refreshed on the spot while the day is still small).
export async function getSnapshot(env, n, now, ctx) {
  const hit = mem.get(n);
  if (hit && now - hit.loadedAt < MEM_TTL_MS && hit.snap.total >= SMALL) return hit.snap;
  const row = await env.DB.prepare('SELECT body, at, total FROM snapshots WHERE n = ?1').bind(n).first();
  const today = dayNumber(now, START);
  if (!row || (n === today && now - row.at > refreshAfter(row.total))) {
    return computeSnapshot(env, n, now);
  }
  const snap = JSON.parse(row.body);
  if (n === today && now - row.at > 70 * 60_000 && ctx) ctx.waitUntil(computeSnapshot(env, n, now)); // a cron run was missed
  mem.set(n, { snap, loadedAt: now });
  return snap;
}

// What a player needs on the result screen: their variant's world histogram,
// their country's histogram and the top of the country board.
export function trimSnapshot(snap, v, cc) {
  const x = snap.v[v] || { total: 0, world: [], cc: {}, board: [] };
  const board = x.board.slice(0, 12);
  const mine = x.board.find((b) => b.cc === cc);
  if (mine && !board.includes(mine)) board.push(mine);
  return { n: snap.n, at: snap.at, v, total: x.total, world: x.world, country: { cc, hist: x.cc[cc] || [] }, board, boardMin: BOARD_MIN };
}

export async function computeDailyMetrics(env, n, now) {
  const m = await withTable(
    env.DB,
    n,
    (t) =>
      env.DB.prepare(
        `SELECT COUNT(*) AS players, COALESCE(SUM(cam), 0) AS cam, COALESCE(SUM(v = 1), 0) AS low_impact,
                COALESCE(SUM(fb > 0), 0) AS fallback, COALESCE(SUM(sh), 0) AS sharers,
                COALESCE(SUM(ref IS NOT NULL), 0) AS accepts, COALESCE(SUM(fd = ?1), 0) AS new_users,
                COALESCE(SUM(fd = ?1 - 1), 0) AS ret_d1, COALESCE(SUM(fd = ?1 - 7), 0) AS ret_d7,
                COALESCE(SUM(fd = ?1 - 30), 0) AS ret_d30
         FROM ${t} WHERE n = ?1`,
      ).bind(n).first(),
    { empty: null },
  );
  if (!m) return null;
  const counters = Object.fromEntries(
    ((await env.DB.prepare('SELECT k, n FROM counters WHERE day = ?1').bind(n).all()).results || []).map((r) => [r.k, r.n]),
  );
  const row = { n, date: dateOfN(n, START), ...m, duel_open: counters.duel_open || 0, duel_late: counters.duel_late || 0, computed: now };
  const cols = Object.keys(row);
  await env.DB.prepare(
    `INSERT INTO daily_metrics (${cols.join(', ')}) VALUES (${cols.map((_, i) => `?${i + 1}`).join(', ')})
     ON CONFLICT (n) DO UPDATE SET ${cols.filter((c) => c !== 'n').map((c) => `${c} = excluded.${c}`).join(', ')}`,
  )
    .bind(...cols.map((c) => row[c]))
    .run();
  return row;
}

// On the 1st of a month: keep this month and last month, drop older score
// tables (one DDL statement each, instead of a row-by-row DELETE).
export async function dropOldMonths(env, n) {
  const keep = monthKey(n - 1, START); // yesterday = last day of the previous month
  const tables = (await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 's_[0-9]*'").all()).results || [];
  const dropped = [];
  for (const { name } of tables) {
    if (name.slice(2) < keep) {
      await env.DB.prepare(`DROP TABLE IF EXISTS ${name}`).run();
      dropped.push(name);
    }
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM snapshots WHERE n < ?1').bind(n - 62),
    env.DB.prepare('DELETE FROM counters WHERE day < ?1').bind(n - 62),
  ]);
  return dropped;
}

export async function runCron(env, now) {
  const n = dayNumber(now, START);
  const d = new Date(now);
  const done = { n, snapshot: null, metrics: [], dropped: [] };
  await ensureTable(env.DB, n);
  await ensureTable(env.DB, n + 1); // tomorrow may be a new month
  done.snapshot = (await computeSnapshot(env, n, now)).total;
  if (d.getUTCHours() === 0) {
    await computeSnapshot(env, n - 1, now); // final numbers for yesterday
    for (const day of [n - 1, n - 2]) {
      const row = day >= 1 ? await computeDailyMetrics(env, day, now) : null;
      if (row) done.metrics.push(row);
    }
    if (d.getUTCDate() === 1) done.dropped = await dropOldMonths(env, n);
  }
  return done;
}
