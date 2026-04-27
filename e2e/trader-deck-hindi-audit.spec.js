import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/** Unsigned JWT (jwt-decode only); exp far future. */
const TEST_JWT =
  'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJpZCI6OTk5LCJlbWFpbCI6InB3QHRlc3QuY29tIiwicm9sZSI6IlVTRVIiLCJleHAiOjQxMDI0NDQ4MDB9.e30';

test.describe('trader-deck Hindi visual audit', () => {
  test('loads /trader-deck in Hindi, screenshot + body text', async ({ page }) => {
    await page.addInitScript(
      ({ token }) => {
        try {
          localStorage.setItem('aura_site_language_pref', 'hi');
          localStorage.setItem(
            'user',
            JSON.stringify({
              id: 999,
              email: 'pw@test.com',
              username: 'pwtest',
              name: 'PW Test',
              role: 'USER',
              preferredLanguage: 'hi',
            }),
          );
          localStorage.setItem('token', token);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('init storage', e);
        }
      },
      { token: TEST_JWT },
    );

    await page.goto('/trader-deck', { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('#td-deck-top').waitFor({ state: 'visible', timeout: 120000 });
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');

    const outDir = path.join(process.cwd(), 'test-results');
    fs.mkdirSync(outDir, { recursive: true });
    const shot = path.join(outDir, 'trader-deck-hi-audit.png');
    const textPath = path.join(outDir, 'trader-deck-hi-body.txt');

    await page.screenshot({ path: shot, fullPage: true });
    const bodyText = await page.evaluate(() => document.body.innerText || '');
    fs.writeFileSync(textPath, bodyText, 'utf8');

    expect(bodyText.length).toBeGreaterThan(200);
  });
});
