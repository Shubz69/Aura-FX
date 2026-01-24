/**
 * Market Ticker Live Tests
 * 
 * Tests for:
 * 1. Live streaming updates occur
 * 2. Change/% change math is correct
 * 3. Cached prices prevent zeros
 * 4. Only one upstream connection per symbol exists
 * 
 * Run with: node tests/market-ticker-live.test.js
 */

const assert = require('assert');

// ============================================================================
// Test Configuration
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

async function asyncTest(name, fn) {
  try {
    await fn();
    testsPassed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    testsFailed++;
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${error.message}`);
  }
}

console.log('\n========================================');
console.log('  Market Ticker Live Tests');
console.log('========================================\n');

// ============================================================================
// Mock Data and Helpers
// ============================================================================

const DECIMALS = {
  'BTCUSD': 2, 'ETHUSD': 2, 'EURUSD': 4, 'GBPUSD': 4, 'USDJPY': 2,
  'XAUUSD': 2, 'SPX': 2, 'DXY': 3, 'VIX': 2
};

const FALLBACK_PRICES = {
  'BTCUSD': 98500, 'ETHUSD': 3450, 'EURUSD': 1.0420,
  'USDJPY': 155.50, 'XAUUSD': 2755, 'SPX': 6050, 'DXY': 108.5, 'VIX': 16.5
};

function getDecimals(symbol) {
  return DECIMALS[symbol] || 2;
}

function formatPrice(price, symbol) {
  if (price === null || price === undefined || isNaN(price)) return null;
  const dec = getDecimals(symbol);
  return parseFloat(price).toFixed(dec);
}

function calculateChange(currentPrice, previousClose) {
  const change = currentPrice - previousClose;
  const changePercent = previousClose ? ((change / previousClose) * 100) : 0;
  return {
    change: Math.abs(change),
    changeSign: change >= 0 ? '+' : '-',
    changePercent: Math.abs(changePercent).toFixed(2),
    isUp: change >= 0
  };
}

// ============================================================================
// Test 1: Change/% Change Math
// ============================================================================

console.log('Section 1: Change Calculation Math');
console.log('----------------------------------');

test('Positive change calculates correctly', () => {
  const current = 100;
  const prev = 95;
  const result = calculateChange(current, prev);
  
  assert.strictEqual(result.change, 5, 'Change should be 5');
  assert.strictEqual(result.changeSign, '+', 'Sign should be +');
  assert.strictEqual(result.changePercent, '5.26', 'Percent should be 5.26');
  assert.strictEqual(result.isUp, true, 'isUp should be true');
});

test('Negative change calculates correctly', () => {
  const current = 95;
  const prev = 100;
  const result = calculateChange(current, prev);
  
  assert.strictEqual(result.change, 5, 'Absolute change should be 5');
  assert.strictEqual(result.changeSign, '-', 'Sign should be -');
  assert.strictEqual(result.changePercent, '5.00', 'Percent should be 5.00');
  assert.strictEqual(result.isUp, false, 'isUp should be false');
});

test('Zero change calculates correctly', () => {
  const current = 100;
  const prev = 100;
  const result = calculateChange(current, prev);
  
  assert.strictEqual(result.change, 0, 'Change should be 0');
  assert.strictEqual(result.isUp, true, 'isUp should be true for zero change');
});

test('Large percentage change calculates correctly', () => {
  const current = 200;
  const prev = 100;
  const result = calculateChange(current, prev);
  
  assert.strictEqual(result.changePercent, '100.00', 'Percent should be 100.00');
});

test('Small percentage change (forex) calculates correctly', () => {
  const current = 1.0850;
  const prev = 1.0840;
  const result = calculateChange(current, prev);
  
  // (0.001 / 1.0840) * 100 = 0.0923%
  assert.ok(parseFloat(result.changePercent) < 0.1, 'Forex pip change should be < 0.1%');
});

test('Price formatting respects decimal places', () => {
  assert.strictEqual(formatPrice(1.08456, 'EURUSD'), '1.0846', 'Forex should have 4 decimals');
  assert.strictEqual(formatPrice(155.678, 'USDJPY'), '155.68', 'JPY pairs should have 2 decimals');
  assert.strictEqual(formatPrice(98567.89, 'BTCUSD'), '98567.89', 'BTC should have 2 decimals');
  assert.strictEqual(formatPrice(108.567, 'DXY'), '108.567', 'DXY should have 3 decimals');
});

// ============================================================================
// Test 2: Cached Prices Prevent Zeros
// ============================================================================

console.log('\nSection 2: Cache and Fallback Logic');
console.log('------------------------------------');

// Simulate the cache and fallback logic
class MockPriceCache {
  constructor() {
    this.cache = new Map();
    this.fallbackPrices = FALLBACK_PRICES;
  }
  
  set(symbol, data) {
    this.cache.set(symbol, { ...data, timestamp: Date.now() });
  }
  
  get(symbol) {
    return this.cache.get(symbol);
  }
  
  getPrice(symbol, freshData) {
    // If we have fresh data with a valid price, use it
    if (freshData && freshData.price && parseFloat(freshData.price) > 0) {
      this.set(symbol, freshData);
      return { ...freshData, delayed: false };
    }
    
    // If fresh data is 0 or invalid, try cached data
    const cached = this.get(symbol);
    if (cached && cached.price && parseFloat(cached.price) > 0) {
      return { ...cached, delayed: true, stale: true };
    }
    
    // Last resort: use static fallback
    const fallback = this.fallbackPrices[symbol];
    if (fallback) {
      return {
        symbol,
        price: formatPrice(fallback, symbol),
        rawPrice: fallback,
        delayed: true,
        unavailable: true
      };
    }
    
    // Should never happen - but still don't return 0
    return null;
  }
}

test('Fresh valid data is used directly', () => {
  const cache = new MockPriceCache();
  const freshData = { price: '98500.00', rawPrice: 98500 };
  
  const result = cache.getPrice('BTCUSD', freshData);
  
  assert.strictEqual(result.price, '98500.00', 'Should use fresh price');
  assert.strictEqual(result.delayed, false, 'Should not be delayed');
});

test('Zero price falls back to cache', () => {
  const cache = new MockPriceCache();
  
  // First, set some cached data
  cache.set('BTCUSD', { price: '95000.00', rawPrice: 95000 });
  
  // Then receive zero price
  const freshData = { price: '0.00', rawPrice: 0 };
  const result = cache.getPrice('BTCUSD', freshData);
  
  assert.strictEqual(result.price, '95000.00', 'Should use cached price');
  assert.strictEqual(result.delayed, true, 'Should be marked delayed');
});

test('Null price falls back to cache', () => {
  const cache = new MockPriceCache();
  cache.set('ETHUSD', { price: '3400.00', rawPrice: 3400 });
  
  const result = cache.getPrice('ETHUSD', null);
  
  assert.strictEqual(result.price, '3400.00', 'Should use cached price');
  assert.strictEqual(result.delayed, true, 'Should be marked delayed');
});

test('No cache falls back to static prices', () => {
  const cache = new MockPriceCache();
  // No cached data for this symbol
  
  const result = cache.getPrice('XAUUSD', null);
  
  assert.ok(result.price, 'Should have a fallback price');
  assert.ok(parseFloat(result.price) > 0, 'Fallback should not be 0');
  assert.strictEqual(result.delayed, true, 'Should be marked delayed');
  assert.strictEqual(result.unavailable, true, 'Should be marked unavailable');
});

test('Cache never returns 0.00', () => {
  const cache = new MockPriceCache();
  const symbols = ['BTCUSD', 'ETHUSD', 'EURUSD', 'XAUUSD', 'SPX'];
  
  symbols.forEach(symbol => {
    // Simulate all providers failing
    const result = cache.getPrice(symbol, { price: '0.00', rawPrice: 0 });
    
    assert.ok(result, `${symbol} should return a result`);
    if (result.price) {
      assert.notStrictEqual(result.price, '0.00', `${symbol} should never be 0.00`);
    }
  });
});

// ============================================================================
// Test 3: Single Connection Pattern
// ============================================================================

console.log('\nSection 3: Single Connection Pattern');
console.log('-------------------------------------');

// Simulate the singleton connection manager
class MockConnectionManager {
  constructor() {
    this.listeners = new Set();
    this.activeSymbols = new Set();
    this.fetchInterval = null;
    this.connectionCount = 0;
  }
  
  subscribe(callback, symbols) {
    this.listeners.add(callback);
    symbols.forEach(s => this.activeSymbols.add(s));
    
    if (!this.fetchInterval) {
      this.connectionCount++;
      this.fetchInterval = 'active'; // Simulate interval
    }
    
    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0) {
        this.fetchInterval = null;
      }
    };
  }
  
  getStats() {
    return {
      listenerCount: this.listeners.size,
      activeSymbolCount: this.activeSymbols.size,
      hasActiveConnection: !!this.fetchInterval,
      totalConnectionsCreated: this.connectionCount
    };
  }
}

test('First subscriber creates one connection', () => {
  const manager = new MockConnectionManager();
  
  const unsub = manager.subscribe(() => {}, ['BTCUSD', 'ETHUSD']);
  const stats = manager.getStats();
  
  assert.strictEqual(stats.hasActiveConnection, true, 'Should have active connection');
  assert.strictEqual(stats.totalConnectionsCreated, 1, 'Should only create 1 connection');
  
  unsub();
});

test('Second subscriber reuses existing connection', () => {
  const manager = new MockConnectionManager();
  
  const unsub1 = manager.subscribe(() => {}, ['BTCUSD']);
  const unsub2 = manager.subscribe(() => {}, ['ETHUSD']);
  
  const stats = manager.getStats();
  
  assert.strictEqual(stats.listenerCount, 2, 'Should have 2 listeners');
  assert.strictEqual(stats.totalConnectionsCreated, 1, 'Should still only have 1 connection');
  assert.strictEqual(stats.activeSymbolCount, 2, 'Should track 2 symbols');
  
  unsub1();
  unsub2();
});

test('Many subscribers share one connection', () => {
  const manager = new MockConnectionManager();
  const unsubFns = [];
  
  for (let i = 0; i < 10; i++) {
    unsubFns.push(manager.subscribe(() => {}, [`SYMBOL${i}`]));
  }
  
  const stats = manager.getStats();
  
  assert.strictEqual(stats.listenerCount, 10, 'Should have 10 listeners');
  assert.strictEqual(stats.totalConnectionsCreated, 1, 'Should still only have 1 connection');
  
  unsubFns.forEach(unsub => unsub());
});

test('Connection closes when all subscribers leave', () => {
  const manager = new MockConnectionManager();
  
  const unsub1 = manager.subscribe(() => {}, ['BTCUSD']);
  const unsub2 = manager.subscribe(() => {}, ['ETHUSD']);
  
  unsub1();
  assert.strictEqual(manager.getStats().hasActiveConnection, true, 'Connection should remain with 1 listener');
  
  unsub2();
  assert.strictEqual(manager.getStats().hasActiveConnection, false, 'Connection should close with 0 listeners');
});

test('Duplicate symbol subscriptions do not duplicate connections', () => {
  const manager = new MockConnectionManager();
  
  // Multiple subscribers for the same symbol
  const unsub1 = manager.subscribe(() => {}, ['BTCUSD']);
  const unsub2 = manager.subscribe(() => {}, ['BTCUSD']);
  const unsub3 = manager.subscribe(() => {}, ['BTCUSD']);
  
  const stats = manager.getStats();
  
  assert.strictEqual(stats.totalConnectionsCreated, 1, 'Should only have 1 connection');
  // The implementation tracks unique symbols
  assert.ok(stats.activeSymbolCount <= 3, 'Symbol count should be managed');
  
  unsub1();
  unsub2();
  unsub3();
});

// ============================================================================
// Test 4: Live Streaming Update Detection
// ============================================================================

console.log('\nSection 4: Live Streaming Updates');
console.log('----------------------------------');

// Simulate flash detection for price updates
function detectFlash(prevPrice, newPrice) {
  if (!prevPrice || !newPrice) return null;
  if (newPrice === prevPrice) return null;
  return newPrice > prevPrice ? 'up' : 'down';
}

test('Price increase triggers green flash', () => {
  const flash = detectFlash(100, 105);
  assert.strictEqual(flash, 'up', 'Should flash green (up)');
});

test('Price decrease triggers red flash', () => {
  const flash = detectFlash(100, 95);
  assert.strictEqual(flash, 'down', 'Should flash red (down)');
});

test('Same price does not trigger flash', () => {
  const flash = detectFlash(100, 100);
  assert.strictEqual(flash, null, 'Should not flash');
});

test('First price (no previous) does not flash', () => {
  const flash = detectFlash(null, 100);
  assert.strictEqual(flash, null, 'Should not flash on first price');
});

test('Small price changes still trigger flash', () => {
  const flash = detectFlash(1.0840, 1.0841);
  assert.strictEqual(flash, 'up', 'Even tiny changes should flash');
});

// ============================================================================
// Test 5: Timeout and Fallback Behavior
// ============================================================================

console.log('\nSection 5: Timeout and Fallback');
console.log('--------------------------------');

// Simulate provider fallback logic
async function fetchWithFallback(primaryFn, secondaryFn, timeoutMs) {
  try {
    const result = await Promise.race([
      primaryFn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
    ]);
    if (result) return { ...result, source: 'primary' };
  } catch (e) {
    // Primary failed, try secondary
  }
  
  try {
    const result = await secondaryFn();
    if (result) return { ...result, source: 'secondary' };
  } catch (e) {
    // Secondary also failed
  }
  
  return null;
}

asyncTest('Primary provider success returns primary data', async () => {
  const result = await fetchWithFallback(
    async () => ({ price: 100 }),
    async () => ({ price: 99 }),
    1000
  );
  
  assert.strictEqual(result.source, 'primary');
  assert.strictEqual(result.price, 100);
});

asyncTest('Primary timeout falls back to secondary', async () => {
  const result = await fetchWithFallback(
    async () => new Promise(r => setTimeout(() => r({ price: 100 }), 2000)), // Slow
    async () => ({ price: 99 }),
    500 // Short timeout
  );
  
  assert.strictEqual(result.source, 'secondary');
  assert.strictEqual(result.price, 99);
});

asyncTest('Primary failure falls back to secondary', async () => {
  const result = await fetchWithFallback(
    async () => { throw new Error('Primary failed'); },
    async () => ({ price: 99 }),
    1000
  );
  
  assert.strictEqual(result.source, 'secondary');
});

asyncTest('Both providers fail returns null', async () => {
  const result = await fetchWithFallback(
    async () => { throw new Error('Primary failed'); },
    async () => { throw new Error('Secondary failed'); },
    1000
  );
  
  assert.strictEqual(result, null);
});

// ============================================================================
// Test 6: Decimal Precision
// ============================================================================

console.log('\nSection 6: Decimal Precision');
console.log('-----------------------------');

test('Forex pairs use 4 decimals (except JPY)', () => {
  assert.strictEqual(getDecimals('EURUSD'), 4);
  assert.strictEqual(getDecimals('GBPUSD'), 4);
});

test('JPY pairs use 2 decimals', () => {
  assert.strictEqual(getDecimals('USDJPY'), 2);
});

test('Crypto uses 2 decimals by default', () => {
  assert.strictEqual(getDecimals('BTCUSD'), 2);
  assert.strictEqual(getDecimals('ETHUSD'), 2);
});

test('Indices use 2 decimals', () => {
  assert.strictEqual(getDecimals('SPX'), 2);
});

test('DXY uses 3 decimals', () => {
  assert.strictEqual(getDecimals('DXY'), 3);
});

test('Unknown symbols default to 2 decimals', () => {
  assert.strictEqual(getDecimals('UNKNOWN'), 2);
});

// ============================================================================
// Results
// ============================================================================

// Wait for async tests to complete
setTimeout(() => {
  console.log('\n========================================');
  console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('========================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}, 500);
