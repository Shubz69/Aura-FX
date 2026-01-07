# Quick Fix: Enable Signups and Logins

## The Problem
Signups are failing with: "Email service is temporarily unavailable"

## The Solution (5 minutes)

### Step 1: Get Gmail App Password
1. Go to: https://myaccount.google.com/security
2. Enable **2-Step Verification** (if not already)
3. Click **App passwords** → **Select app: Mail** → **Select device: Other**
4. Type "AURA FX" → Click **Generate**
5. **Copy the 16-character password** (looks like: `abcd efgh ijkl mnop`)

### Step 2: Add to Vercel
1. Go to: https://vercel.com/dashboard
2. Select your **aura-fx** project
3. Go to **Settings** → **Environment Variables**
4. Add these 2 variables:

**Variable 1:**
- **Name**: `EMAIL_USER`
- **Value**: Your Gmail address (e.g., `shubzfx@gmail.com`)
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

**Variable 2:**
- **Name**: `EMAIL_PASS`
- **Value**: The 16-character App Password (remove spaces: `abcdefghijklmnop`)
- **Environments**: ✅ Production, ✅ Preview, ✅ Development

### Step 3: Redeploy
1. Go to **Deployments** tab
2. Click **...** on latest deployment
3. Click **Redeploy**
4. Wait 2-3 minutes

### Step 4: Test
Try signing up again - you should receive a verification email!

## Already Have These Variables?
If you already added them but it's still not working:
1. Double-check the App Password has no spaces
2. Make sure 2-Step Verification is enabled
3. Try regenerating the App Password
4. Redeploy after any changes

## Need Help?
See `EMAIL_SETUP_GUIDE.md` for detailed instructions.




