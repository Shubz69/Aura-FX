import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const USER_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');
const SIGNUP_CREDS = path.join(process.cwd(), 'e2e', 'reports', 'signup-credentials.txt');

function readSignupCredentials() {
  if (!fs.existsSync(SIGNUP_CREDS)) return null;
  const out = {};
  for (const line of fs.readFileSync(SIGNUP_CREDS, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  if (!out.EMAIL || !out.PASSWORD) return null;
  return { email: out.EMAIL, password: out.PASSWORD };
}

async function dismissConsentIfPresent(page) {
  const backdrop = page.locator('.gdpr-backdrop');
  if (!(await backdrop.isVisible().catch(() => false))) return;
  const consent = page.locator('button:has-text("Accept"), button:has-text("Agree"), button:has-text("Allow"), button:has-text("Got it"), button:has-text("Dismiss")').first();
  if (await consent.isVisible().catch(() => false)) await consent.click({ timeout: 5000 }).catch(() => {});
}

async function ensureNormalUserAuth(browser) {
  const ctx = await browser.newContext({ storageState: USER_STATE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
  const channelsVisible = await page.locator('.channel-name').first().isVisible().catch(() => false);
  const pwd = page.locator('input[type="password"], input[name="password"]').first();
  const needsLogin = !channelsVisible && (await pwd.isVisible().catch(() => false));
  await ctx.close();
  if (!needsLogin) return;

  const creds = readSignupCredentials();
  if (!creds) throw new Error('Missing signup credentials for normal-user refresh.');
  const loginCtx = await browser.newContext();
  const login = await loginCtx.newPage();
  await login.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await dismissConsentIfPresent(login);
  await login.locator('input[type="email"], input[name="email"]').first().fill(creds.email);
  await login.locator('input[type="password"], input[name="password"]').first().fill(creds.password);
  await login.locator('button:has-text("Login"), button:has-text("Sign In"), button[type="submit"]').first().click();
  await login.waitForURL(/\/(messages|community|dashboard|home)/i, { timeout: 30000 }).catch(() => {});
  await loginCtx.storageState({ path: USER_STATE });
  await loginCtx.close();
}

test.describe('Community production stability', () => {
  test.setTimeout(180000);

  test('rapid switching does not loop navigation, spam notifications, or duplicate sends', async ({ browser }) => {
    await ensureNormalUserAuth(browser);
    const ctx = await browser.newContext({ storageState: USER_STATE });
    const page = await ctx.newPage();

    const notif429 = [];
    let throttlingNavigationWarning = 0;
    let deleteSpamSeen = 0;
    let navigationLoopSuspected = 0;
    let lastPath = '';
    let lastPathAt = 0;
    const selectedRows = [];

    page.on('response', (res) => {
      const url = String(res.url());
      if (url.includes('/api/notifications?limit=1') && res.status() === 429) {
        notif429.push({ status: res.status(), url });
      }
    });
    page.on('console', (msg) => {
      const text = String(msg.text() || '');
      if (/Throttling navigation/i.test(text)) throttlingNavigationWarning += 1;
      if (/Attempting to delete message/i.test(text)) deleteSpamSeen += 1;
    });
    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
      const now = Date.now();
      const path = new URL(frame.url()).pathname;
      if (path === lastPath && now - lastPathAt < 450) navigationLoopSuspected += 1;
      lastPath = path;
      lastPathAt = now;
    });

    try {
      await page.goto(`${BASE}/community`, { waitUntil: 'load', timeout: 60000 });
      await dismissConsentIfPresent(page);
      if (await page.locator('input[type="password"], input[name="password"]').first().isVisible().catch(() => false)) {
        throw new Error('Community route is not authenticated for production stability spec.');
      }
      await page.waitForSelector('.channel-name', { timeout: 120000 });

      const names = page.locator('.channel-name');
      const count = await names.count();
      for (let i = 0; i < count && selectedRows.length < 5; i += 1) {
        const row = names.nth(i).locator('xpath=ancestor::li[1]').first();
        const cursor = await row.evaluate((el) => getComputedStyle(el).cursor).catch(() => '');
        if (cursor !== 'not-allowed') selectedRows.push(row);
      }
      expect(selectedRows.length).toBeGreaterThanOrEqual(2);

      for (let i = 0; i < 20; i += 1) {
        const row = selectedRows[i % selectedRows.length];
        await row.click({ force: true });
        await page.waitForTimeout(150);
      }

      const finalUrl = new URL(page.url());
      const finalChannelId = (finalUrl.pathname.split('/').filter(Boolean)[1] || '').trim();
      const headerText = ((await page.locator('.chat-header h2').first().innerText().catch(() => '')) || '').trim();
      expect(finalChannelId.length).toBeGreaterThan(0);
      expect(headerText.length).toBeGreaterThan(0);

      const input = page.locator('#community-message-input').first();
      await expect(input).toBeVisible({ timeout: 15000 });
      await expect(input).toBeEnabled({ timeout: 15000 });
      const token = `PROD_STABILITY_${Date.now()}`;
      await input.fill(token);
      await input.press('Enter');
      await expect(page.locator('.chat-messages').first().getByText(token, { exact: true })).toBeVisible({ timeout: 15000 });
      const copies = await page.locator('.chat-messages').first().getByText(token, { exact: true }).count();

      expect(copies).toBe(1);
      expect(throttlingNavigationWarning).toBe(0);
      expect(navigationLoopSuspected).toBeLessThan(6);
      expect(notif429.length).toBe(0);
      expect(deleteSpamSeen).toBe(0);
    } finally {
      await ctx.close();
    }
  });
});
