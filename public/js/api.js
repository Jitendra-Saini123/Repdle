// Tiny client for the Worker API. Same origin by default; set
// window.REPDLE_API = "https://repdle-api.example.workers.dev" in index.html if
// the static site and the Worker live on different hosts.
const BASE = (window.REPDLE_API || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body || {};
  }
}

async function call(method, path, body, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Network trouble or an over-quota free tier (429/5xx) → retry later.
export const isRetryable = (e) => !(e instanceof ApiError) || e.status === 429 || e.status >= 500;

export const api = {
  submit: (body) => call('POST', '/api/score', body),
  share: (uid, n) => call('POST', '/api/share', { uid, n }),
  duel: (id, firstOpen) => call('GET', `/api/duel/${encodeURIComponent(id)}${firstOpen ? '?o=1' : ''}`),
  acceptDuel: (id, uid, late) => call('POST', `/api/duel/${encodeURIComponent(id)}/accept`, { uid, late }),
  stats: (n) => call('GET', `/api/stats/${n}`),
  createLeague: (body) => call('POST', '/api/league', body),
  joinLeague: (code, body) => call('POST', `/api/league/${encodeURIComponent(code)}/join`, body),
  leaveLeague: (code, uid) => call('POST', `/api/league/${encodeURIComponent(code)}/leave`, { uid }),
  league: (code) => call('GET', `/api/league/${encodeURIComponent(code)}`),
};
