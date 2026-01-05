# 🔍 DIAGNOSE EMAIL ISSUE - Step by Step

## The API is now fixed with better error messages. Follow these steps:

### STEP 1: Verify Environment Variables in Vercel

1. Go to: https://vercel.com/dashboard
2. Select your **"aura-fx"** project
3. Go to **Settings** → **Environment Variables**
4. **VERIFY** you see these 2 variables:

   ✅ **EMAIL_USER** = `shubzfx@gmail.com` (or your Gmail)
   ✅ **EMAIL_PASS** = `mzxparcgxlvqsxvc` (16 characters, no spaces)

5. **CRITICAL:** Make sure BOTH are enabled for:
   - ✅ Production
   - ✅ Preview  
   - ✅ Development

### STEP 2: REDEPLOY (This is CRITICAL!)

**Environment variables only work after redeploy!**

1. Go to **Deployments** tab
2. Click **"..."** on the **latest deployment**
3. Click **"Redeploy"**
4. **WAIT 2-3 minutes** for it to complete
5. Make sure it shows **"Ready"** ✅

### STEP 3: Check Vercel Function Logs

After redeploy, when you try to sign up:

1. Go to **Deployments** → Click on the latest deployment
2. Click **"Functions"** tab
3. Find **`api/auth/signup-verification`**
4. Click on it to see logs
5. Look for error messages - they'll now show:
   - If EMAIL_USER/EMAIL_PASS are missing
   - If Gmail authentication failed
   - The exact error from Gmail

### STEP 4: Common Issues & Fixes

#### Issue: "Email authentication failed"
**Fix:** 
- Double-check the App Password is correct (no spaces)
- Make sure 2-Step Verification is enabled on Gmail
- Try generating a NEW App Password

#### Issue: "Missing EMAIL_USER or EMAIL_PASS"
**Fix:**
- Variables weren't added correctly
- Variables weren't enabled for Production environment
- Project wasn't redeployed after adding variables

#### Issue: "Email service connection failed"
**Fix:**
- Gmail might be blocking the connection
- Check Gmail security settings
- Try a different Gmail account

### STEP 5: Test Again

1. After redeploy completes
2. Go to your website
3. Try signing up
4. Check Vercel function logs if it still fails
5. The logs will now show the EXACT error

---

## ⚠️ IMPORTANT REMINDERS:

1. **MUST REDEPLOY** after adding environment variables
2. **App Password must be 16 characters** (no spaces)
3. **Both variables must be in Production environment**
4. **Wait 2-3 minutes** after redeploy before testing

---

## 🆘 Still Not Working?

Check the Vercel function logs - they'll now show:
- Exact error message
- Whether credentials are being read
- Gmail-specific error codes

Share the error from the logs and I can help fix it!

