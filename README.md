# Repdle — the daily 60-second fitness challenge

**Wordle, but you move.** Every day there is one bodyweight challenge, the same for everyone on Earth (keyed by the UTC date). You get 60 seconds, and the phone or laptop camera counts the reps with on-device AI. Half reps don't count. After that you share a spoiler-free pace grid, duel a friend with a link, compete in leagues, and push your country up the board.

```
Repdle #142 · Squats 💪 47
🟩🟩🟩🟩🟨🟥 Top 18% 🌍 · #3 🇮🇳
🔥 5-day streak
Beat me → https://repdle.<you>.workers.dev/d/142-k3x9a2b7qz4m
```

- **Budget:** ₹0. It runs on one Cloudflare Worker with Static Assets and a D1 database, all on the free plan. There are no paid APIs and no app-store fees. It works in Android Chrome, iPhone Safari and desktop browsers.
- **Status:** MVP, **live at https://repdle.repdle.workers.dev** since 23 Oct 2026 (Repdle #1 = 23 Oct).
- **Background:** the product rationale is in `../reports/Global zero budget app idea.md`.

---

## Contents
1. [Run it locally](#1-run-it-locally)
2. [What's inside](#2-whats-inside)
3. [How the counting works](#3-how-the-counting-works)
4. [API](#4-api)
5. [Deploy for ₹0](#5-deploy-for-0-cloudflare-free-account)
6. [Free-tier limits and the 50K-players math](#6-free-tier-limits-and-the-50k-playersday-math)
7. [30-day metrics plan](#7-30-day-metrics-plan)
8. [Privacy policy](#8-privacy-policy)
9. [Safety, fair play, known limits](#9-safety-fair-play-known-limits)

---

## 1. Run it locally

You need Node 20+ (tested on 23.3) and, for the camera test, Google Chrome.

```bash
cd repdle
npm install
npm run setup          # copies MediaPipe into public/vendor, downloads the 5.8 MB pose model, creates .dev.vars
npm run db:local       # creates the local D1 tables
npm run dev            # http://localhost:8787  (site + API + D1, all local)
```

Open http://localhost:8787 in Chrome. `localhost` counts as a secure origin, so the camera works. To test from a phone on the same Wi-Fi, use `npx wrangler dev --ip 0.0.0.0` and open the page through an HTTPS tunnel (for example `cloudflared tunnel --url http://localhost:8787`, which is free). Phones only allow the camera on HTTPS.

**Sample data.** This adds about 6,000 fake players over 8 days, 18 countries, a demo league `REPD24`, and the daily metrics:

```bash
npm run seed                  # needs `npm run dev` running in another terminal
npm run metrics:local         # prints the 30-day metrics report
```

**Tests:**

```bash
npm test                      # 28 unit tests: rep counting (synthetic skeletons), grid, share text, percentile, ids
npm run test:api              # 15 API tests on a throw-away local Worker + D1 (port 8788) — your dev data is untouched
REPDLE_Y4M=/path/squats.y4m npm run test:e2e              # real Chrome, a video file as the webcam (needs npm run dev)
```

- `.dev.vars` (created by `npm run setup`) holds `DEV=1`. It lets tests fake the clock and the country, and enables `POST /api/dev/cron`. **Never** set `DEV` in production. `wrangler deploy` does not upload `.dev.vars`.
- The camera e2e test opens the app in headless Chrome with a `.y4m` clip of a person squatting as the fake camera. It accepts the safety sheet, waits for the pose model, lets the auto-countdown start, and runs the full 60 s. It then checks the result and share text, opens the duel link as a second player, plays in tap mode, and checks the duel verdict and the owner's view. Screenshots go to `test/e2e/shots/`.
- To make a fixture from any side-view squat clip: `ffmpeg -i clip.webm -vf "fps=25,format=yuv420p" -f yuv4mpegpipe squats.y4m`.
- Verified 22 Oct 2026: a CC BY-SA side-view clip from Wikimedia Commons (not included in the repo), on the CPU/WASM delegate at ~59 fps. The 60 s window contained 8 real squats; the app counted **8**, with 0 false counts, and each counted rep matched a real squat. `REPDLE_NO_RAF=1` runs the same test with `requestAnimationFrame` switched off (a window covered by another window).
- Verified 22 Oct 2026 with a **real MacBook webcam** (FaceTime HD, desktop Chrome, front view): the GPU delegate ran at ~60 fps for the whole minute and the app counted 24 squats with 0 partials, the same number the player counted. That test found three bugs, all fixed:
  - MediaPipe guesses knees and ankles that are *outside* the picture, which let the countdown start with only head to hips in frame. The "get in position" check now requires joints clearly inside the frame and says "Step back until your feet are in the picture 👣".
  - GPU warm-up frames looked like 1 fps and wrongly triggered the slow-device prompt. Low fps must now last 3 s.
  - macOS Chrome stops `requestAnimationFrame` for a covered window while the page still reports "visible", so the minute ran with 0 frames analysed. The pose loop now also runs on a timer.
- macOS note: the first camera use needs System Settings → Privacy & Security → Camera → your browser. A Chrome started by a script (Puppeteer) asks on behalf of the parent app, so start it with `open -a "Google Chrome" --args …` for webcam tests.

**Simulating the hourly cron locally:**

```bash
curl -X POST localhost:8787/api/dev/cron                       # dev-only shortcut (DEV=1)
curl "localhost:8787/__scheduled?cron=5+*+*+*+*"               # wrangler's own trigger (--test-scheduled)
```

**URL flags:**
- `?debug` logs session events to `window.__repdle`.
- `?cpu=1` forces the CPU (WASM) delegate instead of the GPU.
- `?nosw` skips the service worker.

---

## 2. What's inside

```
repdle/
├─ public/                    static site (served free by Workers Static Assets)
│  ├─ index.html, app.css, sw.js, manifest.webmanifest, _headers, config.js
│  ├─ challenges.json         365 days, generated (scripts/gen-challenges.mjs)
│  ├─ js/app.js               router + screens (home, result, duel, leagues, countries, about)
│  ├─ js/session.js           60-s camera session + tap-mode fallback
│  ├─ js/pose.js              MediaPipe Pose Landmarker (GPU → CPU fallback), camera, skeleton
│  ├─ js/reps.js              rep counting from joint angles (pure, unit-tested)
│  ├─ js/rules.js  grid.js  stats.js  day.js  id.js   shared with the Worker
│  ├─ vendor/mediapipe-1.1.0/ self-hosted MediaPipe bundle + WASM (npm run setup)
│  └─ models/pose_landmarker_lite.task                 (npm run setup)
├─ src/worker.js              API: scores, share, duels, leagues, stats
├─ src/stats.js               hourly histogram snapshots, daily metrics, monthly clean-up
├─ src/db.js                  monthly score tables
├─ migrations/0001_init.sql   D1 schema
├─ scripts/                   gen-challenges, vendor, seed, metrics.sql, make-images.py
├─ test/unit  test/api  test/e2e
└─ wrangler.jsonc
```

No framework and no build step: the browser loads ES modules directly, and the Worker imports the same `rules.js`, `grid.js`, `day.js` and `id.js`. That way the client and the server can never disagree on limits, day numbers or the pace grid.

**Daily challenge.**
- `challenges.json` has 365 entries (`{n, date, ex}`), and #1 is squats.
- Each 6-day block contains all six exercises once. The same exercise never runs two days in a row, and two floor exercises never run back to back.
- Every exercise has a standard variant and a low-impact one, ranked separately:

| Exercise | Low-impact |
|---|---|
| Squats | Chair squats |
| Push-ups | Knee push-ups |
| Jumping jacks | Step jacks |
| Lunges | Supported split squats |
| Plank | Knee plank |
| Wall sit | High wall sit |

- After day 365 the calendar wraps around. To make launch day #1, regenerate with `npm run gen:challenges -- --start 2026-11-01`.

**Screens:**
- **Home:** today's challenge, a standard/low-impact toggle, the privacy note, setup tips, and a countdown to the next challenge.
- **Session:** camera with the skeleton overlay, auto-start when your body is in frame, a 3/5-second countdown, and the 60-s timer. A depth meter shows how low to go, with live coaching such as "Go lower ⬇️". There are beeps, an optional voice and wake-lock. A skeleton-only view hides the camera picture (useful for faceless recording).
- **Result:** score, the 6-square pace grid, world percentile, country rank, streak, share/copy, duel comparison, country battle and league standings.
- **Duel `/d/<day>-<pid>`:** "Ravi did 47 squats, can you beat it?". Accept with the camera or tap mode, and see the result side by side. The owner sees who accepted. Old duels can be replayed (unranked).
- **Leagues `/leagues`, `/l/<CODE>`:** create (friends / office / college / gym / family) or join with a 6-letter code. Each league has a daily board and a weekly board (days played, daily wins), plus invite share and leave. Up to 5 leagues per player and 200 members per league.
- **Countries `/countries`:** the country board. A country is ranked once it has 3 or more players.
- **About `/about`:** how it works, safety, the privacy policy and fair play.
- **Tap mode:** used when there's no camera, the camera is blocked, the model fails, or the phone runs the AI under 6 fps. Tap once per rep; for holds, tap when you stop. It keeps your streak and duels but is **never ranked**.

---

## 3. How the counting works

- **Model:** MediaPipe Pose Landmarker (lite, float16) via `@mediapipe/tasks-vision` 1.1.0. It runs in `VIDEO` mode on a 640×480 stream with the GPU delegate, falling back to CPU/WASM.
- **Angles:** joint angles are computed in 3D from the *world* landmarks (metres), so they barely depend on camera angle. Orientation checks (is the body horizontal? upright?) use the 2D image landmarks.
- **Rep state machine:**
  - The metric is smoothed with an exponential filter (τ = 60 ms).
  - The counter is armed above `top`. An attempt starts below `start`. It must reach `bottom` *with good form*, and it counts when the metric comes back above `top`.
  - Coming back without reaching `bottom` is a **partial rep**: you get coaching, and it is never counted.
  - Two reps can't be closer than a per-exercise minimum gap (for example 500 ms for squats).

| Exercise | Metric | Top / start / bottom | Extra checks |
|---|---|---|---|
| Squats (chair) | knee angle | 155 / 140 / 100° (115°) | — |
| Push-ups (knee) | elbow angle | 150 / 135 / 100° | torso within 40° of horizontal (standing arm curls never count); shoulder–hip–ankle (knee) line ≥ 145° at the bottom |
| Jumping jacks (step) | arm raise (2D, front view) | arms ≤ 50° … ≥ 140° | feet apart ≥ 0.45 (0.35) × leg length while arms are up |
| Lunges (split squats) | mean of both knees | 155 / 140 / 115° (125°) | feet ≥ 0.5 × leg length apart (a squat in place doesn't count) |
| Plank (knee plank) | held seconds | — | body line ≥ 155° (150°) and within 35° of horizontal; coaching tells you whether to lift or lower the hips |
| Wall sit (high) | held seconds | knee 65–115° (100–150°) | torso upright, thighs within 35° (60°) of horizontal |

**Holds:**
- A second counts if at least 500 ms of it was held.
- Tracking drop-outs shorter than 600 ms are bridged, so the clock doesn't stop on a glitch.
- The score is a 60-char `0/1` string (one char per second), which the server re-checks.

**Pace grid:**
- One square per 10 s.
- For reps, the colour compares each segment to your own best 10 s: 🟩 ≥ 75 %, 🟨 ≥ 40 %, 🟥 below that or stopped.
- For holds, the colour depends on seconds held in the segment: 🟩 ≥ 9 s, 🟨 ≥ 5 s, 🟥 less.

The thresholds live in `public/js/reps.js`. The unit tests drive them with synthetic skeletons, and the result is pinned in those tests. The tests cover:
- full and half reps;
- a mix of both;
- noise and 8 fps;
- countdown reps;
- body out of frame;
- superhuman speed;
- sagging push-ups;
- arm curls;
- arms-only jacks;
- squatting on a lunge day;
- plank sag and pike;
- flicker;
- wall-sit depth.

---

## 4. API

All endpoints live under `/api/`. Only these requests invoke the Worker. Everything else is a free static asset.

| Method | Path | What it does | D1 rows written |
|---|---|---|---|
| `POST` | `/api/score` | Submits today's score (one per player per day). The body is `{uid, n, ex, v, mode, reps, times[] \| held, fps, nick, fd, leagues[], ref?, cc?}`. The response contains your stats snapshot (world and country histograms, the country board), your league boards, and the duel opponent. | 1 (+1 if the score came from a duel link) |
| `POST` | `/api/share` | Marks "this player tapped Share" for the day. | 1 |
| `GET` | `/api/stats/:n` | Full snapshot for a day (cached; see §6). | 0 |
| `GET` | `/api/duel/:n-:pid[?o=1]` | Duel score plus the top 20 who accepted. `o=1` counts a first open. | 1 if `o=1` |
| `POST` | `/api/duel/:id/accept` | Links today's score to a duel, or counts a late replay. | 1–2 |
| `POST` | `/api/league` | Creates a league and returns its code. | 2 |
| `POST` | `/api/league/:code/join` · `/leave` | Join or leave a league. | 1–2 |
| `GET` | `/api/league/:code` | League info, today's board and this week's board. | 0 |
| `GET` | `/api/health` | Day number and server time. | 0 |

**Plausibility checks on `/api/score`.** All of these must pass, or the server answers `422 implausible` / `409 wrong_day`:
- the day must be today in UTC (a session that started before midnight may submit until 00:15);
- the exercise must match the day's challenge;
- reps must not exceed the per-exercise maximum;
- every rep timestamp must fall within 0–60.5 s, and consecutive reps must be at least 0.9 × the minimum gap apart;
- the count must equal the timeline;
- the pace grid is **rebuilt on the server** from the timestamps, not trusted from the client;
- camera scores must report a pose loop of at least 4 fps.

One score per player per day is enforced by the primary key. A second submit returns the stored score.

**Anonymous identity.**
- The browser keeps a random secret `uid`.
- The server stores only `pid = base32(SHA-256("repdle|" + uid))[0..12]`.
- Duel links contain the `pid` only, so a duel link can't be used to submit scores as someone else.

---

## 5. Deploy for ₹0 (Cloudflare free account)

Deployed on 23 Oct 2026 with exactly these steps → https://repdle.repdle.workers.dev. To redeploy after changes, just run `npm run deploy`. For a fresh account:

1. **Create a free Cloudflare account** at https://dash.cloudflare.com/sign-up. The free plan is enough. You don't need a domain: the app gets `repdle.<your-subdomain>.workers.dev`.
2. **Log in from the terminal:**
   ```bash
   cd repdle
   npx wrangler login
   ```
3. **Create the database** and paste the printed `database_id` into `wrangler.jsonc` (replacing the zeros):
   ```bash
   npx wrangler d1 create repdle
   npx wrangler d1 migrations apply repdle --remote
   ```
4. **Set launch day as #1** (squats):
   ```bash
   npm run gen:challenges -- --start 2026-11-01
   ```
5. **Edit three placeholders:**
   - the `og:image` absolute URL in `public/index.html`, so WhatsApp and X previews show the image;
   - the contact email in the privacy section of `public/js/app.js` (search for "Contact");
   - optionally the `name` in `wrangler.jsonc`, which sets the subdomain.
6. **Deploy:**
   ```bash
   npm run deploy           # = wrangler deploy → https://repdle.<subdomain>.workers.dev
   ```
   The hourly cron (`5 * * * *`) is part of the deploy. Check it under Workers → repdle → Settings → Triggers.
7. **Smoke test on real phones:** play once on Android Chrome and once on iPhone Safari over the `https://…workers.dev` URL. Then run `npm run metrics` the next day.

**Option B — Cloudflare Pages for the static site.** This was the original plan in the report:
- Run `npx wrangler pages deploy public --project-name repdle` for the site (also free and unlimited) and deploy the Worker as above for the API.
- Set `window.REPDLE_API = 'https://repdle.<subdomain>.workers.dev'` in `public/config.js`.
- Set `"ALLOWED_ORIGINS": "https://repdle.pages.dev"` in `wrangler.jsonc`.
- Add the Worker origin to `connect-src` in `public/_headers`.
- The Worker must stay a Worker, because Pages Functions have no cron triggers.
- Option A (one Worker) is simpler: one deploy, one origin, no CORS.

**What costs money later (optional):**
- A custom domain costs about ₹800/yr. It also turns on the edge Cache API and free WAF rate-limiting rules.
- Workers Paid costs $5/month, once you outgrow the numbers below.

---

## 6. Free-tier limits and the 50K-players/day math

**Free plan limits.** These were checked on 22 Oct 2026 against Cloudflare's docs: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

| Resource | Free limit | Resets |
|---|---|---|
| Worker requests | 100,000 / day (then `/api/*` gets 429; the static site keeps working) | 00:00 UTC |
| Static asset requests | **free and unlimited** (HTML, JS, the 13 MB WASM, the 5.8 MB model) | — |
| Worker CPU | 10 ms per request and per cron run | — |
| Cron triggers | 5 per account (Repdle uses 1) | — |
| D1 rows read | 5,000,000 / day | 00:00 UTC |
| D1 rows written | 100,000 / day (inserts, updates, deletes; indexes add a row) | 00:00 UTC |
| D1 storage | 500 MB per database, 5 GB per account | — |
| Static assets | 20,000 files, 25 MiB per file | — |

**Measured cost per statement.** These numbers come from `meta.rows_read` / `meta.rows_written` in local workerd SQLite, the same engine as D1:

| Statement | Read | Written |
|---|---|---|
| Insert a score | 0 | **1** (WITHOUT ROWID table, PK = (day, pid), no extra index) |
| Insert a score from a duel link | 0 | 2 (+1 partial index entry) |
| Duplicate submit (`ON CONFLICT DO NOTHING`) | 0 | 0 |
| Share flag `UPDATE` | 1 | 1 |
| Counter upsert (duel open) | 0 | 1 |
| Hourly histogram `GROUP BY` | **2 per score row** | 0 |
| Duel accept list (forced partial index) | ≈ accepts | 0 |
| `DROP TABLE` of a month (502 rows in the test) | 15 | **0** |

**Assumptions for 50,000 players/day.** These are deliberately on the heavy side:
- 15 % share;
- every share link gets 2 first-opens by others (15,000 opens);
- 25 % of opens accept (3,750 duel scores);
- 10 % of players view a league page, 10 % view the country board, and 10 % check their own duel page;
- 1 % create or join a league;
- 2 % of submits are retried;
- 20 % of players are in about 1.5 leagues of ~25 members.

**Worker requests per day:**

| What | Requests |
|---|---|
| Score submits (1 per player; the response already carries percentile, country rank, country board, league boards and the duel opponent) | 50,000 |
| Retried submits | 1,000 |
| Share flags | 7,500 |
| Duel link opens | 15,000 |
| Owner duel checks | 5,000 |
| League pages | 5,000 |
| Country board | 5,000 |
| League create/join | 500 |
| Cron | 24 |
| **Total** | **≈ 89,000 → 89 % of 100,000** |

**D1 rows written per day:**

| What | Rows |
|---|---|
| Scores | 50,000 |
| Duel-ref index | 3,750 |
| Share flags | 7,500 |
| Duel-open counter | 15,000 |
| Late duel counter | ~1,000 |
| Leagues | ~1,000 |
| Snapshots + metrics | ~200 |
| **Total** | **≈ 78,500 → 79 % of 100,000** |

Old months are removed with `DROP TABLE` (0 rows written), not `DELETE`. A row-by-row delete would cost another 50,000 writes a day.

**D1 rows read per day:**

| What | Rows |
|---|---|
| League boards inside submits (~15 per submit on average) | ~765,000 |
| League pages (members × 9 primary-key lookups) | ~1,125,000 |
| Hourly snapshots (24 runs × ~25K rows on average × 2) | ~1,200,000 |
| Daily metrics (two nightly scans) | ~200,000 |
| Duels | ~45,000 |
| Shares | ~7,500 |
| **Total** | **≈ 3.35 M → 67 % of 5 M** |

**Storage.**
- A score row is ~60 bytes packed and ~85 bytes in a live B-tree (measured).
- The worker keeps the current and the previous month and drops older month tables on the 1st. The peak is about 62 days × 50,000 rows ≈ **185–265 MB of the 500 MB** database limit.
- Daily totals (`daily_metrics`) are kept forever at 1 row per day.

**CPU:**
- A submit does JSON parsing, one SHA-256 (native) and two or three D1 calls (I/O, not CPU). That is ~1–2 ms.
- The hourly snapshot aggregates in SQL, so the Worker only shapes about 2–5K grouped rows. That stays well under 10 ms at this size. At much larger scale, split the snapshot per variant or move to Workers Paid (30 s CPU).

**Edge caching, honestly:**
- On `*.workers.dev` the Cache API is a no-op. Snapshots are cached in each edge isolate's memory for 60 s and served with `Cache-Control: public, max-age=300`.
- With a custom domain, `GET /api/stats/:n` is also cached in Cloudflare's edge cache (`caches.default`) for 10 minutes. The code is already in place.

**When it outgrows the free plan:**
- **Requests run out first, at about 55–56K players/day** with the ratios above.
- Cheapest fixes, in order:
  - (a) Load the country board only from the data that came with the submit. This saves ~5K requests.
  - (b) Move duel-open counting into the duel GET's cache key and drop the counter. This saves ~15K writes.
  - (c) Workers Paid at $5/month: 10 M requests/month, 25 B reads and 50 M writes per month, 5 GB storage. That is good for roughly 1 M players/day.
- **If a limit is hit mid-day**, the static site and the camera keep working. The result shows locally with "offline — will sync". The app retries on next open, and the server accepts it until 00:15 UTC the next day.

---

## 7. 30-day metrics plan

**Goal:** decide in 30 days whether the "Wordle of fitness" format spreads. Every number is a **daily aggregate counter in D1**. There are no third-party analytics, no cookies, no per-person event logs and no IPs.

| Metric | Pass (30 days) | Definition | How it's measured |
|---|---|---|---|
| **Share rate** | **≥ 15 %** | players who tapped Share or Copy ÷ players that day | `POST /api/share` sets `sh = 1` on the player's score row for the day, once. `daily_metrics.sharers / players`. |
| **D7 retention** | **≥ 20 %** | new players on day C who played again on day C+7 ÷ new players on day C | Every score carries `fd`, the device's first play day from localStorage. The 00:05 cron stores `new_users` (`fd = n`) and `ret_d7` (`fd = n−7`). The report joins day n with day n−7. |
| **Duel accept rate** | **≥ 25 %** | duel scores ÷ first opens of duel links by someone else | The app calls `GET /api/duel/:id?o=1` only on a device's first visit to that link, and never for the owner. That increments `counters(day, 'duel_open')`. An accept is a score row with `ref` set, either by playing from the link or by linking an existing score the same day. Late replays are counted separately (`duel_late`) and kept out of the ratio. |
| Organic growth | up week on week | plays and new players per week | `daily_metrics` grouped by week |
| Health (not a gate) | — | camera worked %, tap fallbacks, low-impact share | `cam`, `fallback` (reason code `fb`), `low_impact` |

**Kill rule** (from the report): share rate < 8 % **and** D7 < 10 % → stop. The cost was ₹0, and the code can be reused for the India fitness-test pack (Vardi).

**How to read it.** The midnight cron writes `daily_metrics` for yesterday and rewrites the day before, so late shares are included.

```bash
npm run metrics          # production: last 30 days, week-over-week, and the PASS / KILL / KEEP TESTING verdict
npm run metrics:local    # same against local seed data
```

**Known measurement bias:**
- A player who clears browser data looks new again. This inflates `new_users` and slightly lowers D7. It's the price of having no accounts.
- Shares are counted when the share sheet completes or the text is copied, not when the post goes live.
- Opens are deduplicated per device, not per person.

**Suggested rhythm:**
- Day 1: soft launch with the YouTube video and friends.
- Days 3, 7, 14, 21, 30: run the report.
- If the share rate is under 8 % by day 7, test a different share text or grid first. That is the single biggest lever.

---

## 8. Privacy policy

*This is the same text the app shows under About → Privacy. Add a contact email before launch.*

**Short version.** Your camera video never leaves your device. We store an anonymous score, a nickname you choose, and your country code. There are no accounts, no cookies, no ads and no trackers.

**Camera.** The pose AI (Google MediaPipe, open source) runs inside your browser. Video frames are processed in memory and discarded. No image, video or body landmarks are uploaded or saved. The model and code are served from Repdle's own domain, so no third party is contacted while you play. (MediaPipe 1.x has a built-in usage-statistics logger to Google; Repdle switches it off, and the site's Content-Security-Policy blocks it as well.)

**What we store on our server (Cloudflare D1):**
- a random anonymous id (a one-way hash of a secret kept in your browser);
- the day and the exercise variant;
- your score and pace per 10 seconds;
- whether the score was camera- or tap-counted;
- your nickname and your country code;
- the first day you played;
- whether you tapped Share;
- which duel link, if any, your score answered.

For leagues we store the league code, your anonymous id and your nickname.

**Country.** It comes from Cloudflare's IP lookup when you submit. Repdle does not store your IP address. You can hide your country in Settings.

**Metrics.** We count totals per day (players, shares, duel opens, returning players) to know whether Repdle works. There is no per-person tracking and no third-party analytics.

**Retention.**
- Raw scores are deleted automatically after about two months: the current and previous month are kept.
- Daily totals are kept.
- Leagues stay until their members leave.

**On your device.** localStorage keeps your secret id, nickname, streak, recent results and leagues. "Reset my data on this device" in Settings deletes them. Because there are no accounts, we can't link server rows to you. If you want them deleted sooner, send us your duel link: it contains only your anonymous id.

**Children.** Repdle is not meant for anyone under 18.

**Hosting.** Cloudflare (Workers, D1) processes requests as our hosting provider. No other third party receives any data.

**Contact.** jitendra.saini1189@gmail.com

---

## 9. Safety, fair play, known limits

**Safety:**
- First-run gate: the player confirms they are 18+, that they will stop on pain, dizziness or chest discomfort, and that they have clear space.
- Every day has a low-impact option.
- The home screen shows a warm-up and stop-if-pain line.
- The About page has a full safety section, including "ask a doctor if pregnant, injured, or with a heart, lung or joint condition".
- Tapping **✕** during a session stops it; the attempt doesn't count and you can retry.

**Fair play:**
- Camera scores are rebuilt and range-checked on the server.
- Tap-mode scores are never ranked.
- A determined cheater can still forge a request, because everything runs on the client. Add Cloudflare Turnstile (free) before a big push, and consider "camera-verified only" leaderboards for prizes. Country and world ranks are for fun.
- There is a best-effort per-IP limiter in the Worker. Real rate limiting (free WAF rule) needs a custom domain.

**Known limits / next steps:**
- **Real-phone testing is still to do.**
  - Verified so far: desktop Chrome with a real webcam (GPU, ~60 fps), headless Chrome with a recorded human video (CPU/WASM), and synthetic skeletons.
  - Before launch, check Android Chrome (GPU delegate), iPhone Safari (the GPU delegate may fall back to CPU) and a cheap Android phone. The < 6 fps prompt offers tap mode.
- **Laptops:** a webcam on a desk usually shows only head to hips. Players must put the laptop low (a chair or the floor) or step back about 2.5–3 m; the position screen says so.
- Counting is tuned for one person in frame. Side view is best for squats, push-ups, lunges, plank and wall sit; front view for jumping jacks. Baggy clothes or a dark room lower accuracy.
- The UI is English only. Add Hindi, Portuguese, Spanish and Indonesian next; the country board will show where players come from.
- Post-validation roadmap (from the report): Android app (Flutter + ML Kit, ₹2,100 Play fee), Pro ($2.99/month: streak protect, history, programs, Fitness Test Packs such as India Police/Agniveer), and sponsored days.

**Licenses:**
- MediaPipe (`@mediapipe/tasks-vision`, pose model): Apache 2.0, © Google.
- The e2e test clips came from Wikimedia Commons (CC BY / CC BY-SA). They are not included; bring your own.
