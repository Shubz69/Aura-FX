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

function pathChannelId(url) {
  const seg = new URL(url).pathname.split('/').filter(Boolean)[1];
  return (seg || '').trim();
}

async function ensureNormalUserAuth(browser) {
  const ctx = await browser.newContext({ storageState: USER_STATE });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
  const pwd = page.locator('input[type="password"]').first();
  const needsLogin = await pwd.isVisible().catch(() => false);
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

test.describe('Community channel switch stability', () => {
  test.setTimeout(120000);

  test('URL, header, and notification poll stay coherent under rapid channel clicks', async ({ browser }) => {
    await ensureNormalUserAuth(browser);
    const ctx = await browser.newContext({ storageState: USER_STATE });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    const notif429 = [];
    let throttlingNavWarnings = 0;

    const isUnreadCountPollUrl = (u) => /[?&]limit=1(?:&|#|$)/.test(String(u || ''));
    page.on('response', (res) => {
      if (isUnreadCountPollUrl(res.url()) && res.status() === 429) {
        notif429.push({ t: Date.now(), url: res.url() });
      }
    });
    page.on('console', (msg) => {
      const t = msg.text();
      if (/Throttling navigation/i.test(t)) throttlingNavWarnings += 1;
    });

    try {
      await page.goto(`${BASE}/community`, { waitUntil: 'load', timeout: 60000 });
      await dismissConsentIfPresent(page);
      const names = page.locator('.channel-name');
      await page.waitForSelector('.channel-name', { timeout: 120000 });
      const count = await names.count();
      const indices = [];
      for (let i = 0; i < count && indices.length < 5; i += 1) {
        const row = names.nth(i).locator('xpath=ancestor::li[1]').first();
        const cursor = await row.evaluate((el) => getComputedStyle(el).cursor).catch(() => '');
        if (cursor === 'not-allowed') continue;
        indices.push(i);
      }
      expect(indices.length).toBeGreaterThanOrEqual(2);

      const sequence = [...indices, ...indices.slice().reverse()];
      for (const idx of sequence) {
        const row = names.nth(idx).locator('xpath=ancestor::li[1]').first();
        await row.click({ force: true });
        await page.waitForTimeout(280);
      }

      await page.waitForTimeout(600);
      const urlId = pathChannelId(page.url());
      const headerText = ((await page.locator('.chat-header h2').first().innerText().catch(() => '')) || '').trim();
      expect(urlId.length).toBeGreaterThan(0);
      expect(headerText.length).toBeGreaterThan(0);

      expect(notif429.length).toBe(0);
      expect(throttlingNavWarnings).toBe(0);

      // Message GET volume is environment-dependent (empty-channel polls omit afterId).
      // Primary stability signals: no notification 429 burst, no Chrome navigation throttling, coherent header/URL.
    } finally {
      await ctx.close();
    }
  });

  test('Named channel path: General → Commodities → A7fx General Chat → Weekly Brief → General', async ({ browser }) => {
    await ensureNormalUserAuth(browser);
    const ctx = await browser.newContext({ storageState: USER_STATE });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1400, height: 900 });
    let throttlingNavWarnings = 0;
    page.on('console', (msg) => {
      if (/Throttling navigation/i.test(msg.text())) throttlingNavWarnings += 1;
    });
    try {
      await page.goto(`${BASE}/community`, { waitUntil: 'load', timeout: 60000 });
      await dismissConsentIfPresent(page);
      await page.waitForSelector('.channel-name', { timeout: 120000 });
      const pathLabels = ['General', 'Commodities', 'A7fx General Chat', 'Weekly Brief', 'General'];
      for (const label of pathLabels) {
        const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cell = page.locator('.channel-name').filter({ hasText: new RegExp(esc, 'i') }).first();
        if (!(await cell.isVisible().catch(() => false))) continue;
        const row = cell.locator('xpath=ancestor::li[1]').first();
        const cursor = await row.evaluate((el) => getComputedStyle(el).cursor).catch(() => '');
        if (cursor === 'not-allowed') continue;
        await row.click({ force: true });
        await page.waitForTimeout(400);
        const id = pathChannelId(page.url());
        const h2 = ((await page.locator('.chat-header h2').first().innerText().catch(() => '')) || '').trim();
        expect(id.length).toBeGreaterThan(0);
        expect(h2.length).toBeGreaterThan(0);
      }
      expect(throttlingNavWarnings).toBe(0);
    } finally {
      await ctx.close();
    }
  });
});
