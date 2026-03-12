/**
 * Central instrument configuration for the risk calculator.
 * Each instrument has metadata and a calculationMode so the engine uses the correct formula.
 */

/**
 * @typedef {'forex'|'commodity'|'index'|'stock'|'future'|'crypto'} AssetClass
 * @typedef {'forex'|'commodity'|'index_cfd'|'stock_share'|'future_contract'|'crypto_lot'|'crypto_units'} CalculationMode
 * @typedef {Object} InstrumentSpec
 * @property {string} symbol
 * @property {string} displayName
 * @property {AssetClass} assetClass
 * @property {number} contractSize
 * @property {number} tickSize
 * @property {number} [tickValuePerLot]
 * @property {number} [pipSize]
 * @property {number} [pointSize]
 * @property {number} pricePrecision
 * @property {number} [minLot]
 * @property {number} [maxLot]
 * @property {number} [lotStep]
 * @property {number} [valuePerPointPerLot]
 * @property {string} quoteCurrency
 * @property {string} [baseCurrency]
 * @property {CalculationMode} calculationMode
 * @property {boolean} [wholeContractsOnly]
 * @property {number} [minReasonablePrice]
 * @property {number} [maxReasonablePrice]
 */

function spec(symbol, displayName, assetClass, calculationMode, opts = {}) {
  return {
    symbol,
    displayName,
    assetClass,
    calculationMode,
    contractSize: 0,
    tickSize: 0,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    ...opts,
  };
}

const INSTRUMENTS = [
  // FOREX
  spec('EURUSD', 'EUR/USD', 'forex', 'forex', {
    contractSize: 100_000,
    pipSize: 0.0001,
    tickSize: 0.00001,
    pricePrecision: 5,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 0.5,
    maxReasonablePrice: 3,
  }),
  spec('GBPUSD', 'GBP/USD', 'forex', 'forex', {
    contractSize: 100_000,
    pipSize: 0.0001,
    tickSize: 0.00001,
    pricePrecision: 5,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 0.5,
    maxReasonablePrice: 3,
  }),
  spec('USDJPY', 'USD/JPY', 'forex', 'forex', {
    contractSize: 100_000,
    pipSize: 0.01,
    tickSize: 0.001,
    pricePrecision: 3,
    quoteCurrency: 'JPY',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 50,
    maxReasonablePrice: 300,
  }),
  spec('USDCHF', 'USD/CHF', 'forex', 'forex', {
    contractSize: 100_000,
    pipSize: 0.0001,
    tickSize: 0.00001,
    pricePrecision: 5,
    quoteCurrency: 'CHF',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 0.5,
    maxReasonablePrice: 2,
  }),
  spec('AUDUSD', 'AUD/USD', 'forex', 'forex', {
    contractSize: 100_000,
    pipSize: 0.0001,
    tickSize: 0.00001,
    pricePrecision: 5,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 0.5,
    maxReasonablePrice: 2,
  }),
  spec('USDCAD', 'USD/CAD', 'forex', 'forex', {
    contractSize: 100_000,
    pipSize: 0.0001,
    tickSize: 0.00001,
    pricePrecision: 5,
    quoteCurrency: 'CAD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 0.5,
    maxReasonablePrice: 2,
  }),
  spec('EURJPY', 'EUR/JPY', 'forex', 'forex', {
    contractSize: 100_000,
    pipSize: 0.01,
    tickSize: 0.001,
    pricePrecision: 3,
    quoteCurrency: 'JPY',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 100,
    maxReasonablePrice: 250,
  }),
  spec('GBPJPY', 'GBP/JPY', 'forex', 'forex', {
    contractSize: 100_000,
    pipSize: 0.01,
    tickSize: 0.001,
    pricePrecision: 3,
    quoteCurrency: 'JPY',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 150,
    maxReasonablePrice: 250,
  }),
  // COMMODITIES
  spec('XAUUSD', 'XAU/USD (Gold)', 'commodity', 'commodity', {
    contractSize: 100,
    tickSize: 0.01,
    pointSize: 1,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 500,
    maxReasonablePrice: 10000,
  }),
  spec('XAGUSD', 'XAG/USD (Silver)', 'commodity', 'commodity', {
    contractSize: 5000,
    tickSize: 0.001,
    pointSize: 0.01,
    pricePrecision: 3,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 1,
    maxReasonablePrice: 1000,
  }),
  spec('XTIUSD', 'WTI Crude Oil (USOIL)', 'commodity', 'commodity', {
    contractSize: 1000,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 20,
    maxReasonablePrice: 200,
  }),
  spec('USOIL', 'WTI Crude Oil (USOIL)', 'commodity', 'commodity', {
    contractSize: 1000,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 20,
    maxReasonablePrice: 200,
  }),
  spec('XBRUSD', 'Brent Crude Oil (UKOIL)', 'commodity', 'commodity', {
    contractSize: 1000,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 20,
    maxReasonablePrice: 200,
  }),
  spec('UKOIL', 'Brent Crude Oil (UKOIL)', 'commodity', 'commodity', {
    contractSize: 1000,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 20,
    maxReasonablePrice: 200,
  }),
  // INDICES (CFD)
  spec('US30', 'US30 (Dow)', 'index', 'index_cfd', {
    contractSize: 1,
    pointSize: 1,
    valuePerPointPerLot: 1,
    tickSize: 1,
    pricePrecision: 0,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 10000,
    maxReasonablePrice: 50000,
  }),
  spec('NAS100', 'NAS100 (Nasdaq)', 'index', 'index_cfd', {
    contractSize: 1,
    pointSize: 1,
    valuePerPointPerLot: 20,
    tickSize: 1,
    pricePrecision: 0,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 5000,
    maxReasonablePrice: 25000,
  }),
  spec('SPX500', 'SPX500 (S&P 500)', 'index', 'index_cfd', {
    contractSize: 1,
    pointSize: 1,
    valuePerPointPerLot: 50,
    tickSize: 1,
    pricePrecision: 0,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 2000,
    maxReasonablePrice: 7000,
  }),
  spec('GER40', 'GER40 (DAX)', 'index', 'index_cfd', {
    contractSize: 1,
    pointSize: 1,
    valuePerPointPerLot: 1,
    tickSize: 1,
    pricePrecision: 0,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 5000,
    maxReasonablePrice: 20000,
  }),
  // STOCKS
  spec('AAPL', 'Apple', 'stock', 'stock_share', {
    contractSize: 1,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    minReasonablePrice: 50,
    maxReasonablePrice: 500,
  }),
  spec('TSLA', 'Tesla', 'stock', 'stock_share', {
    contractSize: 1,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    minReasonablePrice: 50,
    maxReasonablePrice: 1000,
  }),
  spec('NVDA', 'NVIDIA', 'stock', 'stock_share', {
    contractSize: 1,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    minReasonablePrice: 50,
    maxReasonablePrice: 2000,
  }),
  // FUTURES
  spec('ES', 'E-mini S&P 500', 'future', 'future_contract', {
    contractSize: 50,
    tickSize: 0.25,
    tickValuePerLot: 12.5,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    wholeContractsOnly: true,
    minReasonablePrice: 2000,
    maxReasonablePrice: 7000,
  }),
  spec('NQ', 'E-mini Nasdaq', 'future', 'future_contract', {
    contractSize: 20,
    tickSize: 0.25,
    tickValuePerLot: 5,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    wholeContractsOnly: true,
    minReasonablePrice: 5000,
    maxReasonablePrice: 25000,
  }),
  spec('GC', 'Gold', 'future', 'future_contract', {
    contractSize: 100,
    tickSize: 0.1,
    tickValuePerLot: 10,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    wholeContractsOnly: true,
    minReasonablePrice: 500,
    maxReasonablePrice: 10000,
  }),
  spec('CL', 'Crude Oil WTI', 'future', 'future_contract', {
    contractSize: 1000,
    tickSize: 0.01,
    tickValuePerLot: 10,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    wholeContractsOnly: true,
    minReasonablePrice: 20,
    maxReasonablePrice: 200,
  }),
  spec('MGC', 'Micro Gold', 'future', 'future_contract', {
    contractSize: 10,
    tickSize: 0.1,
    tickValuePerLot: 1,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    wholeContractsOnly: true,
    minReasonablePrice: 500,
    maxReasonablePrice: 10000,
  }),
  spec('MNQ', 'Micro E-mini Nasdaq', 'future', 'future_contract', {
    contractSize: 2,
    tickSize: 0.25,
    tickValuePerLot: 0.5,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    wholeContractsOnly: true,
    minReasonablePrice: 5000,
    maxReasonablePrice: 25000,
  }),
  // CRYPTO
  spec('BTCUSD', 'BTC/USD', 'crypto', 'crypto_units', {
    contractSize: 1,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    minReasonablePrice: 1000,
    maxReasonablePrice: 200000,
  }),
  spec('ETHUSD', 'ETH/USD', 'crypto', 'crypto_units', {
    contractSize: 1,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    minReasonablePrice: 100,
    maxReasonablePrice: 20000,
  }),
];

const bySymbol = new Map();
INSTRUMENTS.forEach((i) => bySymbol.set(i.symbol.toUpperCase(), i));

export function getInstrument(symbol) {
  return bySymbol.get(String(symbol).toUpperCase()) ?? null;
}

/**
 * Round a number to the given decimal places (0 = integer).
 * @param {number} n
 * @param {number} decimals
 * @returns {number}
 */
function roundToPrecision(n, decimals) {
  if (!Number.isFinite(n)) return 0;
  if (decimals === 0) return Math.round(n);
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Get example Entry, Stop loss, and Take profit values for the given instrument,
 * for use in placeholders / "e.g." hints. Values are in the instrument's typical range
 * and rounded to its pricePrecision.
 * @param {InstrumentSpec|null} instrument - from getInstrument(symbol) or getInstrumentOrFallback(symbol)
 * @returns {{ entry: number, sl: number, tp: number, entryStr: string, slStr: string, tpStr: string }}
 */
export function getPriceExamples(instrument) {
  const fallback = { entry: 1.05, sl: 1.048, tp: 1.06, entryStr: '1.05', slStr: '1.048', tpStr: '1.06' };
  if (!instrument) return fallback;
  const min = Number(instrument.minReasonablePrice) || 0.5;
  const max = Number(instrument.maxReasonablePrice) || 3;
  const prec = Math.max(0, Math.min(8, Math.floor(Number(instrument.pricePrecision) || 2)));
  const mid = (min + max) / 2;
  const range = Math.max(max - min, min * 0.01);
  const entry = roundToPrecision(mid, prec);
  const sl = roundToPrecision(Math.max(min, entry - range * 0.002), prec);
  const tp = roundToPrecision(Math.min(max, entry + range * 0.006), prec);
  const toStr = (n) => (prec === 0 ? String(Math.round(n)) : n.toFixed(prec));
  return {
    entry,
    sl,
    tp,
    entryStr: toStr(entry),
    slStr: toStr(sl),
    tpStr: toStr(tp),
  };
}

export function getInstrumentOrFallback(symbol) {
  const known = getInstrument(symbol);
  if (known) return known;
  const upper = String(symbol).toUpperCase();
  if (upper.includes('JPY') && !upper.includes('USD')) {
    return spec('USDJPY', symbol, 'forex', 'forex', {
      contractSize: 100_000,
      pipSize: 0.01,
      tickSize: 0.001,
      pricePrecision: 3,
      quoteCurrency: 'JPY',
      lotStep: 0.01,
      minLot: 0.01,
      maxLot: 100,
      minReasonablePrice: 50,
      maxReasonablePrice: 250,
    });
  }
  if (upper.includes('XAU') || upper.includes('GOLD')) {
    return spec(upper, symbol, 'commodity', 'commodity', {
      contractSize: 100,
      tickSize: 0.01,
      pointSize: 1,
      pricePrecision: 2,
      quoteCurrency: 'USD',
      lotStep: 0.01,
      minLot: 0.01,
      maxLot: 100,
      minReasonablePrice: 500,
      maxReasonablePrice: 10000,
    });
  }
  if (['US30', 'NAS100', 'SPX500', 'GER40'].some((s) => upper.includes(s))) {
    return spec(upper, symbol, 'index', 'index_cfd', {
      contractSize: 1,
      pointSize: 1,
      valuePerPointPerLot: 1,
      tickSize: 1,
      pricePrecision: 0,
      quoteCurrency: 'USD',
      lotStep: 0.01,
      minLot: 0.01,
      maxLot: 100,
      minReasonablePrice: 1000,
      maxReasonablePrice: 50000,
    });
  }
  if (['BTC', 'ETH'].some((s) => upper.includes(s))) {
    return spec(upper, symbol, 'crypto', 'crypto_units', {
      contractSize: 1,
      tickSize: 0.01,
      pricePrecision: 2,
      quoteCurrency: 'USD',
      minReasonablePrice: 100,
      maxReasonablePrice: 200000,
    });
  }
  return spec(upper, symbol, 'forex', 'forex', {
    contractSize: 100_000,
    pipSize: 0.0001,
    tickSize: 0.00001,
    pricePrecision: 5,
    quoteCurrency: 'USD',
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    minReasonablePrice: 0.5,
    maxReasonablePrice: 3,
  });
}

export function getAllInstruments() {
  return [...INSTRUMENTS];
}

const CATEGORY_LABELS = {
  forex: 'Forex',
  commodity: 'Commodities',
  index: 'Indices',
  stock: 'Stocks',
  future: 'Futures',
  crypto: 'Crypto',
};

/** Group instruments by asset class for categorized dropdowns. */
export function getInstrumentsByCategory() {
  const groups = {};
  INSTRUMENTS.forEach((inst) => {
    const key = inst.assetClass || 'forex';
    if (!groups[key]) groups[key] = [];
    groups[key].push(inst);
  });
  return Object.entries(groups).map(([key, list]) => ({
    category: key,
    label: CATEGORY_LABELS[key] || key,
    instruments: list,
  }));
}
