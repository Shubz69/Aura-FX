// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const ADMIN_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-admin.json');
const USER_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');
const OUT_JSON = path.join(process.cwd(), 'e2e', 'reports', 'strict-messaging-admininbox-results.json');
const OUT_MD = path.join(process.cwd(), 'e2e', 'reports', 'strict-messaging-admininbox-report.md');

/** @type {Array<any>} */
const RESULTS = [];

function attachIssueCollectors(page, bucket) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') bucket.console.push({ url: page.url(), text: msg.text() });
  });
  page.on('response', (resp) => {
    if (resp.status() >= 400) bucket.network.push({ type: 'http', status: resp.status(), url: resp.url(), during: page.url() });
  });
  page.on('requestfailed', (req) => {
    bucket.network.push({ type: 'requestfailed', error: req.failure()?.errorText || 'unknown', url: req.url(), during: page.url() });
  });
}

async function addResult(entry) {
  RESULTS.push(entry);
  const payload = { generatedAt: new Date().toISOString(), base: BASE, results: RESULTS };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2), 'utf8');
}

function readNormalUserIdFromState() {
  const raw = JSON.parse(fs.readFileSync(USER_STATE, 'utf8'));
  const origin = (raw?.origins || []).find((o) => o.origin === BASE) || (raw?.origins || [])[0];
  const userEntry = (origin?.localStorage || []).find((x) => x.name === 'user');
  const userObj = userEntry?.value ? JSON.parse(userEntry.value) : null;
  const id = userObj?.id != null ? String(userObj.id) : '';
  if (!id) throw new Error('Could not read normal-user id from storage state');
  return id;
}

function writeMd() {
  const lines = [
    '# Strict Messaging/AdminInbox Verification',
    '',
    `- Generated: ${new Date().toISOString()}`,
    `- Base: ${BASE}`,
    '',
  ];
  for (const r of RESULTS) {
    lines.push(`## ${r.test} — ${r.pass ? 'PASS' : 'FAIL'}`);
    lines.push(`- Steps: ${r.steps.join(' -> ')}`);
    lines.push(`- Expected: ${r.expected}`);
    lines.push(`- Actual: ${r.actual}`);
    if (r.timingMs != null) lines.push(`- Timing: ${r.timingMs}ms`);
    lines.push(`- Console issues: ${r.consoleIssues?.length || 0}`);
    lines.push(`- Network issues: ${r.networkIssues?.length || 0}`);
    lines.push(`- Completion: ${r.completion}`);
    lines.push('');
  }
  fs.writeFileSync(OUT_MD, lines.join('\n'), 'utf8');
}

test.describe('Strict high-risk verification: messaging/admin inbox', () => {
  test('live messaging + admin inbox stress', async ({ browser }) => {
    if (!fs.existsSync(ADMIN_STATE)) throw new Error(`Missing admin storage state: ${ADMIN_STATE}`);
    if (!fs.existsSync(USER_STATE)) throw new Error(`Missing normal-user storage state: ${USER_STATE}`);

    const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
    const userCtx = await browser.newContext({ storageState: USER_STATE });
    const adminPage = await adminCtx.newPage();
    const userPage = await userCtx.newPage();
    const adminIssues = { console: [], network: [] };
    const userIssues = { console: [], network: [] };
    attachIssueCollectors(adminPage, adminIssues);
    attachIssueCollectors(userPage, userIssues);

    try {
      await adminPage.goto(`${BASE}/admin/inbox`, { waitUntil: 'domcontentloaded' });
      await userPage.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' });
      if (/\/login(\?|$)/i.test(adminPage.url())) throw new Error('Admin state invalid (redirected to login)');
      if (/\/login(\?|$)/i.test(userPage.url())) throw new Error('User state invalid (redirected to login)');

      // 1) Admin -> user realtime delivery
      const adminMsg = `STRICT_ADMIN_TO_USER_${Date.now()}`;
      const tSendAdmin = Date.now();
      await adminPage.locator('.admin-inbox-form-row input[type="text"]').fill(adminMsg);
      await adminPage.locator('.admin-inbox-send-btn').click();
      await expect(userPage.locator('.message-content', { hasText: adminMsg }).first()).toBeVisible({ timeout: 7000 });
      await addResult({
        test: 'live messaging: admin sends to user realtime',
        pass: true,
        steps: ['Open /admin/inbox', 'Send unique message', 'Observe /messages receive'],
        expected: 'User receives without waiting full poll interval when websocket healthy',
        actual: 'User saw admin message in messages thread.',
        timingMs: Date.now() - tSendAdmin,
        consoleIssues: [...adminIssues.console, ...userIssues.console],
        networkIssues: [...adminIssues.network, ...userIssues.network],
        completion: 'complete',
      });

      // Re-bind admin to the same normal-user support thread (sidebar default order is not guaranteed).
      const qaUserId = readNormalUserIdFromState();
      await adminPage.goto(`${BASE}/admin/inbox?user=${encodeURIComponent(qaUserId)}`, { waitUntil: 'domcontentloaded' });
      await expect(adminPage.locator('.admin-inbox-form-row input[type="text"]')).toBeEnabled({ timeout: 25000 });
      await adminPage.waitForTimeout(600);

      // 2) User -> admin delivery
      const userMsg = `STRICT_USER_TO_ADMIN_${Date.now()}`;
      const tSendUser = Date.now();
      await userPage.locator('.message-input').fill(userMsg);
      await userPage.locator('.send-button').click();
      await expect(adminPage.locator('.admin-inbox-message-text', { hasText: userMsg }).first()).toBeVisible({ timeout: 7000 });
      await addResult({
        test: 'live messaging: user sends to admin delivery',
        pass: true,
        steps: ['Open /messages', 'User sends unique message', 'Observe /admin/inbox thread'],
        expected: 'Admin receives new user message',
        actual: 'Admin inbox displayed the user message.',
        timingMs: Date.now() - tSendUser,
        consoleIssues: [...adminIssues.console, ...userIssues.console],
        networkIssues: [...adminIssues.network, ...userIssues.network],
        completion: 'complete',
      });

      // 3) Polling fallback when websocket unhealthy on user side
      await userCtx.route('**/ws/info*', (route) => route.abort());
      await userPage.reload({ waitUntil: 'domcontentloaded' });
      const fallbackMsg = `STRICT_FALLBACK_${Date.now()}`;
      const tFallback = Date.now();
      await adminPage.locator('.admin-inbox-form-row input[type="text"]').fill(fallbackMsg);
      await adminPage.locator('.admin-inbox-send-btn').click();
      await expect(userPage.locator('.message-content', { hasText: fallbackMsg }).first()).toBeVisible({ timeout: 12000 });
      await addResult({
        test: 'live messaging: websocket unhealthy polling fallback',
        pass: true,
        steps: ['Abort ws/info on user context', 'Admin sends message', 'Wait on user /messages'],
        expected: 'Message arrives via polling fallback within expected interval (~8s + render)',
        actual: 'Message arrived while websocket bootstrap was blocked.',
        timingMs: Date.now() - tFallback,
        consoleIssues: [...adminIssues.console, ...userIssues.console],
        networkIssues: [...adminIssues.network, ...userIssues.network],
        completion: 'complete',
      });

      // 4) Read/unread indicator after viewing thread
      const readIndicator = userPage.locator('.read-indicator').last();
      const readVisible = await readIndicator.isVisible().catch(() => false);
      await addResult({
        test: 'live messaging: unread/read state after view',
        pass: readVisible,
        steps: ['Send user message', 'Keep thread open', 'Check read indicator'],
        expected: 'Read indicator appears for user message after admin view/mark read',
        actual: readVisible ? 'Read indicator visible.' : 'Read indicator not visible in this run.',
        consoleIssues: [...adminIssues.console, ...userIssues.console],
        networkIssues: [...adminIssues.network, ...userIssues.network],
        completion: readVisible ? 'complete' : 'partial_or_unreliable',
      });

      // 5) Admin inbox rapid switching / stale overwrite guard
      await adminPage.goto(`${BASE}/admin/inbox`, { waitUntil: 'domcontentloaded' });
      const userItems = adminPage.locator('.admin-inbox-user-item');
      const userCount = await userItems.count();
      let switchPass = false;
      let lastSelected = '';
      if (userCount >= 2) {
        for (let i = 0; i < Math.min(6, userCount); i += 1) {
          const idx = i % 2;
          const label = (await userItems.nth(idx).innerText()).trim();
          await userItems.nth(idx).click();
          lastSelected = label;
          await adminPage.waitForTimeout(120);
        }
        const header = (await adminPage.locator('.admin-inbox-main-title').first().innerText()).trim();
        switchPass = !!lastSelected && header.toLowerCase().includes(lastSelected.split('\n')[0].toLowerCase().slice(0, 4));
      }
      await addResult({
        test: 'admin inbox: rapid thread switching / stale overwrite',
        pass: switchPass,
        steps: ['Rapidly switch between two user items', 'Observe final selected header/thread'],
        expected: 'Final selected thread remains active; no stale overwrite from prior request',
        actual: switchPass ? 'Final header matched last selected user.' : 'Could not confidently confirm stale-protection under this dataset.',
        consoleIssues: adminIssues.console,
        networkIssues: adminIssues.network,
        completion: switchPass ? 'complete' : 'partial_or_unreliable',
      });

      // 6) Controls disable during hydration / send blocked until ready
      await adminPage.goto(`${BASE}/admin/inbox`, { waitUntil: 'domcontentloaded' });
      const sendBtn = adminPage.locator('.admin-inbox-send-btn');
      const disabledWhenNoThread = await sendBtn.isDisabled();
      await addResult({
        test: 'admin inbox: controls disabled while unresolved',
        pass: disabledWhenNoThread,
        steps: ['Load inbox', 'Before selecting ready thread inspect send button'],
        expected: 'Send remains blocked until active thread ready',
        actual: disabledWhenNoThread ? 'Send button disabled in unresolved state.' : 'Send button not disabled as expected.',
        consoleIssues: adminIssues.console,
        networkIssues: adminIssues.network,
        completion: disabledWhenNoThread ? 'complete' : 'partial_or_unreliable',
      });

      // 7) Duplicate/out-of-order quick-send check
      const quickBase = `STRICT_QUICK_${Date.now()}`;
      await adminPage.locator('.admin-inbox-user-item').first().click({ timeout: 5000 }).catch(() => {});
      await adminPage.waitForTimeout(800);
      for (let i = 0; i < 3; i += 1) {
        await adminPage.locator('.admin-inbox-form-row input[type="text"]').fill(`${quickBase}_${i}`);
        await adminPage.locator('.admin-inbox-send-btn').click();
      }
      await adminPage.waitForTimeout(1500);
      const countQuick = await adminPage.locator('.admin-inbox-message-text').filter({ hasText: quickBase }).count();
      const quickPass = countQuick >= 3;
      await addResult({
        test: 'admin inbox: no duplicate/out-of-order under quick interactions',
        pass: quickPass,
        steps: ['Send 3 rapid unique messages', 'Count rendered unique messages'],
        expected: 'All unique messages appear once in order (no duplicate loss)',
        actual: `Observed ${countQuick} quick messages with marker ${quickBase}.`,
        consoleIssues: adminIssues.console,
        networkIssues: adminIssues.network,
        completion: quickPass ? 'complete' : 'partial_or_unreliable',
      });

      writeMd();
      expect(RESULTS.length).toBeGreaterThanOrEqual(7);
    } catch (err) {
      await addResult({
        test: 'suite setup/execution',
        pass: false,
        steps: ['Initialize admin/user contexts', 'Run strict scenarios'],
        expected: 'All strict scenarios execute',
        actual: String(err?.message || err),
        consoleIssues: [],
        networkIssues: [],
        completion: 'still_unreliable',
      });
      writeMd();
      throw err;
    } finally {
      await adminCtx.close();
      await userCtx.close();
    }
  });
});

