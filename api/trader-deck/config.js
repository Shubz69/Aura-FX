/**
 * Trader Deck API config – server-side only.
 * Reads FINNHUB_API_KEY, FMP_API_KEY, FRED_API_KEY, TWELVE_DATA_API_KEY from env.
 * Never expose keys to the client.
 */

const REQUIRED_KEYS = ['FINNHUB_API_KEY', 'FMP_API_KEY', 'FRED_API_KEY'];
const OPTIONAL_KEYS = ['TWELVE_DATA_API_KEY'];

let configValidated = false;

function getConfig() {
  const finnhub = process.env.FINNHUB_API_KEY || '';
  const fmp = process.env.FMP_API_KEY || '';
  const fred = process.env.FRED_API_KEY || '';
  const twelveData = process.env.TWELVE_DATA_API_KEY || '';

  if (!configValidated) {
    const missing = REQUIRED_KEYS.filter((k) => !(process.env[k] || '').trim());
    if (missing.length > 0 && process.env.TRADER_DECK_LOG_MISSING_KEYS === '1') {
      console.warn('[trader-deck] Missing env keys (set in Vercel → Settings → Env):', missing.join(', '));
    }
    const optionalMissing = OPTIONAL_KEYS.filter((k) => !(process.env[k] || '').trim());
    if (optionalMissing.length > 0 && process.env.TRADER_DECK_LOG_MISSING_KEYS === '1') {
      console.info('[trader-deck] Optional env keys not set yet:', optionalMissing.join(', '));
    }
    configValidated = true;
  }

  return {
    finnhubApiKey: finnhub.trim(),
    fmpApiKey: fmp.trim(),
    fredApiKey: fred.trim(),
    twelveDataApiKey: twelveData.trim(),
    hasAllKeys: REQUIRED_KEYS.every((k) => (process.env[k] || '').trim().length > 0),
    hasTwelveDataKey: twelveData.trim().length > 0,
  };
}

module.exports = { getConfig };
