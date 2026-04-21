// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/targeted-verification.spec.js',
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report-targeted' }]],
  timeout: 25 * 60 * 1000,
  use: {
    ...devices['Desktop Chrome'],
    storageState: 'e2e/reports/auraterminal-new-user.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    navigationTimeout: 20000,
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: {} }],
});

