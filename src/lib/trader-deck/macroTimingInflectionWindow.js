/**
 * Macro Timing & Inflection Window — compact terminal-style lines for Market Outlook right rail.
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

/** Max 2 lines — no intraday/session/swing breakdown */
function buildTimingCompact(showing, macroPhase, riskEngine) {
  const sessionLbl = currentSessionShortLabel(showing.sessionContext?.currentSession);
  const mins = riskEngine?.nextRiskEventInMins;
  const line1 = Number.isFinite(mins)
    ? clip(`${macroPhase.label} · next catalyst ~${mins}m — trade reaction, not front-run.`, 132)
    : clip(`${macroPhase.label} · macro clock follows calendar cadence.`, 132);
  const row = pickTimingSessionRow(showing.sessionContext);
  const line2 = row?.liquidityBias
    ? clip(`${sessionLbl || 'Session'} liquidity ${String(row.liquidityBias)} — size to depth on handoffs.`, 132)
    : clip(`${sessionLbl || 'Active'} window — align sleeves before leaning directional.`, 132);
  return { lines: [line1, line2] };
}

/** Single-line inflection summary */
function buildInflectionSummary(level, showing, riskEngine) {
  const drivers = Array.isArray(showing.keyDrivers) ? showing.keyDrivers : [];
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const volN = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const lev = level === 'HIGH' ? 'High' : level === 'LOW' ? 'Low' : 'Medium';
  const volPhrase =
    volN != null && volN <= 42 ? 'vol contained' : volN != null && volN >= 62 ? 'vol elevated' : 'vol mid-band';
  const dom =
    drivers[0] && (drivers[0].name || drivers[0].title)
      ? `${clip(String(drivers[0].name || drivers[0].title), 36)} leads narrative`
      : 'no dominant macro driver';
  return clip(`${lev} — ${dom}, ${volPhrase}.`, 140);
}

/** Max 6 single-line rows: [TYPE] insight — implication */
function buildCatalystLinesCompact(showing, macroPhase, outlookRiskContext, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(showing.sessionContext);
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));
  const volR = breakdown.volatility != null ? Math.round(Number(breakdown.volatility)) : null;
  const liqR = breakdown.liquidity != null ? Math.round(Number(breakdown.liquidity)) : null;
  const clR = breakdown.clustering != null ? Math.round(Number(breakdown.clustering)) : null;

  const lines = [];

  lines.push(
    clip(
      `[MACRO] ${Number.isFinite(mins) ? `~${mins}m to print` : 'calendar window'} — USD/rates reprice first on surprise.`,
      118,
    ),
  );

  lines.push(
    clip(
      `[LIQUIDITY] ${row?.liquidityBias ? `${String(row.liquidityBias)} bias` : 'session roll'} — slippage rises when depth thins.`,
      118,
    ),
  );

  lines.push(
    clip(
      `[VOL] radar ${volR != null ? `${volR}/100` : '—'} — ${volR != null && volR >= 58 ? 'tail risk on' : volR != null && volR <= 40 ? 'range chop' : 'transitions matter'}.`,
      118,
    ),
  );

  lines.push(
    clip(
      `[MACRO] ${clR != null ? `cluster ${clR}/100` : 'release spacing'} — ${clR != null && clR >= 58 ? 'variance stacks' : 'drift between prints'}.`,
      118,
    ),
  );

  lines.push(
    clip(
      `[FLOW] ${signals.length ? `${uniq.size}-way sleeve mix` : 'thin sleeves'} — ${uniq.size >= 3 ? 'wait for confirmation' : 'cleaner impulse if aligned'}.`,
      118,
    ),
  );

  lines.push(
    clip(
      `[POSITIONING] ${macroPhase.key === 'pre-event' ? 'event premium bid' : 'convexity quiet'} — ${macroPhase.key === 'pre-event' ? 'trim gross pre-release' : 'add gamma on impulse'}.`,
      118,
    ),
  );

  lines.push(
    clip(
      `[GEO] ${breakdown.geopoliticalRisk != null ? `risk ${Math.round(Number(breakdown.geopoliticalRisk))}/100` : 'policy tail'} — ${breakdown.geopoliticalRisk != null && Number(breakdown.geopoliticalRisk) >= 58 ? 'headline gaps' : 'background only'}.`,
      118,
    ),
  );

  const tl0 = Array.isArray(showing.marketChangesTimeline) ? showing.marketChangesTimeline[0] : null;
  const tape = tl0 && (tl0.whatChanged || tl0.title);
  lines.push(
    clip(
      `[FLOW] ${tape ? clip(String(tape), 40) : 'theme drift'} — rotate capital on leadership flip.`,
      118,
    ),
  );

  return lines.slice(0, 8);
}

/** 2–4 short lines */
function buildExpectedBehaviorCompact(showing, macroPhase, outlookRiskContext, riskEngine) {
  const pulse = showing.marketPulse || {};
  const outlook = pulse.outlookPulse && typeof pulse.outlookPulse === 'object' ? pulse.outlookPulse : null;
  const mins = riskEngine?.nextRiskEventInMins;
  const out = [];

  if (outlook?.volatilityCondition) {
    out.push(clip(`Base: ${String(outlook.volatilityCondition)}`, 110));
  } else {
    out.push(
      clip(
        `Base: ${macroPhase.label} tape until ${Number.isFinite(mins) ? `~${mins}m catalyst` : 'next print'}.`,
        110,
      ),
    );
  }

  out.push(
    clip(
      pulse.score != null && Number(pulse.score) >= 58
        ? 'If flow enters: continuation on depth, trail stops.'
        : 'If flow enters: scale only after leader sleeve proves.',
      110,
    ),
  );

  out.push(
    clip(
      outlookRiskContext?.nextRiskWindow
        ? `If macro hits: reprice core first — ${clip(String(outlookRiskContext.nextRiskWindow), 56)}`
        : 'If macro hits: fade spike if liquidity thin.',
      118,
    ),
  );

  out.push(
    clip(
      macroPhase.key === 'pre-event'
        ? 'Failure: headline chase without fill quality.'
        : 'Failure: sizing drift without a clock.',
      96,
    ),
  );

  return out.slice(0, 4);
}

/** Up to 4 concise lines — UI scales 2–4 */
function buildTraderEdgeLines(macroPhase, level, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;
  const lines = [];

  lines.push(
    clip(
      Number.isFinite(mins) && mins < 90
        ? 'React into prints — cut size pre-binary; add on follow-through.'
        : macroPhase.key === 'drift'
          ? 'Mean-revert scalps only — no swing adds until expansion.'
          : 'Impulse when sleeves align — skip narrative front-run.',
      120,
    ),
  );

  lines.push(
    clip(
      level === 'HIGH'
        ? 'Hedge correlation tail; slice orders through catalysts.'
        : level === 'LOW'
          ? 'Work limits in depth; avoid market in thin tape.'
          : 'Scale after macro clock clears; confirm with depth.',
      120,
    ),
  );

  lines.push(
    clip(
      macroPhase.key === 'pre-event'
        ? 'Avoid naked delta into headline windows.'
        : 'Avoid chasing gaps without liquidity confirmation.',
      110,
    ),
  );

  lines.push(
    clip(
      Number.isFinite(mins) && mins < 45
        ? 'Clock compression — prioritize fill quality over direction.'
        : 'Patience into overlap — depth stacks edge.',
      100,
    ),
  );

  return lines.slice(0, 4);
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
    timingCompact: buildTimingCompact(desk, macroPhase, riskEngine),
    inflectionSummary: buildInflectionSummary(level, desk, riskEngine),
    inflectionLevel: level,
    catalystLines: buildCatalystLinesCompact(desk, macroPhase, outlookRiskContext, riskEngine),
    expectedBehavior: buildExpectedBehaviorCompact(desk, macroPhase, outlookRiskContext, riskEngine),
    traderEdgeLines: buildTraderEdgeLines(macroPhase, level, riskEngine),
  };
}
