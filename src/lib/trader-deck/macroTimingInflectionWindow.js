/**
 * Macro Timing & Inflection Window — dense desk-derived intelligence for Market Outlook right rail.
 * Builds trader-grade copy from riskEngine, sessionContext, pulse, signals, drivers (no empty placeholders).
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

function deriveInnerPhase(sessionContext, riskEngine, marketPulse) {
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(sessionContext);
  const state = String(row?.state || '').toLowerCase();
  const tagHi = Array.isArray(row?.tags) && row.tags.some((t) => /high-impact|event/i.test(String(t)));
  const vol = riskEngine?.breakdown?.volatility != null ? Number(riskEngine.breakdown.volatility) : null;
  const pulseScore = marketPulse?.score != null ? Number(marketPulse.score) : null;

  if ((Number.isFinite(mins) && mins < 90) || state === 'event_sensitive' || tagHi) {
    return 'pre-event';
  }
  if (
    state === 'range_bound'
    || state === 'compressed'
    || (vol != null && vol <= 40 && (pulseScore == null || pulseScore <= 42))
  ) {
    return 'digestion';
  }
  return 'active';
}

/** Drift | Pre-event | Expansion | Post-event */
function deriveMacroPhaseLabel(sessionContext, riskEngine, marketPulse) {
  const inner = deriveInnerPhase(sessionContext, riskEngine, marketPulse);
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(sessionContext);
  const state = String(row?.state || '').toLowerCase();
  const vol = riskEngine?.breakdown?.volatility != null ? Number(riskEngine.breakdown.volatility) : null;
  const pulseScore = marketPulse?.score != null ? Number(marketPulse.score) : null;

  if ((Number.isFinite(mins) && mins < 120) || state === 'event_sensitive') {
    return { key: 'pre-event', label: 'Pre-event' };
  }
  if (inner === 'digestion' || state === 'range_bound' || state === 'compressed') {
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

function buildTimingLayers(showing, macroPhase, outlookRiskContext, riskEngine) {
  const sessionContext = showing.sessionContext;
  const marketPulse = showing.marketPulse || {};
  const pulseScore = marketPulse.score != null ? Number(marketPulse.score) : null;
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(sessionContext);
  const sessionLbl = currentSessionShortLabel(sessionContext?.currentSession);

  let intradayL1 = `Tape rhythm tracks ${sessionLbl || 'current'} liquidity — fade noise until depth confirms.`;
  let intradayL2 = '';
  if (Number.isFinite(mins) && mins < 360) {
    intradayL1 = `Next ~${mins}m skews tape toward event beta; trim holding periods into prints.`;
    intradayL2 = 'Intraday book: prioritize reaction fills over swing conviction.';
  } else if (pulseScore != null) {
    intradayL1 =
      pulseScore >= 62
        ? '0–6h: impulse risk rises — scales work best on pullback entries into depth.'
        : pulseScore <= 38
          ? '0–6h: grind regime — scratch quicker and lean on mean-reversion scalp windows.'
          : '0–6h: two-way chop risk — wait for sleeve alignment before leaning.';
    intradayL2 = row?.expectedBehaviour
      ? clip(String(row.expectedBehaviour), 118)
      : 'Watch realized pace vs overnight gap — mismatch flags intraday reversal.';
  }

  const sessionL1 =
    row?.sessionBias || row?.summary
      ? clip(`6–24h session arc: ${String(row.sessionBias || row.summary)}`, 132)
      : `6–24h: ${sessionLbl || 'Regional'} handoff sets carry — respect NY/London overlap skew.`;
  const sessionL2 = outlookRiskContext?.clusteringBehavior
    ? clip(String(outlookRiskContext.clusteringBehavior), 130)
    : 'Roll catalyst risk forward — cluster density shifts reward for sitting flat pre-print.';

  const regime = showing.marketRegime || {};
  const swingL1 = `1–3d swing lens: ${clip(String(regime.bias || regime.currentRegime || 'balanced tape'), 72)} versus weekly drift from pulse + sleeve stack.`;
  const swingL2 =
    macroPhase.key === 'drift'
      ? 'Swing trades need wider stops or smaller size until expansion confirms.'
      : macroPhase.key === 'pre-event'
        ? 'Swing exposure vulnerable to gap risk — hedge gamma into binary windows.'
        : 'Swing path favors continuation while macro dispersion stays bounded.';

  const phaseDetail =
    macroPhase.key === 'drift'
      ? 'Drift regime — prioritize ranges, fades, and smaller swing exposure until expansion confirms.'
      : macroPhase.key === 'pre-event'
        ? 'Pre-event — reduce gross into prints; trade reaction, not headline anticipation.'
        : macroPhase.key === 'post-event'
          ? 'Post-event — liquidity resets ranges; fade first spike if depth is thin.'
          : 'Expansion-friendly — impulse trades work when sleeves and liquidity align.';

  return {
    phaseLabel: macroPhase.label,
    phaseKey: macroPhase.key,
    phaseDetail,
    intraday: [intradayL1, intradayL2].filter(Boolean),
    sessionHorizon: [sessionL1, sessionL2].filter(Boolean),
    swing: [swingL1, swingL2].filter(Boolean),
  };
}

function buildInflectionDetail(level, showing, outlookRiskContext, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const drivers = Array.isArray(showing.keyDrivers) ? showing.keyDrivers : [];
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));

  const driverBullets = [];
  if (drivers.length === 0) {
    driverBullets.push('No single narrative dominates sleeve dispersion — reads stay tactical.');
  } else {
    const d0 = drivers[0];
    const lead = clip(String(d0?.name || d0?.title || 'Lead factor'), 48);
    driverBullets.push(
      clip(`${lead} anchors the desk narrative — downstream sleeves price its path.`, 118),
    );
  }
  const volN = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  driverBullets.push(
    volN != null && volN <= 42
      ? 'Realized volatility compressed versus recent impulse — ranges dominate timing.'
      : volN != null && volN >= 65
        ? 'Volatility elevated — shocks propagate faster across correlated sleeves.'
        : 'Volatility mid-range — transitions beat trend bets.',
  );
  driverBullets.push(
    uniq.size >= 3
      ? 'Cross-asset sleeves disagree — timing edge requires confirmation across majors.'
      : uniq.size <= 1 && signals.length >= 2
        ? 'Cross-asset sleeves aligned — cleaner impulse paths when liquidity stacks.'
        : 'Mixed sleeve skew — fade extremes until flow validates.',
  );

  const changeBullets = [];
  changeBullets.push(outlookRiskContext?.nextRiskWindow ? clip(`Calendar shock through ${clip(String(outlookRiskContext.nextRiskWindow), 80)}`, 118) : 'Data surprise versus consensus resets correlation packs.');
  changeBullets.push('Yield curve impulse breaks correlation regime — duration trades lead risk.');
  changeBullets.push('USD trend extension forces carry unwind — FX vol bleeds into equities.');
  if (breakdown.eventRisk != null && Number(breakdown.eventRisk) >= 62) {
    changeBullets.push('Macro calendar density spikes — tighten risk into clustered prints.');
  }

  return {
    level,
    drivers: driverBullets.slice(0, 4),
    whatChanges: changeBullets.slice(0, 4),
  };
}

const CATALYST_TYPES = ['MACRO', 'FLOW', 'LIQUIDITY', 'VOL', 'POSITIONING'];

function buildCatalystEntries(showing, macroPhase, outlookRiskContext, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const sessionContext = showing.sessionContext;
  const row = pickTimingSessionRow(sessionContext);
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const mins = riskEngine?.nextRiskEventInMins;

  const entries = [];

  entries.push({
    type: 'MACRO',
    title: 'Scheduled macro catalyst window',
    state: Number.isFinite(mins)
      ? `Desk clock shows next print inside ~${mins}m — variance concentrates around release.`
      : 'Macro prints follow economic calendar cadence — spacing sets drift vs shock.',
    trigger: 'Surprise versus consensus or revision to prior release.',
    marketReaction: 'Rates and USD reprice first; risk assets follow correlation beta within minutes.',
  });

  entries.push({
    type: 'VOL',
    title: 'Volatility compression / expansion hinge',
    state:
      breakdown.volatility != null
        ? `Vol radar at ${Math.round(Number(breakdown.volatility))}/100 — ${Number(breakdown.volatility) >= 58 ? 'tails active, widen stops.' : Number(breakdown.volatility) <= 40 ? 'ranges cheap — breakout risk builds.' : 'balanced — transitions dominate.'}`
        : 'Vol regime unsettled — treat ranges as temporary.',
    trigger: 'Realized vol accelerates vs implied or vice versa.',
    marketReaction: 'Gamma positioning unwinds — spot follows vol directional bias.',
  });

  entries.push({
    type: 'LIQUIDITY',
    title: 'Session liquidity handoff',
    state: row?.liquidityBias
      ? `Active bucket liquidity bias: ${String(row.liquidityBias)} — depth shifts at session rolls.`
      : breakdown.liquidity != null
        ? `Liquidity score ${Math.round(Number(breakdown.liquidity))}/100 — ${Number(breakdown.liquidity) <= 42 ? 'fragile fills on size.' : Number(breakdown.liquidity) >= 65 ? 'depth supports transitions.' : 'typical slippage profile.'}`
        : 'Liquidity transitions around NY/London stack drive execution quality.',
    trigger: 'Overlap ends or depth drops on venue holiday / half-day.',
    marketReaction: 'Widening spreads & gap risk — reduce carry into thin periods.',
  });

  entries.push({
    type: 'FLOW',
    title: 'Cross-asset sleeve impulse',
    state:
      signals.length > 0
        ? `${signals.length} active sleeves — ${new Set(signals.map((s) => normDirection(s.direction))).size >= 3 ? 'directional disagreement raises timing risk.' : 'alignment raises impulse quality into catalysts.'}`
        : 'Sleeve reads thin — wait for live sleeve stack before leaning.',
    trigger: 'Leader sleeve inverts vs prior session (e.g. rates vs equities).',
    marketReaction: 'Correlation regime flips — hedges and factor beta reorder fast.',
  });

  entries.push({
    type: 'POSITIONING',
    title: 'Convexity / hedging demand',
    state:
      macroPhase.key === 'pre-event'
        ? 'Event premium embedded — wings bid ahead of binary outcomes.'
        : 'Positioning balanced into drift — convexity cheap until catalyst clarifies.',
    trigger: 'Realized vol gaps vs implied — hedgers chase protection.',
    marketReaction: 'Vol surface steepens; spot mean-reverts harder post shock.',
  });

  entries.push({
    type: 'MACRO',
    title: 'Calendar clustering',
    state:
      outlookRiskContext?.clusteringBehavior
        ? clip(String(outlookRiskContext.clusteringBehavior), 140)
        : breakdown.clustering != null
          ? `Clustering score ${Math.round(Number(breakdown.clustering))}/100 — ${Number(breakdown.clustering) >= 58 ? 'prints bunch — variance stacks.' : 'prints spaced — narrative time to evolve.'}`
          : 'Macro events spaced for gradual repricing.',
    trigger: 'Back-to-back releases in same theme bucket.',
    marketReaction: 'Fat tails cluster — reduce gross into overlapping windows.',
  });

  entries.push({
    type: 'FLOW',
    title: 'Tape narrative velocity',
    state:
      Array.isArray(showing.marketChangesTimeline) && showing.marketChangesTimeline[0]
        ? clip(`Lead theme: ${String(showing.marketChangesTimeline[0].whatChanged || showing.marketChangesTimeline[0].title || 'rotation')}`, 132)
        : 'Theme velocity moderate — drift until fresh catalyst.',
    trigger: 'Headline shock or sector leadership flip.',
    marketReaction: 'Capital rotates sector/factor — fastest sleeve leads rest of session.',
  });

  entries.push({
    type: 'VOL',
    title: 'Geo / policy tail',
    state:
      breakdown.geopoliticalRisk != null
        ? `Geo radar ${Math.round(Number(breakdown.geopoliticalRisk))}/100 — ${Number(breakdown.geopoliticalRisk) >= 58 ? 'fat-tail headlines matter.' : 'background risk only.'}`
        : 'Policy tail latent — monitor headlines through NY.',
    trigger: 'Unexpected policy or sanction headline.',
    marketReaction: 'Risk-off bid into USD/gold/bonds — beta sleeves gap.',
  });

  return entries.slice(0, 8);
}

function buildFlowPositioning(showing, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const pulse = showing.marketPulse || {};
  const pulseN = pulse.score != null ? Number(pulse.score) : NaN;
  const align =
    signals.length >= 2
      ? new Set(signals.map((s) => normDirection(s.direction))).size <= 1
        ? 'aligned'
        : 'mixed'
      : 'thin';

  return {
    dealer: clip(
      `Dealer gamma / inventory skew inferred from liquidity score ${breakdown.liquidity != null ? Math.round(Number(breakdown.liquidity)) : '—'}/100 — ${Number(breakdown.liquidity) <= 42 ? 'balance-sheet caution into prints.' : 'books absorb two-way flow better.'}`,
      142,
    ),
    systematic: clip(
      `Systematic sleeve bias from pulse ${Number.isFinite(pulseN) ? Math.round(pulseN) : '—'}/100 — ${Number.isFinite(pulseN) && pulseN >= 62 ? 'trend followers add into impulse.' : Number.isFinite(pulseN) && pulseN <= 38 ? 'CTA/Vol-control reduce risk — drift lowers conviction.' : 'balanced systematic participation.'}`,
      142,
    ),
    crowding: clip(
      `Cross-asset alignment ${align} — ${align === 'aligned' ? 'crowding risk builds on consensus impulse.' : align === 'mixed' ? 'crowding diffuse — leadership rotates faster.' : 'insufficient sleeve depth to infer crowding.'}`,
      142,
    ),
    implication: clip(
      `${align === 'mixed' ? 'Prefer smaller size into transitions; confirm with depth.' : 'Lean into impulse only after macro clock clears — avoid front-running consensus.'}`,
      132,
    ),
  };
}

function buildVolatilityStructure(showing, outlookRiskContext, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const pulse = showing.marketPulse || {};
  const rv = breakdown.volatility != null ? Math.round(Number(breakdown.volatility)) : null;
  const ivProxy = pulse.score != null ? Math.round(Math.min(100, Math.max(0, Number(pulse.score) + (rv != null ? (rv - 50) * 0.3 : 0)))) : null;

  return {
    realized: rv != null ? `Desk realized-vol proxy ${rv}/100 — ${rv >= 62 ? 'elevated chop.' : rv <= 38 ? 'subdued ranges.' : 'mid regime.'}` : 'Realized vol proxy tracks pulse + risk radar.',
    implied: ivProxy != null ? `Implied stress proxy ${ivProxy}/100 from pulse skew — ${ivProxy >= 65 ? 'protection bid.' : ivProxy <= 40 ? 'complacency risk.' : 'balanced premium.'}` : 'Implied follows pulse versus macro clock.',
    regime: outlookRiskContext?.volatilityState
      ? clip(String(outlookRiskContext.volatilityState), 120)
      : breakdown.volatility != null
        ? Number(breakdown.volatility) >= 58
          ? 'Regime: expansion-prone — tails matter.'
          : Number(breakdown.volatility) <= 40
            ? 'Regime: compression — breakout setup building.'
            : 'Regime: transitional — range until catalyst.'
        : 'Regime: mixed — trade transitions.',
    implication:
      rv != null && rv >= 58
        ? 'Size down convexity — widen invalidation on vol spikes.'
        : rv != null && rv <= 40
          ? 'Lean on gamma shorts cautiously — shock risk rises into prints.'
          : 'Vol neutral — edge from timing sleeves, not vol direction.',
  };
}

function buildScenarios(showing, macroPhase, outlookRiskContext, riskEngine) {
  const pulse = showing.marketPulse || {};
  const outlook = pulse.outlookPulse && typeof pulse.outlookPulse === 'object' ? pulse.outlookPulse : null;
  const mins = riskEngine?.nextRiskEventInMins;

  const baseCase =
    outlook?.volatilityCondition
      ? clip(`BASE CASE: ${String(outlook.volatilityCondition)}`, 140)
      : `BASE CASE: ${macroPhase.label} tape — drift until ${Number.isFinite(mins) ? `next ~${mins}m catalyst` : 'calendar catalyst'} resets correlation.`;

  const ifFlow = `IF FLOW ENTERS: ${pulse.score != null && Number(pulse.score) >= 58 ? 'Impulse continuation — add on pullback into depth, trail stops.' : 'Wait for sleeve alignment — scale only after leader sleeve proves.'}`;

  const ifMacro = `IF MACRO HITS: ${outlookRiskContext?.nextRiskWindow ? clip(`Reprice rates/USD first — ${clip(String(outlookRiskContext.nextRiskWindow), 72)}`, 132) : 'Shock through calendar — fade first spike if liquidity thin.'}`;

  const failure = `FAILURE MODE: ${macroPhase.key === 'pre-event' ? 'Front-run headline — stopped on mean reversion.' : 'Chase drift without clock — chopped on false breaks.'}`;

  return { baseCase: clip(baseCase, 160), ifFlowEnters: clip(ifFlow, 160), ifMacroHits: clip(ifMacro, 160), failureMode: clip(failure, 160) };
}

function buildTraderEdge(macroPhase, level, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;
  return {
    primary:
      Number.isFinite(mins) && mins < 90
        ? 'Primary: trade reaction windows only — reduce into binary prints.'
        : macroPhase.key === 'drift'
          ? 'Primary: mean-reversion scalps with tight risk — avoid swing adds.'
          : 'Primary: impulse continuation on sleeve alignment post-London open.',
    secondary:
      level === 'HIGH'
        ? 'Secondary: hedge correlation tail — reduce gross into overlap.'
        : 'Secondary: scale beta only after macro clock passes.',
    execution:
      level === 'LOW'
        ? 'Execution: work limits in depth — avoid market in thin prints.'
        : 'Execution: slice size across 15–30m — reduce slippage into catalysts.',
    avoid:
      macroPhase.key === 'pre-event'
        ? 'Avoid: naked delta into headline — no hero trades pre-release.'
        : 'Avoid: chasing gap without depth confirmation.',
  };
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

  return {
    timingLayers: buildTimingLayers(desk, macroPhase, outlookRiskContext, riskEngine),
    inflection: buildInflectionDetail(level, desk, outlookRiskContext, riskEngine),
    catalystEntries: buildCatalystEntries(desk, macroPhase, outlookRiskContext, riskEngine),
    flowPositioning: buildFlowPositioning(desk, riskEngine),
    volatilityStructure: buildVolatilityStructure(desk, outlookRiskContext, riskEngine),
    scenarios: buildScenarios(desk, macroPhase, outlookRiskContext, riskEngine),
    traderEdge: buildTraderEdge(macroPhase, level, riskEngine),
  };
}
