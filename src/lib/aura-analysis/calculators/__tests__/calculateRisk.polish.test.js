import { calculateRisk } from '../calculateRisk';
import { getInstrumentSpec } from '../../instruments';

const baseInput = {
  accountBalance: 10000,
  riskPercent: 1,
  entry: 1.08,
  stop: 1.07,
  takeProfit: 1.1,
  direction: 'buy',
};

describe('calculateRisk production polish', () => {
  test('strict mode rejects unknown symbols', () => {
    jest.isolateModules(() => {
      process.env.REACT_APP_INSTRUMENT_STRICT_MODE = 'true';
      const { calculateRisk: calc } = require('../calculateRisk');
      const res = calc('NOTREALSYMBOL999ZZ', { ...baseInput });
      expect(res.calculationBlocked).toBe(true);
      expect(res.positionSize).toBe(0);
      expect(res.warnings.some((w) => /strict mode|not registered/i.test(w))).toBe(true);
    });
    delete process.env.REACT_APP_INSTRUMENT_STRICT_MODE;
  });

  test('non-strict still resolves unknown symbols via fallback', () => {
    delete process.env.REACT_APP_INSTRUMENT_STRICT_MODE;
    delete process.env.INSTRUMENT_STRICT_MODE;
    const res = calculateRisk('NOTREALBUTFALLBACK999', { ...baseInput });
    expect(res.calculationBlocked).toBeUndefined();
    expect(res.warnings.length).toBe(0);
    expect(res.positionSize).toBeGreaterThan(0);
  });

  test('sanity guard blocks entry far outside instrument range', () => {
    const res = calculateRisk('EURUSD', {
      ...baseInput,
      entry: 50,
      stop: 49,
      takeProfit: 55,
    });
    expect(res.calculationBlocked).toBe(true);
    expect(res.positionSize).toBe(0);
    expect(res.warnings.some((w) => /typical range/i.test(w))).toBe(true);
  });
});

describe('applyInstrumentOverrides metadata', () => {
  test('sets _instrumentOverrideLog when values change', () => {
    const spec = getInstrumentSpec('EURUSD', {
      brokerOverrides: { contractSize: 99999, minLot: 0.02 },
    });
    expect(spec._instrumentOverrideLog).toBeDefined();
    expect(spec._instrumentOverrideLog.fields.length).toBeGreaterThan(0);
    expect(spec._instrumentOverrideLog.timestamp).toMatch(/^\d{4}-/);
  });
});
