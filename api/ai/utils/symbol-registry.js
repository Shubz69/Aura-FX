/**
 * Central symbol normalization registry for Aura AI and market data backends.
 * Uses the server watchlist as the main symbol universe, then layers provider-specific
 * aliases and fallback heuristics for symbols that are not direct market-watch rows.
 *
 * Contract: `toCanonical()` / `canonical` is always compact (e.g. EURUSD). Slash forms
 * (EUR/USD) are display- or provider-only — use `displayFxCross()` or Twelve Data’s `twelveDataSymbol`.
 */

const { getWatchlistPayload } = require('../../market/defaultWatchlist');
const { ukTwelveDataExchangeCode } = require('../../market-data/equities/ukMarketGuards');
const { cboeEuropeUkTdExchangeCode } = require('../../market-data/equities/cboeEuropeUkMarketGuards');
const { cboeAustraliaTdExchangeCode } = require('../../market-data/equities/cboeAustraliaMarketGuards');
const {
  getVentureMarketDefinitions,
  resolveVentureMarketDef,
  resolveVentureCategoryId: ventureCategoryIdForCanonical,
  escapeRe,
} = require('../../market-data/equities/ventureRemainingMarkets');

const WATCHLIST = getWatchlistPayload();
const WATCHLIST_GROUPS = WATCHLIST?.groups || {};
const WATCHLIST_PROVIDER_MAPPING = WATCHLIST?.providerMapping || {};

const WATCHLIST_SYMBOL_TO_GROUP = {};
Object.entries(WATCHLIST_GROUPS).forEach(([groupKey, group]) => {
  (group.symbols || []).forEach((row) => {
    if (row?.symbol) WATCHLIST_SYMBOL_TO_GROUP[String(row.symbol).toUpperCase()] = groupKey;
  });
});

const CANONICAL_EQUIVALENTS = {
  SPX: 'SPX',
  '^GSPC': 'SPX',
  SP500: 'SPX',
  'S&P500': 'SPX',
  'S&P 500': 'SPX',
  NDX: 'NDX',
  '^NDX': 'NDX',
  NAS100: 'NDX',
  NASDAQ100: 'NDX',
  DJI: 'DJI',
  '^DJI': 'DJI',
  DOW: 'DJI',
  DAX: 'DAX',
  '^GDAXI': 'DAX',
  GOLD: 'XAUUSD',
  XAU: 'XAUUSD',
  'XAU/USD': 'XAUUSD',
  SILVER: 'XAGUSD',
  XAG: 'XAGUSD',
  'XAG/USD': 'XAGUSD',
  BITCOIN: 'BTCUSD',
  BTC: 'BTCUSD',
  'BTC/USD': 'BTCUSD',
  ETHEREUM: 'ETHUSD',
  ETH: 'ETHUSD',
  'ETH/USD': 'ETHUSD',
  OIL: 'WTI',
  CRUDE: 'WTI',
  WTI: 'WTI',
  BRENT: 'BRENT',
  DXY: 'DXY',
  USDX: 'DXY',
};

const CANONICAL_TO_FINNHUB = {
  XAUUSD: 'OANDA:XAU_USD',
  XAGUSD: 'OANDA:XAG_USD',
  BTCUSD: 'BINANCE:BTCUSDT',
  ETHUSD: 'BINANCE:ETHUSDT',
  SOLUSD: 'BINANCE:SOLUSDT',
  XRPUSD: 'BINANCE:XRPUSDT',
  BNBUSD: 'BINANCE:BNBUSDT',
  ADAUSD: 'BINANCE:ADAUSDT',
  DOGEUSD: 'BINANCE:DOGEUSDT',
  LINKUSD: 'BINANCE:LINKUSDT',
  DOTUSD: 'BINANCE:DOTUSDT',
  MATICUSD: 'BINANCE:MATICUSDT',
  AVAXUSD: 'BINANCE:AVAXUSDT',
  ATOMUSD: 'BINANCE:ATOMUSDT',
  LTCUSD: 'BINANCE:LTCUSDT',
  SHIBUSD: 'BINANCE:SHIBUSDT',
  TRXUSD: 'BINANCE:TRXUSDT',
  TONUSD: 'BINANCE:TONUSDT',
  NEARUSD: 'BINANCE:NEARUSDT',
  APTUSD: 'BINANCE:APTUSDT',
  ARBUSD: 'BINANCE:ARBUSDT',
  OPUSD: 'BINANCE:OPUSDT',
};

const CANONICAL_TO_DECODER_PROXY = {
  SPX: 'SPY',
  NDX: 'QQQ',
  DJI: 'DIA',
  DXY: 'UUP',
  WTI: 'USO',
  BRENT: 'BNO',
};

function normalizeInput(input) {
  return String(input || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/\//g, '')
    .replace(/_/g, '')
    .replace(/:/g, '');
}

/** Twelve Data style TICKER:ASX → canonical TICKER.AX (internal / DB / API keys). */
function asxTwelveDataInputToCanonical(upper) {
  const u = String(upper || '').toUpperCase().trim();
  const m = u.match(/^([A-Z0-9.\-]+):ASX$/);
  if (!m) return null;
  const base = m[1].replace(/\./g, '');
  return `${base}.AX`;
}

/** Twelve Data TICKER:CXAC (or TWELVE_DATA_CBOE_AU_EXCHANGE_CODE) → canonical TICKER.CXAC */
function cboeAustraliaTwelveDataInputToCanonical(upper) {
  const u = String(upper || '').toUpperCase().trim();
  const ex = cboeAustraliaTdExchangeCode().toUpperCase();
  const exEsc = ex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^([A-Z0-9.\\-]+):${exEsc}$`);
  const m = u.match(re);
  if (!m) return null;
  const base = m[1].replace(/\./g, '');
  return `${base}.CXAC`;
}

/** Twelve Data TICKER:BCXE (or TWELVE_DATA_CBOE_UK_EXCHANGE_CODE) → canonical TICKER.BCXE */
function cboeEuropeUkTwelveDataInputToCanonical(upper) {
  const u = String(upper || '').toUpperCase().trim();
  const ex = cboeEuropeUkTdExchangeCode().toUpperCase();
  const exEsc = ex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^([A-Z0-9.\\-]+):${exEsc}$`);
  const m = u.match(re);
  if (!m) return null;
  const base = m[1].replace(/\./g, '');
  return `${base}.BCXE`;
}

/** Twelve Data TICKER:LSE (or TWELVE_DATA_UK_EXCHANGE_CODE) → canonical TICKER.L */
function ukTwelveDataInputToCanonical(upper) {
  const u = String(upper || '').toUpperCase().trim();
  const ex = ukTwelveDataExchangeCode().toUpperCase();
  const exEsc = ex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^([A-Z0-9.\\-]+):${exEsc}$`);
  const m = u.match(re);
  if (!m) return null;
  const base = m[1].replace(/\./g, '');
  return `${base}.L`;
}

/** Twelve Data TICKER:XETRA|TSX|… → canonical TICKER.DE / .TO / … */
function ventureTwelveDataInputToCanonical(upper) {
  const u = String(upper || '').toUpperCase().trim();
  for (const d of getVentureMarketDefinitions()) {
    const ex = d.twelveDataExchange.toUpperCase();
    const re = new RegExp(`^([A-Z0-9.\\-]+):${escapeRe(ex)}$`);
    const m = u.match(re);
    if (!m) continue;
    const bare = d.suffix.startsWith('.') ? d.suffix.slice(1).toUpperCase() : d.suffix.toUpperCase();
    return `${m[1].toUpperCase()}.${bare}`;
  }
  return null;
}

/** TICKER.SUFFIX (venture regional) → normalized canonical */
function ventureDotSuffixToCanonical(upper) {
  const u = String(upper || '').toUpperCase().trim();
  const defs = [...getVentureMarketDefinitions()].sort((a, b) => b.suffix.length - a.suffix.length);
  for (const d of defs) {
    const bare = (d.suffix.startsWith('.') ? d.suffix.slice(1) : d.suffix).toUpperCase();
    const re = new RegExp(`^([A-Z0-9.\\-]+)\\.${bare}$`, 'i');
    const m = u.match(re);
    if (m) return `${m[1].toUpperCase()}.${bare}`;
  }
  return null;
}

function toCanonical(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const upper = raw.toUpperCase();
  const fromTdAsx = asxTwelveDataInputToCanonical(upper);
  if (fromTdAsx) return fromTdAsx;
  const fromTdCboeAu = cboeAustraliaTwelveDataInputToCanonical(upper);
  if (fromTdCboeAu) return fromTdCboeAu;
  const fromTdCboe = cboeEuropeUkTwelveDataInputToCanonical(upper);
  if (fromTdCboe) return fromTdCboe;
  const fromTdUk = ukTwelveDataInputToCanonical(upper);
  if (fromTdUk) return fromTdUk;
  const fromTdVenture = ventureTwelveDataInputToCanonical(upper);
  if (fromTdVenture) return fromTdVenture;

  const dotAx = /^([A-Z0-9.\-]+)\.AX$/i.exec(upper);
  if (dotAx) return `${dotAx[1].toUpperCase().replace(/\./g, '')}.AX`;
  const dotCxac = /^([A-Z0-9.\-]+)\.CXAC$/i.exec(upper);
  if (dotCxac) return `${dotCxac[1].toUpperCase().replace(/\./g, '')}.CXAC`;
  const dotBcxe = /^([A-Z0-9.\-]+)\.BCXE$/i.exec(upper);
  if (dotBcxe) return `${dotBcxe[1].toUpperCase().replace(/\./g, '')}.BCXE`;
  const dotL = /^([A-Z0-9.\-]+)\.L$/i.exec(upper);
  if (dotL) return `${dotL[1].toUpperCase().replace(/\./g, '')}.L`;

  const fromDotVenture = ventureDotSuffixToCanonical(upper);
  if (fromDotVenture) return fromDotVenture;

  if (WATCHLIST_SYMBOL_TO_GROUP[upper]) return upper;

  if (upper.includes(':')) {
    const tail = upper.split(':').pop();
    if (WATCHLIST_SYMBOL_TO_GROUP[tail]) return tail;
    if (/^[A-Z]{3}_[A-Z]{3}$/.test(tail)) return tail.replace('_', '');
  }

  const normalized = normalizeInput(raw);
  if (WATCHLIST_SYMBOL_TO_GROUP[normalized]) return normalized;
  if (CANONICAL_EQUIVALENTS[normalized]) return CANONICAL_EQUIVALENTS[normalized];

  return normalized;
}

function canonicalToAlphaVantage(canonical) {
  if (/^[A-Z]{6}$/.test(canonical)) {
    return `FX:${canonical}`;
  }
  return canonical;
}

function getAssetClass(canonical) {
  const c = toCanonical(canonical);
  const group = WATCHLIST_SYMBOL_TO_GROUP[c];
  if (group === 'forex') return 'forex';
  if (group === 'commodities') return 'commodity';
  if (group === 'crypto') return 'crypto';
  if (group === 'indices' || group === 'macro') return 'index';
  if (group === 'asx') return 'stock';
  if (group === 'cboeAu') return 'stock';
  if (group === 'uk') return 'stock';
  if (group === 'cboeUk') return 'stock';
  if (group === 'stocks' || group === 'etfs') return 'stock';
  if (c.endsWith('=F')) return 'future';
  if (/\.AX$/i.test(c)) return 'stock';
  if (/\.CXAC$/i.test(c)) return 'stock';
  if (/\.BCXE$/i.test(c)) return 'stock';
  if (/\.L$/i.test(c)) return 'stock';
  if (resolveVentureMarketDef(c)) return 'stock';
  if (/^[A-Z]{6}$/.test(c)) return 'forex';
  return 'stock';
}

/** True for G10-style pairs and spot metals that share FX-style Twelve Data symbols. */
function usesForexSessionContext(canonical) {
  const c = toCanonical(canonical);
  if (c === 'XAUUSD' || c === 'XAGUSD') return true;
  return getAssetClass(c) === 'forex';
}

function isForexPair(canonical) {
  const c = toCanonical(canonical);
  return /^[A-Z]{6}$/.test(c) && getAssetClass(c) === 'forex';
}

/** Stocks & ETFs (watchlist asset class stock) — Twelve Data fundamentals / equity datasets. */
function supportsEquityTwelveDataDatasets(canonical) {
  return getAssetClass(toCanonical(canonical)) === 'stock';
}

/** Australian listings using canonical TICKER.AX (Twelve Data: TICKER:ASX). */
function isAsxListedEquity(canonical) {
  const c = toCanonical(canonical);
  return WATCHLIST_SYMBOL_TO_GROUP[c] === 'asx' || /\.AX$/i.test(c);
}

/**
 * Cboe Australia: canonical TICKER.CXAC (Twelve Data: TICKER:CXAC).
 * Mutually exclusive venue suffix vs ASX `.AX` / `TICKER:ASX` — never merge or substitute
 * prices, fundamentals, or regulatory data across Australian venues for the same underlying name.
 */
function isCboeAustraliaListedEquity(canonical) {
  const c = toCanonical(canonical);
  return WATCHLIST_SYMBOL_TO_GROUP[c] === 'cboeAu' || /\.CXAC$/i.test(c);
}

/** UK listings: canonical TICKER.L (LSE/AIM-style; Twelve Data: TICKER:LSE by default). */
function isUkListedEquity(canonical) {
  const c = toCanonical(canonical);
  return WATCHLIST_SYMBOL_TO_GROUP[c] === 'uk' || /\.L$/i.test(c);
}

/**
 * Cboe Europe Equities UK: canonical TICKER.BCXE (Twelve Data MIC BCXE).
 * Mutually exclusive venue suffix vs LSE/AIM `.L` — never merge or substitute prices/fundamentals across venues.
 */
function isCboeEuropeUkListedEquity(canonical) {
  const c = toCanonical(canonical);
  return WATCHLIST_SYMBOL_TO_GROUP[c] === 'cboeUk' || /\.BCXE$/i.test(c);
}

/** Config-driven regional listings (Xetra, TSX, …) — distinct canonical suffixes. */
function isVentureRegionalEquity(canonical) {
  const c = toCanonical(canonical);
  return resolveVentureMarketDef(c) != null;
}

/** @param {string} input - raw or canonical */
function resolveVentureCategoryId(input) {
  return ventureCategoryIdForCanonical(toCanonical(input));
}

/** GBX→GBP normalization applies to LSE-style and BCXE UK listings. */
function canonicalUsesUkVenueMoneyNormalization(canonical) {
  const c = toCanonical(canonical);
  return isUkListedEquity(c) || isCboeEuropeUkListedEquity(c);
}

function getMarketType(canonical) {
  const cls = getAssetClass(canonical);
  if (cls === 'forex') return 'FX';
  if (cls === 'crypto') return 'Crypto';
  if (cls === 'commodity') return 'Commodity';
  if (cls === 'index') return 'Index';
  return 'Equity';
}

function forProvider(canonical, provider) {
  const c = toCanonical(canonical);
  switch (provider) {
    case 'twelvedata':
      if (isCboeAustraliaListedEquity(c)) {
        const ex = cboeAustraliaTdExchangeCode();
        const base = c.replace(/\.CXAC$/i, '');
        return `${base}:${ex}`;
      }
      if (isAsxListedEquity(c)) {
        const base = c.replace(/\.AX$/i, '');
        return `${base}:ASX`;
      }
      if (isCboeEuropeUkListedEquity(c)) {
        const ex = cboeEuropeUkTdExchangeCode();
        const base = c.replace(/\.BCXE$/i, '');
        return `${base}:${ex}`;
      }
      if (isUkListedEquity(c)) {
        const ex = ukTwelveDataExchangeCode();
        const base = c.replace(/\.L$/i, '');
        return `${base}:${ex}`;
      }
      {
        const vd = resolveVentureMarketDef(c);
        if (vd) {
          const bare = vd.suffix.startsWith('.') ? vd.suffix.slice(1) : vd.suffix;
          const base = c.replace(new RegExp(`\\.${bare}$`, 'i'), '');
          return `${base}:${vd.twelveDataExchange}`;
        }
      }
      if (getAssetClass(c) === 'stock' || getAssetClass(c) === 'index') return c;
      if (/^[A-Z]{6}$/.test(c)) return `${c.slice(0, 3)}/${c.slice(3, 6)}`;
      if (getAssetClass(c) === 'crypto') {
        const m = c.match(/^([A-Z0-9]+)(USD|USDT|EUR|GBP)$/);
        if (m) return `${m[1]}/${m[2] === 'USDT' ? 'USDT' : m[2]}`;
      }
      return c.replace(/([A-Z]{3})(USD)$/, '$1/$2');
    case 'finnhub':
      if (CANONICAL_TO_FINNHUB[c]) return CANONICAL_TO_FINNHUB[c];
      if (/\.AX$/i.test(c)) return c.toUpperCase();
      if (/\.CXAC$/i.test(c)) return c.toUpperCase();
      if (/\.BCXE$/i.test(c)) return c.toUpperCase();
      if (/\.L$/i.test(c)) return c.toUpperCase();
      if (resolveVentureMarketDef(c)) return c.toUpperCase();
      if (/^[A-Z]{6}$/.test(c)) {
        return `OANDA:${c.slice(0, 3)}_${c.slice(3, 6)}`;
      }
      return CANONICAL_TO_DECODER_PROXY[c] || c;
    case 'alphavantage':
      return canonicalToAlphaVantage(c);
    case 'yahoo':
      if (/\.AX$/i.test(c)) return c.toUpperCase();
      if (/\.CXAC$/i.test(c)) return c.toUpperCase();
      if (/\.BCXE$/i.test(c)) return c.toUpperCase();
      if (/\.L$/i.test(c)) return c.toUpperCase();
      if (resolveVentureMarketDef(c)) return c.toUpperCase();
      return WATCHLIST_PROVIDER_MAPPING[c] || (/^[A-Z]{6}$/.test(c) ? `${c}=X` : c);
    default:
      return c;
  }
}

/**
 * UI-only FX / spot-metal cross (e.g. EURUSD → EUR/USD). DB, caches, and APIs use `canonical` without slash.
 */
function displayFxCross(canonical) {
  const c = toCanonical(canonical);
  if (!/^[A-Z]{6}$/.test(c)) return null;
  if (!usesForexSessionContext(c)) return null;
  return `${c.slice(0, 3)}/${c.slice(3, 6)}`;
}

function getResolvedSymbol(input) {
  const canonical = toCanonical(input);
  const marketType = getMarketType(canonical);
  const assetClass = getAssetClass(canonical);
  return {
    canonical,
    displaySymbol: canonical,
    displayFxCross: displayFxCross(canonical),
    assetClass,
    marketType,
    candleKind: marketType === 'FX' || marketType === 'Commodity' ? 'forex' : marketType === 'Crypto' ? 'crypto' : 'stock',
    finnhubSymbol: forProvider(canonical, 'finnhub'),
    twelveDataSymbol: forProvider(canonical, 'twelvedata'),
    yahooSymbol: forProvider(canonical, 'yahoo'),
    alphaVantageSymbol: forProvider(canonical, 'alphavantage'),
    decoderProxySymbol: CANONICAL_TO_DECODER_PROXY[canonical] || canonical,
    watchlistGroup: WATCHLIST_SYMBOL_TO_GROUP[canonical] || null,
  };
}

module.exports = {
  toCanonical,
  forProvider,
  getAssetClass,
  getMarketType,
  getResolvedSymbol,
  displayFxCross,
  usesForexSessionContext,
  isForexPair,
  isAsxListedEquity,
  isCboeAustraliaListedEquity,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isVentureRegionalEquity,
  resolveVentureCategoryId,
  canonicalUsesUkVenueMoneyNormalization,
  supportsEquityTwelveDataDatasets,
  ALIAS_TO_CANONICAL: CANONICAL_EQUIVALENTS,
  CANONICAL_TO_FINNHUB,
};
