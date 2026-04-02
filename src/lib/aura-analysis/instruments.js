/**
 * Central instrument configuration for the risk calculator.
 * Each instrument has metadata and a calculationMode so the engine uses the correct formula.
 */

import { resolveCalculatorSymbol, WATCHLIST_SYMBOL_ALIASES } from './watchlistSymbolAliases';
import { buildMergedCommodityInstruments, applyInstrumentOverrides } from './instrumentMerge';
import { buildBehaviourFromSpec } from './instrumentBehaviour';
import { isInstrumentStrictMode, isInstrumentDebugEnabled } from './instrumentEnv';
import { logInfo } from '../../utils/systemLogger';

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
 * @property {{ entry: number, sl: number, tp: number }} [examplePrices] — curated Trade Calculator placeholders (BUY: stop below entry, TP above)
 * @property {boolean} [_registryFallback] — heuristic spec when validateInstrumentSymbol.valid is false
 * @property {boolean} [_brokerOverridesApplied] — MT5/broker merge applied
 * @property {{ symbol: string, source: string, fields: string[], values: Record<string, { from: number|null, to: number }>, timestamp: string }} [_instrumentOverrideLog]
 * @property {{ symbolInput: string, normalized: string, canonical: string, source: 'registry'|'alias'|'fallback', hasOverrides: boolean, strictMode: boolean }} [_debugTrace]
 * @property {'metal'|'energy'|'agriculture'|'softs'|'other'|undefined} [subCategory]
 * @property {'decimal'|'points'|undefined} [priceFormat]
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
  ...buildMergedCommodityInstruments(),
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
 * Symbols that appear more than once in the merged calculator instrument table (should be empty).
 * @returns {{ symbol: string, count: number }[]}
 */
/**
 * Trace for instrument resolution (debug / observability).
 * @param {string} symbol
 * @param {{ brokerOverrides?: object, mt5Overrides?: object, requestId?: string }} [options]
 */
export function getInstrumentResolutionDebugTrace(symbol, options = {}) {
  const raw = String(symbol || '').trim();
  const u = String(symbol || '').toUpperCase().trim();
  const normalized = !u ? 'EURUSD' : u.replace(/\s+/g, '');
  const canonical = resolveCalculatorSymbol(raw || 'EURUSD');
  const hadAlias = Boolean(WATCHLIST_SYMBOL_ALIASES[normalized]);
  const direct = getInstrument(canonical);
  let source = /** @type {'registry'|'alias'|'fallback'} */ ('registry');
  if (direct) {
    source = hadAlias ? 'alias' : 'registry';
  } else if (isInstrumentStrictMode()) {
    source = 'registry';
  } else {
    source = 'fallback';
  }
  const bo = options && options.brokerOverrides;
  const mo = options && options.mt5Overrides;
  const hasOverrides = Boolean(
    (bo && typeof bo === 'object' && Object.keys(bo).length) ||
      (mo && typeof mo === 'object' && Object.keys(mo).length)
  );
  return {
    symbolInput: raw || '(empty)',
    normalized,
    canonical,
    source,
    hasOverrides,
    strictMode: isInstrumentStrictMode(),
  };
}

export function getMergedInstrumentDuplicateReport() {
  const counts = new Map();
  for (const row of INSTRUMENTS) {
    const s = String(row.symbol || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    if (!s) continue;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([symbol, count]) => ({ symbol, count }));
}

/**
 * Unified resolver: merged registry + commodities, optional broker/MT5 overrides.
 * @param {string} symbol
 * @param {{ brokerOverrides?: object, mt5Overrides?: object, requestId?: string }} [options]
 * @returns {InstrumentSpec|null}
 */
export function getInstrumentSpec(symbol, options = {}) {
  const canonical = resolveCalculatorSymbol(String(symbol || '').trim() || 'EURUSD');
  let spec = getInstrument(canonical);
  if (!spec) {
    if (isInstrumentStrictMode()) {
      logInfo('instrument', 'spec_unresolved', {
        canonical,
        strictMode: true,
        ...(options.requestId ? { requestId: options.requestId } : {}),
      });
      return null;
    }
    spec = getInstrumentOrFallback(canonical);
  }
  const bo = options && options.brokerOverrides;
  const mo = options && options.mt5Overrides;
  const ov =
    bo && mo && typeof bo === 'object' && typeof mo === 'object'
      ? { ...mo, ...bo }
      : bo || mo || null;
  if (ov) spec = applyInstrumentOverrides({ ...spec }, ov, { requestId: options.requestId });
  const trace = getInstrumentResolutionDebugTrace(symbol, options);
  logInfo('instrument', 'spec_resolved', {
    canonical: trace.canonical,
    source: trace.source,
    hasOverrides: trace.hasOverrides,
    strictMode: trace.strictMode,
    ...(options.requestId ? { requestId: options.requestId } : {}),
  });
  if (isInstrumentDebugEnabled() && spec) {
    return { ...spec, _debugTrace: trace };
  }
  return spec;
}

/**
 * Validate symbol against merged calculator universe (no silent "unknown OK").
 * @param {string} raw
 * @returns {{ valid: boolean, canonicalSymbol: string, spec: InstrumentSpec, warning: string|null, inferredCategory?: string }}
 */
export function validateInstrumentSymbol(raw) {
  const canonical = resolveCalculatorSymbol(String(raw || '').trim() || 'EURUSD');
  const direct = getInstrument(canonical);
  if (direct) {
    return {
      valid: true,
      canonicalSymbol: canonical,
      spec: direct,
      warning: null,
      inferredCategory: direct.assetClass,
    };
  }
  if (isInstrumentStrictMode()) {
    return {
      valid: false,
      canonicalSymbol: canonical,
      spec: null,
      warning: 'Instrument not registered; strict mode disallows heuristic fallback.',
      inferredCategory: 'unknown',
    };
  }
  const spec = getInstrumentOrFallback(canonical);
  const out = { ...spec, _registryFallback: true };
  return {
    valid: false,
    canonicalSymbol: canonical,
    spec: out,
    warning: 'Unknown instrument — verify contract size and tick rules with your broker; sizing uses a heuristic template.',
    inferredCategory: spec.assetClass,
  };
}

/**
 * Behaviour metadata for UI / future calculator hints (registry-backed).
 * @param {string} symbol
 */
export function getInstrumentBehaviour(symbol) {
  const canonical = resolveCalculatorSymbol(String(symbol || '').trim() || 'EURUSD');
  const inst = getInstrument(canonical) || getInstrumentOrFallback(canonical);
  return buildBehaviourFromSpec(inst, canonical);
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
  const precEarly = Math.max(0, Math.min(8, Math.floor(Number(instrument.pricePrecision) || 2)));
  const ex = instrument.examplePrices;
  if (ex && Number.isFinite(Number(ex.entry)) && Number.isFinite(Number(ex.sl)) && Number.isFinite(Number(ex.tp))) {
    const entry = roundToPrecision(Number(ex.entry), precEarly);
    const sl = roundToPrecision(Number(ex.sl), precEarly);
    const tp = roundToPrecision(Number(ex.tp), precEarly);
    const toStrEarly = (n) => (precEarly === 0 ? String(Math.round(n)) : n.toFixed(precEarly));
    return {
      entry,
      sl,
      tp,
      entryStr: toStrEarly(entry),
      slStr: toStrEarly(sl),
      tpStr: toStrEarly(tp),
    };
  }
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

/** Market Watch symbol → calculator spec (aliases WTI→USOIL, SPX→SPX500, …). Unified merge + optional overrides. */
export function getInstrumentForWatchlistSymbol(symbol, options) {
  return getInstrumentSpec(symbol, options || {});
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
