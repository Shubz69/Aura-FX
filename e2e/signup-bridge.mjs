/**
 * Signup until OTP, then wait for HTTP POST with codes (so the assistant can continue from chat).
 *
 * After codes are sent, reply in Cursor chat with:
 *   EMAIL=xxxxxx
 *   SMS=xxxxxx
 *   (optional) MFA=xxxxxx
 * The assistant will run:
 *   curl -s -X POST http://127.0.0.1:PORT/otp -H "Content-Type: application/json" -d "{\"email\":\"xxxxxx\",\"sms\":\"xxxxxx\",\"mfa\":\"\"}"
 *
 * Env: AUDIT_BASE_URL, SIGNUP_EMAIL, SIGNUP_PHONE_COUNTRY, SIGNUP_PHONE_NATIONAL,
 *      SIGNUP_USERNAME, SIGNUP_PASSWORD, SIGNUP_FULL_NAME, SIGNUP_OTP_PORT (default 9877)
 */
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const BASE = (process.env.AUDIT_BASE_URL || 'https://www.auraterminal.ai').replace(/\/$/, '');
const PORT = Number(process.env.SIGNUP_OTP_PORT || 9877);
const OTP_WAIT_MS = Number(process.env.OTP_WAIT_MS) || 1_800_000;
const REPORT_DIR = path.join(process.cwd(), 'e2e', 'reports');

const email = (process.env.SIGNUP_EMAIL || '').trim();
const phoneCountry = (process.env.SIGNUP_PHONE_COUNTRY || '+44').trim();
const phoneNational = (process.env.SIGNUP_PHONE_NATIONAL || '').replace(/\D/g, '');
const ts = Date.now();
const username = (process.env.SIGNUP_USERNAME || `auraqa_${ts}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
const password = process.env.SIGNUP_PASSWORD || `AuraQa!${ts}Aa9`;
const fullName = process.env.SIGNUP_FULL_NAME || 'Playwright QA Trader';

const issues = [];
function note(sev, title, detail = '') {
  issues.push({ sev, title, detail, t: new Date().toISOString() });
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

if (!email || !email.includes('@')) {
  console.error('Set SIGNUP_EMAIL');
  process.exit(1);
}
if (phoneNational.length < 10) {
  console.error('Set SIGNUP_PHONE_NATIONAL (10+ digits)');
  process.exit(1);
}

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(
  path.join(REPORT_DIR, 'signup-credentials.txt'),
  [
    '=== signup-bridge (keep private) ===',
    `BASE=${BASE}`,
    `USERNAME=${username}`,
    `EMAIL=${email}`,
    `PHONE_COUNTRY=${phoneCountry}`,
    `PHONE_NATIONAL=${phoneNational}`,
    `PASSWORD=${password}`,
    `OTP_BRIDGE=http://127.0.0.1:${PORT}/otp`,
  ].join('\n'),
  'utf8',
);

let settleOtp;
const otpPromise = new Promise((resolve, reject) => {
  settleOtp = { resolve, reject };
  setTimeout(() => reject(new Error(`OTP wait timeout ${OTP_WAIT_MS}ms`)), OTP_WAIT_MS);
});

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/otp') {
    let body = '';
    req.on('data', (c) => {
      body += c;
    });
    req.on('end', () => {
      try {
        const j = JSON.parse(body || '{}');
        const em = String(j.email || '').replace(/\D/g, '').slice(0, 6);
        const sm = String(j.sms || '').replace(/\D/g, '').slice(0, 6);
        const mf = String(j.mfa || '').replace(/\D/g, '').slice(0, 6);
        if (em.length === 6 && sm.length === 6) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
          settleOtp.resolve({ email: em, sms: sm, mfa: mf.length === 6 ? mf : '' });
        } else {
          res.writeHead(400);
          res.end('need email and sms 6 digits each as JSON {"email":"123456","sms":"654321"}');
        }
      } catch (e) {
        res.writeHead(400);
        res.end(String(e.message));
      }
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end('waiting-for-otp');
    return;
  }
  res.writeHead(404);
  res.end();
});

await new Promise((res, rej) => {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`\n[signup-bridge] listening POST http://127.0.0.1:${PORT}/otp\n`);
    res();
  });
  server.on('error', rej);
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') note('low', 'console.error', `${page.url()} ${msg.text()}`);
});

try {
  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  const gdprAgree = page.getByRole('button', { name: /I Agree/i });
  if (await gdprAgree.isVisible({ timeout: 5000 }).catch(() => false)) {
    await gdprAgree.click();
    await page.locator('.gdpr-backdrop').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => null);
  }
  await page.locator('#username').fill(username);
  await page.locator('#email').fill(email);
  await page.locator('#name').fill(fullName);
  await pickDialCode(page, phoneCountry);
  await page.locator('#phone-national').fill(phoneNational);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.locator('#terms').check({ force: true });
  await page.getByRole('button', { name: /SEND VERIFICATION CODES/i }).click();

  const err = page.locator('.error-message');
  const ok = page.locator('.success-message');
  await Promise.race([
    ok.waitFor({ state: 'visible', timeout: 120_000 }),
    err.waitFor({ state: 'visible', timeout: 120_000 }),
  ]).catch(() => null);
  if (await err.isVisible().catch(() => false)) {
    const t = await err.innerText();
    note('high', 'send-codes-failed', t);
    throw new Error(t);
  }
  await page.locator('#email-code-register').waitFor({ state: 'visible', timeout: 60_000 });

  console.log('\n=== Codes sent. STOP — reply in chat with: ===');
  console.log('EMAIL=xxxxxx');
  console.log('SMS=xxxxxx');
  console.log('(optional) MFA=xxxxxx');
  console.log(`\nAssistant will POST to: http://127.0.0.1:${PORT}/otp\n`);

  const otp = await otpPromise;

  await page.locator('#email-code-register').fill(otp.email);
  await page.locator('#phone-code-register').fill(otp.sms);
  await page.getByRole('button', { name: /VERIFY & SIGN UP/i }).click();
  await page.waitForURL(/choose-plan|verify-mfa|community|subscription/i, { timeout: 180_000 }).catch(() => null);

  if (page.url().includes('/verify-mfa')) {
    let mfa = otp.mfa || '';
    if (mfa.length !== 6) {
      note('high', 'mfa-required', 'Provide MFA in POST body next time or extend bridge');
      throw new Error('MFA required but no 6-digit mfa in POST');
    }
    await page.locator('input.code-input').fill(mfa);
    await page.getByRole('button', { name: /Verify Code/i }).click();
    await page.waitForURL(/choose-plan|community|subscription/i, { timeout: 120_000 });
  }

  if (!page.url().includes('/community')) {
    if (!page.url().includes('choose-plan')) {
      await page.goto(`${BASE}/choose-plan`, { waitUntil: 'domcontentloaded' });
    }
    const freeBtn = page.getByRole('button', { name: /Select Free Plan/i });
    if (await freeBtn.isVisible().catch(() => false)) {
      await freeBtn.click();
      await page.waitForURL(/community/i, { timeout: 120_000 });
    } else {
      note('medium', 'free-plan', 'Select Free Plan not visible');
    }
  }

  await context.storageState({ path: path.join(REPORT_DIR, 'auraterminal-new-user.json') });

  const out = {
    ok: true,
    finalUrl: page.url(),
    username,
    email,
    issues,
    at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'signup-bridge-result.json'), JSON.stringify(out, null, 2), 'utf8');
  console.log('\n[signup-bridge] DONE', out.finalUrl);
} catch (e) {
  note('critical', 'fatal', String(e.message || e));
  fs.writeFileSync(
    path.join(REPORT_DIR, 'signup-bridge-result.json'),
    JSON.stringify({ ok: false, issues, error: String(e.message || e) }, null, 2),
    'utf8',
  );
  console.error(e);
  process.exitCode = 1;
} finally {
  server.close();
  await browser.close().catch(() => {});
}
