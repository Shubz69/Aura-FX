# Signup Phone Verification – Setup

The signup flow requires:
- **Username**, **Full Name**, **Email** (verified by 6-digit code), **Phone** (verified by 6-digit OTP), **Password** + **Confirm Password**.

You can use **Firebase Phone Auth (free)** or **Twilio (paid)**. Both send a real OTP to the user’s phone and store the verified number in your database. No KYC beyond a Google/Firebase or Twilio account.

---

## Option A: Firebase Phone Auth (free, recommended)

Firebase sends the OTP; you don’t pay per SMS. Free tier: ~10K verifications/month. No credit card for Firebase.

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) and sign in with Google.
2. **Add project** (or use an existing one) and follow the steps.
3. In the project, go to **Build** → **Authentication** → **Get started** → **Sign-in method**.
4. Enable **Phone** as a sign-in provider and save.

### 2. Get Firebase config (web app)

1. In Firebase Console: **Project settings** (gear) → **Your apps** → **Add app** → **Web** (</>).
2. Register the app (e.g. nickname “Aura FX”), then copy the config object.
3. You’ll use: `apiKey`, `authDomain`, `projectId`, `appId`.

### 3. Backend: Firebase Admin (verify ID tokens)

1. In Firebase Console: **Project settings** → **Service accounts** → **Generate new private key**.
2. In the downloaded JSON, you need: `project_id`, `client_email`, `private_key`.
3. Set these **server** env vars (Vercel/Railway/local `.env`):

| Variable | Description |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | From service account JSON: `project_id` |
| `FIREBASE_CLIENT_EMAIL` | From JSON: `client_email` |
| `FIREBASE_PRIVATE_KEY` | From JSON: `private_key` (paste as one line; keep `\n` as literal or use real newlines) |

### 4. Frontend: Firebase config

In your app’s env (e.g. `.env` in project root, or Vercel env vars), set:

| Variable | Description |
|----------|-------------|
| `REACT_APP_FIREBASE_API_KEY` | From Firebase web config: `apiKey` |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | From config: `authDomain` |
| `REACT_APP_FIREBASE_PROJECT_ID` | From config: `projectId` |
| `REACT_APP_FIREBASE_APP_ID` | From config: `appId` (optional but recommended) |

**Quick reference (Aura FX SMS):** In Firebase Console → **Project settings** (gear) → **Your apps** → Web app “Aura” → **Config** tab. Copy `apiKey` → `REACT_APP_FIREBASE_API_KEY`, `authDomain` → `REACT_APP_FIREBASE_AUTH_DOMAIN`, `projectId` → `REACT_APP_FIREBASE_PROJECT_ID`, `appId` → `REACT_APP_FIREBASE_APP_ID`.

### 5. Backend: Service account (Aura FX SMS)

1. Firebase Console → **Project settings** → **Service accounts**.
2. Click **Generate new private key** and download the JSON.
3. From the JSON set these **server** env vars (Vercel, Railway, or local `.env`; do **not** commit the JSON or private key):
   - `FIREBASE_PROJECT_ID` = `project_id` (e.g. `aura-fx-sms`)
   - `FIREBASE_CLIENT_EMAIL` = `client_email` (e.g. `firebase-adminsdk-xxxxx@aura-fx-sms.iam.gserviceaccount.com`)
   - `FIREBASE_PRIVATE_KEY` = the full `private_key` string (paste as one line; keep the `\n` characters as literal backslash-n, or use real newlines)

### 6. Behaviour when Firebase is configured

- Signup step “Verify phone”: user clicks **Send code** → Firebase sends OTP (reCAPTCHA + SMS).
- User enters the 6-digit code → app verifies with Firebase and sends the Firebase ID token to your API.
- API verifies the token and returns the verified phone; that number is stored with the new user.

You do **not** need Twilio if Firebase is set up. If both are set, the app uses Firebase for phone verification when the frontend env vars are present.

---

## Option B: Twilio (paid)

### 1. Create a Twilio account

1. Go to **[Try Twilio](https://www.twilio.com/try-twilio)** (or [twilio.com](https://www.twilio.com) → Sign up).
2. **Sign up with Google** (recommended) or with email/password.
   - No credit card required for the free trial.
3. Verify your email and phone when Twilio asks (for trial security).
4. You’ll land in the **Twilio Console** ([console.twilio.com](https://console.twilio.com)).

---

## 2. Get your Twilio credentials

1. In the Twilio Console, open the **Dashboard** (home).
2. Find **Account Info** (or the “Welcome” card):
   - **Account SID** – e.g. `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - **Auth Token** – click **Show** and copy it (keep it secret).
3. Save these; you’ll use them as env vars:
   - Account SID → **`TWILIO_ACCOUNT_SID`**
   - Auth Token → **`TWILIO_AUTH_TOKEN`**

---

## 3. Get a Twilio phone number

1. In the Console go to **Phone Numbers** → **Manage** → **Buy a number** ([console.twilio.com → Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/search)).
2. **Country**: e.g. United States (or your target country).
3. **Capabilities**: check **SMS** (and Voice if you want).
4. Click **Search**, pick a number, then **Buy**.
5. Confirm; the number appears under **Active Numbers**.
6. Copy the number in **E.164** format (e.g. `+12025551234`) – this is **`TWILIO_PHONE_NUMBER`**.

**US/Canada:**
- **Toll-free** numbers may need **Toll-Free Verification** before sending to many users; Twilio will prompt you.
- **Local (10DLC)** numbers may need **10DLC registration** for production. For testing, a new number is often enough.

---

## 4. Upgrade from trial (for real user signups)

- **Trial accounts** can only send SMS to **verified** phone numbers (numbers you add in Console → Phone Numbers → Verified Caller IDs).
- To send verification codes to **any** user phone number, you must **upgrade** your Twilio account (add a payment method and some balance).
- In the Console: click **Upgrade** (top right) or go to **Billing** → add payment details and add balance (e.g. $20). After that you can send to any number (subject to Twilio’s pricing and policies).

---

## 5. Add environment variables

Add these where your app runs (e.g. Vercel, Railway) and in local `.env` for development.

| Variable | Description | Example |
|----------|-------------|--------|
| `TWILIO_ACCOUNT_SID` | Account SID from Console Dashboard | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| `TWILIO_AUTH_TOKEN` | Auth Token from Console (Show → copy) | `your_auth_token_string` |
| `TWILIO_PHONE_NUMBER` | Your Twilio number in E.164 format | `+12025551234` |

**Vercel:**
1. Project → **Settings** → **Environment Variables**.
2. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` for Production (and Preview if you use it).
3. **Save** and **redeploy** so the API uses the new values.

**Local (`.env` in project root – do not commit):**
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_string
TWILIO_PHONE_NUMBER=+12025551234
```

---

## 6. Database

The **`phone_verification_codes`** table is created automatically when the phone-verification API runs. No manual schema change is required.

---

## 7. Signup flow (what users see)

1. User enters username, full name, email, phone, password, confirm password.
2. Clicks **VERIFY EMAIL** → 6-digit code sent to email.
3. User enters email code → email verified.
4. App sends 6-digit SMS to phone **via Twilio**; user enters it.
5. Account is created and saved; redirect to choose-plan.

---

## 8. If neither Firebase nor Twilio is configured

If Firebase (frontend + backend) and Twilio are both missing, the phone step will show:

> "Phone verification is not configured. Configure Firebase (free) or Twilio."

- **Free path:** Set up Firebase (Option A) and add the env vars above.
- **Paid path:** Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` and redeploy.

---

## 9. Twilio pricing (reference)

- **Pay-as-you-go** after upgrade; no monthly fee for the number at low usage.
- **SMS**: about **$0.0079** per segment (US); Verify product has its own pricing if you switch to it later.
- **Phone number**: roughly **$1–2/month** depending on country and type.
- Add balance (e.g. $20) and you’re charged per message and number. [Twilio Pricing](https://www.twilio.com/en-us/pricing).

---

## 10. Emergency address (can skip for SMS-only)

- The **emergency address** warning on the number’s Configure page is for **voice/911 calling**.
- This app uses the number **only for sending SMS** (verification codes). You do **not** need to add an emergency address.
- You can leave it unset and ignore the warning. SMS verification will work.

---

## 11. Troubleshooting

| Issue | What to check |
|-------|----------------|
| "Phone verification is not configured" | All three env vars set and redeployed. No typos or extra spaces. |
| SMS not received | Number in E.164 (`+1...` for US). Account upgraded (not trial) if sending to unverified numbers. Check Twilio Console → Monitor → Logs for errors. |
| 401 / auth errors | `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` match the Console; token copied fully, no line breaks. |
| Trial: "can only send to verified numbers" | Add the test number in Console → Phone Numbers → Verified Caller IDs, or upgrade the account to send to any number. |
| US toll-free / 10DLC | Complete toll-free verification or 10DLC registration in Twilio if required for your use case. |

---

## 12. Checklist

**Firebase (free):**
- [ ] Firebase project created; Phone sign-in method enabled.
- [ ] Web app config: `REACT_APP_FIREBASE_*` set in frontend env.
- [ ] Service account: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` set in backend env.
- [ ] Redeploy; test signup and phone OTP.

**Twilio (paid):**
- [ ] Twilio account created; Account SID and Auth Token copied.
- [ ] Twilio phone number bought; E.164 value copied.
- [ ] Account upgraded if you need to send to any user phone.
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` set in backend env.
- [ ] Redeploy; test signup and phone OTP.

After this, phone verification works with Firebase (free) or Twilio; verified numbers are stored in your database.
