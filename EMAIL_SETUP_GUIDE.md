# Email Service Setup Guide for AURA FX

## Problem
Signups and password resets are failing with the error: "Email service is not configured. Please contact support."

## Solution
You need to configure email credentials in Vercel environment variables.

## Step 1: Get Gmail App Password

Since the application uses Gmail SMTP, you need to create an App Password (not your regular Gmail password).

### Steps:
1. Go to your Google Account: https://myaccount.google.com/
2. Click **Security** in the left sidebar
3. Under "How you sign in to Google", click **2-Step Verification**
   - If not enabled, enable it first
4. Scroll down and click **App passwords**
5. Select **Mail** as the app
6. Select **Other (Custom name)** as the device
7. Enter "AURA FX" as the name
8. Click **Generate**
9. **Copy the 16-character password** (you'll need this for Vercel)

## Step 2: Add Environment Variables to Vercel

1. Go to your Vercel project: https://vercel.com/dashboard
2. Select your **aura-fx** project
3. Go to **Settings** → **Environment Variables**
4. Add the following variables:

### Required Variables:

**EMAIL_USER**
- **Value**: Your Gmail address (e.g., `your-email@gmail.com`)
- **Environment**: Production, Preview, Development (select all)

**EMAIL_PASS**
- **Value**: The 16-character App Password you generated in Step 1
- **Environment**: Production, Preview, Development (select all)

### Example:
```
EMAIL_USER = shubzfx@gmail.com
EMAIL_PASS = abcd efgh ijkl mnop
```

**Note**: Remove spaces from the App Password when entering it (it should be 16 characters without spaces).

## Step 3: Redeploy

After adding the environment variables:
1. Go to **Deployments** tab
2. Click the **...** menu on the latest deployment
3. Click **Redeploy**
4. Wait for the deployment to complete

## Step 4: Test

1. Try signing up with a new email
2. Check your email inbox for the verification code
3. If you receive the email, the setup is successful!

## Alternative: Use a Different Email Service

If you prefer not to use Gmail, you can modify the email configuration in:
- `api/auth/signup-verification.js`
- `api/auth/password-reset.js`
- `api/auth/mfa.js`
- `api/admin/index.js`

Change the `nodemailer.createTransport` configuration to use your preferred SMTP service (e.g., SendGrid, Mailgun, AWS SES).

## Troubleshooting

### "Email transporter verification failed"
- Double-check that `EMAIL_USER` is your full Gmail address
- Ensure `EMAIL_PASS` is the App Password (16 characters, no spaces)
- Make sure 2-Step Verification is enabled on your Google Account

### "Missing EMAIL_USER or EMAIL_PASS"
- Verify both variables are set in Vercel
- Make sure they're enabled for the correct environment (Production)
- Redeploy after adding variables

### Emails not sending
- Check Vercel function logs for detailed error messages
- Verify the App Password hasn't expired (they don't expire, but you can regenerate)
- Check spam folder

## Security Note

Never commit email credentials to Git. Always use environment variables in Vercel.


