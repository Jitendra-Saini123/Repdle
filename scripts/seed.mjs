// Fills the LOCAL database with realistic sample players for the last 8 days so
// the result screen, country board, leagues and the metrics report have data.
//   npm run dev        (in another terminal)
//   npm run seed       (add --today 2000 to change today's player count)
// Never touches the remote database.
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dayNumber, challengeFor, monthKey, DAY_MS } from '../public/js/day.js';
import { EXERCISES } from '../public/js/rules.js';
import { encodeSeg } from '../public/js/grid.js';

const BASE = process.env.REPDLE_URL || 'http://127.0.0.1:8787';
const data = JSON.parse(readFileSync(new URL('../public/challenges.json', import.meta.url)));
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const TODAY_PLAYERS = arg('today', 1500);
const DAYS = 8;

let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const pick = (weights) => {
  let x = rnd() * weights.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of weights) if ((x -= w) <= 0) return k;
  return weights[0][0];
};
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';
const pid = () => Array.from({ length: 12 }, () => B32[Math.floor(rnd() * 32)]).join('');
const NAMES = ['Aarav', 'Priya', 'Lucas', 'Sofia', 'Kenji', 'Amara', 'Diego', 'Fatima', 'Noah', 'Ananya', 'Chen', 'Zara', 'Mateo', 'Ishaan', 'Olu', 'Mia', 'Ravi', 'Lena', 'Yusuf', 'Ines'];
const COUNTRIES = [['IN', 30], ['US', 12], ['BR', 8], ['ID', 6], ['PH', 5], ['NG', 5], ['GB', 4], ['DE', 4], ['MX', 4], ['PK', 4], ['BD', 3], ['EG', 3], ['FR', 2], ['CA', 2], ['AU', 2], ['KE', 2], ['VN', 2], ['TR', 2]];
const MEAN = { squat: [34, 30], pushup: [24, 30], jack: [52, 40], lunge: [30, 26], plank: [42, 48], wallsit: [38, 46] };

// The 8 simulated days end today — or on day 8 if Repdle is younger than that
// (then the extra days are "in the future" and only feed the metrics report).
const today = dayNumber(Date.now(), data.start);
const last = Math.max(today, DAYS);
const first = last - DAYS + 1;
const users = []; // { pid, fd, nick, cc }
const rows = [];
const counters = [];
const tables = new Set();

for (let n = first; n <= last; n++) {
  const ch = challengeFor(data, n);
  const ex = EXERCISES[ch.ex];
  const target = n === today ? TODAY_PLAYERS : Math.round(TODAY_PLAYERS * (0.25 + (0.75 * (n - first)) / (DAYS - 1)));
  const players = users.filter((u) => rnd() < 0.36 * 0.9 ** Math.max(0, n - u.fd - 1));
  while (players.length < target) {
    const u = { pid: pid(), fd: n, nick: `${NAMES[Math.floor(rnd() * NAMES.length)]}${Math.floor(rnd() * 90 + 10)}`, cc: pick(COUNTRIES) };
    users.push(u);
    players.push(u);
  }
  const today_ = [];
  let opens = 0;
  for (const u of players) {
    const v = rnd() < 0.18 ? 1 : 0;
    const cam = rnd() < 0.94 ? 1 : 0;
    const [m] = [MEAN[ch.ex][v]];
    let score = Math.round(m + gauss() * m * 0.3);
    score = Math.max(0, Math.min(ex.kind === 'hold' ? 60 : ex.max[v] - 5, score));
    // pace: start fast, fade
    const w = [1.2, 1.1, 1.0, 0.95, 0.85, 0.75].map((x) => x * (0.9 + rnd() * 0.2));
    const sw = w.reduce((s, x) => s + x, 0);
    let seg = w.map((x) => Math.floor((score * x) / sw));
    if (ex.kind === 'hold') {
      seg = [0, 0, 0, 0, 0, 0];
      for (let s = 0; s < score; s++) seg[Math.floor(s / 10)]++;
    }
    seg[0] += score - seg.reduce((s, x) => s + x, 0);
    const ref = today_.length && rnd() < 0.07 ? today_[Math.floor(rnd() * today_.length)].pid : null;
    if (ref) opens += 3 + Math.floor(rnd() * 2);
    const row = { n, pid: u.pid, v, cam, reps: score, seg: encodeSeg(seg), cc: u.cc, nick: u.nick, fd: u.fd, ref, sh: rnd() < 0.17 ? 1 : 0, fb: cam ? 0 : 1 + Math.floor(rnd() * 3), ts: Math.floor(rnd() * 86000) };
    rows.push(row);
    today_.push(row);
  }
  counters.push([n, 'duel_open', opens]);
  tables.add(`s_${monthKey(n, data.start)}`);
}

const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? v : `'${String(v).replace(/'/g, "''")}'`);
let sql = '';
for (const t of tables) {
  sql += `CREATE TABLE IF NOT EXISTS ${t} (n INTEGER NOT NULL, pid TEXT NOT NULL, v INTEGER NOT NULL, cam INTEGER NOT NULL, reps INTEGER NOT NULL, seg TEXT NOT NULL, cc TEXT NOT NULL, nick TEXT NOT NULL, fd INTEGER NOT NULL, ref TEXT, sh INTEGER NOT NULL DEFAULT 0, fb INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL, PRIMARY KEY (n, pid)) WITHOUT ROWID;\n`;
  sql += `CREATE INDEX IF NOT EXISTS ${t}_ref ON ${t} (n, ref) WHERE ref IS NOT NULL;\n`;
}
const cols = ['n', 'pid', 'v', 'cam', 'reps', 'seg', 'cc', 'nick', 'fd', 'ref', 'sh', 'fb', 'ts'];
for (let i = 0; i < rows.length; i += 200) {
  const chunk = rows.slice(i, i + 200);
  const t = `s_${monthKey(chunk[0].n, data.start)}`;
  const same = chunk.filter((r) => `s_${monthKey(r.n, data.start)}` === t);
  const other = chunk.filter((r) => `s_${monthKey(r.n, data.start)}` !== t);
  for (const [tt, list] of [[t, same], [other[0] && `s_${monthKey(other[0].n, data.start)}`, other]]) {
    if (!list.length) continue;
    sql += `INSERT OR IGNORE INTO ${tt} (${cols.join(',')}) VALUES ${list.map((r) => `(${cols.map((c) => q(r[c])).join(',')})`).join(',')};\n`;
  }
}
for (const [day, k, n] of counters) sql += `INSERT INTO counters (day, k, n) VALUES (${day}, '${k}', ${n}) ON CONFLICT (day, k) DO UPDATE SET n = n + ${n};\n`;

// A demo league with some of today's players
const code = 'REPD24'; // league codes never use 0, O, 1 or I
const members = rows.filter((r) => r.n === today).slice(0, 9);
sql += `INSERT OR IGNORE INTO leagues (code, name, kind, owner, created, members) VALUES ('${code}', 'Demo Office League', 'office', '${members[0]?.pid}', ${Date.now()}, ${members.length});\n`;
for (const m of members) sql += `INSERT OR IGNORE INTO members (code, pid, nick, joined) VALUES ('${code}', '${m.pid}', ${q(m.nick)}, ${Date.now()});\n`;

await mkdir(new URL('../.wrangler/', import.meta.url), { recursive: true });
const file = fileURLToPath(new URL('../.wrangler/seed.sql', import.meta.url));
await writeFile(file, sql);
console.log(`seeding ${rows.length} scores over days ${first}–${last} (${users.length} players, today = #${today}) + league ${code}`);
execFileSync('npx', ['wrangler', 'd1', 'execute', 'repdle', '--local', '--file', file], { stdio: ['ignore', 'ignore', 'inherit'], cwd: fileURLToPath(new URL('..', import.meta.url)) });

// Snapshot + daily metrics through the dev-only cron endpoint (needs `npm run dev`).
const cron = (ms) => fetch(`${BASE}/api/dev/cron`, { method: 'POST', headers: { 'x-repdle-now': String(ms) } }).then((r) => r.json());
const startMs = Date.parse(`${data.start}T00:00:00Z`);
try {
  for (let n = first + 1; n <= last + 1; n++) await cron(startMs + (n - 1) * DAY_MS + 5 * 60e3); // 00:05 of each day → metrics of the day before
  const r = await cron(Date.now());
  console.log(`snapshot for today: ${r.snapshot} ranked scores · open ${BASE}/countries or ${BASE}/l/${code}`);
} catch {
  console.log(`(start \`npm run dev\` and rerun to build the snapshot + metrics)`);
}
