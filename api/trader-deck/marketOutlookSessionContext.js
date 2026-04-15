/**
 * Deterministic FX session context for Market Outlook.
 * Rule-based only — uses calendar rows (with _ms/_score), cross-asset directions, VIX, SPX daily %,
 * treasury recent move, pulse/risk breakdown. No fabricated levels or AI copy.
 */

const STATE_LABELS = {
  range_bound: 'Range-bound',
  expansion_likely: 'Expansion likely',
  trend_continuation: 'Trend continuation',
  reversal_risk: 'Reversal risk',
  compressed: 'Compressed',
  choppy: 'Choppy',
  event_sensitive: 'Event-sensitive',
  liquidity_build: 'Liquidity build',
  inactive: 'Inactive',
};

function hourUtc(ms) {
  return new Date(ms).getUTCHours();
}

/** @returns {'asia'|'london'|'new_york'|'overlap'|'closed'} */
function resolveCurrentSession(utcMs) {
  if (isWeekendUtc(utcMs)) return 'closed';
  const h = hourUtc(utcMs);
  if (h >= 13 && h < 17) return 'overlap';
  if (h >= 8 && h < 13) return 'london';
  if (h >= 17 && h < 22) return 'new_york';
  if (h >= 22 || h < 8) return 'asia';
  return 'closed';
}

function isWeekendUtc(utcMs) {
  const d = new Date(utcMs).getUTCDay();
  return d === 0 || d === 6;
}

function countryToken(r) {
  return String(r.category || r.currency || '').toLowerCase();
}

function isHighImpactRow(r) {
  const imp = String(r.impact || r.severity || '').toLowerCase();
  return imp === 'high' || (r._score != null && r._score >= 70);
}

/** Next high-impact-style event within window (minutes from ref). */
function nextHighImpactEtaMinutes(rows, refMs, horizonMs) {
  const end = refMs + horizonMs;
  let best = null;
  for (const r of rows) {
    const ms = r._ms;
    if (!ms || Number.isNaN(ms) || ms < refMs || ms > end) continue;
    if (!isHighImpactRow(r)) continue;
    const mins = Math.round((ms - refMs) / 60000);
    if (best == null || mins < best) best = mins;
  }
  return best;
}

function countRegionalHighImpact(rows, refMs, horizonMs, regionTest) {
  const end = refMs + horizonMs;
  let n = 0;
  for (const r of rows) {
    const ms = r._ms;
    if (!ms || ms < refMs || ms > end) continue;
    if (!isHighImpactRow(r)) continue;
    if (regionTest && !regionTest(r)) continue;
    n += 1;
  }
  return n;
}

function isApacish(r) {
  const c = countryToken(r);
  return /jp|japan|au|australia|nz|new zealand|cn|china|hk|hong|sg|singapore/.test(c);
}

function isEuUkish(r) {
  const c = countryToken(r);
  return /eu|ez|euro|de |fr |gb|uk|united kingdom|ch |switzerland/.test(c) || c === 'eur' || c === 'gbp' || c === 'chf';
}

function isUsish(r) {
  const c = countryToken(r);
  return c === 'us' || c === 'usa' || c === 'usd' || c.includes('united states');
}

function crossAssetAlignment(signals) {
  if (!Array.isArray(signals)) return 'mixed';
  let up = 0;
  let down = 0;
  for (const s of signals) {
    if (!s || !s.asset) continue;
    if (s.asset === 'Volatility' || s.asset === 'DXY RSI') continue;
    if (s.direction === 'up') up += 1;
    else if (s.direction === 'down') down += 1;
  }
  if (up >= 3 && down <= 1) return 'aligned_up';
  if (down >= 3 && up <= 1) return 'aligned_down';
  return 'mixed';
}

function volatilityTier(vix) {
  if (vix == null || Number.isNaN(Number(vix))) return 'unknown';
  const v = Number(vix);
  if (v >= 22) return 'elevated';
  if (v <= 15) return 'compressed';
  return 'normal';
}

function liquidityBiasFromSignals(clustering, vix, align) {
  const cl = clustering != null ? Number(clustering) : 50;
  const v = volatilityTier(vix);
  if (v === 'compressed' && cl < 48 && align === 'mixed') return 'building';
  if (cl > 68) return 'patchy';
  if (v === 'elevated') return 'thin';
  return 'normal';
}

function eventRiskTier(eventRiskScore, nextHiMins) {
  const er = eventRiskScore != null ? Number(eventRiskScore) : 35;
  if (nextHiMins != null && nextHiMins <= 180) return 'high';
  if (er >= 55) return 'high';
  if (er >= 38) return 'moderate';
  return 'low';
}

function pickTags(state, extras, max = 2) {
  const out = [];
  for (const x of extras) {
    if (x && out.length < max) out.push(x);
  }
  return out;
}

function sessionSummary(sessionKey, state, { vix, spxDp, align, nextHiMins } = {}) {
  const v = vix != null ? `${Number(vix).toFixed(1)} VIX` : 'vol proxy limited';
  const spx = spxDp != null ? `${spxDp >= 0 ? '+' : ''}${Number(spxDp).toFixed(2)}% SPX session-to-date` : 'equity drift muted';
  if (state === 'inactive') return 'Institutional flow thinned; local price discovery can dominate versus global beta.';
  if (state === 'event_sensitive') {
    const eta = nextHiMins != null ? `next major release ~${nextHiMins}m` : 'calendar density elevated';
    return `${eta}; headline clocks concentrate two-way repricing risk.`;
  }
  if (state === 'reversal_risk') return `${spx}; extension risk rises if participation fades into fixes.`;
  if (state === 'trend_continuation') return `Cross-asset ${align === 'mixed' ? 'mixed' : 'directional'} tone; ${spx}.`;
  if (state === 'expansion_likely') return `Yields/FX impulse building; ${v} frames whether follow-through broadens.`;
  if (state === 'compressed') return `Realized drift small versus recent vol; impulse can expand ranges quickly.`;
  if (state === 'liquidity_build') return `Quiet tape; liquidity coiling above/below prior session balance.`;
  if (state === 'choppy') return `${v}; two-way flow with uneven depth — correlation signals can flicker.`;
  if (state === 'range_bound') return `${spx}; range dynamics dominate until a catalyst validates a break with participation.`;
  return `Monitor ${v} and cross-asset co-movement for narrative confirmation.`;
}

function buildAsiaRow(ctx) {
  const {
    refMs, weekend, vix, spxDp, align, eventRisk, clustering, calendarRows, yAbs,
  } = ctx;
  if (weekend) {
    return {
      state: 'inactive',
      confidence: 0.88,
      tags: [],
      summary: sessionSummary('asia', 'inactive', ctx),
      liquidityBias: 'thin',
      volatilityState: volatilityTier(vix),
      eventRisk: 'low',
      updatedAt: ctx.updatedAt,
    };
  }
  const apacHi = countRegionalHighImpact(calendarRows, refMs, 14 * 3600000, isApacish);
  const anyHiMins = nextHighImpactEtaMinutes(calendarRows, refMs, 10 * 3600000);
  const spx = spxDp != null ? Math.abs(spxDp) : 0;
  const vt = volatilityTier(vix);

  if (apacHi >= 1 || (anyHiMins != null && anyHiMins <= 360 && (hourUtc(refMs) >= 22 || hourUtc(refMs) < 8))) {
    return {
      state: 'event_sensitive',
      confidence: 0.82,
      tags: pickTags('event_sensitive', ['high-impact window']),
      summary: sessionSummary('asia', 'event_sensitive', { ...ctx, nextHiMins: anyHiMins }),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, anyHiMins),
      updatedAt: ctx.updatedAt,
    };
  }
  if (vt === 'elevated') {
    return {
      state: 'choppy',
      confidence: 0.78,
      tags: pickTags('choppy', ['thin participation']),
      summary: sessionSummary('asia', 'choppy', ctx),
      liquidityBias: 'thin',
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, anyHiMins),
      updatedAt: ctx.updatedAt,
    };
  }
  if (spx < 0.18 && vt === 'compressed') {
    return {
      state: 'compressed',
      confidence: 0.74,
      tags: pickTags('compressed', ['liquidity build']),
      summary: sessionSummary('asia', 'compressed', ctx),
      liquidityBias: 'building',
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, anyHiMins),
      updatedAt: ctx.updatedAt,
    };
  }
  if (align === 'mixed' && spx < 0.35) {
    return {
      state: 'range_bound',
      confidence: 0.72,
      tags: pickTags('range_bound', ['mean reversion']),
      summary: sessionSummary('asia', 'range_bound', ctx),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, anyHiMins),
      updatedAt: ctx.updatedAt,
    };
  }
  return {
    state: 'liquidity_build',
    confidence: 0.68,
    tags: pickTags('liquidity_build', ['breakout risk']),
    summary: sessionSummary('asia', 'liquidity_build', ctx),
    liquidityBias: 'building',
    volatilityState: vt,
    eventRisk: eventRiskTier(eventRisk, anyHiMins),
    updatedAt: ctx.updatedAt,
  };
}

function buildLondonRow(ctx) {
  const {
    refMs, weekend, vix, spxDp, align, eventRisk, clustering, calendarRows, yAbs, pulseScore,
  } = ctx;
  if (weekend) {
    return {
      state: 'inactive',
      confidence: 0.88,
      tags: [],
      summary: sessionSummary('london', 'inactive', ctx),
      liquidityBias: 'thin',
      volatilityState: volatilityTier(vix),
      eventRisk: 'low',
      updatedAt: ctx.updatedAt,
    };
  }
  const euHi = countRegionalHighImpact(calendarRows, refMs, 8 * 3600000, isEuUkish);
  const usSoon = nextHighImpactEtaMinutes(calendarRows.filter(isUsish), refMs, 6 * 3600000);
  const spx = spxDp != null ? Math.abs(spxDp) : 0;
  const vt = volatilityTier(vix);
  const midPulse = pulseScore != null && pulseScore > 38 && pulseScore < 62;

  if (euHi >= 1 || (usSoon != null && usSoon <= 240 && hourUtc(refMs) >= 7 && hourUtc(refMs) < 17)) {
    return {
      state: 'event_sensitive',
      confidence: 0.84,
      tags: pickTags('event_sensitive', ['high-impact window']),
      summary: sessionSummary('london', 'event_sensitive', { ...ctx, nextHiMins: usSoon }),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usSoon),
      updatedAt: ctx.updatedAt,
    };
  }
  if (yAbs > 1.1 && align !== 'mixed') {
    return {
      state: 'expansion_likely',
      confidence: 0.8,
      tags: pickTags('expansion_likely', align === 'aligned_up' || align === 'aligned_down' ? ['correlation aligned'] : []),
      summary: sessionSummary('london', 'expansion_likely', ctx),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usSoon),
      updatedAt: ctx.updatedAt,
    };
  }
  if (spx > 0.65 && midPulse) {
    return {
      state: 'reversal_risk',
      confidence: 0.76,
      tags: pickTags('reversal_risk', ['reversal zone']),
      summary: sessionSummary('london', 'reversal_risk', ctx),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usSoon),
      updatedAt: ctx.updatedAt,
    };
  }
  if (align !== 'mixed' && spx > 0.28) {
    return {
      state: 'trend_continuation',
      confidence: 0.75,
      tags: pickTags('trend_continuation', ['trend day risk']),
      summary: sessionSummary('london', 'trend_continuation', ctx),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usSoon),
      updatedAt: ctx.updatedAt,
    };
  }
  if (vt === 'elevated') {
    return {
      state: 'choppy',
      confidence: 0.74,
      tags: pickTags('choppy', ['correlation diverging']),
      summary: sessionSummary('london', 'choppy', ctx),
      liquidityBias: 'thin',
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usSoon),
      updatedAt: ctx.updatedAt,
    };
  }
  return {
    state: 'range_bound',
    confidence: 0.7,
    tags: [],
    summary: sessionSummary('london', 'range_bound', ctx),
    liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
    volatilityState: vt,
    eventRisk: eventRiskTier(eventRisk, usSoon),
    updatedAt: ctx.updatedAt,
  };
}

function buildNewYorkRow(ctx) {
  const {
    weekend, vix, spxDp, align, eventRisk, clustering, calendarRows, yAbs, pulseScore, riskLevel, refMs,
  } = ctx;
  if (weekend) {
    return {
      state: 'inactive',
      confidence: 0.88,
      tags: [],
      summary: sessionSummary('new_york', 'inactive', ctx),
      liquidityBias: 'thin',
      volatilityState: volatilityTier(vix),
      eventRisk: 'low',
      updatedAt: ctx.updatedAt,
    };
  }
  const usHiMins = nextHighImpactEtaMinutes(calendarRows.filter(isUsish), refMs, 10 * 3600000);
  const spx = spxDp != null ? Math.abs(spxDp) : 0;
  const vt = volatilityTier(vix);
  const midPulse = pulseScore != null && pulseScore > 40 && pulseScore < 60;
  const rl = String(riskLevel || '').toLowerCase();

  if (usHiMins != null && usHiMins <= 240 && eventRisk >= 42) {
    return {
      state: 'event_sensitive',
      confidence: 0.86,
      tags: pickTags('event_sensitive', ['high-impact window']),
      summary: sessionSummary('new_york', 'event_sensitive', { ...ctx, nextHiMins: usHiMins }),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usHiMins),
      updatedAt: ctx.updatedAt,
    };
  }
  if (rl === 'high' || rl === 'extreme') {
    return {
      state: 'event_sensitive',
      confidence: 0.83,
      tags: pickTags('event_sensitive', ['trend day risk']),
      summary: sessionSummary('new_york', 'event_sensitive', { ...ctx, nextHiMins: usHiMins }),
      liquidityBias: 'patchy',
      volatilityState: vt,
      eventRisk: 'high',
      updatedAt: ctx.updatedAt,
    };
  }
  if (spx > 0.85 && align === 'mixed' && midPulse) {
    return {
      state: 'reversal_risk',
      confidence: 0.8,
      tags: pickTags('reversal_risk', ['reversal zone']),
      summary: sessionSummary('new_york', 'reversal_risk', ctx),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usHiMins),
      updatedAt: ctx.updatedAt,
    };
  }
  if (clustering > 65 && eventRisk > 40) {
    return {
      state: 'event_sensitive',
      confidence: 0.78,
      tags: pickTags('event_sensitive', ['high-impact window']),
      summary: sessionSummary('new_york', 'event_sensitive', { ...ctx, nextHiMins: usHiMins }),
      liquidityBias: 'patchy',
      volatilityState: vt,
      eventRisk: 'high',
      updatedAt: ctx.updatedAt,
    };
  }
  if (spx > 0.5 && align !== 'mixed') {
    return {
      state: 'trend_continuation',
      confidence: 0.77,
      tags: pickTags('trend_continuation', ['correlation aligned']),
      summary: sessionSummary('new_york', 'trend_continuation', ctx),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usHiMins),
      updatedAt: ctx.updatedAt,
    };
  }
  if (vt === 'elevated') {
    return {
      state: 'choppy',
      confidence: 0.76,
      tags: pickTags('choppy', ['thin participation']),
      summary: sessionSummary('new_york', 'choppy', ctx),
      liquidityBias: 'thin',
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usHiMins),
      updatedAt: ctx.updatedAt,
    };
  }
  if (yAbs > 1.5 && align === 'aligned_up') {
    return {
      state: 'expansion_likely',
      confidence: 0.74,
      tags: pickTags('expansion_likely', ['breakout risk']),
      summary: sessionSummary('new_york', 'expansion_likely', ctx),
      liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
      volatilityState: vt,
      eventRisk: eventRiskTier(eventRisk, usHiMins),
      updatedAt: ctx.updatedAt,
    };
  }
  return {
    state: 'range_bound',
    confidence: 0.7,
    tags: [],
    summary: sessionSummary('new_york', 'range_bound', ctx),
    liquidityBias: liquidityBiasFromSignals(clustering, vix, align),
    volatilityState: vt,
    eventRisk: eventRiskTier(eventRisk, usHiMins),
    updatedAt: ctx.updatedAt,
  };
}

/**
 * @param {object} params
 * @param {number} params.referenceMs
 * @param {object} params.marketPulse - { score }
 * @param {object} params.riskEngine - { level, breakdown }
 * @param {Array} params.crossAssetSignals
 * @param {Array} params.calendarRows - from risk radar builder (with _ms, _score, category, impact)
 * @param {number|null} params.vix
 * @param {number|null} params.spxDp - SPX daily % change
 * @param {{ changePct?: number }|null} params.yieldRecent - recent FRED 10Y move
 * @param {string} [params.pulseState] - Risk On | Risk Off | Mixed (for downstream consistency gates)
 */
function buildSessionContext(params = {}) {
  const refMs = Number(params.referenceMs) && Number.isFinite(Number(params.referenceMs))
    ? Number(params.referenceMs)
    : Date.now();
  const updatedAt = new Date().toISOString();
  const weekend = isWeekendUtc(refMs);
  const vix = params.vix != null ? Number(params.vix) : null;
  const spxDp = params.spxDp != null ? Number(params.spxDp) : null;
  const pulseScore = params.marketPulse && params.marketPulse.score != null
    ? Number(params.marketPulse.score)
    : 50;
  const breakdown = (params.riskEngine && params.riskEngine.breakdown) || {};
  const eventRisk = breakdown.eventRisk != null ? Number(breakdown.eventRisk) : 40;
  const clustering = breakdown.clustering != null ? Number(breakdown.clustering) : 45;
  const riskLevel = params.riskEngine && params.riskEngine.level;
  const calendarRows = Array.isArray(params.calendarRows) ? params.calendarRows : [];
  const align = crossAssetAlignment(params.crossAssetSignals);
  const yAbs = params.yieldRecent && params.yieldRecent.changePct != null
    ? Math.abs(Number(params.yieldRecent.changePct))
    : 0;
  const nextHiGlobal = nextHighImpactEtaMinutes(calendarRows, refMs, 12 * 3600000);

  const ctx = {
    refMs,
    weekend,
    vix,
    spxDp,
    align,
    eventRisk,
    clustering,
    calendarRows,
    yAbs,
    pulseScore,
    riskLevel,
    updatedAt,
    nextHiMins: nextHiGlobal,
  };

  const asia = buildAsiaRow(ctx);
  const london = buildLondonRow(ctx);
  const newYork = buildNewYorkRow(ctx);

  let currentSession = resolveCurrentSession(refMs);
  if (currentSession === 'overlap') {
    // Surface overlap explicitly for UI copy
    currentSession = 'overlap';
  }

  return {
    currentSession,
    sessions: {
      asia,
      london,
      newYork,
    },
  };
}

/** Observational desk notes aligned to session archetype (not execution). */
function alignPulseObservationalNotes(pulse, sessionContext) {
  if (!pulse || !Array.isArray(pulse.recommendedAction)) return pulse;
  const actions = [...pulse.recommendedAction];
  const ny = sessionContext && sessionContext.sessions && sessionContext.sessions.newYork;
  const ld = sessionContext && sessionContext.sessions && sessionContext.sessions.london;
  const pushOrReplaceLast = (line) => {
    if (actions.length >= 3) actions[2] = line;
    else actions.push(line);
  };
  if (ny && ny.state === 'event_sensitive') {
    const line = 'NY macro windows often reset correlation and depth quickly around releases.';
    if (!actions.some((a) => /NY macro|high-impact|event window|releases/i.test(String(a)))) {
      pushOrReplaceLast(line);
    }
  } else if (ld && ld.state === 'event_sensitive' && (!ny || ny.state !== 'event_sensitive')) {
    const line = 'London data windows can reprice EUR/GBP legs ahead of US liquidity arrival.';
    if (!actions.some((a) => /London|EUR|GBP/i.test(String(a)))) {
      pushOrReplaceLast(line);
    }
  }
  return { ...pulse, recommendedAction: actions.slice(0, 3) };
}

module.exports = {
  buildSessionContext,
  resolveCurrentSession,
  STATE_LABELS,
  alignPulseObservationalNotes,
  /** @deprecated use alignPulseObservationalNotes */
  alignPulseRecommendedActions: alignPulseObservationalNotes,
};
