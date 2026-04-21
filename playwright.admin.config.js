// @ts-check
import { defineConfig, devices } from '@playwright/test';

/** Full-suite ceiling: 3 hours (single command may run multiple serial tests). */
const GLOBAL_MAX_MS = 10_800_000;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/auraterminal-admin-audit.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report-admin' }]],
  timeout: GLOBAL_MAX_MS,
  use: {
    ...devices['Desktop Chrome'],
    storageState: 'e2e/reports/auraterminal-new-user.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 20_000,
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: {} }],
});
