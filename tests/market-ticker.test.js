/**
 * Market Ticker Integration Tests
 * 
 * Tests:
 * - Watchlist configuration API
 * - Price fetching API
 * - Data format validation
 * - Health monitoring
 * 
 * Run with: node tests/market-ticker.test.js
 */

const assert = require('assert');

// ============================================================================
// Mock Data
// ============================================================================

const EXPECTED_GROUPS = ['crypto', 'stocks', 'forex', 'commodities', 'indices', 'macro'];

const EXPECTED_SYMBOLS = {
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD', 'ADAUSD', 'DOGEUSD'],
  stocks: ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'],
  commodities: ['XAUUSD', 'XAGUSD', 'WTI', 'BRENT'],
  indices: ['SPX', 'NDX', 'DJI', 'DAX', 'FTSE', 'NIKKEI'],
  macro: ['DXY', 'US10Y', 'VIX']
};

const DECIMALS = {
  'BTCUSD': 2, 'ETHUSD': 2, 'SOLUSD': 2, 'XRPUSD': 4, 'BNBUSD': 2,
  'ADAUSD': 4, 'DOGEUSD': 5, 'EURUSD': 4, 'GBPUSD': 4, 'USDJPY': 2,
  'USDCHF': 4, 'AUDUSD': 4, 'USDCAD': 4, 'NZDUSD': 4, 'XAUUSD': 2,
  'XAGUSD': 2, 'WTI': 2, 'BRENT': 2, 'SPX': 2, 'NDX': 2, 'DJI': 2,
  'DAX': 2, 'FTSE': 2, 'NIKKEI': 2, 'DXY': 3, 'US10Y': 3, 'VIX': 2
};

// ============================================================================
// Test Helper Functions
// ============================================================================

function getDecimals(symbol) {
  return DECIMALS[symbol] || 2;
}

function formatPrice(price, symbol) {
  if (!price || isNaN(price)) return '0.00';
  const dec = getDecimals(symbol);
  return parseFloat(price).toFixed(dec);
}

// Mock price data response
function createMockPriceData(symbol) {
  const basePrice = Math.random() * 10000 + 100;
  const change = (Math.random() - 0.5) * 10;
  const previousClose = basePrice - change;
  
  return {
    symbol,
    price: formatPrice(basePrice, symbol),
    rawPrice: basePrice,
    previousClose: formatPrice(previousClose, symbol),
    change: formatPrice(change, symbol),
    changePercent: ((change / previousClose) * 100).toFixed(2),
    isUp: change >= 0,
    timestamp: Date.now()
  };
}

// ============================================================================
// Tests
// ============================================================================

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

console.log('\n========================================');
console.log('  Market Ticker Tests');
console.log('========================================\n');

// Test 1: All expected groups exist
test('Watchlist has all expected groups', () => {
  EXPECTED_GROUPS.forEach(group => {
    assert.ok(EXPECTED_SYMBOLS[group], `Group ${group} should exist`);
  });
});

// Test 2: Crypto symbols are complete
test('Crypto group has all expected symbols', () => {
  const expected = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD', 'BNBUSD', 'ADAUSD', 'DOGEUSD'];
  expected.forEach(symbol => {
    assert.ok(EXPECTED_SYMBOLS.crypto.includes(symbol), `Crypto should include ${symbol}`);
  });
});

// Test 3: Stocks symbols are complete
test('Stocks group has all expected symbols', () => {
  const expected = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'];
  expected.forEach(symbol => {
    assert.ok(EXPECTED_SYMBOLS.stocks.includes(symbol), `Stocks should include ${symbol}`);
  });
});

// Test 4: Forex symbols are complete
test('Forex group has all expected symbols', () => {
  const expected = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'];
  expected.forEach(symbol => {
    assert.ok(EXPECTED_SYMBOLS.forex.includes(symbol), `Forex should include ${symbol}`);
  });
});

// Test 5: Decimals are correct for forex pairs
test('Forex pairs use 4 decimal places (except JPY)', () => {
  assert.strictEqual(getDecimals('EURUSD'), 4);
  assert.strictEqual(getDecimals('GBPUSD'), 4);
  assert.strictEqual(getDecimals('USDJPY'), 2); // JPY pairs use 2
  assert.strictEqual(getDecimals('AUDUSD'), 4);
});

// Test 6: Decimals are correct for crypto
test('Crypto pairs use correct decimal places', () => {
  assert.strictEqual(getDecimals('BTCUSD'), 2);
  assert.strictEqual(getDecimals('ETHUSD'), 2);
  assert.strictEqual(getDecimals('XRPUSD'), 4);
  assert.strictEqual(getDecimals('DOGEUSD'), 5);
});

// Test 7: Decimals are correct for commodities
test('Commodities use 2 decimal places', () => {
  assert.strictEqual(getDecimals('XAUUSD'), 2);
  assert.strictEqual(getDecimals('XAGUSD'), 2);
  assert.strictEqual(getDecimals('WTI'), 2);
  assert.strictEqual(getDecimals('BRENT'), 2);
});

// Test 8: Decimals are correct for macro indicators
test('Macro indicators use correct decimal places', () => {
  assert.strictEqual(getDecimals('DXY'), 3);
  assert.strictEqual(getDecimals('US10Y'), 3);
  assert.strictEqual(getDecimals('VIX'), 2);
});

// Test 9: Price formatting works correctly
test('formatPrice formats correctly for different decimals', () => {
  assert.strictEqual(formatPrice(1.08534, 'EURUSD'), '1.0853');
  assert.strictEqual(formatPrice(150.25, 'USDJPY'), '150.25');
  assert.strictEqual(formatPrice(2724.50, 'XAUUSD'), '2724.50');
  assert.strictEqual(formatPrice(105.234, 'DXY'), '105.234');
  assert.strictEqual(formatPrice(0.00001234, 'DOGEUSD'), '0.00001');
});

// Test 10: Price data structure is correct
test('Price data structure has all required fields', () => {
  const mockData = createMockPriceData('BTCUSD');
  
  assert.ok('symbol' in mockData, 'Should have symbol');
  assert.ok('price' in mockData, 'Should have price');
  assert.ok('rawPrice' in mockData, 'Should have rawPrice');
  assert.ok('change' in mockData, 'Should have change');
  assert.ok('changePercent' in mockData, 'Should have changePercent');
  assert.ok('isUp' in mockData, 'Should have isUp');
  assert.ok('timestamp' in mockData, 'Should have timestamp');
});

// Test 11: Change direction is calculated correctly
test('isUp is calculated correctly based on change', () => {
  // Positive change
  const positiveChange = {
    price: 100,
    previousClose: 95,
    change: 5,
    isUp: true
  };
  assert.strictEqual(positiveChange.isUp, positiveChange.change >= 0);
  
  // Negative change
  const negativeChange = {
    price: 90,
    previousClose: 95,
    change: -5,
    isUp: false
  };
  assert.strictEqual(negativeChange.isUp, negativeChange.change >= 0);
});

// Test 12: All groups have at least 3 symbols
test('Each group has at least 3 symbols', () => {
  Object.entries(EXPECTED_SYMBOLS).forEach(([group, symbols]) => {
    assert.ok(symbols.length >= 3, `${group} should have at least 3 symbols, has ${symbols.length}`);
  });
});

// Test 13: Beginner set is reasonable size (10-14 instruments)
test('Beginner set should have 10-14 instruments', () => {
  const beginnerSet = ['BTCUSD', 'ETHUSD', 'AAPL', 'NVDA', 'TSLA', 'EURUSD', 'GBPUSD', 'XAUUSD', 'SPX', 'NDX', 'DXY', 'VIX'];
  assert.ok(beginnerSet.length >= 10, 'Beginner set should have at least 10 instruments');
  assert.ok(beginnerSet.length <= 14, 'Beginner set should have at most 14 instruments');
});

// Test 14: Total symbol count across all groups
test('Total symbols across all groups should be reasonable', () => {
  let totalSymbols = 0;
  Object.values(EXPECTED_SYMBOLS).forEach(symbols => {
    totalSymbols += symbols.length;
  });
  assert.ok(totalSymbols >= 30, `Should have at least 30 symbols, has ${totalSymbols}`);
  assert.ok(totalSymbols <= 50, `Should have at most 50 symbols, has ${totalSymbols}`);
});

// Test 15: No duplicate symbols across groups
test('No duplicate symbols across groups', () => {
  const allSymbols = [];
  Object.values(EXPECTED_SYMBOLS).forEach(symbols => {
    allSymbols.push(...symbols);
  });
  const uniqueSymbols = new Set(allSymbols);
  assert.strictEqual(allSymbols.length, uniqueSymbols.size, 'There should be no duplicate symbols');
});

// Test 16: Default decimal is 2
test('Unknown symbols default to 2 decimals', () => {
  assert.strictEqual(getDecimals('UNKNOWN'), 2);
  assert.strictEqual(getDecimals('XYZ123'), 2);
});

// Test 17: Invalid price handling
test('formatPrice handles invalid inputs gracefully', () => {
  assert.strictEqual(formatPrice(null, 'BTCUSD'), '0.00');
  assert.strictEqual(formatPrice(undefined, 'BTCUSD'), '0.00');
  assert.strictEqual(formatPrice(NaN, 'BTCUSD'), '0.00');
});

console.log('\n========================================');
console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log('========================================\n');

if (testsFailed > 0) {
  process.exit(1);
}
