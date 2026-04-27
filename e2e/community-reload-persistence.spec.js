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

function readUserToken() {
  try {
    const raw = JSON.parse(fs.readFileSync(USER_STATE, 'utf8'));
    const origin = (raw?.origins || []).find((o) => o.origin === BASE) || (raw?.origins || [])[0];
    return (origin?.localStorage || []).find((x) => x.name === 'token')?.value || '';
  } catch {
    return '';
  }
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

async function pickWritableChannel(page) {
  await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
  await dismissConsentIfPresent(page);
  const names = page.locator('.channel-name');
  await expect(names.first()).toBeVisible({ timeout: 30000 });
  const count = await names.count();
  for (let i = 0; i < count; i += 1) {
    const label = ((await names.nth(i).innerText().catch(() => '')) || '').trim();
    const t = label.toLowerCase();
    if (!label || t === 'welcome' || t.startsWith('announcement') || t === 'levels' || t.includes('notification') || /\brules?\b/.test(t)) continue;
    const row = names.nth(i).locator('xpath=ancestor::li[1]').first();
    await row.click({ force: true });
    await page.waitForTimeout(350);
    const input = page.locator('#community-message-input').first();
    await input.waitFor({ state: 'visible', timeout: 15000 });
    if (await input.isEnabled().catch(() => false)) {
      const channelId = (new URL(page.url()).pathname.split('/').filter(Boolean)[1] || '').trim();
      if (!channelId || channelId.toLowerCase() === 'announcements') continue;
      return { channelId, channelName: label, input };
    }
  }
  throw new Error('No writable channel for normal user.');
}

test.describe('Community reload persistence', () => {
  test.setTimeout(180000);

  test('same-channel reload keeps one copy', async ({ browser }) => {
    await ensureNormalUserAuth(browser);
    const ctx = await browser.newContext({ storageState: USER_STATE });
    const page = await ctx.newPage();
    try {
      const { channelId, channelName, input } = await pickWritableChannel(page);
      const tokens = [];
      const postEvents = [];
      let lastPostStatus = null;
      let lastPostId = null;
      for (let i = 0; i < 10; i += 1) {
        const token = `RLD_ONE_${Date.now()}_${i}`;
        tokens.push(token);
        await input.fill(token);
        const waitPost = page.waitForResponse((r) => {
          return r.request().method() === 'POST' && r.url().includes(`/api/community/channels/${channelId}/messages`);
        }, { timeout: 20000 }).catch(() => null);
        await input.press('Enter');
        const postRes = await waitPost;
        if (postRes) {
          lastPostStatus = postRes.status();
          const postBody = await postRes.json().catch(() => ({}));
          lastPostId = postBody?.id ?? postBody?.message?.id ?? null;
          postEvents.push({ status: postRes.status(), id: lastPostId });
        }
        const currentChannelId = (new URL(page.url()).pathname.split('/').filter(Boolean)[1] || '').trim();
        const preAssertCount = await page.locator('.chat-messages').first().getByText(token, { exact: true }).count().catch(() => 0);
        console.log('[community-send-debug]', JSON.stringify({ token, currentChannelId, postStatus: lastPostStatus, postId: lastPostId, preAssertCount }));
        await expect(page.locator('.chat-messages').first().getByText(token, { exact: true })).toBeVisible({ timeout: 15000 });
      }

      const reloadGet = { status: null, ms: null, aborted: false, url: null };
      const isTargetFullGetUrl = (url) =>
        url.includes(`/api/community/channels/${channelId}/messages`) && !/[?&]afterId=/.test(url);
      const waitReloadGet = (async () => {
        const started = Date.now();
        await Promise.race([
          page.waitForResponse((r) => r.request().method() === 'GET' && isTargetFullGetUrl(r.url()), { timeout: 20000 })
            .then((r) => {
              reloadGet.status = r.status();
              reloadGet.ms = Date.now() - started;
              reloadGet.url = r.url();
            })
            .catch(() => {}),
          page.waitForEvent('requestfailed', {
            predicate: (req) => req.method() === 'GET' && isTargetFullGetUrl(req.url()),
            timeout: 20000
          }).then((req) => {
            reloadGet.aborted = true;
            reloadGet.ms = Date.now() - started;
            reloadGet.url = req.url();
          }).catch(() => {})
        ]);
      })();

      await page.goto(`${BASE}/community/${encodeURIComponent(channelId)}`, { waitUntil: 'domcontentloaded' });
      await dismissConsentIfPresent(page);
      await waitReloadGet;

      let reloadChannelId = (new URL(page.url()).pathname.split('/').filter(Boolean)[1] || '').trim();
      if (reloadChannelId !== channelId) {
        const targetByHref = page.locator(`a[href*="/community/${channelId}"], [href*="/community/${channelId}"]`).first();
        if (await targetByHref.isVisible().catch(() => false)) {
          const waitReselectGet = page.waitForResponse((r) => {
            const url = r.url();
            return r.request().method() === 'GET' && url.includes(`/api/community/channels/${channelId}/messages`) && !/[?&]afterId=/.test(url) && r.status() < 500;
          }, { timeout: 20000 }).catch(() => {});
          await targetByHref.click({ force: true });
          await waitReselectGet;
        } else {
          const names = page.locator('.channel-name');
          const targetName = names.filter({ hasText: channelName }).first();
          if (await targetName.isVisible().catch(() => false)) {
            const waitReselectGet = page.waitForResponse((r) => {
              const url = r.url();
              return r.request().method() === 'GET' && url.includes(`/api/community/channels/${channelId}/messages`) && !/[?&]afterId=/.test(url) && r.status() < 500;
            }, { timeout: 20000 }).catch(() => {});
            await targetName.click({ force: true });
            await waitReselectGet;
          }
        }
      }
      reloadChannelId = (new URL(page.url()).pathname.split('/').filter(Boolean)[1] || '').trim();
      const chat = page.locator('.chat-messages').first();
      let zero = 0;
      let dup = 0;
      for (const token of tokens) {
        const c = await chat.locator(`text="${token}"`).count().catch(() => 0);
        if (c === 0) zero += 1;
        if (c > 1) dup += (c - 1);
      }

      const lastToken = tokens[tokens.length - 1];
      const userToken = readUserToken();
      const apiContainsAfterSend = await page.request.get(`${BASE}/api/community/channels/${channelId}/messages`, {
        failOnStatusCode: false,
        headers: userToken ? { Authorization: `Bearer ${userToken}` } : undefined
      }).then(async (r) => {
        const body = await r.json().catch(() => []);
        return Array.isArray(body) && body.some((m) => String(m?.content || '').includes(lastToken));
      }).catch(() => false);
      const uiContainsAfterSend = (await page.locator('.chat-messages').first().getByText(lastToken, { exact: true }).count().catch(() => 0)) > 0;
      const apiContainsPosted = await page.request.get(`${BASE}/api/community/channels/${channelId}/messages`, {
        failOnStatusCode: false,
        headers: userToken ? { Authorization: `Bearer ${userToken}` } : undefined
      }).then(async (r) => {
        const body = await r.json().catch(() => []);
        return Array.isArray(body) && body.some((m) => String(m?.content || '').includes(lastToken));
      }).catch(() => false);
      const uiCountAfterReload = await chat.locator(`text="${lastToken}"`).count().catch(() => 0);
      console.log('[community-reload-persistence]', JSON.stringify({
        channelId,
        channelName,
        reloadChannelId,
        lastPostStatus,
        lastPostId,
        postEvents,
        apiContainsAfterSend,
        uiContainsAfterSend,
        reloadGet,
        apiContainsPosted,
        uiCountAfterReload,
        zero,
        dup
      }));

      expect({ channelId, channelName, reloadChannelId, zero, dup }).toEqual(
        expect.objectContaining({ reloadChannelId: channelId, zero: 0, dup: 0 })
      );
    } finally {
      await ctx.close();
    }
  });
});
