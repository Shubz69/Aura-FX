import { buildReplayTradeUrl, buildCsvReplayTradeId, sanitizeTradeIdQueryParam } from '../replayLink';

describe('replay link builder', () => {
  it('builds aura-analysis replay deep-link with encoded trade id', () => {
    expect(buildReplayTradeUrl('mt5:trade-1')).toBe('/aura-analysis/dashboard/trader-replay?tradeId=mt5%3Atrade-1');
  });

  it('matches backend csv replay id shape', () => {
    expect(buildCsvReplayTradeId(2026, 4, 0)).toBe('csv:2026-4-0');
  });

  it('sanitizes double-encoded trade ids', () => {
    expect(sanitizeTradeIdQueryParam('csv%253A2026-4-1')).toBe('csv:2026-4-1');
  });

  it('deep-link for csv row matches trader-replay list id', () => {
    const rid = buildCsvReplayTradeId(2026, 4, 12);
    expect(buildReplayTradeUrl(rid)).toBe('/aura-analysis/dashboard/trader-replay?tradeId=csv%3A2026-4-12');
  });
});
