/**
 * Backtesting analytics from stored trades — deterministic, defensive math.
 */

const EPS = 1e-8;

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function classifyResult(pnl) {
  const p = num(pnl);
  if (p > EPS) return 'win';
  if (p < -EPS) return 'loss';
  return 'breakeven';
}

function meanStd(arr) {
  const n = arr.length;
  if (n === 0) return { mean: 0, std: 0 };
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  if (n === 1) return { mean, std: 0 };
  let v = 0;
  for (const x of arr) v += (x - mean) ** 2;
  const std = Math.sqrt(v / (n - 1));
  return { mean, std };
}

/** Max drawdown from equity points [{ t, equity }] sorted by t */
function maxDrawdownFromEquity(points) {
  if (!points.length) return 0;
  let peak = points[0].equity;
  let maxDd = 0;
  for (const { equity } of points) {
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

function buildEquityCurve(trades, initialBalance) {
  const ib = num(initialBalance, 0);
  const sorted = [...trades].sort((a, b) => {
    const ta = a.closeTime ? new Date(a.closeTime).getTime() : 0;
    const tb = b.closeTime ? new Date(b.closeTime).getTime() : 0;
    return ta - tb;
  });
  const points = [];
  let eq = ib;
  points.push({ t: 0, equity: eq, tradeId: null });
  for (const tr of sorted) {
    eq += num(tr.pnlAmount);
    const t = tr.closeTime ? new Date(tr.closeTime).getTime() : Date.now();
    points.push({ t, equity: eq, tradeId: tr.id });
  }
  return { points, finalEquity: eq };
}

function consecutiveStreaks(resultsOrdered) {
  let maxW = 0;
  let maxL = 0;
  let cw = 0;
  let cl = 0;
  for (const r of resultsOrdered) {
    if (r === 'win') {
      cw += 1;
      cl = 0;
      if (cw > maxW) maxW = cw;
    } else if (r === 'loss') {
      cl += 1;
      cw = 0;
      if (cl > maxL) maxL = cl;
    } else {
      cw = 0;
      cl = 0;
    }
  }
  return { maxWinStreak: maxW, maxLoseStreak: maxL };
}

/** Pearson correlation between pairs of [x,y], both numeric */
function pearson(pairs) {
  const n = pairs.length;
  if (n < 2) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pairs) {
    sx += x;
    sy += y;
  }
  const mx = sx / n;
  const my = sy / n;
  let nume = 0;
  let dx = 0;
  let dy = 0;
  for (const [x, y] of pairs) {
    const vx = x - mx;
    const vy = y - my;
    nume += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  if (den < EPS) return null;
  return nume / den;
}

/**
 * Aggregate metrics from trade rows (already mapped to plain objects with pnlAmount, rMultiple, etc.)
 */
function aggregateTrades(trades, initialBalance = 0) {
  const pnls = trades.map((t) => num(t.pnlAmount));
  const rs = trades.map((t) => (t.rMultiple != null ? num(t.rMultiple) : null)).filter((x) => x != null && Number.isFinite(x));
  const wins = pnls.filter((p) => p > EPS);
  const losses = pnls.filter((p) => p < -EPS);
  const flat = pnls.filter((p) => Math.abs(p) <= EPS);

  const n = trades.length;
  const winN = wins.length;
  const lossN = losses.length;
  const beN = flat.length;

  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLossAbs = losses.reduce((a, b) => a + Math.abs(b), 0);
  const net = pnls.reduce((a, b) => a + b, 0);

  const winRate = n > 0 ? winN / n : null;
  const lossRate = n > 0 ? lossN / n : null;
  const beRate = n > 0 ? beN / n : null;

  const profitFactor = grossLossAbs > EPS ? grossProfit / grossLossAbs : grossProfit > EPS ? null : null;

  const avgWin = winN > 0 ? grossProfit / winN : null;
  const avgLoss = lossN > 0 ? -grossLossAbs / lossN : null;

  const expectancy = n > 0 ? net / n : null;

  const { mean: avgR, std: stdR } = meanStd(rs.length ? rs : [0]);

  const { points: eqPoints } = buildEquityCurve(trades, initialBalance);
  const maxDrawdown = maxDrawdownFromEquity(eqPoints);

  const resultsOrder = trades
    .slice()
    .sort((a, b) => {
      const ta = a.closeTime ? new Date(a.closeTime).getTime() : 0;
      const tb = b.closeTime ? new Date(b.closeTime).getTime() : 0;
      return ta - tb;
    })
    .map((t) => classifyResult(t.pnlAmount));
  const streaks = consecutiveStreaks(resultsOrder);

  const largestWin = wins.length ? Math.max(...wins) : null;
  const largestLoss = losses.length ? Math.min(...losses) : null;

  /** Z-test for mean R = 0: z = mean / (std/sqrt(n)) */
  let meanRZTest = null;
  if (rs.length >= 30 && stdR > EPS) {
    meanRZTest = avgR / (stdR / Math.sqrt(rs.length));
  }

  /** Sharpe-like on R multiples */
  let sharpeLikeR = null;
  if (rs.length >= 2 && stdR > EPS) {
    sharpeLikeR = (avgR / stdR) * Math.sqrt(rs.length);
  }

  return {
    tradeCount: n,
    winCount: winN,
    lossCount: lossN,
    breakevenCount: beN,
    winRate,
    lossRate,
    breakevenRate: beRate,
    grossProfit,
    grossLoss: -grossLossAbs,
    grossLossAbs,
    netPnl: net,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    avgR: rs.length ? avgR : null,
    medianR: null,
    stdR: rs.length > 1 ? stdR : null,
    largestWin,
    largestLoss,
    maxDrawdown,
    maxWinStreak: streaks.maxWinStreak,
    maxLoseStreak: streaks.maxLoseStreak,
    meanRZTest,
    sharpeLikeR,
    equityPoints: eqPoints,
  };
}

function bucketDuration(seconds) {
  const s = num(seconds);
  if (s <= 0) return 'unknown';
  if (s < 300) return 'under_5m';
  if (s < 3600) return 'under_1h';
  if (s < 86400) return 'under_1d';
  return 'over_1d';
}

function groupSum(trades, keyFn) {
  const map = new Map();
  for (const t of trades) {
    const k = keyFn(t) || '—';
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(t);
  }
  return map;
}

function breakdownMetrics(trades, initialBalance) {
  const byInstrument = {};
  for (const [k, grp] of groupSum(trades, (t) => t.instrument)) {
    byInstrument[k] = aggregateTrades(grp, initialBalance);
  }
  const bySession = {};
  for (const [k, grp] of groupSum(trades, (t) => t.sessionLabel)) {
    bySession[k] = aggregateTrades(grp, initialBalance);
  }
  const byTimeframe = {};
  for (const [k, grp] of groupSum(trades, (t) => t.timeframe)) {
    byTimeframe[k] = aggregateTrades(grp, initialBalance);
  }
  const byPlaybook = {};
  for (const [k, grp] of groupSum(trades, (t) => t.playbookName || t.playbookId || '—')) {
    byPlaybook[k] = aggregateTrades(grp, initialBalance);
  }
  const bySetup = {};
  for (const [k, grp] of groupSum(trades, (t) => t.setupName || '—')) {
    bySetup[k] = aggregateTrades(grp, initialBalance);
  }
  const byDirection = {};
  for (const [k, grp] of groupSum(trades, (t) => String(t.direction || '').toLowerCase())) {
    byDirection[k] = aggregateTrades(grp, initialBalance);
  }
  const byResult = {};
  for (const [k, grp] of groupSum(trades, (t) => t.resultType)) {
    byResult[k] = aggregateTrades(grp, initialBalance);
  }

  const byDow = {};
  for (const t of trades) {
    let dow = '—';
    if (t.closeTime) {
      const d = new Date(t.closeTime);
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      dow = names[d.getDay()] || '—';
    }
    if (!byDow[dow]) byDow[dow] = [];
    byDow[dow].push(t);
  }
  const byDayOfWeek = {};
  for (const k of Object.keys(byDow)) {
    byDayOfWeek[k] = aggregateTrades(byDow[k], initialBalance);
  }

  const byHour = {};
  for (const t of trades) {
    let h = '—';
    if (t.closeTime) {
      h = String(new Date(t.closeTime).getHours()).padStart(2, '0') + ':00';
    }
    if (!byHour[h]) byHour[h] = [];
    byHour[h].push(t);
  }
  const byHourOfDay = {};
  for (const k of Object.keys(byHour)) {
    byHourOfDay[k] = aggregateTrades(byHour[k], initialBalance);
  }

  const byDur = {};
  for (const t of trades) {
    const b = bucketDuration(t.durationSeconds);
    if (!byDur[b]) byDur[b] = [];
    byDur[b].push(t);
  }
  const byDurationBucket = {};
  for (const k of Object.keys(byDur)) {
    byDurationBucket[k] = aggregateTrades(byDur[k], initialBalance);
  }

  const byMarketCondition = {};
  for (const [k, grp] of groupSum(trades, (t) => t.marketCondition || '—')) {
    byMarketCondition[k] = aggregateTrades(grp, initialBalance);
  }

  const byQuality = {};
  for (const [k, grp] of groupSum(trades, (t) => t.qualityGrade || '—')) {
    byQuality[k] = aggregateTrades(grp, initialBalance);
  }

  /** Tag combinations: single tags + pairs (limited) */
  const tagStats = new Map();
  for (const t of trades) {
    const tags = parseJsonArray(t.tagsJson ?? t.tags);
    const clean = tags.map((x) => String(x).trim()).filter(Boolean);
    for (const tag of clean) {
      if (!tagStats.has(tag)) tagStats.set(tag, []);
      tagStats.get(tag).push(t);
    }
    for (let i = 0; i < clean.length; i++) {
      for (let j = i + 1; j < clean.length; j++) {
        const pair = `${clean[i]} + ${clean[j]}`;
        if (!tagStats.has(pair)) tagStats.set(pair, []);
        tagStats.get(pair).push(t);
      }
    }
  }
  const byTag = {};
  for (const [k, grp] of tagStats) {
    if (grp.length >= 2) byTag[k] = aggregateTrades(grp, initialBalance);
  }

  /** Confidence buckets 1-3 low, 4-6 mid, 7-10 high */
  const byConfidenceBucket = {};
  for (const t of trades) {
    const c = t.confidenceScore != null ? num(t.confidenceScore) : null;
    let b = '—';
    if (c != null && c >= 1 && c <= 10) {
      if (c <= 3) b = 'low_1_3';
      else if (c <= 6) b = 'mid_4_6';
      else b = 'high_7_10';
    }
    if (!byConfidenceBucket[b]) byConfidenceBucket[b] = [];
    byConfidenceBucket[b].push(t);
  }
  const confAgg = {};
  for (const k of Object.keys(byConfidenceBucket)) {
    confAgg[k] = aggregateTrades(byConfidenceBucket[k], initialBalance);
  }

  /** Checklist score buckets */
  const byChecklistBucket = {};
  for (const t of trades) {
    const s = t.checklistScore != null ? num(t.checklistScore) : null;
    let b = '—';
    if (s != null) {
      if (s < 40) b = 'under_40';
      else if (s < 70) b = '40_70';
      else b = '70_plus';
    }
    if (!byChecklistBucket[b]) byChecklistBucket[b] = [];
    byChecklistBucket[b].push(t);
  }
  const checkAgg = {};
  for (const k of Object.keys(byChecklistBucket)) {
    checkAgg[k] = aggregateTrades(byChecklistBucket[k], initialBalance);
  }

  const confPairs = trades
    .filter((t) => t.confidenceScore != null && t.pnlAmount != null)
    .map((t) => [num(t.confidenceScore), num(t.pnlAmount)]);
  const checklistPairs = trades
    .filter((t) => t.checklistScore != null && t.pnlAmount != null)
    .map((t) => [num(t.checklistScore), num(t.pnlAmount)]);

  return {
    byInstrument,
    bySession,
    byTimeframe,
    byPlaybook,
    bySetup,
    byDirection,
    byResult,
    byDayOfWeek,
    byHourOfDay,
    byDurationBucket,
    byMarketCondition,
    byQuality,
    byTag,
    confidenceCorrelation: pearson(confPairs),
    checklistCorrelation: pearson(checklistPairs),
    byConfidenceBucket: confAgg,
    byChecklistBucket: checkAgg,
  };
}

/** Calendar heatmap: yyyy-mm-dd -> net pnl */
function calendarHeatmap(trades) {
  const map = {};
  for (const t of trades) {
    if (!t.closeTime) continue;
    const d = new Date(t.closeTime);
    const key = d.toISOString().slice(0, 10);
    map[key] = num(map[key]) + num(t.pnlAmount);
  }
  return map;
}

/** R multiple histogram buckets */
function rDistribution(trades) {
  const bins = {
    under_neg2: 0,
    neg2_neg1: 0,
    neg1_0: 0,
    zero: 0,
    zero_1: 0,
    one_2: 0,
    over_2: 0,
  };
  for (const t of trades) {
    const r = t.rMultiple != null ? num(t.rMultiple) : null;
    if (r == null || !Number.isFinite(r)) continue;
    if (r < -2) bins.under_neg2++;
    else if (r < -1) bins.neg2_neg1++;
    else if (r < 0) bins.neg1_0++;
    else if (Math.abs(r) <= EPS) bins.zero++;
    else if (r < 1) bins.zero_1++;
    else if (r < 2) bins.one_2++;
    else bins.over_2++;
  }
  return bins;
}

function pickBestWorst(byMap, metric = 'expectancy') {
  let bestKey = null;
  let bestVal = null;
  let worstKey = null;
  let worstVal = null;
  for (const [k, agg] of Object.entries(byMap || {})) {
    if (!agg || k === '—') continue;
    const v = agg[metric];
    if (v == null || !Number.isFinite(v)) continue;
    if (bestVal == null || v > bestVal) {
      bestVal = v;
      bestKey = k;
    }
    if (worstVal == null || v < worstVal) {
      worstVal = v;
      worstKey = k;
    }
  }
  return { bestKey, bestVal, worstKey, worstVal };
}

function buildDeterministicInsights(globalAgg, breakdown, sessionName = '') {
  const lines = [];
  const { bestKey: bi, worstKey: wi } = pickBestWorst(breakdown.byInstrument, 'profitFactor');
  if (bi && breakdown.byInstrument[bi]?.tradeCount >= 2) {
    const pf = breakdown.byInstrument[bi].profitFactor;
    lines.push(`Strongest instrument by profit factor: ${bi}${pf != null ? ` (PF ${pf.toFixed(2)})` : ''}.`);
  }
  const { bestKey: bs } = pickBestWorst(breakdown.bySession, 'avgR');
  if (bs && breakdown.bySession[bs]?.tradeCount >= 2) {
    const ar = breakdown.bySession[bs].avgR;
    lines.push(`Best session bucket by average R: ${bs}${ar != null ? ` (avg R ${ar.toFixed(2)})` : ''}.`);
  }
  const { worstKey: wsu } = pickBestWorst(breakdown.bySetup, 'netPnl');
  if (wsu && breakdown.bySetup[wsu]?.tradeCount >= 2) {
    lines.push(`Weakest setup by net P&L: ${wsu}. Consider reviewing rules or sample size.`);
  }

  const { bestKey: btf } = pickBestWorst(breakdown.byTimeframe, 'expectancy');
  const { worstKey: wtf } = pickBestWorst(breakdown.byTimeframe, 'expectancy');
  if (btf && wtf && btf !== wtf && breakdown.byTimeframe[btf]?.tradeCount >= 2) {
    lines.push(`Best timeframe by expectancy: ${btf}. Weakest: ${wtf}.`);
  }

  if (breakdown.confidenceCorrelation != null && globalAgg.tradeCount >= 8) {
    const c = breakdown.confidenceCorrelation;
    lines.push(
      `Confidence vs P&L correlation: ${c.toFixed(3)} (${c > 0.15 ? 'higher confidence aligns with better outcomes' : c < -0.15 ? 'confidence may be miscalibrated' : 'no strong linear link'}).`
    );
  }

  if (breakdown.checklistCorrelation != null && globalAgg.tradeCount >= 8) {
    const c = breakdown.checklistCorrelation;
    lines.push(`Checklist score vs P&L correlation: ${c.toFixed(3)}.`);
  }

  const scalp = breakdown.byDurationBucket.under_5m;
  const hold = breakdown.byDurationBucket.over_1d;
  if (scalp && hold && scalp.tradeCount >= 2 && hold.tradeCount >= 2) {
    const es = scalp.expectancy ?? 0;
    const eh = hold.expectancy ?? 0;
    lines.push(es > eh ? 'Short-duration trades show higher expectancy than very long holds in this sample.' : 'Longer holds show higher expectancy than sub-5m trades in this sample.');
  }

  if (lines.length === 0) {
    lines.push('Log more trades with consistent metadata to unlock deeper breakdowns.');
  }

  return {
    title: sessionName ? `Insights: ${sessionName}` : 'What the data says',
    lines,
  };
}

/** First-person hub narrative — deterministic, data-only */
function buildPremiumHubNarrative(globalAgg, breakdown, bestInstrument, bestSession) {
  const lines = [];
  if (!globalAgg.tradeCount) {
    lines.push(
      'Start a backtesting session and log trades with playbook, setup, and checklist data to surface where your simulated edge concentrates.'
    );
    return lines;
  }
  const bi = bestInstrument && breakdown.byInstrument?.[bestInstrument];
  if (bi && bi.tradeCount >= 2) {
    lines.push(
      `Your strongest instrument is ${bestInstrument} because it leads on profit factor (${bi.profitFactor != null ? Number(bi.profitFactor).toFixed(2) : 'n/a'}) across ${bi.tradeCount} trades in this aggregate.`
    );
  }
  const bs = bestSession && breakdown.bySession?.[bestSession];
  if (bs && bs.tradeCount >= 2) {
    lines.push(
      `Your best session bucket is ${bestSession} by average R (${bs.avgR != null ? Number(bs.avgR).toFixed(2) : 'n/a'}) — stress-test whether that edge holds on larger samples.`
    );
  }
  let worstSetup = null;
  let worstE = null;
  for (const [k, v] of Object.entries(breakdown.bySetup || {})) {
    if (!k || k === '—' || !v || v.tradeCount < 2) continue;
    if (v.expectancy == null || !Number.isFinite(Number(v.expectancy))) continue;
    const e = Number(v.expectancy);
    if (worstE == null || e < worstE) {
      worstE = e;
      worstSetup = { name: k, expectancy: e, tradeCount: v.tradeCount };
    }
  }
  if (worstSetup) {
    lines.push(
      `Your weakest setup is ${worstSetup.name} (expectancy ${worstSetup.expectancy.toFixed(3)} over ${worstSetup.tradeCount} trades) — a natural place to refine or cut frequency.`
    );
  }
  if (breakdown.checklistCorrelation != null && globalAgg.tradeCount >= 6) {
    const c = breakdown.checklistCorrelation;
    if (c > 0.1) {
      lines.push(
        `Higher checklist scores correlate with better P&L (r ≈ ${c.toFixed(2)}), which supports treating the checklist as a real quality gate.`
      );
    } else if (c < -0.1) {
      lines.push(
        `Checklist scores move opposite to P&L (r ≈ ${c.toFixed(2)}) — revisit rule definitions or whether scores reflect true execution quality.`
      );
    } else {
      lines.push(
        `Checklist scores and P&L show only a modest linear link (r ≈ ${c.toFixed(2)}); keep logging to see if relationship strengthens.`
      );
    }
  }
  if (breakdown.confidenceCorrelation != null && globalAgg.tradeCount >= 6) {
    const c = breakdown.confidenceCorrelation;
    if (Math.abs(c) < 0.12) {
      lines.push(
        `Confidence is not strongly linear with outcomes (r ≈ ${c.toFixed(2)}) — still useful for process, not yet a live-sizing dial.`
      );
    } else if (c > 0.12) {
      lines.push(`Higher confidence aligns with better outcomes (r ≈ ${c.toFixed(2)}).`);
    } else {
      lines.push(`High confidence sometimes precedes worse outcomes (r ≈ ${c.toFixed(2)}) — watch for overconfidence after wins.`);
    }
  }
  lines.push(
    worstSetup
      ? `Your next focus should be tightening or validating rules on ${worstSetup.name} before allocating more simulated risk there.`
      : `Your next focus should be growing sample size on your core setups while keeping tagging and session labels consistent.`
  );
  return lines;
}

function completionRecap(sessionAgg, breakdown) {
  const inst = pickBestWorst(breakdown.byInstrument, 'profitFactor');
  const setup = pickBestWorst(breakdown.bySetup, 'expectancy');
  const sess = pickBestWorst(breakdown.bySession, 'avgR');
  const setupWorst = pickBestWorst(breakdown.bySetup, 'expectancy');
  const tfBest = pickBestWorst(breakdown.byTimeframe, 'expectancy');
  let checklistNote = null;
  if (breakdown.checklistCorrelation != null && sessionAgg.tradeCount >= 4) {
    const c = breakdown.checklistCorrelation;
    checklistNote =
      c > 0.1
        ? 'Higher checklist scores lined up with better outcomes in this session.'
        : c < -0.1
          ? 'Checklist scores diverged from P&L — revisit how you score rules.'
          : 'Checklist vs P&L relationship was mixed — continue logging for clarity.';
  }
  return {
    strongestInstrument: inst.bestKey,
    strongestSetup: setup.bestKey,
    strongestSession: sess.bestKey,
    weakestSetup: setupWorst.worstKey,
    bestTimeframe: tfBest.bestKey,
    netPnl: sessionAgg.netPnl,
    winRate: sessionAgg.winRate,
    profitFactor: sessionAgg.profitFactor,
    avgR: sessionAgg.avgR,
    tradeCount: sessionAgg.tradeCount,
    checklistCorrelation: breakdown.checklistCorrelation,
    checklistNote,
    focusNext:
      inst.worstKey && inst.worstKey !== '—'
        ? `Review execution on ${inst.worstKey} — lowest relative edge in this session.`
        : 'Tighten checklist usage and trade selection.',
  };
}

module.exports = {
  aggregateTrades,
  breakdownMetrics,
  calendarHeatmap,
  rDistribution,
  buildDeterministicInsights,
  buildPremiumHubNarrative,
  completionRecap,
  classifyResult,
  buildEquityCurve,
  parseJsonArray,
  num,
};
