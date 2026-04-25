import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const USER_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');
const OUT = path.join(process.cwd(), 'e2e', 'reports', 'community-latency-spec-report.json');

function stats(values) {
  if (!values.length) return { min: null, median: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return { min: sorted[0], median: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1] };
}

async function dismissConsentIfPresent(page) {
  const backdrop = page.locator('.gdpr-backdrop');
  if (!(await backdrop.isVisible().catch(() => false))) return;
  const consent = page.locator('button:has-text("Accept"), button:has-text("Agree"), button:has-text("Allow"), button:has-text("Got it"), button:has-text("Dismiss")').first();
  if (await consent.isVisible().catch(() => false)) await consent.click({ timeout: 5000 }).catch(() => {});
}

async function pickWritableChannel(page) {
  await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded' });
  await dismissConsentIfPresent(page);
  const names = page.locator('.channels-section li .channel-name');
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

test.describe('Community latency focused', () => {
  test.setTimeout(180000);
  test('measure 10 post->visible latencies', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: USER_STATE });
    const page = await ctx.newPage();
    const requestStart = new Map();
    const apiIssues = [];
    const postMs = [];
    const postEvents = [];
    let lastPostStatus = null;
    let lastPostId = null;
    let lastToken = null;
    let apiContainsAfterSend = false;
    let uiContainsAfterSend = false;
    page.on('request', (req) => requestStart.set(req, Date.now()));
    page.on('response', (res) => {
      if (!/\/api\/community\//i.test(res.url())) return;
      if (res.status() >= 400) apiIssues.push({ type: 'http', status: res.status(), url: res.url() });
      if (/\/api\/community\/channels\/[^/]+\/messages/i.test(res.url()) && res.request().method() === 'POST') {
        postMs.push(Math.max(0, Date.now() - (requestStart.get(res.request()) || Date.now())));
      }
    });
    page.on('requestfailed', (req) => {
      if (/\/api\/community\//i.test(req.url())) apiIssues.push({ type: 'requestfailed', error: req.failure()?.errorText || 'unknown', url: req.url() });
    });

    try {
      const { channelId, channelName, input } = await pickWritableChannel(page);
      await page.goto(`${BASE}/community/${encodeURIComponent(channelId)}`, { waitUntil: 'domcontentloaded' });
      await dismissConsentIfPresent(page);
      await expect(page.locator('#community-message-input').first()).toBeVisible({ timeout: 20000 });
      const visMs = [];
      for (let i = 0; i < 10; i += 1) {
        const token = `LAT_ONLY_${Date.now()}_${i}`;
        lastToken = token;
        const t0 = Date.now();
        await page.locator('#community-message-input').first().fill(token);
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
        console.log('[community-latency-send-debug]', JSON.stringify({ token, currentChannelId, postStatus: lastPostStatus, postId: lastPostId, preAssertCount }));
        await expect(page.locator('.chat-messages').first().getByText(token, { exact: true })).toBeVisible({ timeout: 15000 });
        uiContainsAfterSend = (await page.locator('.chat-messages').first().getByText(token, { exact: true }).count().catch(() => 0)) > 0;
        apiContainsAfterSend = await page.request.get(`${BASE}/api/community/channels/${channelId}/messages`, {
          failOnStatusCode: false
        }).then(async (r) => {
          const body = await r.json().catch(() => []);
          return Array.isArray(body) && body.some((m) => String(m?.content || '').includes(token));
        }).catch(() => false);
        visMs.push(Date.now() - t0);
      }
      const out = {
        generatedAt: new Date().toISOString(),
        base: BASE,
        channelId,
        channelName,
        lastToken,
        lastPostStatus,
        lastPostId,
        postEvents,
        apiContainsAfterSend,
        uiContainsAfterSend,
        latency: stats(visMs),
        endpointBreakdown: { post: stats(postMs) },
        apiIssues
      };
      fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
      expect(visMs.length).toBe(10);
    } finally {
      await ctx.close();
    }
  });
});
