/* eslint-disable no-console */
const { chromium } = require('@playwright/test');

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__AURA_API_BASE_URL__ = 'http://localhost:3001';
    localStorage.setItem('auraApiBaseUrlOverride', 'http://localhost:3001');
    localStorage.setItem('token', 'local-qa-token');
    localStorage.setItem('user', JSON.stringify({ id: 9001, role: 'admin', email: 'qa@local.test' }));
  });
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.log('[idle-sse-check] page opened; idling 5 minutes');
  await page.waitForTimeout(300000);
  await browser.close();
  console.log('[idle-sse-check] complete');
}

run().catch((err) => {
  console.error('[idle-sse-check] failed', err);
  process.exit(1);
});
