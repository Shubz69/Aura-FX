/**
 * Market data layer unit tests (cache keys, priceMath, tdMetrics, throttle stats).
 * Run: node tests/market-data-core.test.js
 */

const { quoteKey, seriesKey, earliestKey, CALC_VER } = require('../api/market-data/cachePolicy');
const {
  changeVsPreviousClose,
  changeVsPreviousCloseOnly,
  rangeFromSeries,
  sessionChangeFromQuote,
  displayDecimalsForSymbol,
  formatChangePercentDisplay,
} = require('../api/market-data/priceMath');
const { bump, snapshot, reset } = require('../api/market-data/tdMetrics');
const { stats } = require('../api/market-data/tdRateLimiter');
const { emptyQuoteDTO, emptyCandleSeriesDTO } = require('../api/market-data/dto');
const { getMarketStreamProvider, NoopMarketStreamProvider } = require('../api/market-data/marketStreamProvider');

let passed = 0;
let failed = 0;
function describe(name, fn) {
  console.log('\n' + name);
  fn();
}
function it(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + ': ' + e.message);
  }
}
const expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
  },
  toBeCloseTo: (expected, digits) => {
    const d = digits != null ? digits : 2;
    const diff = Math.abs(actual - expected);
    const tol = Math.pow(10, -d);
    if (diff > tol) throw new Error(`Expected ~${expected}, got ${actual}`);
  },
});

describe('cachePolicy keys', () => {
  it('uses stable quote key', () => {
    expect(quoteKey('eurusd')).toBe(`md:${CALC_VER}:quote:EURUSD`);
  });
  it('uses stable series key', () => {
    expect(seriesKey('XAUUSD', '1day', '2020_2021')).toBe(`md:${CALC_VER}:series:XAUUSD:1day:2020_2021`);
  });
  it('uses stable earliest key', () => {
    expect(earliestKey('BTCUSD', '1day')).toBe(`md:${CALC_VER}:earliest:BTCUSD:1day`);
  });
});

describe('displayDecimalsForSymbol', () => {
  it('uses JPY and pip rules', () => {
    expect(displayDecimalsForSymbol('USDJPY')).toBe(3);
    expect(displayDecimalsForSymbol('EURUSD')).toBe(5);
    expect(displayDecimalsForSymbol('XAUUSD')).toBe(2);
  });
});

describe('priceMath', () => {
  it('changeVsPreviousClose', () => {
    const q = emptyQuoteDTO({ last: 110, prevClose: 100 });
    const v = changeVsPreviousClose(q);
    expect(v.change).toBe(10);
    expect(v.changePct).toBeCloseTo(10, 5);
  });
  it('sessionChangeFromQuote prefers prev then open', () => {
    const q = emptyQuoteDTO({ last: 105, prevClose: 100 });
    const v = sessionChangeFromQuote(q);
    expect(v.change).toBe(5);
  });
  it('changeVsPreviousCloseOnly matches prior-close only', () => {
    const q = emptyQuoteDTO({ last: 1.00005, prevClose: 1.0 });
    const v = changeVsPreviousCloseOnly(q);
    expect(v.change).toBeCloseTo(0.00005, 8);
    expect(formatChangePercentDisplay(v.changePct, 'EURUSD')).toBe('0.0050');
  });
  it('rangeFromSeries', () => {
    const s = emptyCandleSeriesDTO({
      bars: [
        { tUtcMs: 1, o: 1, h: 5, l: 1, c: 2, v: 0 },
        { tUtcMs: 2, o: 2, h: 6, l: 0.5, c: 3, v: 0 },
      ],
    });
    const r = rangeFromSeries(s);
    expect(r.high).toBe(6);
    expect(r.low).toBe(0.5);
    expect(r.range).toBe(5.5);
    expect(r.lastClose).toBe(3);
  });
});

describe('tdMetrics', () => {
  it('counts twelvedata vs fallback', () => {
    reset();
    bump('t', 'twelvedata');
    bump('t', 'fallback');
    const s = snapshot();
    expect(s.lifetime.twelvedata).toBe(1);
    expect(s.lifetime.fallback).toBe(1);
    reset();
  });
});

describe('tdRateLimiter stats', () => {
  it('exports config', () => {
    const st = stats();
    expect(typeof st.maxRpm).toBe('number');
    expect(typeof st.maxConcurrent).toBe('number');
    expect(st.inFlight).toBe(0);
  });
});

describe('marketStreamProvider', () => {
  it('default is noop', async () => {
    const p = getMarketStreamProvider();
    expect(p instanceof NoopMarketStreamProvider).toBe(true);
    await p.onOhlcvBarsWritten({ canonicalSymbol: 'EURUSD', intervalKey: '1day', barCount: 1 });
    await p.onAssetPricesPersisted({ symbols: ['EURUSD'], rowCount: 1 });
  });
});

describe('symbol-registry UK', () => {
  const { toCanonical, forProvider, isUkListedEquity } = require('../api/ai/utils/symbol-registry');
  it('maps Twelve Data LSE symbol to canonical .L', () => {
    expect(toCanonical('VOD:LSE')).toBe('VOD.L');
    expect(forProvider('VOD.L', 'twelvedata')).toBe('VOD:LSE');
    expect(isUkListedEquity('VOD.L')).toBe(true);
  });
  it('preserves dot suffix for unknown LSE tickers', () => {
    expect(toCanonical('ABCD.L')).toBe('ABCD.L');
  });
});

describe('symbol-registry Cboe Europe UK (BCXE)', () => {
  const { toCanonical, forProvider, isCboeEuropeUkListedEquity, isUkListedEquity } = require('../api/ai/utils/symbol-registry');
  it('maps Twelve Data BCXE symbol to canonical .BCXE and provider round-trip', () => {
    expect(toCanonical('VOD:BCXE')).toBe('VOD.BCXE');
    expect(forProvider('VOD.BCXE', 'twelvedata')).toBe('VOD:BCXE');
    expect(isCboeEuropeUkListedEquity('VOD.BCXE')).toBe(true);
    expect(isUkListedEquity('VOD.BCXE')).toBe(false);
  });
});

describe('symbol-registry Cboe Australia (CXAC)', () => {
  const {
    toCanonical,
    forProvider,
    isCboeAustraliaListedEquity,
    isAsxListedEquity,
  } = require('../api/ai/utils/symbol-registry');
  it('maps Twelve Data CXAC symbol to canonical .CXAC and does not treat as ASX', () => {
    expect(toCanonical('BHP:CXAC')).toBe('BHP.CXAC');
    expect(forProvider('BHP.CXAC', 'twelvedata')).toBe('BHP:CXAC');
    expect(isCboeAustraliaListedEquity('BHP.CXAC')).toBe(true);
    expect(isAsxListedEquity('BHP.CXAC')).toBe(false);
    expect(toCanonical('BHP:ASX')).toBe('BHP.AX');
    expect(isAsxListedEquity('BHP.AX')).toBe(true);
    expect(isCboeAustraliaListedEquity('BHP.AX')).toBe(false);
  });
});

describe('venture regional markets', () => {
  const {
    toCanonical,
    resolveVentureCategoryId,
    getResolvedSymbol,
    isVentureRegionalEquity,
  } = require('../api/ai/utils/symbol-registry');
  const { getCategory } = require('../api/market-data/twelve-data-framework/registry');
  const { resolveCategoryId } = require('../api/market-data/twelve-data-framework/publicApi');
  it('normalizes Twelve Data XETRA form to canonical .DE', () => {
    expect(toCanonical('VOW:XETRA')).toBe('VOW.DE');
  });
  it('resolves venture category and Twelve Data symbol', () => {
    expect(resolveVentureCategoryId('SAP.DE')).toBe('venture_xetra');
    expect(resolveCategoryId('SAP.DE', null)).toBe('venture_xetra');
    expect(getResolvedSymbol('SAP.DE').twelveDataSymbol).toBe('SAP:XETRA');
  });
  it('excludes venture symbols from US market category', () => {
    const cat = getCategory('us_market');
    expect(cat.supportsSymbol('SAP.DE')).toBe(false);
    expect(cat.supportsSymbol('AAPL')).toBe(true);
  });
  it('treats venture listings as regional equities', () => {
    expect(isVentureRegionalEquity('SHOP.TO')).toBe(true);
  });
});

describe('registry us_market', () => {
  const { listDatasetKeysForCategory, getCategory } = require('../api/market-data/twelve-data-framework/registry');
  const { resolveCategoryId } = require('../api/market-data/twelve-data-framework/publicApi');
  it('resolves US ticker to us_market', () => {
    expect(resolveCategoryId('AAPL', null)).toBe('us_market');
  });
  it('maps legacy us_equities hint to us_market', () => {
    expect(resolveCategoryId('AAPL', 'us_equities')).toBe('us_market');
  });
  it('includes US-only ingest keys at tier 3', () => {
    const keys = listDatasetKeysForCategory('us_market', 3);
    expect(keys.includes('analyst_ratings_us_equities')).toBe(true);
    expect(keys.includes('us_mutual_funds_family')).toBe(true);
    expect(keys.includes('profile')).toBe(true);
  });
  it('skips inherited NASDAQ sample row on us_market cron list', () => {
    const keys = listDatasetKeysForCategory('us_market', 3);
    expect(keys.includes('stocks_reference_sample')).toBe(false);
  });
  it('keeps equity storage category for DB compatibility', () => {
    expect(getCategory('us_market').storageCategory).toBe('equity');
  });
});

describe('ukMarketGuards display', () => {
  const { ukListingPriceDisplayDecimals } = require('../api/market-data/equities/ukMarketGuards');
  it('uses 2 decimals for normal £ handles, 4 only sub-£1', () => {
    expect(ukListingPriceDisplayDecimals('VOD.L', 5.2)).toBe(2);
    expect(ukListingPriceDisplayDecimals('VOD.L', 0.42)).toBe(4);
  });
  it('treats Cboe UK .BCXE like UK listings for sub-£1 precision', () => {
    expect(ukListingPriceDisplayDecimals('VOD.BCXE', 5.2)).toBe(2);
    expect(ukListingPriceDisplayDecimals('VOD.BCXE', 0.42)).toBe(4);
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
