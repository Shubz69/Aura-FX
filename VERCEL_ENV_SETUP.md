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

4. **REACT_APP_RECAPTCHA_SITE_KEY (RECOMMENDED for Sign Up):**
   - Required for the "I'm not a robot" captcha on the Sign Up page
   - Get your key at: https://www.google.com/recaptcha/admin (reCAPTCHA v2 Checkbox)
   - **Key:** `REACT_APP_RECAPTCHA_SITE_KEY`
   - **Value:** Your reCAPTCHA site key
   - **Environment:** Select all

5. **JWT_SECRET (OPTIONAL - Not Required):**
   - Your system uses a custom token format, so JWT_SECRET is **NOT needed**
   - The Premium AI endpoint has been updated to work with your existing token system
   - You can skip this step

6. **Redeploy:**
   - After adding the variable, go to "Deployments"
   - Click the three dots on the latest deployment
   - Click "Redeploy"
   - Or push a new commit to trigger auto-deploy

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
- ✅ JWT_SECRET is **NOT required** - your system uses custom tokens

## Current Status:

- ✅ Local development: Ready (`.env.local` created)
- ⚠️ Production: **NEEDS VERCEL ENV VARIABLE** (OPENAI_API_KEY only)
- ✅ Git protection: All key files are gitignored
- ✅ Token system: Works with existing custom token format (no JWT_SECRET needed)
