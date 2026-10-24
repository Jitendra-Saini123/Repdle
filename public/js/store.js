// Everything Repdle remembers lives in this browser's localStorage: the secret
// anonymous id, nickname, streak, last 60 results, leagues and pending syncs.
import { newUid, pidOf } from './id.js';

const KEY = 'repdle.v1';
let s = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode / storage full: the app still works for this visit */
  }
}

const ADJ = ['Swift', 'Mighty', 'Steady', 'Bold', 'Iron', 'Quick', 'Brave', 'Sunny', 'Lucky', 'Calm', 'Fierce', 'Happy'];
const ANIMAL = ['Tiger', 'Falcon', 'Panda', 'Otter', 'Cheetah', 'Yak', 'Koala', 'Lynx', 'Bison', 'Gecko', 'Heron', 'Wolf'];

export const store = {
  get: (k, d = null) => (s[k] === undefined ? d : s[k]),
  set(k, v) {
    s[k] = v;
    save();
  },
  uid() {
    if (!s.uid) store.set('uid', newUid());
    return s.uid;
  },
  async pid() {
    if (!s.pid) store.set('pid', await pidOf(store.uid()));
    return s.pid;
  },
  nick() {
    if (!s.nick) {
      const r = crypto.getRandomValues(new Uint8Array(3));
      store.set('nick', `${ADJ[r[0] % ADJ.length]}${ANIMAL[r[1] % ANIMAL.length]}${10 + (r[2] % 90)}`);
    }
    return s.nick;
  },
  result: (n) => (s.hist || {})[n] || null,
  saveResult(r) {
    const hist = { ...(s.hist || {}), [r.n]: r };
    const keep = Object.keys(hist).map(Number).sort((a, b) => b - a).slice(0, 60);
    s.hist = Object.fromEntries(keep.map((n) => [n, hist[n]]));
    save();
  },
  // Streak: consecutive Repdle days played (any mode).
  addPlayDay(n) {
    const st = s.streak || { cur: 0, best: 0, last: 0 };
    if (st.last === n) return st;
    st.cur = st.last === n - 1 ? st.cur + 1 : 1;
    st.best = Math.max(st.best, st.cur);
    st.last = n;
    if (!s.firstDay) s.firstDay = n;
    s.streak = st;
    save();
    return st;
  },
  streak(today) {
    const st = s.streak || { cur: 0, best: 0, last: 0 };
    const alive = st.last === today || st.last === today - 1;
    return { cur: alive ? st.cur : 0, best: st.best, last: st.last };
  },
  firstDay: (n) => s.firstDay || n,
  leagues: () => s.leagues || [],
  addLeague(l) {
    store.set('leagues', [...store.leagues().filter((x) => x.code !== l.code), { code: l.code, name: l.name }].slice(0, 5));
  },
  removeLeague(code) {
    store.set('leagues', store.leagues().filter((x) => x.code !== code));
  },
  pending: () => s.pending || [],
  setPending: (list) => store.set('pending', list),
  seen(key) {
    const set = s.seen || [];
    if (set.includes(key)) return true;
    store.set('seen', [...set.slice(-200), key]);
    return false;
  },
  reset() {
    s = {};
    try {
      localStorage.removeItem(KEY);
    } catch {}
  },
};
