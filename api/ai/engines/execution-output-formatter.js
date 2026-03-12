/**
 * Execution Output Formatter – builds user-facing sections for trade-focused answers.
 * Sections: Market Condition, Key Levels, Liquidity Zones, Trap Risk, Breakout Risk,
 * Scenario Planning, Invalidation, Execution Quality, Decision Support.
 * Only includes sections that have content; does not force every section every time.
 */

const breakoutPredictionEngine = require('./breakout-prediction-engine');
const fakeBreakoutEngine = require('./fake-breakout-engine');
const stopHuntEngine = require('./stop-hunt-engine');
const strategyIdeaEngine = require('./strategy-idea-engine');
const invalidationEngine = require('./invalidation-engine');
const executionQualityEngine = require('./execution-quality-engine');
const decisionSupportEngine = require('./decision-support-engine');
const noTradeEngine = require('./no-trade-engine');
const scenarioPlanningEngine = require('./scenario-planning-engine');
const timingEngine = require('./timing-engine');
const cleanlinessEngine = require('./cleanliness-engine');
const liquidityMapEngine = require('./liquidity-map-engine');

/**
 * Build execution-intelligence sections from runAll result (or equivalent).
 * @param {Object} analysis - runAll output + symbol, currentPrice
 * @returns {Object} sections - keyed by section name, value is string or null
 */
function formatSections(analysis = {}) {
  const { symbol, currentPrice, confluence } = analysis;
  const sections = {};

  const marketStructure = analysis.marketStructure;
  const priceClusters = analysis.priceClusters;
  const liquidity = analysis.liquidity;
  const volatility = analysis.volatility;
  const session = analysis.session;
  const eventRisk = analysis.eventRisk;
  const regime = analysis.regime;

  const fullParams = { ...analysis, currentPrice };

  sections.MarketCondition = marketStructure?.summary ?? regime?.summary ?? null;

  const asLevel = (v) => (v != null && typeof v === 'number' && !Number.isNaN(v)) ? v : null;
  const sup = asLevel(priceClusters?.strongestSupport?.level ?? priceClusters?.strongestSupport);
  const res = asLevel(priceClusters?.strongestResistance?.level ?? priceClusters?.strongestResistance);
  if (sup != null || res != null) {
    const levels = [];
    if (res != null) levels.push(`Resistance: ${res.toFixed(4)}`);
    if (sup != null) levels.push(`Support: ${sup.toFixed(4)}`);
    sections.KeyLevels = levels.join('. ');
  }

  const liquidityMap = liquidityMapEngine.map(liquidity || {}, currentPrice);
  if (liquidityMap?.summary && liquidityMap.summary !== 'Insufficient data for liquidity map.') {
    sections.LiquidityZones = liquidityMap.summary;
  }

  const fakeOut = fakeBreakoutEngine.detect({ symbol, liquidity, marketStructure, priceClusters, currentPrice });
  if (fakeOut.risk !== 'Low' || fakeOut.reasons?.length) {
    sections.TrapRisk = fakeOut.summary ?? `Fake breakout risk: ${fakeOut.risk}. ${fakeOut.reasons?.join(', ') || ''}`;
  }

  const stopHunt = stopHuntEngine.detect({ symbol, liquidity, session, marketStructure });
  if (stopHunt.liquiditySweep || stopHunt.trapType) {
    sections.TrapRisk = (sections.TrapRisk ? sections.TrapRisk + '\n' : '') + (stopHunt.summary || '');
  }

  const breakoutPred = breakoutPredictionEngine.predict({ symbol, volatility, priceClusters, liquidity, session, regime, marketStructure, currentPrice });
  if (breakoutPred.breakoutProbability >= 50) {
    sections.BreakoutRisk = breakoutPred.summary;
  }

  const scenario = scenarioPlanningEngine.plan({ symbol, priceClusters, marketStructure, volatility, currentPrice });
  sections.ScenarioPlanning = scenario.summary;

  const inv = invalidationEngine.explain({ symbol, marketStructure, priceClusters, bias: analysis.bias, currentPrice });
  sections.Invalidation = inv.summary;

  const exec = executionQualityEngine.assess(fullParams);
  sections.ExecutionQuality = exec.summary;

  const decision = decisionSupportEngine.summarize({ ...fullParams, confluence });
  sections.DecisionSupport = decision.summary;

  const noTrade = noTradeEngine.detect({ symbol, marketStructure, volatility, eventRisk, confluence, liquidity });
  if (noTrade.isNoTrade) {
    sections.NoTradeCondition = noTrade.summary;
  }

  const timing = timingEngine.assess(fullParams);
  sections.TimingQuality = timing.summary;

  const cleanliness = cleanlinessEngine.assess({ symbol, marketStructure, priceClusters, volatility });
  sections.MarketCleanliness = cleanliness.summary;

  return sections;
}

/**
 * Flatten sections into one string for prompt injection (only non-empty).
 */
function formatForPrompt(analysis) {
  const sections = formatSections(analysis);
  const order = [
    'MarketCondition',
    'KeyLevels',
    'LiquidityZones',
    'TrapRisk',
    'BreakoutRisk',
    'ScenarioPlanning',
    'Invalidation',
    'ExecutionQuality',
    'TimingQuality',
    'MarketCleanliness',
    'DecisionSupport',
    'NoTradeCondition'
  ];
  const lines = [];
  for (const key of order) {
    const label = key.replace(/([A-Z])/g, ' $1').trim();
    const value = sections[key];
    if (value && typeof value === 'string') lines.push(`${label}:\n${value}`);
  }
  return lines.length ? lines.join('\n\n') : null;
}

module.exports = { formatSections, formatForPrompt };
