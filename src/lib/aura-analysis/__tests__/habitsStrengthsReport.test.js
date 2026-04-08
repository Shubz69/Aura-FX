import { buildHabitsStrengthsReport } from '../habitsStrengthsReport';

describe('buildHabitsStrengthsReport', () => {
  test('empty trades', () => {
    const r = buildHabitsStrengthsReport({ totalTrades: 0, insights: [] });
    expect(r.weaknesses.length).toBeGreaterThan(0);
    expect(r.strengths.length).toBe(0);
  });

  test('flags revenge when elevated', () => {
    const r = buildHabitsStrengthsReport({
      totalTrades: 40,
      pctWithSL: 88,
      winRate: 48,
      profitFactor: 1.1,
      revengeStyleRate: 28,
      maxLossStreak: 4,
      insights: [],
      institutional: {
        executionQuality: { mfeMaeTradeCoverage: { mfe: 0 } },
        riskEngine: { monteCarlo: { ruinProbApprox: 0.08 } },
        behavioural: {
          mistakeCost: { totalMistakeCost: 0 },
          mistakeClustering: { lossBurstClusters: 0 },
        },
      },
      topSymbolConcentrationPct: 40,
      bySymbol: [{}, {}, {}],
    });
    expect(r.habitFlags.some((f) => f.code === 'revenge')).toBe(true);
  });
});
