/**
 * Central instrument configuration for the risk calculator.
 * Each instrument has metadata and a calculationMode so the engine uses the correct formula.
 */

import { resolveCalculatorSymbol } from './watchlistSymbolAliases';

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

function stockSpec(symbol, displayName, opts = {}) {
  return spec(symbol, displayName, 'stock', 'stock_share', {
    contractSize: 1,
    tickSize: 0.01,
    pricePrecision: 2,
    quoteCurrency: 'USD',
    minReasonablePrice: 1,
    maxReasonablePrice: 5000,
    ...opts,
  });
}

const STOCK_INSTRUMENTS = [
  stockSpec('AAPL', 'Apple', { minReasonablePrice: 50, maxReasonablePrice: 500 }),
  stockSpec('TSLA', 'Tesla', { minReasonablePrice: 50, maxReasonablePrice: 1000 }),
  stockSpec('NVDA', 'NVIDIA', { minReasonablePrice: 50, maxReasonablePrice: 2000 }),
  stockSpec('V', 'Visa'),
  stockSpec('AXP', 'American Express'),
  stockSpec('BLK', 'BlackRock'),
  stockSpec('GS', 'Goldman Sachs'),
  stockSpec('MS', 'Morgan Stanley'),
  stockSpec('BX', 'Blackstone'),
  stockSpec('KKR', 'KKR'),
  stockSpec('ICE', 'Intercontinental Exchange'),
  stockSpec('PGR', 'Progressive'),
  stockSpec('CB', 'Chubb'),
  stockSpec('MMC', 'Marsh McLennan'),
  stockSpec('AON', 'Aon'),
  stockSpec('JNJ', 'Johnson & Johnson'),
  stockSpec('ABBV', 'AbbVie'),
  stockSpec('ABT', 'Abbott Laboratories'),
  stockSpec('DHR', 'Danaher'),
  stockSpec('BSX', 'Boston Scientific'),
  stockSpec('SYK', 'Stryker'),
  stockSpec('ELV', 'Elevance Health'),
  stockSpec('CI', 'Cigna'),
  stockSpec('LLY', 'Eli Lilly'),
  stockSpec('GEV', 'GE Vernova'),
  stockSpec('RTX', 'RTX'),
  stockSpec('LMT', 'Lockheed Martin'),
  stockSpec('NOC', 'Northrop Grumman'),
  stockSpec('GD', 'General Dynamics'),
  stockSpec('EMR', 'Emerson Electric'),
  stockSpec('ETN', 'Eaton'),
  stockSpec('PH', 'Parker-Hannifin'),
  stockSpec('TT', 'Trane Technologies'),
  stockSpec('WM', 'Waste Management'),
  stockSpec('WCN', 'Waste Connections'),
  stockSpec('URI', 'United Rentals'),
  stockSpec('PCAR', 'PACCAR'),
  stockSpec('TTC', 'Toro'),
  stockSpec('ITW', 'Illinois Tool Works'),
  stockSpec('XOM', 'Exxon Mobil'),
  stockSpec('CVX', 'Chevron'),
  stockSpec('SLB', 'Schlumberger'),
  stockSpec('HAL', 'Halliburton'),
  stockSpec('OKE', 'ONEOK'),
  stockSpec('KMI', 'Kinder Morgan'),
  stockSpec('WMB', 'Williams'),
  stockSpec('VST', 'Vistra'),
  stockSpec('CEG', 'Constellation Energy'),
  stockSpec('NEE', 'NextEra Energy'),
  stockSpec('DUK', 'Duke Energy'),
  stockSpec('SO', 'Southern Company'),
  stockSpec('AEP', 'American Electric Power'),
  stockSpec('MCD', 'McDonald\'s'),
  stockSpec('NKE', 'Nike'),
  stockSpec('SBUX', 'Starbucks'),
  stockSpec('RCL', 'Royal Caribbean'),
  stockSpec('HLT', 'Hilton'),
  stockSpec('MAR', 'Marriott'),
  stockSpec('CMG', 'Chipotle'),
  stockSpec('YUM', 'Yum! Brands'),
  stockSpec('DPZ', 'Domino\'s'),
  stockSpec('EL', 'Estee Lauder'),
  stockSpec('TPR', 'Tapestry'),
  stockSpec('RL', 'Ralph Lauren'),
  stockSpec('DECK', 'Deckers'),
  stockSpec('TMUS', 'T-Mobile US'),
  stockSpec('T', 'AT&T'),
  stockSpec('VZ', 'Verizon'),
  stockSpec('SPOT', 'Spotify'),
  stockSpec('RDDT', 'Reddit'),
  stockSpec('TTD', 'Trade Desk'),
  stockSpec('TPL', 'Texas Pacific Land'),
  stockSpec('RSG', 'Republic Services'),
  stockSpec('APO', 'Apollo Global Management'),
  stockSpec('CARR', 'Carrier'),
  stockSpec('OTIS', 'Otis'),
  stockSpec('FERG', 'Ferguson'),
  stockSpec('HWM', 'Howmet Aerospace'),
  stockSpec('SPY', 'SPDR S&P 500 ETF'),
  stockSpec('VOO', 'Vanguard S&P 500 ETF'),
  stockSpec('IVV', 'iShares Core S&P 500 ETF'),
  stockSpec('QQQ', 'Invesco QQQ Trust'),
  stockSpec('VTI', 'Vanguard Total Stock Market ETF'),
  stockSpec('SCHB', 'Schwab U.S. Broad Market ETF'),
  stockSpec('DIA', 'SPDR Dow Jones Industrial Average ETF'),
  stockSpec('SCHG', 'Schwab U.S. Large-Cap Growth ETF'),
  stockSpec('VUG', 'Vanguard Growth ETF'),
  stockSpec('MGK', 'Vanguard Mega Cap Growth ETF'),
  stockSpec('IWF', 'iShares Russell 1000 Growth ETF'),
  stockSpec('SPYG', 'SPDR Portfolio S&P 500 Growth ETF'),
  stockSpec('VGT', 'Vanguard Information Technology ETF'),
  stockSpec('XLK', 'Technology Select Sector SPDR'),
  stockSpec('IYW', 'iShares U.S. Technology ETF'),
  stockSpec('FTEC', 'Fidelity MSCI Information Technology ETF'),
  stockSpec('AIQ', 'Global X Artificial Intelligence & Technology ETF'),
  stockSpec('BOTZ', 'Global X Robotics & Artificial Intelligence ETF'),
  stockSpec('ROBO', 'ROBO Global Robotics & Automation ETF'),
  stockSpec('SMH', 'VanEck Semiconductor ETF'),
  stockSpec('SOXX', 'iShares Semiconductor ETF'),
  stockSpec('XSD', 'SPDR S&P Semiconductor ETF'),
  stockSpec('PSI', 'Invesco Dynamic Semiconductors ETF'),
  stockSpec('XLF', 'Financial Select Sector SPDR'),
  stockSpec('VFH', 'Vanguard Financials ETF'),
  stockSpec('IYF', 'iShares U.S. Financials ETF'),
  stockSpec('KBE', 'SPDR S&P Bank ETF'),
  stockSpec('KRE', 'SPDR S&P Regional Banking ETF'),
  stockSpec('IAI', 'iShares U.S. Broker-Dealers & Securities Exchanges ETF'),
  stockSpec('XLV', 'Health Care Select Sector SPDR'),
  stockSpec('VHT', 'Vanguard Health Care ETF'),
  stockSpec('IYH', 'iShares U.S. Healthcare ETF'),
  stockSpec('XBI', 'SPDR S&P Biotech ETF'),
  stockSpec('IHI', 'iShares U.S. Medical Devices ETF'),
  stockSpec('XLI', 'Industrial Select Sector SPDR'),
  stockSpec('VIS', 'Vanguard Industrials ETF'),
  stockSpec('PAVE', 'Global X U.S. Infrastructure Development ETF'),
  stockSpec('IFRA', 'iShares U.S. Infrastructure ETF'),
  stockSpec('GRID', 'First Trust NASDAQ Clean Edge Smart Grid Infrastructure ETF'),
  stockSpec('ITA', 'iShares U.S. Aerospace & Defense ETF'),
  stockSpec('XAR', 'SPDR S&P Aerospace & Defense ETF'),
  stockSpec('PPA', 'Invesco Aerospace & Defense ETF'),
  stockSpec('XLE', 'Energy Select Sector SPDR'),
  stockSpec('VDE', 'Vanguard Energy ETF'),
  stockSpec('IYE', 'iShares U.S. Energy ETF'),
  stockSpec('MLPX', 'Global X MLP & Energy Infrastructure ETF'),
  stockSpec('AMLP', 'Alerian MLP ETF'),
  stockSpec('XLU', 'Utilities Select Sector SPDR'),
  stockSpec('VPU', 'Vanguard Utilities ETF'),
  stockSpec('IDU', 'iShares U.S. Utilities ETF'),
  stockSpec('UTES', 'Virtus Reaves Utilities ETF'),
  stockSpec('XLY', 'Consumer Discretionary Select Sector SPDR'),
  stockSpec('VCR', 'Vanguard Consumer Discretionary ETF'),
  stockSpec('XLP', 'Consumer Staples Select Sector SPDR'),
  stockSpec('VDC', 'Vanguard Consumer Staples ETF'),
  stockSpec('PEJ', 'Invesco Leisure & Entertainment ETF'),
  stockSpec('QUAL', 'iShares MSCI USA Quality Factor ETF'),
  stockSpec('SPHQ', 'Invesco S&P 500 Quality ETF'),
  stockSpec('SCHD', 'Schwab U.S. Dividend Equity ETF'),
  stockSpec('DGRO', 'iShares Core Dividend Growth ETF'),
  stockSpec('VIG', 'Vanguard Dividend Appreciation ETF'),
  stockSpec('NOBL', 'ProShares S&P 500 Dividend Aristocrats ETF'),
];

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
  // STOCKS / ETFS
  ...STOCK_INSTRUMENTS,
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

/** Market Watch symbol → calculator spec (aliases WTI→USOIL, SPX→SPX500, …). */
export function getInstrumentForWatchlistSymbol(symbol) {
  return getInstrumentOrFallback(resolveCalculatorSymbol(symbol));
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
