/**
 * Canonical instrument universe used across Operator Intelligence / Trader Lab / watchlists.
 * Single source of truth for instrument metadata and symbol mapping.
 */
const CURRENCY_NAMES = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar',
  CAD: 'Canadian Dollar',
  CHF: 'Swiss Franc',
  NOK: 'Norwegian Krone',
  SEK: 'Swedish Krona',
  DKK: 'Danish Krone',
  PLN: 'Polish Zloty',
  CZK: 'Czech Koruna',
  HUF: 'Hungarian Forint',
  TRY: 'Turkish Lira',
  ZAR: 'South African Rand',
  MXN: 'Mexican Peso',
  BRL: 'Brazilian Real',
  CLP: 'Chilean Peso',
  COP: 'Colombian Peso',
  ARS: 'Argentine Peso',
  CNH: 'Offshore Yuan',
  CNY: 'Chinese Yuan',
  HKD: 'Hong Kong Dollar',
  SGD: 'Singapore Dollar',
  INR: 'Indian Rupee',
  KRW: 'South Korean Won',
  THB: 'Thai Baht',
  TWD: 'Taiwan Dollar',
  IDR: 'Indonesian Rupiah',
  PHP: 'Philippine Peso',
  MYR: 'Malaysian Ringgit',
  RUB: 'Russian Ruble',
  AED: 'UAE Dirham',
  SAR: 'Saudi Riyal',
  ILS: 'Israeli Shekel',
  RON: 'Romanian Leu',
};

const FX_CURRENCIES = [
  'EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY',
  'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR',
  'MXN', 'BRL', 'CNH', 'HKD', 'SGD', 'INR', 'AED',
];

const FX_PROVIDER_BASE = new Set([
  'EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK',
  'HUF', 'TRY', 'ZAR', 'MXN', 'CNH', 'SGD',
]);

const MANUAL_INSTRUMENTS = [
  { id: 'US500', label: 'US S&P 500', category: 'Indices', chartSymbol: 'OANDA:SPX500USD', dataSymbol: 'US500', type: 'index' },
  { id: 'NAS100', label: 'US Nasdaq 100', category: 'Indices', chartSymbol: 'OANDA:NAS100USD', dataSymbol: 'NAS100', type: 'index' },
  { id: 'US30', label: 'US Dow Jones 30', category: 'Indices', chartSymbol: 'OANDA:US30USD', dataSymbol: 'US30', type: 'index' },
  { id: 'GER40', label: 'Germany DAX 40', category: 'Indices', chartSymbol: 'TVC:DEU40', dataSymbol: 'GER40', type: 'index' },
  { id: 'UK100', label: 'UK FTSE 100', category: 'Indices', chartSymbol: 'TVC:UKX', dataSymbol: 'UK100', type: 'index' },
  { id: 'FRA40', label: 'France CAC 40', category: 'Indices', chartSymbol: 'TVC:PX1', dataSymbol: 'FRA40', type: 'index' },
  { id: 'ESP35', label: 'Spain IBEX 35', category: 'Indices', chartSymbol: 'TVC:IBC', dataSymbol: 'ESP35', type: 'index' },
  { id: 'ITA40', label: 'Italy FTSE MIB', category: 'Indices', chartSymbol: 'TVC:FTMIB', dataSymbol: 'ITA40', type: 'index' },
  { id: 'NED25', label: 'Netherlands AEX', category: 'Indices', chartSymbol: 'TVC:AEX', dataSymbol: 'NED25', type: 'index' },
  { id: 'JP225', label: 'Japan Nikkei 225', category: 'Indices', chartSymbol: 'TVC:NI225', dataSymbol: 'JP225', type: 'index' },
  { id: 'HK50', label: 'Hong Kong Hang Seng', category: 'Indices', chartSymbol: 'TVC:HSI', dataSymbol: 'HK50', type: 'index' },
  { id: 'CN50', label: 'China A50', category: 'Indices', chartSymbol: 'TVC:FTXIN9', dataSymbol: 'CN50', type: 'index' },
  { id: 'AU200', label: 'Australia ASX 200', category: 'Indices', chartSymbol: 'TVC:XJO', dataSymbol: 'AU200', type: 'index' },
  { id: 'IN50', label: 'India Nifty 50', category: 'Indices', chartSymbol: 'TVC:NIFTY', dataSymbol: 'IN50', type: 'index' },
  { id: 'SG30', label: 'Singapore STI', category: 'Indices', chartSymbol: 'TVC:STI', dataSymbol: 'SG30', type: 'index' },
  { id: 'VIX', label: 'CBOE Volatility Index', category: 'Indices', chartSymbol: 'TVC:VIX', dataSymbol: 'VIX', type: 'volatility' },
  { id: 'DXY', label: 'US Dollar Index', category: 'Indices', chartSymbol: 'TVC:DXY', dataSymbol: 'DXY', type: 'index' },
  { id: 'XAUUSD', label: 'Gold / US Dollar', category: 'Commodities', chartSymbol: 'OANDA:XAUUSD', dataSymbol: 'XAUUSD', type: 'metal' },
  { id: 'XAGUSD', label: 'Silver / US Dollar', category: 'Commodities', chartSymbol: 'OANDA:XAGUSD', dataSymbol: 'XAGUSD', type: 'metal' },
  { id: 'XPTUSD', label: 'Platinum / US Dollar', category: 'Commodities', chartSymbol: 'TVC:PLATINUM', dataSymbol: 'XPTUSD', type: 'metal' },
  { id: 'XPDUSD', label: 'Palladium / US Dollar', category: 'Commodities', chartSymbol: 'TVC:PALLADIUM', dataSymbol: 'XPDUSD', type: 'metal' },
  { id: 'USOIL', label: 'WTI Crude Oil', category: 'Commodities', chartSymbol: 'TVC:USOIL', dataSymbol: 'USOIL', type: 'energy' },
  { id: 'UKOIL', label: 'Brent Crude Oil', category: 'Commodities', chartSymbol: 'TVC:UKOIL', dataSymbol: 'UKOIL', type: 'energy' },
  { id: 'XNGUSD', label: 'Natural Gas', category: 'Commodities', chartSymbol: 'TVC:NATGASUSD', dataSymbol: 'XNGUSD', type: 'energy' },
  { id: 'COPPER', label: 'Copper Futures', category: 'Commodities', chartSymbol: 'COMEX:HG1!', dataSymbol: 'COPPER', type: 'metal' },
  { id: 'WHEAT', label: 'Wheat Futures', category: 'Commodities', chartSymbol: 'CBOT:ZW1!', dataSymbol: 'WHEAT', type: 'agri' },
  { id: 'CORN', label: 'Corn Futures', category: 'Commodities', chartSymbol: 'CBOT:ZC1!', dataSymbol: 'CORN', type: 'agri' },
  { id: 'SOYBEAN', label: 'Soybean Futures', category: 'Commodities', chartSymbol: 'CBOT:ZS1!', dataSymbol: 'SOYBEAN', type: 'agri' },
  { id: 'SUGAR', label: 'Sugar Futures', category: 'Commodities', chartSymbol: 'ICEUS:SB1!', dataSymbol: 'SUGAR', type: 'agri' },
  { id: 'COFFEE', label: 'Coffee Futures', category: 'Commodities', chartSymbol: 'ICEUS:KC1!', dataSymbol: 'COFFEE', type: 'agri' },
  { id: 'COCOA', label: 'Cocoa Futures', category: 'Commodities', chartSymbol: 'ICEUS:CC1!', dataSymbol: 'COCOA', type: 'agri' },
  { id: 'COTTON', label: 'Cotton Futures', category: 'Commodities', chartSymbol: 'ICEUS:CT1!', dataSymbol: 'COTTON', type: 'agri' },
  { id: 'BTCUSD', label: 'Bitcoin / US Dollar', category: 'Crypto', chartSymbol: 'COINBASE:BTCUSD', dataSymbol: 'BTCUSD', type: 'crypto' },
  { id: 'ETHUSD', label: 'Ethereum / US Dollar', category: 'Crypto', chartSymbol: 'COINBASE:ETHUSD', dataSymbol: 'ETHUSD', type: 'crypto' },
  { id: 'BNBUSD', label: 'BNB / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:BNBUSDT', dataSymbol: 'BNBUSD', type: 'crypto' },
  { id: 'SOLUSD', label: 'Solana / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:SOLUSDT', dataSymbol: 'SOLUSD', type: 'crypto' },
  { id: 'XRPUSD', label: 'XRP / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:XRPUSDT', dataSymbol: 'XRPUSD', type: 'crypto' },
  { id: 'ADAUSD', label: 'Cardano / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:ADAUSDT', dataSymbol: 'ADAUSD', type: 'crypto' },
  { id: 'DOGEUSD', label: 'Dogecoin / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:DOGEUSDT', dataSymbol: 'DOGEUSD', type: 'crypto' },
  { id: 'AVAXUSD', label: 'Avalanche / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:AVAXUSDT', dataSymbol: 'AVAXUSD', type: 'crypto' },
  { id: 'DOTUSD', label: 'Polkadot / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:DOTUSDT', dataSymbol: 'DOTUSD', type: 'crypto' },
  { id: 'LINKUSD', label: 'Chainlink / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:LINKUSDT', dataSymbol: 'LINKUSD', type: 'crypto' },
  { id: 'MATICUSD', label: 'Polygon / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:POLUSDT', dataSymbol: 'MATICUSD', type: 'crypto' },
  { id: 'LTCUSD', label: 'Litecoin / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:LTCUSDT', dataSymbol: 'LTCUSD', type: 'crypto' },
  { id: 'BCHUSD', label: 'Bitcoin Cash / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:BCHUSDT', dataSymbol: 'BCHUSD', type: 'crypto' },
  { id: 'ATOMUSD', label: 'Cosmos / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:ATOMUSDT', dataSymbol: 'ATOMUSD', type: 'crypto' },
  { id: 'UNIUSD', label: 'Uniswap / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:UNIUSDT', dataSymbol: 'UNIUSD', type: 'crypto' },
  { id: 'AAVEUSD', label: 'Aave / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:AAVEUSDT', dataSymbol: 'AAVEUSD', type: 'crypto' },
  { id: 'SHIBUSD', label: 'Shiba Inu / US Dollar', category: 'Crypto', chartSymbol: 'BINANCE:SHIBUSDT', dataSymbol: 'SHIBUSD', type: 'crypto' },
  { id: 'SPY', label: 'SPDR S&P 500 ETF', category: 'ETFs', chartSymbol: 'AMEX:SPY', dataSymbol: 'SPY', type: 'etf' },
  { id: 'QQQ', label: 'Invesco QQQ Trust', category: 'ETFs', chartSymbol: 'NASDAQ:QQQ', dataSymbol: 'QQQ', type: 'etf' },
  { id: 'IWM', label: 'iShares Russell 2000 ETF', category: 'ETFs', chartSymbol: 'AMEX:IWM', dataSymbol: 'IWM', type: 'etf' },
  { id: 'DIA', label: 'SPDR Dow Jones ETF', category: 'ETFs', chartSymbol: 'AMEX:DIA', dataSymbol: 'DIA', type: 'etf' },
  { id: 'GLD', label: 'SPDR Gold Shares ETF', category: 'ETFs', chartSymbol: 'AMEX:GLD', dataSymbol: 'GLD', type: 'etf' },
  { id: 'SLV', label: 'iShares Silver Trust ETF', category: 'ETFs', chartSymbol: 'AMEX:SLV', dataSymbol: 'SLV', type: 'etf' },
  { id: 'TLT', label: '20+ Year Treasury Bond ETF', category: 'ETFs', chartSymbol: 'NASDAQ:TLT', dataSymbol: 'TLT', type: 'etf' },
  { id: 'IEF', label: '7-10 Year Treasury Bond ETF', category: 'ETFs', chartSymbol: 'NASDAQ:IEF', dataSymbol: 'IEF', type: 'etf' },
  { id: 'SHY', label: '1-3 Year Treasury Bond ETF', category: 'ETFs', chartSymbol: 'NASDAQ:SHY', dataSymbol: 'SHY', type: 'etf' },
  { id: 'HYG', label: 'High Yield Corporate Bond ETF', category: 'ETFs', chartSymbol: 'AMEX:HYG', dataSymbol: 'HYG', type: 'etf' },
  { id: 'LQD', label: 'Investment Grade Bond ETF', category: 'ETFs', chartSymbol: 'AMEX:LQD', dataSymbol: 'LQD', type: 'etf' },
  { id: 'US10Y', label: 'US 10Y Treasury Yield', category: 'Rates', chartSymbol: 'TVC:US10Y', dataSymbol: 'US10Y', type: 'yield' },
  { id: 'US02Y', label: 'US 2Y Treasury Yield', category: 'Rates', chartSymbol: 'TVC:US02Y', dataSymbol: 'US02Y', type: 'yield' },
  { id: 'US30Y', label: 'US 30Y Treasury Yield', category: 'Rates', chartSymbol: 'TVC:US30Y', dataSymbol: 'US30Y', type: 'yield' },
  { id: 'DE10Y', label: 'Germany 10Y Bund Yield', category: 'Rates', chartSymbol: 'TVC:DE10Y', dataSymbol: 'DE10Y', type: 'yield' },
  { id: 'JP10Y', label: 'Japan 10Y Yield', category: 'Rates', chartSymbol: 'TVC:JP10Y', dataSymbol: 'JP10Y', type: 'yield' },
  { id: 'UK10Y', label: 'UK 10Y Gilt Yield', category: 'Rates', chartSymbol: 'TVC:GB10Y', dataSymbol: 'UK10Y', type: 'yield' },
];

function fxChartSymbolForPair(base, quote) {
  if (FX_PROVIDER_BASE.has(base) && FX_PROVIDER_BASE.has(quote)) return `OANDA:${base}${quote}`;
  return `FX_IDC:${base}${quote}`;
}

function buildFxUniverse() {
  const out = [];
  for (let i = 0; i < FX_CURRENCIES.length; i += 1) {
    for (let j = i + 1; j < FX_CURRENCIES.length; j += 1) {
      const base = FX_CURRENCIES[i];
      const quote = FX_CURRENCIES[j];
      const id = `${base}${quote}`;
      out.push({
        id,
        label: `${CURRENCY_NAMES[base] || base} / ${CURRENCY_NAMES[quote] || quote}`,
        category: 'FX',
        chartSymbol: fxChartSymbolForPair(base, quote),
        dataSymbol: id,
        type: 'forex',
      });
    }
  }
  return out;
}

function dedupeById(items) {
  const map = new Map();
  items.forEach((row) => {
    if (!row?.id || map.has(row.id)) return;
    map.set(row.id, row);
  });
  return [...map.values()];
}

export const TERMINAL_INSTRUMENTS = dedupeById([
  ...buildFxUniverse(),
  ...MANUAL_INSTRUMENTS,
]).sort((a, b) => a.category.localeCompare(b.category) || a.id.localeCompare(b.id));

export const TERMINAL_INSTRUMENT_COUNT = TERMINAL_INSTRUMENTS.length;

export const TERMINAL_INSTRUMENT_CATEGORIES = [...new Set(TERMINAL_INSTRUMENTS.map((x) => x.category))];

/** Backward-compatible select options used by existing screens. */
export const TERMINAL_INSTRUMENT_OPTIONS = TERMINAL_INSTRUMENTS.map((x) => ({
  label: x.id,
  value: x.chartSymbol,
}));

const BY_ID = new Map(TERMINAL_INSTRUMENTS.map((x) => [x.id, x]));
const BY_CHART = new Map(TERMINAL_INSTRUMENTS.map((x) => [x.chartSymbol, x]));
const BY_DATA = new Map(TERMINAL_INSTRUMENTS.map((x) => [x.dataSymbol, x]));

const SYMBOL_ALIASES = new Map([
  ['US100', 'NAS100'],
  ['NASDAQ', 'NAS100'],
  ['NASDAQ100', 'NAS100'],
  ['NAS', 'NAS100'],
  ['SPX', 'US500'],
  ['SP500', 'US500'],
  ['SPX500', 'US500'],
  ['DJI', 'US30'],
  ['DOW', 'US30'],
  ['GOLD', 'XAUUSD'],
  ['SILVER', 'XAGUSD'],
  ['WTI', 'USOIL'],
  ['BRENT', 'UKOIL'],
  ['NATGAS', 'XNGUSD'],
  ['BITCOIN', 'BTCUSD'],
  ['ETHEREUM', 'ETHUSD'],
]);

export const TERMINAL_INSTRUMENT_VALUE_SET = new Set(TERMINAL_INSTRUMENT_OPTIONS.map((x) => x.value));
export const TERMINAL_INSTRUMENT_LABEL_TO_VALUE = new Map(TERMINAL_INSTRUMENT_OPTIONS.map((x) => [x.label, x.value]));

/** Default chart symbol aligned with Trader Lab gold default. */
export const DEFAULT_TERMINAL_CHART_SYMBOL = 'OANDA:XAUUSD';

export function normalizeDecodedSymbol(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Canonical symbol normalizer, handles id/chart/aliases and slash formats. */
export function normalizeSymbol(input) {
  const normalized = normalizeDecodedSymbol(input);
  if (!normalized) return '';
  if (BY_ID.has(normalized) || BY_DATA.has(normalized)) return normalized;
  if (SYMBOL_ALIASES.has(normalized)) return SYMBOL_ALIASES.get(normalized);
  const viaPair = normalized.replace(/^FXIDC|^OANDA|^BINANCE|^COINBASE|^NASDAQ|^AMEX|^TVC|^COMEX|^CBOT|^ICEUS/, '');
  if (BY_ID.has(viaPair)) return viaPair;
  if (/^[A-Z]{6}$/.test(normalized) && BY_ID.has(normalized)) return normalized;
  return normalized;
}

export function getInstrumentById(id) {
  const normalized = normalizeSymbol(id);
  if (!normalized) return null;
  return BY_ID.get(normalized) || BY_DATA.get(normalized) || null;
}

export function getInstrumentByChartSymbol(symbol) {
  const raw = String(symbol || '');
  if (!raw) return null;
  if (BY_CHART.has(raw)) return BY_CHART.get(raw) || null;
  const normalized = normalizeSymbol(raw);
  return BY_ID.get(normalized) || BY_DATA.get(normalized) || null;
}

export function chartSymbolFromId(id) {
  const inst = getInstrumentById(id) || getInstrumentByChartSymbol(id);
  return inst?.chartSymbol || DEFAULT_TERMINAL_CHART_SYMBOL;
}

/**
 * Map decoded / shorthand input to chart provider id.
 * Kept for backward compatibility with existing callers.
 */
export function chartSymbolFromDecoded(decodedSymbol, fallback = DEFAULT_TERMINAL_CHART_SYMBOL) {
  const resolved = chartSymbolFromId(decodedSymbol);
  return resolved || fallback;
}

/** Short label for UI (e.g. EURUSD from OANDA:EURUSD). */
export function terminalInstrumentLabel(chartSymbol) {
  const found = getInstrumentByChartSymbol(chartSymbol);
  if (found) return found.id;
  const raw = String(chartSymbol || '');
  if (!raw) return '—';
  const token = raw.includes(':') ? raw.split(':')[1] : raw;
  return token || raw;
}
