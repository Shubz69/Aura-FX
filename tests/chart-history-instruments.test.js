/**
 * Chart symbol resolution: Trader Lab + default watchlist (dashboard / ticker universe).
 * Optional NL parse checks. Optional live Yahoo probe.
 * Run: node tests/chart-history-instruments.test.js
 * Optional live: CHART_HISTORY_LIVE=1 node tests/chart-history-instruments.test.js
 */

const axios = require('axios');
const chartHistory = require('../api/market/chart-history.js');
const { getWatchlistPayload } = require('../api/market/defaultWatchlist.js');
const {
  parseChartNavigationIntent,
  CHART_PATH_TRADER_LAB,
  CHART_PATH_TRADER_REPLAY,
} = require('../src/lib/chartUserRequest.js');

/** Keep in sync with `INSTRUMENTS[].value` in `src/pages/TraderLab.js`. */
const TRADER_LAB_INSTRUMENT_VALUES = [
  'OANDA:XAUUSD',
  'OANDA:XAGUSD',
  'OANDA:EURUSD',
  'OANDA:GBPUSD',
  'OANDA:USDJPY',
  'OANDA:AUDUSD',
  'OANDA:NZDUSD',
  'OANDA:USDCAD',
  'OANDA:USDCHF',
  'OANDA:EURJPY',
  'OANDA:GBPJPY',
  'OANDA:EURGBP',
  'OANDA:SPX500USD',
  'OANDA:NAS100USD',
  'OANDA:US30USD',
  'AMEX:SPY',
  'NASDAQ:QQQ',
  'AMEX:IWM',
  'AMEX:DIA',
  'AMEX:GLD',
  'NASDAQ:TLT',
  'TVC:USOIL',
  'TVC:UKOIL',
  'TVC:NATGASUSD',
  'COINBASE:BTCUSD',
  'COINBASE:ETHUSD',
  'BINANCE:SOLUSDT',
  'BINANCE:XRPUSDT',
  'BINANCE:ADAUSDT',
  'TVC:DXY',
  'TVC:VIX',
];

function collectWatchlistSymbols() {
  const wl = getWatchlistPayload();
  const out = new Set();
  Object.values(wl.groups || {}).forEach((g) => {
    (g.symbols || []).forEach((row) => {
      if (row.symbol) out.add(String(row.symbol).trim());
    });
  });
  return [...out];
}

const WATCHLIST_SYMBOLS = collectWatchlistSymbols();

let passed = 0;
let failed = 0;
function it(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

const expect = (actual) => ({
  toBeTruthy: () => {
    if (!actual) throw new Error(`Expected truthy, got ${JSON.stringify(actual)}`);
  },
  toBeGreaterThanOrEqual: (n) => {
    if (actual < n) throw new Error(`Expected >= ${n}, got ${actual}`);
  },
  toBe: (expected) => {
    if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
  },
});

console.log('\nchart-history instrument map (Trader Lab)');
for (const sym of TRADER_LAB_INSTRUMENT_VALUES) {
  it(`resolves Yahoo symbol for ${sym}`, () => {
    const { yahoo, canonical } = chartHistory.resolveChartYahooSymbol(sym);
    expect(yahoo).toBeTruthy();
    expect(canonical).toBeTruthy();
  });
  it(`resolves Twelve Data symbol for ${sym}`, () => {
    const { canonical } = chartHistory.resolveChartYahooSymbol(sym);
    const td = chartHistory.twelveDataSymbolForCanonical(canonical);
    expect(td).toBeTruthy();
  });
}

console.log(`\nchart-history instrument map (watchlist / dashboard, ${WATCHLIST_SYMBOLS.length} symbols)`);
for (const sym of WATCHLIST_SYMBOLS) {
  it(`resolves Yahoo symbol for watchlist ${sym}`, () => {
    const { yahoo, canonical } = chartHistory.resolveChartYahooSymbol(sym);
    expect(yahoo).toBeTruthy();
    expect(canonical).toBeTruthy();
  });
}

console.log('\nchart user request (NL) parse');
it('parses EURUSD 4H Trader Lab', () => {
  const r = parseChartNavigationIntent('show EURUSD 4H in Trader Lab');
  expect(r).toBeTruthy();
  expect(r.chartSymbol).toBe('OANDA:EURUSD');
  expect(r.interval).toBe('240');
  expect(r.path).toBe(CHART_PATH_TRADER_LAB);
});
it('parses gold daily replay', () => {
  const r = parseChartNavigationIntent('open gold daily in Replay');
  expect(r).toBeTruthy();
  expect(r.chartSymbol).toBe('OANDA:XAUUSD');
  expect(r.interval).toBe('1D');
  expect(r.path).toBe(CHART_PATH_TRADER_REPLAY);
});
it('parses BTC 15m lab', () => {
  const r = parseChartNavigationIntent('show BTCUSD 15m chart in trader lab');
  expect(r).toBeTruthy();
  expect(r.chartSymbol).toBe('OANDA:BTCUSD');
  expect(r.interval).toBe('15');
});
it('parses EURUSD 1m replay', () => {
  const r = parseChartNavigationIntent('show EURUSD 1m in replay');
  expect(r).toBeTruthy();
  expect(r.interval).toBe('1');
  expect(r.path).toBe(CHART_PATH_TRADER_REPLAY);
});

console.log('\nchart-history interval/range/provider plan');
for (const i of ['1', '15', '60', '240', '1D']) {
  it(`normalizes interval ${i}`, () => {
    expect(chartHistory.normalizeInterval(i)).toBe(i);
  });
}
for (const r of ['1D', '1W', '1M', '3M', '6M', '1Y']) {
  it(`normalizes range ${r}`, () => {
    expect(chartHistory.normalizeRange(r)).toBe(r);
  });
}
it('prefers Twelve Data for 1m', () => {
  const p = chartHistory.providerPlan({ interval: '1', range: '1D', from: null, to: null });
  expect(p.prefer).toBe('twelvedata');
});
it('prefers Twelve Data for deep range 1Y', () => {
  const p = chartHistory.providerPlan({ interval: '60', range: '1Y', from: null, to: null });
  expect(p.prefer).toBe('twelvedata');
});
it('supports from/to provider planning', () => {
  const p = chartHistory.providerPlan({ interval: '60', range: '3M', from: 1710000000, to: 1715000000 });
  expect(p.prefer).toBe('twelvedata');
});

(async () => {
  if (process.env.CHART_HISTORY_LIVE === '1') {
    console.log('\nchart-history live Yahoo (1d x 5d, first Trader Lab symbol)');
    try {
      const sym = TRADER_LAB_INSTRUMENT_VALUES[0];
      const { yahoo } = chartHistory.resolveChartYahooSymbol(sym);
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahoo)}`;
      const r = await axios.get(url, {
        params: { interval: '1d', range: '5d' },
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      });
      const ts = r.data?.chart?.result?.[0]?.timestamp || [];
      expect(ts.length).toBeGreaterThanOrEqual(1);
      passed += 1;
      console.log(`  ✅ Yahoo returned ${ts.length} timestamps for ${sym} → ${yahoo}`);
    } catch (e) {
      failed += 1;
      console.log(`  ❌ live probe: ${e.message}`);
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
