// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/auraterminal-signup-journey.spec.js',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/playwright-report-signup' }]],
  timeout: 1_800_000,
  expect: { timeout: 20_000 },
  use: {
    ...devices['Desktop Chrome'],
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'on',
    actionTimeout: 25_000,
    navigationTimeout: 90_000,
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: {} }],
});
