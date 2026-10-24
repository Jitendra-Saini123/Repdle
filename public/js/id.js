// Anonymous identity. The device keeps a random secret `uid` (never shown);
// the public id is pid = base32(SHA-256("repdle|" + uid))[0..12]. Duel links
// carry only the pid, so a link can't be used to submit scores for someone.
// Shared by the app and the Worker (both have crypto.subtle).
const B32 = 'abcdefghijklmnopqrstuvwxyz234567';

export const UID_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const PID_RE = /^[a-z2-7]{12}$/;
export const DUEL_RE = /^(\d{1,5})-([a-z2-7]{12})$/;
export const LEAGUE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

export function newUid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function pidOf(uid) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`repdle|${uid}`)));
  let bits = 0, val = 0, out = '';
  for (const byte of h) {
    val = (val << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 12) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= 12) break;
  }
  return out;
}
