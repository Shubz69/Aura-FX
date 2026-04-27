// @ts-check
import { defineConfig, devices } from '@playwright/test';

/** Focused QA: Operator Intelligence only, single browser, one worker (avoids storage races). */
export default defineConfig({
  testDir: '.',
  testMatch: ['tests/operator-intelligence.spec.js'],
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report-operator-intelligence' }]],
  use: {
    // Must match CRA dev server host so `connect-src 'self'` matches `/api/*` (localhost ≠ 127.0.0.1 for CSP).
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Strip REACT_APP_API_URL so Api.js uses same-origin `/api` (avoids CSP when host ≠ REACT_APP_API_URL host).
    command: 'cross-env BROWSER=none REACT_APP_API_URL= npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 240000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
