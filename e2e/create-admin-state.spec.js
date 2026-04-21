// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const OUT_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-admin.json');
const ADMIN_USERNAME = 'Shubzinho';
const ADMIN_PASSWORD = 'Shobhit2002!';

async function dismissConsentIfPresent(page) {
  const backdrop = page.locator('.gdpr-backdrop');
  if (!(await backdrop.isVisible().catch(() => false))) return;
  const consent = page
    .locator('button:has-text("Accept"), button:has-text("Agree"), button:has-text("Allow"), button:has-text("Got it")')
    .first();
  if (await consent.isVisible().catch(() => false)) {
    await consent.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.keyboard.press('Escape').catch(() => {});
    await backdrop.click({ position: { x: 5, y: 5 } }).catch(() => {});
  }
}

test('create admin storage state', async ({ page, context }) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await dismissConsentIfPresent(page);

  const idField = page
    .locator('input[type="email"], input[name="email"], #email, input[name="username"], input[type="text"]')
    .first();
  const passField = page.locator('input[type="password"]').first();
  const submit = page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Log")').first();

  await idField.fill(ADMIN_USERNAME);
  await passField.fill(ADMIN_PASSWORD);
  await submit.click({ timeout: 12000, force: true });
  await page.waitForTimeout(4000);

  expect(/\/login(\?|$)/i.test(page.url())).toBeFalsy();

  fs.mkdirSync(path.dirname(OUT_STATE), { recursive: true });
  await context.storageState({ path: OUT_STATE });
  expect(fs.existsSync(OUT_STATE)).toBeTruthy();
});

