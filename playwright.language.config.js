// @ts-check
import { defineConfig, devices } from '@playwright/test';

/** i18n / RTL checks only; starts CRA when no server is listening. */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/language-support.spec.js', '**/trader-deck-hindi-audit.spec.js'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
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
