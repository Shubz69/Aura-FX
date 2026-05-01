// @ts-check
/**
 * Production retest: /backtesting/new → Start Replay → workspace + candles.
 *
 * Auth (pick one):
 * - Set AURA_PRODUCTION_LOGIN_EMAIL + AURA_PRODUCTION_LOGIN_PASSWORD (API login before each test), or
 * - Refresh e2e/reports/auraterminal-new-user.json (Playwright storageState) with a valid token.
 *
 * Run:
 *   npx playwright test --config=playwright.backtesting-retest.config.js
 */
import { test, expect, request } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }) => {
  const email = process.env.AURA_PRODUCTION_LOGIN_EMAIL;
  const password = process.env.AURA_PRODUCTION_LOGIN_PASSWORD;
  if (!email || !password) return;

  const api = await request.newContext({ baseURL: 'https://www.auraterminal.ai' });
  const res = await api.post('/api/auth/login', {
    data: {
      email,
      password,
      timezone: 'Etc/UTC',
      preferredLanguage: 'en',
    },
  });
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Login response not JSON (status ${res.status()}).`);
  }
  if (!res.ok()) {
    throw new Error(`Login failed HTTP ${res.status()}: ${data?.message || raw.slice(0, 200)}`);
  }
  if (data.status === 'MFA_REQUIRED' || data.mfaVerified === false) {
    throw new Error('Login requires MFA; use a non-MFA QA account or refreshed storageState.');
  }
  if (!data.token) {
    throw new Error(`Login succeeded but no token: ${data?.message || 'unknown'}`);
  }

  const userLite = JSON.stringify({
    id: data.id ?? data.userId,
    username: data.username || '',
    email: data.email || '',
    name: data.name || data.username || '',
    avatar: data.avatar ?? null,
    role: (data.role || 'USER').toString().toUpperCase(),
    mfaVerified: Boolean(data.mfaVerified),
    level: data.level ?? 1,
    xp: data.xp ?? 0,
  });

  await context.addInitScript(
    ([token, user]) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', user);
      try {
        localStorage.setItem('gdprAccepted', 'true');
      } catch (_) {
        /* ignore */
      }
    },
    [data.token, userLite],
  );

  await api.dispose();
});

test('Quick Start → Start Replay (EURUSD, M15, 2026-01-14 04:12) + network sanity', async ({ page }) => {
  const network = [];

  page.on('response', async (resp) => {
    const url = resp.url();
    if (!/\/api\/backtesting\/(sessions|candles)/.test(url)) return;
    const entry = {
      url,
      status: resp.status(),
      method: resp.request().method(),
    };
    try {
      const ct = resp.headers()['content-type'] || '';
      if (ct.includes('application/json')) {
        const body = await resp.json();
        entry.body = body;
      } else {
        entry.bodyPreview = (await resp.text()).slice(0, 500);
      }
    } catch {
      entry.bodyReadError = true;
    }
    network.push(entry);
  });

  await page.goto('/backtesting/new', { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 500));

  const onLoginRoute = page.url().includes('/login');
  const emailField = page.getByRole('textbox', { name: /email or username/i });
  const loginUi = onLoginRoute || (await emailField.isVisible().catch(() => false));
  if (loginUi) {
    throw new Error(
      'Not authenticated (login page or /login URL). JWT in e2e/reports/auraterminal-new-user.json is likely expired. ' +
        'Re-export storage after signing in, or set AURA_PRODUCTION_LOGIN_EMAIL + AURA_PRODUCTION_LOGIN_PASSWORD for API login, then re-run: ' +
        'npx playwright test --config=playwright.backtesting-retest.config.js',
    );
  }

  await expect(page.locator('.bt-quickstart-grid .bt-input').first()).toBeVisible({ timeout: 30_000 });
  await page.locator('.bt-quickstart-grid .bt-input').first().fill('EURUSD');
  await page.locator('.bt-quickstart-grid .bt-select').first().selectOption('M15');
  await page.locator('.bt-quickstart-grid input[type="datetime-local"]').first().fill('2026-01-14T04:12');

  await page.getByRole('button', { name: 'Start Replay' }).click();

  await expect(page).toHaveURL(/\/backtesting\/session\/[a-f0-9-]{36}/i, { timeout: 120_000 });

  const fivexx = network.filter((r) => r.status >= 500);
  expect(
    fivexx,
    fivexx.length ? `Unexpected 5xx:\n${JSON.stringify(fivexx, null, 2)}` : '',
  ).toEqual([]);

  const hadSessions = network.some((r) => /\/api\/backtesting\/sessions/.test(r.url));
  const hadCandles = network.some((r) => /\/api\/backtesting\/candles/.test(r.url));
  expect(hadSessions, 'Expected at least one /api/backtesting/sessions request').toBe(true);
  expect(hadCandles, 'Expected /api/backtesting/candles request after workspace load').toBe(true);

  const badJson = network.filter((r) => {
    const b = r.body;
    return b && typeof b === 'object' && b.success === false && r.status >= 400;
  });
  expect(
    badJson.filter((r) => r.status >= 500),
    JSON.stringify(badJson.filter((r) => r.status >= 500), null, 2),
  ).toEqual([]);

  await expect(page.locator('.bt-replay-chart canvas').first()).toBeVisible({ timeout: 120_000 });

  const play = page.getByRole('button', { name: /^Play$/i });
  if (await play.isVisible().catch(() => false)) {
    await play.click();
    await new Promise((r) => setTimeout(r, 800));
    const pause = page.getByRole('button', { name: /^Pause$/i });
    await expect(pause).toBeVisible({ timeout: 15_000 });
  }
});
