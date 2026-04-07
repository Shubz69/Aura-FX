jest.mock('../monteCarloRunner', () => {
  const { monteCarloRiskFixed, MC_DEFAULT_RUNS } = require('../analytics/monteCarloRisk');
  return {
    runMonteCarloOffMainThread: (pnls, startBalance, opts = {}) =>
      Promise.resolve(monteCarloRiskFixed(pnls, startBalance, opts.runs ?? MC_DEFAULT_RUNS)),
  };
});

import { computeAnalytics } from '../analytics';

describe('execution path metrics (MFE/MAE)', () => {
  test('uses excursion fields when present', async () => {
    const trades = [
      {
        id: 'e1',
        tradeStatus: 'closed',
        pair: 'EURUSD',
        netPnl: 80,
        openTime: '2024-01-01T11:00:00.000Z',
        closeTime: '2024-01-01T12:00:00.000Z',
        direction: 'buy',
        mfeUsd: 100,
        maeUsd: 20,
        session: 'London',
      },
      {
        id: 'e2',
        tradeStatus: 'closed',
        pair: 'GBPUSD',
        netPnl: -40,
        openTime: '2024-01-02T11:00:00.000Z',
        closeTime: '2024-01-02T12:00:00.000Z',
        direction: 'buy',
        mfeUsd: 10,
        maeUsd: 50,
        session: 'London',
      },
    ];
    const a = await computeAnalytics(trades, { balance: 1000 });
    const eq = a.institutional.executionQuality;
    expect(eq.mfeMaeTradeCoverage.mfe).toBe(2);
    expect(eq.entryEfficiencyAvg).not.toBeNull();
    expect(eq.exitEfficiencyAvg).not.toBeNull();
    expect(eq.avoidableDrawdownPctAvg).not.toBeNull();
    expect(eq.executionBySymbol.length).toBeGreaterThan(0);
    expect(eq.executionBySession.length).toBeGreaterThan(0);
    expect(a.institutional.scatterTradePnL[0].mfeUsd).toBe(100);
  });

  test('mfeR infers dollars with loss unit', async () => {
    const trades = Array.from({ length: 6 }, (_, i) => ({
      id: `r${i}`,
      tradeStatus: 'closed',
      pair: 'XAUUSD',
      netPnl: i % 2 === 0 ? 50 : -30,
      openTime: `2024-03-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      closeTime: `2024-03-${String(i + 1).padStart(2, '0')}T11:00:00.000Z`,
      direction: 'buy',
      mfeR: 1.2,
      maeR: 0.4,
    }));
    const a = await computeAnalytics(trades, { balance: 5000 });
    const eq = a.institutional.executionQuality;
    expect(eq.mfeMaeTradeCoverage.mfe).toBeGreaterThan(0);
    expect(eq.availableRRAvg != null || eq.rrCaptureRatioAvg != null).toBe(true);
  });
});
