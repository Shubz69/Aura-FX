# Playwright: new account signup + admin audit

## 1. Email / phone (your rules)

- **Email:** defaults to `shobhit2069+auraqa{timestamp}@gmail.com` (Gmail plus-addressing). Override with `SIGNUP_EMAIL` if you use another host.
- **Phone:** you **must** set national digits (no country prefix in this variable):
  - `SIGNUP_PHONE_NATIONAL` — **10+ digits** only (e.g. UK mobile without leading 0: `7700900123`).
  - `SIGNUP_PHONE_COUNTRY` — optional, default `+44` (change to `+91` etc. if needed).

## 2. Invented fields (automatic)

- Username: `auraqa_{timestamp}` (override `SIGNUP_USERNAME`)
- Password: strong random (override `SIGNUP_PASSWORD`)
- Full name: `Playwright QA Trader` (override `SIGNUP_FULL_NAME`)

Credentials are written to **`e2e/reports/signup-credentials.txt`** (gitignored).

## 3. When email + SMS codes are required

After **SEND VERIFICATION CODES**, the test **waits** (default **15 minutes**, override with `OTP_WAIT_MS` in ms).

Provide codes in **either** way:

### A) Environment variables

```powershell
$env:SIGNUP_EMAIL_CODE="123456"
$env:SIGNUP_SMS_CODE="654321"
npm run test:e2e:signup
```

### B) File (polls every 3 seconds)

Create **`e2e/reports/signup-otp.env`**:

```env
EMAIL=123456
SMS=654321
```

Optional if you hit **`/verify-mfa`**:

```env
MFA=111111
```

Or set `SIGNUP_MFA_CODE`.

## 4. Run signup

```powershell
cd "path\to\Aura FX"
$env:SIGNUP_PHONE_NATIONAL="YOUR_DIGITS_ONLY"
$env:SIGNUP_PHONE_COUNTRY="+44"
npm run test:e2e:signup
```

Optional:

```powershell
$env:AUDIT_BASE_URL="https://www.auraterminal.ai"
$env:OTP_WAIT_MS="1800000"
```

Session is saved to **`e2e/reports/auraterminal-new-user.json`** (gitignored).

## 5. After you promote the user to admin

```powershell
npm run test:e2e:admin
```

Reports: **`e2e/reports/admin-audit-report.md`** and **`admin-audit-data.json`**.

## 6. Non-destructive rule

The scripts avoid paid Stripe links and destructive actions. Admin audit **only loads** admin URLs and scrolls lightly.
