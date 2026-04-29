import {
  chartSymbolFromId,
  dataSymbolFromId,
  providerSymbolFromId,
  normalizeSymbol,
} from './terminalInstruments';

describe('terminalInstruments symbol mapping', () => {
  test('normalizes provider-prefixed FX symbols', () => {
    expect(normalizeSymbol('OANDA:EURUSD')).toBe('EURUSD');
    expect(normalizeSymbol('EUR/USD')).toBe('EURUSD');
  });

  test('normalizes provider-prefixed crypto symbols', () => {
    expect(normalizeSymbol('BINANCE:BTCUSDT')).toBe('BTCUSD');
  });

  test('normalizes commodity aliases', () => {
    expect(normalizeSymbol('OANDA:XAUUSD')).toBe('XAUUSD');
  });

  test('resolves index aliases', () => {
    expect(normalizeSymbol('US100')).toBe('NAS100');
    expect(normalizeSymbol('NASDAQ')).toBe('NAS100');
  });

  test('returns clean chart/data symbols and provider symbol', () => {
    expect(chartSymbolFromId('EURUSD')).toBe('EURUSD');
    expect(dataSymbolFromId('EURUSD')).toBe('EURUSD');
    expect(providerSymbolFromId('EURUSD')).toBe('OANDA:EURUSD');
  });
});
