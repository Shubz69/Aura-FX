var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/aura-analysis/analytics.js
var analytics_exports = {};
__export(analytics_exports, {
  auraAnalysisClosedDataKey: () => auraAnalysisClosedDataKey,
  computeAnalytics: () => computeAnalytics,
  detectSession: () => detectSession,
  emptyAnalytics: () => emptyAnalytics,
  fmtCurrency: () => fmtCurrency,
  fmtDuration: () => fmtDuration,
  fmtNum: () => fmtNum,
  fmtPct: () => fmtPct,
  fmtPnl: () => fmtPnl,
  invalidateAuraAnalyticsCache: () => invalidateAuraAnalyticsCache
});
module.exports = __toCommonJS(analytics_exports);

// src/lib/aura-analysis/analytics/monteCarloRisk.js
var MC_DEFAULT_RUNS = 256;
var MC_PATH_LEN_CAP = 120;
function quantileSorted(sortedAsc, q) {
  if (!sortedAsc.length) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  const w = pos - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}
function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 1831565821;
    let r = Math.imul(t ^ t >>> 15, 1 | t);
    r ^= r + Math.imul(r ^ r >>> 7, 61 | r);
    return ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
function monteCarloRiskFixed(pnls, startBalance, runs = MC_DEFAULT_RUNS) {
  const n = pnls.length;
  if (n < 5 || !Number.isFinite(startBalance) || startBalance <= 1e-6) {
    return {
      runs: 0,
      pathLength: 0,
      ruinProbApprox: null,
      medianEndingBalanceDelta: null,
      medianMaxDdPct: null,
      p5EndingDelta: null,
      drawdownHistogram: []
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
    const ddPct = peak > 1e-6 ? maxDd / peak * 100 : 0;
    ddPctSamples.push(ddPct);
    endingDelta.push(bal - startBalance);
    if (bal < startBalance * 0.5) ruinCount++;
  }
  const sortedEnd = [...endingDelta].sort((a, b) => a - b);
  const sortedDd = [...ddPctSamples].sort((a, b) => a - b);
  const mid = Math.floor(sortedEnd.length / 2);
  const medianEnd = sortedEnd.length % 2 ? sortedEnd[mid] : (sortedEnd[mid - 1] + sortedEnd[mid]) / 2;
  const midDd = Math.floor(sortedDd.length / 2);
  const medianDd = sortedDd.length % 2 ? sortedDd[midDd] : (sortedDd[midDd - 1] + sortedDd[midDd]) / 2;
  const histBins = 12;
  const mx = Math.max(...ddPctSamples, 0.01);
  const step = mx / histBins;
  const drawdownHistogram = Array.from({ length: histBins }, (_, i) => ({
    from: i * step,
    to: (i + 1) * step,
    count: 0
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
    drawdownHistogram
  };
}

// src/lib/aura-analysis/analytics/institutionalMetrics.js
function finiteNum(n, fb = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fb;
}
function tradeNetPnl(t) {
  if (t == null) return 0;
  if (t.netPnl != null && Number.isFinite(Number(t.netPnl))) return Number(t.netPnl);
  return finiteNum(t.pnl);
}
function tradeDate(t) {
  return t.closeTime || t.openTime || t.created_at || null;
}
function sampleSkewness(arr) {
  const n = arr.length;
  if (n < 3) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const m2 = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (m2 < 1e-18) return 0;
  const m3 = arr.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
  return m3 / m2 ** 1.5;
}
function sampleExcessKurtosis(arr) {
  const n = arr.length;
  if (n < 4) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const m2 = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (m2 < 1e-18) return 0;
  const m4 = arr.reduce((s, v) => s + (v - mean) ** 4, 0) / n;
  return m4 / (m2 * m2) - 3;
}
function quantileSorted2(sortedAsc, q) {
  if (!sortedAsc.length) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  const w = pos - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}
function deriveRMultiple(t, pnl, lossUnit) {
  const ex = Number(t.rMultiple);
  if (Number.isFinite(ex) && Math.abs(ex) > 1e-9) return ex;
  if (lossUnit > 1e-9) return pnl / lossUnit;
  return 0;
}
function readMfeMaeUsd(t) {
  const mfe = t.mfeUsd ?? t.maxFavorableExcursionUsd ?? (t.mfe != null && Number.isFinite(Number(t.mfe)) ? Number(t.mfe) : null);
  const mae = t.maeUsd ?? t.maxAdverseExcursionUsd ?? (t.mae != null && Number.isFinite(Number(t.mae)) ? Number(t.mae) : null);
  return {
    mfe: mfe != null && Number.isFinite(mfe) ? Math.abs(mfe) : null,
    mae: mae != null && Number.isFinite(mae) ? Math.abs(mae) : null
  };
}
function effectiveExcursionUsd(t, lossUnitForR) {
  const lu = lossUnitForR > 1e-9 ? lossUnitForR : null;
  let mfe = t.mfeUsd != null && Number.isFinite(Number(t.mfeUsd)) ? Math.abs(Number(t.mfeUsd)) : null;
  let mae = t.maeUsd != null && Number.isFinite(Number(t.maeUsd)) ? Math.abs(Number(t.maeUsd)) : null;
  const mfeR = Number.isFinite(Number(t.mfeR)) ? Number(t.mfeR) : null;
  const maeR = Number.isFinite(Number(t.maeR)) ? Number(t.maeR) : null;
  if (mfe == null && mfeR != null && lu != null) mfe = Math.abs(mfeR) * lu;
  if (mae == null && maeR != null && lu != null) mae = Math.abs(maeR) * lu;
  if (mfe == null || mae == null) {
    const leg = readMfeMaeUsd(t);
    if (mfe == null) mfe = leg.mfe;
    if (mae == null) mae = leg.mae;
  }
  const hasPath = mfe != null && mfe > 1e-9 || mae != null && mae > 1e-9;
  return { mfeUsd: mfe, maeUsd: mae, mfeR, maeR, hasPath };
}
function executionPathMetrics(t, pnl, lossUnitForR, excursion = null) {
  const { mfeUsd: M, maeUsd: A, mfeR, maeR, hasPath } = excursion != null ? excursion : effectiveExcursionUsd(t, lossUnitForR);
  if (!hasPath) return null;
  const eps = 1e-9;
  const R = lossUnitForR > eps ? lossUnitForR : null;
  let entryEfficiency = null;
  if (M != null && A != null && M + A > eps) {
    entryEfficiency = Math.max(0, Math.min(1, 1 - A / (M + A)));
  }
  let exitEfficiency = null;
  if (pnl > 0 && M != null && M > eps) {
    exitEfficiency = Math.max(0, Math.min(1, pnl / M));
  } else if (pnl < 0 && A != null && A > eps) {
    exitEfficiency = Math.max(0, Math.min(1, Math.abs(pnl) / A));
  }
  let missedProfitPct = null;
  if (pnl > 0 && M != null && M > eps) {
    missedProfitPct = Math.min(500, 100 * Math.max(0, M - pnl) / M);
  }
  let avoidableDrawdownPct = null;
  if (pnl < 0 && A != null && A > eps) {
    avoidableDrawdownPct = Math.min(100, 100 * Math.max(0, A - Math.abs(pnl)) / A);
  } else if (pnl > 0 && M != null && M > eps && A != null && A > eps) {
    avoidableDrawdownPct = Math.min(200, 100 * A / Math.max(M, eps));
  }
  let prematureExit = false;
  if (pnl > 0 && M != null && M > eps && pnl < 0.85 * M) prematureExit = true;
  let overstayed = false;
  if (pnl > 0 && M != null && M > eps && A != null && A > eps) {
    if (A / M > 0.35 && pnl < 0.65 * M) overstayed = true;
  }
  let availableRR = null;
  let realizedRR = null;
  let rrCaptureRatio = null;
  if (R) {
    realizedRR = pnl / R;
    if (M != null && M > eps) availableRR = M / R;
    else if (mfeR != null && Math.abs(mfeR) > eps) availableRR = Math.abs(mfeR);
    if (availableRR != null && availableRR > eps && realizedRR != null) {
      rrCaptureRatio = Math.max(-2, Math.min(2, realizedRR / availableRR));
    }
  }
  const mfeTime = t.mfeTime ?? t.mfeAt ?? null;
  const maeTime = t.maeTime ?? t.maeAt ?? null;
  return {
    entryEfficiency,
    exitEfficiency,
    missedProfitPct,
    avoidableDrawdownPct,
    prematureExit,
    overstayed,
    availableRR,
    realizedRR,
    rrCaptureRatio,
    mfeTime,
    maeTime,
    mfeR,
    maeR
  };
}
function executionPriceEfficiency(t, pnl) {
  const entry = finiteNum(t.entryPrice);
  const close = finiteNum(t.closePrice);
  const sl = finiteNum(t.sl ?? t.stopLoss);
  const tp = finiteNum(t.tp ?? t.takeProfit);
  const dir = String(t.direction || "").toLowerCase();
  if (!entry || !close || !dir) {
    return { exitEff: null, entryEff: null, missedProfitPct: null };
  }
  let risk = 0;
  let reward = 0;
  if (dir === "buy") {
    if (sl > 0) risk = entry - sl;
    if (tp > 0) reward = tp - entry;
  } else if (dir === "sell") {
    if (sl > 0) risk = sl - entry;
    if (tp > 0) reward = entry - tp;
  }
  if (risk <= 1e-9 || reward <= 1e-9) {
    return { exitEff: null, entryEff: null, missedProfitPct: null };
  }
  const move = dir === "buy" ? close - entry : entry - close;
  const exitEff = Math.max(0, Math.min(1, move / reward));
  const adverseProxy = pnl < 0 ? Math.min(1, Math.abs(move) / risk) : Math.max(0, (risk - Math.max(0, move)) / risk) * 0.35;
  const entryEff = Math.max(0, Math.min(1, 1 - adverseProxy));
  let missedProfitPct = null;
  if (pnl > 0 && tp) {
    if (dir === "buy" && close < tp && tp > entry) {
      missedProfitPct = (tp - close) / (tp - entry) * 100;
    } else if (dir === "sell" && close > tp && tp < entry) {
      missedProfitPct = (close - tp) / (entry - tp) * 100;
    } else {
      missedProfitPct = 0;
    }
    missedProfitPct = Math.min(200, missedProfitPct);
  }
  return { exitEff, entryEff, missedProfitPct };
}
function buildRDistribution(sorted, pnls, lossUnit) {
  const rs = sorted.map((t, i) => deriveRMultiple(t, pnls[i], lossUnit));
  if (!rs.length) return { bins: [], mean: 0, median: 0 };
  const mn = Math.min(...rs);
  const mx = Math.max(...rs);
  const nBins = Math.min(16, Math.max(6, Math.ceil(Math.sqrt(rs.length))));
  if (Math.abs(mx - mn) < 1e-9) {
    return { bins: [{ from: mn, to: mx, count: rs.length }], mean: mn, median: mn };
  }
  const step = (mx - mn) / nBins;
  const bins = Array.from({ length: nBins }, (_, i) => ({
    from: mn + i * step,
    to: mn + (i + 1) * step,
    count: 0
  }));
  rs.forEach((r) => {
    let i = Math.floor((r - mn) / step);
    if (i >= nBins) i = nBins - 1;
    if (i < 0) i = 0;
    bins[i].count += 1;
  });
  const sortedR = [...rs].sort((a, b) => a - b);
  const mid = Math.floor(sortedR.length / 2);
  const median = sortedR.length % 2 ? sortedR[mid] : (sortedR[mid - 1] + sortedR[mid]) / 2;
  return { bins, mean: rs.reduce((s, v) => s + v, 0) / rs.length, median };
}
function rollingExpectancy(pnls, window2) {
  const out = [];
  if (!pnls.length || window2 < 2) return out;
  for (let i = window2 - 1; i < pnls.length; i++) {
    const slice = pnls.slice(i - window2 + 1, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    out.push({ endIdx: i, window: window2, expectancy: mean });
  }
  return out;
}
function edgeStabilityFromRolling(series) {
  if (!series.length) return 0;
  const vals = series.map((s) => s.expectancy);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const varI = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, vals.length);
  const cv = Math.abs(mean) > 1e-6 ? Math.sqrt(varI) / Math.abs(mean) : 1;
  return Math.max(0, Math.min(100, Math.round(100 / (1 + cv * 2))));
}
function edgeDecayDetection(pnls) {
  if (pnls.length < 10) return { decayRatio: null, firstHalfExpectancy: 0, secondHalfExpectancy: 0, decayFlag: false };
  const half = Math.floor(pnls.length / 2);
  const a = pnls.slice(0, half);
  const b = pnls.slice(half);
  const e1 = a.reduce((s, v) => s + v, 0) / a.length;
  const e2 = b.reduce((s, v) => s + v, 0) / b.length;
  const ratio = Math.abs(e1) > 1e-6 ? e2 / e1 : null;
  const decayFlag = ratio != null && e1 > 0 && ratio < 0.55;
  return { decayRatio: ratio, firstHalfExpectancy: e1, secondHalfExpectancy: e2, decayFlag };
}
function historicalVaRCVaR(pnls, alpha = 0.05) {
  if (!pnls.length) return { var95: 0, cvar95: 0, alpha };
  const s = [...pnls].sort((x, y) => x - y);
  const q = quantileSorted2(s, alpha);
  const tail = s.filter((v) => v <= q);
  const cvar = tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : q;
  return { var95: q, cvar95: cvar, alpha };
}
function riskOfRuinAnalytic(winRatePct, payoff) {
  const p = Math.max(1e-6, Math.min(1 - 1e-6, winRatePct / 100));
  const b = Math.max(1e-6, payoff);
  const q = 1 - p;
  const edge = p * b - q;
  if (edge <= 1e-6) return { prob: 1, edge, units: null };
  const r = q / (p * b);
  const prob = Math.min(1, Math.max(0, Math.pow(r, 25)));
  return { prob, edge, units: 25 };
}
function mistakeCost(sorted, pnls) {
  let noSlLoss = 0;
  let revengeLoss = 0;
  for (let i = 0; i < sorted.length; i++) {
    const p = pnls[i];
    if (p >= 0) continue;
    const t = sorted[i];
    if (!t.sl && !t.stopLoss) noSlLoss += Math.abs(p);
  }
  for (let i = 1; i < sorted.length; i++) {
    if (pnls[i] >= 0) continue;
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (tradeNetPnl(prev) >= 0) continue;
    const ta = new Date(tradeDate(prev) || 0).getTime();
    const tb = new Date(cur.openTime || tradeDate(cur) || 0).getTime();
    if (Number.isFinite(ta) && Number.isFinite(tb) && tb - ta <= 5 * 60 * 1e3) {
      revengeLoss += Math.abs(pnls[i]);
    }
  }
  const totalMistake = noSlLoss + revengeLoss;
  return { noSlLossSum: noSlLoss, revengeFollowLossSum: revengeLoss, totalMistakeCost: totalMistake };
}
function mistakeClustering(sorted, pnls) {
  let clusters = 0;
  let inLossBurst = 0;
  for (let i = 0; i < pnls.length; i++) {
    if (pnls[i] < 0) {
      inLossBurst++;
    } else {
      if (inLossBurst >= 3) clusters++;
      inLossBurst = 0;
    }
  }
  if (inLossBurst >= 3) clusters++;
  return { lossBurstClusters: clusters, thresholdTrades: 3 };
}
function behaviourWeekdayHour(sorted, pnls) {
  const grid = Array.from(
    { length: 7 },
    () => Array.from({ length: 24 }, () => ({ pnl: 0, trades: 0 }))
  );
  sorted.forEach((t, i) => {
    const d = tradeDate(t);
    if (!d) return;
    const dt = new Date(d);
    const wd = dt.getUTCDay();
    const h = dt.getUTCHours();
    grid[wd][h].pnl += pnls[i];
    grid[wd][h].trades += 1;
  });
  return { grid, labels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
}
function computeSignatureScores({
  pctWithSL,
  sqn,
  expectancyR,
  edgeStabilityScore,
  edgeDecayFlag,
  revengeStyleRate,
  behaviorVolatilityScore,
  monthlyPnls,
  maxDrawdownPct,
  ruinProbApprox,
  winRate
}) {
  const riskDisc = Math.max(0, Math.min(100, pctWithSL * 0.85 + (pctWithSL >= 80 ? 12 : 0)));
  const edgeQ = Math.max(0, Math.min(100, 45 + sqn * 12 + expectancyR * 18));
  const consist = Math.max(0, Math.min(100, edgeStabilityScore * 0.65 + (edgeDecayFlag ? 15 : 35)));
  const emot = Math.max(0, Math.min(100, 100 - revengeStyleRate * 1.1 - Math.max(0, behaviorVolatilityScore - 40) * 0.8));
  const auraxComposite = Math.round(
    riskDisc * 0.28 + edgeQ * 0.28 + consist * 0.27 + emot * 0.17
  );
  let monStd = 0;
  if (monthlyPnls.length >= 2) {
    const m = monthlyPnls.reduce((s, v) => s + v, 0) / monthlyPnls.length;
    monStd = Math.sqrt(
      monthlyPnls.reduce((s, v) => s + (v - m) ** 2, 0) / monthlyPnls.length
    );
  }
  const ddVol = maxDrawdownPct;
  const consistencyScore = Math.max(
    0,
    Math.min(100, Math.round(100 - Math.min(50, monStd / 10) - Math.min(40, ddVol * 0.8)))
  );
  const adaptabilityScore = Math.max(
    0,
    Math.min(100, Math.round(55 + (edgeDecayFlag ? -25 : 20) + (winRate - 50) * 0.35))
  );
  const edgeConfidenceScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        edgeStabilityScore * 0.35 + Math.min(100, sqn * 18) + (expectancyR > 0 ? 15 : 0) + (ruinProbApprox != null ? (1 - ruinProbApprox) * 25 : 12)
      )
    )
  );
  return {
    auraxComposite,
    edgeConfidenceScore,
    consistencyScore,
    adaptabilityScore,
    riskQuality: Math.round(riskDisc),
    edgeQuality: Math.round(edgeQ),
    emotionalStability: Math.round(emot)
  };
}
function executionSegAcc() {
  return {
    trades: 0,
    pathTrades: 0,
    entryN: 0,
    entrySum: 0,
    exitN: 0,
    exitSum: 0,
    missedN: 0,
    missedSum: 0,
    avoidN: 0,
    avoidSum: 0,
    rrN: 0,
    rrSum: 0,
    realizedRn: 0,
    realizedRsum: 0,
    availableRn: 0,
    availableRsum: 0,
    prematureWins: 0,
    eligiblePrematureWins: 0,
    overstayed: 0,
    overstayedElig: 0
  };
}
function finalizeExecutionSeg(key, a) {
  return {
    key,
    trades: a.trades,
    pathTrades: a.pathTrades,
    entryEfficiencyAvg: a.entryN ? a.entrySum / a.entryN : null,
    exitEfficiencyAvg: a.exitN ? a.exitSum / a.exitN : null,
    missedProfitPctAvg: a.missedN ? a.missedSum / a.missedN : null,
    avoidableDrawdownPctAvg: a.avoidN ? a.avoidSum / a.avoidN : null,
    rrCaptureRatioAvg: a.rrN ? a.rrSum / a.rrN : null,
    realizedRRAvg: a.realizedRn ? a.realizedRsum / a.realizedRn : null,
    availableRRAvg: a.availableRn ? a.availableRsum / a.availableRn : null,
    prematureExitRate: a.eligiblePrematureWins > 0 ? a.prematureWins / a.eligiblePrematureWins * 100 : null,
    overstayedTradeRate: a.overstayedElig > 0 ? a.overstayed / a.overstayedElig * 100 : null
  };
}
function buildInstitutionalMetrics(params) {
  const {
    sorted,
    pnls,
    lossUnitForR,
    startBalance,
    byMonth,
    drawdownCurve,
    revengeStyleRate = 0,
    pctWithSL = 0,
    behaviorVolatilityScore = 0,
    sqn = 0,
    expectancyR = 0,
    payoffRatio = 0,
    winRate = 0,
    monteCarloOverride
  } = params;
  const rollingWindow = Math.min(30, Math.max(5, Math.floor(sorted.length / 4) || 10));
  const rollingSeries = rollingExpectancy(pnls, rollingWindow);
  const edgeStabilityScore = edgeStabilityFromRolling(rollingSeries);
  const decay = edgeDecayDetection(pnls);
  const rDist = buildRDistribution(sorted, pnls, lossUnitForR || 1);
  const pnSorted = [...pnls].sort((a, b) => a - b);
  const { var95, cvar95 } = historicalVaRCVaR(pnls, 0.05);
  const skewness = sampleSkewness(pnls);
  const excessKurtosis = sampleExcessKurtosis(pnls);
  const mc = monteCarloOverride != null ? monteCarloOverride : monteCarloRiskFixed(pnls, startBalance, MC_DEFAULT_RUNS);
  const ror = riskOfRuinAnalytic(winRate, payoffRatio);
  const mistakes = mistakeCost(sorted, pnls);
  const mistakeClusters = mistakeClustering(sorted, pnls);
  const bhour = behaviourWeekdayHour(sorted, pnls);
  let mfeSum = 0;
  let maeSum = 0;
  let mfeCount = 0;
  let maeCount = 0;
  const exitEffs = [];
  const entryEffs = [];
  const missed = [];
  let winsWithTp = 0;
  let premature = 0;
  const pathEntry = [];
  const pathExit = [];
  const pathMissed = [];
  const pathAvoid = [];
  const pathRrRatio = [];
  const realizedRRs = [];
  const availableRRs = [];
  let pathPrematureCount = 0;
  let pathPrematureEligible = 0;
  let pathOverstayed = 0;
  let pathOverstayedElig = 0;
  const segSym = /* @__PURE__ */ new Map();
  const segSes = /* @__PURE__ */ new Map();
  const segTouch = (map, key) => {
    if (!map.has(key)) map.set(key, executionSegAcc());
    return map.get(key);
  };
  sorted.forEach((t, i) => {
    const pnl = pnls[i];
    const lu = lossUnitForR || 1;
    const ex = effectiveExcursionUsd(t, lu);
    if (ex.mfeUsd != null) {
      mfeSum += ex.mfeUsd;
      mfeCount++;
    }
    if (ex.maeUsd != null) {
      maeSum += ex.maeUsd;
      maeCount++;
    }
    const path = executionPathMetrics(t, pnl, lu, ex);
    const eff = executionPriceEfficiency(t, pnl);
    if (eff.exitEff != null) exitEffs.push(eff.exitEff);
    if (eff.entryEff != null) entryEffs.push(eff.entryEff);
    if (eff.missedProfitPct != null) missed.push(eff.missedProfitPct);
    if (path) {
      if (path.entryEfficiency != null) pathEntry.push(path.entryEfficiency);
      if (path.exitEfficiency != null) pathExit.push(path.exitEfficiency);
      if (path.missedProfitPct != null) pathMissed.push(path.missedProfitPct);
      if (path.avoidableDrawdownPct != null) pathAvoid.push(path.avoidableDrawdownPct);
      if (path.rrCaptureRatio != null) pathRrRatio.push(path.rrCaptureRatio);
      if (path.realizedRR != null) realizedRRs.push(path.realizedRR);
      if (path.availableRR != null) availableRRs.push(path.availableRR);
      if (pnl > 0 && ex.mfeUsd != null && ex.mfeUsd > 1e-9) {
        pathPrematureEligible++;
        if (path.prematureExit) pathPrematureCount++;
      }
      if (pnl > 0 && ex.mfeUsd != null && ex.maeUsd != null && ex.mfeUsd > 1e-9 && ex.maeUsd > 1e-9) {
        pathOverstayedElig++;
        if (path.overstayed) pathOverstayed++;
      }
      const sk = t.pair || t.symbol || "\u2014";
      const ss = t.session || "Unknown";
      for (const [map, key] of [[segSym, sk], [segSes, ss]]) {
        const a = segTouch(map, key);
        a.trades++;
        a.pathTrades++;
        if (path.entryEfficiency != null) {
          a.entryN++;
          a.entrySum += path.entryEfficiency;
        }
        if (path.exitEfficiency != null) {
          a.exitN++;
          a.exitSum += path.exitEfficiency;
        }
        if (path.missedProfitPct != null) {
          a.missedN++;
          a.missedSum += path.missedProfitPct;
        }
        if (path.avoidableDrawdownPct != null) {
          a.avoidN++;
          a.avoidSum += path.avoidableDrawdownPct;
        }
        if (path.rrCaptureRatio != null) {
          a.rrN++;
          a.rrSum += path.rrCaptureRatio;
        }
        if (path.realizedRR != null) {
          a.realizedRn++;
          a.realizedRsum += path.realizedRR;
        }
        if (path.availableRR != null) {
          a.availableRn++;
          a.availableRsum += path.availableRR;
        }
        if (pnl > 0 && ex.mfeUsd != null && ex.mfeUsd > 1e-9) {
          a.eligiblePrematureWins++;
          if (path.prematureExit) a.prematureWins++;
        }
        if (pnl > 0 && ex.mfeUsd != null && ex.maeUsd != null && ex.mfeUsd > 1e-9 && ex.maeUsd > 1e-9) {
          a.overstayedElig++;
          if (path.overstayed) a.overstayed++;
        }
      }
    }
    const hasTp = !!(t.tp || t.takeProfit);
    if (pnl > 0 && hasTp) {
      winsWithTp++;
      if (eff.exitEff != null && eff.exitEff < 0.85) premature++;
    }
  });
  const mean = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  const preferPathMean = (pathArr, proxyArr) => {
    if (pathArr.length > 0) return mean(pathArr);
    if (proxyArr.length > 0) return mean(proxyArr);
    return null;
  };
  const entryEfficiencyAvg = preferPathMean(pathEntry, entryEffs);
  const exitEfficiencyAvg = preferPathMean(pathExit, exitEffs);
  const missedProfitPctAvg = preferPathMean(pathMissed, missed);
  const hasPathSamples = pathEntry.length + pathExit.length + pathMissed.length + pathAvoid.length > 0;
  const hasProxySamples = entryEffs.length + exitEffs.length + missed.length > 0;
  let executionBasis = null;
  if (hasPathSamples && hasProxySamples) executionBasis = "mixed";
  else if (hasPathSamples) executionBasis = "path";
  else if (hasProxySamples) executionBasis = "price_geometry";
  const avoidableDrawdownPctAvg = pathAvoid.length ? mean(pathAvoid) : null;
  const prematureExitRatePath = pathPrematureEligible > 0 ? pathPrematureCount / pathPrematureEligible * 100 : null;
  const prematureExitRateProxy = winsWithTp > 0 ? premature / winsWithTp * 100 : null;
  const prematureExitRate = prematureExitRatePath != null ? prematureExitRatePath : prematureExitRateProxy;
  const overstayedTradeRate = pathOverstayedElig > 0 ? pathOverstayed / pathOverstayedElig * 100 : null;
  const rrCaptureRatioAvg = pathRrRatio.length ? mean(pathRrRatio) : null;
  const realizedRRAvg = realizedRRs.length ? mean(realizedRRs) : null;
  const availableRRAvg = availableRRs.length ? mean(availableRRs) : null;
  const executionBySymbol = Array.from(segSym.entries()).map(([k, v]) => finalizeExecutionSeg(k, v)).sort((a, b) => b.pathTrades - a.pathTrades);
  const executionBySession = Array.from(segSes.entries()).map(([k, v]) => finalizeExecutionSeg(k, v)).sort((a, b) => b.pathTrades - a.pathTrades);
  const sessionVol = (params.byHourUtc || []).map((h) => Math.abs(h.pnl));
  const volMean = mean(sessionVol);
  const sessionVolStd = sessionVol.length > 1 ? Math.sqrt(sessionVol.reduce((s, v) => s + (v - volMean) ** 2, 0) / sessionVol.length) : 0;
  const monthlyPnls = (byMonth || []).map((m) => m.pnl);
  const maxDrawdownPct = drawdownCurve && drawdownCurve.length ? Math.max(...drawdownCurve.map((p) => p.ddPct || 0), 0) : 0;
  const signatures = computeSignatureScores({
    pctWithSL,
    sqn,
    expectancyR,
    edgeStabilityScore,
    edgeDecayFlag: decay.decayFlag,
    revengeStyleRate,
    behaviorVolatilityScore,
    monthlyPnls,
    maxDrawdownPct,
    ruinProbApprox: mc.ruinProbApprox,
    winRate
  });
  const pnlDensityCurve = buildPnlDensityPoints(pnls);
  return {
    institutionalVersion: 2,
    expectancyBySegment: {
      note: "Per-symbol/session expectancy equals avg P/L per trade in segment (see bySymbol.expectancy)."
    },
    rollingExpectancy: {
      window: rollingWindow,
      series: rollingSeries
    },
    edgeStabilityScore,
    edgeDecay: decay,
    rMultipleDistribution: rDist,
    executionQuality: {
      mfeAvg: mfeCount ? mfeSum / mfeCount : null,
      maeAvg: maeCount ? maeSum / maeCount : null,
      mfeMaeTradeCoverage: { mfe: mfeCount, mae: maeCount, total: sorted.length },
      executionBasis,
      pathSampleSize: pathEntry.length + pathExit.length,
      priceGeometrySampleSize: entryEffs.length + exitEffs.length,
      entryEfficiencyAvg,
      exitEfficiencyAvg,
      missedProfitPctAvg,
      avoidableDrawdownPctAvg,
      prematureExitRate,
      prematureExitRatePath,
      prematureExitRateProxy,
      overstayedTradeRate,
      rrCaptureRatioAvg,
      realizedRRAvg,
      availableRRAvg,
      executionBySymbol,
      executionBySession
    },
    riskEngine: {
      historicalVaR95: var95,
      historicalCVaR95: cvar95,
      monteCarlo: mc,
      riskOfRuinParametric: {
        prob: Number.isFinite(ror.prob) ? ror.prob : null,
        edgePerTrade: ror.edge,
        assumptions: "Simplified two-outcome ruin bound; use monteCarlo for bootstrap path risk."
      },
      drawdownDistribution: mc.drawdownHistogram
    },
    distribution: {
      skewness,
      excessKurtosis,
      pnlQuantiles: {
        p1: quantileSorted2(pnSorted, 0.01),
        p5: quantileSorted2(pnSorted, 0.05),
        p50: quantileSorted2(pnSorted, 0.5),
        p95: quantileSorted2(pnSorted, 0.95),
        p99: quantileSorted2(pnSorted, 0.99)
      },
      pnlDensityCurve
    },
    marketContext: {
      performanceVsVolatility: {
        tradePnlStd: params.pnlStdDev ?? 0,
        regimeNote: "Pair-level realized vol API pending \u2014 structure reserved."
      },
      performanceVsSessionVolatility: {
        hourPnlDispersion: sessionVolStd,
        hourPnlMeanAbs: volMean
      },
      newsEventTagging: {
        enabled: false,
        schemaVersion: 1,
        events: []
      }
    },
    behavioural: {
      mistakeCost: mistakes,
      mistakeClustering: mistakeClusters,
      weekdayHourBehaviour: bhour
    },
    signature: signatures,
    scatterTradePnL: sorted.map((t, i) => {
      const ex = effectiveExcursionUsd(t, lossUnitForR || 1);
      return {
        i,
        pnl: pnls[i],
        r: deriveRMultiple(t, pnls[i], lossUnitForR || 1),
        pair: t.pair || t.symbol || "\u2014",
        mfeUsd: ex.mfeUsd,
        maeUsd: ex.maeUsd
      };
    })
  };
}
function buildPnlDensityPoints(pnls, binCount = 40) {
  if (!pnls.length) return [];
  const mn = Math.min(...pnls);
  const mx = Math.max(...pnls);
  if (Math.abs(mx - mn) < 1e-9) return [{ x: mn, y: 1 }];
  const step = (mx - mn) / binCount;
  const bins = Array.from({ length: binCount }, (_, i) => ({
    x: mn + (i + 0.5) * step,
    y: 0
  }));
  pnls.forEach((p) => {
    let i = Math.floor((p - mn) / step);
    if (i >= binCount) i = binCount - 1;
    if (i < 0) i = 0;
    bins[i].y += 1;
  });
  const maxY = Math.max(...bins.map((b) => b.y), 1);
  return bins.map((b) => ({ x: b.x, y: b.y / maxY }));
}
function emptyInstitutionalMetrics() {
  return {
    institutionalVersion: 2,
    expectancyBySegment: { note: "" },
    rollingExpectancy: { window: 0, series: [] },
    edgeStabilityScore: 0,
    edgeDecay: {
      decayRatio: null,
      firstHalfExpectancy: 0,
      secondHalfExpectancy: 0,
      decayFlag: false
    },
    rMultipleDistribution: { bins: [], mean: 0, median: 0 },
    executionQuality: {
      mfeAvg: null,
      maeAvg: null,
      mfeMaeTradeCoverage: { mfe: 0, mae: 0, total: 0 },
      executionBasis: null,
      pathSampleSize: 0,
      priceGeometrySampleSize: 0,
      entryEfficiencyAvg: null,
      exitEfficiencyAvg: null,
      missedProfitPctAvg: null,
      avoidableDrawdownPctAvg: null,
      prematureExitRate: null,
      prematureExitRatePath: null,
      prematureExitRateProxy: null,
      overstayedTradeRate: null,
      rrCaptureRatioAvg: null,
      realizedRRAvg: null,
      availableRRAvg: null,
      executionBySymbol: [],
      executionBySession: []
    },
    riskEngine: {
      historicalVaR95: 0,
      historicalCVaR95: 0,
      monteCarlo: {
        runs: 0,
        pathLength: 0,
        ruinProbApprox: null,
        medianEndingBalanceDelta: null,
        medianMaxDdPct: null,
        p5EndingDelta: null,
        drawdownHistogram: []
      },
      riskOfRuinParametric: { prob: null, edgePerTrade: 0, assumptions: "" },
      drawdownDistribution: []
    },
    distribution: {
      skewness: 0,
      excessKurtosis: 0,
      pnlQuantiles: {
        p1: 0,
        p5: 0,
        p50: 0,
        p95: 0,
        p99: 0
      },
      pnlDensityCurve: []
    },
    marketContext: {
      performanceVsVolatility: { tradePnlStd: 0, regimeNote: "" },
      performanceVsSessionVolatility: { hourPnlDispersion: 0, hourPnlMeanAbs: 0 },
      newsEventTagging: { enabled: false, schemaVersion: 1, events: [] }
    },
    behavioural: {
      mistakeCost: {
        noSlLossSum: 0,
        revengeFollowLossSum: 0,
        totalMistakeCost: 0
      },
      mistakeClustering: { lossBurstClusters: 0, thresholdTrades: 3 },
      weekdayHourBehaviour: {
        grid: Array.from(
          { length: 7 },
          () => Array.from({ length: 24 }, () => ({ pnl: 0, trades: 0 }))
        ),
        labels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
      }
    },
    signature: {
      auraxComposite: 0,
      edgeConfidenceScore: 0,
      consistencyScore: 0,
      adaptabilityScore: 0,
      riskQuality: 0,
      edgeQuality: 0,
      emotionalStability: 0
    },
    scatterTradePnL: []
  };
}

// src/lib/aura-analysis/monteCarloRunner.js
var import_meta = {};
var memo = { key: null, result: null };
var MEMO_CAP = 4;
var memoQueue = [];
function remember(key, result) {
  if (!key) return;
  if (memoQueue.length >= MEMO_CAP) {
    const old = memoQueue.shift();
    if (memo.key === old) {
      memo.key = null;
      memo.result = null;
    }
  }
  memoQueue.push(key);
  memo.key = key;
  memo.result = result;
}
function fromMemo(key) {
  if (key && memo.key === key && memo.result) return memo.result;
  return null;
}
function runMonteCarloOffMainThread(pnls, startBalance, opts = {}) {
  const runs = opts.runs ?? MC_DEFAULT_RUNS;
  const cacheKey = opts.cacheKey ?? null;
  const cached = fromMemo(cacheKey);
  if (cached) return Promise.resolve(cached);
  if (!Array.isArray(pnls) || pnls.length < 5 || !Number.isFinite(startBalance) || startBalance <= 1e-6) {
    const mc = monteCarloRiskFixed(pnls, startBalance, runs);
    remember(cacheKey, mc);
    return Promise.resolve(mc);
  }
  if (typeof Worker === "undefined") {
    const mc = monteCarloRiskFixed(pnls, startBalance, runs);
    remember(cacheKey, mc);
    return Promise.resolve(mc);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (mc) => {
      if (settled) return;
      settled = true;
      remember(cacheKey, mc);
      resolve(mc);
    };
    let worker;
    const timer = setTimeout(() => {
      try {
        worker?.terminate();
      } catch (_) {
      }
      finish(monteCarloRiskFixed(pnls, startBalance, runs));
    }, 12e3);
    try {
      worker = new Worker(
        new URL("./workers/institutionalMonteCarlo.worker.js", import_meta.url),
        { type: "module" }
      );
      worker.onmessage = (ev) => {
        clearTimeout(timer);
        try {
          worker.terminate();
        } catch (_) {
        }
        const mc = ev.data?.mc;
        if (mc && typeof mc === "object") finish(mc);
        else finish(monteCarloRiskFixed(pnls, startBalance, runs));
      };
      worker.onerror = () => {
        clearTimeout(timer);
        try {
          worker.terminate();
        } catch (_) {
        }
        finish(monteCarloRiskFixed(pnls, startBalance, runs));
      };
      worker.postMessage({ pnls, startBalance, runs });
    } catch (_) {
      clearTimeout(timer);
      finish(monteCarloRiskFixed(pnls, startBalance, runs));
    }
  });
}

// src/lib/aura-analysis/institutionalInputFingerprint.js
function hashNum(n) {
  if (!Number.isFinite(n)) return 0;
  const x = Math.round(n * 1e6);
  return (x * 73856093 ^ x >>> 16) >>> 0;
}
function hashStr(s) {
  let h = 5381 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) + h ^ s.charCodeAt(i);
  }
  return h >>> 0;
}
function institutionalInputFingerprint(sortedClosed, pnls, startBalance) {
  let h = sortedClosed.length * 374761393 ^ hashNum(startBalance);
  const n = sortedClosed.length;
  for (let i = 0; i < n; i++) {
    const t = sortedClosed[i];
    const p = pnls[i];
    h ^= hashStr(String(t?.id ?? i));
    h ^= hashStr(String(t?.closeTime || t?.openTime || ""));
    h ^= hashNum(p);
    h ^= hashNum(t?.mfeUsd);
    h ^= hashNum(t?.maeUsd);
    h ^= hashNum(t?.mfeR);
    h ^= hashNum(t?.maeR);
    h ^= hashStr(String(t?.mfeTime || ""));
    h ^= hashStr(String(t?.maeTime || ""));
    h = Math.imul(h, 1597334677) >>> 0;
  }
  return `inst_${h.toString(16)}`;
}

// src/lib/aura-analysis/auraAnalysisDevPerf.js
var AURA_ANALYSIS_PERF_LS = "AURA_ANALYSIS_PERF";
function isAuraAnalysisDevPerfEnabled() {
  try {
    return typeof process !== "undefined" && process.env.NODE_ENV === "development" && typeof localStorage !== "undefined" && localStorage.getItem(AURA_ANALYSIS_PERF_LS) === "1";
  } catch {
    return false;
  }
}
var lastAnalyticsStages = (
  /** @type {Record<string, unknown> | null} */
  null
);
function auraAnalysisDevPerfSetLastAnalyticsStages(stages) {
  if (!isAuraAnalysisDevPerfEnabled()) return;
  lastAnalyticsStages = stages && typeof stages === "object" ? { ...stages } : null;
}

// src/lib/aura-analysis/analytics.js
var WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function detectSession(timeVal) {
  if (!timeVal) return "Unknown";
  const h = new Date(timeVal).getUTCHours();
  if (h >= 0 && h < 8) return "Asian";
  if (h >= 7 && h < 12) return "London";
  if (h >= 12 && h < 17) return "New York";
  if (h >= 17 && h < 21) return "NY Close";
  return "Asian";
}
function sym(t) {
  return t.pair || t.symbol || "\u2014";
}
function tradeDate2(t) {
  return t.closeTime || t.openTime || t.created_at || null;
}
function finiteNum2(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}
function tradeNetPnl2(t) {
  if (t == null) return 0;
  if (t.netPnl != null && Number.isFinite(Number(t.netPnl))) return Number(t.netPnl);
  return finiteNum2(t.pnl);
}
function dedupeAnalyticsTrades(trades) {
  if (!Array.isArray(trades) || trades.length < 2) return trades || [];
  const map = /* @__PURE__ */ new Map();
  for (const t of trades) {
    const k = `${String(t.id ?? "")}|${String(sym(t)).replace(/\s/g, "")}|${String(tradeDate2(t) || "")}`.slice(0, 220);
    map.set(k, t);
  }
  return Array.from(map.values());
}
function safeRatio(num, den, fallback = 0) {
  const a = finiteNum2(num);
  const b = finiteNum2(den);
  if (b === 0 || !Number.isFinite(a / b)) return fallback;
  return a / b;
}
function medianSorted(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function populationStdDev(arr) {
  if (!arr.length) return 0;
  if (arr.length === 1) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}
function computeSqn(sorted, pnls, avgLossAmount) {
  if (!sorted.length || avgLossAmount < 1e-9) return { sqn: 0, expectancyR: 0, rStd: 0 };
  const rMultiples = sorted.map((t, i) => {
    const ex = Number(t.rMultiple);
    if (Number.isFinite(ex) && Math.abs(ex) > 1e-9) return ex;
    return pnls[i] / avgLossAmount;
  });
  const meanR = rMultiples.reduce((s, v) => s + v, 0) / rMultiples.length;
  const rStd = populationStdDev(rMultiples);
  const sqn = rStd > 1e-9 ? Math.sqrt(sorted.length) * (meanR / rStd) : 0;
  return { sqn, expectancyR: meanR, rStd };
}
function buildPnlHistogram(pnls, maxBins = 14) {
  if (!pnls.length) return [];
  const mn = Math.min(...pnls);
  const mx = Math.max(...pnls);
  if (Math.abs(mx - mn) < 1e-9) {
    const sum = pnls.reduce((s, v) => s + v, 0);
    return [{ from: mn, to: mx, count: pnls.length, pnlSum: sum }];
  }
  const n = Math.min(maxBins, Math.max(6, Math.ceil(Math.sqrt(pnls.length))));
  const step = (mx - mn) / n;
  const bins = Array.from({ length: n }, (_, i) => ({
    from: mn + i * step,
    to: mn + (i + 1) * step,
    count: 0,
    pnlSum: 0
  }));
  pnls.forEach((p) => {
    let i = Math.floor((p - mn) / step);
    if (i >= n) i = n - 1;
    if (i < 0) i = 0;
    bins[i].count += 1;
    bins[i].pnlSum += p;
  });
  return bins;
}
function auraAnalysisClosedDataKey(trades = [], account = null) {
  const deduped = dedupeAnalyticsTrades(trades);
  const closedPool = deduped.filter((t) => t.tradeStatus !== "open");
  if (closedPool.length === 0) {
    const liveBal2 = account?.balance != null ? finiteNum2(account.balance) : null;
    return `open_${deduped.length}_${liveBal2 ?? ""}_${account?.equity ?? ""}`;
  }
  const sorted = [...closedPool].sort((a, b) => {
    const ta = new Date(tradeDate2(a) || 0).getTime();
    const tb = new Date(tradeDate2(b) || 0).getTime();
    return ta - tb;
  });
  const pnls = sorted.map(tradeNetPnl2);
  const totalPnl = pnls.reduce((s, v) => s + v, 0);
  const liveBal = account?.balance != null ? finiteNum2(account.balance) : null;
  const startBalance = liveBal != null ? liveBal - totalPnl : 1e4;
  return institutionalInputFingerprint(sorted, pnls, startBalance);
}
async function computeAnalyticsImpl(trades = [], account = null) {
  const devPerf = isAuraAnalysisDevPerfEnabled();
  const tAnalytics0 = devPerf && typeof performance !== "undefined" ? performance.now() : 0;
  const markDone = (extra = {}) => {
    if (!devPerf || typeof performance === "undefined") return;
    const ms = performance.now() - tAnalytics0;
    auraAnalysisDevPerfSetLastAnalyticsStages({
      ...extra,
      "analytics.compute": Math.round(ms * 10) / 10
    });
  };
  const deduped = dedupeAnalyticsTrades(trades);
  if (!deduped.length) {
    const out = emptyAnalytics(account);
    markDone({ "analytics.path": "empty" });
    return out;
  }
  const openPositions = deduped.filter((t) => t.tradeStatus === "open");
  const closedPool = deduped.filter((t) => t.tradeStatus !== "open");
  if (closedPool.length === 0) {
    const out = analyticsOpenPositionsOnly(account, openPositions, deduped);
    markDone({ "analytics.path": "openOnly" });
    return out;
  }
  const sorted = [...closedPool].sort((a, b) => {
    const ta = new Date(tradeDate2(a) || 0).getTime();
    const tb = new Date(tradeDate2(b) || 0).getTime();
    return ta - tb;
  });
  const pnls = sorted.map(tradeNetPnl2);
  const totalPnl = pnls.reduce((s, v) => s + v, 0);
  let winCount = 0;
  let lossCount = 0;
  let beCount = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  for (let i = 0; i < pnls.length; i++) {
    const p = pnls[i];
    if (p > 0) {
      winCount++;
      grossProfit += p;
    } else if (p < 0) {
      lossCount++;
      grossLoss += -p;
    } else {
      beCount++;
    }
  }
  const profitFactorRaw = safeRatio(grossProfit, grossLoss, 0);
  const profitFactor = grossLoss > 0 ? Math.min(999, profitFactorRaw) : grossProfit > 0 ? 999 : 0;
  const winRate = sorted.length > 0 ? safeRatio(winCount, sorted.length, 0) * 100 : 0;
  const lossRate = sorted.length > 0 ? safeRatio(lossCount, sorted.length, 0) * 100 : 0;
  const avgWin = winCount > 0 ? grossProfit / winCount : 0;
  const avgLoss = lossCount > 0 ? grossLoss / lossCount : 0;
  const payoffRatio = avgLoss > 0 ? safeRatio(avgWin, avgLoss, 0) : 0;
  const expectancy = winRate / 100 * avgWin - (100 - winRate) / 100 * avgLoss;
  const bestTrade = pnls.length ? Math.max(...pnls) : 0;
  const worstTrade = pnls.length ? Math.min(...pnls) : 0;
  const avgRR = sorted.reduce((s, t) => s + (Number(t.rMultiple) || 0), 0) / sorted.length;
  let bestIdx = 0;
  let worstIdx = 0;
  for (let i = 1; i < pnls.length; i++) {
    if (pnls[i] > pnls[bestIdx]) bestIdx = i;
    if (pnls[i] < pnls[worstIdx]) worstIdx = i;
  }
  const bestTradeFull = pnls.length ? sorted[bestIdx] : null;
  const worstTradeFull = pnls.length ? sorted[worstIdx] : null;
  const currentBalance = account?.balance ?? null;
  const liveEquity = account?.equity != null ? finiteNum2(account.equity) : null;
  const liveBal = currentBalance != null ? finiteNum2(currentBalance) : null;
  const floatingPnl = liveEquity != null && liveBal != null ? liveEquity - liveBal : null;
  const startBalance = liveBal != null ? liveBal - totalPnl : 1e4;
  let runBal = startBalance;
  const equityCurve = [{ date: null, balance: startBalance, pnl: 0, idx: 0 }];
  sorted.forEach((t, i) => {
    runBal += tradeNetPnl2(t);
    equityCurve.push({ date: tradeDate2(t), balance: runBal, pnl: tradeNetPnl2(t), idx: i + 1 });
  });
  let peak = startBalance;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const drawdownCurve = equityCurve.map((p) => {
    if (p.balance > peak) peak = p.balance;
    const dd = peak - p.balance;
    const ddPct = peak > 0 ? dd / peak * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
    if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;
    return { date: p.date, dd, ddPct };
  });
  const finalBal = equityCurve[equityCurve.length - 1].balance;
  let finalPeak = startBalance;
  equityCurve.forEach((p) => {
    if (p.balance > finalPeak) finalPeak = p.balance;
  });
  const currentDrawdown = finalPeak - finalBal;
  const currentDrawdownPct = finalPeak > 0 ? currentDrawdown / finalPeak * 100 : 0;
  const symMap = {};
  sorted.forEach((t) => {
    const s = sym(t);
    if (!symMap[s]) symMap[s] = { pnl: 0, trades: 0, wins: 0, gp: 0, gl: 0 };
    const p = tradeNetPnl2(t);
    symMap[s].pnl += p;
    symMap[s].trades += 1;
    if (p > 0) {
      symMap[s].wins += 1;
      symMap[s].gp += p;
    } else if (p < 0) symMap[s].gl += Math.abs(p);
  });
  const bySymbol = Object.entries(symMap).map(([pair, d]) => ({
    pair,
    pnl: d.pnl,
    trades: d.trades,
    wins: d.wins,
    losses: d.trades - d.wins,
    winRate: d.trades > 0 ? d.wins / d.trades * 100 : 0,
    avgPnl: d.trades > 0 ? d.pnl / d.trades : 0,
    expectancy: d.trades > 0 ? d.pnl / d.trades : 0,
    pf: d.gl > 0 ? Math.min(999, d.gp / d.gl) : d.gp > 0 ? 999 : 0
  })).sort((a, b) => b.pnl - a.pnl);
  const sessMap = {};
  sorted.forEach((t) => {
    const s = t.session || detectSession(t.openTime || tradeDate2(t)) || "Unknown";
    if (!sessMap[s]) sessMap[s] = { pnl: 0, trades: 0, wins: 0, gp: 0, gl: 0 };
    const p = tradeNetPnl2(t);
    sessMap[s].pnl += p;
    sessMap[s].trades += 1;
    if (p > 0) {
      sessMap[s].wins += 1;
      sessMap[s].gp += p;
    } else if (p < 0) sessMap[s].gl += Math.abs(p);
  });
  const bySession = Object.entries(sessMap).map(([session, d]) => ({
    session,
    pnl: d.pnl,
    trades: d.trades,
    wins: d.wins,
    winRate: d.trades > 0 ? d.wins / d.trades * 100 : 0,
    expectancy: d.trades > 0 ? d.pnl / d.trades : 0,
    pf: d.gl > 0 ? Math.min(999, d.gp / d.gl) : d.gp > 0 ? 999 : 0
  })).sort((a, b) => b.pnl - a.pnl);
  const byWeekday = Array(7).fill(null).map((_, i) => ({
    day: WEEKDAY_NAMES[i],
    dayIndex: i,
    pnl: 0,
    trades: 0,
    wins: 0,
    winRate: 0
  }));
  sorted.forEach((t) => {
    const d = tradeDate2(t);
    if (!d) return;
    const wd = new Date(d).getDay();
    const p = tradeNetPnl2(t);
    byWeekday[wd].pnl += p;
    byWeekday[wd].trades += 1;
    if (p > 0) byWeekday[wd].wins += 1;
  });
  byWeekday.forEach((w) => {
    w.winRate = w.trades > 0 ? w.wins / w.trades * 100 : 0;
  });
  const byHourUtc = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    pnl: 0,
    trades: 0,
    wins: 0,
    winRate: 0
  }));
  sorted.forEach((t) => {
    const d = tradeDate2(t);
    if (!d) return;
    const h = new Date(d).getUTCHours();
    const p = tradeNetPnl2(t);
    byHourUtc[h].pnl += p;
    byHourUtc[h].trades += 1;
    if (p > 0) byHourUtc[h].wins += 1;
  });
  byHourUtc.forEach((h) => {
    h.winRate = h.trades > 0 ? h.wins / h.trades * 100 : 0;
  });
  const dirStats = (arr) => {
    const p = arr.reduce((s, t) => s + tradeNetPnl2(t), 0);
    const w = arr.filter((t) => tradeNetPnl2(t) > 0).length;
    const gp = arr.filter((t) => tradeNetPnl2(t) > 0).reduce((s, t) => s + tradeNetPnl2(t), 0);
    const gl = Math.abs(arr.filter((t) => tradeNetPnl2(t) < 0).reduce((s, t) => s + tradeNetPnl2(t), 0));
    return { trades: arr.length, pnl: p, wins: w, losses: arr.length - w, winRate: arr.length > 0 ? w / arr.length * 100 : 0, pf: gl > 0 ? Math.min(999, gp / gl) : gp > 0 ? 999 : 0 };
  };
  const buyTrades = [];
  const sellTrades = [];
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    const dr = (t.direction || "").toLowerCase();
    if (dr === "buy") buyTrades.push(t);
    else if (dr === "sell") sellTrades.push(t);
  }
  const byDirection = {
    buy: dirStats(buyTrades),
    sell: dirStats(sellTrades)
  };
  const moMap = {};
  sorted.forEach((t) => {
    const d = tradeDate2(t);
    if (!d) return;
    const key = new Date(d).toISOString().slice(0, 7);
    if (!moMap[key]) moMap[key] = { pnl: 0, trades: 0, wins: 0 };
    const p = tradeNetPnl2(t);
    moMap[key].pnl += p;
    moMap[key].trades += 1;
    if (p > 0) moMap[key].wins += 1;
  });
  const byMonth = Object.entries(moMap).map(([month, d]) => ({
    month,
    pnl: d.pnl,
    trades: d.trades,
    wins: d.wins,
    winRate: d.trades > 0 ? d.wins / d.trades * 100 : 0
  })).sort((a, b) => a.month.localeCompare(b.month));
  const byDay = {};
  sorted.forEach((t) => {
    const d = tradeDate2(t);
    if (!d) return;
    const key = new Date(d).toISOString().slice(0, 10);
    if (!byDay[key]) byDay[key] = { pnl: 0, trades: [], wins: 0 };
    byDay[key].pnl += tradeNetPnl2(t);
    byDay[key].trades.push(t);
    if (tradeNetPnl2(t) > 0) byDay[key].wins += 1;
  });
  let maxWinStreak = 0, maxLossStreak = 0, tw = 0, tl = 0;
  pnls.forEach((p) => {
    if (p > 0) {
      tw++;
      tl = 0;
      if (tw > maxWinStreak) maxWinStreak = tw;
    } else if (p < 0) {
      tl++;
      tw = 0;
      if (tl > maxLossStreak) maxLossStreak = tl;
    } else {
      tw = 0;
      tl = 0;
    }
  });
  let currentStreak = 0;
  let streakType = "none";
  if (pnls.length > 0) {
    const last = pnls[pnls.length - 1];
    if (last > 0) {
      streakType = "win";
      for (let i = pnls.length - 1; i >= 0 && pnls[i] > 0; i--) currentStreak++;
    } else if (last < 0) {
      streakType = "loss";
      for (let i = pnls.length - 1; i >= 0 && pnls[i] < 0; i--) currentStreak++;
    }
  }
  const durations = sorted.filter((t) => t.openTime && t.closeTime).map((t) => new Date(t.closeTime).getTime() - new Date(t.openTime).getTime()).filter((d) => d >= 0);
  const avgDurationMs = durations.length > 0 ? durations.reduce((s, v) => s + v, 0) / durations.length : 0;
  const medianDurationMs = medianSorted(durations);
  const winDurMs = sorted.filter((t, i) => pnls[i] > 0 && t.openTime && t.closeTime).map((t) => new Date(t.closeTime).getTime() - new Date(t.openTime).getTime()).filter((d) => d >= 0);
  const lossDurMs = sorted.filter((t, i) => pnls[i] < 0 && t.openTime && t.closeTime).map((t) => new Date(t.closeTime).getTime() - new Date(t.openTime).getTime()).filter((d) => d >= 0);
  const avgWinDurationMs = winDurMs.length > 0 ? winDurMs.reduce((s, v) => s + v, 0) / winDurMs.length : 0;
  const avgLossDurationMs = lossDurMs.length > 0 ? lossDurMs.reduce((s, v) => s + v, 0) / lossDurMs.length : 0;
  let withSLCount = 0;
  let withTPCount = 0;
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (t.sl || t.stopLoss) withSLCount++;
    if (t.tp || t.takeProfit) withTPCount++;
  }
  const pctWithSL = sorted.length > 0 ? safeRatio(withSLCount, sorted.length, 0) * 100 : 0;
  const pctWithTP = sorted.length > 0 ? safeRatio(withTPCount, sorted.length, 0) * 100 : 0;
  const pctNoSL = sorted.length > 0 ? Math.max(0, 100 - pctWithSL) : 0;
  const pctNoTP = sorted.length > 0 ? Math.max(0, 100 - pctWithTP) : 0;
  const timeBetween = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(tradeDate2(sorted[i - 1]) || 0).getTime();
    const b = new Date(sorted[i].openTime || tradeDate2(sorted[i]) || 0).getTime();
    if (a && b && b > a) timeBetween.push(b - a);
  }
  const avgTimeBetweenMs = timeBetween.length > 0 ? timeBetween.reduce((s, v) => s + v, 0) / timeBetween.length : 0;
  const totalReturn = finalBal - startBalance;
  const totalReturnPct = startBalance > 0 ? totalReturn / startBalance * 100 : 0;
  const bestMonth = byMonth.length > 0 ? [...byMonth].sort((a, b) => b.pnl - a.pnl)[0] : null;
  const worstMonth = byMonth.length > 0 ? [...byMonth].sort((a, b) => a.pnl - b.pnl)[0] : null;
  let profitableMonths = 0;
  for (let i = byMonth.length - 1; i >= 0; i--) {
    if (byMonth[i].pnl > 0) profitableMonths++;
    else break;
  }
  const weekMap = {};
  sorted.forEach((t) => {
    const d = tradeDate2(t);
    if (!d) return;
    const dt = new Date(d);
    const monday = new Date(dt);
    monday.setUTCDate(dt.getUTCDate() - dt.getUTCDay() + 1);
    const key = monday.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = { week: key, trades: 0, pnl: 0 };
    weekMap[key].trades += 1;
    weekMap[key].pnl += tradeNetPnl2(t);
  });
  const byWeek = Object.values(weekMap).sort((a, b) => a.week.localeCompare(b.week));
  const avgTradesPerWeek = byWeek.length > 0 ? byWeek.reduce((s, w) => s + w.trades, 0) / byWeek.length : 0;
  const vols = sorted.map((t) => finiteNum2(t.volume)).filter((v) => v > 0);
  const volMean = vols.length ? vols.reduce((s, v) => s + v, 0) / vols.length : 0;
  const volStd = vols.length > 1 ? Math.sqrt(vols.reduce((s, v) => s + (v - volMean) ** 2, 0) / (vols.length - 1)) : 0;
  const lotSizeCv = volMean > 0 ? safeRatio(volStd, volMean, 0) : 0;
  const oversizedTradeCount = volMean > 0 && volStd > 0 ? vols.filter((v) => v > volMean + 2 * volStd).length : 0;
  const topSymShare = sorted.length > 0 && bySymbol.length > 0 ? safeRatio(bySymbol[0].trades, sorted.length, 0) * 100 : 0;
  let revengeStyleCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (tradeNetPnl2(prev) >= 0) continue;
    const ta = new Date(tradeDate2(prev) || 0).getTime();
    const tb = new Date(cur.openTime || tradeDate2(cur) || 0).getTime();
    if (!Number.isFinite(ta) || !Number.isFinite(tb) || tb < ta) continue;
    if (tb - ta <= 5 * 60 * 1e3) revengeStyleCount += 1;
  }
  const revengeStyleRate = sorted.length > 1 ? safeRatio(revengeStyleCount, sorted.length - 1, 0) * 100 : 0;
  const realisedPnl = totalPnl;
  const pnlStdDev = populationStdDev(pnls);
  const pnlMean = sorted.length > 0 ? totalPnl / sorted.length : 0;
  const sharpeLike = pnlStdDev > 1e-9 ? pnlMean / pnlStdDev : 0;
  const losingPnls = pnls.filter((p) => p < 0);
  const downsideStdDev = populationStdDev(losingPnls.length ? losingPnls : [0]);
  const sortinoLike = downsideStdDev > 1e-9 ? pnlMean / downsideStdDev : 0;
  const recoveryFactor = maxDrawdown > 1e-6 ? totalPnl / maxDrawdown : totalPnl > 0 ? 999 : 0;
  const tFirst = new Date(tradeDate2(sorted[0]) || 0).getTime();
  const tLast = new Date(tradeDate2(sorted[sorted.length - 1]) || 0).getTime();
  const periodYears = Math.max(tLast - tFirst, 864e5) / (365.25 * 864e5);
  const cagrPct = periodYears > 0 && startBalance > 0 && finalBal > 0 ? (Math.pow(finalBal / startBalance, 1 / periodYears) - 1) * 100 : totalReturnPct;
  const calmarRatio = maxDrawdownPct > 0.05 ? safeRatio(cagrPct, maxDrawdownPct, 0) : 0;
  const returnToMaxDrawdown = maxDrawdownPct > 0.05 ? safeRatio(totalReturnPct, maxDrawdownPct, 0) : 0;
  const largestWinPctOfGross = grossProfit > 1e-6 ? safeRatio(bestTrade, grossProfit, 0) * 100 : 0;
  const largestLossPctOfGross = grossLoss > 1e-6 ? safeRatio(Math.abs(worstTrade), grossLoss, 0) * 100 : 0;
  let maxConsecWinSum = 0;
  let maxConsecLossSum = 0;
  let runW = 0;
  let runL = 0;
  pnls.forEach((p) => {
    if (p > 0) {
      runW += p;
      runL = 0;
      if (runW > maxConsecWinSum) maxConsecWinSum = runW;
    } else if (p < 0) {
      runL += p;
      runW = 0;
      if (Math.abs(runL) > maxConsecLossSum) maxConsecLossSum = Math.abs(runL);
    } else {
      runW = 0;
      runL = 0;
    }
  });
  const lossUnitForR = avgLoss > 1e-9 ? avgLoss : lossCount > 0 ? grossLoss / lossCount : 0;
  const { sqn, expectancyR, rStd } = computeSqn(sorted, pnls, lossUnitForR || 1);
  const kellyOptimalFraction = payoffRatio > 1e-6 && winRate > 0 && winRate < 100 ? winRate / 100 - safeRatio(1 - winRate / 100, payoffRatio, 0) : 0;
  const pnlHistogram = buildPnlHistogram(pnls);
  const behaviorVolatilityScore = Math.min(100, Math.round(
    safeRatio(pnlStdDev, Math.abs(pnlMean) + 1, 0) * 18 + safeRatio(rStd, 1, 0) * 12 + Math.min(revengeStyleRate, 40)
  ));
  const riskScore = calcRiskScore({
    maxDrawdownPct,
    currentDrawdownPct,
    pctWithSL,
    maxLossStreak,
    marginLevel: account?.marginLevel,
    winRate
  });
  const insights = buildInsights({
    sampleSize: sorted.length,
    bySession,
    bySymbol,
    byDirection,
    byWeekday,
    winRate,
    profitFactor,
    maxDrawdownPct,
    pctWithSL,
    avgDurationMs,
    currentStreak,
    streakType,
    revengeStyleRate,
    topSymbolConcentrationPct: topSymShare,
    floatingPnl,
    accountBalance: liveBal,
    curveIsApproximation: true,
    openPositionsCount: openPositions.length,
    sqn,
    kellyOptimalFraction,
    calmarRatio,
    largestWinPctOfGross
  });
  const institutionalFp = institutionalInputFingerprint(sorted, pnls, startBalance);
  const tMonte0 = devPerf && typeof performance !== "undefined" ? performance.now() : 0;
  const syncMs = devPerf && typeof performance !== "undefined" ? tMonte0 - tAnalytics0 : 0;
  const monteCarlo = await runMonteCarloOffMainThread(pnls, startBalance, {
    cacheKey: institutionalFp
  });
  const tInst0 = devPerf && typeof performance !== "undefined" ? performance.now() : 0;
  const monteMs = devPerf && typeof performance !== "undefined" ? tInst0 - tMonte0 : 0;
  const institutional = buildInstitutionalMetrics({
    sorted,
    pnls,
    lossUnitForR: lossUnitForR || 1,
    startBalance,
    byMonth,
    drawdownCurve,
    revengeStyleRate,
    pctWithSL,
    behaviorVolatilityScore,
    sqn,
    expectancyR,
    payoffRatio,
    winRate,
    pnlStdDev,
    byHourUtc,
    monteCarloOverride: monteCarlo
  });
  if (devPerf && typeof performance !== "undefined") {
    const tDone = performance.now();
    const instMs = tDone - tInst0;
    const totalMs = tDone - tAnalytics0;
    auraAnalysisDevPerfSetLastAnalyticsStages({
      "analytics.path": "closedTrades",
      "analytics.sync": Math.round(syncMs * 10) / 10,
      "analytics.monteCarlo": Math.round(monteMs * 10) / 10,
      "analytics.institutional": Math.round(instMs * 10) / 10,
      "analytics.compute": Math.round(totalMs * 10) / 10
    });
  }
  return {
    totalTrades: sorted.length,
    openPositionsCount: openPositions.length,
    closedTradesCount: sorted.length,
    tradeRowsTotal: deduped.length,
    wins: winCount,
    losses: lossCount,
    breakeven: beCount,
    winRate,
    lossRate,
    totalPnl,
    realisedPnl,
    floatingPnl,
    grossProfit,
    grossLoss,
    profitFactor,
    payoffRatio,
    expectancy,
    avgWin,
    avgLoss,
    bestTrade,
    worstTrade,
    bestTradeFull,
    worstTradeFull,
    avgRR,
    equityCurve,
    drawdownCurve,
    maxDrawdown,
    maxDrawdownPct,
    currentDrawdown,
    currentDrawdownPct,
    startBalance,
    currentBalance: finalBal,
    bySymbol,
    bySession,
    byWeekday,
    byHourUtc,
    byDirection,
    byMonth,
    byDay,
    byWeek,
    currentStreak,
    streakType,
    maxWinStreak,
    maxLossStreak,
    avgDurationMs,
    medianDurationMs,
    avgWinDurationMs,
    avgLossDurationMs,
    pctWithSL,
    pctWithTP,
    pctNoSL,
    pctNoTP,
    avgTimeBetweenMs,
    avgTradesPerWeek,
    lotSizeCv,
    oversizedTradeCount,
    topSymbolConcentrationPct: topSymShare,
    revengeStyleRate,
    totalReturn,
    totalReturnPct,
    bestMonth,
    worstMonth,
    profitableMonths,
    riskScore,
    riskLabel: getRiskLabel(riskScore),
    insights,
    equityCurveMethod: "closed_trade_sequential",
    equityCurveIsApproximation: true,
    pnlStdDev,
    sharpeLike,
    sortinoLike,
    recoveryFactor,
    calmarRatio,
    cagrPct,
    periodYears,
    returnToMaxDrawdown,
    largestWinPctOfGross,
    largestLossPctOfGross,
    maxConsecWinSum,
    maxConsecLossSum,
    sqn,
    expectancyR,
    rStd,
    kellyOptimalFraction,
    pnlHistogram,
    behaviorVolatilityScore,
    institutionalInputFingerprint: institutionalFp,
    institutional
  };
}
var __analyticsResultCache = { key: "", value: (
  /** @type {any} */
  null
) };
var __analyticsInflight = /* @__PURE__ */ new Map();
function invalidateAuraAnalyticsCache() {
  __analyticsResultCache = { key: "", value: null };
  __analyticsInflight.clear();
}
async function computeAnalytics(trades = [], account = null) {
  const key = auraAnalysisClosedDataKey(trades, account);
  if (__analyticsResultCache.key === key && __analyticsResultCache.value) {
    if (isAuraAnalysisDevPerfEnabled()) {
      auraAnalysisDevPerfSetLastAnalyticsStages({
        "analytics.cacheHit": true,
        "analytics.compute": 0
      });
    }
    return __analyticsResultCache.value;
  }
  const existing = __analyticsInflight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const result = await computeAnalyticsImpl(trades, account);
      __analyticsResultCache = { key, value: result };
      return result;
    } finally {
      __analyticsInflight.delete(key);
    }
  })();
  __analyticsInflight.set(key, promise);
  return promise;
}
function calcRiskScore({ maxDrawdownPct, currentDrawdownPct, pctWithSL, maxLossStreak, marginLevel, winRate }) {
  let score = 0;
  score += maxDrawdownPct > 30 ? 28 : maxDrawdownPct > 20 ? 18 : maxDrawdownPct > 10 ? 10 : 3;
  score += currentDrawdownPct > 15 ? 18 : currentDrawdownPct > 8 ? 9 : 2;
  score += pctWithSL < 50 ? 24 : pctWithSL < 80 ? 12 : 0;
  score += maxLossStreak >= 6 ? 14 : maxLossStreak >= 4 ? 7 : 0;
  score += marginLevel != null && marginLevel < 150 ? 10 : marginLevel != null && marginLevel < 300 ? 5 : 0;
  score += winRate < 30 ? 6 : 0;
  return Math.min(100, Math.max(0, score));
}
function getRiskLabel(score) {
  if (score < 25) return "Controlled";
  if (score < 50) return "Moderate";
  if (score < 75) return "Aggressive";
  return "Dangerous";
}
function buildInsights({
  sampleSize = 0,
  bySession,
  bySymbol,
  byDirection,
  byWeekday,
  winRate,
  profitFactor,
  maxDrawdownPct,
  pctWithSL,
  avgDurationMs,
  currentStreak,
  streakType,
  revengeStyleRate = 0,
  topSymbolConcentrationPct = 0,
  floatingPnl = null,
  accountBalance = null,
  curveIsApproximation = false,
  openPositionsCount = 0,
  sqn = 0,
  kellyOptimalFraction = 0,
  calmarRatio = 0,
  largestWinPctOfGross = 0
}) {
  const out = [];
  const fmt$ = (v) => "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct2 = (v) => Number(v).toFixed(1) + "%";
  const pf = finiteNum2(profitFactor);
  if (curveIsApproximation && sampleSize > 0) {
    out.push("Equity and drawdown here follow closed-trade P/L in order \u2014 not tick-level broker equity.");
  }
  if (openPositionsCount > 0 && sampleSize > 0) {
    out.push(`${openPositionsCount} open position(s) in the list \u2014 win rate and profit factor use closed trades only; live floating P/L is from account equity vs balance.`);
  }
  if (sampleSize > 0 && sampleSize < 8) {
    out.push("Limited trade sample in this period \u2014 insights get more reliable as more closed trades are included.");
  }
  if (floatingPnl != null && accountBalance != null && Number.isFinite(floatingPnl) && Number.isFinite(accountBalance) && Math.abs(accountBalance) > 1e-6) {
    const ratio = Math.abs(floatingPnl / accountBalance);
    if (ratio >= 0.02) {
      out.push(`Open exposure is meaningful \u2014 floating P/L is roughly ${fmtPct2(ratio * 100)} of balance, so live risk can differ from closed-trade analytics alone.`);
    }
  }
  if (bySession.length > 0 && bySession[0].pnl > 0)
    out.push(`${bySession[0].session} is your strongest session \u2014 ${fmt$(bySession[0].pnl)} total with ${fmtPct2(bySession[0].winRate)} win rate.`);
  const worstSess = [...bySession].sort((a, b) => a.pnl - b.pnl)[0];
  if (worstSess && worstSess.pnl < 0)
    out.push(`${worstSess.session} session is dragging results \u2014 consider reducing activity here.`);
  if (bySymbol.length > 0 && bySymbol[0].pnl > 0)
    out.push(`${bySymbol[0].pair} is your top instrument \u2014 ${fmtPct2(bySymbol[0].winRate)} win rate.`);
  const worstSym = [...bySymbol].sort((a, b) => a.pnl - b.pnl)[0];
  if (worstSym && worstSym.pnl < 0)
    out.push(`${worstSym.pair} has cost ${fmt$(Math.abs(worstSym.pnl))} \u2014 review your edge on this pair.`);
  const activeDays = byWeekday.filter((w) => w.trades > 0);
  const bestDay = [...activeDays].sort((a, b) => b.pnl - a.pnl)[0];
  const worstDay = [...activeDays].sort((a, b) => a.pnl - b.pnl)[0];
  if (bestDay && bestDay.pnl > 0)
    out.push(`${bestDay.day} is your most profitable trading day.`);
  if (worstDay && worstDay.pnl < 0 && worstDay.day !== bestDay?.day)
    out.push(`${worstDay.day} consistently underperforms \u2014 review setups for that day.`);
  if (byDirection.buy.trades > 2 && byDirection.sell.trades > 2) {
    const diff = Math.abs(byDirection.buy.winRate - byDirection.sell.winRate);
    if (diff >= 10) {
      const better = byDirection.buy.winRate > byDirection.sell.winRate ? "Long" : "Short";
      const betterWR = Math.max(byDirection.buy.winRate, byDirection.sell.winRate);
      out.push(`${better} trades significantly outperform \u2014 ${fmtPct2(betterWR)} win rate.`);
    }
  }
  if (pf > 2) out.push(`Profit factor of ${pf.toFixed(2)} \u2014 your edge is working well.`);
  else if (pf < 1 && pf > 0) out.push("Profit factor below 1.0 \u2014 losses outweigh wins. Focus on quality.");
  if (maxDrawdownPct > 20) out.push(`Max drawdown of ${fmtPct2(maxDrawdownPct)} detected \u2014 review risk management.`);
  if (pctWithSL < 70) out.push(`${fmtPct2(100 - pctWithSL)} of trades entered without a stop loss \u2014 key risk area.`);
  if (streakType === "win" && currentStreak >= 3) out.push(`Currently on a ${currentStreak}-trade win streak \u2014 great execution.`);
  if (streakType === "loss" && currentStreak >= 3) out.push(`${currentStreak} consecutive losses \u2014 consider a session break.`);
  if (topSymbolConcentrationPct >= 55 && bySymbol.length) {
    out.push(`${fmtPct2(topSymbolConcentrationPct)} of trades are in one symbol \u2014 watch concentration risk.`);
  }
  if (revengeStyleRate >= 25 && sampleSize >= 10) {
    out.push("Several entries follow losses within minutes \u2014 watch for emotional re-entry patterns.");
  }
  if (avgDurationMs > 0 && avgDurationMs < 12e4 && sampleSize >= 15) {
    out.push("Very short average hold times \u2014 ensure you are not over-scalping without a defined edge.");
  }
  if (sampleSize >= 30 && sqn >= 3) {
    out.push(`System quality (SQN-style) reads strong at ${sqn.toFixed(2)} on ${sampleSize} trades \u2014 edge is statistically structured.`);
  } else if (sampleSize >= 15 && sqn < 0.5 && sqn !== 0) {
    out.push("Low R-multiple consistency (SQN) \u2014 average outcome per unit risk is noisy; refine execution or sample size.");
  }
  if (kellyOptimalFraction > 0.25 && sampleSize >= 20) {
    out.push(`Full Kelly sizing would imply ~${(kellyOptimalFraction * 100).toFixed(0)}% of capital per trade \u2014 professionals typically use a fraction (e.g. \xBC Kelly) to survive variance.`);
  }
  if (calmarRatio > 3 && maxDrawdownPct > 3) {
    out.push(`Return vs max drawdown (Calmar-style) is favourable (${calmarRatio.toFixed(2)}) \u2014 growth has been efficient relative to worst peak-to-trough.`);
  }
  if (largestWinPctOfGross > 45) {
    out.push("A large share of gross profit comes from one winner \u2014 results may be less robust if that setup disappears.");
  }
  return out.slice(0, 10);
}
function fmtDuration(ms) {
  if (!ms || ms <= 0) return "\u2014";
  const s = Math.floor(ms / 1e3);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
function fmtPnl(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v >= 0 ? `+$${abs}` : `-$${abs}`;
}
function fmtNum(n, decimals = 2) {
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtPct(n, decimals = 1) {
  return Number(n).toFixed(decimals) + "%";
}
function fmtCurrency(n, currency = "USD") {
  if (n == null) return "\u2014";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(n));
}
function analyticsOpenPositionsOnly(account, openPositions, allRows) {
  const base = emptyAnalytics(account);
  const liveBal = account?.balance != null ? finiteNum2(account.balance) : null;
  const liveEq = account?.equity != null ? finiteNum2(account.equity) : null;
  const floatingPnl = liveEq != null && liveBal != null ? liveEq - liveBal : base.floatingPnl;
  return {
    ...base,
    floatingPnl: floatingPnl ?? base.floatingPnl,
    openPositionsCount: openPositions.length,
    closedTradesCount: 0,
    tradeRowsTotal: allRows.length,
    equityCurveMethod: "none_no_closed_trades",
    equityCurveIsApproximation: false,
    insights: [
      "No closed trades in this date range \u2014 win rate, profit factor, and equity curve need closed deal history. Open rows may still appear in your trade list.",
      ...floatingPnl != null && Math.abs(floatingPnl) > 1e-6 ? ["Account banner balance vs equity reflects live floating P/L until closed deals are in range."] : []
    ],
    institutionalInputFingerprint: ""
  };
}
function emptyAnalytics(account) {
  const emptyDir = { trades: 0, pnl: 0, wins: 0, losses: 0, winRate: 0, pf: 0 };
  const bal = account?.balance != null ? finiteNum2(account.balance) : NaN;
  const eq = account?.equity != null ? finiteNum2(account.equity) : NaN;
  const floating = Number.isFinite(eq) && Number.isFinite(bal) ? eq - bal : null;
  return {
    totalTrades: 0,
    openPositionsCount: 0,
    closedTradesCount: 0,
    tradeRowsTotal: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    winRate: 0,
    lossRate: 0,
    totalPnl: 0,
    realisedPnl: 0,
    floatingPnl: floating,
    grossProfit: 0,
    grossLoss: 0,
    profitFactor: 0,
    payoffRatio: 0,
    expectancy: 0,
    avgWin: 0,
    avgLoss: 0,
    bestTrade: 0,
    worstTrade: 0,
    bestTradeFull: null,
    worstTradeFull: null,
    avgRR: 0,
    equityCurve: [],
    drawdownCurve: [],
    maxDrawdown: 0,
    maxDrawdownPct: 0,
    currentDrawdown: 0,
    currentDrawdownPct: 0,
    startBalance: account?.balance ?? 0,
    currentBalance: account?.balance ?? 0,
    bySymbol: [],
    bySession: [],
    byWeekday: Array(7).fill(null).map((_, i) => ({ day: WEEKDAY_NAMES[i], dayIndex: i, pnl: 0, trades: 0, wins: 0, winRate: 0 })),
    byHourUtc: Array.from({ length: 24 }, (_, hour) => ({ hour, pnl: 0, trades: 0, wins: 0, winRate: 0 })),
    byDirection: { buy: emptyDir, sell: emptyDir },
    byMonth: [],
    byDay: {},
    byWeek: [],
    currentStreak: 0,
    streakType: "none",
    maxWinStreak: 0,
    maxLossStreak: 0,
    avgDurationMs: 0,
    medianDurationMs: 0,
    avgWinDurationMs: 0,
    avgLossDurationMs: 0,
    pctWithSL: 0,
    pctWithTP: 0,
    pctNoSL: 0,
    pctNoTP: 0,
    avgTimeBetweenMs: 0,
    avgTradesPerWeek: 0,
    lotSizeCv: 0,
    oversizedTradeCount: 0,
    topSymbolConcentrationPct: 0,
    revengeStyleRate: 0,
    totalReturn: 0,
    totalReturnPct: 0,
    bestMonth: null,
    worstMonth: null,
    profitableMonths: 0,
    riskScore: 0,
    riskLabel: "Controlled",
    insights: [],
    equityCurveMethod: "none",
    equityCurveIsApproximation: false,
    pnlStdDev: 0,
    sharpeLike: 0,
    sortinoLike: 0,
    recoveryFactor: 0,
    calmarRatio: 0,
    cagrPct: 0,
    periodYears: 0,
    returnToMaxDrawdown: 0,
    largestWinPctOfGross: 0,
    largestLossPctOfGross: 0,
    maxConsecWinSum: 0,
    maxConsecLossSum: 0,
    sqn: 0,
    expectancyR: 0,
    rStd: 0,
    kellyOptimalFraction: 0,
    pnlHistogram: [],
    behaviorVolatilityScore: 0,
    institutionalInputFingerprint: "",
    institutional: emptyInstitutionalMetrics()
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  auraAnalysisClosedDataKey,
  computeAnalytics,
  detectSession,
  emptyAnalytics,
  fmtCurrency,
  fmtDuration,
  fmtNum,
  fmtPct,
  fmtPnl,
  invalidateAuraAnalyticsCache
});
