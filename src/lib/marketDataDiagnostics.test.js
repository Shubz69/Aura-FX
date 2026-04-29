import marketDataDiagnostics, { recordMarketDataRequest } from './marketDataDiagnostics';

describe('marketDataDiagnostics', () => {
  const origEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
    marketDataDiagnostics.reset();
  });

  it('records GET /api/market calls in development only', () => {
    process.env.NODE_ENV = 'development';
    recordMarketDataRequest('https://x.test/api/market/chart-history', { symbol: 'EURUSD', interval: '60' });
    recordMarketDataRequest('https://x.test/api/market/chart-history', { symbol: 'EURUSD', interval: '60' });
    const snap = marketDataDiagnostics.getSnapshot();
    expect(snap.totalCalls).toBe(2);
  });

  it('does not record in production', () => {
    process.env.NODE_ENV = 'production';
    recordMarketDataRequest('https://x.test/api/market/chart-history', { symbol: 'EURUSD' });
    expect(marketDataDiagnostics.getSnapshot().totalCalls).toBe(0);
  });
});
