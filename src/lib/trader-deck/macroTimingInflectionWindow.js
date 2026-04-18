/**
 * Macro Timing & Inflection Window — compact terminal lines for Market Outlook right rail.
 */

import { currentSessionShortLabel } from './marketOutlookDisplayFormatters';

function normDirection(d) {
  const x = String(d || '').toLowerCase();
  if (['up', 'bull', 'bullish', 'risk-on', 'riskon'].some((w) => x.includes(w))) return 'up';
  if (['down', 'bear', 'bearish', 'risk-off', 'riskoff'].some((w) => x.includes(w))) return 'down';
  return 'neutral';
}

function clip(s, max) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function pickTimingSessionRow(sessionContext) {
  if (!sessionContext || !sessionContext.sessions) return null;
  const { sessions } = sessionContext;
  const c = String(sessionContext.currentSession || '').toLowerCase();
  if (c === 'overlap') return sessions.newYork || sessions.london || sessions.asia;
  if (c === 'new_york') return sessions.newYork || sessions.london;
  if (c === 'london') return sessions.london || sessions.newYork;
  if (c === 'asia') return sessions.asia || sessions.london;
  return sessions.newYork || sessions.london || sessions.asia;
}

function deriveMacroPhaseLabel(sessionContext, riskEngine, marketPulse) {
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(sessionContext);
  const state = String(row?.state || '').toLowerCase();
  const vol = riskEngine?.breakdown?.volatility != null ? Number(riskEngine.breakdown.volatility) : null;
  const pulseScore = marketPulse?.score != null ? Number(marketPulse.score) : null;

  if ((Number.isFinite(mins) && mins < 120) || state === 'event_sensitive') {
    return { key: 'pre-event', label: 'Pre-event' };
  }
  if (state === 'range_bound' || state === 'compressed' || (vol != null && vol <= 40 && (pulseScore == null || pulseScore <= 42))) {
    return { key: 'drift', label: 'Drift' };
  }
  if (state === 'expansion_likely' || state === 'trend_continuation' || (vol != null && vol >= 58 && pulseScore != null && pulseScore >= 55)) {
    return { key: 'expansion', label: 'Expansion' };
  }
  if (vol != null && vol <= 42 && pulseScore != null && pulseScore >= 48) {
    return { key: 'post-event', label: 'Post-event' };
  }
  return { key: 'expansion', label: 'Expansion' };
}

function deriveInflectionLevel(riskEngine, crossAssetSignals) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : 50;
  const clustering = breakdown.clustering != null ? Number(breakdown.clustering) : 50;
  const signals = Array.isArray(crossAssetSignals) ? crossAssetSignals : [];
  const dirs = signals.map((s) => normDirection(s.direction));
  const uniq = new Set(dirs.filter(Boolean));
  let dispersion = 35;
  if (uniq.size >= 3) dispersion = 78;
  else if (uniq.size === 2) dispersion = 52;

  const score = vol * 0.42 + clustering * 0.33 + dispersion * 0.25;
  if (score >= 62) return 'HIGH';
  if (score >= 44) return 'MEDIUM';
  return 'LOW';
}

function deriveSessionConditionLabel(sessionContext, riskEngine) {
  const row = pickTimingSessionRow(sessionContext);
  const state = String(row?.state || '').toLowerCase();
  const mins = riskEngine?.nextRiskEventInMins;
  if (state === 'event_sensitive' || (Number.isFinite(mins) && mins < 90)) return 'Transition';
  if (state === 'range_bound' || state === 'compressed' || state === 'thin') return 'Thin';
  if (state === 'overlap' || state === 'expansion_likely' || state === 'trend_continuation') return 'Active';
  return 'Active';
}

function deriveActiveStatus(macroPhase, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;
  if (Number.isFinite(mins) && mins < 120) return 'Pre-catalyst';
  if (macroPhase.key === 'drift' || macroPhase.key === 'post-event') return 'Dormant';
  return 'Active';
}

function buildActiveTimingWindow(showing, macroPhase, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;
  const cond = deriveSessionConditionLabel(showing.sessionContext, riskEngine);
  const status = deriveActiveStatus(macroPhase, riskEngine);

  const catalystBit = Number.isFinite(mins) ? clip(`~${mins}m to catalyst`, 28) : clip('no imminent print', 28);
  const headline = clip(`${status} · ${catalystBit} · ${cond}`, 118);

  const exec =
    status === 'Pre-catalyst'
      ? clip('Shrink into print · add only on clean follow-through.', 110)
      : cond === 'Thin'
        ? clip('Size to depth · avoid sweeping thin legs.', 110)
        : clip('Align sleeves · impulse only if cross-asset agrees.', 110);

  return {
    headline,
    executionNote: exec,
    status,
    timeToCatalyst: catalystBit,
    sessionCondition: cond,
    executionImplication: exec,
    sessionLabel: currentSessionShortLabel(showing.sessionContext?.currentSession) || 'Session',
  };
}

function buildInflectionReason(level, riskEngine, crossAssetSignals) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const cl = breakdown.clustering != null ? Number(breakdown.clustering) : null;
  const signals = Array.isArray(crossAssetSignals) ? crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));

  const frag =
    uniq.size >= 3 ? 'dispersed sleeves' : uniq.size === 2 ? 'two-way tape' : uniq.size <= 1 ? 'aligned sleeves' : 'mixed sleeves';

  const volBit = vol != null && vol >= 58 ? 'elev vol' : vol != null && vol <= 40 ? 'compressed vol' : 'mid vol';

  const clBit = cl != null && cl >= 56 ? 'tight linkage' : cl != null && cl <= 42 ? 'linkage breaking' : 'neutral linkage';

  return clip(`${volBit}, ${clBit}, ${frag}.`, 118);
}

function buildMarketStateSnapshot(riskEngine, crossAssetSignals, macroPhase) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const liq = breakdown.liquidity != null ? Number(breakdown.liquidity) : null;
  const cl = breakdown.clustering != null ? Number(breakdown.clustering) : null;
  const signals = Array.isArray(crossAssetSignals) ? crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));

  let volRegime = 'Balanced';
  if (vol != null && vol <= 42) volRegime = 'Compressed';
  else if (vol != null && vol >= 58) volRegime = 'Expanding';

  let liquidity = 'Stable';
  if (liq != null && liq <= 40) liquidity = 'Thin';
  else if (liq != null && liq >= 62) liquidity = 'Fragmented';

  let correlation = 'Rotational';
  if (cl != null && cl >= 56) correlation = 'Tight';
  else if ((cl != null && cl <= 42) || uniq.size >= 3) correlation = 'Breaking';

  let positioning = 'Unclear';
  if (macroPhase.key === 'pre-event') positioning = 'Crowded';
  else if (macroPhase.key === 'drift' && vol != null && vol <= 45) positioning = 'Light';
  else if (uniq.size <= 1 && cl != null && cl >= 55) positioning = 'Crowded';

  return { volRegime, liquidity, correlation, positioning };
}

/** Max 5 lines: `[TAG] short insight` */
function buildCatalystCompactLines(showing, macroPhase, outlookRiskContext, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(showing.sessionContext);
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));
  const volR = breakdown.volatility != null ? Math.round(Number(breakdown.volatility)) : null;
  const liqR = breakdown.liquidity != null ? Math.round(Number(breakdown.liquidity)) : null;

  const volInsight =
    volR != null && volR >= 58 ? 'Lift / tails on' : volR != null && volR <= 40 ? 'Mid-band, chop' : 'Mid-band, no expansion';

  const flowInsight =
    uniq.size >= 3 ? 'Mixed sleeves, no alignment' : uniq.size === 2 ? 'Two-way, pick leaders' : signals.length ? 'Sleeves aligned' : 'Thin evidence';

  const liqInsight =
    liqR != null && liqR <= 40 ? 'Thin transitions' : liqR != null && liqR >= 62 ? 'Fragmented depth' : 'Stable depth';

  const macroInsight = Number.isFinite(mins)
    ? clip(`Prints spaced · ~${mins}m clock`, 56)
    : clip('Cadence drift · calendar-led', 56);

  const usdInsight =
    breakdown.geopoliticalRisk != null && Number(breakdown.geopoliticalRisk) >= 58
      ? 'USD bid · geo tail'
      : 'USD · rates path dominant';

  const lines = [
    clip(`[MACRO] ${macroInsight}`, 96),
    clip(`[VOL] ${volInsight}`, 96),
    clip(`[FLOW] ${flowInsight}`, 96),
    clip(`[LIQ] ${liqInsight}`, 96),
    clip(`[USD] ${usdInsight}`, 96),
  ];

  return lines.slice(0, 5);
}

function buildExpectedBehavior(showing, _macroPhase, outlookRiskContext, _riskEngine) {
  const pulse = showing.marketPulse || {};
  const outlook = pulse.outlookPulse && typeof pulse.outlookPulse === 'object' ? pulse.outlookPulse : null;

  const driftCore = 'Drift into catalyst — no clean trend until trigger.';
  const base = outlook?.volatilityCondition
    ? clip(`Base: ${String(outlook.volatilityCondition).slice(0, 72)} — ${driftCore}`, 118)
    : clip(`Base: ${driftCore}`, 118);

  const triggered = clip('If triggered: Direction follows leader (rates/USD first).', 118);

  const failureMode = clip('Failure mode: Chop persists — false breaks likely.', 118);

  return [base, triggered, failureMode];
}

function buildTradeConditionsMatrix(showing, macroPhase, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const mins = riskEngine?.nextRiskEventInMins;
  const sessionRow = pickTimingSessionRow(showing.sessionContext);
  const liqThin = breakdown.liquidity != null && Number(breakdown.liquidity) <= 42;

  const breakout =
    vol != null && vol >= 55 && !liqThin
      ? clip('Impulse clears range · depth confirms', 88)
      : macroPhase.key === 'expansion'
        ? clip('Range break · rates lead', 88)
        : clip('Break only post-impulse · else fade', 88);

  const meanRev =
    (vol != null && vol <= 48) || macroPhase.key === 'drift'
      ? clip('Fade extremes inside balance', 88)
      : clip('Mean-revert post-print if vol pins', 88);

  const noTrade =
    Number.isFinite(mins) && mins < 45 && liqThin
      ? clip('Binary window · thin book', 88)
      : uniqSessionAmbiguous(sessionRow)
        ? clip('Transition tape · wait', 88)
        : clip('Mixed signals · stand down', 88);

  return { breakout, meanReversion: meanRev, noTradeZone: noTrade };
}

function uniqSessionAmbiguous(row) {
  if (!row) return false;
  const s = String(row.state || '').toLowerCase();
  return s === 'event_sensitive' || s === 'overlap';
}

/** Five structured rows — participation, liquidity, vol path, linkage, positioning */
function buildExecutionContext(showing, macroPhase, riskEngine, snap) {
  const mins = riskEngine?.nextRiskEventInMins;
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const liq = breakdown.liquidity != null ? Number(breakdown.liquidity) : null;
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));
  const pulse = showing.marketPulse?.score != null ? Number(showing.marketPulse.score) : null;

  const participation =
    uniq.size >= 3
      ? clip('Light — selective flows; sleeves divergent.', 92)
      : uniq.size === 2
        ? clip('Moderate — two-way; leadership matters.', 92)
        : pulse != null && pulse >= 56
          ? clip('Firmer — broader participation when sleeves align.', 92)
          : clip('Moderate — flows selective, not broad.', 92);

  const liquidityQuality =
    liq != null && liq <= 40
      ? clip('Thin — clip size into prints & handoffs.', 92)
      : liq != null && liq >= 62
        ? clip('Fragmented — depth uneven across venues.', 92)
        : clip('Stable but not deep — avoid size spikes.', 92);

  const volBehavior =
    Number.isFinite(mins) && mins < 120 && vol != null && vol <= 50
      ? clip('Compression → expansion risk near catalyst.', 92)
      : vol != null && vol >= 58
        ? clip('Expansion live — tails & gaps in play.', 92)
        : vol != null && vol <= 42
          ? clip('Compressed — chop until range breaks.', 92)
          : clip('Mid-band — transitions beat directional drift.', 92);

  const correlationState =
    snap.correlation === 'Breaking'
      ? clip('Decoupling risk — leadership can rotate fast.', 92)
      : snap.correlation === 'Tight'
        ? clip('Tight linkage — shocks propagate across sleeves.', 92)
        : snap.correlation === 'Rotational'
          ? clip('Semi-linked — watch temporary decoupling.', 92)
          : clip('Mixed linkage — confirm impulse before size.', 92);

  const positioningPressure =
    snap.positioning === 'Crowded'
      ? clip('Crowded — unwind risk into catalyst window.', 92)
      : snap.positioning === 'Light'
        ? clip('Light — room to lean if liquidity holds.', 92)
        : clip('Balanced — no forced unwind yet.', 92);

  return [
    { label: 'Participation', text: participation },
    { label: 'Liquidity quality', text: liquidityQuality },
    { label: 'Vol behavior', text: volBehavior },
    { label: 'Correlation state', text: correlationState },
    { label: 'Positioning pressure', text: positioningPressure },
  ];
}

/** Desk-style risk framing — compact KV, same tone as execution context */
function buildRiskFramingLines() {
  return [
    { label: 'Upside risk', text: 'Weak — no aggressive chase without catalyst.' },
    { label: 'Downside risk', text: 'Limited — lack of forced positioning unwind.' },
    { label: 'Volatility risk', text: 'Event-driven — expansion only on trigger.' },
    { label: 'Liquidity risk', text: 'Moderate — depth can disappear during transitions.' },
  ];
}

function buildTraderEdgeLines(macroPhase, level, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;

  const a = clip(
    Number.isFinite(mins) && mins < 90
      ? 'Execution: react into prints · cut size pre-release.'
      : macroPhase.key === 'drift'
        ? 'Execution: scalp ranges · no swing adds.'
        : 'Execution: impulse when sleeves sync.',
    96,
  );

  const b = clip(
    level === 'HIGH'
      ? 'Risk: gap · slice orders through catalysts.'
      : level === 'LOW'
        ? 'Risk: chop · poor R/R without clock.'
        : 'Risk: narrative front-run · wait depth.',
    96,
  );

  const c = clip(
    Number.isFinite(mins) && mins < 60 ? 'Edge: calendar + fill quality.' : 'Edge: overlap · depth stacks.',
    88,
  );

  return [a, b, c];
}

/**
 * @param {object} showing - desk snapshot
 */
export function buildMacroTimingInflectionWindow(showing) {
  const sessionContext = showing?.sessionContext && typeof showing.sessionContext === 'object' ? showing.sessionContext : null;
  const outlookRiskContext =
    showing?.outlookRiskContext && typeof showing.outlookRiskContext === 'object' ? showing.outlookRiskContext : null;
  const riskEngine = showing?.riskEngine && typeof showing.riskEngine === 'object' ? showing.riskEngine : null;
  const marketPulse = showing?.marketPulse && typeof showing.marketPulse === 'object' ? showing.marketPulse : null;
  const crossAssetSignals = Array.isArray(showing?.crossAssetSignals) ? showing.crossAssetSignals : [];

  const macroPhase = deriveMacroPhaseLabel(sessionContext, riskEngine, marketPulse);
  const level = deriveInflectionLevel(riskEngine, crossAssetSignals);

  const desk = {
    ...showing,
    sessionContext,
    marketPulse,
    riskEngine,
    crossAssetSignals,
  };

  const activeTimingWindow = buildActiveTimingWindow(desk, macroPhase, riskEngine);
  const reason = buildInflectionReason(level, riskEngine, crossAssetSignals);
  const catalystLines = buildCatalystCompactLines(desk, macroPhase, outlookRiskContext, riskEngine);
  const marketStateSnapshot = buildMarketStateSnapshot(riskEngine, crossAssetSignals, macroPhase);

  return {
    activeTimingWindow,
    inflectionRisk: {
      level,
      reason,
      explanation: reason,
    },
    marketStateSnapshot,
    executionContext: buildExecutionContext(desk, macroPhase, riskEngine, marketStateSnapshot),
    catalystLines,
    expectedBehavior: buildExpectedBehavior(desk, macroPhase, outlookRiskContext, riskEngine),
    tradeConditionsMatrix: buildTradeConditionsMatrix(desk, macroPhase, riskEngine),
    traderEdgeLines: buildTraderEdgeLines(macroPhase, level, riskEngine),
    riskFraming: buildRiskFramingLines(),
    timingCompact: {
      lines: [activeTimingWindow.headline, activeTimingWindow.executionNote],
    },
    inflectionSummary: clip(reason, 140),
    inflectionLevel: level,
  };
}
