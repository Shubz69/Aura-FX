// @ts-check
import { defineConfig, devices } from '@playwright/test';

/** Single-browser, serial live audit against production (or AUDIT_BASE_URL). */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/auraterminal-live-audit.spec.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report' }]],
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 12_000,
    navigationTimeout: 60_000,
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
