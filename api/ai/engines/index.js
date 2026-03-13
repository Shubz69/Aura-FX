/**
 * Aura AI Engines – institutional-grade trading intelligence.
 * Aggregates: market structure, liquidity, smart money, volatility, sentiment, bias,
 * session, price clusters, trade setup, regime, event risk.
 * Use runAll(ohlcv, options) when OHLCV is available; otherwise use quote-only where supported.
 */

const marketStructureEngine = require('./market-structure-engine');
const liquidityEngine = require('./liquidity-engine');
const smartMoneyEngine = require('./smart-money-engine');
const volatilityEngine = require('./volatility-engine');
const sentimentEngine = require('./sentiment-engine');
const biasEngine = require('./bias-engine');
const sessionEngine = require('./session-engine');
const priceClusterEngine = require('./price-cluster-engine');
const tradeSetupEngine = require('./trade-setup-engine');
const marketRegimeEngine = require('./market-regime-engine');
const eventRiskEngine = require('./event-risk-engine');
const marketMemory = require('./market-memory');
const confluenceEngine = require('./confluence-engine');
const setupDetectionEngine = require('./setup-detection-engine');
const opportunityScannerEngine = require('./opportunity-scanner-engine');
const pairRankingEngine = require('./pair-ranking-engine');
const volatilitySpikeEngine = require('./volatility-spike-engine');
const tradeEvaluationEngine = require('./trade-evaluation-engine');
const preTradeValidationEngine = require('./pre-trade-validation-engine');
const postTradeReviewEngine = require('./post-trade-review-engine');
const traderCoachEngine = require('./trader-coach-engine');
const marketAlertEngine = require('./market-alert-engine');
const watchlistEngine = require('./watchlist-engine');
const riskEngine = require('./risk-engine');
const globalMarketScannerEngine = require('./global-market-scanner-engine');
const setupRankingEngine = require('./setup-ranking-engine');
const tradePlanEngine = require('./trade-plan-engine');
const liquidityMapEngine = require('./liquidity-map-engine');
const probabilityEngine = require('./probability-engine');
const volatilityForecastEngine = require('./volatility-forecast-engine');
const correlationEngine = require('./correlation-engine');
const macroRegimeEngine = require('./macro-regime-engine');
const institutionalFlowEngine = require('./institutional-flow-engine');
const marketOpportunitySummaryEngine = require('./market-opportunity-summary-engine');
const breakoutPredictionEngine = require('./breakout-prediction-engine');
const fakeBreakoutEngine = require('./fake-breakout-engine');
const stopHuntEngine = require('./stop-hunt-engine');
const strongestMarketsEngine = require('./strongest-markets-engine');
const strategyIdeaEngine = require('./strategy-idea-engine');
const invalidationEngine = require('./invalidation-engine');
const executionQualityEngine = require('./execution-quality-engine');
const decisionSupportEngine = require('./decision-support-engine');
const noTradeEngine = require('./no-trade-engine');
const scenarioPlanningEngine = require('./scenario-planning-engine');
const timingEngine = require('./timing-engine');
const cleanlinessEngine = require('./cleanliness-engine');
const executionOutputFormatter = require('./execution-output-formatter');

/**
 * Run all engines that accept OHLCV. Optionally pass calendar events, news headlines, symbol.
 * @param {Array} ohlcv - Candles [{ open, high, low, close, timestamp? }]
 * @param {Object} options - { calendarEvents, newsHeadlines, symbol, currentPrice }
 * @returns {Object} Aggregated intelligence for context/prompts
 */
function runAll(ohlcv, options = {}) {
  const { calendarEvents = [], newsHeadlines = [], symbol = '', currentPrice = null } = options;
  const candles = Array.isArray(ohlcv) ? ohlcv : [];
  const price = currentPrice ?? (candles.length ? (candles[candles.length - 1].close ?? candles[candles.length - 1].c) : null);

  const marketStructure = candles.length >= 2
    ? marketStructureEngine.analyze(candles)
    : (ohlcv && typeof ohlcv === 'object' && !Array.isArray(ohlcv) ? marketStructureEngine.analyze(ohlcv) : { summary: 'No OHLCV', trendDirection: null });

  const liquidity = candles.length >= 5 ? liquidityEngine.analyze(candles, price) : { summary: 'Insufficient data', liquidityAbove: [], liquidityBelow: [], recentSweep: null };
  const smartMoney = candles.length >= 5 ? smartMoneyEngine.analyze(candles, price) : { summary: 'Insufficient data', orderBlocksBullish: [], orderBlocksBearish: [], fairValueGaps: [] };
  const volatility = candles.length >= 10 ? volatilityEngine.analyze(candles) : { summary: 'Insufficient data', regime: null, expansionState: null };
  const session = sessionEngine.analyze(candles.length ? candles : null);
  const priceClusters = candles.length >= 10 ? priceClusterEngine.analyze(candles, 50, price) : { support: [], resistance: [], strongestSupport: null, strongestResistance: null, summary: 'Insufficient data' };
  const regime = candles.length >= 20 ? marketRegimeEngine.analyze(candles) : { regime: 'Unknown', summary: 'Insufficient data' };
  const eventRisk = eventRiskEngine.analyze(calendarEvents, 120);

  const sentiment = sentimentEngine.analyze({
    newsHeadlines: newsHeadlines.length ? newsHeadlines : (options.newsSummary || []).map(n => n.headline || n),
    macroEvents: calendarEvents,
    ohlcv: candles,
    symbol
  });

  const bias = biasEngine.analyze({
    marketStructure,
    liquidity,
    volatility,
    macroEvents: calendarEvents,
    sentiment
  });

  const tradeSetup = tradeSetupEngine.evaluate({
    riskRewardRatio: options.riskRewardRatio ?? null,
    trendDirection: marketStructure.trendDirection,
    tradeDirection: options.tradeDirection ?? null,
    currentSession: session.currentSession,
    volatilityRegime: volatility.regime
  });

  const confluence = confluenceEngine.score({
    marketStructure,
    priceClusters,
    liquidity,
    volatility,
    session,
    calendarEvents: options.calendarEvents || [],
    eventRisk
  }, price);

  const detectedSetup = setupDetectionEngine.detect({
    marketStructure,
    priceClusters,
    liquidity,
    regime,
    volatility
  }, price);

  const volatilitySpike = volatilitySpikeEngine.detectFromAnalysis(volatility, candles);

  return {
    marketStructure,
    liquidity,
    smartMoney,
    volatility,
    sentiment,
    bias,
    session,
    priceClusters,
    tradeSetup,
    regime,
    eventRisk,
    marketMemorySummary: marketMemory.getSummaryForContext(symbol),
    confluence,
    detectedSetup,
    volatilitySpike
  };
}

/**
 * Run engines that only need quote (no time series). For use when only single bar/quote is available.
 */
function runWithQuoteOnly(quote, options = {}) {
  const structure = marketStructureEngine.analyze(quote);
  const session = sessionEngine.analyze(null);
  const eventRisk = eventRiskEngine.analyze(options.calendarEvents || [], 120);
  return {
    marketStructure: structure,
    session,
    eventRisk,
    liquidity: { summary: 'Need OHLCV for liquidity analysis.', liquidityAbove: [], liquidityBelow: [], recentSweep: null },
    smartMoney: { summary: 'Need OHLCV for order blocks/FVG.', orderBlocksBullish: [], orderBlocksBearish: [], fairValueGaps: [] },
    volatility: { summary: 'Need OHLCV for ATR.', regime: null },
    sentiment: sentimentEngine.analyze({ newsHeadlines: options.newsHeadlines || [], macroEvents: options.calendarEvents || [], ohlcv: [], symbol: options.symbol }),
    bias: null,
    priceClusters: { support: [], resistance: [], strongestSupport: null, strongestResistance: null, summary: 'Need OHLCV.' },
    tradeSetup: null,
    regime: { regime: 'Unknown', summary: 'Need OHLCV.' },
    marketMemorySummary: marketMemory.getSummaryForContext(options.symbol)
  };
}

module.exports = {
  runAll,
  runWithQuoteOnly,
  marketStructureEngine,
  liquidityEngine,
  smartMoneyEngine,
  volatilityEngine,
  sentimentEngine,
  biasEngine,
  sessionEngine,
  priceClusterEngine,
  tradeSetupEngine,
  marketRegimeEngine,
  eventRiskEngine,
  marketMemory,
  confluenceEngine,
  setupDetectionEngine,
  opportunityScannerEngine,
  pairRankingEngine,
  volatilitySpikeEngine,
  tradeEvaluationEngine,
  preTradeValidationEngine,
  postTradeReviewEngine,
  traderCoachEngine,
  marketAlertEngine,
  watchlistEngine,
  riskEngine,
  globalMarketScannerEngine,
  setupRankingEngine,
  tradePlanEngine,
  liquidityMapEngine,
  probabilityEngine,
  volatilityForecastEngine,
  correlationEngine,
  macroRegimeEngine,
  institutionalFlowEngine,
  marketOpportunitySummaryEngine,
  breakoutPredictionEngine,
  fakeBreakoutEngine,
  stopHuntEngine,
  strongestMarketsEngine,
  strategyIdeaEngine,
  invalidationEngine,
  executionQualityEngine,
  decisionSupportEngine,
  noTradeEngine,
  scenarioPlanningEngine,
  timingEngine,
  cleanlinessEngine,
  executionOutputFormatter
};
