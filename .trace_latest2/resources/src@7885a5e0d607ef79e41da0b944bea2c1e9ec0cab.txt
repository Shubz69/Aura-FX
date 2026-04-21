// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const ADMIN_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-admin.json');
const USER_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');

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
    await adminPage.goto(`${BASE}/admin/inbox?user=${encodeURIComponent(targetUser.id)}`, { waitUntil: 'domcontentloaded' });
    await userPage.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded' });
    // Wait until admin thread is actually ready (input enabled) before sending.
    const adminInput = adminPage.locator('.admin-inbox-form-row input[type="text"]');
    await expect(adminInput).toBeEnabled({ timeout: 30000 });
    const adminMsg = `STRICT_ADMIN_TO_USER_${Date.now()}`;
    await adminInput.fill(adminMsg);
    await adminPage.locator('.admin-inbox-send-btn').click();
    await expect(userPage.locator('.message-content', { hasText: adminMsg }).first()).toBeVisible({ timeout: 7000 });
  } finally {
    await adminCtx.close();
    await userCtx.close();
  }
});

