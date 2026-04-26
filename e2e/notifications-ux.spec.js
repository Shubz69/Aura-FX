/**
 * In-app notification UX (toast, dedupe, silent mode, routing helpers).
 * Web Push / service-worker delivery is not exercised end-to-end here (browser automation
 * limits + VAPID); those paths are covered in api/push + public/service-worker.js and can
 * be validated manually on an installed PWA (iOS 16.4+ Home Screen).
 */
import { test, expect } from '@playwright/test';

const BASE = (process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

test.describe('Notifications UX (client helpers)', () => {
  test.beforeAll(async ({ request }) => {
    try {
      const res = await request.get(`${BASE}/`, { timeout: 5000 });
      if (!res.ok() && res.status() >= 500) {
        test.skip(true, `Dev server at ${BASE} returned ${res.status()}`);
      }
    } catch {
      test.skip(true, `Start the app (e.g. npm start) or set PLAYWRIGHT_TEST_BASE_URL — could not reach ${BASE}`);
    }
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('toast dedupes by dedupeKey within the debounce window', async ({ page }) => {
    await page.goto(`${BASE}/?e2eNotify=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(() => {
      localStorage.setItem('user', JSON.stringify({ id: 99, username: 'e2eplayer' }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__AURA_E2E_TRIGGER__ === 'function', null, { timeout: 60000 });
    await page.evaluate(() => {
      window.__AURA_E2E_TRIGGER__('dm', 'Sender', 'Hello there', '/community/demo-ch', 99, { dedupeKey: 'dedupe-a' });
      window.__AURA_E2E_TRIGGER__('dm', 'Sender', 'Hello again', '/community/demo-ch', 99, { dedupeKey: 'dedupe-a' });
    });
    await page.waitForTimeout(900);
    await expect(page.locator('.Toastify__toast--info')).toHaveCount(1);
  });

  test('silent option does not show bottom-right info toast', async ({ page }) => {
    await page.goto(`${BASE}/?e2eNotify=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.evaluate(() => {
      localStorage.setItem('user', JSON.stringify({ id: 101, username: 'silentuser' }));
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.__AURA_E2E_TRIGGER__ === 'function', null, { timeout: 60000 });
    await page.evaluate(() => {
      window.__AURA_E2E_TRIGGER__('dm', 'Muted', 'hidden body', '/messages', 101, {
        silent: true,
        dedupeKey: 'silent-1',
      });
    });
    await page.waitForTimeout(600);
    await expect(page.locator('.Toastify__toast--info')).toHaveCount(0);
  });

  test('navbar horizontal padding uses max() with safe-area (non-zero on desktop)', async ({ page }) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    const padLeft = await page
      .locator('.navbar')
      .evaluate((el) => getComputedStyle(el).paddingLeft)
      .catch(() => '0px');
    expect(parseFloat(padLeft)).toBeGreaterThan(0);
  });
});
