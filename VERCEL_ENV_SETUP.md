# Vercel Environment Variables Setup

## ⚠️ CRITICAL: Add OpenAI API Key to Vercel

Your OpenAI API key needs to be added to Vercel environment variables for the Premium AI to work in production.

## Steps to Add API Key:

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com/dashboard
   - Select your AURA FX project

2. **Navigate to Settings:**
   - Click on "Settings" tab
   - Click on "Environment Variables" in the left sidebar

3. **Add OpenAI API Key (REQUIRED):**
   - Click "Add New"
   - **Key:** `OPENAI_API_KEY`
   - **Value:** (Get from `API_KEYS_SECURE.md` or `.env.local` - do NOT commit this value)
   - **Environment:** Select all (Production, Preview, Development)
   - Click "Save"
   
   **⚠️ IMPORTANT:** The API key is stored in `API_KEYS_SECURE.md` (gitignored) for your reference. Copy it from there.

4. **Phone verification (Twilio Verify – REQUIRED for signup):**
   - Sign up uses email + phone verification. Phone codes are sent via **Twilio Verify** (works for UK, US, India, 180+ countries – no purchased number needed).
   - **Keys:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
   - **Setup:** Go to [Twilio Console → Verify → Services](https://console.twilio.com/us1/develop/verify/services)
     - Click "Create new"
     - Name it "AURA FX" (or any name)
     - Copy the Service SID (starts with `VA...`)
   - Add to Vercel: `TWILIO_VERIFY_SERVICE_SID` = your Service SID
   - **Environment:** Select all (Production, Preview, Development)

5. **JWT_SECRET (REQUIRED for production – stops auth warnings and secures tokens):**
   - **Key:** `JWT_SECRET`
   - **Value:** A long random string (at least 16 characters). Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - **Environment:** Production (and Preview/Development if you want full auth there too)
   - If this is not set, Vercel logs will show: "JWT_SECRET not set or too short - auth verification degraded." and token signing falls back to an insecure legacy mode. Set it in Vercel to remove the warning and enable secure HMAC-SHA256 signing.

6. **Web Push + Community notification side-effects (required for phone push):**
   - **`REACT_APP_VAPID_PUBLIC_KEY`** (client build-time env, must match server public key)
   - **`VAPID_PUBLIC_KEY`** (server env)
   - **`VAPID_PRIVATE_KEY`** (server env)
   - **`COMMUNITY_NOTIFICATIONS_ENABLE_DB_SIDE_EFFECTS=1`** (enable DB-backed community notification side-effects on Vercel serverless)
   - **Environment:** Production (and Preview if you test push there)
   - Redeploy after setting/changing any of the above (client key is baked at build time).

7. **Redeploy:**
   - After adding the variable, go to "Deployments"
   - Click the three dots on the latest deployment
   - Click "Redeploy"
   - Or push a new commit to trigger auto-deploy

8. **Aura Analysis — MetaTrader investor-password sync (REQUIRED for MT4/MT5 connect & analytics in production):**
   - **`AURA_MT_SYNC_URL`** — Base URL of the hosted worker (must expose `POST /api/v1/sync` and `POST /api/v1/positions`). Legacy env names also work: `TERMINALSYNC_WORKER_URL`, `PYTHON_WORKER_URL`.
   - **`AURA_MT_SYNC_SECRET`** — Shared secret; the API sends it as header `x-worker-secret` on every worker request. Legacy: `TERMINALSYNC_WORKER_SECRET`, `WORKER_SECRET`.
   - **`PLATFORM_ENCRYPTION_KEY`** — **Set in production** for Aura platform credentials (AES-256-GCM). Use a long random value (e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). If omitted, the code derives the key from **`JWT_SECRET`**; if **both** are omitted, a fixed development default is used (insecure — never ship that way).
   - **`JWT_SECRET`** — Already required above for auth; keep it set. Prefer also setting **`PLATFORM_ENCRYPTION_KEY`** so MT credential encryption is not tied to the JWT signing secret.
   - **`AURA_ANALYSIS_DIAGNOSTICS`** — Do **not** set to `1` in production (adds diagnostic payloads and extra server logging for the MT path). Use only in dev/preview when debugging.

9. **All Markets / live snapshot (recommended for accurate spot FX & metals):**
   - **`FINNHUB_API_KEY`** — Primary source for OANDA-style spot forex and gold/silver in `/api/markets/snapshot` and the All Markets modal. Without it, the app falls back to Yahoo/Stooq, which can be delayed or use futures symbols for metals.
   - **Optional:** `TWELVE_DATA_API_KEY`, `POLYGON_API_KEY`, `COINMARKETCAP_API_KEY` — Extra redundancy for stocks, indices, and crypto. See [`.env.example`](.env.example) for descriptions.
   - After setting keys, redeploy and open **View All Markets** — prices should show provider-backed quotes (not “Live quote unavailable” placeholders).

## Verify It's Working:

1. After redeploy, test the Premium AI:
   - Log in as a premium user
   - Navigate to "Premium AI" in navbar
   - Ask a question
   - Should get AI response

## Security Notes:

- ✅ API key is stored locally in `.env.local` (gitignored)
- ✅ API key is documented in `API_KEYS_SECURE.md` (gitignored)
- ⚠️ **MUST ADD TO VERCEL** for production to work
- ⚠️ Never commit API keys to Git (already protected)
- ✅ Set **JWT_SECRET** in Vercel (min 16 chars) to remove auth warnings and secure token signing
- ✅ For Aura MT4/MT5: set **AURA_MT_SYNC_URL**, **AURA_MT_SYNC_SECRET**, and **PLATFORM_ENCRYPTION_KEY** (see step 7 above); keep **AURA_ANALYSIS_DIAGNOSTICS** unset in production

## Current Status:

- ✅ Local development: Ready (`.env.local` created)
- ⚠️ Production: **NEEDS VERCEL ENV VARIABLES** (OPENAI_API_KEY and JWT_SECRET recommended)
- ✅ Git protection: All key files are gitignored
- ✅ Token system: Set JWT_SECRET in Vercel for production to enable secure signing and clear log warnings

## Surveillance maritime (no paid vessel telemetry)

Aura Surveillance does **not** ship paid AIS / live vessel position providers. Maritime context comes from **public/official HTML & RSS adapters** (e.g. IMO, trade press) plus **clearly labelled demo/fallback map markers** when the live feed is sparse. `/api/cron/surveillance-tracks` refreshes **OpenSky ADS-B** only.

## Preview deployments: 401 on `manifest.json` (and other static files)

If the browser console shows **Manifest fetch … failed, code 401** on URLs like `aura-fx-git-*-*.vercel.app`, that is usually **Vercel Deployment Protection** (authentication required for Preview deployments), not a bug in the manifest file.

**Options:**

1. **Vercel Dashboard** → your project → **Settings** → **Deployment Protection** → adjust who can access Preview deployments (e.g. allow the team, or disable protection for previews if the app must be public on every PR).
2. The app **embeds the web manifest inline** in `public/index.html` so the browser does not need to request `/manifest.json` separately (avoids that 401 for the manifest link). Icon and other static URLs may still return 401 under strict preview protection until you sign in or change protection settings.
