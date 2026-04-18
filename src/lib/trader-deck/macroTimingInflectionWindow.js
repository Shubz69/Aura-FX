/**
 * Derived "Macro timing & inflection" copy for Market Outlook right rail.
 * Timing-focused wording; avoids repeating verbatim strings from Risk / Session / Signals panels where possible.
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

/** Pick session row most relevant to timing (overlap → NY, else match current). */
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

/**
 * @returns {'pre-event'|'active'|'digestion'}
 */
function derivePhase(sessionContext, riskEngine, marketPulse) {
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(sessionContext);
  const state = String(row?.state || '').toLowerCase();
  const tagHi = Array.isArray(row?.tags) && row.tags.some((t) => /high-impact|event/i.test(String(t)));

  if ((Number.isFinite(mins) && mins < 90) || state === 'event_sensitive' || tagHi) {
    return 'pre-event';
  }
  const vol = riskEngine?.breakdown?.volatility != null ? Number(riskEngine.breakdown.volatility) : null;
  const pulseScore = marketPulse?.score != null ? Number(marketPulse.score) : null;
  if (
    state === 'range_bound'
    || state === 'compressed'
    || (vol != null && vol <= 40 && (pulseScore == null || pulseScore <= 42))
  ) {
    return 'digestion';
  }
  return 'active';
}

function phaseLabel(phase) {
  if (phase === 'pre-event') return 'Pre-event';
  if (phase === 'digestion') return 'Digestion';
  return 'Active';
}

/** Inflection risk: volatility + clustering + cross-sleeve dispersion (not exposed elsewhere as one label). */
function deriveInflectionRisk(riskEngine, crossAssetSignals) {
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
  if (score >= 62) return 'High';
  if (score >= 44) return 'Medium';
  return 'Low';
}

function nextRiskTimingLine(outlookRiskContext, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;
  if (Number.isFinite(mins)) {
    return mins < 120
      ? `Next catalyst clock ~${mins}m — tighten execution discipline.`
      : `Next macro catalyst ~${mins}m on desk clock.`;
  }
  const orcLine = outlookRiskContext && String(outlookRiskContext.nextRiskWindow || '').trim();
  if (orcLine) return clip(orcLine, 96);
  return 'Macro clock follows your economic calendar — anchor risk to prints.';
}

function sessionTimingLine(sessionContext) {
  const windowLabel = currentSessionShortLabel(sessionContext?.currentSession);
  const row = pickTimingSessionRow(sessionContext);
  const parts = [];
  if (windowLabel) parts.push(`${windowLabel} session`);
  if (row?.liquidityBias) parts.push(`liquidity ${String(row.liquidityBias)}`);
  else if (row?.volatilityState) parts.push(`vol ${String(row.volatilityState)}`);
  if (!parts.length) return 'Session tape: use overlap depth when London–NY stack.';
  return clip(parts.join(' · '), 120);
}

/** 3–6 catalyst rows; wording skewed to timing / transitions (not driver headlines). */
function buildCatalystRows(showing, phase) {
  const rows = [];
  const breakdown = showing.riskEngine?.breakdown && typeof showing.riskEngine.breakdown === 'object'
    ? showing.riskEngine.breakdown
    : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const clustering = breakdown.clustering != null ? Number(breakdown.clustering) : null;
  const liquidity = breakdown.liquidity != null ? Number(breakdown.liquidity) : null;

  if (clustering != null) {
    rows.push({
      bucket: 'macro',
      text:
        clustering >= 62
          ? 'Prints landing close together — variance can spike in short windows.'
          : clustering <= 38
            ? 'Prints spaced out — narratives can drift between checkpoints.'
            : 'Release pacing looks typical — size changes on confirmation.',
    });
  }

  if (vol != null) {
    rows.push({
      bucket: 'macro',
      text:
        vol >= 66
          ? 'Vol radar hot — prioritize reaction windows over prediction.'
          : vol <= 38
            ? 'Vol radar calm — timing favors ranges until the next impulse.'
            : 'Vol radar mid-band — transitions matter more than direction calls.',
    });
  }

  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const dirs = signals.map((s) => normDirection(s.direction));
  const uniq = new Set(dirs);
  if (signals.length >= 2) {
    rows.push({
      bucket: 'flow',
      text:
        uniq.size >= 3
          ? 'Sleeves diverging — sync entries with cross-asset confirmation.'
          : uniq.size <= 1
            ? 'Sleeves aligned — cleaner impulse windows when liquidity stacks.'
            : 'Two-way sleeve mix — fade extremes until flow proves.',
    });
  }

  const row = pickTimingSessionRow(showing.sessionContext);
  if (row?.liquidityBias) {
    rows.push({
      bucket: 'liquidity',
      text: `Handoff bias: ${String(row.liquidityBias)} — watch depth on transitions.`,
    });
  } else if (liquidity != null) {
    rows.push({
      bucket: 'liquidity',
      text:
        liquidity <= 42
          ? 'Liquidity fragile — reduce size through session changes.'
          : liquidity >= 68
            ? 'Liquidity robust — transitions should absorb flow more evenly.'
            : 'Liquidity neutral — usual slippage around macro clocks.',
    });
  }

  const tl = Array.isArray(showing.marketChangesTimeline) ? showing.marketChangesTimeline[0] : null;
  const tapeHook = tl && (tl.whatChanged || tl.title);
  if (tapeHook && phase !== 'digestion') {
    rows.push({
      bucket: 'flow',
      text: clip(`Tape clock focus: ${String(tapeHook)}`, 118),
    });
  }

  const dedup = [];
  const seen = new Set();
  for (const r of rows) {
    const k = `${r.bucket}:${r.text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(r);
  }

  const fallbacks = [
    { bucket: 'macro', text: 'Anchor risk to scheduled catalysts — drift trades carry timing tax.' },
    { bucket: 'flow', text: 'Rotate attention with session depth — Asia drift vs NY resolution.' },
    { bucket: 'liquidity', text: 'Transitions matter: scale down when depth thins between prints.' },
  ];
  let fi = 0;
  while (dedup.length < 3 && fi < fallbacks.length) {
    const r = fallbacks[fi++];
    const k = `${r.bucket}:${r.text}`;
    if (!seen.has(k)) {
      seen.add(k);
      dedup.push(r);
    }
  }

  return dedup.slice(0, 6);
}

function expectedBehaviorLines(showing, phase) {
  const pulse = showing.marketPulse || {};
  const outlook = pulse.outlookPulse && typeof pulse.outlookPulse === 'object' ? pulse.outlookPulse : null;
  const score = pulse.score != null ? Number(pulse.score) : null;

  const lines = [];
  if (outlook?.volatilityCondition) {
    lines.push(clip(String(outlook.volatilityCondition), 132));
  } else if (score != null) {
    lines.push(
      score >= 68
        ? 'Tape biased to wider ranges — reactions over forecasts.'
        : score <= 36
          ? 'Tape biased to drift — patience until a catalyst resets vol.'
          : 'Tape balanced — transitions carry most of the edge.',
    );
  }

  if (phase === 'pre-event') {
    lines.push('Expect two-way liquidity into prints — fade headlines without fills.');
  } else if (phase === 'digestion') {
    lines.push('Expect mean-reversion skew until the next liquidity handoff.');
  } else {
    lines.push('Expect trend fragments rather than clean stretches — trade time slices.');
  }

  return lines.slice(0, 2).map((s) => clip(s, 160));
}

function traderInsightSentence(phase, inflection, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;
  if (phase === 'pre-event' && inflection === 'High') {
    return 'Engage smaller until the print clears — add only on confirmed follow-through.';
  }
  if (phase === 'digestion' && inflection === 'Low') {
    return 'Stay patient — lean on scales and wait for the next volatility reset.';
  }
  if (phase === 'active' && inflection === 'Medium') {
    return 'Trade windows, not narratives — lean in when sleeves and liquidity align.';
  }
  if (Number.isFinite(mins) && mins < 45) {
    return 'Risk clocks compress here — prioritize reaction quality over directional bets.';
  }
  return inflection === 'High'
    ? 'Volatility skew is elevated — lighten into transitions; add after confirmation.'
    : 'Timing edge is selective — engage on liquidity stacks, stand down in the chop.';
}

/**
 * @param {object} showing - desk snapshot (sessionContext, outlookRiskContext, riskEngine, marketPulse, crossAssetSignals, marketChangesTimeline)
 */
export function buildMacroTimingInflectionWindow(showing) {
  const sessionContext = showing?.sessionContext && typeof showing.sessionContext === 'object' ? showing.sessionContext : null;
  const outlookRiskContext =
    showing?.outlookRiskContext && typeof showing.outlookRiskContext === 'object' ? showing.outlookRiskContext : null;
  const riskEngine = showing?.riskEngine && typeof showing.riskEngine === 'object' ? showing.riskEngine : null;
  const marketPulse = showing?.marketPulse && typeof showing.marketPulse === 'object' ? showing.marketPulse : null;
  const crossAssetSignals = Array.isArray(showing?.crossAssetSignals) ? showing.crossAssetSignals : [];

  const phase = derivePhase(sessionContext, riskEngine, marketPulse);
  const inflection = deriveInflectionRisk(riskEngine, crossAssetSignals);

  return {
    phase,
    phaseLabel: phaseLabel(phase),
    nextRiskLine: nextRiskTimingLine(outlookRiskContext, riskEngine),
    sessionLine: sessionTimingLine(sessionContext),
    inflectionRisk: inflection,
    catalystRows: buildCatalystRows({ ...showing, sessionContext }, phase),
    expectedBehavior: expectedBehaviorLines(showing, phase),
    traderInsight: traderInsightSentence(phase, inflection, riskEngine),
  };
}
