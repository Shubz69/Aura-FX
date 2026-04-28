/**
 * Canonical terminal / lab instrument universe (FX, indices, commodities, crypto, ETFs).
 * Used by Trader Lab, Operator Intelligence chart, and Market Watch.
 */
export const TERMINAL_INSTRUMENT_OPTIONS = [
  { label: 'XAUUSD', value: 'OANDA:XAUUSD' },
  { label: 'XAGUSD', value: 'OANDA:XAGUSD' },
  { label: 'EURUSD', value: 'OANDA:EURUSD' },
  { label: 'GBPUSD', value: 'OANDA:GBPUSD' },
  { label: 'USDJPY', value: 'OANDA:USDJPY' },
  { label: 'AUDUSD', value: 'OANDA:AUDUSD' },
  { label: 'NZDUSD', value: 'OANDA:NZDUSD' },
  { label: 'USDCAD', value: 'OANDA:USDCAD' },
  { label: 'USDCHF', value: 'OANDA:USDCHF' },
  { label: 'EURJPY', value: 'OANDA:EURJPY' },
  { label: 'GBPJPY', value: 'OANDA:GBPJPY' },
  { label: 'EURGBP', value: 'OANDA:EURGBP' },
  { label: 'US500', value: 'OANDA:SPX500USD' },
  { label: 'NAS100', value: 'OANDA:NAS100USD' },
  { label: 'US30', value: 'OANDA:US30USD' },
  { label: 'SPY', value: 'AMEX:SPY' },
  { label: 'QQQ', value: 'NASDAQ:QQQ' },
  { label: 'IWM', value: 'AMEX:IWM' },
  { label: 'DIA', value: 'AMEX:DIA' },
  { label: 'GLD', value: 'AMEX:GLD' },
  { label: 'TLT', value: 'NASDAQ:TLT' },
  { label: 'USOIL', value: 'TVC:USOIL' },
  { label: 'UKOIL', value: 'TVC:UKOIL' },
  { label: 'XNGUSD', value: 'TVC:NATGASUSD' },
  { label: 'BTCUSD', value: 'COINBASE:BTCUSD' },
  { label: 'ETHUSD', value: 'COINBASE:ETHUSD' },
  { label: 'SOLUSD', value: 'BINANCE:SOLUSDT' },
  { label: 'XRPUSD', value: 'BINANCE:XRPUSDT' },
  { label: 'ADAUSD', value: 'BINANCE:ADAUSDT' },
  { label: 'DXY', value: 'TVC:DXY' },
  { label: 'VIX', value: 'TVC:VIX' },
];

export const TERMINAL_INSTRUMENT_VALUE_SET = new Set(TERMINAL_INSTRUMENT_OPTIONS.map((x) => x.value));

export const TERMINAL_INSTRUMENT_LABEL_TO_VALUE = new Map(
  TERMINAL_INSTRUMENT_OPTIONS.map((x) => [x.label, x.value]),
);

/** Default chart symbol aligned with Trader Lab gold default. */
export const DEFAULT_TERMINAL_CHART_SYMBOL = 'OANDA:XAUUSD';

export function normalizeDecodedSymbol(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Map a decoded / shorthand symbol to a chart provider id (OANDA:, TVC:, etc.).
 * @param {string} decodedSymbol
 * @param {string} [fallback]
 */
export function chartSymbolFromDecoded(decodedSymbol, fallback = DEFAULT_TERMINAL_CHART_SYMBOL) {
  const s = normalizeDecodedSymbol(decodedSymbol);
  if (!s) return fallback;
  if (TERMINAL_INSTRUMENT_LABEL_TO_VALUE.has(s)) return TERMINAL_INSTRUMENT_LABEL_TO_VALUE.get(s);
  if (/^[A-Z]{6}$/.test(s)) return `OANDA:${s}`;
  return s;
}

/** Short label for UI (e.g. EURUSD from OANDA:EURUSD). */
export function terminalInstrumentLabel(chartSymbol) {
  const raw = String(chartSymbol || '');
  if (!raw) return '—';
  const found = TERMINAL_INSTRUMENT_OPTIONS.find((o) => o.value === raw);
  if (found) return found.label;
  const token = raw.includes(':') ? raw.split(':')[1] : raw;
  return token || raw;
}
