/**
 * Process-local outbound HTTP counters (serverless: one cold start = one process).
 * Used to explain provider burn (e.g. FMP) — see fetchWithTimeout + perplexity-client.
 *
 * Why FMP can spike: automated briefs call `buildQuoteCacheForSymbols` over ~109 unique
 * universe symbols (`collectAllAutomationUniverseSymbols`). `fetchAutomationQuoteWithFallback`
 * tries Twelve Data, then one FMP quote request per symbol when TD misses. One `runEngine`
 * / `getFmpData` adds ~3 FMP calls (calendar + news + treasury). Economic calendar routes
 * may add more. Multiply by cron runs, on-demand generation from Trader Deck content, and
 * Market Decoder sessions (also uses fetchWithTimeout for FMP paths).
 */

const LABELS = [
  'fmp',
  'finnhub',
  'twelvedata',
  'fred',
  'tradingeconomics',
  'alphavantage',
  'perplexity',
  'yahoo',
  'other',
  'unknown',
];

function emptyCounts() {
  const o = {};
  for (const k of LABELS) o[k] = 0;
  return o;
}

let counts = emptyCounts();

function classifyUrl(url) {
  try {
    const host = new URL(String(url)).hostname.toLowerCase();
    if (host.endsWith('financialmodelingprep.com') || host.includes('financialmodelingprep.com')) return 'fmp';
    if (host.endsWith('finnhub.io') || host.includes('finnhub.io')) return 'finnhub';
    if (host.includes('twelvedata.com')) return 'twelvedata';
    if (host.includes('stlouisfed.org')) return 'fred';
    if (host.includes('tradingeconomics.com')) return 'tradingeconomics';
    if (host.includes('alphavantage.co')) return 'alphavantage';
    if (host.includes('perplexity.ai')) return 'perplexity';
    if (host.includes('yahoo.com') || host.includes('yimg.com')) return 'yahoo';
    return 'other';
  } catch (_) {
    return 'unknown';
  }
}

function recordOutboundRequest(url, n = 1) {
  const k = classifyUrl(url);
  const add = Number(n) > 0 ? Math.floor(Number(n)) : 1;
  counts[k] = (counts[k] || 0) + add;
}

function resetProviderRequestMeter() {
  counts = emptyCounts();
}

function getProviderRequestMeterSnapshot() {
  const byProvider = { ...counts };
  let total = 0;
  for (const k of LABELS) total += byProvider[k] || 0;
  return { byProvider, total };
}

function logProviderRequestMeter(tag, extra = {}) {
  const { byProvider, total } = getProviderRequestMeterSnapshot();
  console.info(tag, { outboundHttpRequests: byProvider, total, ...extra });
}

module.exports = {
  recordOutboundRequest,
  resetProviderRequestMeter,
  getProviderRequestMeterSnapshot,
  logProviderRequestMeter,
  classifyUrl,
};
