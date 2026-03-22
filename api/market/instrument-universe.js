/**
 * Canonical instrument lists for watchlist + snapshot.
 * Not every listed equity worldwide (millions) — major US + widely traded global names.
 * Forex: full G8 cross matrix (28 pairs). Crypto: top 20. Indices + liquid futures via Yahoo.
 */

const fxDisplay = (s) => (s.length === 6 ? `${s.slice(0, 3)}/${s.slice(3)}` : s);

/** G8 FX: 7 USD majors + 21 crosses (standard 28 pairs) */
const FOREX_28 = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
  'EURGBP', 'EURJPY', 'EURCHF', 'EURAUD', 'EURCAD', 'EURNZD',
  'GBPJPY', 'GBPCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD',
  'AUDJPY', 'AUDCHF', 'AUDCAD', 'AUDNZD',
  'CADJPY', 'CADCHF', 'CADNZD',
  'NZDJPY', 'NZDCHF',
  'CHFJPY',
];

/** Stooq daily CSV param (lowercase, no separator) */
const STOOQ_FX_PARAM = {
  EURUSD: 'eurusd', GBPUSD: 'gbpusd', USDJPY: 'usdjpy', USDCHF: 'usdchf',
  AUDUSD: 'audusd', USDCAD: 'usdcad', NZDUSD: 'nzdusd',
  EURGBP: 'eurgbp', EURJPY: 'eurjpy', EURCHF: 'eurchf', EURAUD: 'euraud',
  EURCAD: 'eurcad', EURNZD: 'eurnzd', GBPJPY: 'gbpjpy', GBPCHF: 'gbpchf',
  GBPAUD: 'gbpaud', GBPCAD: 'gbpcad', GBPNZD: 'gbpnzd', AUDJPY: 'audjpy',
  AUDCHF: 'audchf', AUDCAD: 'audcad', AUDNZD: 'audnzd', CADJPY: 'cadjpy',
  CADCHF: 'cadchf', CADNZD: 'cadnzd', NZDJPY: 'nzdjpy', NZDCHF: 'nzdchf',
  CHFJPY: 'chfjpy',
  XAUUSD: 'xauusd', XAGUSD: 'xagusd',
};

/** Top 20 crypto by mindshare / liquidity (internal symbol → CoinGecko id) */
const CRYPTO_TOP20 = [
  { symbol: 'BTCUSD', displayName: 'BTC/USD', decimals: 2, coingeckoId: 'bitcoin' },
  { symbol: 'ETHUSD', displayName: 'ETH/USD', decimals: 2, coingeckoId: 'ethereum' },
  { symbol: 'SOLUSD', displayName: 'SOL/USD', decimals: 2, coingeckoId: 'solana' },
  { symbol: 'XRPUSD', displayName: 'XRP/USD', decimals: 4, coingeckoId: 'ripple' },
  { symbol: 'BNBUSD', displayName: 'BNB/USD', decimals: 2, coingeckoId: 'binancecoin' },
  { symbol: 'ADAUSD', displayName: 'ADA/USD', decimals: 4, coingeckoId: 'cardano' },
  { symbol: 'DOGEUSD', displayName: 'DOGE/USD', decimals: 5, coingeckoId: 'dogecoin' },
  { symbol: 'AVAXUSD', displayName: 'AVAX/USD', decimals: 2, coingeckoId: 'avalanche-2' },
  { symbol: 'DOTUSD', displayName: 'DOT/USD', decimals: 3, coingeckoId: 'polkadot' },
  { symbol: 'MATICUSD', displayName: 'MATIC/USD', decimals: 4, coingeckoId: 'matic-network' },
  { symbol: 'LINKUSD', displayName: 'LINK/USD', decimals: 3, coingeckoId: 'chainlink' },
  { symbol: 'UNIUSD', displayName: 'UNI/USD', decimals: 3, coingeckoId: 'uniswap' },
  { symbol: 'ATOMUSD', displayName: 'ATOM/USD', decimals: 3, coingeckoId: 'cosmos' },
  { symbol: 'LTCUSD', displayName: 'LTC/USD', decimals: 2, coingeckoId: 'litecoin' },
  { symbol: 'BCHUSD', displayName: 'BCH/USD', decimals: 2, coingeckoId: 'bitcoin-cash' },
  { symbol: 'APTUSD', displayName: 'APT/USD', decimals: 3, coingeckoId: 'aptos' },
  { symbol: 'ARBUSD', displayName: 'ARB/USD', decimals: 4, coingeckoId: 'arbitrum' },
  { symbol: 'OPUSD', displayName: 'OP/USD', decimals: 4, coingeckoId: 'optimism' },
  { symbol: 'NEARUSD', displayName: 'NEAR/USD', decimals: 3, coingeckoId: 'near-protocol' },
  { symbol: 'INJUSD', displayName: 'INJ/USD', decimals: 3, coingeckoId: 'injective-protocol' },
];

/** Major US + widely held ADRs / mega-cap (Yahoo tickers) */
const STOCKS_MAJOR = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK-B', 'AVGO', 'JPM',
  'JNJ', 'V', 'UNH', 'MA', 'PG', 'HD', 'XOM', 'CVX', 'MRK', 'ABBV', 'PEP', 'KO',
  'PFE', 'BAC', 'COST', 'DIS', 'WMT', 'ORCL', 'CRM', 'AMD', 'INTC', 'CSCO', 'ACN',
  'NFLX', 'ADBE', 'TXN', 'QCOM', 'IBM', 'PM', 'TMUS', 'AMAT', 'HON', 'LIN', 'SBUX',
  'GE', 'CAT', 'DE', 'BA', 'UPS', 'LOW', 'RTX', 'SPGI', 'BKNG', 'TJX', 'ADP', 'C',
  'BLK', 'SCHW', 'AMGN', 'GILD', 'MDT', 'SYK', 'ZTS', 'ISRG', 'VRTX', 'REGN', 'PANW',
  'MU', 'LRCX', 'KLAC', 'SNPS', 'CDNS', 'MELI', 'SHOP', 'COIN', 'PLTR', 'SOFI', 'HOOD',
  'PYPL', 'SQ', 'UBER', 'ABNB', 'DASH', 'SNOW', 'CRWD', 'NET', 'DDOG', 'MRVL', 'ON',
  'GOOG', 'NOW', 'INTU', 'AXP', 'GS', 'MS', 'TMO', 'DHR', 'BMY', 'ELV', 'CI',
];

const STOCKS_UNIVERSE = [...new Set(STOCKS_MAJOR)];

const INDICES = [
  { symbol: 'SPX', displayName: 'S&P 500', decimals: 2 },
  { symbol: 'NDX', displayName: 'Nasdaq 100', decimals: 2 },
  { symbol: 'DJI', displayName: 'Dow Jones', decimals: 2 },
  { symbol: 'RUT', displayName: 'Russell 2000', decimals: 2 },
  { symbol: 'VIX', displayName: 'VIX', decimals: 2 },
  { symbol: 'DAX', displayName: 'DAX 40', decimals: 2 },
  { symbol: 'FTSE', displayName: 'FTSE 100', decimals: 2 },
  { symbol: 'NIKKEI', displayName: 'Nikkei 225', decimals: 2 },
  { symbol: 'CAC', displayName: 'CAC 40', decimals: 2 },
  { symbol: 'STOXX50', displayName: 'Euro Stoxx 50', decimals: 2 },
  { symbol: 'HSI', displayName: 'Hang Seng', decimals: 2 },
  { symbol: 'ASX200', displayName: 'ASX 200', decimals: 2 },
];

const FUTURES = [
  { symbol: 'ES', displayName: 'S&P 500 Fut', decimals: 2, yahoo: 'ES=F' },
  { symbol: 'NQ', displayName: 'Nasdaq Fut', decimals: 2, yahoo: 'NQ=F' },
  { symbol: 'YM', displayName: 'Dow Fut', decimals: 2, yahoo: 'YM=F' },
  { symbol: 'RTY', displayName: 'Russell Fut', decimals: 2, yahoo: 'RTY=F' },
  { symbol: 'NG', displayName: 'Nat Gas', decimals: 3, yahoo: 'NG=F' },
  { symbol: 'HG', displayName: 'Copper', decimals: 3, yahoo: 'HG=F' },
  { symbol: 'ZB', displayName: '30Y Bond', decimals: 3, yahoo: 'ZB=F' },
  { symbol: 'ZN', displayName: '10Y Note', decimals: 3, yahoo: 'ZN=F' },
];

const COMMODITIES = [
  { symbol: 'XAUUSD', displayName: 'Gold', decimals: 2 },
  { symbol: 'XAGUSD', displayName: 'Silver', decimals: 2 },
  { symbol: 'WTI', displayName: 'WTI Oil', decimals: 2 },
  { symbol: 'BRENT', displayName: 'Brent', decimals: 2 },
];

const MACRO = [
  { symbol: 'DXY', displayName: 'Dollar Index', decimals: 3 },
  { symbol: 'US10Y', displayName: '10Y Yield', decimals: 3 },
];

function forexRow(s) {
  const jpy = s.endsWith('JPY') && s !== 'USDJPY';
  return { symbol: s, displayName: fxDisplay(s), decimals: jpy || s === 'USDJPY' ? 2 : 4 };
}

const COINGECKO_IDS = Object.fromEntries(
  CRYPTO_TOP20.map((c) => [c.symbol, c.coingeckoId]),
);

const CRYPTO_DECIMALS = Object.fromEntries(
  CRYPTO_TOP20.map((c) => [c.symbol, c.decimals]),
);

const CRYPTO_SYMBOL_SET = new Set(CRYPTO_TOP20.map((c) => c.symbol));
const FOREX_SYMBOL_SET = new Set(FOREX_28);

/** Yahoo Finance static overrides (non-obvious tickers) */
function buildYahooOverrides() {
  const o = {
    SPX: '^GSPC', NDX: '^NDX', DJI: '^DJI', RUT: '^RUT', VIX: '^VIX',
    DAX: '^GDAXI', FTSE: '^FTSE', NIKKEI: '^N225', CAC: '^FCHI',
    STOXX50: '^STOXX50E', HSI: '^HSI', ASX200: '^AXJO',
    DXY: 'DX-Y.NYB', US10Y: '^TNX', WTI: 'CL=F', BRENT: 'BZ=F',
    XAUUSD: 'GC=F', XAGUSD: 'SI=F',
  };
  FUTURES.forEach((f) => {
    o[f.symbol] = f.yahoo;
  });
  CRYPTO_TOP20.forEach((c) => {
    const base = c.symbol.replace('USD', '');
    o[c.symbol] = `${base}-USD`;
  });
  return o;
}

const YAHOO_OVERRIDES = buildYahooOverrides();

function yahooSymbolFor(internal) {
  if (YAHOO_OVERRIDES[internal]) return YAHOO_OVERRIDES[internal];
  if (FOREX_SYMBOL_SET.has(internal)) return `${internal}=X`;
  return internal;
}

/** Flat deduped list for snapshot polling */
function buildAllSnapshotSymbols() {
  const out = [];
  const add = (s) => {
    if (s && !out.includes(s)) out.push(s);
  };
  CRYPTO_TOP20.forEach((c) => add(c.symbol));
  STOCKS_UNIVERSE.forEach(add);
  FOREX_28.forEach(add);
  COMMODITIES.forEach((c) => add(c.symbol));
  INDICES.forEach((c) => add(c.symbol));
  FUTURES.forEach((f) => add(f.symbol));
  MACRO.forEach((m) => add(m.symbol));
  return out;
}

const ALL_SNAPSHOT_SYMBOLS = buildAllSnapshotSymbols();

function buildWatchlist() {
  return {
    version: '2.0.0',
    beginnerSet: [
      'BTCUSD', 'ETHUSD', 'AAPL', 'NVDA', 'TSLA', 'EURUSD', 'GBPUSD',
      'XAUUSD', 'SPX', 'NDX', 'DXY', 'VIX',
    ],
    groups: {
      crypto: {
        name: 'Crypto',
        icon: '₿',
        order: 1,
        symbols: CRYPTO_TOP20.map((c) => ({
          symbol: c.symbol,
          displayName: c.displayName,
          decimals: c.decimals,
        })),
      },
      stocks: {
        name: 'Stocks',
        icon: '📈',
        order: 2,
        symbols: STOCKS_UNIVERSE.map((s) => ({ symbol: s, displayName: s, decimals: 2 })),
      },
      forex: {
        name: 'Forex',
        icon: '💱',
        order: 3,
        symbols: FOREX_28.map((s) => forexRow(s)),
      },
      commodities: {
        name: 'Commodities',
        icon: '🥇',
        order: 4,
        symbols: COMMODITIES.map((c) => ({ ...c })),
      },
      indices: {
        name: 'Indices',
        icon: '📊',
        order: 5,
        symbols: INDICES.map((c) => ({ ...c })),
      },
      futures: {
        name: 'Futures',
        icon: '⚡',
        order: 6,
        symbols: FUTURES.map((f) => ({
          symbol: f.symbol,
          displayName: f.displayName,
          decimals: f.decimals,
        })),
      },
      macro: {
        name: 'Macro',
        icon: '🌐',
        order: 7,
        symbols: MACRO.map((m) => ({ ...m })),
      },
    },
  };
}

module.exports = {
  FOREX_28,
  STOOQ_FX_PARAM,
  CRYPTO_TOP20,
  COINGECKO_IDS,
  CRYPTO_DECIMALS,
  CRYPTO_SYMBOL_SET,
  FOREX_SYMBOL_SET,
  STOCKS_UNIVERSE,
  INDICES,
  FUTURES,
  COMMODITIES,
  MACRO,
  YAHOO_OVERRIDES,
  yahooSymbolFor,
  ALL_SNAPSHOT_SYMBOLS,
  buildWatchlist,
  fxDisplay,
};
