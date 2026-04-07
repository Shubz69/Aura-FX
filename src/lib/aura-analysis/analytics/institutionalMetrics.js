/**
 * Institutional analytics layer — pure functions, O(n) / O(n + runs * pathLen).
 * Consumed only by computeAnalytics; no React.
 */

import { monteCarloRiskFixed, MC_DEFAULT_RUNS } from './monteCarloRisk';

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

/** Sample skewness (adjusted) */
function sampleSkewness(arr) {
  const n = arr.length;
  if (n < 3) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const m2 = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (m2 < 1e-18) return 0;
  const m3 = arr.reduce((s, v) => s + (v - mean) ** 3, 0) / n;
  return m3 / m2 ** 1.5;
}

/** Excess kurtosis (Fisher) */
function sampleExcessKurtosis(arr) {
  const n = arr.length;
  if (n < 4) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / n;
  const m2 = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (m2 < 1e-18) return 0;
  const m4 = arr.reduce((s, v) => s + (v - mean) ** 4, 0) / n;
  return m4 / (m2 * m2) - 3;
}

function quantileSorted(sortedAsc, q) {
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

/** Legacy / alias excursion read (account-currency scalars). */
function readMfeMaeUsd(t) {
  const mfe =
    t.mfeUsd ??
    t.maxFavorableExcursionUsd ??
    (t.mfe != null && Number.isFinite(Number(t.mfe)) ? Number(t.mfe) : null);
  const mae =
    t.maeUsd ??
    t.maxAdverseExcursionUsd ??
    (t.mae != null && Number.isFinite(Number(t.mae)) ? Number(t.mae) : null);
  return {
    mfe: mfe != null && Number.isFinite(mfe) ? Math.abs(mfe) : null,
    mae: mae != null && Number.isFinite(mae) ? Math.abs(mae) : null,
  };
}

/**
 * Effective favorable/adverse excursion in account currency when inferable.
 * Uses mfeUsd/maeUsd, optional R-normalized fields × loss unit, then legacy aliases.
 */
function effectiveExcursionUsd(t, lossUnitForR) {
  const lu = lossUnitForR > 1e-9 ? lossUnitForR : null;
  let mfe =
    t.mfeUsd != null && Number.isFinite(Number(t.mfeUsd)) ? Math.abs(Number(t.mfeUsd)) : null;
  let mae =
    t.maeUsd != null && Number.isFinite(Number(t.maeUsd)) ? Math.abs(Number(t.maeUsd)) : null;
  const mfeR = Number.isFinite(Number(t.mfeR)) ? Number(t.mfeR) : null;
  const maeR = Number.isFinite(Number(t.maeR)) ? Number(t.maeR) : null;
  if (mfe == null && mfeR != null && lu != null) mfe = Math.abs(mfeR) * lu;
  if (mae == null && maeR != null && lu != null) mae = Math.abs(maeR) * lu;
  if (mfe == null || mae == null) {
    const leg = readMfeMaeUsd(t);
    if (mfe == null) mfe = leg.mfe;
    if (mae == null) mae = leg.mae;
  }
  const hasPath = (mfe != null && mfe > 1e-9) || (mae != null && mae > 1e-9);
  return { mfeUsd: mfe, maeUsd: mae, mfeR, maeR, hasPath };
}

/**
 * Path-based execution row; values null when excursion not comparable to PnL.
 */
function executionPathMetrics(t, pnl, lossUnitForR, excursion = null) {
  const { mfeUsd: M, maeUsd: A, mfeR, maeR, hasPath } =
    excursion != null ? excursion : effectiveExcursionUsd(t, lossUnitForR);
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
    missedProfitPct = Math.min(500, (100 * Math.max(0, M - pnl)) / M);
  }

  let avoidableDrawdownPct = null;
  if (pnl < 0 && A != null && A > eps) {
    avoidableDrawdownPct = Math.min(100, (100 * Math.max(0, A - Math.abs(pnl))) / A);
  } else if (pnl > 0 && M != null && M > eps && A != null && A > eps) {
    avoidableDrawdownPct = Math.min(200, (100 * A) / Math.max(M, eps));
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
    maeR,
  };
}

function executionPriceEfficiency(t, pnl) {
  const entry = finiteNum(t.entryPrice);
  const close = finiteNum(t.closePrice);
  const sl = finiteNum(t.sl ?? t.stopLoss);
  const tp = finiteNum(t.tp ?? t.takeProfit);
  const dir = String(t.direction || '').toLowerCase();
  if (!entry || !close || !dir) {
    return { exitEff: null, entryEff: null, missedProfitPct: null };
  }
  let risk = 0;
  let reward = 0;
  if (dir === 'buy') {
    if (sl > 0) risk = entry - sl;
    if (tp > 0) reward = tp - entry;
  } else if (dir === 'sell') {
    if (sl > 0) risk = sl - entry;
    if (tp > 0) reward = entry - tp;
  }
  if (risk <= 1e-9 || reward <= 1e-9) {
    return { exitEff: null, entryEff: null, missedProfitPct: null };
  }
  const move = dir === 'buy' ? close - entry : entry - close;
  const exitEff = Math.max(0, Math.min(1, move / reward));
  const adverseProxy =
    pnl < 0
      ? Math.min(1, Math.abs(move) / risk)
      : Math.max(0, (risk - Math.max(0, move)) / risk) * 0.35;
  const entryEff = Math.max(0, Math.min(1, 1 - adverseProxy));
  let missedProfitPct = null;
  if (pnl > 0 && tp) {
    if (dir === 'buy' && close < tp && tp > entry) {
      missedProfitPct = ((tp - close) / (tp - entry)) * 100;
    } else if (dir === 'sell' && close > tp && tp < entry) {
      missedProfitPct = ((close - tp) / (entry - tp)) * 100;
    } else {
      missedProfitPct = 0;
    }
    missedProfitPct = Math.min(200, missedProfitPct);
  }
  return { exitEff: exitEff, entryEff, missedProfitPct };
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
    count: 0,
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

function rollingExpectancy(pnls, window) {
  const out = [];
  if (!pnls.length || window < 2) return out;
  for (let i = window - 1; i < pnls.length; i++) {
    const slice = pnls.slice(i - window + 1, i + 1);
    const mean = slice.reduce((s, v) => s + v, 0) / slice.length;
    out.push({ endIdx: i, window, expectancy: mean });
  }
  return out;
}

function edgeStabilityFromRolling(series) {
  if (!series.length) return 0;
  const vals = series.map((s) => s.expectancy);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const varI =
    vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, vals.length);
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
  const q = quantileSorted(s, alpha);
  const tail = s.filter((v) => v <= q);
  const cvar = tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : q;
  return { var95: q, cvar95: cvar, alpha };
}

/** Binary outcome approximation: negative or zero edge ⇒ ruin approaches certainty over many bets. */
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
    if (Number.isFinite(ta) && Number.isFinite(tb) && tb - ta <= 5 * 60 * 1000) {
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
  const grid = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ pnl: 0, trades: 0 }))
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
  return { grid, labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
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
  winRate,
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
        edgeStabilityScore * 0.35 +
          Math.min(100, sqn * 18) +
          (expectancyR > 0 ? 15 : 0) +
          (ruinProbApprox != null ? (1 - ruinProbApprox) * 25 : 12)
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
    emotionalStability: Math.round(emot),
  };
}

/**
 * @param {object} params
 */
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
    overstayedElig: 0,
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
    prematureExitRate:
      a.eligiblePrematureWins > 0 ? (a.prematureWins / a.eligiblePrematureWins) * 100 : null,
    overstayedTradeRate: a.overstayedElig > 0 ? (a.overstayed / a.overstayedElig) * 100 : null,
  };
}

export function buildInstitutionalMetrics(params) {
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
    monteCarloOverride,
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

  const mc =
    monteCarloOverride != null
      ? monteCarloOverride
      : monteCarloRiskFixed(pnls, startBalance, MC_DEFAULT_RUNS);
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

  const segSym = new Map();
  const segSes = new Map();
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

      const sk = t.pair || t.symbol || '—';
      const ss = t.session || 'Unknown';
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

  const mean = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
  const preferPathMean = (pathArr, proxyArr) => {
    if (pathArr.length > 0) return mean(pathArr);
    if (proxyArr.length > 0) return mean(proxyArr);
    return null;
  };

  const entryEfficiencyAvg = preferPathMean(pathEntry, entryEffs);
  const exitEfficiencyAvg = preferPathMean(pathExit, exitEffs);
  const missedProfitPctAvg = preferPathMean(pathMissed, missed);

  const hasPathSamples =
    pathEntry.length + pathExit.length + pathMissed.length + pathAvoid.length > 0;
  const hasProxySamples = entryEffs.length + exitEffs.length + missed.length > 0;
  let executionBasis = null;
  if (hasPathSamples && hasProxySamples) executionBasis = 'mixed';
  else if (hasPathSamples) executionBasis = 'path';
  else if (hasProxySamples) executionBasis = 'price_geometry';

  const avoidableDrawdownPctAvg = pathAvoid.length ? mean(pathAvoid) : null;
  const prematureExitRatePath =
    pathPrematureEligible > 0 ? (pathPrematureCount / pathPrematureEligible) * 100 : null;
  const prematureExitRateProxy = winsWithTp > 0 ? (premature / winsWithTp) * 100 : null;
  const prematureExitRate =
    prematureExitRatePath != null ? prematureExitRatePath : prematureExitRateProxy;
  const overstayedTradeRate =
    pathOverstayedElig > 0 ? (pathOverstayed / pathOverstayedElig) * 100 : null;
  const rrCaptureRatioAvg = pathRrRatio.length ? mean(pathRrRatio) : null;
  const realizedRRAvg = realizedRRs.length ? mean(realizedRRs) : null;
  const availableRRAvg = availableRRs.length ? mean(availableRRs) : null;

  const executionBySymbol = Array.from(segSym.entries())
    .map(([k, v]) => finalizeExecutionSeg(k, v))
    .sort((a, b) => b.pathTrades - a.pathTrades);
  const executionBySession = Array.from(segSes.entries())
    .map(([k, v]) => finalizeExecutionSeg(k, v))
    .sort((a, b) => b.pathTrades - a.pathTrades);
  const sessionVol = (params.byHourUtc || []).map((h) => Math.abs(h.pnl));
  const volMean = mean(sessionVol);
  const sessionVolStd =
    sessionVol.length > 1
      ? Math.sqrt(sessionVol.reduce((s, v) => s + (v - volMean) ** 2, 0) / sessionVol.length)
      : 0;

  const monthlyPnls = (byMonth || []).map((m) => m.pnl);
  const maxDrawdownPct =
    drawdownCurve && drawdownCurve.length
      ? Math.max(...drawdownCurve.map((p) => p.ddPct || 0), 0)
      : 0;

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
    winRate,
  });

  const pnlDensityCurve = buildPnlDensityPoints(pnls);

  return {
    institutionalVersion: 2,
    expectancyBySegment: {
      note: 'Per-symbol/session expectancy equals avg P/L per trade in segment (see bySymbol.expectancy).',
    },
    rollingExpectancy: {
      window: rollingWindow,
      series: rollingSeries,
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
      executionBySession,
    },
    riskEngine: {
      historicalVaR95: var95,
      historicalCVaR95: cvar95,
      monteCarlo: mc,
      riskOfRuinParametric: {
        prob: Number.isFinite(ror.prob) ? ror.prob : null,
        edgePerTrade: ror.edge,
        assumptions: 'Simplified two-outcome ruin bound; use monteCarlo for bootstrap path risk.',
      },
      drawdownDistribution: mc.drawdownHistogram,
    },
    distribution: {
      skewness,
      excessKurtosis,
      pnlQuantiles: {
        p1: quantileSorted(pnSorted, 0.01),
        p5: quantileSorted(pnSorted, 0.05),
        p50: quantileSorted(pnSorted, 0.5),
        p95: quantileSorted(pnSorted, 0.95),
        p99: quantileSorted(pnSorted, 0.99),
      },
      pnlDensityCurve,
    },
    marketContext: {
      performanceVsVolatility: {
        tradePnlStd: params.pnlStdDev ?? 0,
        regimeNote: 'Pair-level realized vol API pending — structure reserved.',
      },
      performanceVsSessionVolatility: {
        hourPnlDispersion: sessionVolStd,
        hourPnlMeanAbs: volMean,
      },
      newsEventTagging: {
        enabled: false,
        schemaVersion: 1,
        events: [],
      },
    },
    behavioural: {
      mistakeCost: mistakes,
      mistakeClustering: mistakeClusters,
      weekdayHourBehaviour: bhour,
    },
    signature: signatures,
    scatterTradePnL: sorted.map((t, i) => {
      const ex = effectiveExcursionUsd(t, lossUnitForR || 1);
      return {
        i,
        pnl: pnls[i],
        r: deriveRMultiple(t, pnls[i], lossUnitForR || 1),
        pair: t.pair || t.symbol || '—',
        mfeUsd: ex.mfeUsd,
        maeUsd: ex.maeUsd,
      };
    }),
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
    y: 0,
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

export function emptyInstitutionalMetrics() {
  return {
    institutionalVersion: 2,
    expectancyBySegment: { note: '' },
    rollingExpectancy: { window: 0, series: [] },
    edgeStabilityScore: 0,
    edgeDecay: {
      decayRatio: null,
      firstHalfExpectancy: 0,
      secondHalfExpectancy: 0,
      decayFlag: false,
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
      executionBySession: [],
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
        drawdownHistogram: [],
      },
      riskOfRuinParametric: { prob: null, edgePerTrade: 0, assumptions: '' },
      drawdownDistribution: [],
    },
    distribution: {
      skewness: 0,
      excessKurtosis: 0,
      pnlQuantiles: {
        p1: 0,
        p5: 0,
        p50: 0,
        p95: 0,
        p99: 0,
      },
      pnlDensityCurve: [],
    },
    marketContext: {
      performanceVsVolatility: { tradePnlStd: 0, regimeNote: '' },
      performanceVsSessionVolatility: { hourPnlDispersion: 0, hourPnlMeanAbs: 0 },
      newsEventTagging: { enabled: false, schemaVersion: 1, events: [] },
    },
    behavioural: {
      mistakeCost: {
        noSlLossSum: 0,
        revengeFollowLossSum: 0,
        totalMistakeCost: 0,
      },
      mistakeClustering: { lossBurstClusters: 0, thresholdTrades: 3 },
      weekdayHourBehaviour: {
        grid: Array.from({ length: 7 }, () =>
          Array.from({ length: 24 }, () => ({ pnl: 0, trades: 0 }))
        ),
        labels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      },
    },
    signature: {
      auraxComposite: 0,
      edgeConfidenceScore: 0,
      consistencyScore: 0,
      adaptabilityScore: 0,
      riskQuality: 0,
      edgeQuality: 0,
      emotionalStability: 0,
    },
    scatterTradePnL: [],
  };
}
