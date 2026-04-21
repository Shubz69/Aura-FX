// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const CREDS_FILE = path.join(process.cwd(), 'e2e', 'reports', 'signup-credentials.txt');
const OUT_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');

function readCreds() {
  if (!fs.existsSync(CREDS_FILE)) return null;
  const lines = fs.readFileSync(CREDS_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  const map = {};
  for (const l of lines) {
    const idx = l.indexOf('=');
    if (idx > 0) map[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
  }
  if (!map.EMAIL || !map.PASSWORD) return null;
  return { email: map.EMAIL, username: map.USERNAME || '', password: map.PASSWORD };
}

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

test('create normal-user storage state', async ({ page, context }) => {
  const creds = readCreds();
  expect(creds).toBeTruthy();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await dismissConsentIfPresent(page);

  const submit = page.locator('button[type="submit"], button:has-text("Sign"), button:has-text("Log")').first();
  const idField = page.locator('input[type="email"], input[name="email"], #email, input[name="username"], input[type="text"]').first();
  const passField = page.locator('input[type="password"]').first();

  const ids = [creds.email, creds.username, creds.email.toLowerCase()].filter(Boolean);
  let ok = false;
  for (const id of ids) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await dismissConsentIfPresent(page);
    await idField.fill(id);
    await passField.fill(creds.password);
    await submit.click({ timeout: 10000, force: true });
    await page.waitForTimeout(3500);
    if (!/\/login(\?|$)/i.test(page.url())) {
      ok = true;
      break;
    }
  }

  expect(ok).toBeTruthy();
  fs.mkdirSync(path.dirname(OUT_STATE), { recursive: true });
  await context.storageState({ path: OUT_STATE });
  expect(fs.existsSync(OUT_STATE)).toBeTruthy();
});

