import { computeAnalytics } from '../analytics';

describe('computeAnalytics closed vs open', () => {
  test('uses closed rows only for totalTrades and win stats', () => {
    const closed = {
      id: 'mt5_1',
      tradeStatus: 'closed',
      pair: 'EURUSD',
      pnl: 100,
      netPnl: 100,
      openTime: '2024-06-01T10:00:00.000Z',
      closeTime: '2024-06-01T11:00:00.000Z',
      direction: 'buy',
      session: 'London',
    };
    const open = {
      id: 'mt5_2',
      tradeStatus: 'open',
      pair: 'GBPUSD',
      pnl: -5,
      netPnl: -5,
      openTime: '2024-06-02T10:00:00.000Z',
      direction: 'sell',
      session: 'London',
    };
    const a = computeAnalytics([closed, open], { balance: 1000, equity: 995 });
    expect(a.closedTradesCount).toBe(1);
    expect(a.openPositionsCount).toBe(1);
    expect(a.tradeRowsTotal).toBe(2);
    expect(a.totalTrades).toBe(1);
    expect(a.wins).toBe(1);
    expect(a.equityCurveIsApproximation).toBe(true);
    expect(Array.isArray(a.byHourUtc)).toBe(true);
    expect(a.byHourUtc.length).toBe(24);
    expect(typeof a.sqn).toBe('number');
    expect(Array.isArray(a.pnlHistogram)).toBe(true);
  });

  test('open-only window returns dedicated branch', () => {
    const a = computeAnalytics(
      [{ id: 'o1', tradeStatus: 'open', pair: 'XAUUSD', pnl: 1, openTime: '2024-01-01T00:00:00.000Z' }],
      { balance: 500, equity: 501 }
    );
    expect(a.closedTradesCount).toBe(0);
    expect(a.openPositionsCount).toBe(1);
    expect(a.equityCurveMethod).toBe('none_no_closed_trades');
    expect(a.insights.length).toBeGreaterThan(0);
  });
});
