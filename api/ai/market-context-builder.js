/**
 * Builds structured market context for Aura AI. Data-first: only verified data is included.
 * Single source of truth: all numbers come from (1) sanitizeQuoteForContext(marketData),
 * (2) calendarData.events, (3) newsData.news, (4) engineResults built from the same marketData.
 * No engine may fabricate prices or levels; support/resistance only from priceClusters when OHLCV exists.
 */

const { sanitizeQuoteForContext } = require('./utils/validators');
const { toCanonical, getAssetClass } = require('./utils/symbol-registry');
const { computeConfidence, getLowConfidenceMessage } = require('./confidence-engine');

/** Current session (UTC hour): Asia 00–08, London 08–16, New York 13–21, overlap logic. */
function getMarketSession() {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 8) return 'Asia';
  if (h >= 8 && h < 13) return 'London';
  if (h >= 13 && h < 21) return 'New York';
  return 'After Hours';
}

/**
 * Build a single structured context object from market + calendar + news.
 * @param {Object} marketData - result from data-service getMarketData (quote or fallback)
 * @param {Object} calendarData - result from getCalendar (events array)
 * @param {Object} newsData - result from getNews (news array)
 * @param {Object} options - { symbol, supportLevels, resistanceLevels, trendDirection, volatilityState, engineResults }
 * @returns {Object} context for AI
 */
function buildMarketContext(marketData, calendarData, newsData, options = {}) {
  const symbol = toCanonical(options.symbol || marketData?.symbol || '');
  const assetClass = getAssetClass(symbol);
  const quote = marketData?.price > 0 ? sanitizeQuoteForContext(marketData) : null;
  const engines = options.engineResults || {};

  const supportLevels = options.supportLevels?.length ? options.supportLevels : (engines.priceClusters?.strongestSupport ? [engines.priceClusters.strongestSupport.level] : []);
  const resistanceLevels = options.resistanceLevels?.length ? options.resistanceLevels : (engines.priceClusters?.strongestResistance ? [engines.priceClusters.strongestResistance.level] : []);

  const context = {
    symbol: symbol || 'N/A',
    asset_class: assetClass,
    current_price: quote?.price ?? null,
    bid: quote?.open ?? null,
    ask: quote?.price ?? null,
    open: quote?.open ?? null,
    high: quote?.high ?? null,
    low: quote?.low ?? null,
    previous_close: quote?.previousClose ?? null,
    intraday_change: quote?.change ?? null,
    intraday_change_percent: quote?.changePercent ?? null,
    timestamp: quote?.timestamp ?? null,
    market_session: engines.session?.currentSession ?? getMarketSession(),
    data_provider: quote?.source ?? (marketData?.source || 'unavailable'),
    data_age_seconds: quote?.data_age_seconds ?? null,
    support_levels: supportLevels.length ? supportLevels.map(l => typeof l === 'number' ? l : l?.level ?? l) : [],
    resistance_levels: resistanceLevels.length ? resistanceLevels.map(l => typeof l === 'number' ? l : l?.level ?? l) : [],
    trend_direction: options.trendDirection ?? engines.marketStructure?.trendDirection ?? null,
    volatility_state: options.volatilityState ?? engines.volatility?.regime ?? null,
    macro_events: (calendarData?.events || []).slice(0, 10).map(e => ({
      time: e.time,
      event: e.event,
      currency: e.currency,
      impact: e.impact,
      date: e.date
    })),
    news_summary: (newsData?.news || []).slice(0, 5).map(n => ({
      headline: n.headline,
      source: n.source,
      datetime: n.datetime
    })),
    market_regime: options.marketRegime ?? engines.regime?.regime ?? null,
    session_bias: options.sessionBias ?? engines.session?.sessionBias ?? null,
    data_unavailable: !quote || quote.price === 0,
    // Trading intelligence from engines (when available)
    market_structure_summary: engines.marketStructure?.summary ?? null,
    liquidity_summary: engines.liquidity?.summary ?? null,
    smart_money_summary: engines.smartMoney?.summary ?? null,
    sentiment_summary: engines.sentiment?.summary ?? null,
    bias_summary: engines.bias?.summary ?? null,
    session_summary: engines.session?.summary ?? null,
    event_risk_warning: engines.eventRisk?.warning ?? null,
    market_memory_summary: engines.marketMemorySummary ?? null,
    trade_setup_summary: engines.tradeSetup?.summary ?? null
  };

  if (Object.keys(engines).length > 0) {
    try {
      const { formatForPrompt } = require('./engines/execution-output-formatter');
      context.execution_sections = formatForPrompt({ ...engines, symbol: context.symbol, currentPrice: context.current_price });
    } catch (e) {
      context.execution_sections = null;
    }
  } else {
    context.execution_sections = null;
  }

  const confidence = computeConfidence({
    dataAgeSeconds: context.data_age_seconds ?? null,
    dataProvider: context.data_provider ?? null,
    hasMacroEvents: (context.macro_events && context.macro_events.length > 0),
    hasNews: (context.news_summary && context.news_summary.length > 0)
  });
  context.data_confidence_score = confidence.score;
  context.data_confidence_warning = confidence.warn ? getLowConfidenceMessage(confidence) : null;

  return context;
}

/**
 * Format context as a string block for inclusion in the AI system prompt or user message.
 * Makes it clear that the AI must only use this data and never invent numbers.
 */
function formatContextForPrompt(context) {
  const lines = [
    '--- VERIFIED MARKET CONTEXT (use only these values; do not invent or assume) ---',
    `Symbol: ${context.symbol} | Asset class: ${context.asset_class}`,
    `Current price: ${context.current_price != null ? context.current_price : 'N/A'}`,
    `Open/High/Low: ${context.open ?? 'N/A'} / ${context.high ?? 'N/A'} / ${context.low ?? 'N/A'}`,
    `Previous close: ${context.previous_close ?? 'N/A'} | Change: ${context.intraday_change ?? 'N/A'} (${context.intraday_change_percent ?? 'N/A'}%)`,
    `Data provider: ${context.data_provider} | Data age: ${context.data_age_seconds != null ? context.data_age_seconds + 's' : 'N/A'} | Session: ${context.market_session}`,
    `Data confidence: ${context.data_confidence_score != null ? context.data_confidence_score + '%' : 'N/A'}${context.data_confidence_warning ? '. ' + context.data_confidence_warning : ''}`,
  ];
  if (context.support_levels?.length) lines.push(`Support levels (only use these): ${context.support_levels.join(', ')}`);
  if (context.resistance_levels?.length) lines.push(`Resistance levels (only use these): ${context.resistance_levels.join(', ')}`);
  if (context.trend_direction) lines.push(`Trend: ${context.trend_direction}`);
  if (context.macro_events?.length) {
    lines.push('Upcoming macro events: ' + context.macro_events.map(e => `${e.event} (${e.impact})`).join('; '));
  }
  if (context.news_summary?.length) {
    lines.push('Recent news: ' + context.news_summary.map(n => n.headline).join(' | '));
  }
  if (context.data_unavailable) {
    lines.push('WARNING: Live market data is temporarily unavailable. Do not invent prices; state that data is unavailable.');
  }
  lines.push('CRITICAL: Every price, level, and number in your response MUST appear in this VERIFIED MARKET CONTEXT or in the EXECUTION INTELLIGENCE section below. Do not invent, estimate, or round to different values. If a value is not listed, say "data not available" or "not provided".');
  lines.push('--- END VERIFIED CONTEXT ---');

  if (context.execution_sections) {
    lines.push('');
    lines.push('--- EXECUTION INTELLIGENCE (Trap Risk, Breakout Risk, Scenario Planning, Invalidation, Execution Quality, Decision Support) ---');
    lines.push(context.execution_sections);
    lines.push('--- END EXECUTION INTELLIGENCE ---');
  }

  if (context.market_structure_summary || context.liquidity_summary || context.smart_money_summary || context.sentiment_summary || context.bias_summary || context.session_summary || context.event_risk_warning || context.market_memory_summary) {
    lines.push('');
    lines.push('--- TRADING INTELLIGENCE (use for analysis; explain WHY price moves) ---');
    if (context.market_structure_summary) lines.push('Market structure: ' + context.market_structure_summary.replace(/\n/g, ' '));
    if (context.liquidity_summary) lines.push('Liquidity zones: ' + context.liquidity_summary.replace(/\n/g, ' '));
    if (context.smart_money_summary) lines.push('Smart money: ' + context.smart_money_summary.replace(/\n/g, ' '));
    if (context.sentiment_summary) lines.push('Sentiment: ' + context.sentiment_summary.replace(/\n/g, ' '));
    if (context.bias_summary) lines.push('Bias: ' + context.bias_summary.replace(/\n/g, ' '));
    if (context.session_summary) lines.push('Session: ' + context.session_summary.replace(/\n/g, ' '));
    if (context.event_risk_warning) lines.push('Event risk: ' + context.event_risk_warning);
    if (context.market_memory_summary) lines.push('Recent context: ' + context.market_memory_summary);
    if (context.trade_setup_summary) lines.push('Setup: ' + context.trade_setup_summary.replace(/\n/g, ' '));
    lines.push('--- END TRADING INTELLIGENCE ---');
  }

  return lines.join('\n');
}

module.exports = {
  buildMarketContext,
  formatContextForPrompt,
  getMarketSession,
};
