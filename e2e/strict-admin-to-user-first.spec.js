// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const ADMIN_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-admin.json');
const USER_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');

async function authedJson(page, endpoint, { method = 'GET', body = null } = {}) {
  return page.evaluate(async ({ endpoint, method, body }) => {
    const token = localStorage.getItem('token');
    const rawUser = localStorage.getItem('user');
    const user = rawUser ? JSON.parse(rawUser) : null;
    const headers = {
      Authorization: token ? `Bearer ${token}` : '',
      'Content-Type': 'application/json',
    };
    const res = await fetch(endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, user };
  }, { endpoint, method, body });
}

function readUserIdentityFromState() {
  const raw = JSON.parse(fs.readFileSync(USER_STATE, 'utf8'));
  const origin = (raw?.origins || []).find((o) => o.origin === BASE) || (raw?.origins || [])[0];
  const userEntry = (origin?.localStorage || []).find((x) => x.name === 'user');
  const userObj = userEntry?.value ? JSON.parse(userEntry.value) : null;
  return {
    id: userObj?.id != null ? String(userObj.id) : '',
    username: String(userObj?.username || '').trim(),
    email: String(userObj?.email || '').trim(),
    name: String(userObj?.name || '').trim(),
  };
}

test('strict first check: admin to user live delivery', async ({ browser }) => {
  if (!fs.existsSync(ADMIN_STATE)) throw new Error(`Missing admin state: ${ADMIN_STATE}`);
  if (!fs.existsSync(USER_STATE)) throw new Error(`Missing user state: ${USER_STATE}`);
  const targetUser = readUserIdentityFromState();
  if (!targetUser.id) throw new Error('Could not resolve normal-user identity from user state');

  const adminCtx = await browser.newContext({ storageState: ADMIN_STATE });
  const userCtx = await browser.newContext({ storageState: USER_STATE });
  const adminPage = await adminCtx.newPage();
  const userPage = await userCtx.newPage();
  try {
    let supportThreadId = null;
    let adminMsg = '';

    await test.step('1) normal user can access /messages as authenticated user', async () => {
      await userPage.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' });
      const current = userPage.url();
      if (current.includes('/login')) {
        throw new Error(`STEP 1 FAILED: user was redirected to /login from /messages (${current})`);
      }
    });

    await test.step('2) user support thread is ensured and concrete threadId is present', async () => {
      const ensured = await authedJson(userPage, '/api/messages/threads/ensure-admin', {
        method: 'POST',
        body: { userId: Number(targetUser.id) },
      });
      const id = ensured?.json?.thread?.id;
      if (!ensured.ok || !id) {
        throw new Error(`STEP 2 FAILED: ensure-admin did not return a thread id (status=${ensured.status})`);
      }
      supportThreadId = String(id);
    });

    await test.step('3) admin opens /admin/inbox for that same user', async () => {
      await adminPage.goto(`${BASE}/admin/inbox?user=${encodeURIComponent(targetUser.id)}`, { waitUntil: 'domcontentloaded' });
      const current = adminPage.url();
      if (current.includes('/login')) {
        throw new Error(`STEP 3 FAILED: admin was redirected to /login (${current})`);
      }
    });

    await test.step('4) admin is bound to the same threadId', async () => {
      const adminEnsure = await authedJson(adminPage, '/api/messages/threads/ensure-admin', {
        method: 'POST',
        body: { userId: Number(targetUser.id) },
      });
      const adminThreadId = adminEnsure?.json?.thread?.id ? String(adminEnsure.json.thread.id) : null;
      if (!adminEnsure.ok || !adminThreadId) {
        throw new Error(`STEP 4 FAILED: admin ensure-admin did not return a thread id (status=${adminEnsure.status})`);
      }
      if (adminThreadId !== supportThreadId) {
        throw new Error(`STEP 4 FAILED: thread mismatch (user=${supportThreadId}, admin=${adminThreadId})`);
      }
      const adminInput = adminPage.locator('.admin-inbox-form-row input[type="text"]');
      await expect(adminInput).toBeEnabled({ timeout: 30000 });
    });

    await test.step('5) admin send request completes successfully', async () => {
      adminMsg = `STRICT_ADMIN_TO_USER_${Date.now()}`;
      const adminInput = adminPage.locator('.admin-inbox-form-row input[type="text"]');
      await adminInput.fill(adminMsg);
      const postResponsePromise = adminPage.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().includes(`/api/messages/threads/${supportThreadId}/messages`) &&
          r.status() >= 200 &&
          r.status() < 300,
        { timeout: 12000 },
      );
      await adminPage.locator('.admin-inbox-send-btn').click();
      await postResponsePromise;
    });

    await test.step('6) user receives the new message on that same thread', async () => {
      const deadline = Date.now() + 12000;
      let found = false;
      while (Date.now() < deadline) {
        const msgResp = await authedJson(userPage, `/api/messages/threads/${supportThreadId}/messages?limit=50`);
        const rows = Array.isArray(msgResp?.json?.messages) ? msgResp.json.messages : [];
        if (rows.some((m) => String(m?.body || '') === adminMsg)) {
          found = true;
          break;
        }
        await userPage.waitForTimeout(500);
      }
      if (!found) {
        throw new Error(`STEP 6 FAILED: message not found via user thread API for thread ${supportThreadId}`);
      }
    });

    await test.step('7) message becomes visible within realtime window', async () => {
      await expect(userPage.locator('.message-content', { hasText: adminMsg }).first()).toBeVisible({ timeout: 7000 });
    });
  } finally {
    await adminCtx.close();
    await userCtx.close();
  }
});

