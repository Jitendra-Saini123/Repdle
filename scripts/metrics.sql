-- Repdle 30-day metrics. Run with:  npm run metrics   (production)
--                                   npm run metrics:local
-- daily_metrics is written by the 00:05 UTC cron for the previous day (and
-- re-written the next night, so late shares are included).

-- 1) Last 30 days, one row per day
SELECT d.n AS day,
       d.date,
       d.players,
       ROUND(100.0 * d.sharers / NULLIF(d.players, 0), 1)   AS share_pct,      -- pass ≥ 15
       ROUND(100.0 * d.accepts / NULLIF(d.duel_open, 0), 1) AS duel_accept_pct, -- pass ≥ 25
       ROUND(100.0 * d.ret_d1 / NULLIF(c1.new_users, 0), 1) AS d1_pct,         -- cohort of n-1 back today
       ROUND(100.0 * d.ret_d7 / NULLIF(c7.new_users, 0), 1) AS d7_pct,         -- pass ≥ 20
       d.new_users,
       ROUND(100.0 * d.cam / NULLIF(d.players, 0), 1)       AS camera_pct,
       d.fallback, d.low_impact, d.duel_open, d.accepts, d.duel_late
FROM daily_metrics d
LEFT JOIN daily_metrics c1 ON c1.n = d.n - 1
LEFT JOIN daily_metrics c7 ON c7.n = d.n - 7
ORDER BY d.n DESC
LIMIT 30;

-- 2) Week over week (organic growth)
SELECT (n - 1) / 7 + 1 AS week, MIN(date) AS from_date, SUM(players) AS plays, SUM(new_users) AS new_players,
       ROUND(1.0 * SUM(players) / COUNT(*), 0) AS avg_daily_players
FROM daily_metrics
GROUP BY week
ORDER BY week DESC
LIMIT 8;

-- 3) The 30-day verdict (pass: share ≥ 15 %, D7 ≥ 20 %, duel accept ≥ 25 %; kill: share < 8 % and D7 < 10 %)
WITH last AS (SELECT * FROM daily_metrics WHERE n > (SELECT MAX(n) FROM daily_metrics) - 30),
     d7 AS (SELECT SUM(d.ret_d7) AS back, SUM(c.new_users) AS cohort
            FROM last d JOIN daily_metrics c ON c.n = d.n - 7)
SELECT (SELECT COUNT(*) FROM last)                                                        AS days,
       (SELECT SUM(players) FROM last)                                                    AS plays,
       (SELECT ROUND(100.0 * SUM(sharers) / NULLIF(SUM(players), 0), 1) FROM last)        AS share_pct,
       (SELECT ROUND(100.0 * back / NULLIF(cohort, 0), 1) FROM d7)                        AS d7_pct,
       (SELECT ROUND(100.0 * SUM(accepts) / NULLIF(SUM(duel_open), 0), 1) FROM last)      AS duel_accept_pct,
       CASE
         WHEN (SELECT 100.0 * SUM(sharers) / NULLIF(SUM(players), 0) FROM last) >= 15
          AND (SELECT 100.0 * back / NULLIF(cohort, 0) FROM d7) >= 20
          AND (SELECT 100.0 * SUM(accepts) / NULLIF(SUM(duel_open), 0) FROM last) >= 25 THEN 'PASS'
         WHEN (SELECT 100.0 * SUM(sharers) / NULLIF(SUM(players), 0) FROM last) < 8
          AND COALESCE((SELECT 100.0 * back / NULLIF(cohort, 0) FROM d7), 0) < 10 THEN 'KILL'
         ELSE 'KEEP TESTING'
       END AS verdict;
