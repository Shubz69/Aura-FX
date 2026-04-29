/* eslint-disable no-console */
const { chromium } = require('@playwright/test');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const counters = {
    sse: 0,
    snapshot: 0,
    chartHistory: 0,
  };
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/market/live-quotes-stream')) counters.sse += 1;
    if (url.includes('/api/markets/snapshot')) counters.snapshot += 1;
    if (url.includes('/api/market/chart-history')) counters.chartHistory += 1;
  });
  page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[LivePrices]') || text.includes('[AuraChart]')) {
      console.log(`[browser] ${text}`);
    }
  });
  await page.addInitScript(() => {
    window.__AURA_API_BASE_URL__ = 'http://localhost:3001';
    localStorage.setItem('auraApiBaseUrlOverride', 'http://localhost:3001');
    localStorage.setItem('token', 'local-qa-token');
    localStorage.setItem('user', JSON.stringify({ id: 9001, role: 'admin', email: 'qa@local.test' }));
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForTimeout(5000);
  await page.goto('http://localhost:3000/trader-deck/trade-validator/trader-lab', { waitUntil: 'networkidle', timeout: 90000 });
  console.log('[idle-sse-check] page opened; idling 5 minutes');
  await page.waitForTimeout(300000);
  console.log('[idle-sse-check] request counters', counters);
  await browser.close();
  console.log('[idle-sse-check] complete');
}

run().catch((err) => {
  console.error('[idle-sse-check] failed', err);
  process.exit(1);
});
