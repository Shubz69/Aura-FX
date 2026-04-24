// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/final-hardcheck-production.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 180 * 60 * 1000,
  expect: { timeout: 12000 },
  reporter: [['list'], ['json', { outputFile: 'e2e/reports/final-hardcheck-playwright-results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    navigationTimeout: 60000,
    actionTimeout: 20000,
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: {} }],
});

