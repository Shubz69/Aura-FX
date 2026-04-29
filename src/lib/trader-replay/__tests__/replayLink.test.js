import { buildReplayTradeUrl } from '../replayLink';

describe('replay link builder', () => {
  it('builds aura-analysis replay deep-link with encoded trade id', () => {
    expect(buildReplayTradeUrl('mt5:trade-1')).toBe('/aura-analysis/dashboard/trader-replay?tradeId=mt5%3Atrade-1');
  });
});
