/**
 * Trader Sentiment Engine – news tone, macro surprises, price momentum.
 * Outputs: Market Sentiment (Risk On/Off), instrument sentiment (e.g. Gold: Neutral, USD: Bearish).
 */

const RISK_OFF_KEYWORDS = ['recession', 'fear', 'safe haven', 'flight to quality', 'risk-off', 'sell-off', 'crash', 'uncertainty', 'geopolitical', 'war', 'default', 'inflation worry', 'fed hawkish', 'rate hike'];
const RISK_ON_KEYWORDS = ['rally', 'risk-on', 'optimism', 'growth', 'earnings beat', 'stimulus', 'dovish', 'rate cut', 'recovery'];
const BEARISH_TONE = ['fall', 'drop', 'decline', 'weaker', 'loss', 'miss', 'disappoint', 'warning', 'cut'];
const BULLISH_TONE = ['rise', 'gain', 'surge', 'strong', 'beat', 'raise', 'upgrade', 'record'];

/**
 * Simple headline/summary tone: risk-on vs risk-off and bullish vs bearish score.
 */
function newsTone(headlinesOrSummaries) {
  const text = (Array.isArray(headlinesOrSummaries) ? headlinesOrSummaries.join(' ') : String(headlinesOrSummaries || '')).toLowerCase();
  let riskOff = 0;
  let riskOn = 0;
  for (const w of RISK_OFF_KEYWORDS) if (text.includes(w)) riskOff++;
  for (const w of RISK_ON_KEYWORDS) if (text.includes(w)) riskOn++;
  let bearish = 0;
  let bullish = 0;
  for (const w of BEARISH_TONE) if (text.includes(w)) bearish++;
  for (const w of BULLISH_TONE) if (text.includes(w)) bullish++;
  return {
    marketSentiment: riskOff > riskOn ? 'Risk Off' : riskOn > riskOff ? 'Risk On' : 'Neutral',
    toneScore: { riskOff, riskOn, bearish, bullish }
  };
}

/**
 * Macro surprise: actual vs forecast (if we have both). Positive = actual better than forecast (e.g. NFP beat).
 */
function macroSurprise(eventsWithActualAndForecast) {
  if (!Array.isArray(eventsWithActualAndForecast) || eventsWithActualAndForecast.length === 0) return null;
  let netSurprise = 0;
  let count = 0;
  for (const e of eventsWithActualAndForecast) {
    const actual = parseFloat(String(e.actual).replace(/[^0-9.-]/g, ''));
    const forecast = parseFloat(String(e.forecast).replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(actual) && Number.isFinite(forecast)) {
      netSurprise += actual - forecast;
      count++;
    }
  }
  if (count === 0) return null;
  const avg = netSurprise / count;
  return { direction: avg > 0 ? 'Positive (data beat)' : avg < 0 ? 'Negative (data missed)' : 'In line', avgSurprise: avg };
}

/**
 * Price momentum: recent closes up vs down.
 */
function priceMomentum(ohlcv, lookback = 10) {
  if (!ohlcv || !Array.isArray(ohlcv) || ohlcv.length < 2) return 'Neutral';
  const recent = ohlcv.slice(-lookback);
  const closes = recent.map(c => c.close ?? c.c);
  let up = 0;
  let down = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) up++;
    else if (closes[i] < closes[i - 1]) down++;
  }
  const n = closes.length - 1;
  if (n === 0) return 'Neutral';
  if (up / n >= 0.6) return 'Bullish';
  if (down / n >= 0.6) return 'Bearish';
  return 'Neutral';
}

/**
 * Instrument-level sentiment label (e.g. "Slightly bearish").
 */
function instrumentSentiment(momentum, newsToneForSymbol, macroSurpriseDir) {
  let score = 0;
  if (momentum === 'Bullish') score += 1;
  else if (momentum === 'Bearish') score -= 1;
  if (newsToneForSymbol === 'bullish') score += 1;
  else if (newsToneForSymbol === 'bearish') score -= 1;
  if (macroSurpriseDir === 'Positive (data beat)') score += 0.5;
  else if (macroSurpriseDir === 'Negative (data missed)') score -= 0.5;
  if (score >= 2) return 'Bullish';
  if (score >= 1) return 'Slightly bullish';
  if (score <= -2) return 'Bearish';
  if (score <= -1) return 'Slightly bearish';
  return 'Neutral';
}

/**
 * Full sentiment analysis.
 * @param {Object} params - { newsHeadlines, macroEvents (with actual/forecast), ohlcv, symbol }
 */
function analyze(params = {}) {
  const { newsHeadlines = [], macroEvents = [], ohlcv = [], symbol = '' } = params;
  const headlines = Array.isArray(newsHeadlines) ? newsHeadlines : [newsHeadlines].filter(Boolean);
  const tone = newsTone(headlines.map(h => typeof h === 'string' ? h : h.headline || h.summary || '').join(' '));
  const surprise = macroSurprise(macroEvents);
  const momentum = priceMomentum(ohlcv);
  const newsToneDir = tone.toneScore.bullish > tone.toneScore.bearish ? 'bullish' : tone.toneScore.bearish > tone.toneScore.bullish ? 'bearish' : 'neutral';
  const instSentiment = instrumentSentiment(momentum, newsToneDir, surprise?.direction || null);

  const lines = [
    `Market Sentiment: ${tone.marketSentiment}`,
    symbol ? `${symbol} sentiment: ${instSentiment}` : `Instrument sentiment: ${instSentiment}`,
    surprise ? `Macro: ${surprise.direction}` : ''
  ].filter(Boolean);

  return {
    marketSentiment: tone.marketSentiment,
    instrumentSentiment: instSentiment,
    priceMomentum: momentum,
    macroSurprise: surprise,
    summary: lines.join('\n').trim()
  };
}

module.exports = { analyze, newsTone, macroSurprise, priceMomentum, instrumentSentiment };
