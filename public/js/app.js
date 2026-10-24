// Repdle app shell: router + screens. Vanilla JS, no build step.
import { EXERCISES, exerciseName, cleanNick } from './rules.js';
import { dayNumber, challengeFor, msUntilNextDay } from './day.js';
import { gridColors, shareText, flagEmoji, decodeSeg } from './grid.js';
import { placeIn } from './stats.js';
import { DUEL_RE, LEAGUE_RE } from './id.js';
import { store } from './store.js';
import { api, isRetryable } from './api.js';
import { esc, $, $$, toast, sheet, confirmSheet, shareOrCopy, copyText, fmtClock, countryName } from './ui.js';
import { runSession } from './session.js';

const app = $('#app');
const S = { data: null, offset: 0, today: 0, ch: null, timers: [] };
const now = () => Date.now() + S.offset;
const fmtInt = (x) => Number(x || 0).toLocaleString('en');

// ---------------- boot ----------------
async function boot() {
  try {
    const res = await fetch('/challenges.json', { cache: 'no-cache' });
    S.data = await res.json();
    // Clock check: the server's Date header fixes phones with a wrong clock.
    const server = Date.parse(res.headers.get('date') || '');
    if (server && Math.abs(server - Date.now()) > 120000) S.offset = server - Date.now();
  } catch (e) {
    app.innerHTML = `<div class="page"><p class="err">Couldn’t load today’s challenge. Check your connection and reload.</p></div>`;
    return;
  }
  refreshDay();
  await store.pid(); // public id for duel links (hash of the secret uid)
  if ('serviceWorker' in navigator && !/[?&]nosw/.test(location.search)) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('popstate', render);
  window.addEventListener('online', flushPending);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    go(a.getAttribute('href'));
  });
  render();
  flushPending();
}

function refreshDay() {
  S.today = dayNumber(now(), S.data.start);
  S.ch = challengeFor(S.data, S.today);
}

function go(path) {
  history.pushState(null, '', path);
  render();
  window.scrollTo(0, 0);
}

function clearTimers() {
  S.timers.forEach(clearInterval);
  S.timers = [];
}

function render() {
  clearTimers();
  refreshDay();
  const p = location.pathname.replace(/\/+$/, '') || '/';
  let m;
  if (p === '/') return home();
  if ((m = /^\/d\/([^/]+)$/.exec(p))) return duelPage(decodeURIComponent(m[1]));
  if ((m = /^\/l\/([^/]+)$/.exec(p))) return leaguePage(decodeURIComponent(m[1]).toUpperCase());
  if (p === '/leagues') return leaguesPage();
  if (p === '/countries') return countriesPage();
  if (p === '/about' || p === '/privacy') return aboutPage();
  return home();
}

// ---------------- shared pieces ----------------
function header() {
  const st = store.streak(S.today);
  return `<header class="top">
    <a href="/" data-link class="logo" aria-label="Repdle home">${'REPDLE'.split('').map((c, i) => `<span class="t ${'ggggyr'[i]}">${c}</span>`).join('')}</a>
    <div class="top-right">
      <span class="streak-chip" title="Day streak">🔥 ${st.cur}</span>
      <button class="icon-btn" data-menu aria-label="Menu">☰</button>
    </div>
  </header>`;
}

function page(html) {
  app.innerHTML = `${header()}<main class="page">${html}</main>${footer()}`;
  $('[data-menu]', app)?.addEventListener('click', openMenu);
}

function footer() {
  return `<footer class="foot">
    <p>🔞 18+ · Stop if anything hurts · Not medical advice</p>
    <p><a href="/about" data-link>How it works · Safety · Privacy</a></p>
  </footer>`;
}

const gridHtml = (kind, seg, big = false) =>
  `<div class="grid6 ${big ? 'big' : ''}" aria-label="Pace grid">${gridColors(kind, seg).map((c) => `<span class="sq ${c}" title="${{ g: 'kept pace', y: 'slowed', r: 'stopped' }[c]}"></span>`).join('')}</div>`;

function nextIn() {
  return `<span data-next>${fmtClock(msUntilNextDay(now()))}</span>`;
}
function startNextTimer() {
  S.timers.push(
    setInterval(() => {
      const left = msUntilNextDay(now());
      $$('[data-next]').forEach((el) => (el.textContent = fmtClock(left)));
      if (left < 1000) setTimeout(render, 1500);
    }, 1000),
  );
}

// ---------------- home ----------------
function home() {
  const ch = S.ch;
  const ex = EXERCISES[ch.ex];
  const done = store.result(S.today);
  if (done) return homeDone(done);
  const v = store.get(`v.${ch.ex}`, 0);
  const tip = ex.tips[S.today % ex.tips.length];
  const unit = ex.kind === 'hold' ? 'hold as long as you can (max 60 s)' : 'as many full reps as you can';
  page(`
    <section class="card hero">
      <div class="kicker">Repdle #${S.today} · ${esc(dateLabel(ch.date))} <span class="muted">(UTC)</span></div>
      <div class="hero-row">
        <div class="ex-emoji" aria-hidden="true">${ex.emoji}</div>
        <div>
          <h1>${esc(exerciseName(ch.ex, v))}</h1>
          <p class="sub">60 seconds · ${esc(unit)}</p>
        </div>
      </div>
      <div class="seg-toggle" role="radiogroup" aria-label="Difficulty">
        ${[0, 1].map((i) => `<button role="radio" aria-checked="${v === i}" data-v="${i}">${i ? '🌱 Low-impact' : '💪 Standard'}<small>${esc(ex.variants[i])}</small></button>`).join('')}
      </div>
      <p class="note">${esc(ex.variantNotes[v])} ${v ? '<span class="tag">ranked separately</span>' : ''}</p>
    </section>
    <button class="btn primary xl" data-play="cam">▶ Start — camera counts my reps</button>
    <button class="btn ghost" data-play="tap">✋ No camera? Tap mode <span class="tag">unranked</span></button>
    <div class="privacy-card">
      <b>🔒 Your video never leaves your device.</b>
      The pose AI (Google MediaPipe) runs inside this browser tab. No video or photo is uploaded or saved — only your score.
    </div>
    <section class="card soft">
      <p>📷 <b>Setup:</b> ${esc(ex.setup)}</p>
      <p>💡 <b>Tip:</b> ${esc(tip)}</p>
      <p>⚠️ Warm up for a minute first. Stop if you feel pain, dizziness or chest discomfort.</p>
    </section>
    <p class="center muted">🌍 One challenge, the same for everyone on Earth today.<br>Next Repdle in ${nextIn()}</p>
    ${quickNav()}`);
  $$('.seg-toggle button', app).forEach((b) => (b.onclick = () => { store.set(`v.${ch.ex}`, Number(b.dataset.v)); home(); }));
  $$('[data-play]', app).forEach((b) => (b.onclick = () => playDaily({ mode: b.dataset.play })));
  startNextTimer();
}

const quickNav = () => `<nav class="quick">
  <a href="/leagues" data-link>🏆 Leagues</a>
  <a href="/countries" data-link>🌍 Countries</a>
  <a href="/about" data-link>❓ How it works</a>
</nav>`;

function dateLabel(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// ---------------- safety gate ----------------
function safetyGate() {
  if (store.get('safe')) return Promise.resolve(true);
  return new Promise((resolve) => {
    let ok = false;
    const sh = sheet(`
      <h2>Before your first Repdle</h2>
      <label class="tick"><input type="checkbox" data-c> I am <b>18 or older</b>.</label>
      <label class="tick"><input type="checkbox" data-c> I’ll <b>stop if I feel pain</b>, dizziness, shortness of breath or chest discomfort. Repdle is a game, not medical advice — if you have a health condition, ask a doctor first.</label>
      <label class="tick"><input type="checkbox" data-c> I have <b>clear space</b> and a non-slip floor.</label>
      <p class="privacy-mini">🔒 The camera picture is processed on this device and never uploaded.</p>
      <button class="btn primary" data-ok disabled>Let’s go</button>`, { onClose: () => resolve(ok) });
    const boxes = $$('[data-c]', sh.el);
    const btn = $('[data-ok]', sh.el);
    boxes.forEach((b) => (b.onchange = () => (btn.disabled = !boxes.every((x) => x.checked))));
    btn.onclick = () => {
      ok = true;
      store.set('safe', 1);
      sh.close();
    };
  });
}

// ---------------- play ----------------
async function playDaily({ mode, ref = null, duel = null }) {
  if (store.result(S.today)) return home();
  if (!(await safetyGate())) return;
  const ch = S.ch;
  const v = store.get(`v.${ch.ex}`, 0);
  const r = await runSession({ n: S.today, ex: ch.ex, v, mode, label: `Repdle #${S.today}` });
  if (!r) return render();
  refreshDay();
  const entry = { ...r, ref, duelOpp: duel, at: Date.now(), synced: false };
  // Session crossed midnight UTC? It still belongs to the day it started on.
  store.saveResult(entry);
  store.addPlayDay(entry.n);
  trimOldStats(entry.n);
  if (location.pathname !== '/') history.replaceState(null, '', '/');
  homeDone(entry);
  await syncEntry(entry);
}

function trimOldStats(keepN) {
  for (let n = keepN - 1; n > keepN - 60; n--) {
    const e = store.result(n);
    if (e?.stats) {
      delete e.stats;
      store.saveResult(e);
    }
  }
}

async function syncEntry(entry) {
  const body = {
    uid: store.uid(),
    n: entry.n,
    ex: entry.ex,
    v: entry.v,
    mode: entry.mode,
    reps: entry.score,
    times: entry.times,
    held: entry.held,
    fps: entry.fps,
    fb: entry.fb,
    nick: store.nick(),
    fd: store.firstDay(entry.n),
    streak: store.streak(entry.n).cur,
    leagues: store.leagues().map((l) => l.code),
    ref: entry.ref || undefined,
    cc: store.get('hideCountry') ? 'hide' : undefined,
  };
  try {
    const res = await api.submit(body);
    applySync(entry, res);
    store.setPending(store.pending().filter((n) => n !== entry.n));
    if (entry.sharePending) markShared(entry);
  } catch (e) {
    entry.syncError = isRetryable(e) ? 'offline' : e.body?.error || 'rejected';
    if (e.body?.error === 'implausible') entry.syncError = `not accepted (${e.body.reason})`;
    if (isRetryable(e)) store.setPending([...new Set([...store.pending(), entry.n])]);
    store.saveResult(entry);
  }
  if (location.pathname === '/' && entry.n === S.today) homeDone(store.result(entry.n));
}

function applySync(entry, res) {
  const st = res.stats;
  entry.synced = true;
  entry.syncError = null;
  entry.pid = res.pid;
  entry.cc = res.score.cc;
  store.set('cc', res.score.cc);
  store.set('pid', res.pid);
  if (res.dup) {
    // Already played today on this device/profile: the stored score wins.
    Object.assign(entry, { score: res.score.reps, seg: decodeSeg(res.score.seg), v: res.score.v, mode: res.score.cam ? 'cam' : 'tap' });
  }
  if (res.score.cam && st) {
    const w = placeIn(st.world, res.score.reps, st.included);
    const c = placeIn(st.country.hist, res.score.reps, st.included);
    Object.assign(entry, { topPct: w.topPct, rank: w.rank, total: w.total, crank: c.rank, ctotal: c.total });
  }
  entry.stats = st ? { board: st.board, boardMin: st.boardMin, at: st.at } : null;
  entry.leagues = res.leagues || [];
  for (const l of entry.leagues) if (l.gone) store.removeLeague(l.code);
  if (res.duel) entry.duelOpp = res.duel;
  store.saveResult(entry);
}

async function flushPending() {
  if (!S.data) return;
  for (const n of store.pending()) {
    const e = store.result(n);
    if (!e || e.synced || n < S.today - 1) {
      store.setPending(store.pending().filter((x) => x !== n));
      continue;
    }
    await syncEntry(e);
  }
}

// ---------------- result (today, done) ----------------
function shareFor(entry) {
  const st = store.streak(S.today);
  const origin = location.origin;
  return shareText({
    n: entry.n,
    ex: entry.ex,
    v: entry.v,
    score: entry.score,
    seg: entry.seg,
    mode: entry.mode,
    // Brag-worthy only: world % and country rank go into the share text when in the top half.
    topPct: entry.mode === 'cam' && entry.total > 1 && entry.topPct <= 50 ? entry.topPct : null,
    countryRank: entry.ctotal > 1 && entry.crank <= Math.ceil(entry.ctotal / 2) ? entry.crank : null,
    cc: entry.cc,
    streak: st.cur,
    duelUrl: store.get('pid') ? `${origin}/d/${entry.n}-${store.get('pid')}` : origin,
  });
}

function resultCard(entry) {
  const ex = EXERCISES[entry.ex];
  const unit = ex.kind === 'hold' ? 'seconds held' : 'reps';
  const st = store.streak(S.today);
  let place = '';
  if (entry.mode === 'tap') {
    place = `<div class="chip"><b>✋ Tap</b><span>unranked today</span></div>`;
  } else if (entry.synced && entry.total) {
    place = entry.total === 1
      ? `<div class="chip hl"><b>🥇 First!</b><span>first ranked player today</span></div>`
      : entry.topPct <= 50
        ? `<div class="chip hl"><b>Top ${entry.topPct}%</b><span>🌍 of ${fmtInt(entry.total)} today</span></div>`
        : `<div class="chip"><b>#${fmtInt(entry.rank)}</b><span>🌍 of ${fmtInt(entry.total)} today — beat it tomorrow!</span></div>`;
    if (entry.cc && entry.cc !== 'XX') place += `<div class="chip"><b>#${entry.crank}</b><span>${flagEmoji(entry.cc)} ${esc(countryName(entry.cc))} of ${fmtInt(entry.ctotal)}</span></div>`;
  } else if (!entry.synced) {
    place = `<div class="chip"><b>…</b><span>${entry.syncError ? esc(entry.syncError === 'offline' ? 'offline — will sync' : entry.syncError) : 'ranking you…'}</span></div>`;
  }
  return `<section class="card result">
    <div class="kicker">Repdle #${entry.n} · ${esc(exerciseName(entry.ex, entry.v))}${entry.v ? ' <span class="tag">low-impact</span>' : ''}</div>
    <div class="score"><b>${entry.score}</b><small>${unit}</small></div>
    ${gridHtml(ex.kind, entry.seg, true)}
    <div class="legend">🟩 kept pace · 🟨 slowed · 🟥 stopped <span class="muted">(each square = 10 s)</span></div>
    <div class="chips">${place}<div class="chip"><b>🔥 ${st.cur}</b><span>day streak · best ${st.best}</span></div></div>
    ${entry.partial ? `<p class="muted small">${entry.partial} half rep${entry.partial > 1 ? 's' : ''} not counted — full range only.</p>` : ''}
  </section>`;
}

function duelCompare(entry) {
  const opp = entry.duelOpp;
  if (!opp) return '';
  const me = entry.score;
  const verdict = me > opp.reps ? `You beat ${esc(opp.nick)}! 🏆` : me === opp.reps ? `Dead heat with ${esc(opp.nick)} 🤝` : `${esc(opp.nick)} wins this one. Rematch tomorrow? 😤`;
  return `<section class="card vs">
    <div class="vs-row">
      <div class="${me >= opp.reps ? 'win' : ''}"><b>${me}</b><span>You</span></div>
      <div class="vs-mid">VS</div>
      <div class="${opp.reps >= me ? 'win' : ''}"><b>${opp.reps}</b><span>${esc(opp.nick)}</span></div>
    </div>
    <p class="verdict">${verdict}</p>
    ${entry.mode === 'tap' ? '<p class="muted small center">✋ Your score was tap-counted (unranked); camera scores are verified by the AI.</p>' : ''}
  </section>`;
}

function countryBattle(entry) {
  const board = entry.stats?.board || [];
  const min = entry.stats?.boardMin || 3;
  const ranked = board.filter((b) => b.n >= min);
  if (ranked.length < 2) return '';
  const i = ranked.findIndex((b) => b.cc === entry.cc);
  const pair = i < 0 ? ranked.slice(0, 2) : i === 0 ? [ranked[0], ranked[1]] : [ranked[i], ranked[i - 1]];
  const max = Math.max(...pair.map((b) => b.avg)) || 1;
  return `<section class="card">
    <h3>⚔️ Country battle</h3>
    ${pair.map((b) => `<div class="bar-row ${b.cc === entry.cc ? 'me' : ''}"><span>${flagEmoji(b.cc)} ${esc(countryName(b.cc))}</span><div class="bar"><i style="transform:scaleX(${b.avg / max})"></i></div><b>${b.avg}</b></div>`).join('')}
    <p class="muted small">Average score today (${fmtInt(pair[0].n + pair[1].n)} players). <a href="/countries" data-link>All countries →</a></p>
  </section>`;
}

function leagueMini(entry) {
  if (!entry.leagues?.length) {
    return `<section class="card soft"><h3>🏆 Leagues</h3><p>Make a league for your office, college or friends — everyone sees one board every day.</p><a class="btn ghost small" href="/leagues" data-link>Create or join a league</a></section>`;
  }
  const me = store.get('pid');
  return entry.leagues
    .filter((l) => !l.gone)
    .map((l) => {
      const rows = l.today.filter((m) => m.reps != null);
      const pos = rows.findIndex((m) => m.pid === me) + 1;
      return `<section class="card"><h3>🏆 ${esc(l.name)}</h3>
        <ol class="board">${rows.slice(0, 3).map((m) => `<li class="${m.pid === me ? 'me' : ''}"><span>${esc(m.nick)}</span><b>${m.reps}${m.v ? ' 🌱' : ''}${m.cam ? '' : ' ✋'}</b></li>`).join('')}</ol>
        <p class="muted small">${pos ? `You’re #${pos} of ${rows.length} who played` : ''} · <a href="/l/${esc(l.code)}" data-link>Full board →</a></p></section>`;
    })
    .join('');
}

function homeDone(entry) {
  const text = shareFor(entry);
  page(`
    ${resultCard(entry)}
    ${duelCompare(entry)}
    <div class="row2">
      <button class="btn primary" data-share>📤 Share result</button>
      <button class="btn ghost" data-copy>Copy</button>
    </div>
    <pre class="share-preview" aria-label="Share text">${esc(text)}</pre>
    <p class="muted small center">Playing as <b>${esc(store.nick())}</b> · <button class="link" data-rename>change name</button></p>
    ${countryBattle(entry)}
    ${leagueMini(entry)}
    <section class="card soft center">
      <p>Next Repdle in <b>${nextIn()}</b></p>
      <button class="btn ghost small" data-practice>🔁 Practice (doesn’t count)</button>
    </section>
    ${quickNav()}`);
  $('[data-share]', app).onclick = () => doShare(entry, false);
  $('[data-copy]', app).onclick = () => doShare(entry, true);
  $('[data-rename]', app).onclick = openMenu;
  $('[data-practice]', app).onclick = practice;
  startNextTimer();
}

async function doShare(entry, copyOnly) {
  const text = shareFor(entry);
  const how = copyOnly ? ((await copyText(text)) ? 'copied' : 'failed') : await shareOrCopy(text);
  if (how === 'copied') toast('Copied! Paste it in WhatsApp, Instagram or X 🚀');
  if (how === 'failed') toast('Couldn’t copy — select the text below');
  if (how === 'shared' || how === 'copied') markShared(entry);
}

async function markShared(entry) {
  if (entry.shared) return;
  if (!entry.synced) {
    entry.sharePending = true;
    store.saveResult(entry);
    return;
  }
  try {
    await api.share(store.uid(), entry.n);
    entry.shared = true;
    entry.sharePending = false;
    store.saveResult(entry);
  } catch {}
}

async function practice() {
  if (!(await safetyGate())) return;
  const ch = S.ch;
  const v = store.get(`v.${ch.ex}`, 0);
  const r = await runSession({ n: S.today, ex: ch.ex, v, mode: 'cam', label: 'Practice' });
  render();
  if (r) sheet(`<h2>Practice: ${r.score}${r.kind === 'hold' ? 's' : ''}</h2>${gridHtml(r.kind, r.seg, true)}<p class="muted">Practice runs are never sent or ranked. Your official score today stays ${store.result(S.today)?.score ?? '—'}.</p>`);
}

// ---------------- duel ----------------
async function duelPage(id) {
  const m = DUEL_RE.exec(id);
  if (!m) return notFound('That duel link looks broken.');
  const n = Number(m[1]);
  const mine = store.get('pid') === m[2];
  page(`<div class="card center"><p>Loading the challenge…</p></div>`);
  let d;
  try {
    d = await api.duel(id, !mine && !store.seen(`duel:${id}`));
  } catch (e) {
    if (e.status === 404) return notFound(n < S.today - 30 ? 'This duel has expired (duels last about a month).' : 'Duel not found — the score may not be synced yet. Try again in a minute.', true);
    return notFound('Couldn’t load the duel. Check your connection.', true);
  }
  const ex = EXERCISES[d.ex];
  const label = exerciseName(d.ex, d.v);
  const unit = ex.kind === 'hold' ? 's' : '';
  const accepts = d.accepts?.length
    ? `<section class="card"><h3>Who took it on</h3><ol class="board">${d.accepts.map((a) => `<li><span>${esc(a.nick)}</span><b>${a.reps}${unit} ${a.reps > d.reps ? '🏆' : ''}${a.cam ? '' : ' ✋'}</b></li>`).join('')}</ol></section>`
    : '';
  const head = `<section class="card hero duel">
    <div class="kicker">🥊 Duel · Repdle #${d.n}</div>
    <h1>${mine ? 'Your challenge' : `${esc(d.nick)} challenges you`}</h1>
    <p class="sub">${mine ? 'You' : esc(d.nick)} did <b>${d.reps}${unit} ${esc(label)}</b> ${d.cam ? '<span class="tag ok">camera-verified ✓</span>' : '<span class="tag">tap-counted</span>'} ${d.cc && d.cc !== 'XX' ? flagEmoji(d.cc) : ''}</p>
    ${gridHtml(ex.kind, decodeSeg(d.seg), true)}
  </section>`;

  if (mine) {
    const link = `${location.origin}/d/${id}`;
    page(`${head}${accepts || '<p class="center muted">Nobody has taken your duel yet. Send it to more friends!</p>'}
      <button class="btn primary" data-sharelink>📤 Send this duel</button>${quickNav()}`);
    $('[data-sharelink]', app).onclick = async () => {
      const how = await shareOrCopy(`Can you beat my ${d.reps}${unit} ${label} on Repdle #${d.n}? 💪\n${link}`);
      if (how === 'copied') toast('Link copied!');
    };
    return;
  }

  const myToday = store.result(S.today);
  if (d.n === S.today) {
    if (myToday) {
      // Already played today: compare now, and attach my score to this duel.
      myToday.duelOpp = { nick: d.nick, reps: d.reps, pid: d.pid };
      store.saveResult(myToday);
      page(`${head}${duelCompare(myToday)}${accepts}<a class="btn ghost" href="/" data-link>See my result</a>${quickNav()}`);
      if (!store.seen(`accept:${id}`)) api.acceptDuel(id, store.uid(), false).catch(() => {});
      return;
    }
    page(`${head}
      <button class="btn primary xl" data-accept>🥊 Accept — beat ${d.reps}${unit}</button>
      <button class="btn ghost" data-accept-tap>✋ No camera? Tap mode <span class="tag">unranked</span></button>
      <div class="privacy-card"><b>🔒 Your video never leaves your device.</b> No install, no sign-up. The AI counts your reps in this browser.</div>
      ${accepts}
      <section class="card soft"><p><b>What is Repdle?</b> One 60-second fitness challenge a day, the same for the whole world — like Wordle, but you move. Today: ${esc(label)}.</p></section>`);
    const opp = { nick: d.nick, reps: d.reps, pid: d.pid };
    $('[data-accept]', app).onclick = () => playDaily({ mode: 'cam', ref: d.pid, duel: opp });
    $('[data-accept-tap]', app).onclick = () => playDaily({ mode: 'tap', ref: d.pid, duel: opp });
    return;
  }

  // An older duel: replay that exercise (unranked) or play today's.
  page(`${head}
    <p class="center">That duel was for Repdle #${d.n}. Today is #${S.today} (${esc(exerciseName(S.ch.ex, 0))}).</p>
    <button class="btn primary" data-replay>🥊 Try ${esc(label)} now <span class="tag">duel replay</span></button>
    <a class="btn ghost" href="/" data-link>Play today’s Repdle #${S.today}</a>
    ${accepts}`);
  $('[data-replay]', app).onclick = async () => {
    if (!(await safetyGate())) return;
    const r = await runSession({ n: d.n, ex: d.ex, v: d.v, mode: 'cam', label: `Duel replay · #${d.n}` });
    if (!r) return render();
    render();
    api.acceptDuel(id, store.uid(), true).catch(() => {});
    const fake = { score: r.score, duelOpp: { nick: d.nick, reps: d.reps } };
    sheet(`<h2>Duel replay</h2>${duelCompare(fake)}${gridHtml(r.kind, r.seg, true)}<p class="muted">Replays aren’t ranked. Play today’s Repdle to get on the board!</p><a class="btn primary" href="/" data-link>Play Repdle #${S.today}</a>`);
  };
}

function notFound(msg, withHome = true) {
  page(`<section class="card center"><p>${esc(msg)}</p>${withHome ? `<a class="btn primary" href="/" data-link>Play today’s Repdle</a>` : ''}</section>`);
}

// ---------------- leagues ----------------
const KIND_LABEL = { friends: '👯 Friends', office: '💼 Office', college: '🎓 College', gym: '🏋️ Gym', family: '👪 Family', other: '✨ Other' };

function leaguesPage() {
  const mine = store.leagues();
  page(`
    <h2>🏆 Leagues</h2>
    <p class="muted">A league is a private daily board for a group. Share the 6-letter code; anyone with it can join.</p>
    ${mine.length ? `<section class="card"><h3>Your leagues</h3><ul class="list">${mine.map((l) => `<li><a href="/l/${esc(l.code)}" data-link>${esc(l.name)}</a><code>${esc(l.code)}</code></li>`).join('')}</ul></section>` : ''}
    <section class="card">
      <h3>Join a league</h3>
      <form data-join class="form-row"><input name="code" maxlength="6" placeholder="CODE" autocapitalize="characters" autocomplete="off" required><button class="btn primary">Join</button></form>
    </section>
    <section class="card">
      <h3>Create a league</h3>
      <form data-create>
        <input name="name" maxlength="30" placeholder="League name, e.g. Office Warriors" required>
        <div class="kinds">${Object.entries(KIND_LABEL).map(([k, l], i) => `<label><input type="radio" name="kind" value="${k}" ${i === 0 ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        <button class="btn primary">Create</button>
      </form>
      <p class="muted small">You can be in up to 5 leagues. Leagues show your nickname (<b>${esc(store.nick())}</b>) and score — nothing else.</p>
    </section>`);
  $('[data-join]', app).onsubmit = async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code').trim().toUpperCase();
    if (!LEAGUE_RE.test(code)) return toast('Codes are 6 letters/numbers');
    joinLeague(code);
  };
  $('[data-create]', app).onsubmit = async (e) => {
    e.preventDefault();
    if (store.leagues().length >= 5) return toast('You’re already in 5 leagues');
    const f = new FormData(e.target);
    try {
      const r = await api.createLeague({ uid: store.uid(), name: f.get('name'), kind: f.get('kind'), nick: store.nick() });
      store.addLeague(r);
      go(`/l/${r.code}`);
    } catch (err) {
      toast(err.body?.error === 'name' ? 'Pick a different name (3–30 letters)' : 'Couldn’t create the league — try again');
    }
  };
}

async function joinLeague(code) {
  if (store.leagues().length >= 5 && !store.leagues().some((l) => l.code === code)) return toast('You’re already in 5 leagues');
  try {
    const r = await api.joinLeague(code, { uid: store.uid(), nick: store.nick() });
    store.addLeague(r);
    toast(`Joined ${r.name}!`);
    go(`/l/${code}`);
  } catch (err) {
    toast(err.status === 404 ? 'No league with that code' : err.body?.error === 'full' ? 'That league is full (200 max)' : 'Couldn’t join — try again');
  }
}

async function leaguePage(code) {
  if (!LEAGUE_RE.test(code)) return notFound('That league code looks wrong.');
  page(`<div class="card center"><p>Loading league…</p></div>`);
  let l;
  try {
    l = await api.league(code);
  } catch (e) {
    return notFound(e.status === 404 ? 'No league with that code.' : 'Couldn’t load the league.');
  }
  const me = await store.pid();
  const member = store.leagues().some((x) => x.code === code);
  const unit = EXERCISES[S.ch.ex].kind === 'hold' ? 's' : '';
  const played = l.today.filter((m) => m.reps != null);
  const waiting = l.today.filter((m) => m.reps == null);
  const invite = `Join my Repdle league “${l.name}” 💪 One 60-second challenge a day — let’s see who’s fittest.\nCode ${code} → ${location.origin}/l/${code}`;
  page(`
    <section class="card hero">
      <div class="kicker">${esc(KIND_LABEL[l.kind] || '🏆 League')} · ${fmtInt(l.members)} member${l.members === 1 ? '' : 's'}</div>
      <h1>${esc(l.name)}</h1>
      <p class="sub">Code <code class="code">${esc(code)}</code></p>
    </section>
    ${member ? `<button class="btn primary" data-invite>📤 Invite people</button>` : `<button class="btn primary xl" data-join>Join this league</button>`}
    <section class="card">
      <h3>Today · Repdle #${l.n} · ${esc(exerciseName(S.ch.ex, 0))}</h3>
      ${played.length ? `<ol class="board">${played.map((m) => `<li class="${m.pid === me ? 'me' : ''}"><span>${esc(m.nick)}</span><b>${m.reps}${unit}${m.v ? ' 🌱' : ''}${m.cam ? '' : ' ✋'}</b></li>`).join('')}</ol>` : '<p class="muted">Nobody has played yet today. Be first!</p>'}
      ${waiting.length ? `<p class="muted small">Not played yet: ${waiting.slice(0, 30).map((m) => esc(m.nick)).join(', ')}${waiting.length > 30 ? '…' : ''}</p>` : ''}
    </section>
    ${l.week.length ? `<section class="card"><h3>This week</h3><table class="tbl"><tr><th>Player</th><th>Days</th><th>Wins</th></tr>${l.week.map((w) => `<tr class="${w.pid === me ? 'me' : ''}"><td>${esc(w.nick)}</td><td>${w.days}/7</td><td>${w.wins ? '🏆'.repeat(Math.min(w.wins, 7)) : '—'}</td></tr>`).join('')}</table></section>` : ''}
    <p class="muted small center">🌱 low-impact · ✋ tap-counted</p>
    ${member ? `<p class="center"><button class="link" data-leave>Leave league</button></p>` : ''}`);
  $('[data-invite]', app)?.addEventListener('click', async () => {
    const how = await shareOrCopy(invite);
    if (how === 'copied') toast('Invite copied!');
  });
  $('[data-join]', app)?.addEventListener('click', () => joinLeague(code));
  $('[data-leave]', app)?.addEventListener('click', async () => {
    if (!(await confirmSheet({ title: `Leave ${l.name}?`, body: 'You can rejoin later with the code.', ok: 'Leave', danger: true }))) return;
    try {
      await api.leaveLeague(code, store.uid());
    } catch {}
    store.removeLeague(code);
    go('/leagues');
  });
}

// ---------------- countries ----------------
async function countriesPage() {
  const v = store.get('boardV', 0);
  page(`<div class="card center"><p>Loading countries…</p></div>`);
  let snap;
  try {
    snap = await api.stats(S.today);
  } catch {
    return notFound('Couldn’t load the country board.');
  }
  const x = snap.v[v] || { board: [], total: 0 };
  const min = 3;
  const myCc = store.get('cc');
  const ranked = x.board.filter((b) => b.n >= min);
  const small = x.board.filter((b) => b.n < min);
  const ex = EXERCISES[S.ch.ex];
  const unit = ex.kind === 'hold' ? 's' : '';
  page(`
    <h2>🌍 Country battle · #${S.today}</h2>
    <p class="muted">${esc(exerciseName(S.ch.ex, v))} · ${fmtInt(x.total)} ranked players · updated ${new Date(snap.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
    <div class="seg-toggle small">${[0, 1].map((i) => `<button aria-checked="${v === i}" data-bv="${i}">${i ? '🌱 Low-impact' : '💪 Standard'}</button>`).join('')}</div>
    <section class="card">
      ${ranked.length ? `<table class="tbl"><tr><th>#</th><th>Country</th><th>Players</th><th>Avg</th><th>Best</th></tr>
        ${ranked.map((b, i) => `<tr class="${b.cc === myCc ? 'me' : ''}"><td>${i + 1}</td><td>${flagEmoji(b.cc)} ${esc(countryName(b.cc))}</td><td>${fmtInt(b.n)}</td><td><b>${b.avg}${unit}</b></td><td>${b.best}${unit}</td></tr>`).join('')}</table>`
        : '<p class="muted">No country has 3 players yet today. Invite friends to put yours on the board!</p>'}
      ${small.length ? `<p class="muted small">Waiting for 3 players: ${small.map((b) => `${flagEmoji(b.cc)} ${b.n}`).join(' · ')}</p>` : ''}
    </section>
    <p class="muted small center">Countries come from Cloudflare’s IP lookup at submit time; the IP itself is never stored. Hide yours in the menu.</p>`);
  $$('[data-bv]', app).forEach((b) => (b.onclick = () => { store.set('boardV', Number(b.dataset.bv)); countriesPage(); }));
}

// ---------------- about / privacy ----------------
function aboutPage() {
  page(`
    <h2>How Repdle works</h2>
    <section class="card">
      <ol class="steps">
        <li><b>One challenge a day</b>, the same for everyone on Earth (it changes at 00:00 UTC).</li>
        <li><b>60 seconds.</b> Your camera’s AI counts full reps — half reps don’t count. Holds (plank, wall sit) count the seconds your form is right.</li>
        <li><b>Share your grid</b>: one square per 10 s. 🟩 kept pace · 🟨 slowed · 🟥 stopped. It shows your effort without spoiling the challenge.</li>
        <li><b>Duel</b> your friends with your link, join <b>leagues</b>, and fight for your <b>country</b>.</li>
        <li>One official try per day, like Wordle. Practice runs never count.</li>
      </ol>
    </section>
    <section class="card">
      <h3>⚠️ Safety</h3>
      <ul>
        <li>Repdle is for adults (18+). It is a game, not medical advice.</li>
        <li>Warm up first. Stop immediately if you feel pain, dizziness, shortness of breath or chest discomfort.</li>
        <li>Every day has a <b>low-impact</b> option (chair squats, knee push-ups, step jacks, supported split squats, knee plank, high wall sit). It’s ranked separately.</li>
        <li>Clear the space around you and use a non-slip floor. Put the phone somewhere stable.</li>
        <li>If you are pregnant, injured or have a heart, lung or joint condition, ask a doctor before doing timed exercise.</li>
      </ul>
    </section>
    <section class="card" id="privacy">
      <h3>🔒 Privacy policy</h3>
      <p><b>Short version:</b> your camera video never leaves your device. We store an anonymous score, a nickname you choose, and your country code. No accounts, no cookies, no ads, no trackers.</p>
      <p><b>Camera.</b> The pose AI (Google MediaPipe, open source) runs inside your browser. Video frames are processed in memory and discarded. No image, video or body landmarks are uploaded or saved.</p>
      <p><b>What we store on our server (Cloudflare D1):</b> a random anonymous id (a one-way hash of a secret kept in your browser), the day, the exercise variant, your score and pace per 10 s, whether it was camera- or tap-counted, your nickname, your country code, the first day you played, whether you tapped Share, and which duel link (if any) your score answered. League membership: league code, your anonymous id and nickname.</p>
      <p><b>Country.</b> Taken from Cloudflare’s IP lookup when you submit. Your IP address is not stored by Repdle. You can hide your country in the menu.</p>
      <p><b>Metrics.</b> We count totals per day (players, shares, duel opens, returning players) to know if Repdle works. No per-person tracking, no third-party analytics.</p>
      <p><b>Retention.</b> Raw scores are deleted automatically after about two months (current + previous month are kept). Daily totals are kept.</p>
      <p><b>On your device.</b> localStorage keeps your secret id, nickname, streak, recent results and leagues. “Reset my data” in the menu deletes it. Because there are no accounts, we can’t link server rows to you — if you want them deleted sooner, send us your duel link (it contains only your anonymous id).</p>
      <p><b>Children.</b> Repdle is not meant for anyone under 18.</p>
      <p><b>Hosting.</b> Cloudflare (Workers, D1). Cloudflare processes requests as our hosting provider. No other third party receives any data.</p>
      <p class="muted small">Contact: <a href="mailto:jitendra.saini1189@gmail.com">jitendra.saini1189@gmail.com</a></p>
    </section>
    <section class="card soft">
      <h3>Fair play</h3>
      <p>Camera scores are checked on the server (max reps per exercise, timing between reps, pace grid). Tap-mode scores keep your streak but are never ranked.</p>
      <p class="muted small">Pose AI: MediaPipe Pose Landmarker (Apache 2.0) by Google.</p>
    </section>`);
}

// ---------------- menu ----------------
function openMenu() {
  const sh = sheet(`
    <h2>Settings</h2>
    <label class="field">Your name in duels and leagues
      <div class="form-row"><input data-nick maxlength="20" value="${esc(store.nick())}"><button class="btn primary small" data-save>Save</button></div>
    </label>
    <label class="tick"><input type="checkbox" data-sound ${store.get('sound', true) ? 'checked' : ''}> Sounds and voice count-down</label>
    <label class="tick"><input type="checkbox" data-skel ${store.get('skelOnly') ? 'checked' : ''}> Skeleton-only view while playing (hides the camera picture — handy for recording videos)</label>
    <label class="tick"><input type="checkbox" data-hidecc ${store.get('hideCountry') ? 'checked' : ''}> Hide my country (you won’t appear in country battles)</label>
    <nav class="menu-links">
      <a href="/" data-link>🏠 Today</a>
      <a href="/leagues" data-link>🏆 Leagues</a>
      <a href="/countries" data-link>🌍 Countries</a>
      <a href="/about" data-link>❓ How it works · Safety · Privacy</a>
    </nav>
    <p><button class="link danger" data-reset>Reset my data on this device</button></p>`);
  $('[data-save]', sh.el).onclick = () => {
    const n = cleanNick($('[data-nick]', sh.el).value);
    if (!n) return toast('2–20 letters or numbers, please');
    store.set('nick', n);
    toast('Saved');
    sh.close();
    render();
  };
  $('[data-sound]', sh.el).onchange = (e) => store.set('sound', e.target.checked);
  $('[data-skel]', sh.el).onchange = (e) => store.set('skelOnly', e.target.checked);
  $('[data-hidecc]', sh.el).onchange = (e) => store.set('hideCountry', e.target.checked);
  $$('a[data-link]', sh.el).forEach((a) => a.addEventListener('click', () => sh.close()));
  $('[data-reset]', sh.el).onclick = async () => {
    sh.close();
    const yes = await confirmSheet({
      title: 'Reset your data on this device?',
      body: 'This deletes your streak, results, leagues, nickname and anonymous id from this browser. It can’t be undone.',
      ok: 'Delete my data',
      danger: true,
    });
    if (!yes) return;
    store.reset();
    await store.pid(); // fresh anonymous id for the next game
    go('/');
    toast('Your data was deleted from this device');
  };
}

boot();

// for debugging in the console
window.repdle = { S, store };
