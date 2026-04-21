/** One-off: load saved session, wait for Choose Plan UI, click Free, refresh storage. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-new-user.json');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: STATE });
const page = await ctx.newPage();
await page.goto(`${BASE}/choose-plan`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
const btn = page.getByRole('button', { name: /Select Free Plan/i });
await btn.waitFor({ state: 'visible', timeout: 120_000 });
await btn.click();
await page.waitForURL(/community/i, { timeout: 120_000 });
await ctx.storageState({ path: STATE });
fs.writeFileSync(
  path.join(process.cwd(), 'e2e', 'reports', 'signup-free-plan-finish.json'),
  JSON.stringify({ ok: true, url: page.url(), at: new Date().toISOString() }, null, 2),
);
await browser.close();
console.log('OK', page.url());
