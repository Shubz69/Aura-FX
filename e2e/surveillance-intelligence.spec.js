import { test, expect } from '@playwright/test';

const BASE = (process.env.AUDIT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function qaToken() {
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(
    JSON.stringify({ id: 9001, userId: 9001, role: 'admin', email: 'qa@local.test', exp: now + 3600 })
  ).toString('base64url');
  return `${h}.${p}.x`;
}

async function dismissConsentIfPresent(page) {
  const backdrop = page.locator('.gdpr-backdrop');
  if (!(await backdrop.isVisible().catch(() => false))) return;
  const consent = page
    .locator('button:has-text("Accept"), button:has-text("Agree"), button:has-text("Allow"), button:has-text("Got it"), button:has-text("Dismiss"), button:has-text("I Agree")')
    .first();
  if (await consent.isVisible().catch(() => false)) await consent.click({ timeout: 5000 }).catch(() => {});
}

test.describe('Surveillance intelligence UX', () => {
  test('renders fallback markers and country intelligence panel', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.addInitScript((token) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify({ id: 9001, userId: 9001, role: 'admin' }));
      localStorage.setItem('gdprAccepted', 'true');
    }, qaToken());

    await page.route('**/api/surveillance/bootstrap', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          showIntro: false,
          events: [],
          aggregates: { liveCount: 0, globalTensionScore: 0, marketWatch: [], countsByType: {} },
          intelDigest: {
            regionPressure: [{ region: 'AE', score: 180, rank: 1, label: 'Hot' }],
          },
          pairHeat: [],
          sources: [],
          countryWireAvailable: false,
        }),
      });
    });

    await page.route('**/api/surveillance/feed**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          events: [],
          aggregates: { liveCount: 0, globalTensionScore: 0, marketWatch: [], countsByType: {} },
          intelDigest: {
            regionPressure: [{ region: 'AE', score: 180, rank: 1, label: 'Hot' }],
          },
          pairHeat: [],
          countryHeadlines: [],
          countryWireAvailable: false,
        }),
      });
    });

    await page.goto(`${BASE}/surveillance`, { waitUntil: 'domcontentloaded' });
    await dismissConsentIfPresent(page);

    await expect(page.getByText('Surveillance')).toBeVisible();
    await expect(page.getByText('Using simulated intelligence due to limited live feed', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('Global summary')).toBeVisible();
    await expect(page.getByText('Live data confidence:', { exact: false }).first()).toBeVisible();

    await page.getByRole('button', { name: /AE/i }).first().click({ force: true });
    await expect(page.getByText('Country intelligence')).toBeVisible();
    await expect(page.getByText('Market Impact Score:', { exact: false })).toBeVisible();
    await expect(page.getByText('What traders should watch:', { exact: false })).toBeVisible();

    await page.locator('.sv-tape-row').first().click();
    await expect(page.getByRole('dialog', { name: 'Event detail' })).toBeVisible();
    await expect(page.getByText('Market Impact Score', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Immediate market reaction' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Trade setup ideas' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Event detail' }).getByText('Scenario-based, not financial advice.')).toBeVisible();
    expect(consoleErrors.some((line) => /chunkloaderror/i.test(line))).toBeFalsy();
  });
});
