-- Repdle D1 schema. Score tables (s_YYYYMM, one per month) are created by the
-- Worker itself (src/db.js), because their names depend on the date.

-- Hourly histogram snapshot per day: world + per-country histograms and the
-- country board, as one JSON blob (one row read per cache miss).
CREATE TABLE IF NOT EXISTS snapshots (
  n     INTEGER PRIMARY KEY,
  at    INTEGER NOT NULL,   -- ms epoch when computed
  total INTEGER NOT NULL,   -- ranked (camera) scores included
  body  TEXT    NOT NULL
);

-- Privacy-friendly event counters: just a number per day per event, no ids.
CREATE TABLE IF NOT EXISTS counters (
  day INTEGER NOT NULL,
  k   TEXT    NOT NULL,     -- duel_open, duel_late
  n   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, k)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS leagues (
  code    TEXT PRIMARY KEY, -- 6 chars, no 0/O/1/I
  name    TEXT NOT NULL,
  kind    TEXT NOT NULL,    -- friends, office, college, gym, family, other
  owner   TEXT NOT NULL,    -- pid
  created INTEGER NOT NULL,
  members INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS members (
  code   TEXT NOT NULL,
  pid    TEXT NOT NULL,
  nick   TEXT NOT NULL,
  joined INTEGER NOT NULL,
  PRIMARY KEY (code, pid)
) WITHOUT ROWID;

-- One row per day, written by the midnight cron. Survives the monthly drop of
-- raw scores, so the 30-day metrics plan always has its numbers.
CREATE TABLE IF NOT EXISTS daily_metrics (
  n          INTEGER PRIMARY KEY,
  date       TEXT    NOT NULL,
  players    INTEGER NOT NULL,
  cam        INTEGER NOT NULL,  -- camera-verified scores
  low_impact INTEGER NOT NULL,
  fallback   INTEGER NOT NULL,  -- used tap mode because camera failed/slow
  sharers    INTEGER NOT NULL,  -- players who tapped Share/Copy
  accepts    INTEGER NOT NULL,  -- scores that answered a duel link
  duel_open  INTEGER NOT NULL,  -- first opens of a duel link by someone else
  duel_late  INTEGER NOT NULL,  -- duel replays after the duel's day
  new_users  INTEGER NOT NULL,  -- players whose first day is this day
  ret_d1     INTEGER NOT NULL,  -- players today whose first day was n-1
  ret_d7     INTEGER NOT NULL,  -- … n-7
  ret_d30    INTEGER NOT NULL,  -- … n-30
  computed   INTEGER NOT NULL
);
