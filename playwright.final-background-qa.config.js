// @ts-check
/** One-shot full-site soft-fail QA pass (user + admin). */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/final-background-full-qa-pass.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 95 * 60 * 1000,
  expect: { timeout: 12000 },
  reporter: [['list'], ['json', { outputFile: 'e2e/reports/final-background-qa-playwright-results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    navigationTimeout: 60000,
    ignoreHTTPSErrors: true,
    actionTimeout: 20000,
  },
  projects: [{ name: 'chromium', use: {} }],
});
