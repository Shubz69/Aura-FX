/**
 * Macro Timing & Inflection Window — compact terminal lines for Market Outlook right rail.
 */

import i18n from '../../i18n/config';
import { currentSessionShortLabel } from './marketOutlookDisplayFormatters';

function mt(key, opts) {
  return i18n.t(`traderDeck.macroGen.${key}`, opts ?? {});
}

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

function glue() {
  return mt('sep');
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

/** @returns {{ key: string }} */
function deriveMacroPhaseLabel(sessionContext, riskEngine, marketPulse) {
  const mins = riskEngine?.nextRiskEventInMins;
  const row = pickTimingSessionRow(sessionContext);
  const state = String(row?.state || '').toLowerCase();
  const vol = riskEngine?.breakdown?.volatility != null ? Number(riskEngine.breakdown.volatility) : null;
  const pulseScore = marketPulse?.score != null ? Number(marketPulse.score) : null;

  if ((Number.isFinite(mins) && mins < 120) || state === 'event_sensitive') {
    return { key: 'pre-event' };
  }
  if (state === 'range_bound' || state === 'compressed' || (vol != null && vol <= 40 && (pulseScore == null || pulseScore <= 42))) {
    return { key: 'drift' };
  }
  if (state === 'expansion_likely' || state === 'trend_continuation' || (vol != null && vol >= 58 && pulseScore != null && pulseScore >= 55)) {
    return { key: 'expansion' };
  }
  if (vol != null && vol <= 42 && pulseScore != null && pulseScore >= 48) {
    return { key: 'post-event' };
  }
  return { key: 'expansion' };
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

/** @returns {'transition'|'thin'|'active'} */
function deriveSessionConditionKey(sessionContext, riskEngine) {
  const row = pickTimingSessionRow(sessionContext);
  const state = String(row?.state || '').toLowerCase();
  const mins = riskEngine?.nextRiskEventInMins;
  if (state === 'event_sensitive' || (Number.isFinite(mins) && mins < 90)) return 'transition';
  if (state === 'range_bound' || state === 'compressed' || state === 'thin') return 'thin';
  if (state === 'overlap' || state === 'expansion_likely' || state === 'trend_continuation') return 'active';
  return 'active';
}

/** @returns {'pre_catalyst'|'dormant'|'active'} */
function deriveActiveStatusKey(macroPhase, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;
  if (Number.isFinite(mins) && mins < 120) return 'pre_catalyst';
  if (macroPhase.key === 'drift' || macroPhase.key === 'post-event') return 'dormant';
  return 'active';
}

function buildActiveTimingWindow(showing, macroPhase, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;
  const condKey = deriveSessionConditionKey(showing.sessionContext, riskEngine);
  const statusKey = deriveActiveStatusKey(macroPhase, riskEngine);

  const statusLabel = mt(`active_${statusKey}`);
  const condLabel = mt(`session_${condKey}`);
  const catalystBit = Number.isFinite(mins)
    ? clip(mt('catalyst_mins', { mins: Math.round(mins) }), 28)
    : clip(mt('catalyst_none'), 28);
  const headline = clip([statusLabel, catalystBit, condLabel].join(glue()), 118);

  const exec =
    statusKey === 'pre_catalyst'
      ? clip(mt('exec_shrink'), 110)
      : condKey === 'thin'
        ? clip(mt('exec_size_depth'), 110)
        : clip(mt('exec_align'), 110);

  return {
    headline,
    executionNote: exec,
    status: statusLabel,
    timeToCatalyst: catalystBit,
    sessionCondition: condLabel,
    executionImplication: exec,
    sessionLabel:
      currentSessionShortLabel(showing.sessionContext?.currentSession)
      || i18n.t('traderDeck.outlook.timelineLabelSession'),
  };
}

function buildInflectionReason(level, riskEngine, crossAssetSignals) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const cl = breakdown.clustering != null ? Number(breakdown.clustering) : null;
  const signals = Array.isArray(crossAssetSignals) ? crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));

  const frag =
    uniq.size >= 3
      ? mt('inf_frag_dispersed')
      : uniq.size === 2
        ? mt('inf_frag_twoway')
        : uniq.size <= 1
          ? mt('inf_frag_aligned')
          : mt('inf_frag_mixed');

  const volBit =
    vol != null && vol >= 58 ? mt('inf_vol_elev') : vol != null && vol <= 40 ? mt('inf_vol_comp') : mt('inf_vol_mid');

  const clBit =
    cl != null && cl >= 56 ? mt('inf_cl_tight') : cl != null && cl <= 42 ? mt('inf_cl_break') : mt('inf_cl_neutral');

  return clip([volBit, clBit, frag].join(', ') + '.', 118);
}

/**
 * Internal snapshot keys for logic + i18n display.
 * @returns {{ vol: string, liq: string, corr: string, pos: string }}
 */
function buildMarketStateSnapshotKeys(riskEngine, crossAssetSignals, macroPhase) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  const liq = breakdown.liquidity != null ? Number(breakdown.liquidity) : null;
  const cl = breakdown.clustering != null ? Number(breakdown.clustering) : null;
  const signals = Array.isArray(crossAssetSignals) ? crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));

  let volKey = 'balanced';
  if (vol != null && vol <= 42) volKey = 'compressed';
  else if (vol != null && vol >= 58) volKey = 'expanding';

  let liqKey = 'stable';
  if (liq != null && liq <= 40) liqKey = 'thin';
  else if (liq != null && liq >= 62) liqKey = 'fragmented';

  let corrKey = 'rotational';
  if (cl != null && cl >= 56) corrKey = 'tight';
  else if ((cl != null && cl <= 42) || uniq.size >= 3) corrKey = 'breaking';

  let posKey = 'unclear';
  if (macroPhase.key === 'pre-event') posKey = 'crowded';
  else if (macroPhase.key === 'drift' && vol != null && vol <= 45) posKey = 'light';
  else if (uniq.size <= 1 && cl != null && cl >= 55) posKey = 'crowded';

  return { vol: volKey, liq: liqKey, corr: corrKey, pos: posKey };
}

function translateMarketStateSnapshot(keys) {
  return {
    volRegime: mt(`snap_vol_${keys.vol}`),
    liquidity: mt(`snap_liq_${keys.liq}`),
    correlation: mt(`snap_corr_${keys.corr}`),
    positioning: mt(`snap_pos_${keys.pos}`),
  };
}

/** Max 5 lines: `[TAG] short insight` */
function buildCatalystCompactLines(showing, macroPhase, outlookRiskContext, riskEngine) {
  const breakdown = riskEngine?.breakdown && typeof riskEngine.breakdown === 'object' ? riskEngine.breakdown : {};
  const mins = riskEngine?.nextRiskEventInMins;
  const signals = Array.isArray(showing.crossAssetSignals) ? showing.crossAssetSignals : [];
  const uniq = new Set(signals.map((s) => normDirection(s.direction)));
  const volR = breakdown.volatility != null ? Math.round(Number(breakdown.volatility)) : null;
  const liqR = breakdown.liquidity != null ? Math.round(Number(breakdown.liquidity)) : null;

  const volInsight =
    volR != null && volR >= 58
      ? mt('cat_vol_lift')
      : volR != null && volR <= 40
        ? mt('cat_vol_chop')
        : mt('cat_vol_calm');

  const flowInsight =
    uniq.size >= 3
      ? mt('cat_flow_mixed')
      : uniq.size === 2
        ? mt('cat_flow_two')
        : signals.length
          ? mt('cat_flow_align')
          : mt('cat_flow_thin');

  const liqInsight =
    liqR != null && liqR <= 40
      ? mt('cat_liq_thin_trans')
      : liqR != null && liqR >= 62
        ? mt('cat_liq_frag_depth')
        : mt('cat_liq_stable_depth');

  const macroInsight = Number.isFinite(mins)
    ? clip(mt('cat_macro_mins', { mins: Math.round(mins) }), 56)
    : clip(mt('cat_macro_calm'), 56);

  const usdInsight =
    breakdown.geopoliticalRisk != null && Number(breakdown.geopoliticalRisk) >= 58
      ? mt('cat_usd_geo')
      : mt('cat_usd_rates');

  const lines = [
    clip(`${mt('tag_macro')} ${macroInsight}`, 96),
    clip(`${mt('tag_vol')} ${volInsight}`, 96),
    clip(`${mt('tag_flow')} ${flowInsight}`, 96),
    clip(`${mt('tag_liq')} ${liqInsight}`, 96),
    clip(`${mt('tag_usd')} ${usdInsight}`, 96),
  ];

  return lines.slice(0, 5);
}

function buildExpectedBehavior(showing, _macroPhase, outlookRiskContext, _riskEngine) {
  const pulse = showing.marketPulse || {};
  const outlook = pulse.outlookPulse && typeof pulse.outlookPulse === 'object' ? pulse.outlookPulse : null;

  const driftCore = mt('exp_drift_core');
  const base = outlook?.volatilityCondition
    ? clip(
        mt('exp_base_with_cond', {
          cond: String(outlook.volatilityCondition).slice(0, 72),
          core: driftCore,
        }),
        118,
      )
    : clip(driftCore, 118);

  const triggered = clip(mt('exp_trigger'), 118);

  const failureMode = clip(mt('exp_failure'), 118);

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
      ? clip(mt('mat_bo_impulse'), 88)
      : macroPhase.key === 'expansion'
        ? clip(mt('mat_bo_rates'), 88)
        : clip(mt('mat_bo_wait'), 88);

  const meanRev =
    (vol != null && vol <= 48) || macroPhase.key === 'drift'
      ? clip(mt('mat_mr_fade'), 88)
      : clip(mt('mat_mr_print'), 88);

  const noTrade =
    Number.isFinite(mins) && mins < 45 && liqThin
      ? clip(mt('mat_nt_binary'), 88)
      : uniqSessionAmbiguous(sessionRow)
        ? clip(mt('mat_nt_wait'), 88)
        : clip(mt('mat_nt_stand'), 88);

  return { breakout, meanReversion: meanRev, noTradeZone: noTrade };
}

function uniqSessionAmbiguous(row) {
  if (!row) return false;
  const s = String(row.state || '').toLowerCase();
  return s === 'event_sensitive' || s === 'overlap';
}

/** @param snap {{ vol: string, liq: string, corr: string, pos: string }} */
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
      ? clip(mt('ctx_part_light'), 92)
      : uniq.size === 2
        ? clip(mt('ctx_part_mod_two'), 92)
        : pulse != null && pulse >= 56
          ? clip(mt('ctx_part_firm'), 92)
          : clip(mt('ctx_part_mod_sel'), 92);

  const liquidityQuality =
    liq != null && liq <= 40
      ? clip(mt('ctx_liq_thin'), 92)
      : liq != null && liq >= 62
        ? clip(mt('ctx_liq_frag'), 92)
        : clip(mt('ctx_liq_stable'), 92);

  const volBehavior =
    Number.isFinite(mins) && mins < 120 && vol != null && vol <= 50
      ? clip(mt('ctx_vol_cat'), 92)
      : vol != null && vol >= 58
        ? clip(mt('ctx_vol_exp'), 92)
        : vol != null && vol <= 42
          ? clip(mt('ctx_vol_comp'), 92)
          : clip(mt('ctx_vol_mid'), 92);

  const correlationState =
    snap.corr === 'breaking'
      ? clip(mt('ctx_corr_break'), 92)
      : snap.corr === 'tight'
        ? clip(mt('ctx_corr_tight'), 92)
        : snap.corr === 'rotational'
          ? clip(mt('ctx_corr_rot'), 92)
          : clip(mt('ctx_corr_mix'), 92);

  const positioningPressure =
    snap.pos === 'crowded'
      ? clip(mt('ctx_pos_crowd'), 92)
      : snap.pos === 'light'
        ? clip(mt('ctx_pos_light'), 92)
        : clip(mt('ctx_pos_neutral'), 92);

  return [
    { label: mt('ctx_lbl_participation'), text: participation },
    { label: mt('ctx_lbl_liquidity'), text: liquidityQuality },
    { label: mt('ctx_lbl_vol'), text: volBehavior },
    { label: mt('ctx_lbl_corr'), text: correlationState },
    { label: mt('ctx_lbl_pos'), text: positioningPressure },
  ];
}

function buildRiskFramingLines() {
  return [
    { label: mt('risk_up_lbl'), text: mt('risk_up_txt') },
    { label: mt('risk_dn_lbl'), text: mt('risk_dn_txt') },
    { label: mt('risk_vol_lbl'), text: mt('risk_vol_txt') },
    { label: mt('risk_liq_lbl'), text: mt('risk_liq_txt') },
  ];
}

function buildTraderEdgeLines(macroPhase, level, riskEngine) {
  const mins = riskEngine?.nextRiskEventInMins;

  const a = clip(
    Number.isFinite(mins) && mins < 90
      ? mt('edge_exec_print')
      : macroPhase.key === 'drift'
        ? mt('edge_exec_drift')
        : mt('edge_exec_sync'),
    96,
  );

  const b = clip(
    level === 'HIGH'
      ? mt('edge_risk_high')
      : level === 'LOW'
        ? mt('edge_risk_low')
        : mt('edge_risk_mid'),
    96,
  );

  const c = clip(
    Number.isFinite(mins) && mins < 60 ? mt('edge_cal') : mt('edge_overlap'),
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
  const snapKeys = buildMarketStateSnapshotKeys(riskEngine, crossAssetSignals, macroPhase);
  const marketStateSnapshot = translateMarketStateSnapshot(snapKeys);

  return {
    activeTimingWindow,
    inflectionRisk: {
      level,
      reason,
      explanation: reason,
    },
    marketStateSnapshot,
    executionContext: buildExecutionContext(desk, macroPhase, riskEngine, snapKeys),
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
