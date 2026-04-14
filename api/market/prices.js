/**
 * Market Prices API - Batch price fetcher with fallback providers
 * 
 * GET /api/market/prices?symbols=BTCUSD,ETHUSD,AAPL
 * Returns current prices for multiple symbols
 * 
 * Features:
 * - Primary provider (Yahoo Finance) with secondary fallback (Finnhub)
 * - Persistent cache to prevent 0.00 prices
 * - Never returns 0.00 - uses cached price with "delayed" flag
 * - Timeout protection (5s per provider)
 * - Health monitoring
 */

const axios = require('axios');
const { getWatchlistPayload } = require('./defaultWatchlist');
const {
  toCanonical,
  forProvider,
  getAssetClass,
  usesForexSessionContext,
  isAsxListedEquity,
  isUkListedEquity,
  isCboeEuropeUkListedEquity,
  isCboeAustraliaListedEquity,
  isVentureRegionalEquity,
} = require('../ai/utils/symbol-registry');

function buildSymbolDecimalsMap() {
  const out = {};
  try {
    const wl = getWatchlistPayload();
    Object.values(wl.groups).forEach((g) => {
      (g.symbols || []).forEach((row) => {
        if (row.symbol && typeof row.decimals === 'number') out[row.symbol] = row.decimals;
      });
    });
  } catch (e) {
    /* ignore */
  }
  return out;
}

const SYMBOL_DECIMALS = buildSymbolDecimalsMap();

// Persistent price cache (survives between requests)
// Key: symbol, Value: { ...priceData, timestamp }
const priceCache = new Map();
const CACHE_TTL = 2000; // Fresh data TTL: 2 seconds for accuracy
const STALE_TTL = 300000; // Stale data TTL: 5 minutes (use as delayed fallback)
const REQUEST_TIMEOUT = 5000; // 5 second timeout per request

// Health stats
const healthStats = {
  totalRequests: 0,
  successfulFetches: 0,
  cacheHits: 0,
  staleFallbacks: 0,
  errors: 0,
  lastSuccessTime: 0,
  avgLatency: 0
};

// Yahoo Finance: indices, macro, commodities futures, crypto, FX
const FOREX_YAHOO = {
  EURJPY: 'EURJPY=X', GBPJPY: 'GBPJPY=X', EURGBP: 'EURGBP=X', EURAUD: 'EURAUD=X', EURCHF: 'EURCHF=X',
  EURCAD: 'EURCAD=X', EURNZD: 'EURNZD=X', EURSEK: 'EURSEK=X', EURNOK: 'EURNOK=X', EURDKK: 'EURDKK=X',
  GBPAUD: 'GBPAUD=X', GBPCHF: 'GBPCHF=X', GBPCAD: 'GBPCAD=X', GBPNZD: 'GBPNZD=X',
  AUDJPY: 'AUDJPY=X', AUDCHF: 'AUDCHF=X', AUDCAD: 'AUDCAD=X', AUDNZD: 'AUDNZD=X',
  NZDJPY: 'NZDJPY=X', NZDCHF: 'NZDCHF=X', NZDCAD: 'NZDCAD=X',
  CADJPY: 'CADJPY=X', CADCHF: 'CADCHF=X', CHFJPY: 'CHFJPY=X',
  USDSEK: 'USDSEK=X', USDNOK: 'USDNOK=X', USDDKK: 'USDDKK=X', USDHKD: 'USDHKD=X',
  USDSGD: 'USDSGD=X', USDZAR: 'USDZAR=X', USDMXN: 'USDMXN=X', USDTRY: 'USDTRY=X',
  USDPLN: 'USDPLN=X', USDINR: 'USDINR=X', USDTHB: 'USDTHB=X', USDILS: 'USDILS=X',
  USDCNH: 'CNH=X', EURPLN: 'EURPLN=X', EURTRY: 'EURTRY=X'
};

const YAHOO_SYMBOLS = Object.assign(
  {
    SPX: '^GSPC',
    NDX: '^NDX',
    DJI: '^DJI',
    FTSE: '^FTSE',
    DAX: '^GDAXI',
    NIKKEI: '^N225',
    HSI: '^HSI',
    CAC: '^FCHI',
    RUT: '^RUT',
    ASX: '^AXJO',
    STOXX50: '^STOXX50E',
    IBEX: '^IBEX',
    KOSPI: '^KS11',
    CSI300: '000300.SS',
    VIX: '^VIX',
    DXY: 'DX-Y.NYB',
    US10Y: '^TNX',
    US30Y: '^TYX',
    USOIL: 'CL=F',
    UKOIL: 'BZ=F',
    XNGUSD: 'NG=F',
    XCUUSD: 'HG=F',
    XPTUSD: 'PL=F',
    XPDUSD: 'PA=F',
    CORN: 'ZC=F',
    WHEAT: 'ZW=F',
    SOYBEAN: 'ZS=F',
    COFFEE: 'KC=F',
    SUGAR: 'SB=F',
    COCOA: 'CC=F',
    WTI: 'CL=F',
    BRENT: 'BZ=F',
    NATGAS: 'NG=F',
    COPPER: 'HG=F',
    PLAT: 'PL=F',
    PALL: 'PA=F',
    BTCUSD: 'BTC-USD',
    ETHUSD: 'ETH-USD',
    SOLUSD: 'SOL-USD',
    XRPUSD: 'XRP-USD',
    BNBUSD: 'BNB-USD',
    ADAUSD: 'ADA-USD',
    DOGEUSD: 'DOGE-USD',
    LINKUSD: 'LINK-USD',
    DOTUSD: 'DOT-USD',
    MATICUSD: 'MATIC-USD',
    AVAXUSD: 'AVAX-USD',
    ATOMUSD: 'ATOM-USD',
    LTCUSD: 'LTC-USD',
    SHIBUSD: 'SHIB-USD',
    TRXUSD: 'TRX-USD',
    TONUSD: 'TON-USD',
    NEARUSD: 'NEAR-USD',
    APTUSD: 'APT-USD',
    ARBUSD: 'ARB-USD',
    OPUSD: 'OP-USD',
    EURUSD: 'EURUSD=X',
    GBPUSD: 'GBPUSD=X',
    USDJPY: 'JPY=X',
    USDCHF: 'CHF=X',
    AUDUSD: 'AUDUSD=X',
    USDCAD: 'CAD=X',
    NZDUSD: 'NZDUSD=X',
    XAUUSD: 'GC=F',
    XAGUSD: 'SI=F'
  },
  FOREX_YAHOO
);

const COINGECKO_IDS = {
  BTCUSD: 'bitcoin',
  ETHUSD: 'ethereum',
  SOLUSD: 'solana',
  XRPUSD: 'ripple',
  BNBUSD: 'binancecoin',
  ADAUSD: 'cardano',
  DOGEUSD: 'dogecoin',
  LINKUSD: 'chainlink',
  DOTUSD: 'polkadot',
  MATICUSD: 'matic-network',
  AVAXUSD: 'avalanche-2',
  ATOMUSD: 'cosmos',
  LTCUSD: 'litecoin',
  SHIBUSD: 'shiba-inu',
  TRXUSD: 'tron',
  TONUSD: 'the-open-network',
  NEARUSD: 'near',
  APTUSD: 'aptos',
  ARBUSD: 'arbitrum',
  OPUSD: 'optimism'
};

const FINNHUB_SYMBOLS = {
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
  EURUSD: 'OANDA:EUR_USD',
  GBPUSD: 'OANDA:GBP_USD',
  USDJPY: 'OANDA:USD_JPY',
  USDCHF: 'OANDA:USD_CHF',
  AUDUSD: 'OANDA:AUD_USD',
  USDCAD: 'OANDA:USD_CAD',
  NZDUSD: 'OANDA:NZD_USD',
  EURJPY: 'OANDA:EUR_JPY',
  GBPJPY: 'OANDA:GBP_JPY',
  EURGBP: 'OANDA:EUR_GBP',
  EURAUD: 'OANDA:EUR_AUD',
  EURCHF: 'OANDA:EUR_CHF',
  EURCAD: 'OANDA:EUR_CAD',
  EURNZD: 'OANDA:EUR_NZD',
  EURSEK: 'OANDA:EUR_SEK',
  EURNOK: 'OANDA:EUR_NOK',
  EURDKK: 'OANDA:EUR_DKK',
  GBPAUD: 'OANDA:GBP_AUD',
  GBPCHF: 'OANDA:GBP_CHF',
  GBPCAD: 'OANDA:GBP_CAD',
  GBPNZD: 'OANDA:GBP_NZD',
  AUDJPY: 'OANDA:AUD_JPY',
  AUDCHF: 'OANDA:AUD_CHF',
  AUDCAD: 'OANDA:AUD_CAD',
  AUDNZD: 'OANDA:AUD_NZD',
  NZDJPY: 'OANDA:NZD_JPY',
  NZDCHF: 'OANDA:NZD_CHF',
  NZDCAD: 'OANDA:NZD_CAD',
  CADJPY: 'OANDA:CAD_JPY',
  CADCHF: 'OANDA:CAD_CHF',
  CHFJPY: 'OANDA:CHF_JPY',
  USDSEK: 'OANDA:USD_SEK',
  USDNOK: 'OANDA:USD_NOK',
  USDDKK: 'OANDA:USD_DKK',
  USDHKD: 'OANDA:USD_HKD',
  USDSGD: 'OANDA:USD_SGD',
  USDZAR: 'OANDA:USD_ZAR',
  USDMXN: 'OANDA:USD_MXN',
  USDTRY: 'OANDA:USD_TRY',
  USDPLN: 'OANDA:USD_PLN',
  USDCNH: 'OANDA:USD_CNH',
  EURPLN: 'OANDA:EUR_PLN',
  EURTRY: 'OANDA:EUR_TRY',
  USDINR: 'OANDA:USD_INR',
  USDTHB: 'OANDA:USD_THB',
  USDILS: 'OANDA:USD_ILS',
  XAUUSD: 'OANDA:XAU_USD',
  XAGUSD: 'OANDA:XAG_USD'
};

const TWELVE_DATA_SYMBOLS = {
  BTCUSD: 'BTC/USD',
  ETHUSD: 'ETH/USD',
  SOLUSD: 'SOL/USD',
  XRPUSD: 'XRP/USD',
  BNBUSD: 'BNB/USD',
  ADAUSD: 'ADA/USD',
  DOGEUSD: 'DOGE/USD',
  LINKUSD: 'LINK/USD',
  DOTUSD: 'DOT/USD',
  MATICUSD: 'MATIC/USD',
  AVAXUSD: 'AVAX/USD',
  ATOMUSD: 'ATOM/USD',
  LTCUSD: 'LTC/USD',
  SHIBUSD: 'SHIB/USD',
  TRXUSD: 'TRX/USD',
  TONUSD: 'TON/USD',
  NEARUSD: 'NEAR/USD',
  APTUSD: 'APT/USD',
  ARBUSD: 'ARB/USD',
  OPUSD: 'OP/USD',
  EURUSD: 'EUR/USD',
  GBPUSD: 'GBP/USD',
  USDJPY: 'USD/JPY',
  USDCHF: 'USD/CHF',
  AUDUSD: 'AUD/USD',
  USDCAD: 'USD/CAD',
  NZDUSD: 'NZD/USD',
  EURJPY: 'EUR/JPY',
  GBPJPY: 'GBP/JPY',
  EURGBP: 'EUR/GBP',
  EURAUD: 'EUR/AUD',
  EURCHF: 'EUR/CHF',
  EURCAD: 'EUR/CAD',
  EURNZD: 'EUR/NZD',
  EURSEK: 'EUR/SEK',
  EURNOK: 'EUR/NOK',
  EURDKK: 'EUR/DKK',
  GBPAUD: 'GBP/AUD',
  GBPCHF: 'GBP/CHF',
  GBPCAD: 'GBP/CAD',
  GBPNZD: 'GBP/NZD',
  AUDJPY: 'AUD/JPY',
  AUDCHF: 'AUD/CHF',
  AUDCAD: 'AUD/CAD',
  AUDNZD: 'AUD/NZD',
  NZDJPY: 'NZD/JPY',
  NZDCHF: 'NZD/CHF',
  NZDCAD: 'NZD/CAD',
  CADJPY: 'CAD/JPY',
  CADCHF: 'CAD/CHF',
  CHFJPY: 'CHF/JPY',
  USDSEK: 'USD/SEK',
  USDNOK: 'USD/NOK',
  USDDKK: 'USD/DKK',
  USDHKD: 'USD/HKD',
  USDSGD: 'USD/SGD',
  USDZAR: 'USD/ZAR',
  USDMXN: 'USD/MXN',
  USDTRY: 'USD/TRY',
  USDPLN: 'USD/PLN',
  USDINR: 'USD/INR',
  USDTHB: 'USD/THB',
  USDILS: 'USD/ILS',
  USDCNH: 'USD/CNH',
  EURPLN: 'EUR/PLN',
  EURTRY: 'EUR/TRY',
  XAUUSD: 'XAU/USD',
  XAGUSD: 'XAG/USD',
  AAPL: 'AAPL',
  MSFT: 'MSFT',
  NVDA: 'NVDA',
  AMZN: 'AMZN',
  GOOGL: 'GOOGL',
  META: 'META',
  TSLA: 'TSLA',
  AVGO: 'AVGO',
  JPM: 'JPM',
  V: 'V',
  UNH: 'UNH',
  JNJ: 'JNJ',
  WMT: 'WMT',
  XOM: 'XOM',
  MA: 'MA',
  PG: 'PG',
  HD: 'HD',
  ORCL: 'ORCL',
  COST: 'COST',
  MRK: 'MRK',
  ABBV: 'ABBV',
  PEP: 'PEP',
  KO: 'KO',
  BAC: 'BAC',
  CRM: 'CRM',
  AMD: 'AMD',
  TMO: 'TMO',
  MCD: 'MCD',
  CSCO: 'CSCO',
  ACN: 'ACN',
  NFLX: 'NFLX',
  DIS: 'DIS',
  ADBE: 'ADBE',
  WFC: 'WFC',
  ISRG: 'ISRG',
  QCOM: 'QCOM',
  TXN: 'TXN',
  UPS: 'UPS',
  MS: 'MS',
  PM: 'PM',
  INTU: 'INTU',
  AMAT: 'AMAT',
  GE: 'GE',
  HON: 'HON',
  IBM: 'IBM',
  SPGI: 'SPGI',
  CAT: 'CAT',
  BKNG: 'BKNG',
  LMT: 'LMT',
  DE: 'DE',
  'BRK-B': 'BRK-B'
};

const CRYPTO_SYMBOLS = new Set(Object.keys(COINGECKO_IDS));

const SPOT_FOREX = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  ...Object.keys(FOREX_YAHOO)
];
const SPOT_SYMBOLS = new Set([
  'XAUUSD', 'XAGUSD',
  ...CRYPTO_SYMBOLS,
  ...SPOT_FOREX
]);

/** Stooq spot FX + XAU/XAG (daily OHLC CSV; close tracks retail spot better than Yahoo GC=F/SI=F alone). */
const STOOQ_PARAM_BY_SYMBOL = {
  EURUSD: 'eurusd',
  GBPUSD: 'gbpusd',
  USDJPY: 'usdjpy',
  USDCHF: 'usdchf',
  AUDUSD: 'audusd',
  USDCAD: 'usdcad',
  NZDUSD: 'nzdusd',
  XAUUSD: 'xauusd',
  XAGUSD: 'xagusd',
  EURJPY: 'eurjpy',
  GBPJPY: 'gbpjpy',
  EURGBP: 'eurgbp',
  EURAUD: 'euraud',
  EURCHF: 'eurchf',
  EURCAD: 'eurcad',
  EURNZD: 'eurnzd',
  EURSEK: 'eursek',
  EURNOK: 'eurnok',
  EURDKK: 'eurdkk',
  GBPAUD: 'gbpaud',
  GBPCHF: 'gbpchf',
  GBPCAD: 'gbpcad',
  GBPNZD: 'gbpnzd',
  AUDJPY: 'audjpy',
  AUDCHF: 'audchf',
  AUDCAD: 'audcad',
  AUDNZD: 'audnzd',
  NZDJPY: 'nzdjpy',
  NZDCHF: 'nzdchf',
  NZDCAD: 'nzdcad',
  CADJPY: 'cadjpy',
  CADCHF: 'cadchf',
  CHFJPY: 'chfjpy',
  USDSEK: 'usdsek',
  USDNOK: 'usdnok',
  USDDKK: 'usddkk',
  USDHKD: 'usdhkd',
  USDSGD: 'usdsgd',
  USDZAR: 'usdzar',
  USDMXN: 'usdmxn',
  USDTRY: 'usdtry',
  USDPLN: 'usdpln',
  USDINR: 'usdinr',
  USDTHB: 'usdthb',
  USDILS: 'usdils',
  USDCNH: 'usdcnh',
  EURPLN: 'eurpln',
  EURTRY: 'eurtry'
};
const STOOQ_FOREX_METALS = new Set(Object.keys(STOOQ_PARAM_BY_SYMBOL));

/** Reject obvious bad Yahoo futures / parse glitches for spot gold & silver (USD). */
function isPlausibleSpotMetalPrice(symbol, rawPrice) {
  if (symbol !== 'XAUUSD' && symbol !== 'XAGUSD') return true;
  if (!rawPrice || !Number.isFinite(rawPrice)) return false;
  if (symbol === 'XAUUSD') return rawPrice >= 1800 && rawPrice <= 5200;
  if (symbol === 'XAGUSD') return rawPrice >= 5 && rawPrice <= 200;
  return true;
}

function buildStooqPriceRow(symbol, close) {
  if (!close || !Number.isFinite(close) || close <= 0) return null;
  if ((symbol === 'XAUUSD' || symbol === 'XAGUSD') && !isPlausibleSpotMetalPrice(symbol, close)) return null;
  return {
    symbol,
    price: formatPrice(close, symbol),
    rawPrice: close,
    previousClose: formatPrice(close, symbol),
    change: '0.00',
    changeSign: '+',
    changePercent: '0.00',
    isUp: true,
    timestamp: Date.now(),
    source: 'stooq',
    delayed: true,
  };
}

/**
 * One HTTP request: batch spot FX + gold/silver from Stooq (free, no API key).
 * @param {string[]} symbols - internal symbols e.g. EURUSD, XAUUSD
 * @returns {Record<string, ReturnType<buildStooqPriceRow>>}
 */
async function fetchStooqBatchMap(symbols) {
  const syms = symbols.filter((s) => STOOQ_PARAM_BY_SYMBOL[s]);
  if (syms.length === 0) return {};
  const STOOQ_CHUNK = 20;
  const out = {};
  for (let i = 0; i < syms.length; i += STOOQ_CHUNK) {
    const batch = syms.slice(i, i + STOOQ_CHUNK);
    const params = [...new Set(batch.map((s) => STOOQ_PARAM_BY_SYMBOL[s]).filter(Boolean))];
    if (params.length === 0) continue;
    const url = `https://stooq.com/q/l/?s=${params.join('+')}&i=d`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
      const response = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuraTerminal/1.0)' },
        responseType: 'text',
        transformResponse: [(d) => d],
      });
      clearTimeout(timeoutId);

      const text = typeof response.data === 'string' ? response.data : String(response.data || '');
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(',');
        if (parts.length < 7) continue;
        if (parts[1] === 'N/D' || String(parts[6]).toUpperCase() === 'N/D') continue;
        const sym = String(parts[0] || '').toUpperCase();
        if (!STOOQ_FOREX_METALS.has(sym)) continue;
        const close = parseFloat(parts[6]);
        const row = buildStooqPriceRow(sym, close);
        if (row) out[sym] = row;
      }
    } catch (e) {
      /* try next chunk */
    }
  }
  return out;
}

// Realistic fallback prices (when all providers fail) — ballpark Mar 2026
const FALLBACK_PRICES = {
  BTCUSD: 84500,
  ETHUSD: 1920,
  SOLUSD: 132,
  XRPUSD: 2.38,
  BNBUSD: 590,
  ADAUSD: 0.72,
  DOGEUSD: 0.175,
  LINKUSD: 15.2,
  DOTUSD: 4.2,
  MATICUSD: 0.42,
  AVAXUSD: 22,
  ATOMUSD: 5.1,
  LTCUSD: 78,
  SHIBUSD: 0.000012,
  TRXUSD: 0.22,
  TONUSD: 3.4,
  NEARUSD: 3.1,
  APTUSD: 4.8,
  ARBUSD: 0.45,
  OPUSD: 1.05,
  EURUSD: 1.084,
  GBPUSD: 1.292,
  USDJPY: 149.5,
  USDCHF: 0.884,
  AUDUSD: 0.627,
  USDCAD: 1.438,
  NZDUSD: 0.572,
  EURJPY: 162.2,
  GBPJPY: 193.4,
  EURGBP: 0.839,
  EURAUD: 1.73,
  EURCHF: 0.958,
  EURCAD: 1.558,
  EURNZD: 1.894,
  EURSEK: 11.45,
  EURNOK: 11.62,
  EURDKK: 7.46,
  GBPAUD: 2.06,
  GBPCHF: 1.142,
  GBPCAD: 1.858,
  GBPNZD: 2.258,
  AUDJPY: 93.6,
  AUDCHF: 0.552,
  AUDCAD: 0.898,
  AUDNZD: 1.095,
  NZDJPY: 85.5,
  NZDCHF: 0.504,
  NZDCAD: 0.82,
  CADJPY: 104.2,
  CADCHF: 0.615,
  CHFJPY: 169.2,
  USDSEK: 10.55,
  USDNOK: 10.72,
  USDDKK: 6.88,
  USDHKD: 7.78,
  USDSGD: 1.345,
  USDZAR: 18.2,
  USDMXN: 17.4,
  USDTRY: 34.5,
  USDPLN: 3.92,
  USDINR: 87.2,
  USDTHB: 33.5,
  USDILS: 3.65,
  USDCNH: 7.25,
  EURPLN: 4.25,
  EURTRY: 37.4,
  XAUUSD: 3035,
  XAGUSD: 33.8,
  USOIL: 68.4,
  UKOIL: 72.1,
  XNGUSD: 2.85,
  XCUUSD: 4.1,
  XPTUSD: 980,
  XPDUSD: 980,
  CORN: 4.5,
  WHEAT: 5.6,
  SOYBEAN: 10.4,
  COFFEE: 2.1,
  SUGAR: 0.19,
  COCOA: 4700,
  WTI: 68.4,
  BRENT: 72.1,
  NATGAS: 2.85,
  COPPER: 4.1,
  PLAT: 980,
  PALL: 980,
  SPX: 5650,
  NDX: 19600,
  DJI: 41800,
  DAX: 22300,
  FTSE: 8650,
  NIKKEI: 37200,
  HSI: 19800,
  CAC: 7480,
  RUT: 1980,
  ASX: 7800,
  STOXX50: 4780,
  IBEX: 11400,
  KOSPI: 2520,
  CSI300: 3850,
  DXY: 103.6,
  US10Y: 4.32,
  US30Y: 4.58,
  VIX: 20.4,
  AAPL: 214,
  MSFT: 388,
  NVDA: 112,
  AMZN: 196,
  GOOGL: 163,
  META: 590,
  TSLA: 248,
  AVGO: 218,
  JPM: 198,
  V: 310,
  UNH: 480,
  JNJ: 158,
  WMT: 78,
  XOM: 108,
  MA: 480,
  PG: 158,
  HD: 348,
  ORCL: 142,
  COST: 820,
  MRK: 88,
  ABBV: 188,
  PEP: 158,
  KO: 62,
  BAC: 38,
  CRM: 288,
  AMD: 118,
  TMO: 528,
  MCD: 288,
  CSCO: 52,
  ACN: 328,
  NFLX: 688,
  DIS: 98,
  ADBE: 488,
  WFC: 58,
  ISRG: 428,
  QCOM: 158,
  TXN: 178,
  UPS: 118,
  MS: 118,
  PM: 118,
  INTU: 628,
  AMAT: 158,
  GE: 178,
  HON: 198,
  IBM: 228,
  SPGI: 488,
  CAT: 328,
  BKNG: 3280,
  LMT: 528,
  DE: 388,
  'BRK-B': 428
};

function getDecimals(symbol, rawPriceHint) {
  if (SYMBOL_DECIMALS[symbol] !== undefined) return SYMBOL_DECIMALS[symbol];
  const hint =
    rawPriceHint != null && Number.isFinite(Number(rawPriceHint)) ? Number(rawPriceHint) : null;
  if (/\.L$/i.test(symbol)) {
    const { ukListingPriceDisplayDecimals } = require('../market-data/equities/ukMarketGuards');
    return ukListingPriceDisplayDecimals(symbol, hint);
  }
  try {
    const {
      displayDecimalsForSymbol,
      effectiveCryptoDisplayDecimals,
    } = require('../market-data/priceMath');
    const d0 = displayDecimalsForSymbol(symbol);
    if (d0 != null) return d0;
    if (
      getAssetClass(symbol) === 'crypto' &&
      rawPriceHint != null &&
      Number.isFinite(Number(rawPriceHint))
    ) {
      const d1 = effectiveCryptoDisplayDecimals(symbol, Number(rawPriceHint));
      if (d1 != null) return d1;
    }
  } catch (_) {
    /* ignore */
  }
  return 2;
}

/** @param {number|null|undefined} [rawPriceHint] - improves crypto decimal precision for low prices */
function formatPrice(price, symbol, rawPriceHint) {
  if (price === null || price === undefined || isNaN(price)) return null;
  const hint =
    rawPriceHint != null && Number.isFinite(Number(rawPriceHint))
      ? Number(rawPriceHint)
      : Number(price);
  const dec = getDecimals(symbol, hint);
  return parseFloat(price).toFixed(dec);
}

function formatLegacyChangePercent(changePercent, canonical) {
  if (changePercent == null || !Number.isFinite(changePercent)) {
    if (usesForexSessionContext(canonical)) return null;
    return '0.00';
  }
  try {
    if (getAssetClass(canonical) === 'crypto' || usesForexSessionContext(canonical)) {
      const { formatChangePercentDisplay } = require('../market-data/priceMath');
      return formatChangePercentDisplay(changePercent, canonical);
    }
  } catch (_) {
    /* ignore */
  }
  return Math.abs(changePercent).toFixed(2);
}

/**
 * Map internal QuoteDTO to legacy snapshot row (stable contract for /api/market/prices + snapshot).
 * @param {string} canonical
 * @param {import('../market-data/dto').QuoteDTO} dto
 */
function legacyPriceRowFromQuoteDto(canonical, dto) {
  if (!dto || dto.last == null || !Number.isFinite(dto.last) || dto.last <= 0) return null;
  const { changeVsPreviousClose, changeVsPreviousCloseOnly } = require('../market-data/priceMath');
  const fx = usesForexSessionContext(canonical);
  let change = null;
  let changePct = null;
  const vs = changeVsPreviousClose(dto);
  const vsFx = changeVsPreviousCloseOnly(dto);
  if (fx) {
    if (vsFx.change != null && vsFx.changePct != null) {
      change = vsFx.change;
      changePct = vsFx.changePct;
    } else if (dto.open != null && Number.isFinite(dto.open)) {
      change = dto.last - dto.open;
      changePct = null;
    } else {
      change = 0;
      changePct = null;
    }
  } else if (vs.change != null && vs.changePct != null) {
    change = vs.change;
    changePct = vs.changePct;
  } else if (dto.open != null && Number.isFinite(dto.open) && dto.open !== 0) {
    change = dto.last - dto.open;
    changePct = (change / Math.abs(dto.open)) * 100;
  } else {
    change = 0;
    changePct = 0;
  }
  const price = dto.last;
  let previousClose = dto.prevClose;
  if (!fx && (previousClose == null || !Number.isFinite(previousClose))) {
    previousClose = change != null ? price - change : price;
  }
  if (fx && (previousClose == null || !Number.isFinite(previousClose))) {
    previousClose = null;
  }
  const ch = change != null ? change : 0;
  const ts = dto.tsUtcMs != null && Number.isFinite(dto.tsUtcMs) ? dto.tsUtcMs : Date.now();
  const row = {
    symbol: canonical,
    price: formatPrice(price, canonical, price),
    rawPrice: price,
    previousClose:
      previousClose != null && Number.isFinite(previousClose)
        ? formatPrice(previousClose, canonical, price)
        : null,
    change: formatPrice(Math.abs(ch), canonical, price),
    changeSign: ch >= 0 ? '+' : '-',
    changePercent:
      changePct != null && Number.isFinite(changePct)
        ? formatLegacyChangePercent(changePct, canonical)
        : formatLegacyChangePercent(null, canonical),
    isUp: ch >= 0,
    high: dto.high != null ? dto.high : undefined,
    low: dto.low != null ? dto.low : undefined,
    open: dto.open != null ? dto.open : undefined,
    timestamp: ts,
    source: dto.source || 'twelvedata',
    delayed: false,
  };
  if (dto.forexContext && (dto.forexContext.marketState || dto.forexContext.exchangeSchedule)) {
    row.forexSession = {
      marketState: dto.forexContext.marketState || null,
      hasSchedule: Boolean(dto.forexContext.exchangeSchedule),
    };
    if (getAssetClass(canonical) === 'crypto') {
      row.cryptoSession = row.forexSession;
    }
  }
  return row;
}

/**
 * Fetch from Yahoo Finance (primary provider)
 */
async function fetchYahooPrice(symbol) {
  const canonical = toCanonical(symbol);
  const yahooSymbol = forProvider(canonical, 'yahoo') || YAHOO_SYMBOLS[canonical] || canonical;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    const response = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`,
      { 
        params: { interval: '1m', range: '1d' }, 
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json'
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    const result = response.data?.chart?.result?.[0];
    const meta = result?.meta;
    
    if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
      const price = meta.regularMarketPrice;
      const previousClose = meta.previousClose || meta.chartPreviousClose || price;
      const change = price - previousClose;
      const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
      
      return {
        symbol: canonical,
        price: formatPrice(price, canonical, price),
        rawPrice: price,
        previousClose: formatPrice(previousClose, canonical, price),
        change: formatPrice(Math.abs(change), canonical, price),
        changeSign: change >= 0 ? '+' : '-',
        changePercent: formatLegacyChangePercent(changePercent, canonical),
        isUp: change >= 0,
        high: meta.regularMarketDayHigh,
        low: meta.regularMarketDayLow,
        open: meta.regularMarketOpen,
        timestamp: Date.now(),
        source: 'yahoo',
        delayed: false
      };
    }
    return null;
  } catch (e) {
    // Don't log timeout errors as they're expected
    if (e.name !== 'AbortError') {
      console.log(`Yahoo fetch error for ${symbol}: ${e.message}`);
    }
    return null;
  }
}

/**
 * Fetch from CoinGecko (free, no API key, real-time crypto)
 */
async function fetchCoinGeckoPrice(symbol) {
  const cgId = COINGECKO_IDS[symbol];
  if (!cgId) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price`,
      {
        params: { ids: cgId, vs_currencies: 'usd' },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    const price = response.data?.[cgId]?.usd;
    if (!price || isNaN(price) || price <= 0) return null;

    return {
      symbol,
      price: formatPrice(price, symbol, price),
      rawPrice: price,
      previousClose: formatPrice(price, symbol, price),
      change: '0.00',
      changeSign: '+',
      changePercent: '0.00',
      isUp: true,
      timestamp: Date.now(),
      source: 'coingecko',
      delayed: false
    };
  } catch (e) {
    return null;
  }
}

/**
 * Fetch crypto batch from CoinGecko (efficient - one request for all crypto)
 */
let coingeckoCache = {};
let coingeckoCacheTime = 0;
const COINGECKO_CACHE_TTL = 5000; // 5s

async function fetchCoinGeckoBatch() {
  if (Date.now() - coingeckoCacheTime < COINGECKO_CACHE_TTL) return coingeckoCache;
  const ids = Object.keys(COINGECKO_IDS).filter(s => CRYPTO_SYMBOLS.has(s)).map(s => COINGECKO_IDS[s]).join(',');
  if (!ids) return {};
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids, vs_currencies: 'usd' },
      timeout: REQUEST_TIMEOUT,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    const raw = response.data || {};
    const result = {};
    Object.entries(COINGECKO_IDS).forEach(([sym, id]) => {
      const p = raw[id]?.usd;
      if (p && !isNaN(p) && p > 0) result[sym] = p;
    });
    coingeckoCache = result;
    coingeckoCacheTime = Date.now();
    return result;
  } catch (e) {
    return coingeckoCache;
  }
}

/**
 * Fetch from Finnhub (secondary provider)
 * Requires FINNHUB_API_KEY environment variable
 */
async function fetchFinnhubPrice(symbol) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  
  const canonical = toCanonical(symbol);
  const finnhubSymbol = forProvider(canonical, 'finnhub') || FINNHUB_SYMBOLS[canonical];
  if (!finnhubSymbol) return null;
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    
    const response = await axios.get(
      `https://finnhub.io/api/v1/quote`,
      { 
        params: { symbol: finnhubSymbol, token: apiKey },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );
    
    clearTimeout(timeoutId);
    
    const data = response.data;
    if (data?.c && data.c > 0) {
      const price = data.c;
      const previousClose = data.pc || price;
      const change = price - previousClose;
      const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
      
      return {
        symbol: canonical,
        price: formatPrice(price, canonical, price),
        rawPrice: price,
        previousClose: formatPrice(previousClose, canonical, price),
        change: formatPrice(Math.abs(change), canonical, price),
        changeSign: change >= 0 ? '+' : '-',
        changePercent: formatLegacyChangePercent(changePercent, canonical),
        isUp: change >= 0,
        high: data.h,
        low: data.l,
        open: data.o,
        timestamp: Date.now(),
        source: 'finnhub',
        delayed: false
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Fetch from Twelve Data (spot prices - TradingView accuracy)
 * Requires TWELVE_DATA_API_KEY environment variable
 */
async function fetchTwelveDataPrice(symbol) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;

  const canonical = toCanonical(symbol);
  const tdSymbol = forProvider(canonical, 'twelvedata') || TWELVE_DATA_SYMBOLS[canonical];
  if (!tdSymbol) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

    const response = await axios.get(
      'https://api.twelvedata.com/price',
      {
        params: { symbol: tdSymbol, apikey: apiKey },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    const price = parseFloat(response.data?.price);
    if (!response.data?.price || isNaN(price) || price <= 0) return null;

    return {
      symbol: canonical,
      price: formatPrice(price, canonical),
      rawPrice: price,
      previousClose: formatPrice(price, canonical),
      change: '0.00',
      changeSign: '+',
      changePercent: '0.00',
      isUp: true,
      timestamp: Date.now(),
      source: 'twelvedata',
      delayed: false
    };
  } catch (e) {
    return null;
  }
}

const POLYGON_SYMBOLS = {
  AAPL: 'AAPL',
  MSFT: 'MSFT',
  NVDA: 'NVDA',
  AMZN: 'AMZN',
  GOOGL: 'GOOGL',
  META: 'META',
  TSLA: 'TSLA',
  AVGO: 'AVGO',
  JPM: 'JPM',
  V: 'V',
  UNH: 'UNH',
  JNJ: 'JNJ',
  WMT: 'WMT',
  XOM: 'XOM',
  MA: 'MA',
  PG: 'PG',
  HD: 'HD',
  ORCL: 'ORCL',
  COST: 'COST',
  MRK: 'MRK',
  ABBV: 'ABBV',
  PEP: 'PEP',
  KO: 'KO',
  BAC: 'BAC',
  CRM: 'CRM',
  AMD: 'AMD',
  TMO: 'TMO',
  MCD: 'MCD',
  CSCO: 'CSCO',
  ACN: 'ACN',
  NFLX: 'NFLX',
  DIS: 'DIS',
  ADBE: 'ADBE',
  WFC: 'WFC',
  ISRG: 'ISRG',
  QCOM: 'QCOM',
  TXN: 'TXN',
  UPS: 'UPS',
  MS: 'MS',
  PM: 'PM',
  INTU: 'INTU',
  AMAT: 'AMAT',
  GE: 'GE',
  HON: 'HON',
  IBM: 'IBM',
  SPGI: 'SPGI',
  CAT: 'CAT',
  BKNG: 'BKNG',
  LMT: 'LMT',
  DE: 'DE',
  'BRK-B': 'BRK.B',
  SPX: 'I:SPX',
  NDX: 'I:NDX',
  DJI: 'I:DJI'
};

/**
 * Fetch from Polygon.io (US stocks / indices – 15-min delayed on free tier)
 * Requires POLYGON_API_KEY environment variable
 */
async function fetchPolygonPrice(symbol) {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) return null;
  const canonical = toCanonical(symbol);
  const polygonSymbol = POLYGON_SYMBOLS[canonical] || canonical;
  if (!polygonSymbol) return null;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const response = await axios.get(
      `https://api.polygon.io/v2/aggs/ticker/${polygonSymbol}/prev`,
      {
        params: { adjusted: true, apiKey },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);
    const result = response.data?.results?.[0];
    if (result && result.c > 0) {
      const price = result.c;
      const previousClose = result.vw || result.o || price;
      const change = price - previousClose;
      const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
      return {
        symbol: canonical,
        price: formatPrice(price, canonical, price),
        rawPrice: price,
        previousClose: formatPrice(previousClose, canonical, price),
        change: formatPrice(Math.abs(change), canonical, price),
        changeSign: change >= 0 ? '+' : '-',
        changePercent: formatLegacyChangePercent(changePercent, canonical),
        isUp: change >= 0,
        high: result.h,
        low: result.l,
        open: result.o,
        timestamp: Date.now(),
        source: 'polygon',
        delayed: true
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

// CoinMarketCap symbol mapping (strip USD suffix)
const CMC_SYMBOLS = {
  'BTCUSD': 'BTC', 'ETHUSD': 'ETH', 'SOLUSD': 'SOL', 'XRPUSD': 'XRP',
  'BNBUSD': 'BNB', 'ADAUSD': 'ADA', 'DOGEUSD': 'DOGE'
};

let cmcCache = {};
let cmcCacheTime = 0;
const CMC_CACHE_TTL = 30000; // 30s

/**
 * Fetch crypto from CoinMarketCap (paid key, higher reliability than CoinGecko free)
 * Requires COINMARKETCAP_API_KEY environment variable
 */
async function fetchCoinMarketCapPrice(symbol) {
  const apiKey = process.env.COINMARKETCAP_API_KEY;
  if (!apiKey) return null;
  const cmcSymbol = CMC_SYMBOLS[symbol];
  if (!cmcSymbol) return null;

  if (Date.now() - cmcCacheTime < CMC_CACHE_TTL && cmcCache[symbol]) {
    return cmcCache[symbol];
  }

  try {
    const allSymbols = Object.values(CMC_SYMBOLS).join(',');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    const response = await axios.get(
      'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest',
      {
        params: { symbol: allSymbols, convert: 'USD' },
        headers: { 'X-CMC_PRO_API_KEY': apiKey, 'Accept': 'application/json' },
        timeout: REQUEST_TIMEOUT,
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);
    const data = response.data?.data;
    if (!data) return null;
    const now = Date.now();
    Object.entries(CMC_SYMBOLS).forEach(([sym, cmc]) => {
      const entry = data[cmc];
      if (entry && entry.quote && entry.quote.USD) {
        const q = entry.quote.USD;
        const price = q.price;
        if (price && price > 0) {
          const changePercent = q.percent_change_24h || 0;
          const previousClose = price / (1 + changePercent / 100);
          const change = price - previousClose;
          cmcCache[sym] = {
            symbol: sym,
            price: formatPrice(price, sym, price),
            rawPrice: price,
            previousClose: formatPrice(previousClose, sym, price),
            change: formatPrice(Math.abs(change), sym, price),
            changeSign: change >= 0 ? '+' : '-',
            changePercent: formatLegacyChangePercent(changePercent, sym),
            isUp: change >= 0,
            timestamp: now,
            source: 'coinmarketcap',
            delayed: false
          };
        }
      }
    });
    cmcCacheTime = now;
    return cmcCache[symbol] || null;
  } catch (e) {
    return null;
  }
}

/**
 * Get fallback price data when all providers fail
 * Uses cached data or static fallback prices - NEVER returns 0.00
 */
function getFallbackPrice(symbol) {
  // First try cached data (even if stale)
  const cached = priceCache.get(symbol);
  if (cached && cached.rawPrice > 0) {
    healthStats.staleFallbacks++;
    return {
      ...cached,
      delayed: true,
      stale: true,
      fromCache: true,
      timestamp: cached.timestamp,
      delayedSince: Date.now() - cached.timestamp
    };
  }
  
  // Use static fallback prices
  const fallbackPrice = FALLBACK_PRICES[symbol];
  if (fallbackPrice) {
    return {
      symbol,
      price: formatPrice(fallbackPrice, symbol),
      rawPrice: fallbackPrice,
      previousClose: formatPrice(fallbackPrice, symbol),
      change: '0.00',
      changeSign: '+',
      changePercent: '0.00',
      isUp: true,
      timestamp: Date.now(),
      source: 'fallback',
      delayed: true,
      unavailable: true
    };
  }
  
  // Absolute last resort - should never happen
  return null;
}

/**
 * Fetch price with fallback chain.
 * For spot instruments (gold, forex, crypto): Finnhub/Twelve Data first (TradingView-like accuracy).
 * For stocks/indices: Yahoo first.
 * 1. Check fresh cache
 * 2. Spot: Finnhub -> Twelve Data -> Yahoo | Non-spot: Yahoo -> Finnhub -> Twelve Data
 * 3. Use stale cache or static fallback (NEVER 0.00)
 */
async function fetchPrice(symbol, options = {}) {
  const { stooqBySymbol = {} } = options;
  const canonical = toCanonical(symbol);
  // Check fresh cache first (never let non–Twelve Data crypto rows skip TD when TD can serve)
  const cached = priceCache.get(canonical);
  let bypassShortCache = false;
  try {
    const { shouldIgnoreFreshNonTdCryptoCache } = require('../market-data/cryptoQuotePolicy');
    const { shouldIgnoreFreshNonTdForexCache } = require('../market-data/forexQuotePolicy');
    bypassShortCache =
      shouldIgnoreFreshNonTdCryptoCache(cached, canonical) ||
      shouldIgnoreFreshNonTdForexCache(cached, canonical);
  } catch (_) {
    /* ignore */
  }
  if (cached && Date.now() - cached.timestamp < CACHE_TTL && !bypassShortCache) {
    healthStats.cacheHits++;
    return { ...cached, fromCache: true, delayed: false };
  }

  try {
    const { fetchQuoteDto } = require('../market-data/marketDataLayer');
    const { bump } = require('../market-data/tdMetrics');
    const snapFeat = usesForexSessionContext(canonical)
      ? 'fx-snapshot'
      : getAssetClass(canonical) === 'crypto'
        ? 'crypto-snapshot'
        : isCboeEuropeUkListedEquity(canonical)
          ? 'cboe-uk-snapshot'
          : isUkListedEquity(canonical)
            ? 'uk-snapshot'
            : isCboeAustraliaListedEquity(canonical)
              ? 'cboe-au-snapshot'
              : isVentureRegionalEquity(canonical)
                ? 'venture-snapshot'
                : isAsxListedEquity(canonical)
                  ? 'asx-snapshot'
                  : 'snapshot';
    const dto = await fetchQuoteDto(canonical, { feature: snapFeat });
    if (dto) {
      const fromTd = legacyPriceRowFromQuoteDto(canonical, dto);
      if (fromTd && fromTd.rawPrice > 0) {
        healthStats.successfulFetches++;
        healthStats.lastSuccessTime = Date.now();
        priceCache.set(canonical, fromTd);
        return fromTd;
      }
    } else {
      bump(
        usesForexSessionContext(canonical)
          ? 'fx-snapshot'
          : getAssetClass(canonical) === 'crypto'
            ? 'crypto-snapshot'
            : isCboeEuropeUkListedEquity(canonical)
              ? 'cboe-uk-snapshot'
              : isUkListedEquity(canonical)
                ? 'uk-snapshot'
                : isCboeAustraliaListedEquity(canonical)
                  ? 'cboe-au-snapshot'
                  : isVentureRegionalEquity(canonical)
                    ? 'venture-snapshot'
                    : isAsxListedEquity(canonical)
                      ? 'asx-snapshot'
                      : 'snapshot',
        'fallback'
      );
    }
  } catch (e) {
    try {
      const { bump } = require('../market-data/tdMetrics');
      const {
        usesForexSessionContext: ufx,
        getAssetClass: gac,
        isCboeEuropeUkListedEquity: cboeUkEq,
        isUkListedEquity: ukEq,
        isCboeAustraliaListedEquity: cboeAuEq,
        isVentureRegionalEquity: venEq,
        isAsxListedEquity: axEq,
      } = require('../ai/utils/symbol-registry');
      bump(
        ufx(canonical)
          ? 'fx-snapshot'
          : gac(canonical) === 'crypto'
            ? 'crypto-snapshot'
            : cboeUkEq(canonical)
              ? 'cboe-uk-snapshot'
              : ukEq(canonical)
                ? 'uk-snapshot'
                : cboeAuEq(canonical)
                  ? 'cboe-au-snapshot'
                  : venEq(canonical)
                    ? 'venture-snapshot'
                    : axEq(canonical)
                      ? 'asx-snapshot'
                      : 'snapshot',
        'fallback'
      );
    } catch (_) {
      /* ignore */
    }
  }

  const assetClass = getAssetClass(canonical);
  const isSpot = assetClass === 'forex' || assetClass === 'commodity';
  let result = null;

  if (assetClass === 'crypto') {
    // Crypto: CoinGecko -> CoinMarketCap -> Finnhub -> Yahoo (Twelve Data already tried via layer)
    result = await fetchCoinGeckoPrice(canonical);
    if (!result) result = await fetchCoinMarketCapPrice(canonical);
    if (!result) result = await fetchFinnhubPrice(canonical);
    if (!result) result = await fetchYahooPrice(canonical);
  } else if (isSpot) {
    // Forex/metals: Finnhub (OANDA) -> Stooq spot -> Yahoo
    result = await fetchFinnhubPrice(canonical);
    if (!result && stooqBySymbol[canonical]) result = stooqBySymbol[canonical];
    if (!result) result = await fetchYahooPrice(canonical);
    // Yahoo GC=F / SI=F can diverge from spot; prefer Stooq when Yahoo looks implausible
    if (
      result &&
      (canonical === 'XAUUSD' || canonical === 'XAGUSD') &&
      result.source === 'yahoo' &&
      !isPlausibleSpotMetalPrice(canonical, result.rawPrice)
    ) {
      const stooq = stooqBySymbol[canonical];
      result = stooq && isPlausibleSpotMetalPrice(canonical, stooq.rawPrice) ? stooq : null;
    }
    if (
      result &&
      (canonical === 'XAUUSD' || canonical === 'XAGUSD') &&
      !isPlausibleSpotMetalPrice(canonical, result.rawPrice)
    ) {
      result = null;
    }
  } else if (isCboeEuropeUkListedEquity(canonical)) {
    // Cboe UK: Twelve Data is authoritative when configured — Yahoo/Finnhub often conflate or omit .BCXE vs LSE.
    try {
      const td = require('../market-data/providers/twelveDataClient');
      if (td.apiKey() && !td.primaryDisabled()) {
        result = null;
      } else {
        result = await fetchFinnhubPrice(canonical);
        if (!result) result = await fetchYahooPrice(canonical);
      }
    } catch (_) {
      result = await fetchFinnhubPrice(canonical);
      if (!result) result = await fetchYahooPrice(canonical);
    }
  } else if (isCboeAustraliaListedEquity(canonical)) {
    // Cboe Australia: avoid ASX-mangled secondary quotes for *.CXAC when Twelve Data is configured.
    try {
      const td = require('../market-data/providers/twelveDataClient');
      if (td.apiKey() && !td.primaryDisabled()) {
        result = null;
      } else {
        result = await fetchFinnhubPrice(canonical);
        if (!result) result = await fetchYahooPrice(canonical);
      }
    } catch (_) {
      result = await fetchFinnhubPrice(canonical);
      if (!result) result = await fetchYahooPrice(canonical);
    }
  } else if (isVentureRegionalEquity(canonical)) {
    // Venture regional: TD-first via marketDataLayer above; never Yahoo→Polygon-first when TD can serve (avoids venue collisions).
    try {
      const td = require('../market-data/providers/twelveDataClient');
      if (td.apiKey() && !td.primaryDisabled()) {
        result = null;
      } else {
        result = await fetchFinnhubPrice(canonical);
        if (!result) result = await fetchYahooPrice(canonical);
      }
    } catch (_) {
      result = await fetchFinnhubPrice(canonical);
      if (!result) result = await fetchYahooPrice(canonical);
    }
  } else if (isAsxListedEquity(canonical) || isUkListedEquity(canonical)) {
    // ASX / UK: TD first via marketDataLayer; skip US-only Polygon; Finnhub/Yahoo use listing suffix from registry.
    result = await fetchFinnhubPrice(canonical);
    if (!result) result = await fetchYahooPrice(canonical);
  } else {
    // US/global stocks, indices, DXY, etc: Yahoo -> Polygon.io -> Finnhub (Twelve Data already tried via layer)
    result = await fetchYahooPrice(canonical);
    if (!result) result = await fetchPolygonPrice(canonical);
    if (!result) result = await fetchFinnhubPrice(canonical);
  }

  // Got fresh data
  if (result && result.rawPrice > 0) {
    healthStats.successfulFetches++;
    healthStats.lastSuccessTime = Date.now();
    priceCache.set(canonical, result);
    return result;
  }

  // All providers failed - use fallback (NEVER return 0.00)
  healthStats.errors++;
  return getFallbackPrice(canonical);
}

/**
 * Fetch prices for multiple symbols (used by /api/markets/snapshot).
 * Delegates to market-data/liveHotSnapshot: TD quote DTO first, shared legacy row mapping, then full chain.
 */
async function fetchPricesForSymbols(symbols) {
  if (!symbols || symbols.length === 0) return { prices: {}, timestamp: Date.now() };
  const { buildLiveHotSnapshot } = require('../market-data/liveHotSnapshot');
  const out = await buildLiveHotSnapshot(symbols);
  return { prices: out.prices, timestamp: out.timestamp };
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  healthStats.totalRequests++;

  const symbolsParam = req.query.symbols || '';
  const symbols = symbolsParam.split(',').filter(s => s.trim()).map(s => s.trim().toUpperCase());
  
  if (symbols.length === 0) {
    return res.status(400).json({ success: false, message: 'No symbols provided' });
  }
  
  // Limit to prevent abuse
  if (symbols.length > 50) {
    return res.status(400).json({ success: false, message: 'Max 50 symbols per request' });
  }

  const startTime = Date.now();

  const stooqBySymbol = await fetchStooqBatchMap(symbols.filter((s) => STOOQ_FOREX_METALS.has(s)));

  // Fetch all prices in parallel with timeout
  const results = await Promise.allSettled(
    symbols.map(symbol => 
      Promise.race([
        fetchPrice(symbol, { stooqBySymbol }),
        new Promise(resolve => setTimeout(() => resolve(getFallbackPrice(symbol)), REQUEST_TIMEOUT + 1000))
      ])
    )
  );
  
  const prices = {};
  let liveCount = 0;
  let delayedCount = 0;
  let errorSymbols = [];
  
  results.forEach((result, index) => {
    const symbol = symbols[index];
    
    if (result.status === 'fulfilled' && result.value) {
      const priceData = result.value;
      
      // Ensure we never have 0.00 prices
      if (!priceData.price || priceData.price === '0.00' || parseFloat(priceData.price) === 0) {
        const fallback = getFallbackPrice(symbol);
        if (fallback) {
          prices[symbol] = fallback;
          delayedCount++;
        } else {
          errorSymbols.push(symbol);
        }
      } else {
        prices[symbol] = priceData;
        if (priceData.delayed) {
          delayedCount++;
        } else {
          liveCount++;
        }
      }
    } else {
      // Promise rejected - use fallback
      const fallback = getFallbackPrice(symbol);
      if (fallback) {
        prices[symbol] = fallback;
        delayedCount++;
      } else {
        errorSymbols.push(symbol);
      }
    }
  });

  const latency = Date.now() - startTime;
  healthStats.avgLatency = (healthStats.avgLatency * (healthStats.totalRequests - 1) + latency) / healthStats.totalRequests;

  return res.status(200).json({
    success: true,
    prices,
    meta: {
      requestedCount: symbols.length,
      liveCount,
      delayedCount,
      errorCount: errorSymbols.length,
      errors: errorSymbols.length > 0 ? errorSymbols : undefined,
      latencyMs: latency,
      timestamp: Date.now()
    },
    health: {
      totalRequests: healthStats.totalRequests,
      cacheHitRate: healthStats.totalRequests > 0 
        ? (healthStats.cacheHits / healthStats.totalRequests * 100).toFixed(1) + '%' 
        : '0%',
      avgLatencyMs: Math.round(healthStats.avgLatency),
      lastSuccessTime: healthStats.lastSuccessTime,
      uptime: healthStats.lastSuccessTime > 0
    }
  });
};

module.exports.fetchPricesForSymbols = fetchPricesForSymbols;
module.exports.legacyPriceRowFromQuoteDto = legacyPriceRowFromQuoteDto;
module.exports.fetchStooqBatchMap = fetchStooqBatchMap;
module.exports.STOOQ_FOREX_METALS = STOOQ_FOREX_METALS;
module.exports.fetchPrice = fetchPrice;
module.exports.getFallbackPrice = getFallbackPrice;
