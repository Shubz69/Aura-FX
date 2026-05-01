// @ts-check
import { defineConfig, devices } from '@playwright/test';

const useStorage = !process.env.AURA_PRODUCTION_LOGIN_EMAIL;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/backtesting-new-production-retest.spec.js',
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, ''),
    ...(useStorage ? { storageState: 'e2e/reports/auraterminal-new-user.json' } : {}),
    trace: 'on',
    screenshot: 'only-on-failure',
    navigationTimeout: 45_000,
    ignoreHTTPSErrors: true,
  },
  projects: [{ name: 'chromium', use: {} }],
});
