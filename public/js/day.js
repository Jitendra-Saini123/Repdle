// Day numbers. Repdle #1 is the `start` date in challenges.json. Every player on
// Earth gets the same challenge for the same UTC date.

export const DAY_MS = 86400000;

const dayIndex = (ms) => Math.floor(ms / DAY_MS);
const startIndex = (start) => dayIndex(Date.parse(`${start}T00:00:00Z`));

export function dayNumber(ms, start) {
  return dayIndex(ms) - startIndex(start) + 1;
}

export function dateOfN(n, start) {
  return new Date((startIndex(start) + n - 1) * DAY_MS).toISOString().slice(0, 10);
}

// "202610": the monthly partition a day's scores live in (see src/db.js).
export function monthKey(n, start) {
  const d = dateOfN(n, start);
  return d.slice(0, 4) + d.slice(5, 7);
}

export function challengeFor(data, n) {
  const list = data.days;
  const i = (((n - 1) % list.length) + list.length) % list.length; // wraps after 365 days
  return { ex: list[i].ex, n, date: dateOfN(n, data.start) };
}

export function msUntilNextDay(ms) {
  return (dayIndex(ms) + 1) * DAY_MS - ms;
}

export function msIntoDay(ms) {
  return ms - dayIndex(ms) * DAY_MS;
}
