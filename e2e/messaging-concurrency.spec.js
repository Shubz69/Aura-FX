// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const ADMIN_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-admin.json');
const USER_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');
const OUT_JSON = path.join(process.cwd(), 'e2e', 'reports', 'messaging-concurrency-report.json');
const OUT_MD = path.join(process.cwd(), 'e2e', 'reports', 'messaging-concurrency-report.md');

function readNormalUserIdFromState() {
  const raw = JSON.parse(fs.readFileSync(USER_STATE, 'utf8'));
  const origin = (raw?.origins || []).find((o) => o.origin === BASE) || (raw?.origins || [])[0];
  const userEntry = (origin?.localStorage || []).find((x) => x.name === 'user');
  const userObj = userEntry?.value ? JSON.parse(userEntry.value) : null;
  const id = userObj?.id != null ? String(userObj.id) : '';
  if (!id) throw new Error('Could not read normal-user id from storage state');
  return id;
}

async function dismissConsentIfPresent(page) {
  const backdrop = page.locator('.gdpr-backdrop');
  if (!(await backdrop.isVisible().catch(() => false))) return;
  const consent = page
    .locator('button:has-text("Accept"), button:has-text("Agree"), button:has-text("Allow"), button:has-text("Got it"), button:has-text("Dismiss")')
    .first();
  if (await consent.isVisible().catch(() => false)) {
    await consent.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.keyboard.press('Escape').catch(() => {});
  }
}

function pushTiming(bucket, url, ms, status) {
  bucket.push({ url, ms, status });
}

test.describe('Bounded messaging concurrency validation', () => {
  test.setTimeout(240000);

  test('bounded overlap send + reconcile checks', async ({ browser }) => {
    if (!fs.existsSync(ADMIN_STATE)) throw new Error(`Missing admin state: ${ADMIN_STATE}`);
    if (!fs.existsSync(USER_STATE)) throw new Error(`Missing normal-user state: ${USER_STATE}`);

    const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
    const userCtx = await browser.newContext({ storageState: USER_STATE });
    const adminPage = await adminCtx.newPage();
    const userPage = await userCtx.newPage();

    /** @type {Array<{url:string,ms:number,status:number}>} */
    const apiTimings = [];
    /** @type {Array<any>} */
    const apiFailures = [];
    /** @type {Map<string, number>} */
    const sentAt = new Map();
    /** @type {Set<string>} */
    const observedThreadIds = new Set();

    const hookPage = (page) => {
      page.on('response', async (resp) => {
        const url = resp.url();
        if (!/\/api\/messages\/threads/i.test(url)) return;
        const req = resp.request();
        const key = `${req.method()} ${url}`;
        const t0 = sentAt.get(key);
        if (typeof t0 === 'number') pushTiming(apiTimings, url, Date.now() - t0, resp.status());
        const m = url.match(/\/api\/messages\/threads\/(\d+)/i);
        if (m?.[1]) observedThreadIds.add(m[1]);
        if (resp.status() >= 400) {
          apiFailures.push({ type: 'http', status: resp.status(), url, during: page.url() });
        }
      });
      page.on('requestfailed', (req) => {
        const url = req.url();
        if (!/\/api\/messages\/threads/i.test(url)) return;
        apiFailures.push({ type: 'requestfailed', error: req.failure()?.errorText || 'unknown', url, during: page.url() });
      });
    };
    hookPage(adminPage);
    hookPage(userPage);

    const trackPost = async (page, text) => {
      const respP = page.waitForResponse(
        (r) => /\/api\/messages\/threads\/\d+\/messages/i.test(r.url()) && r.request().method() === 'POST',
        { timeout: 15000 }
      ).catch(() => null);
      return respP;
    };

    try {
      const qaUserId = readNormalUserIdFromState();
      await adminPage.goto(`${BASE}/admin/inbox?user=${encodeURIComponent(qaUserId)}`, { waitUntil: 'domcontentloaded' });
      await userPage.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' });
      await dismissConsentIfPresent(adminPage);
      await dismissConsentIfPresent(userPage);
      await expect(adminPage.locator('.admin-inbox-form-row input[type="text"]')).toBeEnabled({ timeout: 30000 });
      await expect(userPage.locator('.message-input')).toBeVisible({ timeout: 30000 });

      const userItems = adminPage.locator('.admin-inbox-user-item');
      const userCount = await userItems.count();
      const multiThreadAvailable = userCount >= 2;

      const marker = Date.now();
      const adminMsgs = Array.from({ length: 5 }, (_, i) => `CQ_ADMIN_${marker}_${i}`);
      const userMsgs = Array.from({ length: 5 }, (_, i) => `CQ_USER_${marker}_${i}`);

      const sendAdminBurst = async () => {
        for (const msg of adminMsgs) {
          const postResp = await trackPost(adminPage, msg);
          await adminPage.locator('.admin-inbox-form-row input[type="text"]').fill(msg);
          const keyPrefix = 'POST ';
          sentAt.set(`${keyPrefix}${BASE}/api/messages/threads`, Date.now());
          await adminPage.locator('.admin-inbox-send-btn').click();
          await postResp;
          await adminPage.waitForTimeout(35);
        }
      };

      const sendUserBurst = async () => {
        for (const msg of userMsgs) {
          await userPage.locator('.message-input').fill(msg);
          sentAt.set(`POST ${BASE}/api/messages/threads`, Date.now());
          await userPage.locator('.send-button').click();
          await userPage.waitForTimeout(35);
        }
      };

      const churnThreads = async () => {
        if (!multiThreadAvailable) return;
        for (let i = 0; i < 4; i += 1) {
          await userItems.nth(i % 2).click({ timeout: 5000 }).catch(() => {});
          await adminPage.waitForTimeout(120);
        }
        await adminPage.goto(`${BASE}/admin/inbox?user=${encodeURIComponent(qaUserId)}`, { waitUntil: 'domcontentloaded' });
      };

      const t0 = Date.now();
      await Promise.all([sendAdminBurst(), sendUserBurst(), churnThreads()]);
      const overlapTimingMs = Date.now() - t0;

      await expect(adminPage.locator('.admin-inbox-message-text', { hasText: userMsgs[4] }).first()).toBeVisible({ timeout: 20000 });
      await expect(userPage.locator('.message-content', { hasText: adminMsgs[4] }).first()).toBeVisible({ timeout: 20000 });

      const adminSeenTexts = await adminPage.locator('.admin-inbox-message-text').allInnerTexts();
      const userSeenTexts = await userPage.locator('.message-content').allInnerTexts();

      const countContains = (arr, token) => arr.filter((x) => x.includes(token)).length;
      const adminSeenByUser = userMsgs.map((m) => countContains(adminSeenTexts, m));
      const userSeenByAdmin = adminMsgs.map((m) => countContains(userSeenTexts, m));

      const duplicates = [...adminSeenByUser, ...userSeenByAdmin].filter((n) => n > 1).length;
      const missing = [...adminSeenByUser, ...userSeenByAdmin].filter((n) => n < 1).length;

      const indexIn = (arr, token) => arr.findIndex((x) => x.includes(token));
      const userOrderIdx = userMsgs.map((m) => indexIn(adminSeenTexts, m));
      const adminOrderIdx = adminMsgs.map((m) => indexIn(userSeenTexts, m));
      const inOrder = (idxs) => idxs.every((v, i) => v >= 0 && (i === 0 || v > idxs[i - 1]));
      const userOrderOk = inOrder(userOrderIdx);
      const adminOrderOk = inOrder(adminOrderIdx);

      // Composer not stuck check.
      await adminPage.locator('.admin-inbox-form-row input[type="text"]').fill(`CQ_COMPOSER_${marker}`);
      const composerEnabled = await adminPage.locator('.admin-inbox-send-btn').isEnabled();

      // Refresh dedupe check.
      await adminPage.reload({ waitUntil: 'domcontentloaded' });
      await userPage.reload({ waitUntil: 'domcontentloaded' });
      await dismissConsentIfPresent(adminPage);
      await dismissConsentIfPresent(userPage);
      const adminAfterReload = await adminPage.locator('.admin-inbox-message-text').allInnerTexts();
      const userAfterReload = await userPage.locator('.message-content').allInnerTexts();
      const reloadDupes =
        adminMsgs.some((m) => countContains(userAfterReload, m) > 1) ||
        userMsgs.some((m) => countContains(adminAfterReload, m) > 1);

      const hasServerFailures = apiFailures.some((f) => f.type === 'http' && (f.status === 429 || f.status >= 500));
      const pass =
        missing === 0 &&
        duplicates === 0 &&
        userOrderOk &&
        adminOrderOk &&
        composerEnabled &&
        !reloadDupes &&
        !hasServerFailures;

      const result = {
        generatedAt: new Date().toISOString(),
        base: BASE,
        scope: multiThreadAvailable
          ? 'bounded multi-thread overlap (admin+normal user sessions)'
          : 'bounded single-thread overlap (admin+normal user sessions only)',
        overlapTimingMs,
        sent: { adminToUser: adminMsgs.length, userToAdmin: userMsgs.length, total: adminMsgs.length + userMsgs.length },
        received: {
          adminSawUser: adminSeenByUser.filter((n) => n >= 1).length,
          userSawAdmin: userSeenByAdmin.filter((n) => n >= 1).length,
          total: adminSeenByUser.filter((n) => n >= 1).length + userSeenByAdmin.filter((n) => n >= 1).length
        },
        duplicates,
        missing,
        order: { adminThreadOrderOk: userOrderOk, userThreadOrderOk: adminOrderOk },
        noCrossThreadLeakage: observedThreadIds.size <= (multiThreadAvailable ? 2 : 1),
        noStaleOverwrite: missing === 0 && duplicates === 0,
        composerStuck: !composerEnabled,
        reloadDuplicateNodes: reloadDupes,
        api: {
          timings: apiTimings,
          failures: apiFailures,
          fail429or5xx: hasServerFailures
        },
        pass
      };

      fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
      const md = [
        '# Bounded Messaging Concurrency Validation',
        '',
        `- Generated: ${result.generatedAt}`,
        `- Scope: ${result.scope}`,
        `- Pass: ${result.pass ? 'PASS' : 'FAIL'}`,
        `- Sent total: ${result.sent.total}`,
        `- Received total: ${result.received.total}`,
        `- Duplicates: ${result.duplicates}`,
        `- Missing: ${result.missing}`,
        `- Admin-thread order: ${result.order.adminThreadOrderOk}`,
        `- User-thread order: ${result.order.userThreadOrderOk}`,
        `- Composer stuck: ${result.composerStuck}`,
        `- Reload duplicate nodes: ${result.reloadDuplicateNodes}`,
        `- 429/5xx on /api/messages/threads*: ${result.api.fail429or5xx}`,
        `- API thread-call failures captured: ${result.api.failures.length}`,
        `- Overlap timing (ms): ${result.overlapTimingMs}`,
        ''
      ].join('\n');
      fs.writeFileSync(OUT_MD, md, 'utf8');

      expect(result.pass).toBeTruthy();
    } finally {
      await adminCtx.close();
      await userCtx.close();
    }
  });
});

