/**
 * Candle context API safety checks.
 * Run: node tests/candle-context.test.js
 */
const axios = require('axios');
const handler = require('../api/market/candle-context.js');

let passed = 0;
let failed = 0;
async function it(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    setHeader: () => {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function run() {
  console.log('\ncandle-context endpoint');

  const originalGet = axios.get;
  let calls = 0;
  axios.get = async (url) => {
    calls += 1;
    if (String(url).includes('/economic-calendar')) {
      return { data: { events: [{ event: 'CPI', impact: 'high', timestamp: Date.now(), actual: '3.1', forecast: '3.0' }] } };
    }
    if (String(url).includes('/trader-deck/news')) {
      return { data: { articles: [{ headline: 'USD moves after CPI beat', summary: 'Macro reprice', publishedAt: new Date().toISOString() }] } };
    }
    return { data: {} };
  };

  const reqBase = {
    method: 'GET',
    headers: { host: 'localhost:3001', 'x-forwarded-proto': 'http' },
    query: {
      symbol: 'EURUSD',
      interval: '15',
      candleTime: String(Math.floor(Date.now() / 1000)),
      open: '1.1',
      high: '1.2',
      low: '1.0',
      close: '1.15',
    },
  };

  await it('returns context payload for valid params', async () => {
    const res = makeRes();
    await handler(reqBase, res);
    if (res.statusCode !== 200) throw new Error(`Expected 200, got ${res.statusCode}`);
    if (!res.body?.success) throw new Error('Expected success true');
    if (!res.body?.macroSentiment?.summary) throw new Error('Expected sentiment summary');
  });

  await it('cache hit avoids duplicate upstream calls', async () => {
    const first = makeRes();
    await handler(reqBase, first);
    const callsAfterFirst = calls;
    const second = makeRes();
    await handler(reqBase, second);
    if (!second.body?.cacheHit) throw new Error('Expected cacheHit true');
    if (calls !== callsAfterFirst) throw new Error('Expected no extra upstream calls on cache hit');
  });

  await it('rejects missing symbol', async () => {
    const res = makeRes();
    await handler({ ...reqBase, query: { ...reqBase.query, symbol: '' } }, res);
    if (res.statusCode !== 400) throw new Error(`Expected 400, got ${res.statusCode}`);
  });

  axios.get = originalGet;
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
