/**
 * Confidence scoring for Aura AI responses. Factors: data freshness, provider count,
 * volatility, macro event proximity. Low confidence → attach warning to response.
 */


const MAX_AGE_SEC = 60;
const WARN_AGE_SEC = 30;

/**
 * Compute confidence score 0–100 and label.
 * @param {Object} params
 * @param {number} params.dataAgeSeconds - age of price data
 * @param {string} params.dataProvider - source (e.g. 'Twelve Data', 'Finnhub')
 * @param {boolean} params.hasMacroEvents - upcoming high-impact events
 * @param {boolean} params.hasNews - news included
 * @returns {{ score: number, label: string, warn: boolean }}
 */
function computeConfidence(params = {}) {
  const { dataAgeSeconds, dataProvider, hasMacroEvents, hasNews } = params;
  let score = 80;

  if (dataAgeSeconds != null) {
    if (dataAgeSeconds > MAX_AGE_SEC) score -= 35;
    else if (dataAgeSeconds > WARN_AGE_SEC) score -= 15;
  } else {
    score -= 25; // unknown age
  }

  if (dataProvider === 'fallback' || dataProvider === 'unavailable' || !dataProvider) {
    score -= 30;
  } else if (dataProvider === 'Yahoo Finance') {
    score -= 5; // often delayed
  }

  if (hasMacroEvents) score -= 5; // more uncertainty around events
  if (!hasNews && dataProvider) score += 5; // news optional

  score = Math.max(0, Math.min(100, score));

  let label = 'high';
  if (score < 40) label = 'low';
  else if (score < 65) label = 'medium';

  const warn = score < 50;

  return { score, label, warn };
}

/**
 * Get user-facing message when confidence is low.
 */
function getLowConfidenceMessage(confidence) {
  if (!confidence.warn) return null;
  return 'Market data may be delayed or from a fallback source. Consider verifying key levels with your platform before trading.';
}

module.exports = {
  computeConfidence,
  getLowConfidenceMessage,
  MAX_AGE_SEC,
  WARN_AGE_SEC,
};
