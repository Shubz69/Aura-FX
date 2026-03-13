/**
 * Strategy Idea Engine – suggests structured approaches from current conditions.
 * Educational and practical. Reuses: marketStructure, volatility, priceClusters, regime.
 */

function levelVal(x) {
  if (x == null) return null;
  return typeof x === 'object' && x.level != null ? x.level : typeof x === 'number' ? x : null;
}

/**
 * Suggest strategy approach from analysis.
 */
function suggest(params = {}) {
  const { symbol, marketStructure, volatility, priceClusters, eventRisk, currentPrice } = params;
  const trend = (marketStructure?.trendDirection || '').toLowerCase();
  const mom = (marketStructure?.momentum || '').toLowerCase();
  const reg = (volatility?.expansionState || volatility?.regime || '').toLowerCase();
  const price = currentPrice ?? null;
  const res = levelVal(priceClusters?.strongestResistance);
  const sup = levelVal(priceClusters?.strongestSupport);
  const eventSoon = !!eventRisk?.warning;

  let condition = 'Unclear structure';
  let approach = 'Wait for clearer structure before committing.';
  let reason = 'Insufficient confluence.';

  if (eventSoon) {
    condition = 'High-impact event approaching';
    approach = 'No-trade or wait-for-confirmation idea.';
    reason = 'Event risk makes directional bias fragile; wait for release and reaction.';
    return { instrument: symbol, currentCondition: condition, suggestedApproach: approach, reason, ideaType: 'wait_for_confirmation' };
  }

  if ((trend === 'bullish' || trend === 'bearish') && reg === 'expanding') {
    condition = `${trend.charAt(0).toUpperCase() + trend.slice(1)} trend with volatility expansion`;
    if (mom === 'strengthening') {
      approach = 'Look for pullbacks into support rather than chasing.';
      reason = 'Trend remains strong but price may be extended short term; pullbacks offer better risk/reward.';
      return { instrument: symbol, currentCondition: condition, suggestedApproach: approach, reason, ideaType: 'pullback_continuation' };
    }
    approach = 'Consider pullback entries or breakout confirmation.';
    reason = 'Trend present; wait for pullback or clear breakout with follow-through.';
    return { instrument: symbol, currentCondition: condition, suggestedApproach: approach, reason, ideaType: 'pullback_continuation' };
  }

  if (reg === 'compressing' || (params.regime?.regime || '').toLowerCase() === 'range bound') {
    condition = 'Range or compression';
    approach = 'Wait for breakout confirmation; avoid mean reversion until range breaks.';
    reason = 'Mean reversion in tight range is possible but breakout risk is elevated; wait for clear break and retest.';
    return { instrument: symbol, currentCondition: condition, suggestedApproach: approach, reason, ideaType: 'mean_reversion_caution' };
  }

  if (trend === 'neutral' || trend === 'ranging') {
    condition = 'No clear trend';
    approach = 'No-trade condition or wait for structure to form.';
    reason = 'Unclear structure and conflicting signals; avoid forcing a trade.';
    return { instrument: symbol, currentCondition: condition, suggestedApproach: approach, reason, ideaType: 'no_trade' };
  }

  if (trend === 'bullish' || trend === 'bearish') {
    condition = `${trend.charAt(0).toUpperCase() + trend.slice(1)} trend`;
    approach = 'Look for continuation in direction of trend with defined invalidation.';
    reason = 'Structure supports trend; use key levels for entry and invalidation.';
    return { instrument: symbol, currentCondition: condition, suggestedApproach: approach, reason, ideaType: 'trend_continuation' };
  }

  return { instrument: symbol, currentCondition: condition, suggestedApproach: approach, reason, ideaType: 'wait_for_confirmation' };
}

module.exports = { suggest };
