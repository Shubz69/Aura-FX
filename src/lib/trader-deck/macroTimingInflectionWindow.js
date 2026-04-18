/**
 * Macro Timing & Inflection Window — terminal-style decision engine for Market Outlook right rail.
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
  const sessionLbl = currentSessionShortLabel(showing.sessionContext?.currentSession);
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(showing.sessionContext);
  const cond = deriveSessionConditionLabel(showing.sessionContext, riskEngine);
  const status = deriveActiveStatus(macroPhase, riskEngine);

  const timeToCatalyst = Number.isFinite(mins)
    ? clip(`~${mins}m to next macro catalyst`, 72)
    : clip('No imminent catalyst — follow calendar cadence.', 72);

  const exec =
    status === 'Pre-catalyst'
      ? clip('Trade the reaction window — shrink before the print, resize on clean follow-through.', 118)
      : cond === 'Thin'
        ? clip('Size to depth; avoid sweeping illiquid legs until tape proves.', 118)
        : clip('Align sleeves first — impulse trades only when cross-asset agrees.', 118);

  return {
    status,
    timeToCatalyst,
    sessionCondition: cond,
    sessionLabel: sessionLbl || 'Session',
    executionImplication: exec,
  };
}

function buildInflectionExplanation(level, showing, riskEngine, crossAssetSignals) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const cl = breakdown.clustering != null ? Number(breakdown.clustering) : null;
  const signals = Array.isArray(crossAssetSignals) ? crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));

  const volPart =
    vol != null && vol >= 58 ? 'elevated realized/risk proxies raise gap risk' : vol != null && vol <= 40 ? 'compressed realized vol favors mean-revert chop' : 'vol mid-band keeps ranges negotiable';

  const corrPart =
    cl != null && cl >= 58 ? 'risk factors clustering — sleeves likely to move together' : cl != null && cl <= 40 ? 'correlation structure loosening — leadership can rotate fast' : 'factor linkage neutral — confirmation still required';

  const sleevePart =
    uniq.size >= 3 ? 'cross-asset directions diverging — impulse trades need cleaner confirmation' : uniq.size === 2 ? 'two-way tape — lean on leaders, not breadth' : 'directional sleeves more aligned — cleaner impulse if liquidity holds';

  return clip(`Why: ${volPart}; ${corrPart}; ${sleevePart}.`, 200);
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
  else if (uniq.size <= 1 && (cl != null && cl >= 55)) positioning = 'Crowded';

  return { volRegime, liquidity, correlation, positioning };
}

function buildCatalystItems(showing, macroPhase, outlookRiskContext, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(showing.sessionContext);
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));
  const volR = breakdown.volatility != null ? Math.round(Number(breakdown.volatility)) : null;
  const liqR = breakdown.liquidity != null ? Math.round(Number(breakdown.liquidity)) : null;
  const clR = breakdown.clustering != null ? Math.round(Number(breakdown.clustering)) : null;
  const tl0 = Array.isArray(showing.marketChangesTimeline) ? showing.marketChangesTimeline[0] : null;
  const tape = tl0 && (tl0.whatChanged || tl0.title);
  const drivers = Array.isArray(showing.keyDrivers) ? showing.keyDrivers : [];
  const dom = drivers[0] && (drivers[0].name || drivers[0].title) ? String(drivers[0].name || drivers[0].title) : null;

  return [
    {
      tag: 'MACRO',
      title: 'Catalyst clock',
      state: Number.isFinite(mins) ? `Event window open (~${mins}m)` : 'Calendar-driven cadence',
      trigger: clip(outlookRiskContext?.nextRiskWindow ? String(outlookRiskContext.nextRiskWindow) : 'scheduled macro / policy prints', 64),
      reaction: clip('USD & rates reprice first; risk follows depth.', 80),
    },
    {
      tag: 'VOL',
      title: 'Compression / expansion',
      state: volR != null ? `Vol radar ${volR}/100` : 'Vol radar —',
      trigger: volR != null && volR >= 58 ? 'realized lift + event tail' : volR != null && volR <= 40 ? 'pinned realized — range drift' : 'transition risk',
      reaction: volR != null && volR >= 58 ? clip('Tail/gamma matters — shrink gross into binary windows.', 80) : clip('Transitions > direction — trade ranges until break.', 80),
    },
    {
      tag: 'LIQUIDITY',
      title: 'Session handoff',
      state: row?.liquidityBias ? `${String(row.liquidityBias)} bias` : 'Session roll',
      trigger: clip(row?.state ? String(row.state).replace(/_/g, ' ') : 'liquidity profile', 56),
      reaction: clip('Slippage rises when depth thins — scale into depth, not headlines.', 80),
    },
    {
      tag: 'FLOW',
      title: 'Cross-asset impulse',
      state: signals.length ? `${uniq.size}-way sleeve mix` : 'Thin sleeve evidence',
      trigger: tape ? clip(String(tape), 48) : 'theme leadership',
      reaction: clip(uniq.size >= 3 ? 'Wait for confirmation — dispersion high.' : 'Cleaner impulse if sleeves align.', 80),
    },
    {
      tag: 'POSITIONING',
      title: 'Convexity / hedging',
      state: macroPhase.key === 'pre-event' ? 'Event premium bid' : 'Convexity quieter',
      trigger: macroPhase.key === 'pre-event' ? 'binary risk into print' : 'post-drift positioning',
      reaction: clip(macroPhase.key === 'pre-event' ? 'Trim gross pre-release; respect gap risk.' : 'Add on follow-through, not headlines.', 80),
    },
    {
      tag: 'GEO',
      title: 'Geopolitical tail',
      state:
        breakdown.geopoliticalRisk != null ? `Risk gauge ${Math.round(Number(breakdown.geopoliticalRisk))}/100` : 'Policy / headline tail',
      trigger: breakdown.geopoliticalRisk != null && Number(breakdown.geopoliticalRisk) >= 58 ? 'headline-sensitive tape' : 'background risk',
      reaction: clip(breakdown.geopoliticalRisk != null && Number(breakdown.geopoliticalRisk) >= 58 ? 'Gap risk — widen stops / reduce size.' : 'Monitor — not primary driver.', 80),
    },
    {
      tag: 'USD / RATES',
      title: 'Dominant macro driver',
      state: dom ? clip(dom, 42) + ' leads' : 'No single dominant driver',
      trigger: clip(liqR != null ? `Liquidity factor ${liqR}/100` : 'curve & front-end path', 56),
      reaction: clip('Fiat leg sets the release — FX first, beta second.', 80),
    },
    {
      tag: 'MACRO',
      title: 'Release spacing',
      state: clR != null ? `Clustering ${clR}/100` : 'Print spacing',
      trigger: clR != null && clR >= 58 ? 'stacked variance windows' : 'drift between reports',
      reaction: clip(clR != null && clR >= 58 ? 'Variance stacks — reduce overlapping risk.' : 'Mean-revert between prints if vol contained.', 80),
    },
  ];
}

function buildExpectedBehavior(showing, macroPhase, outlookRiskContext, riskEngine) {
  const pulse = showing.marketPulse || {};
  const outlook = pulse.outlookPulse && typeof pulse.outlookPulse === 'object' ? pulse.outlookPulse : null;
  const mins = riskEngine?.nextRiskEventInMins;
  const out = [];

  if (outlook?.volatilityCondition) {
    out.push(clip(`Base case: ${String(outlook.volatilityCondition)}`, 118));
  } else {
    out.push(
      clip(`Base case: ${macroPhase.label} tape until ${Number.isFinite(mins) ? `~${mins}m catalyst` : 'next macro print'}.`, 118),
    );
  }

  out.push(
    clip(
      pulse.score != null && Number(pulse.score) >= 58
        ? 'Conditional: if flow commits, favor continuation where depth stacks; trail risk.'
        : 'Conditional: if flow waits, fade noise — scale only after leadership proves.',
      118,
    ),
  );

  out.push(
    clip(
      outlookRiskContext?.nextRiskWindow
        ? `If macro hits: reprice core rates/USD first — ${clip(String(outlookRiskContext.nextRiskWindow), 56)}`
        : 'If macro hits: fade volatility spike if liquidity is thin — wait for fills.',
      118,
    ),
  );

  out.push(
    clip(
      macroPhase.key === 'pre-event'
        ? 'Failure case: chasing headlines without fill quality or defined invalidation.'
        : 'Failure case: sizing drift without a catalyst clock — narrative without depth.',
      118,
    ),
  );

  return out.slice(0, 4);
}

function buildTradeConditionsMatrix(showing, macroPhase, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const mins = riskEngine?.nextRiskEventInMins;
  const sessionRow = pickTimingSessionRow(showing.sessionContext);
  const liqThin = breakdown.liquidity != null && Number(breakdown.liquidity) <= 42;

  const breakout =
    vol != null && vol >= 55 && !liqThin
      ? clip('Valid on range break with volume & cross-asset confirmation; trail after first pullback holds.', 130)
      : macroPhase.key === 'expansion'
        ? clip('Valid when expansion regime + active session — confirm with rates/USD leadership.', 130)
        : clip('Valid only after impulse clears prior balance with sustained depth — otherwise fade fake breaks.', 130);

  const meanRev =
    vol != null && vol <= 48 || macroPhase.key === 'drift'
      ? clip('Valid in compressed tape / drift — fade extremes inside prior balance; tighten if clustering rises.', 130)
      : clip('Valid when vol contracts post-event — sell rips into thin air until range re-establishes.', 130);

  const noTrade =
    Number.isFinite(mins) && mins < 45 && liqThin
      ? clip('No-trade: inside binary window with thin liquidity — binary event risk dominates edge.', 130)
      : uniqSessionAmbiguous(sessionRow)
        ? clip('No-trade: session transition / ambiguous leadership — wait for cleaner sleeve alignment.', 130)
        : clip('No-trade: conflicting cross-asset signals + mid vol — reduce until catalyst or clarity.', 130);

  return { breakout, meanReversion: meanRev, noTradeZone: noTrade };
}

function uniqSessionAmbiguous(row) {
  if (!row) return false;
  const s = String(row.state || '').toLowerCase();
  return s === 'event_sensitive' || s === 'overlap';
}

function buildTraderEdgeLines(macroPhase, level, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;
  const lines = [];

  lines.push(
    clip(
      Number.isFinite(mins) && mins < 90
        ? 'Execution: react into prints — cut size pre-release; add only on clean continuation.'
        : macroPhase.key === 'drift'
          ? 'Execution: mean-revert scalps only — no swing adds until expansion confirms.'
          : 'Execution: trade impulse when sleeves align — scale after depth confirms.',
      120,
    ),
  );

  lines.push(
    clip(
      level === 'HIGH'
        ? 'Avoid: correlated gap risk — slice size through catalyst stacks; hedge tail.'
        : level === 'LOW'
          ? 'Avoid: overtrading quiet tape — poor R/R in chop without a clock.'
          : 'Avoid: front-running narrative without liquidity — wait for the move, not the story.',
      120,
    ),
  );

  lines.push(
    clip(
      Number.isFinite(mins) && mins < 60
        ? 'Edge: fill quality & reaction discipline — calendar defines the window.'
        : 'Edge: patience into overlap — depth stacks when sleeves sync.',
      110,
    ),
  );

  return lines.slice(0, 3);
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
  const catalystItems = buildCatalystItems(desk, macroPhase, outlookRiskContext, riskEngine);

  return {
    activeTimingWindow,
    inflectionRisk: {
      level,
      explanation: buildInflectionExplanation(level, desk, riskEngine, crossAssetSignals),
    },
    marketStateSnapshot: buildMarketStateSnapshot(riskEngine, crossAssetSignals, macroPhase),
    catalystItems,
    expectedBehavior: buildExpectedBehavior(desk, macroPhase, outlookRiskContext, riskEngine),
    tradeConditionsMatrix: buildTradeConditionsMatrix(desk, macroPhase, riskEngine),
    traderEdgeLines: buildTraderEdgeLines(macroPhase, level, riskEngine),
    /** Legacy keys — safe for older callers */
    timingCompact: {
      lines: [
        `${activeTimingWindow.status} · ${activeTimingWindow.timeToCatalyst}`,
        `${activeTimingWindow.sessionLabel} · ${activeTimingWindow.sessionCondition} session`,
      ],
    },
    inflectionSummary: clip(buildInflectionExplanation(level, desk, riskEngine, crossAssetSignals), 140),
    inflectionLevel: level,
    catalystLines: catalystItems.map(
      (it) =>
        `[${it.tag}] ${it.title} — ${it.state}; ${it.trigger} → ${it.reaction}`,
    ),
  };
}
