/**
 * Monte Carlo drawdown / ending-balance simulation — pure, worker-safe.
 * Shared by main thread (fallback) and institutionalMonteCarlo.worker.
 */

export const MC_DEFAULT_RUNS = 256;
export const MC_PATH_LEN_CAP = 120;

function quantileSorted(sortedAsc, q) {
  if (!sortedAsc.length) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  const w = pos - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

/** Mulberry32 */
function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79fd;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function monteCarloRiskFixed(pnls, startBalance, runs = MC_DEFAULT_RUNS) {
  const n = pnls.length;
  if (n < 5 || !Number.isFinite(startBalance) || startBalance <= 1e-6) {
    return {
      runs: 0,
      pathLength: 0,
      ruinProbApprox: null,
      medianEndingBalanceDelta: null,
      medianMaxDdPct: null,
      p5EndingDelta: null,
      drawdownHistogram: [],
    };
  }
  const pathLen = Math.min(MC_PATH_LEN_CAP, Math.max(30, n * 2));
  const rng = seededRandom(314159265);
  const ddPctSamples = [];
  const endingDelta = [];
  let ruinCount = 0;

  for (let r = 0; r < runs; r++) {
    let bal = startBalance;
    let peak = bal;
    let maxDd = 0;
    for (let k = 0; k < pathLen; k++) {
      const draw = pnls[Math.floor(rng() * n)];
      bal += draw;
      if (bal > peak) peak = bal;
      const dd = peak - bal;
      if (dd > maxDd) maxDd = dd;
      if (bal < startBalance * 0.1) break;
    }
    const ddPct = peak > 1e-6 ? (maxDd / peak) * 100 : 0;
    ddPctSamples.push(ddPct);
    endingDelta.push(bal - startBalance);
    if (bal < startBalance * 0.5) ruinCount++;
  }

  const sortedEnd = [...endingDelta].sort((a, b) => a - b);
  const sortedDd = [...ddPctSamples].sort((a, b) => a - b);
  const mid = Math.floor(sortedEnd.length / 2);
  const medianEnd =
    sortedEnd.length % 2 ? sortedEnd[mid] : (sortedEnd[mid - 1] + sortedEnd[mid]) / 2;
  const midDd = Math.floor(sortedDd.length / 2);
  const medianDd =
    sortedDd.length % 2 ? sortedDd[midDd] : (sortedDd[midDd - 1] + sortedDd[midDd]) / 2;

  const histBins = 12;
  const mx = Math.max(...ddPctSamples, 0.01);
  const step = mx / histBins;
  const drawdownHistogram = Array.from({ length: histBins }, (_, i) => ({
    from: i * step,
    to: (i + 1) * step,
    count: 0,
  }));
  ddPctSamples.forEach((d) => {
    let i = Math.floor(d / step);
    if (i >= histBins) i = histBins - 1;
    drawdownHistogram[i].count += 1;
  });

  return {
    runs,
    pathLength: pathLen,
    ruinProbApprox: ruinCount / runs,
    medianEndingBalanceDelta: medianEnd,
    medianMaxDdPct: medianDd,
    p5EndingDelta: quantileSorted(sortedEnd, 0.05),
    drawdownHistogram,
  };
}
