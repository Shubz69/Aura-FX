/**
 * Aura Analysis — MT worker adapter + normalization (node assert, no Jest required).
 * Run: node tests/aura-analysis-mt-adapter.test.js
 */
const assert = require('assert');
const { extractPositionsPayload, extractSyncAccountObject } = require('../api/aura-analysis/mtWorkerAdapter');
const {
  rollupNetPnl,
  rollupNetPnlDetailed,
  inferTradeStatus,
  normalizeMtRow,
} = require('../api/aura-analysis/mtTradeNormalize');

// --- Adapter ---
const { rows, warnings } = extractPositionsPayload({ trades: [{ symbol: 'EURUSD', profit: 1 }] }, 'mt5');
assert.strictEqual(rows.length, 1);
assert.ok(Array.isArray(warnings));

const empty = extractPositionsPayload({ foo: 1 }, 'mt4');
assert.strictEqual(empty.rows.length, 0);
assert.ok(empty.warnings.length >= 1);

const nested = extractPositionsPayload({ data: { positions: [{ x: 1 }] } }, 'mt5');
assert.strictEqual(nested.rows.length, 1);

const syncObj = extractSyncAccountObject({ data: { balance: 100, equity: 101 } });
assert.strictEqual(syncObj.balance, 100);

// --- Net PnL priority ---
assert.strictEqual(rollupNetPnl({ netProfit: 50 }, 10, -2, -1), 50);
assert.strictEqual(rollupNetPnl({ profitIncludesCommission: true }, 100, -5, 0), 100);
assert.strictEqual(rollupNetPnl({}, 100, -5, -2), 93);
assert.strictEqual(rollupNetPnlDetailed({ netProfit: 50 }, 10, -2, -1).source, 'explicit_net');
assert.strictEqual(rollupNetPnlDetailed({ profitIncludesCommission: true }, 100, -5, 0).source, 'gross_includes_fees');
assert.strictEqual(rollupNetPnlDetailed({}, 100, -5, -2).source, 'rollup_commission_swap');

// --- Open vs closed ---
const isoOpen = new Date('2024-01-01T12:00:00.000Z').toISOString();
const isoClose = new Date('2024-01-02T12:00:00.000Z').toISOString();
assert.strictEqual(inferTradeStatus({ entryType: 'DEAL_ENTRY_OUT' }, isoOpen, isoClose), 'closed');
assert.strictEqual(inferTradeStatus({ is_open: true }, isoOpen, null), 'open');
assert.strictEqual(
  inferTradeStatus({ volume: 0.1, price_current: 1.1 }, isoOpen, isoOpen),
  'open'
);

const row = normalizeMtRow(
  { symbol: 'EURUSD', profit: 10, commission: -1, swap: 0, entryType: 'DEAL_ENTRY_OUT', time: Date.now() / 1000 },
  'mt5',
  0
);
assert.strictEqual(row.tradeStatus, 'closed');
assert.strictEqual(row.netPnl, 9);

const openRow = normalizeMtRow(
  { symbol: 'GBPUSD', profit: 5, volume: 0.1, price_current: 1.2, time: Date.now() / 1000 },
  'mt5',
  1
);
assert.strictEqual(openRow.tradeStatus, 'open');

console.log('aura-analysis-mt-adapter.test.js: all assertions passed');
