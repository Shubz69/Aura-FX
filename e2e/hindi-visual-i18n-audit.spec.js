/**
 * Hindi (hi) visual smoke: screenshots + body text capture for manual review.
 * Copies saved Playwright storage and sets origin to the local dev server.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const BASE = (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SRC_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');
const ARTIFACT_DIR = path.join(process.cwd(), 'e2e', 'artifacts', 'hindi-i18n-audit');
const LOCAL_STATE = path.join(tmpdir(), 'aura-hindi-audit-storage.json');

function ensureAuthStateForLocalhost() {
  if (!fs.existsSync(SRC_STATE)) return false;
  const raw = JSON.parse(fs.readFileSync(SRC_STATE, 'utf8'));
  if (raw.origins?.[0]) {
    raw.origins[0].origin = BASE;
  }
  fs.mkdirSync(path.dirname(LOCAL_STATE), { recursive: true });
  fs.writeFileSync(LOCAL_STATE, JSON.stringify(raw), 'utf8');
  return true;
}

const hasAuthState = ensureAuthStateForLocalhost();
if (hasAuthState) {
  // eslint-disable-next-line no-empty-pattern -- Playwright API
  test.use({ storageState: LOCAL_STATE });
}

test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('aura_site_language_pref', 'hi');
    } catch {}
  });
});

async function capture(page, name) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`), fullPage: true });
  const text = await page.evaluate(() => document.body?.innerText || '');
  fs.writeFileSync(path.join(ARTIFACT_DIR, `${name}.txt`), text.slice(0, 80000), 'utf8');
}

test.describe('Hindi visual i18n audit', () => {
  test('login', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi', { timeout: 15000 });
    await capture(page, '01-login');
  });

  test('signup', async ({ page }) => {
    await page.goto(`${BASE}/signup`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi', { timeout: 15000 });
    await capture(page, '02-signup');
  });

  test('home', async ({ page }) => {
    await page.goto(`${BASE}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi', { timeout: 15000 });
    await capture(page, '03-home');
  });

  test('profile (authenticated)', async ({ page }) => {
    test.skip(!hasAuthState, 'Missing e2e/reports/auraterminal-normal-user.json');
    await page.goto(`${BASE}/profile`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi', { timeout: 15000 });
    await page.waitForTimeout(2000);
    await capture(page, '04-profile');
  });

  test('community (authenticated)', async ({ page }) => {
    test.skip(!hasAuthState, 'Missing e2e/reports/auraterminal-normal-user.json');
    await page.goto(`${BASE}/community`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi', { timeout: 15000 });
    await page.waitForTimeout(3000);
    await capture(page, '05-community');
  });

  test('trader deck (authenticated)', async ({ page }) => {
    test.skip(!hasAuthState, 'Missing e2e/reports/auraterminal-normal-user.json');
    await page.goto(`${BASE}/trader-deck`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi', { timeout: 15000 });
    await page.waitForTimeout(2000);
    await capture(page, '06-trader-deck');
  });

  test('account menu from navbar', async ({ page }) => {
    test.skip(!hasAuthState, 'Missing e2e/reports/auraterminal-normal-user.json');
    await page.goto(`${BASE}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi', { timeout: 15000 });
    const profileBtn = page.locator('[aria-label="Account"], [data-testid="navbar-account"], a[href*="/profile"]').first();
    const alt = page.getByRole('button', { name: /account|profile|menu/i }).first();
    if (await profileBtn.count()) {
      await profileBtn.click({ timeout: 5000 }).catch(() => {});
    } else if (await alt.count()) {
      await alt.click({ timeout: 5000 }).catch(() => {});
    } else {
      await page.locator('header a[href="/profile"], nav a[href="/profile"]').first().click({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(800);
    await capture(page, '07-account-menu');
  });
});
