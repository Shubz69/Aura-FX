/**
 * Unit tests for MT5 CSV parsing (Report History preamble + simple headers).
 * Run: node tests/csv-upload-parse.test.js
 */
const fs = require('fs');
const path = require('path');
const { parseMT5CSV } = require('../api/reports/csv-upload');

const fixturePath = path.join(__dirname, 'fixtures', 'mt5-reporthistory-sample.csv');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function run() {
  const sample = fs.readFileSync(fixturePath, 'utf8');
  const r = parseMT5CSV(sample);
  assert(r.tradeCount >= 1, `expected tradeCount >= 1, got ${r.tradeCount}`);
  assert(r.symbols.includes('XAUUSD'), `expected XAUUSD in symbols, got ${JSON.stringify(r.symbols)}`);

  // Legacy layout: header on first line (no preamble)
  const simple = [
    'Time,Deal,Symbol,Type,Volume,Price,Commission,Swap,Profit',
    '2025.01.01 00:00:00,1,EURUSD,buy,0.1,1.10000,-0.50,0.00,10.00',
    '2025.01.02 00:00:00,2,EURUSD,sell,0.1,1.10100,-0.50,0.00,-5.00',
  ].join('\n');
  const r2 = parseMT5CSV(simple);
  assert(r2.tradeCount === 2, `simple CSV expected 2 trades, got ${r2.tradeCount}`);

  // UTF-8 BOM on first line
  const withBom = '\uFEFF' + simple;
  const r3 = parseMT5CSV(withBom);
  assert(r3.tradeCount === 2, `BOM simple CSV expected 2 trades, got ${r3.tradeCount}`);

  console.log('OK csv-upload-parse tests');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
