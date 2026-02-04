# Signup Phone Verification (KYC) Setup – Plivo

The signup flow requires:
- **Username** (displayed name)
- **Full Name**
- **Email** (verified via 6-digit code sent to email)
- **Phone Number** (verified via 6-digit SMS code sent via Plivo)
- **Password** + **Confirm Password**

All fields are saved to the database on successful registration.

---

## 1. Create a Plivo account

1. Go to **[Plivo sign-up](https://console.plivo.com/accounts/register/)**.
2. Use a **work or business-style email** (e.g. your domain or Gmail). Some providers block disposable emails.
3. Complete sign-up:
   - Enter email and password.
   - Check your inbox for the **activation email** from Plivo and click the link.
   - Enter your **mobile number** when asked (for account verification).
4. Log in at **[Plivo Console](https://console.plivo.com/)**.

---

## 2. Get your Plivo credentials

1. In the Plivo Console, open the **Dashboard** (overview) page.
2. Note:
   - **Auth ID** (sometimes shown as “AUTH ID” or in the URL) – looks like `MAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
   - **Auth Token** – click **Show** to reveal it. Keep it secret; treat it like a password.

Screenshot location: Dashboard → top of page or **Account** section.

---

## 3. Buy a Plivo phone number (for sending SMS)

To send SMS to the US/Canada you need a Plivo number. Other regions may use Sender ID; for this app we use a number.

1. In the console go to **Phone Numbers** → **Buy Numbers** (or [Search Numbers](https://console.plivo.com/phone-numbers/search/)).
2. Choose:
   - **Country**: e.g. United States (or your target country).
   - **Number type**: e.g. **Local** or **Toll-Free** (toll-free may need verification for high volume).
3. Click **Search**, pick a number, then **Buy**.
4. Confirm; the number will appear under **Your Numbers** (e.g. `+1234567890`).
5. Copy the number in **E.164** form (e.g. `+12025551234`) – no spaces. This will be `PLIVO_PHONE_NUMBER`.

**US/Canada:**  
- Toll-free numbers may require **Toll-Free Verification** for A2P messaging; Plivo will guide you.  
- Local (10DLC) numbers may require **10DLC registration** for production. For testing, a new number is often enough.

---

## 4. Add environment variables

Add these to your deployment (e.g. Vercel, Railway) and to local `.env` for development.

| Variable | Description | Example |
|----------|-------------|--------|
| `PLIVO_AUTH_ID` | Plivo Auth ID from Dashboard | `MAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `PLIVO_AUTH_TOKEN` | Plivo Auth Token (show from Dashboard) | `your_auth_token_string` |
| `PLIVO_PHONE_NUMBER` | Your Plivo number in E.164 format | `+12025551234` |

**Vercel:**
1. Project → **Settings** → **Environment Variables**.
2. Add `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_PHONE_NUMBER` for the right environments (Production/Preview).
3. Redeploy so the API uses the new variables.

**Local (e.g. `.env` in project root, never commit):**
```env
PLIVO_AUTH_ID=MAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
PLIVO_AUTH_TOKEN=your_auth_token_string
PLIVO_PHONE_NUMBER=+12025551234
```

---

## 5. Database

The `phone_verification_codes` table is created automatically when the phone-verification API runs (same as before). No schema change is required when switching from Twilio to Plivo.

---

## 6. Flow (unchanged)

1. User enters username, full name, email, phone, password, confirm password.
2. Clicks **VERIFY EMAIL** → 6-digit code sent to email.
3. User enters email code → email verified.
4. 6-digit SMS code is sent to the phone **via Plivo**.
5. User enters phone code → account is created and saved.
6. Redirect to choose-plan.

---

## 7. If Plivo is not configured

If the three Plivo env vars are missing or invalid, the phone verification step will show:

> "Phone verification is not configured. Please contact support to complete signup."

Fix by setting `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, and `PLIVO_PHONE_NUMBER` correctly and redeploying.

---

## 8. Plivo pricing (reference)

- **Pay-as-you-go**, no monthly minimum.
- SMS pricing is per message (e.g. ~$0.0055–$0.007 per SMS in the US depending on route).
- You are charged for each verification SMS sent. Check [Plivo SMS Pricing](https://www.plivo.com/sms/pricing/) for your country.

---

## 9. Troubleshooting

| Issue | What to check |
|-------|----------------|
| "Phone verification is not configured" | All three env vars set and redeployed. No typos (e.g. `PLIVO_AUTH_ID` not `PLIVO_AUTH_IDENT`). |
| SMS not received | Number in E.164 (`+1...` for US). Plivo number has SMS capability. Check Plivo logs in Console for errors. |
| 401 / auth errors | `PLIVO_AUTH_ID` and `PLIVO_AUTH_TOKEN` match Dashboard; token not expired and no extra spaces. |
| US toll-free / 10DLC | Complete toll-free verification or 10DLC registration if required by Plivo for your use case. |

---

## 10. Summary checklist

- [ ] Plivo account created and email verified.
- [ ] Auth ID and Auth Token copied from Dashboard.
- [ ] Plivo phone number bought and E.164 value copied.
- [ ] `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_PHONE_NUMBER` set in Vercel (and locally if needed).
- [ ] Project redeployed after adding variables.
- [ ] Test signup: request phone code and enter it to confirm end-to-end.

After this, Twilio is no longer used; all SMS for phone verification goes through Plivo.
