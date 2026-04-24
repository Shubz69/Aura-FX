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

function classifyAdminUsersReliability(networkIssues) {
  const adminUsersIssues = (networkIssues || []).filter((n) => /\/api\/admin\/users/i.test(String(n?.url || '')));
  if (!adminUsersIssues.length) return { status: 'PASS', issueCount: 0 };
  const hasHardFail = adminUsersIssues.some((n) => n.type === 'http' && Number(n.status || 0) >= 500);
  if (hasHardFail) return { status: 'FAIL', issueCount: adminUsersIssues.length };
  return { status: 'RISK', issueCount: adminUsersIssues.length };
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

async function dismissConsentIfPresent(page) {
  const backdrop = page.locator('.gdpr-backdrop');
  if (!(await backdrop.isVisible().catch(() => false))) return;
  const consent = page
    .locator('button:has-text(\"Accept\"), button:has-text(\"Agree\"), button:has-text(\"Allow\"), button:has-text(\"Got it\"), button:has-text(\"Dismiss\")')
    .first();
  if (await consent.isVisible().catch(() => false)) {
    await consent.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.keyboard.press('Escape').catch(() => {});
    await backdrop.click({ position: { x: 5, y: 5 } }).catch(() => {});
  }
}

async function validateStateAfterHydration(page, expectedPathRe) {
  await page.waitForTimeout(5000);
  const finalUrl = page.url();
  const redirectedToLogin = /\/login(\?|$)/i.test(finalUrl);
  const onExpectedPath = expectedPathRe.test(finalUrl);
  return {
    ok: !redirectedToLogin && onExpectedPath,
    finalUrl,
    redirectedToLogin,
  };
}

test.describe('Strict high-risk verification: messaging/admin inbox', () => {
  test.setTimeout(180000);
  test('live messaging + admin inbox stress', async ({ browser }) => {
    if (!fs.existsSync(ADMIN_STATE)) throw new Error(`Missing admin storage state: ${ADMIN_STATE}`);
    if (!fs.existsSync(USER_STATE)) throw new Error(`Missing normal-user storage state: ${USER_STATE}`);

    const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
    const userCtx = await browser.newContext({ storageState: USER_STATE });
    const adminPage = await adminCtx.newPage();
    const userPage = await userCtx.newPage();
    const adminIssues = { console: [], network: [] };
    const userIssues = { console: [], network: [] };
    let loginRedirectObserved = false;
    attachIssueCollectors(adminPage, adminIssues);
    attachIssueCollectors(userPage, userIssues);
    const observeLoginNav = (frame) => {
      if (frame === adminPage.mainFrame() || frame === userPage.mainFrame()) {
        const u = frame.url();
        if (/\/login(\?|$)/i.test(u)) loginRedirectObserved = true;
      }
    };
    adminPage.on('framenavigated', observeLoginNav);
    userPage.on('framenavigated', observeLoginNav);

    try {
      await adminPage.goto(`${BASE}/admin/inbox`, { waitUntil: 'domcontentloaded' });
      await userPage.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' });
      await dismissConsentIfPresent(adminPage);
      await dismissConsentIfPresent(userPage);
      const adminGate = await validateStateAfterHydration(adminPage, /\/admin\/inbox(\?|$)/i);
      const userGate = await validateStateAfterHydration(userPage, /\/messages(\?|$)/i);
      if (!adminGate.ok) {
        test.skip(true, `Admin state invalid after hydration: ${adminGate.finalUrl}`);
      }
      if (!userGate.ok) {
        test.skip(true, `User state invalid after hydration: ${userGate.finalUrl}`);
      }
      const meResp = await adminPage.request.get(`${BASE}/api/me`, {
        headers: { Authorization: `Bearer ${await adminPage.evaluate(() => localStorage.getItem('token') || '')}` },
      });
      const meJson = await meResp.json().catch(() => ({}));
      const meRole = String(meJson?.user?.role || '').toUpperCase();
      const adminRoleOk = meResp.status() === 200 && (meRole === 'ADMIN' || meRole === 'SUPER_ADMIN');
      if (!adminRoleOk) {
        test.skip(true, `Admin /api/me gate failed: status=${meResp.status()} role=${meRole || 'unknown'}`);
      }

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
      await dismissConsentIfPresent(userPage);
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
      const sendAdminProbe = async (text) => {
        const input = adminPage.locator('.admin-inbox-form-row input[type="text"]');
        const send = adminPage.locator('.admin-inbox-send-btn');
        await input.fill(text);
        const start = Date.now();
        while (!(await send.isEnabled().catch(() => false)) && Date.now() - start < 5000) {
          await adminPage.waitForTimeout(100);
        }
        if (!(await send.isEnabled().catch(() => false))) return false;
        await send.click();
        return true;
      };
      let rapidSwitchProductCorrectness = 'FAIL';
      let rapidSwitchOverall = 'FAIL';
      let productActual = 'Rapid-switch product evidence was not collected.';
      let lastSelectedLabel = '';
      let firstLabel = '';
      let secondLabel = '';
      let firstThreadId = null;
      let secondThreadId = null;
      let finalThreadId = null;
      if (userCount >= 2) {
        const threadIdFromUrl = (u) => {
          const m = String(u || '').match(/\/api\/messages\/threads\/(\d+)\/messages/i);
          return m ? Number(m[1]) : null;
        };
        const pickLabel = (txt) => String(txt || '').split('\n')[0].trim();
        const clickAndCaptureThreadId = async (index) => {
          const req = adminPage
            .waitForRequest((r) => /\/api\/messages\/threads\/\d+\/messages/i.test(r.url()), { timeout: 8000 })
            .catch(() => null);
          await userItems.nth(index).click();
          const r = await req;
          return threadIdFromUrl(r?.url());
        };

        firstLabel = pickLabel(await userItems.nth(0).innerText());
        firstThreadId = await clickAndCaptureThreadId(0);
        const firstMarker = `STRICT_SWITCH_A_${Date.now()}`;
        const firstSent = await sendAdminProbe(firstMarker);
        if (!firstSent) {
          rapidSwitchProductCorrectness = 'FAIL';
          productActual = 'Composer stayed disabled on first selected thread during rapid-switch check.';
        }
        if (!firstSent) {
          // keep section deterministic and continue to reliability classification only
        } else {
        await expect(adminPage.locator('.admin-inbox-message-text', { hasText: firstMarker }).first()).toBeVisible({ timeout: 7000 });

        secondLabel = pickLabel(await userItems.nth(1).innerText());
        secondThreadId = await clickAndCaptureThreadId(1);
        const secondMarker = `STRICT_SWITCH_B_${Date.now()}`;
        const secondSent = await sendAdminProbe(secondMarker);
        if (!secondSent) {
          rapidSwitchProductCorrectness = 'FAIL';
          productActual = 'Composer stayed disabled on second selected thread during rapid-switch check.';
        }
        if (secondSent) {
        await expect(adminPage.locator('.admin-inbox-message-text', { hasText: secondMarker }).first()).toBeVisible({ timeout: 7000 });

        for (let i = 0; i < 6; i += 1) {
          const idx = i % 2;
          lastSelectedLabel = idx === 0 ? firstLabel : secondLabel;
          const captured = await clickAndCaptureThreadId(idx);
          if (captured != null) finalThreadId = captured;
          await adminPage.waitForTimeout(100);
        }

        const finalHeader = (await adminPage.locator('.admin-inbox-main-title').first().innerText()).trim();
        const endsOnSecond = (lastSelectedLabel || '').toLowerCase() === (secondLabel || '').toLowerCase();
        const expectedFinalThreadId = endsOnSecond ? secondThreadId : firstThreadId;
        const finalProbe = `STRICT_SWITCH_FINAL_${Date.now()}`;
        const postRespPromise = adminPage.waitForResponse(
          (r) => /\/api\/messages\/threads\/\d+\/messages/i.test(r.url()) && r.request().method() === 'POST',
          { timeout: 12000 }
        );
        const finalSent = await sendAdminProbe(finalProbe);
        const postResp = await postRespPromise.catch(() => null);
        const postedThreadId = threadIdFromUrl(postResp?.url());
        if (finalSent) {
          await expect(adminPage.locator('.admin-inbox-message-text', { hasText: finalProbe }).first()).toBeVisible({ timeout: 8000 });
        }
        const wrongThreadLeak = await adminPage.locator('.admin-inbox-message-text', { hasText: firstMarker }).first().isVisible().catch(() => false);

        const headerMatchesFinal = (endsOnSecond ? secondLabel : firstLabel)
          && finalHeader.toLowerCase().includes((endsOnSecond ? secondLabel : firstLabel).toLowerCase().slice(0, 4));
        const threadMatchesFinal = expectedFinalThreadId != null && (postedThreadId === expectedFinalThreadId || finalThreadId === expectedFinalThreadId);
        const wrongThreadSafe = endsOnSecond ? !wrongThreadLeak : true;
        const sendConfirmed = !!finalSent;

        const productPass = !!(sendConfirmed && threadMatchesFinal && wrongThreadSafe);
        rapidSwitchProductCorrectness = productPass ? 'PASS' : 'FAIL';
        productActual = productPass
          ? `Final pane/header stayed on intended thread (expectedThread=${expectedFinalThreadId}, postedThread=${postedThreadId}, finalObservedThread=${finalThreadId}).`
          : `Mismatch after rapid switch (sendConfirmed=${sendConfirmed}, headerMatches=${headerMatchesFinal}, threadMatches=${threadMatchesFinal}, wrongThreadLeak=${wrongThreadLeak}, expectedThread=${expectedFinalThreadId}, postedThread=${postedThreadId}, finalObservedThread=${finalThreadId}).`;
        }
        }
      } else {
        // Fallback evidence model independent of /api/admin/users sidebar hydration.
        const token = await adminPage.evaluate(() => localStorage.getItem('token') || '');
        const threadsResp = await adminPage.request.get(`${BASE}/api/messages/threads`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const threadsJson = await threadsResp.json().catch(() => ({}));
        const candidates = (threadsJson?.threads || threadsJson?.data?.threads || []).filter((t) => t?.id != null).slice(0, 2);
        if (candidates.length >= 2) {
          const [a, b] = candidates;
          const openByThread = async (threadId) => {
            await adminPage.goto(`${BASE}/admin/inbox?thread=${encodeURIComponent(String(threadId))}`, { waitUntil: 'domcontentloaded' });
            await expect(adminPage.locator('.admin-inbox-form-row input[type="text"]')).toBeEnabled({ timeout: 12000 });
            await adminPage.waitForTimeout(120);
          };
          await openByThread(a.id);
          const firstMarker = `STRICT_SWITCH_A_${Date.now()}`;
          const firstSent = await sendAdminProbe(firstMarker);
          if (!firstSent) {
            rapidSwitchProductCorrectness = 'FAIL';
            productActual = 'Fallback rapid-switch check could not send on first thread because composer stayed disabled.';
          } else {
            await expect(adminPage.locator('.admin-inbox-message-text', { hasText: firstMarker }).first()).toBeVisible({ timeout: 7000 });
          await openByThread(b.id);
          const secondMarker = `STRICT_SWITCH_B_${Date.now()}`;
          const secondSent = await sendAdminProbe(secondMarker);
          if (!secondSent) {
            rapidSwitchProductCorrectness = 'FAIL';
            productActual = 'Fallback rapid-switch check could not send on second thread because composer stayed disabled.';
          } else {
            await expect(adminPage.locator('.admin-inbox-message-text', { hasText: secondMarker }).first()).toBeVisible({ timeout: 7000 });
          for (let i = 0; i < 6; i += 1) {
            const target = i % 2 === 0 ? a.id : b.id;
            await openByThread(target);
            finalThreadId = target;
          }
          const finalProbe = `STRICT_SWITCH_FINAL_${Date.now()}`;
          const postRespPromise = adminPage.waitForResponse(
            (r) => /\/api\/messages\/threads\/\d+\/messages/i.test(r.url()) && r.request().method() === 'POST',
            { timeout: 12000 }
          );
          const finalSent = await sendAdminProbe(finalProbe);
          const postResp = await postRespPromise.catch(() => null);
          const postedThreadId = Number(String(postResp?.url() || '').match(/\/api\/messages\/threads\/(\d+)\/messages/i)?.[1] || 0) || null;
          if (finalSent) {
            await expect(adminPage.locator('.admin-inbox-message-text', { hasText: finalProbe }).first()).toBeVisible({ timeout: 8000 });
          }
          const wrongThreadLeak = await adminPage.locator('.admin-inbox-message-text', { hasText: firstMarker }).first().isVisible().catch(() => false);
          const finalHeader = (await adminPage.locator('.admin-inbox-main-title').first().innerText()).trim().toLowerCase();
          const headerMatches = finalHeader.includes(String(b.username || b.name || '').toLowerCase().slice(0, 4));
          const threadMatches = postedThreadId === b.id || finalThreadId === b.id;
          const sendConfirmed = !!finalSent;
          const productPass = !!(sendConfirmed && threadMatches && !wrongThreadLeak);
          rapidSwitchProductCorrectness = productPass ? 'PASS' : 'FAIL';
          productActual = productPass
            ? `Fallback model confirmed final thread correctness (expectedThread=${b.id}, postedThread=${postedThreadId}).`
            : `Fallback model mismatch (sendConfirmed=${sendConfirmed}, headerMatches=${headerMatches}, threadMatches=${threadMatches}, wrongThreadLeak=${wrongThreadLeak}, expectedThread=${b.id}, postedThread=${postedThreadId}).`;
          }
          }
        } else {
          productActual = 'Rapid-switch product evidence unavailable: fewer than 2 candidate threads from /api/messages/threads.';
        }
      }
      const adminUsersFetchReliability = classifyAdminUsersReliability(adminIssues.network);
      if (rapidSwitchProductCorrectness === 'PASS' && adminUsersFetchReliability.status === 'RISK') rapidSwitchOverall = 'PASS_WITH_RISK';
      else if (rapidSwitchProductCorrectness === 'PASS' && adminUsersFetchReliability.status === 'PASS') rapidSwitchOverall = 'PASS';
      else rapidSwitchOverall = 'FAIL';
      await addResult({
        test: 'admin inbox: rapid thread switching / stale overwrite',
        pass: rapidSwitchProductCorrectness === 'PASS',
        steps: ['Rapidly switch between two user items', 'Observe final selected header/thread'],
        expected: 'Final selected thread remains active; no stale overwrite from prior request',
        actual: productActual,
        rapidSwitchProductCorrectness,
        adminUsersFetchReliability: adminUsersFetchReliability.status,
        rapidSwitchOverall,
        consoleIssues: adminIssues.console,
        networkIssues: adminIssues.network,
        completion: rapidSwitchOverall === 'FAIL' ? 'partial_or_unreliable' : 'complete',
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

      // 7) Admin sends 3 rapid messages: order + no duplicates
      const quickBase = `STRICT_ADMIN_BURST_${Date.now()}`;
      await adminPage.locator('.admin-inbox-user-item').first().click({ timeout: 5000 }).catch(() => {});
      await adminPage.waitForTimeout(800);
      const adminBurst = [`${quickBase}_0`, `${quickBase}_1`, `${quickBase}_2`];
      for (let i = 0; i < 3; i += 1) {
        await adminPage.locator('.admin-inbox-form-row input[type="text"]').fill(adminBurst[i]);
        await adminPage.locator('.admin-inbox-send-btn').click();
      }
      await expect(adminPage.locator('.admin-inbox-message-text', { hasText: adminBurst[2] }).first()).toBeVisible({ timeout: 12000 });
      const burstRows = adminPage.locator('.admin-inbox-message-text').filter({ hasText: quickBase });
      const burstCount = await burstRows.count();
      const burstTexts = await burstRows.allInnerTexts();
      const uniqueCount = new Set(burstTexts.map((t) => t.trim())).size;
      const idx0 = burstTexts.findIndex((t) => t.includes(adminBurst[0]));
      const idx1 = burstTexts.findIndex((t) => t.includes(adminBurst[1]));
      const idx2 = burstTexts.findIndex((t) => t.includes(adminBurst[2]));
      const inOrder = idx0 >= 0 && idx1 > idx0 && idx2 > idx1;
      const quickPass = burstCount === 3 && uniqueCount === 3 && inOrder;
      await addResult({
        test: 'admin inbox: 3 rapid sends preserve order without duplicates',
        pass: quickPass,
        steps: ['Send 3 rapid unique messages', 'Verify each appears once', 'Verify relative order in thread UI'],
        expected: 'Exactly 3 messages, no duplicates, order _0 -> _1 -> _2',
        actual: `Observed count=${burstCount}, unique=${uniqueCount}, inOrder=${inOrder}.`,
        consoleIssues: adminIssues.console,
        networkIssues: adminIssues.network,
        completion: quickPass ? 'complete' : 'partial_or_unreliable',
      });

      // 8) User sends 3 rapid messages: admin receives once each
      const userBurstBase = `STRICT_USER_BURST_${Date.now()}`;
      const userBurst = [`${userBurstBase}_0`, `${userBurstBase}_1`, `${userBurstBase}_2`];
      for (let i = 0; i < 3; i += 1) {
        await userPage.locator('.message-input').fill(userBurst[i]);
        await userPage.locator('.send-button').click();
      }
      await expect(adminPage.locator('.admin-inbox-message-text', { hasText: userBurst[2] }).first()).toBeVisible({ timeout: 15000 });
      const userBurstRows = adminPage.locator('.admin-inbox-message-text').filter({ hasText: userBurstBase });
      const userBurstCount = await userBurstRows.count();
      const userBurstTexts = await userBurstRows.allInnerTexts();
      const userUniqueCount = new Set(userBurstTexts.map((t) => t.trim())).size;
      const userBurstPass = userBurstCount === 3 && userUniqueCount === 3;
      await addResult({
        test: 'user->admin: 3 rapid sends received once each',
        pass: userBurstPass,
        steps: ['User sends 3 rapid unique messages', 'Admin thread observes burst'],
        expected: 'Admin sees all 3 unique user messages exactly once',
        actual: `Observed count=${userBurstCount}, unique=${userUniqueCount}.`,
        consoleIssues: [...adminIssues.console, ...userIssues.console],
        networkIssues: [...adminIssues.network, ...userIssues.network],
        completion: userBurstPass ? 'complete' : 'partial_or_unreliable',
      });
      await addResult({
        test: 'auth stability: no login redirect during strict run',
        pass: !loginRedirectObserved,
        steps: ['Observe top-frame navigations during entire strict suite'],
        expected: 'No main-frame navigation to /login',
        actual: loginRedirectObserved ? 'Observed navigation to /login during run.' : 'No login redirect observed.',
        consoleIssues: [...adminIssues.console, ...userIssues.console],
        networkIssues: [...adminIssues.network, ...userIssues.network],
        completion: !loginRedirectObserved ? 'complete' : 'still_unreliable',
      });

      writeMd();
      expect(loginRedirectObserved).toBeFalsy();
      expect(RESULTS.length).toBeGreaterThanOrEqual(9);
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

