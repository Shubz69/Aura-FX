/**
 * CSV trade summary + storage payload consistency.
 * Run: node tests/csv-trade-summary.test.js
 */
const {
  buildSummaryFromTrades,
  buildStoredCsvPayload,
  MAX_STORED_TRADES,
} = require('../api/reports/csvTradeSummary');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

function run() {
  const trades = [
    { symbol: 'EURUSD', profit: 10, time: '2025-01-01 10:00:00' },
    { symbol: 'EURUSD', profit: -5, time: '2025-01-02 10:00:00' },
    { symbol: 'XAUUSD', profit: 0, time: '2025-01-03 10:00:00' },
  ];
  const s = buildSummaryFromTrades(trades);
  assert(s.tradeCount === 3, `tradeCount ${s.tradeCount}`);
  assert(s.wins === 1 && s.losses === 1 && s.breakevens === 1, `split ${JSON.stringify(s)}`);
  assert(s.totalPnl === '5.00', `totalPnl ${s.totalPnl}`);

  const many = Array.from({ length: MAX_STORED_TRADES + 500 }, (_, i) => ({
    symbol: 'EURUSD',
    profit: i % 7 === 0 ? -1 : 0.5,
    time: `2025.01.${String((i % 28) + 1).padStart(2, '0')} 12:00:00`,
  }));
  const payload = buildStoredCsvPayload(many);
  assert(payload.truncated === true, 'expected truncated when over cap');
  assert(payload.sourceTradeCount === many.length, 'sourceTradeCount');
  assert(payload.storedTradeCount === payload.trades.length, 'storedTradeCount matches trades');
  assert(payload.tradeCount === payload.trades.length, 'tradeCount matches trades');
  const sum2 = buildSummaryFromTrades(payload.trades);
  assert(sum2.totalPnl === payload.totalPnl, 'summary totalPnl must match slice');
  assert(sum2.tradeCount === payload.tradeCount, 'summary tradeCount must match slice');

  console.log('OK csv-trade-summary tests');
}

run();
