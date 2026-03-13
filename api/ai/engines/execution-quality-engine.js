/**
 * Execution Quality Engine – scores how clean or risky a potential entry is.
 * Reuses: trade-setup, confluence, event-risk, priceClusters, session.
 */

const tradeSetupEngine = require('./trade-setup-engine');
const confluenceEngine = require('./confluence-engine');

function levelVal(x) {
  if (x == null) return null;
  return typeof x === 'object' && x.level != null ? x.level : typeof x === 'number' ? x : null;
}

const MAX_SCORE = 100;

/**
 * Score execution quality 0–100. Pros/Cons list.
 */
function assess(params = {}) {
  const { symbol, marketStructure, priceClusters, volatility, session, eventRisk, currentPrice, trendDirection, riskRewardRatio } = params;
  const price = currentPrice ?? null;
  const res = levelVal(priceClusters?.strongestResistance);
  const sup = levelVal(priceClusters?.strongestSupport);

  let score = 70;
  const pros = [];
  const cons = [];

  const setup = tradeSetupEngine.evaluate({
    riskRewardRatio,
    trendDirection: trendDirection ?? marketStructure?.trendDirection,
    currentSession: session?.currentSession,
    volatilityRegime: volatility?.regime
  });
  const conf = confluenceEngine.score({
    marketStructure,
    priceClusters,
    liquidity: params.liquidity,
    volatility,
    session,
    calendarEvents: params.calendarEvents || [],
    eventRisk: eventRisk || {}
  }, price);

  if (setup.setupStrength === 'Strong') {
    score += 10;
    pros.push('Good trend alignment');
  }
  if (setup.setupStrength === 'Moderate') pros.push('Reasonable setup');

  if (price != null && sup != null && price > sup && (price - sup) / (price || 1) < 0.005) {
    score -= 15;
    cons.push('Entry is close to support (risk of sweep)');
  }
  if (price != null && res != null && price < res && (res - price) / (price || 1) < 0.005) {
    score -= 15;
    cons.push('Entry is close to resistance');
  }

  if (eventRisk?.warning) {
    score -= 20;
    cons.push('US data release approaching');
  }

  const sessionName = (session?.currentSession || '').toLowerCase();
  if (sessionName.includes('after hours') || sessionName === 'asia') {
    score -= 5;
    cons.push('Lower liquidity session');
  } else {
    pros.push('Healthy session timing');
  }

  if (conf.confluenceScore >= 70) pros.push('Strong confluence');
  if (marketStructure?.momentum === 'Strengthening') pros.push('Healthy momentum');

  const finalScore = Math.max(0, Math.min(MAX_SCORE, score));

  const summary = [
    'Execution Quality',
    `Instrument: ${symbol || 'N/A'}`,
    `Score: ${finalScore}/${MAX_SCORE}`,
    pros.length ? 'Pros:\n' + pros.map(p => '- ' + p).join('\n') : '',
    cons.length ? 'Cons:\n' + cons.map(c => '- ' + c).join('\n') : ''
  ].filter(Boolean).join('\n');

  return {
    instrument: symbol,
    score: finalScore,
    maxScore: MAX_SCORE,
    pros,
    cons,
    summary
  };
}

module.exports = { assess };
