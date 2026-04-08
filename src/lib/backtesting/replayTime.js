/** Advance replay clock by one bar for common MT-style timeframe codes. */

const TF_MS = {
  M1: 60_000,
  M2: 120_000,
  M3: 180_000,
  M4: 240_000,
  M5: 300_000,
  M6: 360_000,
  M10: 600_000,
  M12: 720_000,
  M15: 900_000,
  M20: 1_200_000,
  M30: 1_800_000,
  H1: 3_600_000,
  H2: 7_200_000,
  H3: 10_800_000,
  H4: 14_400_000,
  H6: 21_600_000,
  H8: 28_800_000,
  H12: 43_200_000,
  D1: 86_400_000,
  W1: 604_800_000,
};

export function timeframeToMs(tf) {
  if (!tf) return TF_MS.M15;
  const k = String(tf).trim().toUpperCase();
  return TF_MS[k] ?? TF_MS.M15;
}

export function stepReplayTime(isoOrDate, timeframe, steps) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  const ms = timeframeToMs(timeframe) * steps;
  return new Date(d.getTime() + ms).toISOString();
}
