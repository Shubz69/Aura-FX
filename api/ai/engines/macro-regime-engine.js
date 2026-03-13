/**
 * Macro Regime Engine – labels environment: risk-on, risk-off, inflation-driven, central bank tightening.
 * Uses sentiment-engine (Risk On/Off) and calendar/news keywords. Extends existing sentiment.
 */

const INFLATION_KEYWORDS = ['cpi', 'inflation', 'pce', 'ppi'];
const CENTRAL_BANK_TIGHTENING = ['rate hike', 'fed hawkish', 'ecb hike', 'tightening', 'rate decision'];
const RISK_OFF_KEYWORDS = ['safe haven', 'flight to quality', 'recession', 'fear', 'geopolitical'];
const RISK_ON_KEYWORDS = ['risk-on', 'rally', 'optimism', 'growth'];

function detectFromSentiment(sentiment) {
  const market = (sentiment?.marketSentiment || '').toLowerCase();
  if (market.includes('risk off')) return { regime: 'Risk-off', detail: 'Gold demand often increasing. Equities under pressure.' };
  if (market.includes('risk on')) return { regime: 'Risk-on', detail: 'Equities and risk assets favored.' };
  return { regime: 'Neutral', detail: '' };
}

function detectFromCalendar(calendarEvents = []) {
  const text = (calendarEvents || []).map(e => (e.event || e.Event || '') + ' ' + (e.category || '')).join(' ').toLowerCase();
  let inflation = false;
  let tightening = false;
  for (const w of INFLATION_KEYWORDS) if (text.includes(w)) inflation = true;
  for (const w of CENTRAL_BANK_TIGHTENING) if (text.includes(w)) tightening = true;
  if (inflation && tightening) return { regime: 'Inflation-driven, central bank tightening', detail: 'Rates and inflation data driving volatility.' };
  if (inflation) return { regime: 'Inflation-driven', detail: 'Inflation data in focus.' };
  if (tightening) return { regime: 'Central bank tightening', detail: 'Rate expectations driving markets.' };
  return null;
}

/**
 * Detect macro regime from sentiment and calendar.
 * @param {Object} params - { sentiment, calendarEvents, newsHeadlines? }
 */
function detect(params = {}) {
  const fromSentiment = detectFromSentiment(params.sentiment || {});
  const fromCalendar = detectFromCalendar(params.calendarEvents || []);

  let regime = fromSentiment.regime;
  let detail = fromSentiment.detail;
  if (fromCalendar) {
    regime = fromCalendar.regime;
    detail = fromCalendar.detail || detail;
  }

  const summary = `Macro Regime: Current environment: ${regime}. ${detail}`.trim();

  return {
    regime,
    detail,
    summary
  };
}

module.exports = { detect, detectFromSentiment, detectFromCalendar };
