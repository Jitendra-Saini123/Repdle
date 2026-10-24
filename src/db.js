// D1 storage. Scores live in one table per calendar month (s_202610, s_202611…)
// so old months can be dropped in one statement instead of deleting rows one by
// one (each deleted row would count against the 100K rows-written/day budget).
import challenges from '../public/challenges.json';
import { monthKey } from '../public/js/day.js';

export const START = challenges.start;
export const tableOf = (n) => `s_${monthKey(n, START)}`; // n is always a validated integer

// WITHOUT ROWID + PRIMARY KEY (n, pid): an insert writes exactly one row (no
// separate index), and the PK makes "one score per player per day" atomic.
// The only secondary index is partial: just the rows that came from a duel link.
function schema(t) {
  return [
    `CREATE TABLE IF NOT EXISTS ${t} (
      n    INTEGER NOT NULL,           -- Repdle day number
      pid  TEXT    NOT NULL,           -- public anonymous id
      v    INTEGER NOT NULL,           -- 0 standard, 1 low-impact
      cam  INTEGER NOT NULL,           -- 1 camera-verified, 0 tap mode (unranked)
      reps INTEGER NOT NULL,           -- reps, or seconds held
      seg  TEXT    NOT NULL,           -- pace per 10 s, 6 base-36 chars
      cc   TEXT    NOT NULL,           -- country (XX = hidden/unknown)
      nick TEXT    NOT NULL,
      fd   INTEGER NOT NULL,           -- first day this device played (cohort)
      ref  TEXT,                       -- pid of the duel this score answers
      sh   INTEGER NOT NULL DEFAULT 0, -- tapped share
      fb   INTEGER NOT NULL DEFAULT 0, -- fallback reason (0 none)
      ts   INTEGER NOT NULL,           -- seconds after 00:00 UTC
      PRIMARY KEY (n, pid)
    ) WITHOUT ROWID`,
    `CREATE INDEX IF NOT EXISTS ${t}_ref ON ${t} (n, ref) WHERE ref IS NOT NULL`,
  ];
}

export async function ensureTable(db, n) {
  await db.batch(schema(tableOf(n)).map((s) => db.prepare(s)));
}

export const isNoTable = (e) => /no such table/i.test(String(e?.message || e));

// Run fn(table). A month that doesn't exist yet is created when `create` is
// set (writes), otherwise treated as empty (reads).
export async function withTable(db, n, fn, { create = false, empty = null } = {}) {
  const t = tableOf(n);
  try {
    return await fn(t);
  } catch (e) {
    if (!isNoTable(e)) throw e;
    if (!create) return empty;
    await ensureTable(db, n);
    return fn(t);
  }
}

export async function bumpCounter(db, day, key) {
  await db
    .prepare('INSERT INTO counters (day, k, n) VALUES (?1, ?2, 1) ON CONFLICT (day, k) DO UPDATE SET n = n + 1')
    .bind(day, key)
    .run();
}
