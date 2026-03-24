import { getForexPipValueUsdPerLot, forexPairNeedsUsdJpy } from '../forexPipValueUsd';
import { getInstrument, getInstrumentOrFallback } from '../../instruments';
import { calculateRisk } from '../calculateRisk';

describe('getForexPipValueUsdPerLot', () => {
  test('EURUSD quote USD → $10 per pip per std lot', () => {
    const spec = getInstrument('EURUSD');
    const r = getForexPipValueUsdPerLot(spec, 1.1, {});
    expect(r.mode).toBe('quote_usd');
    expect(r.usdPerPipPerLot).toBeCloseTo(10, 6);
  });

  test('USDJPY @ 150 → ~6.67 USD per pip per std lot', () => {
    const spec = getInstrument('USDJPY');
    const r = getForexPipValueUsdPerLot(spec, 150, {});
    expect(r.mode).toBe('usd_base');
    expect(r.usdPerPipPerLot).toBeCloseTo(1000 / 150, 6);
  });

  test('USDCAD @ 1.35 → ~7.41 USD per pip per std lot', () => {
    const spec = getInstrument('USDCAD');
    const r = getForexPipValueUsdPerLot(spec, 1.35, {});
    expect(r.mode).toBe('usd_base');
    expect(r.usdPerPipPerLot).toBeCloseTo(10 / 1.35, 6);
  });

  test('EURGBP cross: pip in GBP × GBPUSD → USD (fx_cross)', () => {
    const spec = getInstrument('EURGBP') ?? getInstrumentOrFallback('EURGBP');
    const entry = 0.85;
    const fxRates = { GBPUSD: 1.27 };
    const r = getForexPipValueUsdPerLot(spec, entry, { fxRates });
    expect(r.mode).toBe('fx_cross');
    const pipInGbp = 100_000 * 0.0001;
    expect(r.usdPerPipPerLot).toBeCloseTo(pipInGbp * 1.27, 6);
  });

  test('EURJPY requires USDJPY; wrong to use cross rate', () => {
    const spec = getInstrument('EURJPY');
    const missing = getForexPipValueUsdPerLot(spec, 180, {});
    expect(missing.missingUsdJpy).toBe(true);
    expect(missing.usdPerPipPerLot).toBeNull();

    const ok = getForexPipValueUsdPerLot(spec, 180, { usdJpy: 150 });
    expect(ok.mode).toBe('jpy_cross');
    expect(ok.usdPerPipPerLot).toBeCloseTo(1000 / 150, 6);
    expect(ok.usdPerPipPerLot).not.toBeCloseTo(1000 / 180, 2);
  });

  test('forexPairNeedsUsdJpy for EURJPY not USDJPY', () => {
    expect(forexPairNeedsUsdJpy('EURJPY')).toBe(true);
    expect(forexPairNeedsUsdJpy('USDJPY')).toBe(false);
    expect(forexPairNeedsUsdJpy('EURUSD')).toBe(false);
  });
});

describe('calculateRisk forex integration', () => {
  const baseInput = {
    accountBalance: 10000,
    riskPercent: 1,
    entry: 1.35,
    stop: 1.34,
    takeProfit: 1.37,
    direction: 'buy',
  };

  test('USDCAD sizes with corrected pip USD', () => {
    const res = calculateRisk('USDCAD', { ...baseInput, entry: 1.35, stop: 1.34, takeProfit: 1.37 });
    expect(res.warnings.length).toBe(0);
    expect(res.positionSize).toBeGreaterThan(0);
    expect(res.potentialLoss).toBeGreaterThan(0);
  });

  test('EURJPY without usdJpy yields no position and warning', () => {
    const res = calculateRisk('EURJPY', {
      ...baseInput,
      entry: 180,
      stop: 179.5,
      takeProfit: 181,
    });
    expect(res.positionSize).toBe(0);
    expect(res.warnings.some((w) => /USD\/JPY|USDJPY|JPY cross/i.test(w))).toBe(true);
  });

  test('EURJPY with usdJpy sizes', () => {
    const res = calculateRisk('EURJPY', {
      ...baseInput,
      entry: 180,
      stop: 179.5,
      takeProfit: 181,
      usdJpy: 150,
    });
    expect(res.positionSize).toBeGreaterThan(0);
    expect(res.warnings.every((w) => !/USD\/JPY|Enter USD/i.test(w))).toBe(true);
  });

  test('EUR account: risk line is 1% of balance in EUR', () => {
    const res = calculateRisk('EURUSD', {
      accountBalance: 10000,
      riskPercent: 1,
      entry: 1.08,
      stop: 1.07,
      takeProfit: 1.1,
      direction: 'buy',
      accountCurrency: 'EUR',
      fxRates: { EURUSD: 1.08 },
    });
    expect(res.riskAmount).toBeCloseTo(100, 4);
    expect(res.positionSize).toBeGreaterThan(0);
  });
});
