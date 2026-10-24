// World percentile and country rank, computed on the device from the cached
// histogram the Worker returns (sparse [[score, count], …] pairs).

export function countAbove(hist, score) {
  let above = 0;
  for (const [s, c] of hist || []) if (s > score) above += c;
  return above;
}

export function histTotal(hist) {
  let t = 0;
  for (const [, c] of hist || []) t += c;
  return t;
}

// The histogram is a snapshot taken before this player's score arrived, so the
// player is added on top unless `included` says the snapshot already has them.
export function placeIn(hist, score, included = false) {
  const total = histTotal(hist) + (included ? 0 : 1);
  const rank = countAbove(hist, score) + 1;
  const topPct = Math.max(1, Math.min(100, Math.ceil((100 * rank) / total)));
  return { rank, total, topPct };
}
