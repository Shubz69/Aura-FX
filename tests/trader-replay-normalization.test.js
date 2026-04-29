const {
  buildReplayId,
  parseReplayId,
  normalizeMtTrade,
  normalizeAuraTrade,
  normalizeCsvTrade,
} = require('../api/trader-replay/tradeSources');

let passed = 0;
let failed = 0;
function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}
function it(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}
function expect(v) {
  return {
    toBe(x) {
      if (v !== x) throw new Error(`Expected ${x}, got ${v}`);
    },
    toBeTruthy() {
      if (!v) throw new Error('Expected truthy value');
    },
  };
}

describe('trader replay normalization', () => {
  it('builds and parses replay ids', () => {
    const id = buildReplayId('mt5', 'abc-1');
    const parsed = parseReplayId(id);
    expect(parsed.source).toBe('mt5');
    expect(parsed.sourceId).toBe('abc-1');
  });

  it('normalizes MT trades with replay identity', () => {
    const trade = normalizeMtTrade(
      { id: 'd-1', pair: 'EURUSD', direction: 'buy', openTime: '2026-01-01T09:00:00Z', closeTime: '2026-01-01T10:00:00Z', entryPrice: 1.1, closePrice: 1.101, netPnl: 25.5, volume: 0.2 },
      'mt5'
    );
    expect(trade.replayId).toBe('mt5:d-1');
    expect(trade.symbol).toBe('EURUSD');
    expect(trade.durationSeconds).toBe(3600);
  });

  it('normalizes aura + csv sources into one shape', () => {
    const aura = normalizeAuraTrade({
      id: 42,
      pair: 'GBPUSD',
      direction: 'sell',
      entry_price: 1.25,
      stop_loss: 1.255,
      take_profit: 1.24,
      position_size: 0.1,
      pnl: -12,
      created_at: '2026-01-02T08:00:00Z',
      updated_at: '2026-01-02T09:00:00Z',
    });
    const csv = normalizeCsvTrade(2026, 1, { symbol: 'XAUUSD', type: 'buy', volume: '0.50', profit: '80', time: '2026-01-03 10:15:00' }, 0);
    expect(aura.replayId).toBe('aura:42');
    expect(csv.replayId).toBe('csv:2026-1-0');
    expect(csv.symbol).toBe('XAUUSD');
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
