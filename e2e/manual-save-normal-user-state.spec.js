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

  const url = page.url();
  const okRoute = /\/(community|dashboard|messages|profile|reports|admin)(\/|\?|$)/i.test(url);
  expect(/\/login(\?|$)/i.test(url), `Still on login URL: ${url}`).toBeFalsy();
  expect(okRoute, `Not on authenticated app route: ${url}`).toBeTruthy();

  fs.mkdirSync(path.dirname(OUT_STATE), { recursive: true });
  await context.storageState({ path: OUT_STATE });
  expect(fs.existsSync(OUT_STATE)).toBeTruthy();
});

