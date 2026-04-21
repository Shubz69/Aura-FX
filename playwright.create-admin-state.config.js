// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/create-admin-state.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report-create-admin-state' }]],
  timeout: 15 * 60 * 1000,
  use: {
    ...devices['Desktop Chrome'],
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 25000,
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: {} }],
});

