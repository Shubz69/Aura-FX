/**
 * Unit tests for MT5 CSV parsing (Report History preamble + simple headers).
 * Run: node tests/csv-upload-parse.test.js
 */
const fs = require('fs');
const path = require('path');
const { parseMT5CSV } = require('../api/reports/csv-upload');
const { buildSummaryFromTrades } = require('../api/reports/csvTradeSummary');

const fixturePath = path.join(__dirname, 'fixtures', 'mt5-reporthistory-sample.csv');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

async function run() {
  const sample = fs.readFileSync(fixturePath, 'utf8');
  const { trades } = parseMT5CSV(sample);
  const sum = buildSummaryFromTrades(trades);
  assert(sum.tradeCount >= 1, `expected tradeCount >= 1, got ${sum.tradeCount}`);
  assert(sum.symbols.includes('XAUUSD'), `expected XAUUSD in symbols, got ${JSON.stringify(sum.symbols)}`);

  // Legacy layout: header on first line (no preamble)
  const simple = [
    'Time,Deal,Symbol,Type,Volume,Price,Commission,Swap,Profit',
    '2025.01.01 00:00:00,1,EURUSD,buy,0.1,1.10000,-0.50,0.00,10.00',
    '2025.01.02 00:00:00,2,EURUSD,sell,0.1,1.10100,-0.50,0.00,-5.00',
  ].join('\n');
  const { trades: t2 } = parseMT5CSV(simple);
  assert(t2.length === 2, `simple CSV expected 2 trades, got ${t2.length}`);

  // UTF-8 BOM on first line
  const withBom = '\uFEFF' + simple;
  const { trades: t3 } = parseMT5CSV(withBom);
  assert(t3.length === 2, `BOM simple CSV expected 2 trades, got ${t3.length}`);

  // PDF-style: tab-separated + "P/L" instead of "Profit" + "Sym" abbreviation
  const pdfStyle = [
    'Some junk line from pdf converter',
    'Open Time\tSym\tType\tLots\tOpen\tClose\tP/L',
    '2025.01.01 00:00:00\tEURUSD\tbuy\t0.1\t1.10000\t1.10100\t10.50',
  ].join('\n');
  const { trades: t4 } = parseMT5CSV(pdfStyle);
  assert(t4.length === 1, `pdf-style TSV expected 1 trade, got ${t4.length}`);
  assert(Math.abs(Number(t4[0].profit) - 10.5) < 0.01, `expected profit 10.5, got ${t4[0].profit}`);

  console.log('OK csv-upload-parse tests');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
