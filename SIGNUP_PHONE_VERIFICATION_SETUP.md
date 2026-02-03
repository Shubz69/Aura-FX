# Signup Phone Verification (KYC) Setup

The signup flow now requires:
- **Username** (displayed name)
- **Full Name**
- **Email** (verified via 6-digit code sent to email)
- **Phone Number** (verified via 6-digit SMS code)
- **Password** + **Confirm Password**

All fields are saved to the database on successful registration.

## Twilio Setup for Phone Verification

1. Create a [Twilio account](https://www.twilio.com/try-twilio) (free trial available).
2. Get a Twilio phone number from the [Console](https://console.twilio.com).
3. Add these environment variables to Vercel (or your deployment):

   - `TWILIO_ACCOUNT_SID` - Your Account SID
   - `TWILIO_AUTH_TOKEN` - Your Auth Token
   - `TWILIO_PHONE_NUMBER` - Your Twilio phone number (e.g. `+1234567890`)

4. The `phone_verification_codes` table is created automatically when the API runs.

## Flow

1. User enters username, full name, email, phone, password, confirm password.
2. Clicks **VERIFY EMAIL** → 6-digit code sent to email.
3. User enters email code → email verified.
4. 6-digit SMS code is sent to phone automatically.
5. User enters phone code → account is created and saved to database.
6. Redirect to choose-plan.

## Without Twilio

If Twilio env vars are not set, the phone verification step will show:
"Phone verification is not configured. Please contact support to complete signup."

You can either configure Twilio or temporarily bypass phone verification in development by setting the env vars with dummy values and handling the 503 in the frontend (not recommended for production).
