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
  { id: 'US500', label: 'US S&P 500', category: 'Indices', chartSymbol: 'US500', dataSymbol: 'US500', providerSymbol: 'OANDA:SPX500USD', type: 'index' },
  { id: 'NAS100', label: 'US Nasdaq 100', category: 'Indices', chartSymbol: 'NAS100', dataSymbol: 'NAS100', providerSymbol: 'OANDA:NAS100USD', type: 'index' },
  { id: 'US30', label: 'US Dow Jones 30', category: 'Indices', chartSymbol: 'US30', dataSymbol: 'US30', providerSymbol: 'OANDA:US30USD', type: 'index' },
  { id: 'GER40', label: 'Germany DAX 40', category: 'Indices', chartSymbol: 'GER40', dataSymbol: 'GER40', providerSymbol: 'TVC:DEU40', type: 'index' },
  { id: 'UK100', label: 'UK FTSE 100', category: 'Indices', chartSymbol: 'UK100', dataSymbol: 'UK100', providerSymbol: 'TVC:UKX', type: 'index' },
  { id: 'FRA40', label: 'France CAC 40', category: 'Indices', chartSymbol: 'FRA40', dataSymbol: 'FRA40', providerSymbol: 'TVC:PX1', type: 'index' },
  { id: 'ESP35', label: 'Spain IBEX 35', category: 'Indices', chartSymbol: 'ESP35', dataSymbol: 'ESP35', providerSymbol: 'TVC:IBC', type: 'index' },
  { id: 'ITA40', label: 'Italy FTSE MIB', category: 'Indices', chartSymbol: 'ITA40', dataSymbol: 'ITA40', providerSymbol: 'TVC:FTMIB', type: 'index' },
  { id: 'NED25', label: 'Netherlands AEX', category: 'Indices', chartSymbol: 'NED25', dataSymbol: 'NED25', providerSymbol: 'TVC:AEX', type: 'index' },
  { id: 'JP225', label: 'Japan Nikkei 225', category: 'Indices', chartSymbol: 'JP225', dataSymbol: 'JP225', providerSymbol: 'TVC:NI225', type: 'index' },
  { id: 'HK50', label: 'Hong Kong Hang Seng', category: 'Indices', chartSymbol: 'HK50', dataSymbol: 'HK50', providerSymbol: 'TVC:HSI', type: 'index' },
  { id: 'CN50', label: 'China A50', category: 'Indices', chartSymbol: 'CN50', dataSymbol: 'CN50', providerSymbol: 'TVC:FTXIN9', type: 'index' },
  { id: 'AU200', label: 'Australia ASX 200', category: 'Indices', chartSymbol: 'AU200', dataSymbol: 'AU200', providerSymbol: 'TVC:XJO', type: 'index' },
  { id: 'IN50', label: 'India Nifty 50', category: 'Indices', chartSymbol: 'IN50', dataSymbol: 'IN50', providerSymbol: 'TVC:NIFTY', type: 'index' },
  { id: 'SG30', label: 'Singapore STI', category: 'Indices', chartSymbol: 'SG30', dataSymbol: 'SG30', providerSymbol: 'TVC:STI', type: 'index' },
  { id: 'VIX', label: 'CBOE Volatility Index', category: 'Indices', chartSymbol: 'VIX', dataSymbol: 'VIX', providerSymbol: 'TVC:VIX', type: 'volatility' },
  { id: 'DXY', label: 'US Dollar Index', category: 'Indices', chartSymbol: 'DXY', dataSymbol: 'DXY', providerSymbol: 'TVC:DXY', type: 'index' },
  { id: 'XAUUSD', label: 'Gold / US Dollar', category: 'Commodities', chartSymbol: 'XAUUSD', dataSymbol: 'XAUUSD', providerSymbol: 'OANDA:XAUUSD', type: 'commodity' },
  { id: 'XAGUSD', label: 'Silver / US Dollar', category: 'Commodities', chartSymbol: 'XAGUSD', dataSymbol: 'XAGUSD', providerSymbol: 'OANDA:XAGUSD', type: 'commodity' },
  { id: 'XPTUSD', label: 'Platinum / US Dollar', category: 'Commodities', chartSymbol: 'XPTUSD', dataSymbol: 'XPTUSD', providerSymbol: 'TVC:PLATINUM', type: 'commodity' },
  { id: 'XPDUSD', label: 'Palladium / US Dollar', category: 'Commodities', chartSymbol: 'XPDUSD', dataSymbol: 'XPDUSD', providerSymbol: 'TVC:PALLADIUM', type: 'commodity' },
  { id: 'USOIL', label: 'WTI Crude Oil', category: 'Commodities', chartSymbol: 'USOIL', dataSymbol: 'USOIL', providerSymbol: 'TVC:USOIL', type: 'commodity' },
  { id: 'UKOIL', label: 'Brent Crude Oil', category: 'Commodities', chartSymbol: 'UKOIL', dataSymbol: 'UKOIL', providerSymbol: 'TVC:UKOIL', type: 'commodity' },
  { id: 'XNGUSD', label: 'Natural Gas', category: 'Commodities', chartSymbol: 'XNGUSD', dataSymbol: 'XNGUSD', providerSymbol: 'TVC:NATGASUSD', type: 'commodity' },
  { id: 'COPPER', label: 'Copper Futures', category: 'Commodities', chartSymbol: 'COPPER', dataSymbol: 'COPPER', providerSymbol: 'COMEX:HG1!', type: 'commodity' },
  { id: 'WHEAT', label: 'Wheat Futures', category: 'Commodities', chartSymbol: 'WHEAT', dataSymbol: 'WHEAT', providerSymbol: 'CBOT:ZW1!', type: 'commodity' },
  { id: 'CORN', label: 'Corn Futures', category: 'Commodities', chartSymbol: 'CORN', dataSymbol: 'CORN', providerSymbol: 'CBOT:ZC1!', type: 'commodity' },
  { id: 'SOYBEAN', label: 'Soybean Futures', category: 'Commodities', chartSymbol: 'SOYBEAN', dataSymbol: 'SOYBEAN', providerSymbol: 'CBOT:ZS1!', type: 'commodity' },
  { id: 'SUGAR', label: 'Sugar Futures', category: 'Commodities', chartSymbol: 'SUGAR', dataSymbol: 'SUGAR', providerSymbol: 'ICEUS:SB1!', type: 'commodity' },
  { id: 'COFFEE', label: 'Coffee Futures', category: 'Commodities', chartSymbol: 'COFFEE', dataSymbol: 'COFFEE', providerSymbol: 'ICEUS:KC1!', type: 'commodity' },
  { id: 'COCOA', label: 'Cocoa Futures', category: 'Commodities', chartSymbol: 'COCOA', dataSymbol: 'COCOA', providerSymbol: 'ICEUS:CC1!', type: 'commodity' },
  { id: 'COTTON', label: 'Cotton Futures', category: 'Commodities', chartSymbol: 'COTTON', dataSymbol: 'COTTON', providerSymbol: 'ICEUS:CT1!', type: 'commodity' },
  { id: 'BTCUSD', label: 'Bitcoin / US Dollar', category: 'Crypto', chartSymbol: 'BTCUSD', dataSymbol: 'BTCUSD', providerSymbol: 'BINANCE:BTCUSDT', type: 'crypto' },
  { id: 'ETHUSD', label: 'Ethereum / US Dollar', category: 'Crypto', chartSymbol: 'ETHUSD', dataSymbol: 'ETHUSD', providerSymbol: 'BINANCE:ETHUSDT', type: 'crypto' },
  { id: 'BNBUSD', label: 'BNB / US Dollar', category: 'Crypto', chartSymbol: 'BNBUSD', dataSymbol: 'BNBUSD', providerSymbol: 'BINANCE:BNBUSDT', type: 'crypto' },
  { id: 'SOLUSD', label: 'Solana / US Dollar', category: 'Crypto', chartSymbol: 'SOLUSD', dataSymbol: 'SOLUSD', providerSymbol: 'BINANCE:SOLUSDT', type: 'crypto' },
  { id: 'XRPUSD', label: 'XRP / US Dollar', category: 'Crypto', chartSymbol: 'XRPUSD', dataSymbol: 'XRPUSD', providerSymbol: 'BINANCE:XRPUSDT', type: 'crypto' },
  { id: 'ADAUSD', label: 'Cardano / US Dollar', category: 'Crypto', chartSymbol: 'ADAUSD', dataSymbol: 'ADAUSD', providerSymbol: 'BINANCE:ADAUSDT', type: 'crypto' },
  { id: 'DOGEUSD', label: 'Dogecoin / US Dollar', category: 'Crypto', chartSymbol: 'DOGEUSD', dataSymbol: 'DOGEUSD', providerSymbol: 'BINANCE:DOGEUSDT', type: 'crypto' },
  { id: 'AVAXUSD', label: 'Avalanche / US Dollar', category: 'Crypto', chartSymbol: 'AVAXUSD', dataSymbol: 'AVAXUSD', providerSymbol: 'BINANCE:AVAXUSDT', type: 'crypto' },
  { id: 'DOTUSD', label: 'Polkadot / US Dollar', category: 'Crypto', chartSymbol: 'DOTUSD', dataSymbol: 'DOTUSD', providerSymbol: 'BINANCE:DOTUSDT', type: 'crypto' },
  { id: 'LINKUSD', label: 'Chainlink / US Dollar', category: 'Crypto', chartSymbol: 'LINKUSD', dataSymbol: 'LINKUSD', providerSymbol: 'BINANCE:LINKUSDT', type: 'crypto' },
  { id: 'MATICUSD', label: 'Polygon / US Dollar', category: 'Crypto', chartSymbol: 'MATICUSD', dataSymbol: 'MATICUSD', providerSymbol: 'BINANCE:POLUSDT', type: 'crypto' },
  { id: 'LTCUSD', label: 'Litecoin / US Dollar', category: 'Crypto', chartSymbol: 'LTCUSD', dataSymbol: 'LTCUSD', providerSymbol: 'BINANCE:LTCUSDT', type: 'crypto' },
  { id: 'BCHUSD', label: 'Bitcoin Cash / US Dollar', category: 'Crypto', chartSymbol: 'BCHUSD', dataSymbol: 'BCHUSD', providerSymbol: 'BINANCE:BCHUSDT', type: 'crypto' },
  { id: 'ATOMUSD', label: 'Cosmos / US Dollar', category: 'Crypto', chartSymbol: 'ATOMUSD', dataSymbol: 'ATOMUSD', providerSymbol: 'BINANCE:ATOMUSDT', type: 'crypto' },
  { id: 'UNIUSD', label: 'Uniswap / US Dollar', category: 'Crypto', chartSymbol: 'UNIUSD', dataSymbol: 'UNIUSD', providerSymbol: 'BINANCE:UNIUSDT', type: 'crypto' },
  { id: 'AAVEUSD', label: 'Aave / US Dollar', category: 'Crypto', chartSymbol: 'AAVEUSD', dataSymbol: 'AAVEUSD', providerSymbol: 'BINANCE:AAVEUSDT', type: 'crypto' },
  { id: 'SHIBUSD', label: 'Shiba Inu / US Dollar', category: 'Crypto', chartSymbol: 'SHIBUSD', dataSymbol: 'SHIBUSD', providerSymbol: 'BINANCE:SHIBUSDT', type: 'crypto' },
  { id: 'SPY', label: 'SPDR S&P 500 ETF', category: 'ETFs', chartSymbol: 'SPY', dataSymbol: 'SPY', providerSymbol: 'AMEX:SPY', type: 'etf' },
  { id: 'QQQ', label: 'Invesco QQQ Trust', category: 'ETFs', chartSymbol: 'QQQ', dataSymbol: 'QQQ', providerSymbol: 'NASDAQ:QQQ', type: 'etf' },
  { id: 'IWM', label: 'iShares Russell 2000 ETF', category: 'ETFs', chartSymbol: 'IWM', dataSymbol: 'IWM', providerSymbol: 'AMEX:IWM', type: 'etf' },
  { id: 'DIA', label: 'SPDR Dow Jones ETF', category: 'ETFs', chartSymbol: 'DIA', dataSymbol: 'DIA', providerSymbol: 'AMEX:DIA', type: 'etf' },
  { id: 'GLD', label: 'SPDR Gold Shares ETF', category: 'ETFs', chartSymbol: 'GLD', dataSymbol: 'GLD', providerSymbol: 'AMEX:GLD', type: 'etf' },
  { id: 'SLV', label: 'iShares Silver Trust ETF', category: 'ETFs', chartSymbol: 'SLV', dataSymbol: 'SLV', providerSymbol: 'AMEX:SLV', type: 'etf' },
  { id: 'TLT', label: '20+ Year Treasury Bond ETF', category: 'ETFs', chartSymbol: 'TLT', dataSymbol: 'TLT', providerSymbol: 'NASDAQ:TLT', type: 'etf' },
  { id: 'IEF', label: '7-10 Year Treasury Bond ETF', category: 'ETFs', chartSymbol: 'IEF', dataSymbol: 'IEF', providerSymbol: 'NASDAQ:IEF', type: 'etf' },
  { id: 'SHY', label: '1-3 Year Treasury Bond ETF', category: 'ETFs', chartSymbol: 'SHY', dataSymbol: 'SHY', providerSymbol: 'NASDAQ:SHY', type: 'etf' },
  { id: 'HYG', label: 'High Yield Corporate Bond ETF', category: 'ETFs', chartSymbol: 'HYG', dataSymbol: 'HYG', providerSymbol: 'AMEX:HYG', type: 'etf' },
  { id: 'LQD', label: 'Investment Grade Bond ETF', category: 'ETFs', chartSymbol: 'LQD', dataSymbol: 'LQD', providerSymbol: 'AMEX:LQD', type: 'etf' },
  { id: 'US10Y', label: 'US 10Y Treasury Yield', category: 'Rates', chartSymbol: 'US10Y', dataSymbol: 'US10Y', providerSymbol: 'TVC:US10Y', type: 'yield' },
  { id: 'US02Y', label: 'US 2Y Treasury Yield', category: 'Rates', chartSymbol: 'US02Y', dataSymbol: 'US02Y', providerSymbol: 'TVC:US02Y', type: 'yield' },
  { id: 'US30Y', label: 'US 30Y Treasury Yield', category: 'Rates', chartSymbol: 'US30Y', dataSymbol: 'US30Y', providerSymbol: 'TVC:US30Y', type: 'yield' },
  { id: 'DE10Y', label: 'Germany 10Y Bund Yield', category: 'Rates', chartSymbol: 'DE10Y', dataSymbol: 'DE10Y', providerSymbol: 'TVC:DE10Y', type: 'yield' },
  { id: 'JP10Y', label: 'Japan 10Y Yield', category: 'Rates', chartSymbol: 'JP10Y', dataSymbol: 'JP10Y', providerSymbol: 'TVC:JP10Y', type: 'yield' },
  { id: 'UK10Y', label: 'UK 10Y Gilt Yield', category: 'Rates', chartSymbol: 'UK10Y', dataSymbol: 'UK10Y', providerSymbol: 'TVC:GB10Y', type: 'yield' },
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
        chartSymbol: id,
        dataSymbol: id,
        providerSymbol: fxChartSymbolForPair(base, quote),
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
  value: x.providerSymbol || x.chartSymbol,
}));

const BY_ID = new Map(TERMINAL_INSTRUMENTS.map((x) => [x.id, x]));
const BY_CHART = new Map(TERMINAL_INSTRUMENTS.map((x) => [x.chartSymbol, x]));
const BY_PROVIDER = new Map(
  TERMINAL_INSTRUMENTS
    .map((x) => [String(x.providerSymbol || '').toUpperCase(), x])
    .filter(([k]) => k),
);
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
  ['BTCUSDT', 'BTCUSD'],
  ['ETHUSDT', 'ETHUSD'],
  ['SOLUSDT', 'SOLUSD'],
  ['XRPUSDT', 'XRPUSD'],
  ['ADAUSDT', 'ADAUSD'],
  ['DOGEUSDT', 'DOGEUSD'],
  ['AVAXUSDT', 'AVAXUSD'],
  ['DOTUSDT', 'DOTUSD'],
  ['LINKUSDT', 'LINKUSD'],
  ['POLUSDT', 'MATICUSD'],
  ['BNBUSDT', 'BNBUSD'],
  ['NATGASUSD', 'XNGUSD'],
  ['GOLD', 'XAUUSD'],
]);

export const TERMINAL_INSTRUMENT_VALUE_SET = new Set(TERMINAL_INSTRUMENT_OPTIONS.map((x) => x.value));
export const TERMINAL_INSTRUMENT_LABEL_TO_VALUE = new Map(TERMINAL_INSTRUMENT_OPTIONS.map((x) => [x.label, x.value]));

/** Default chart symbol aligned with Trader Lab gold default. */
export const DEFAULT_TERMINAL_CHART_SYMBOL = 'XAUUSD';

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
  const viaPair = normalized
    .replace(/^FXIDC|^OANDA|^BINANCE|^COINBASE|^NASDAQ|^AMEX|^TVC|^COMEX|^CBOT|^ICEUS/, '')
    .replace(/^FX/, '');
  if (SYMBOL_ALIASES.has(viaPair)) return SYMBOL_ALIASES.get(viaPair);
  if (BY_ID.has(viaPair)) return viaPair;
  if (BY_PROVIDER.has(String(input || '').toUpperCase())) return BY_PROVIDER.get(String(input || '').toUpperCase())?.id || '';
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
  const upperRaw = raw.toUpperCase();
  if (BY_PROVIDER.has(upperRaw)) return BY_PROVIDER.get(upperRaw) || null;
  const normalized = normalizeSymbol(raw);
  return BY_ID.get(normalized) || BY_DATA.get(normalized) || BY_PROVIDER.get(normalized) || null;
}

export function chartSymbolFromId(id) {
  const inst = getInstrumentById(id) || getInstrumentByChartSymbol(id);
  return inst?.chartSymbol || DEFAULT_TERMINAL_CHART_SYMBOL;
}

export function dataSymbolFromId(id) {
  const inst = getInstrumentById(id) || getInstrumentByChartSymbol(id);
  return inst?.dataSymbol || chartSymbolFromId(id);
}

export function providerSymbolFromId(id) {
  const inst = getInstrumentById(id) || getInstrumentByChartSymbol(id);
  return inst?.providerSymbol || inst?.chartSymbol || DEFAULT_TERMINAL_CHART_SYMBOL;
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
