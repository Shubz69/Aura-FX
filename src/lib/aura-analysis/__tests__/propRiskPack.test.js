import { computePropRiskPack } from '../propRiskPack';

describe('computePropRiskPack', () => {
  test('rolling windows and streaks', () => {
    const byDay = {
      '2024-01-02': { pnl: -10, trades: [{}], wins: 0 },
      '2024-01-03': { pnl: -20, trades: [{}], wins: 0 },
      '2024-01-04': { pnl: 5, trades: [{}], wins: 1 },
      '2024-01-05': { pnl: -15, trades: [{}], wins: 0 },
      '2024-01-06': { pnl: -5, trades: [{}], wins: 0 },
      '2024-01-07': { pnl: 30, trades: [{}], wins: 1 },
    };
    const equityCurve = [
      { date: null, balance: 100, pnl: 0, idx: 0 },
      { date: '2024-01-02', balance: 90, pnl: -10, idx: 1 },
      { date: '2024-01-03', balance: 70, pnl: -20, idx: 2 },
      { date: '2024-01-04', balance: 75, pnl: 5, idx: 3 },
      { date: '2024-01-05', balance: 60, pnl: -15, idx: 4 },
      { date: '2024-01-06', balance: 55, pnl: -5, idx: 5 },
      { date: '2024-01-07', balance: 85, pnl: 30, idx: 6 },
    ];
    let peak = 100;
    const drawdownCurve = equityCurve.map((p) => {
      if (p.balance > peak) peak = p.balance;
      const dd = peak - p.balance;
      const ddPct = peak > 0 ? (dd / peak) * 100 : 0;
      return { date: p.date, dd, ddPct };
    });
    const out = computePropRiskPack({ byDay, equityCurve, drawdownCurve });
    expect(out.tradingDaysObserved).toBe(6);
    expect(out.worstDayPnl).toBe(-20);
    expect(out.worstDayKey).toBe('2024-01-03');
    expect(out.maxConsecutiveRedDays).toBe(2);
    expect(out.worstRolling5TradingDaysPnl).not.toBeNull();
    expect(out.worstRolling7TradingDaysPnl).toBeNull();
  });
});
