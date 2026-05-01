import { replayTradePnlUsd, getReplayInstrumentSpec } from '../replayPnl';

describe('getReplayInstrumentSpec', () => {
  test('XAUUSD is metal 100 oz', () => {
    const s = getReplayInstrumentSpec('XAUUSD');
    expect(s.kind).toBe('metal_xau');
    expect(s.contractSize).toBe(100);
  });
});

describe('replayTradePnlUsd', () => {
  test('EURUSD buy 1 lot 1.1000 to 1.1010 = +$100', () => {
    const p = replayTradePnlUsd('long', 1.1, 1.101, 'EURUSD', 1);
    expect(p).toBeCloseTo(100, 6);
  });

  test('EURUSD sell 1 lot 1.1000 to 1.1010 = -$100', () => {
    const p = replayTradePnlUsd('short', 1.1, 1.101, 'EURUSD', 1);
    expect(p).toBeCloseTo(-100, 6);
  });

  test('USDJPY buy 1 lot 150.00 to 150.10 ≈ +$66.62', () => {
    const p = replayTradePnlUsd('long', 150.0, 150.1, 'USDJPY', 1, { usdJpyHint: 150.1 });
    expect(p).toBeCloseTo(10000 / 150.1, 2);
    expect(p).toBeCloseTo(66.62, 1);
  });

  test('XAUUSD buy 0.1 lot 3500 to 3510 = +$100', () => {
    const p = replayTradePnlUsd('long', 3500, 3510, 'XAUUSD', 0.1);
    expect(p).toBeCloseTo(100, 6);
  });

  test('XAUUSD sell 0.1 lot 3500 to 3510 = -$100', () => {
    const p = replayTradePnlUsd('short', 3500, 3510, 'XAUUSD', 0.1);
    expect(p).toBeCloseTo(-100, 6);
  });
});
