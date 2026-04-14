/**
 * Tier-1 OHLCV backfill symbol set: full default watchlist + automation symbols that are
 * FX pairs, major benchmarks, crypto majors, metals, energy, or rates (v1 scope control).
 */

const { getSnapshotSymbols } = require('../market/defaultWatchlist');
const { collectAllAutomationUniverseSymbols } = require('../trader-deck/services/briefInstrumentUniverse');
const { isVentureRegionalEquity } = require('../ai/utils/symbol-registry');

/** Processed first for daily OHLCV ingest — major crypto USD pairs (Twelve Data crypto). */
const CRYPTO_OHLCV_PRIORITY_V1 = [
  'BTCUSD',
  'ETHUSD',
  'SOLUSD',
  'XRPUSD',
  'BNBUSD',
  'ADAUSD',
  'DOGEUSD',
  'AVAXUSD',
  'LINKUSD',
  'MATICUSD',
  'ATOMUSD',
  'LTCUSD',
  'SHIBUSD',
  'TRXUSD',
  'TONUSD',
  'NEARUSD',
  'APTUSD',
  'ARBUSD',
  'OPUSD',
];

/** Processed after crypto priority for daily OHLCV ingest (Twelve Data FX majors + spot metals). */
const FX_OHLCV_PRIORITY_V1 = [
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'USDCHF',
  'USDCAD',
  'AUDUSD',
  'NZDUSD',
  'EURGBP',
  'EURJPY',
  'GBPJPY',
  'XAUUSD',
  'XAGUSD',
];

const BENCHMARK_RE = /\b(US500|NAS100|US30|US2000|GER40|UK100|JP225|HK50|STOXX50|CAC40|BTC|ETH|SOL|XAU|XAG|WTI|BRENT|USOIL|UKOIL|XNG|NATGAS|US02Y|US05Y|US10Y|US30Y|DE10Y|UK10Y|JP10Y|IT10Y|ES1!|NQ1!|RTY1!|CL1!|GC1!|SI1!|NG1!|ZN1!|ZB1!|6E1!|6B1!|6J1!)\b/i;

function isTier1AutomationExtra(sym) {
  const u = String(sym || '').toUpperCase().trim();
  if (!u) return false;
  if (/^[A-Z]{6}$/.test(u)) return true;
  if (/\.AX$/i.test(u)) return true;
  if (/\.BCXE$/i.test(u)) return true;
  if (/\.CXAC$/i.test(u)) return true;
  if (/\.L$/i.test(u)) return true;
  if (isVentureRegionalEquity(u)) return true;
  if (BENCHMARK_RE.test(u)) return true;
  return false;
}

/**
 * @returns {string[]} unique uppercase symbols
 */
function getOhlcvTier1Symbols() {
  const env = String(process.env.OHLCV_TIER1_SYMBOLS || '').trim();
  if (env) {
    return [...new Set(env.split(/[\s,]+/).map((s) => s.toUpperCase()).filter(Boolean))];
  }
  const watch = getSnapshotSymbols().map((s) => String(s).toUpperCase());
  const watchSet = new Set(watch);
  const auto = collectAllAutomationUniverseSymbols();
  const extra = auto.filter((s) => watchSet.has(s) || isTier1AutomationExtra(s));
  return [
    ...new Set([
      ...CRYPTO_OHLCV_PRIORITY_V1,
      ...FX_OHLCV_PRIORITY_V1,
      ...ASX_OHLCV_PRIORITY_V1,
      ...UK_OHLCV_PRIORITY_V1,
      ...CBOE_UK_OHLCV_PRIORITY_V1,
      ...CBOE_AU_OHLCV_PRIORITY_V1,
      ...watch,
      ...extra,
    ]),
  ];
}

/** First ten symbols: BTC, ETH, SOL, … MATIC — quotes + discovery emphasis (see cryptoQuotePolicy). */
const CRYPTO_TD_QUOTE_PRIORITY_V1 = CRYPTO_OHLCV_PRIORITY_V1.slice(0, 10);

/** Sample ASX symbols for OHLCV priority (watchlist asx group also included via getSnapshotSymbols). */
const ASX_OHLCV_PRIORITY_V1 = [
  'BHP.AX',
  'CBA.AX',
  'WBC.AX',
  'CSL.AX',
  'FMG.AX',
];

/** Sample UK symbols for OHLCV priority (watchlist uk group also included via getSnapshotSymbols). */
const UK_OHLCV_PRIORITY_V1 = ['VOD.L', 'SHEL.L', 'BP.L', 'HSBA.L', 'LLOY.L'];

/** Cboe Europe UK — distinct *.BCXE canonicals (avoid conflating with LSE *.L). */
const CBOE_UK_OHLCV_PRIORITY_V1 = ['VOD.BCXE', 'BP.BCXE', 'SHEL.BCXE'];

/** Cboe Australia — *.CXAC canonicals (distinct from ASX *.AX). */
const CBOE_AU_OHLCV_PRIORITY_V1 = ['BHP.CXAC', 'CBA.CXAC', 'WBC.CXAC', 'CSL.CXAC'];

module.exports = {
  getOhlcvTier1Symbols,
  isTier1AutomationExtra,
  CRYPTO_OHLCV_PRIORITY_V1,
  CRYPTO_TD_QUOTE_PRIORITY_V1,
  FX_OHLCV_PRIORITY_V1,
  ASX_OHLCV_PRIORITY_V1,
  UK_OHLCV_PRIORITY_V1,
  CBOE_UK_OHLCV_PRIORITY_V1,
  CBOE_AU_OHLCV_PRIORITY_V1,
};
