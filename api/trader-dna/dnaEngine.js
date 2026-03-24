/**
 * Trader DNA — deterministic behavioural / execution / performance / psychology
 * synthesis from aura_analysis_trades + journal_daily.
 * Optional OpenAI narrative layer is applied in api/trader-dna.js (dnaOpenAi.js).
 */

const CYCLE_DAYS = 90;
const ANALYSIS_DAYS = 90;
const MIN_CLOSED_TRADES = 22;
const MIN_DISTINCT_TRADE_DAYS = 15;
const MIN_CALENDAR_SPAN_DAYS = 28;
const MIN_JOURNAL_DAYS = 5;

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function toDateKey(d) {
  if (!d) return null;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return null;
  return x.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  const t0 = new Date(a).setUTCHours(0, 0, 0, 0);
  const t1 = new Date(b).setUTCHours(0, 0, 0, 0);
  return Math.round((t1 - t0) / 86400000);
}

function hoursBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3600000;
}

/**
 * @param {Array<object>} trades normalized camelCase
 * @param {number} windowDays
 */
function filterWindowTrades(trades, windowDays) {
  const cutoff = Date.now() - windowDays * 86400000;
  return (trades || []).filter((t) => {
    const ts = new Date(t.createdAt).getTime();
    return Number.isFinite(ts) && ts >= cutoff;
  }).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getChecklistPct(t) {
  if (t.checklistPercent != null && Number.isFinite(Number(t.checklistPercent))) return Number(t.checklistPercent);
  if (t.checklistTotal > 0) return (t.checklistScore / t.checklistTotal) * 100;
  return 0;
}

function closedTrades(trades) {
  return trades.filter((t) => t.result === 'win' || t.result === 'loss' || t.result === 'breakeven');
}

/**
 * Progress toward next DNA eligibility (data sufficiency in window).
 */
function computeDataProgress(trades, journalRows) {
  const w = filterWindowTrades(trades, ANALYSIS_DAYS);
  const closed = closedTrades(w);
  const dayKeys = new Set(w.map((t) => toDateKey(t.createdAt)).filter(Boolean));
  let span = 0;
  if (w.length >= 2) {
    span = Math.abs(daysBetween(w[0].createdAt, w[w.length - 1].createdAt));
  }
  const journalDays = new Set((journalRows || []).map((j) => String(j.date).slice(0, 10))).size;
  const pendingOutcome = w.filter(
    (t) => t.result !== 'win' && t.result !== 'loss' && t.result !== 'breakeven'
  ).length;

  const tradeRatio = Math.min(1, closed.length / MIN_CLOSED_TRADES);
  const distinctRatio = Math.min(1, dayKeys.size / MIN_DISTINCT_TRADE_DAYS);
  const spanRatio = Math.min(1, span / MIN_CALENDAR_SPAN_DAYS);
  const journalRatio = Math.min(1, journalDays / MIN_JOURNAL_DAYS);
  const pct = Math.round(100 * (0.45 * tradeRatio + 0.3 * distinctRatio + 0.15 * spanRatio + 0.1 * journalRatio));

  return {
    analysisWindowDays: ANALYSIS_DAYS,
    totalTradesInWindow: w.length,
    pendingOutcomeTradesInWindow: pendingOutcome,
    closedTradeCount: closed.length,
    distinctTradeDays: dayKeys.size,
    calendarSpanDays: span,
    journalDaysLogged: journalDays,
    journalEntriesCounted: (journalRows || []).length,
    minClosedTrades: MIN_CLOSED_TRADES,
    minDistinctTradeDays: MIN_DISTINCT_TRADE_DAYS,
    minCalendarSpanDays: MIN_CALENDAR_SPAN_DAYS,
    minJournalDays: MIN_JOURNAL_DAYS,
    dataProgressPercent: pct,
    meetsMinimumData:
      closed.length >= MIN_CLOSED_TRADES &&
      dayKeys.size >= MIN_DISTINCT_TRADE_DAYS &&
      span >= MIN_CALENDAR_SPAN_DAYS &&
      journalDays >= MIN_JOURNAL_DAYS,
  };
}

/**
 * Human-readable gaps vs minimum data rules (for UI when DNA cannot be generated yet).
 */
function buildQualificationGaps(progress) {
  if (!progress || progress.meetsMinimumData) return [];
  const gaps = [];
  if (progress.closedTradeCount < progress.minClosedTrades) {
    gaps.push({
      key: 'closed_trades',
      title: 'Closed trades with outcomes',
      detail: `DNA uses ~${progress.analysisWindowDays || ANALYSIS_DAYS} days of Trade Validator / validated activity. You have ${progress.closedTradeCount} closed trades (win, loss, or breakeven); at least ${progress.minClosedTrades} are required.`,
      met: progress.closedTradeCount,
      need: progress.minClosedTrades,
      hint: 'Log trades in Trade Validator, complete checklists, and set outcomes so closes are counted.',
      links: [
        { label: 'Trade Validator', href: '/trader-deck/trade-validator' },
        { label: 'Trader Deck', href: '/trader-deck' },
      ],
    });
    if (progress.pendingOutcomeTradesInWindow > 0) {
      gaps[gaps.length - 1].detail += ` ${progress.pendingOutcomeTradesInWindow} trade(s) in this window still need an outcome (not counted as closed).`;
    }
  }
  if (progress.distinctTradeDays < progress.minDistinctTradeDays) {
    gaps.push({
      key: 'distinct_days',
      title: 'Distinct trading days',
      detail: `Trades must span at least ${progress.minDistinctTradeDays} different days in the window. You are on ${progress.distinctTradeDays}.`,
      met: progress.distinctTradeDays,
      need: progress.minDistinctTradeDays,
      hint: 'Spread quality setups across more sessions instead of clustering everything on a few days.',
      links: [{ label: 'Trade Validator', href: '/trader-deck/trade-validator' }],
    });
  }
  if (progress.calendarSpanDays < progress.minCalendarSpanDays) {
    gaps.push({
      key: 'calendar_span',
      title: 'Calendar span',
      detail: `First-to-last trade in the window should span at least ${progress.minCalendarSpanDays} days. Current span: ${progress.calendarSpanDays} days.`,
      met: progress.calendarSpanDays,
      need: progress.minCalendarSpanDays,
      hint: 'Keep logging over a longer period so the profile is not built from a single week cluster.',
      links: [{ label: 'Journal', href: '/journal' }],
    });
  }
  if (progress.journalDaysLogged < progress.minJournalDays) {
    gaps.push({
      key: 'journal',
      title: 'Journal days',
      detail: `At least ${progress.minJournalDays} different days with a journal entry in the window. You have ${progress.journalDaysLogged} (${progress.journalEntriesCounted || 0} entries loaded).`,
      met: progress.journalDaysLogged,
      need: progress.minJournalDays,
      hint: 'Add daily journal notes — mood and context feed the psychology dimension of DNA.',
      links: [{ label: 'Journal', href: '/journal' }],
    });
  }
  return gaps;
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, x) => a + x, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function expectancy(trades) {
  const closed = trades.filter((t) => t.result === 'win' || t.result === 'loss');
  if (!closed.length) return 0;
  let sumR = 0;
  for (const t of closed) {
    const r = t.rMultiple != null && Number.isFinite(t.rMultiple) ? t.rMultiple : (t.result === 'win' ? 1 : -1);
    sumR += r;
  }
  return sumR / closed.length;
}

function winRate(trades) {
  const decided = trades.filter((t) => t.result === 'win' || t.result === 'loss');
  if (!decided.length) return 0;
  const wins = decided.filter((t) => t.result === 'win').length;
  return wins / decided.length;
}

/**
 * Extra behavioural signals for UI + OpenAI layer (loss streaks, time-of-day, etc.)
 */
function computeExtendedSignals(w, decided) {
  let maxLossStreak = 0;
  let curL = 0;
  let maxWinStreak = 0;
  let curW = 0;
  for (const t of decided) {
    if (t.result === 'loss') {
      curL += 1;
      curW = 0;
      maxLossStreak = Math.max(maxLossStreak, curL);
    } else if (t.result === 'win') {
      curW += 1;
      curL = 0;
      maxWinStreak = Math.max(maxWinStreak, curW);
    } else {
      curL = 0;
      curW = 0;
    }
  }

  const be = w.filter((t) => t.result === 'breakeven').length;
  const breakevenRatePct = w.length ? Math.round((1000 * be) / w.length) / 10 : 0;

  const hourCounts = {};
  for (const t of w) {
    const d = new Date(t.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const h = d.getUTCHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  }
  const topTradingHoursUTC = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([h, n]) => ({ hourUTC: Number(h), trades: n }));

  let consecLossDollar = 0;
  let maxConsecLossDollar = 0;
  for (const t of decided) {
    if (t.result === 'loss') {
      consecLossDollar += Math.abs(Number(t.pnl) || 0);
      maxConsecLossDollar = Math.max(maxConsecLossDollar, consecLossDollar);
    } else {
      consecLossDollar = 0;
    }
  }

  let tradesStartingWithin24hAfterLoss = 0;
  for (let i = 1; i < w.length; i += 1) {
    if (w[i - 1].result === 'loss') {
      const h = hoursBetween(w[i - 1].createdAt, w[i].createdAt);
      if (h >= 0 && h <= 24) tradesStartingWithin24hAfterLoss += 1;
    }
  }

  let maxDdLength = 0;
  let curDdLen = 0;
  let running = 0;
  let peak = 0;
  for (const t of decided) {
    const p = Number(t.pnl) || 0;
    running += p;
    peak = Math.max(peak, running);
    const dd = peak - running;
    if (dd > 0) {
      curDdLen += 1;
      maxDdLength = Math.max(maxDdLength, curDdLen);
    } else {
      curDdLen = 0;
    }
  }

  return {
    maxLossStreak,
    maxWinStreak,
    breakevenRatePct,
    topTradingHoursUTC,
    maxConsecutiveLossDollarStreak: Math.round(maxConsecLossDollar * 100) / 100,
    tradesStartingWithin24hAfterLoss,
    underwaterTradeStreakMax: maxDdLength,
  };
}

/**
 * Full DNA profile for persistence + UI.
 */
function buildDnaPayload(trades, journalRows, previousPayload, windowEndDate) {
  const w = filterWindowTrades(trades, ANALYSIS_DAYS);
  const closed = closedTrades(w);
  const decided = w.filter((t) => t.result === 'win' || t.result === 'loss');

  const checklistPcts = w.map(getChecklistPct);
  const ruleAdherence = Math.round(avg(checklistPcts));
  const impulsiveCount = w.filter((t) => getChecklistPct(t) < 48).length;
  const impulsiveRate = w.length ? impulsiveCount / w.length : 0;

  const byDay = groupBy(w, (t) => toDateKey(t.createdAt));
  const countsPerDay = [...byDay.values()].map((arr) => arr.length).sort((a, b) => a - b);
  const medianDay =
    countsPerDay.length === 0 ? 0 : countsPerDay[Math.floor(countsPerDay.length / 2)];
  const maxDay = countsPerDay.length ? countsPerDay[countsPerDay.length - 1] : 0;
  const overtradingIndex = medianDay > 0 ? maxDay / medianDay : maxDay;

  let revengePairs = 0;
  let lossFollowUps = 0;
  for (let i = 0; i < w.length - 1; i++) {
    if (w[i].result === 'loss') {
      lossFollowUps++;
      const h = hoursBetween(w[i].createdAt, w[i + 1].createdAt);
      if (h >= 0 && h <= 6) revengePairs++;
    }
  }
  const revengeRate = lossFollowUps ? revengePairs / lossFollowUps : 0;

  const withSession = w.filter((t) => t.session && String(t.session).trim()).length;
  const sessionDisciplinePct = w.length ? Math.round((100 * withSession) / w.length) : 0;

  const rrVals = w.map((t) => (Number.isFinite(t.rr) ? t.rr : 0)).filter((x) => x > 0);
  const rrStd = stddev(rrVals);
  const rrMean = avg(rrVals);
  const rrConsistency = rrMean > 0 ? clamp(100 - Math.min(80, (rrStd / rrMean) * 50), 35, 100) : 50;

  const slOk = w.filter((t) => t.stopLoss != null && Number(t.stopLoss) > 0).length;
  const stopConsistencyPct = w.length ? Math.round((100 * slOk) / w.length) : 0;

  let execQualitySum = 0;
  for (const t of w) {
    let q = 50;
    const pct = getChecklistPct(t);
    if (pct >= 70) q += 25;
    else if (pct >= 50) q += 10;
    if (t.riskPercent > 0 && t.stopLoss) q += 15;
    if (t.session) q += 5;
    if (t.rr >= 1) q += 5;
    execQualitySum += clamp(q, 0, 100);
  }
  const executionQuality = w.length ? Math.round(execQualitySum / w.length) : 0;

  const moods = (journalRows || []).map((j) => (j.mood || '').toLowerCase()).filter(Boolean);
  const moodFrustrated = moods.filter((m) => /stress|angry|bad|low|anx/.test(m)).length;
  const moodPositive = moods.filter((m) => /good|great|calm|focus|conf/.test(m)).length;
  const moodVolatilityScore = moods.length
    ? Math.round((100 * Math.abs(moodFrustrated - moodPositive)) / moods.length + 40)
    : 55;

  const riskAfterLoss = [];
  const riskAfterWin = [];
  for (let i = 1; i < w.length; i++) {
    if (w[i - 1].result === 'loss' && Number.isFinite(w[i].riskPercent)) riskAfterLoss.push(w[i].riskPercent);
    if (w[i - 1].result === 'win' && Number.isFinite(w[i].riskPercent)) riskAfterWin.push(w[i].riskPercent);
  }
  const avgRiskLoss = avg(riskAfterLoss);
  const avgRiskWin = avg(riskAfterWin);
  const riskEscalation = avgRiskLoss > avgRiskWin + 0.15 ? 'elevated_after_loss' : 'stable';

  const wr = winRate(w);
  const exp = expectancy(w);
  const byPair = groupBy(decided, (t) => t.pair || 'unknown');
  let bestPair = null;
  let worstPair = null;
  let bestWr = -1;
  let worstWr = 2;
  for (const [pair, arr] of byPair) {
    if (arr.length < 3) continue;
    const pwr = winRate(arr);
    if (pwr > bestWr) {
      bestWr = pwr;
      bestPair = pair;
    }
    if (pwr < worstWr) {
      worstWr = pwr;
      worstPair = pair;
    }
  }

  const bySession = groupBy(w.filter((t) => t.session), (t) => t.session);
  let bestSession = null;
  let worstSession = null;
  let bestSScore = -1e9;
  let worstSScore = 1e9;
  for (const [sess, arr] of bySession) {
    if (arr.length < 2) continue;
    const q = executionQualitySubset(arr);
    if (q > bestSScore) {
      bestSScore = q;
      bestSession = sess;
    }
    if (q < worstSScore) {
      worstSScore = q;
      worstSession = sess;
    }
  }

  function executionQualitySubset(arr) {
    let s = 0;
    for (const t of arr) {
      let q = 50;
      const pct = getChecklistPct(t);
      if (pct >= 70) q += 25;
      else if (pct >= 50) q += 10;
      if (t.riskPercent > 0 && t.stopLoss) q += 15;
      if (t.rr >= 1) q += 5;
      s += clamp(q, 0, 100);
    }
    return arr.length ? s / arr.length : 0;
  }

  const disciplineScore = clamp(
    Math.round(ruleAdherence * 0.35 + sessionDisciplinePct * 0.25 + (1 - impulsiveRate) * 100 * 0.25 + (1 - Math.min(1, revengeRate * 2)) * 100 * 0.15),
    0,
    100
  );
  const executionScore = clamp(
    Math.round(executionQuality * 0.4 + stopConsistencyPct * 0.25 + rrConsistency * 0.2 + (1 - Math.min(1, overtradingIndex / 4)) * 100 * 0.15),
    0,
    100
  );
  const behaviourScore = clamp(
    Math.round(
      (1 - impulsiveRate) * 100 * 0.3 +
        (1 - Math.min(1, revengeRate * 1.5)) * 100 * 0.25 +
        sessionDisciplinePct * 0.2 +
        ruleAdherence * 0.25
    ),
    0,
    100
  );

  let running = 0;
  let maxDD = 0;
  let peak = 0;
  for (const t of decided) {
    const p = Number(t.pnl) || 0;
    running += p;
    peak = Math.max(peak, running);
    maxDD = Math.min(maxDD, running - peak);
  }
  const drawdownSeverity = Math.min(1, Math.abs(maxDD) / (Math.abs(peak) + 1 || 1));

  const consistencyScore = clamp(
    Math.round((1 - stddev(checklistPcts) / 40) * 50 + (1 - Math.min(1, overtradingIndex / 5)) * 50),
    0,
    100
  );

  const psychStability = clamp(
    Math.round(
      100 -
        moodVolatilityScore * 0.25 -
        (riskEscalation === 'elevated_after_loss' ? 22 : 0) -
        revengeRate * 45 -
        impulsiveRate * 30
    ),
    0,
    100
  );

  const envFit = clamp(
    Math.round(
      (bestSession ? bestSScore : 55) * 0.35 +
        (bestPair ? bestWr * 100 : wr * 100) * 0.25 +
        (1 - drawdownSeverity) * 100 * 0.2 +
        consistencyScore * 0.2
    ),
    0,
    100
  );

  const performanceScore = clamp(
    Math.round(wr * 100 * 0.35 + clamp((exp + 1) * 35, 0, 100) * 0.35 + (1 - drawdownSeverity) * 100 * 0.3),
    0,
    100
  );

  const overallDNA = Math.round(
    behaviourScore * 0.18 +
      disciplineScore * 0.18 +
      executionScore * 0.2 +
      psychStability * 0.15 +
      consistencyScore * 0.12 +
      envFit * 0.07 +
      performanceScore * 0.1
  );

  const archetype = resolveArchetype({
    ruleAdherence,
    impulsiveRate,
    revengeRate,
    executionQuality,
    psychStability,
    overtradingIndex,
    wr,
  });

  const strengths = buildStrengths({
    ruleAdherence,
    executionQuality,
    psychStability,
    sessionDisciplinePct,
    wr,
    exp,
    bestSession,
    bestPair,
    revengeRate,
  });

  let weaknesses = buildWeaknesses({
    impulsiveRate,
    revengeRate,
    overtradingIndex,
    moodVolatilityScore,
    riskEscalation,
    drawdownSeverity,
    worstSession,
    worstPair,
  });

  const extendedSignals = computeExtendedSignals(w, decided);
  if (extendedSignals.maxLossStreak >= 4) {
    weaknesses = [
      `Longest losing streak: ${extendedSignals.maxLossStreak} consecutive losses — risk compounding and psychology are bleeding together.`,
      ...weaknesses,
    ].slice(0, 8);
  }
  if (extendedSignals.tradesStartingWithin24hAfterLoss >= 5) {
    weaknesses = [
      `${extendedSignals.tradesStartingWithin24hAfterLoss} trades opened within 24h of a loss — sequence risk / inability to stand aside.`,
      ...weaknesses,
    ].slice(0, 8);
  }

  const patterns = buildPatterns({
    impulsiveRate,
    revengeRate,
    overtradingIndex,
    sessionDisciplinePct,
    riskEscalation,
    wr,
    exp,
  });

  const psychProfile = buildPsychProfile({
    moodVolatilityScore,
    riskEscalation,
    revengeRate,
    impulsiveRate,
    psychStability,
  });

  const executionStyle = buildExecutionStyle({
    executionQuality,
    rrConsistency,
    stopConsistencyPct,
    impulsiveRate,
  });

  const environmentFit = {
    bestMarketRegime: wr >= 0.48 ? 'trend-favourable / directional' : 'range-bound / mean-reverting (unverified — inferred from win rate)',
    worstMarketRegime: wr < 0.42 ? 'fast volatile conditions (inferred)' : 'low-quality setup periods',
    bestSession: bestSession || 'Not enough session-tagged data',
    worstSession: worstSession || '—',
    bestInstruments: bestPair ? [bestPair] : [],
    worstInstruments: worstPair ? [worstPair] : [],
    narrative: bestSession
      ? `Highest execution quality clusters around the ${bestSession} session. Align core risk with those periods.`
      : 'Tag sessions on trades to unlock session-level environment fit.',
  };

  const sessionInstrumentInsights = {
    bySession: [...bySession.entries()].slice(0, 6).map(([name, arr]) => ({
      session: name,
      trades: arr.length,
      winRate: Math.round(winRate(arr) * 1000) / 10,
      avgChecklist: Math.round(avg(arr.map(getChecklistPct))),
    })),
    byPair: [...byPair.entries()]
      .filter(([, arr]) => arr.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 8)
      .map(([pair, arr]) => ({
        pair,
        trades: arr.length,
        winRate: Math.round(winRate(arr) * 1000) / 10,
        expectancyR: Math.round(expectancy(arr) * 100) / 100,
      })),
  };

  const aiNarrative = buildAiNarrative({
    archetype,
    ruleAdherence,
    executionQuality,
    psychStability,
    revengeRate,
    wr,
    bestSession,
    impulsiveRate,
    riskEscalation,
  });

  const actionPlan = buildActionPlan({
    impulsiveRate,
    revengeRate,
    overtradingIndex,
    riskEscalation,
    worstSession,
    executionQuality,
    ruleAdherence,
    bestSession,
  });

  const alerts = buildAlerts({
    revengeRate,
    impulsiveRate,
    riskEscalation,
    drawdownSeverity,
    psychStability,
  });

  const evolution = buildEvolution(previousPayload, {
    overallDNA,
    behaviourScore,
    disciplineScore,
    executionScore,
    psychStability,
    consistencyScore,
    archetype,
  });

  const windowStart = w.length ? toDateKey(w[0].createdAt) : null;
  const windowEnd = windowEndDate || (w.length ? toDateKey(w[w.length - 1].createdAt) : null);

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    analysisWindow: { start: windowStart, end: windowEnd, days: ANALYSIS_DAYS },
    sample: { tradesAnalysed: w.length, closedTrades: closed.length, journalEntries: journalRows?.length || 0 },
    archetype: archetype.name,
    archetypeTagline: archetype.tagline,
    identityStatement: archetype.statement,
    headlineSummary: aiNarrative.headline,
    scores: {
      overallDNA,
      behaviour: behaviourScore,
      discipline: disciplineScore,
      execution: executionScore,
      psychologyStability: psychStability,
      consistency: consistencyScore,
      environmentFit: envFit,
      performance: performanceScore,
    },
    ratings: {
      riskProfile: riskEscalation === 'elevated_after_loss' ? 'Reactive sizing' : 'Controlled sizing',
      consistency: ratingLabel(consistencyScore),
      execution: ratingLabel(executionScore),
      discipline: ratingLabel(disciplineScore),
      behavioural: ratingLabel(behaviourScore),
    },
    improvementPriority: actionPlan.topPriority,
    strengths,
    weaknesses,
    patternRecognition: patterns,
    psychologicalTendencies: psychProfile,
    executionStyle: executionStyle,
    environmentFit,
    sessionInstrumentInsights,
    aiInterpretation: aiNarrative.paragraphs,
    actionPlan,
    evolution,
    alerts,
    behaviouralMetrics: {
      ruleAdherencePct: ruleAdherence,
      impulsiveEntryRate: Math.round(impulsiveRate * 1000) / 10,
      overtradingIndex: Math.round(overtradingIndex * 10) / 10,
      revengeTradingRate: Math.round(revengeRate * 1000) / 10,
      sessionDisciplinePct,
      planDeviationEstimate: Math.round((100 - ruleAdherence) * 0.85),
    },
    executionMetrics: {
      executionQuality,
      stopConsistencyPct,
      rrConsistency: Math.round(rrConsistency),
      avgPlannedRR: Math.round(rrMean * 100) / 100,
    },
    performanceMetrics: {
      winRate: Math.round(wr * 1000) / 10,
      expectancyR: Math.round(exp * 100) / 100,
      drawdownStressIndex: Math.round(drawdownSeverity * 100),
    },
    psychologicalMetrics: {
      journalMoodVolatility: moodVolatilityScore,
      riskAfterLossVsWin: {
        afterLossAvg: Math.round(avgRiskLoss * 100) / 100,
        afterWinAvg: Math.round(avgRiskWin * 100) / 100,
        pattern: riskEscalation,
      },
    },
    extendedSignals,
  };
}

function ratingLabel(s) {
  if (s >= 78) return 'Elite';
  if (s >= 62) return 'Strong';
  if (s >= 45) return 'Developing';
  return 'At risk';
}

function resolveArchetype(m) {
  const { ruleAdherence, impulsiveRate, revengeRate, executionQuality, psychStability, overtradingIndex, wr } = m;
  if (ruleAdherence >= 72 && executionQuality >= 70 && impulsiveRate < 0.22) {
    return {
      name: 'Structured Performer',
      tagline: 'Process-first execution with repeatable quality.',
      statement: 'You translate planning into action with above-average consistency and controlled impulse.',
    };
  }
  if (impulsiveRate > 0.38 || overtradingIndex > 3.2) {
    return {
      name: 'Reactive Operator',
      tagline: 'High activity with volatile process adherence.',
      statement: 'Speed and frequency show up before validation — tightening pre-trade gates will compound results.',
    };
  }
  if (ruleAdherence >= 65 && impulsiveRate < 0.25 && wr < 0.45) {
    return {
      name: 'Hesitant Analyst',
      tagline: 'Strong checklist discipline, outcomes still calibrating.',
      statement: 'Your process scaffolding is solid; selective aggression when edge is highest will help expectancy.',
    };
  }
  if (revengeRate > 0.42 || psychStability < 48) {
    return {
      name: 'Emotional Reclaimer',
      tagline: 'Drawdowns leak into execution tempo.',
      statement: 'Recovery trades after stress events are elevating risk of process break — cool-down protocols are high leverage.',
    };
  }
  if (executionQuality >= 68 && ruleAdherence < 58) {
    return {
      name: 'Impulsive Executor',
      tagline: 'Capable mechanics when engaged, inconsistent rule load.',
      statement: 'Execution quality exists in bursts; standardising the same checklist every entry removes variance.',
    };
  }
  return {
    name: 'Controlled Operator',
    tagline: 'Balanced profile with clear tuning levers.',
    statement: 'No single failure mode dominates — incremental gains across discipline and psychology will move the needle.',
  };
}

function buildStrengths(m) {
  const s = [];
  if (m.ruleAdherence >= 68) s.push(`Rule adherence averaging ${m.ruleAdherence}% — plans are being respected.`);
  if (m.executionQuality >= 72) s.push('Execution quality scores show clean mechanics on validated setups.');
  if (m.psychStability >= 65) s.push('Psychological stability is holding under trade frequency and outcomes.');
  if (m.sessionDisciplinePct >= 70) s.push('Session tagging discipline enables environment-specific optimisation.');
  if (m.wr >= 0.52) s.push(`Win rate near ${(m.wr * 100).toFixed(1)}% supports positive expectancy with current R management.`);
  if (m.exp >= 0.15) s.push(`Positive expectancy (~${m.exp.toFixed(2)} R/trade) indicates edge extraction, not noise.`);
  if (m.bestSession) s.push(`Relative edge in the ${m.bestSession} session — lean scheduling there.`);
  if (m.bestPair) s.push(`${m.bestPair} shows cleaner statistics — specialisation may compound.`);
  if (m.revengeRate < 0.2) s.push('Low revenge-entry frequency after losses — capital preservation instinct is present.');
  if (!s.length) s.push('Baseline data captured — continue logging to surface strengths with higher confidence.');
  return s.slice(0, 8);
}

function buildWeaknesses(m) {
  const s = [];
  if (m.impulsiveRate > 0.28) s.push(`Impulsive entries (~${(m.impulsiveRate * 100).toFixed(0)}% of trades under 50% checklist) dilute edge.`);
  if (m.revengeRate > 0.3) s.push('Elevated quick re-entries after losses suggest emotional reclaim behaviour.');
  if (m.overtradingIndex > 2.8) s.push('Burst trading days vs typical days indicates inconsistent throttle control.');
  if (m.moodVolatilityScore > 62) s.push('Journal mood dispersion is wide — emotional variance may precede process breaks.');
  if (m.riskEscalation === 'elevated_after_loss') s.push('Risk sizing trends higher immediately after losses — classic tilt fuel.');
  if (m.drawdownSeverity > 0.45) s.push('Equity curve stress periods are pronounced — reduce size until process stabilises.');
  if (m.worstSession) s.push(`${m.worstSession} session shows weaker execution quality — consider standing down or halving size.`);
  if (m.worstPair) s.push(`${m.worstPair} underperforms your book — audit setup validity or avoid until edge returns.`);
  if (!s.length) s.push('No critical weakness flagged — maintain journaling to catch subtle drift early.');
  return s.slice(0, 8);
}

function buildPatterns(m) {
  return [
    {
      label: 'Impulse vs validation',
      detail: `${(m.impulsiveRate * 100).toFixed(0)}% of trades occurred with checklist completion under 50%.`,
    },
    {
      label: 'Post-loss behaviour',
      detail:
        m.revengeRate > 0.35
          ? 'Frequent quick trades after losses — pattern consistent with revenge sequencing.'
          : 'Post-loss behaviour is within controlled bounds.',
    },
    {
      label: 'Activity distribution',
      detail:
        m.overtradingIndex > 2.5
          ? 'Sparse quiet days vs heavy bursts — consider daily trade caps.'
          : 'Trade frequency distribution is relatively even.',
    },
    {
      label: 'Session anchoring',
      detail:
        m.sessionDisciplinePct >= 65
          ? `${m.sessionDisciplinePct}% of trades carry session metadata — good for DNA fidelity.`
          : 'Session metadata is thin — tag London/NY/Asia to unlock session DNA.',
    },
  ];
}

function buildPsychProfile(m) {
  return {
    profileType:
      m.psychStability >= 62
        ? 'Stabilised realist'
        : m.revengeRate > 0.35
          ? 'Recovery-driven'
          : m.impulsiveRate > 0.32
            ? 'Activation-prone'
            : 'Balanced adaptive',
    tendencies: [
      m.riskEscalation === 'elevated_after_loss'
        ? 'Risk expansion after setbacks — monitor cooldown timers.'
        : 'Risk sizing does not materially spike after losses.',
      m.moodVolatilityScore > 58
        ? 'Journal signals emotional oscillation — pair trading days with mood notes.'
        : 'Mood journal entries appear relatively steady.',
      m.revengeRate > 0.28
        ? 'Quick re-engagement after red trades — insert mandatory pause.'
        : 'You allow space after losses before re-entering.',
    ],
    stabilityScore: m.psychStability,
  };
}

function buildExecutionStyle(m) {
  let style = 'Hybrid';
  if (m.executionQuality >= 75 && m.impulsiveRate < 0.2) style = 'Surgical';
  else if (m.impulsiveRate > 0.35) style = 'Reactive';
  else if (m.rrConsistency >= 78 && m.stopConsistencyPct >= 90) style = 'Model-locked';
  return {
    style,
    qualityScore: m.executionQuality,
    stopConsistency: m.stopConsistencyPct,
    rrAdherence: m.rrConsistency,
    narrative:
      m.executionQuality >= 70
        ? 'Execution stack (stops, R multiples, checklist) is coherent more often than not.'
        : 'Execution variance is elevated — tighten one variable at a time (risk, then R, then timing).',
  };
}

function buildAiNarrative(m) {
  const headline = `${m.archetype.name} · DNA confidence anchored in ${m.ruleAdherence}% average checklist adherence.`;
  const paragraphs = [];
  paragraphs.push(
    `You perform best when structure is visible: ${m.ruleAdherence >= 65 ? 'your checklist usage supports repeatable decisions' : 'checklist usage is still forming — completing it every trade will sharpen this profile'}.`
  );
  if (m.bestSession) {
    paragraphs.push(`Session clustering suggests operational edge when ${m.bestSession} is active — protect focus blocks there.`);
  }
  paragraphs.push(
    m.executionQuality >= 68
      ? 'Execution quality remains your compounding engine — outcomes should be judged on process adherence, not single-trade noise.'
      : 'Execution quality variance is dragging expectancy — slow down entries until the same three pre-trade checks are non-negotiable.'
  );
  if (m.revengeRate > 0.3) {
    paragraphs.push('After losses, your next-trade risk profile shifts — this is where most drawdowns deepen. A timed pause beats an immediate re-entry.');
  }
  if (m.impulsiveRate > 0.3) {
    paragraphs.push('Impulse frequency is material; shrinking trade count on low-confluence days typically raises R-adjusted performance.');
  }
  paragraphs.push(
    m.riskEscalation === 'elevated_after_loss'
      ? 'Psychological DNA flags elevated risk after red trades — formalise a “loss cooldown” rule with hard minutes off screens.'
      : 'Risk behaviour after wins vs losses is balanced — maintain the current sizing discipline.'
  );
  paragraphs.push(
    `Psychological stability reads ${m.psychStability >= 60 ? 'stable with room to optimise' : 'volatile — prioritise recovery hygiene (sleep, journaling, size down after stress days)'}.`
  );
  return { headline, paragraphs };
}

function buildActionPlan(m) {
  const top3 = [];
  if (m.impulsiveRate > 0.25) top3.push('Cap trades at 2–3 per day until checklist median exceeds 70%.');
  if (m.revengeRate > 0.25) top3.push('After any loss, enforce a 30–60 minute no-new-trade rule.');
  if (m.riskEscalation === 'elevated_after_loss') top3.push('Halve risk for the next two trades following a full stop-out.');
  if (m.executionQuality < 62) top3.push('Pre-define SL/TP before entry on every trade for 2 weeks — no exceptions.');
  if (m.worstSession) top3.push(`Reduce or eliminate ${m.worstSession} trades until sample quality improves.`);
  if (m.ruleAdherence < 60) top3.push('Run Trade Validator checklist on every setup for one full cycle.');
  if (m.bestSession) top3.push(`Schedule deep-work trading only during ${m.bestSession} for the next DNA cycle.`);
  while (top3.length < 3) top3.push('Journal mood + one sentence “why this trade” on every close for 30 days.');
  return {
    topPriority: top3[0],
    top3: top3.slice(0, 3),
    reduceBehaviours: [
      m.impulsiveRate > 0.22 ? 'Low-checklist entries' : null,
      m.revengeRate > 0.22 ? 'Immediate re-entries after losses' : null,
      m.overtradingIndex > 2.5 ? 'Burst trading without daily cap' : null,
    ].filter(Boolean),
    leanInto: [
      m.bestSession ? `${m.bestSession} session focus` : null,
      m.ruleAdherence >= 60 ? 'Existing checklist habit' : null,
      m.executionQuality >= 65 ? 'Clean execution sequences' : null,
    ].filter(Boolean),
    sessionFocus: m.bestSession
      ? `Primary: ${m.bestSession}. Secondary: tag all trades with session for next reading.`
      : 'Tag session on every trade to unlock session-level coaching.',
    executionCorrections: [
      'Never move stop against the trade in the first 5 minutes unless invalidation is explicit.',
      'Record actual vs planned R for 20 trades.',
    ],
    emotionalRiskControls: ['Hard daily loss cap in R, not dollars.', 'Phone away during execution window.'],
    nextCycleGoals: [
      'Raise discipline score by +8 through checklist completion rate.',
      'Reduce impulsive rate by 30% vs this cycle baseline.',
      'Maintain positive expectancy while shrinking trade count by 15%.',
    ],
  };
}

function buildAlerts(m) {
  const a = [];
  if (m.revengeRate > 0.38) a.push({ level: 'high', text: 'Revenge-style sequencing is elevated — mandatory cool-downs recommended.' });
  if (m.impulsiveRate > 0.42) a.push({ level: 'high', text: 'Impulsive entry rate is critically high vs institutional-grade process.' });
  if (m.psychStability < 42) a.push({ level: 'medium', text: 'Psychological stability score is fragile — reduce size until journals stabilise.' });
  if (m.drawdownSeverity > 0.55) a.push({ level: 'medium', text: 'Drawdown behaviour shows stress clustering — audit risk per trade.' });
  if (!a.length) a.push({ level: 'low', text: 'No acute red flags — stay consistent with journaling and tagging.' });
  return a;
}

function buildEvolution(prev, curr) {
  if (!prev || !prev.scores) {
    return {
      hasPrevious: false,
      summary: 'First Trader DNA reading established — future cycles will compare against this baseline.',
      deltas: null,
      trajectory: 'baseline',
    };
  }
  const dOverall = curr.overallDNA - (prev.scores.overallDNA || 0);
  const dBeh = curr.behaviourScore - (prev.scores.behaviour || 0);
  const dDisc = curr.disciplineScore - (prev.scores.discipline || 0);
  const dExec = curr.executionScore - (prev.scores.execution || 0);
  const dPsych = curr.psychStability - (prev.scores.psychologyStability || 0);
  let trajectory = 'consolidating';
  if (dOverall >= 4 && dPsych >= 0) trajectory = 'maturing';
  if (dOverall <= -4 || dPsych <= -6) trajectory = 'regressing';
  if (Math.abs(dOverall) < 3) trajectory = 'stable';
  const currArchName =
    typeof curr.archetype === 'string'
      ? curr.archetype
      : curr.archetype && curr.archetype.name
        ? curr.archetype.name
        : '';
  return {
    hasPrevious: true,
    summary: `Overall DNA moved ${dOverall >= 0 ? '+' : ''}${dOverall} vs previous cycle. Discipline ${dDisc >= 0 ? 'firmed' : 'slipped'} (${dDisc >= 0 ? '+' : ''}${dDisc}). Execution ${dExec >= 0 ? 'improved' : 'softened'} (${dExec >= 0 ? '+' : ''}${dExec}).`,
    deltas: {
      overallDNA: dOverall,
      behaviour: dBeh,
      discipline: dDisc,
      execution: dExec,
      psychologyStability: dPsych,
    },
    trajectory,
    previousArchetype: prev.archetype || null,
    archetypeChanged: (prev.archetype || '') !== currArchName,
  };
}

function addDaysIso(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

module.exports = {
  CYCLE_DAYS,
  ANALYSIS_DAYS,
  computeDataProgress,
  buildQualificationGaps,
  buildDnaPayload,
  addDaysIso,
  filterWindowTrades,
};
