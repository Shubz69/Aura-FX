// @ts-check
/**
 * Production retest (hard-refresh after Vercel deploy):
 * /backtesting/new → type "xau" → pick XAUUSD → Start Replay → workspace → Load candles.
 *
 * Network expectations:
 * - POST /api/backtesting/sessions → 201 OR PATCH /api/backtesting/sessions/:id → 200
 * - GET /api/backtesting/sessions/:id → 200
 * - GET /api/backtesting/saved-trades → 200 (Vercel must rewrite to api/backtesting.js)
 * - GET /api/backtesting/candles → 200 after clicking Load
 *
 * Auth (pick one):
 * - AURA_PRODUCTION_LOGIN_EMAIL + AURA_PRODUCTION_LOGIN_PASSWORD (API login before each test), or
 * - Valid e2e/reports/auraterminal-new-user.json storageState.
 *
 * Run:
 *   npx playwright test --config=playwright.backtesting-retest.config.js
 */
import { test, expect, request } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

/** @type {Array<{ url: string; method: string; status: number }>} */
let network;

function pathOf(u) {
  try {
    return new URL(u).pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

test.beforeEach(async ({ context }) => {
  network = [];
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

test('Quick Start: xau → XAUUSD → H1 → Start Replay + network checklist', async ({ page }) => {
  page.on('response', (resp) => {
    const url = resp.url();
    if (!/\/api\/backtesting\/(sessions|candles|saved-trades)/.test(url)) return;
    network.push({
      url,
      method: resp.request().method(),
      status: resp.status(),
    });
  });

  await page.goto('/backtesting/new', { waitUntil: 'load' });

  const emailField = page.getByRole('textbox', { name: /email or username/i });
  const signInHeading = page.getByRole('heading', { name: /^sign in$/i });
  const loginUi =
    /\/(login|sign-in)\b/i.test(page.url()) ||
    (await signInHeading.isVisible({ timeout: 2000 }).catch(() => false)) ||
    (await emailField.isVisible({ timeout: 2000 }).catch(() => false));
  if (loginUi) {
    throw new Error(
      'Not authenticated (sign-in UI). JWT in e2e/reports/auraterminal-new-user.json is likely expired. ' +
        'Re-export storage after signing in, or set AURA_PRODUCTION_LOGIN_EMAIL + AURA_PRODUCTION_LOGIN_PASSWORD for API login, then re-run: ' +
        'npx playwright test --config=playwright.backtesting-retest.config.js',
    );
  }

  const instrumentInput = page.getByLabel('Instrument');
  await expect(instrumentInput).toBeVisible({ timeout: 30_000 });
  await instrumentInput.fill('xau');
  await page.getByRole('option', { name: /XAUUSD/i }).click();

  await page.locator('.bt-quickstart-grid .bt-select').first().selectOption('H1');
  await page.locator('.bt-quickstart-grid input[type="datetime-local"]').first().fill('2026-01-14T04:12');

  await page.getByRole('button', { name: 'Start Replay' }).click();

  await expect(page).toHaveURL(/\/backtesting\/session\/[a-f0-9-]{36}/i, { timeout: 120_000 });

  const fivexx = network.filter((r) => r.status >= 500);
  expect(
    fivexx,
    fivexx.length ? `Unexpected 5xx:\n${JSON.stringify(fivexx, null, 2)}` : '',
  ).toEqual([]);

  const p = (u) => pathOf(u);
  const sessionIdInUrl = page.url().match(/\/backtesting\/session\/([a-f0-9-]{36})/i)?.[1];

  const postSessions = network.filter((r) => r.method === 'POST' && p(r.url) === '/api/backtesting/sessions');
  const patchSessions = network.filter(
    (r) => r.method === 'PATCH' && /^\/api\/backtesting\/sessions\/[a-f0-9-]{36}$/i.test(p(r.url)),
  );
  expect(
    postSessions.some((r) => r.status === 201) || patchSessions.some((r) => r.status === 200),
    `Expected POST /api/backtesting/sessions → 201 (new session) or PATCH → 200 (draft path). post=${JSON.stringify(postSessions)} patch=${JSON.stringify(patchSessions)}`,
  ).toBe(true);
  expect(
    patchSessions.some((r) => r.status === 200),
    `Expected PATCH /api/backtesting/sessions/:id → 200, got: ${JSON.stringify(patchSessions)}`,
  ).toBe(true);

  const sid = sessionIdInUrl ? String(sessionIdInUrl).toLowerCase() : '';
  const getSessionDetail = network.filter(
    (r) => r.method === 'GET' && sid && p(r.url).toLowerCase() === `/api/backtesting/sessions/${sid}`,
  );
  expect(
    getSessionDetail.some((r) => r.status === 200),
    `Expected GET /api/backtesting/sessions/:id → 200 (id ${sid}), got: ${JSON.stringify(getSessionDetail)}`,
  ).toBe(true);

  const getSaved = network.filter((r) => r.method === 'GET' && p(r.url) === '/api/backtesting/saved-trades');
  expect(
    getSaved.some((r) => r.status === 200),
    `Expected GET /api/backtesting/saved-trades → 200 (not 404; add vercel rewrite). Got: ${JSON.stringify(getSaved)}`,
  ).toBe(true);

  await page.getByRole('button', { name: /^Load$/i }).click();

  await expect
    .poll(
      () => network.some((r) => r.method === 'GET' && p(r.url) === '/api/backtesting/candles' && r.status === 200),
      { message: 'Expected GET /api/backtesting/candles → 200 after Load', timeout: 120_000 },
    )
    .toBe(true);

  const candlesBad = network.filter((r) => p(r.url) === '/api/backtesting/candles' && r.status !== 200);
  expect(candlesBad, JSON.stringify(candlesBad)).toEqual([]);

  await expect(page.locator('.bt-replay-chart canvas').first()).toBeVisible({ timeout: 120_000 });

  const play = page.getByRole('button', { name: /^Play$/i });
  if (await play.isVisible().catch(() => false)) {
    await play.click();
    await new Promise((r) => setTimeout(r, 800));
    const pause = page.getByRole('button', { name: /^Pause$/i });
    await expect(pause).toBeVisible({ timeout: 15_000 });
  }
});
