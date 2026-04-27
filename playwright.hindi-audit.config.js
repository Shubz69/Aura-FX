// @ts-check
import { defineConfig, devices } from '@playwright/test';

/** Hindi visual i18n audit — screenshots under e2e/artifacts/hindi-i18n-audit/ */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/hindi-visual-i18n-audit.spec.js',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'cross-env BROWSER=none npm run start',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 240000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
