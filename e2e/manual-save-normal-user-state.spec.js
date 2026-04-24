// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const OUT_STATE = path.join(process.cwd(), 'e2e', 'reports', 'auraterminal-normal-user.json');

test('manual assisted: save normal user state', async ({ page, context }) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Manual checkpoint: user completes login in headed browser, then clicks Resume in Playwright Inspector.
  await page.pause();

  await page.goto(`${BASE}/community`, { waitUntil: 'domcontentloaded', timeout: 35000 });

  const channelsSection = page.locator('.channels-section').first();
  const signInHeading = page.getByRole('heading', { name: /^sign in$/i });
  try {
    await Promise.race([
      channelsSection.waitFor({ state: 'visible', timeout: 35000 }),
      page.waitForURL(/\/login(\?|$)/i, { timeout: 35000 }),
      signInHeading.waitFor({ state: 'visible', timeout: 35000 }),
    ]);
  } catch {
    // settle; assertions below
  }

  const url = page.url();
  expect(/\/login(\?|$)/i.test(url), `Still on login URL: ${url}`).toBeFalsy();
  expect(await signInHeading.isVisible().catch(() => false)).toBeFalsy();

  const shellOk =
    (await channelsSection.isVisible().catch(() => false)) ||
    (await page.locator('#community-message-input').isVisible().catch(() => false));
  expect(shellOk, 'Community channels shell or message input not visible').toBeTruthy();

  fs.mkdirSync(path.dirname(OUT_STATE), { recursive: true });
  await context.storageState({ path: OUT_STATE });
  expect(fs.existsSync(OUT_STATE)).toBeTruthy();
});

