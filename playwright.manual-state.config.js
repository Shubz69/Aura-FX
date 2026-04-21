// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/manual-save-*-state.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report-manual-state' }]],
  timeout: 45 * 60 * 1000,
  use: {
    ...devices['Desktop Chrome'],
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 30000,
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: {} }],
});

