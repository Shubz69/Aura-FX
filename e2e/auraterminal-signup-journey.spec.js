// @ts-check
/**
 * Full signup → OTP (pause for human / file / env) → choose free plan → logged-in smoke.
 *
 * Required env for YOUR phone (10+ national digits):
 *   SIGNUP_PHONE_NATIONAL=7123456789
 * Optional:
 *   AUDIT_BASE_URL=https://www.auraterminal.ai
 *   SIGNUP_EMAIL=shobhit2069+auraqa123@gmail.com   (default: shobhit2069+auraqa{timestamp}@gmail.com)
 *   SIGNUP_PHONE_COUNTRY=+44
 *   SIGNUP_USERNAME, SIGNUP_PASSWORD, SIGNUP_FULL_NAME
 *
 * After "SEND VERIFICATION CODES" succeeds, provide BOTH codes via EITHER:
 *   - Env: SIGNUP_EMAIL_CODE=123456 SIGNUP_SMS_CODE=654321
 *   - File (polls every 3s, max OTP_WAIT_MS): e2e/reports/signup-otp.env
 *         EMAIL=123456
 *         SMS=654321
 *         MFA=111111   (optional, if you land on /verify-mfa)
 *
 * Run: npx playwright test --config=playwright.signup.config.js
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const REPORT_DIR = path.join(process.cwd(), 'e2e', 'reports');
const OTP_FILE = path.join(REPORT_DIR, 'signup-otp.env');
const CREDS_FILE = path.join(REPORT_DIR, 'signup-credentials.txt');
const STATE_FILE = path.join(REPORT_DIR, 'auraterminal-new-user.json');
const JOURNEY_JSON = path.join(REPORT_DIR, 'signup-journey-report.json');
const JOURNEY_MD = path.join(REPORT_DIR, 'signup-journey-report.md');

/** @type {{ severity: string, phase: string, title: string, url?: string, detail?: string }[]} */
const issues = [];

function issue(severity, phase, title, detail = '', url = '') {
  issues.push({ severity, phase, title, detail, url, ts: new Date().toISOString() });
}

async function pickDialCode(page, dialCode) {
  const current = await page.locator('#phone-country .phone-country-value').innerText().catch(() => '');
  if (current.replace(/\s/g, '').includes(dialCode.replace(/\s/g, ''))) return;
  await page.locator('#phone-country').click();
  await page.getByRole('textbox', { name: 'Search country' }).fill(dialCode.replace('+', ''));
  await page
    .locator('[role="option"]')
    .filter({ has: page.locator('.phone-country-item-code', { hasText: dialCode }) })
    .first()
    .click();
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function readOtpFromEnvOrFile(page) {
  const maxMs = Number(process.env.OTP_WAIT_MS) || 900_000;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const e = process.env.SIGNUP_EMAIL_CODE?.replace(/\D/g, '').slice(0, 6);
    const s = process.env.SIGNUP_SMS_CODE?.replace(/\D/g, '').slice(0, 6);
    if (e?.length === 6 && s?.length === 6) return { email: e, sms: s, mfa: process.env.SIGNUP_MFA_CODE?.replace(/\D/g, '').slice(0, 6) || '' };

    if (fs.existsSync(OTP_FILE)) {
      const txt = fs.readFileSync(OTP_FILE, 'utf8');
      const em = txt.match(/^\s*EMAIL\s*=\s*(\d{6})\s*$/im);
      const sm = txt.match(/^\s*SMS\s*=\s*(\d{6})\s*$/im);
      const mf = txt.match(/^\s*MFA\s*=\s*(\d{6})\s*$/im);
      if (em?.[1] && sm?.[1]) {
        return { email: em[1], sms: sm[1], mfa: mf?.[1] || process.env.SIGNUP_MFA_CODE?.replace(/\D/g, '').slice(0, 6) || '' };
      }
    }
    // eslint-disable-next-line playwright/no-wait-for-timeout -- polling for human OTP
    await page.waitForTimeout(3000);
  }
  throw new Error(
    `Timed out after ${maxMs}ms waiting for OTP. Set SIGNUP_EMAIL_CODE + SIGNUP_SMS_CODE or create ${OTP_FILE} with EMAIL=###### and SMS=######`,
  );
}

test.describe.serial('Aura Terminal — signup from scratch', () => {
  test.setTimeout(1_800_000);

  test('register → verify → free plan → smoke (non-destructive)', async ({ page, context }) => {
    fs.mkdirSync(REPORT_DIR, { recursive: true });

    const ts = Date.now();
    const username = (process.env.SIGNUP_USERNAME || `auraqa_${ts}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
    const password = process.env.SIGNUP_PASSWORD || `AuraQa!${ts}Aa9`;
    const fullName = process.env.SIGNUP_FULL_NAME || 'Playwright QA Trader';
    const email = (process.env.SIGNUP_EMAIL || `shobhit2069+auraqa${ts}@gmail.com`).trim().toLowerCase();
    const phoneCountry = (process.env.SIGNUP_PHONE_COUNTRY || '+44').trim();
    const phoneNational = (process.env.SIGNUP_PHONE_NATIONAL || '').replace(/\D/g, '');

    if (phoneNational.length < 10) {
      issue('critical', 'preflight', 'SIGNUP_PHONE_NATIONAL missing or too short', 'Need 10+ digits (national only, no country prefix).', '');
      fs.writeFileSync(
        CREDS_FILE,
        [
          'INSTRUCTIONS:',
          'Set environment variables then re-run:',
          '  SIGNUP_PHONE_NATIONAL=your_mobile_digits_only (10+)',
          '  SIGNUP_PHONE_COUNTRY=+44   (or +91, etc.)',
          'Optional: SIGNUP_EMAIL=your+tag@gmail.com',
          '',
          `Default email if unset: ${email}`,
        ].join('\n'),
        'utf8',
      );
      throw new Error(
        'Set SIGNUP_PHONE_NATIONAL (10+ digits) and optionally SIGNUP_PHONE_COUNTRY. Credentials template written to e2e/reports/signup-credentials.txt',
      );
    }

    fs.writeFileSync(
      CREDS_FILE,
      [
        '=== Aura Terminal Playwright signup (keep private) ===',
        `BASE=${BASE}`,
        `USERNAME=${username}`,
        `EMAIL=${email}`,
        `PHONE_COUNTRY=${phoneCountry}`,
        `PHONE_NATIONAL=${phoneNational}`,
        `PASSWORD=${password}`,
        '',
        'After promotion to admin, run:',
        '  set ADMIN_AUDIT=1',
        '  npx playwright test --config=playwright.admin.config.js',
      ].join('\n'),
      'utf8',
    );

    issue('info', 'preflight', 'Using invented username/password; email/phone from env', CREDS_FILE, BASE);

    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`${page.url()} :: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      issue('medium', 'runtime', 'pageerror', err.message, page.url());
    });

    await test.step('Open /register', async () => {
      await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#username')).toBeVisible();
    });

    await test.step('Fill registration form', async () => {
      await page.locator('#username').fill(username);
      await page.locator('#email').fill(email);
      await page.locator('#name').fill(fullName);
      await pickDialCode(page, phoneCountry);
      await page.locator('#phone-national').fill(phoneNational);
      await page.locator('#password').fill(password);
      await page.locator('#confirmPassword').fill(password);
      await page.locator('#terms').check();
    });

    await test.step('Send verification codes', async () => {
      await page.getByRole('button', { name: /SEND VERIFICATION CODES/i }).click();
      const err = page.locator('.error-message');
      const ok = page.locator('.success-message');
      await Promise.race([
        ok.waitFor({ state: 'visible', timeout: 120_000 }),
        err.waitFor({ state: 'visible', timeout: 120_000 }),
      ]).catch(() => null);
      if (await err.isVisible().catch(() => false)) {
        const t = await err.innerText();
        issue('high', 'verify-send', 'Send codes error', t, page.url());
        throw new Error(`Send verification failed: ${t}`);
      }
      await expect(page.locator('#email-code-register')).toBeVisible({ timeout: 60_000 });
    });

    issue(
      'info',
      'otp',
      'PAUSE — enter codes in env or file',
      `Set SIGNUP_EMAIL_CODE and SIGNUP_SMS_CODE, or create ${OTP_FILE} with EMAIL=###### and SMS=###### (then save). Waiting up to OTP_WAIT_MS.`,
      page.url(),
    );

    const otp = await test.step('Wait for email + SMS codes (human / file / env)', async () => readOtpFromEnvOrFile(page));

    await test.step('Submit OTP + complete signup', async () => {
      await page.locator('#email-code-register').fill(otp.email);
      await page.locator('#phone-code-register').fill(otp.sms);
      await page.getByRole('button', { name: /VERIFY & SIGN UP/i }).click();
      await page.waitForURL(/choose-plan|verify-mfa|community|subscription/i, { timeout: 180_000 }).catch(() => null);
    });

    if (page.url().includes('/verify-mfa')) {
      await test.step('MFA if required', async () => {
        let code = otp.mfa || process.env.SIGNUP_MFA_CODE?.replace(/\D/g, '').slice(0, 6) || '';
        if (code.length !== 6) {
          const max = Date.now() + (Number(process.env.OTP_WAIT_MS) || 600_000);
          while (code.length !== 6 && Date.now() < max) {
            if (fs.existsSync(OTP_FILE)) {
              const txt = fs.readFileSync(OTP_FILE, 'utf8');
              const mf = txt.match(/^\s*MFA\s*=\s*(\d{6})\s*$/im);
              if (mf?.[1]) code = mf[1];
            }
            // eslint-disable-next-line playwright/no-wait-for-timeout
            await page.waitForTimeout(3000);
          }
        }
        if (code.length !== 6) {
          issue('high', 'mfa', 'MFA required but no SIGNUP_MFA_CODE or MFA= in otp file', '', page.url());
          throw new Error('Add MFA=###### to signup-otp.env or set SIGNUP_MFA_CODE');
        }
        await page.locator('input.code-input').fill(code);
        await page.getByRole('button', { name: /Verify Code/i }).click();
        await page.waitForURL(/choose-plan|community|subscription/i, { timeout: 120_000 });
      });
    }

    await test.step('Choose Free plan (no Stripe)', async () => {
      if (/\/community/i.test(page.url())) {
        issue('info', 'plan', 'Already on /community; skipping plan picker', '', page.url());
        return;
      }
      if (!page.url().includes('choose-plan')) {
        await page.goto(`${BASE}/choose-plan`, { waitUntil: 'domcontentloaded' });
      }
      const freeBtn = page.getByRole('button', { name: /Select Free Plan/i });
      if (await freeBtn.isVisible().catch(() => false)) {
        await freeBtn.click();
        await page.waitForURL(/community/i, { timeout: 120_000 });
      } else {
        issue('medium', 'plan', 'Select Free Plan not visible', 'User may already have entitlements or blocked UI.', page.url());
      }
    });

    await test.step('Save session for admin audit later', async () => {
      await context.storageState({ path: STATE_FILE });
    });

    await test.step('Post-signup smoke (non-destructive)', async () => {
      const urls = [
        '/',
        '/courses',
        '/explore',
        '/trader-deck',
        '/journal',
        '/reports',
        '/aura-analysis',
        '/profile',
        '/messages',
      ];
      for (const p of urls) {
        try {
          await page.goto(`${BASE}${p}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
          await page.mouse.wheel(0, 600);
          // eslint-disable-next-line playwright/no-wait-for-timeout
          await page.waitForTimeout(400);
        } catch (e) {
          issue('medium', 'smoke', `Smoke navigation issue ${p}`, String(/** @type {Error} */ (e).message), `${BASE}${p}`);
        }
      }
    });

    const summary = {
      base: BASE,
      username,
      email,
      phoneCountry,
      phoneNationalDigits: phoneNational,
      issues,
      consoleErrorsSample: consoleErrors.slice(0, 30),
      finishedAt: new Date().toISOString(),
    };
    fs.writeFileSync(JOURNEY_JSON, JSON.stringify(summary, null, 2), 'utf8');
    fs.writeFileSync(
      JOURNEY_MD,
      [
        '# Signup journey report',
        '',
        `- Finished: ${summary.finishedAt}`,
        `- User: **${username}**`,
        `- Email: ${email}`,
        '',
        '## Issues',
        ...issues.map((i) => `- **${i.severity}** [${i.phase}] ${i.title}: ${i.detail} ${i.url ? `(${i.url})` : ''}`),
        '',
        '## Console errors (sample)',
        ...consoleErrors.slice(0, 20).map((c) => `- ${c}`),
      ].join('\n'),
      'utf8',
    );
  });
});
