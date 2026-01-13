# Stripe Payment Link Redirect Setup Guide

## Overview
This guide explains how to configure Stripe payment links to properly redirect users after subscription purchase, ensuring they get the correct role (premium or a7fx) assigned.

## Stripe Dashboard Configuration

### Step 1: Access Payment Links Settings
1. Log in to your Stripe Dashboard
2. Navigate to **Products** → **Payment Links**
3. Select your payment link (or create a new one)

### Step 2: Configure Success URL
In the **After payment** section, set the success URL to:

```
https://aura-fx-ten.vercel.app/payment-success?payment_success=true&subscription=true&plan={PLAN_TYPE}
```

**Important:** Replace `{PLAN_TYPE}` with:
- `aura` for Aura FX Standard (£79/month)
- `a7fx` for A7FX Elite (£199/month)

### Step 3: Configure Cancel URL (Optional)
Set the cancel URL to:
```
https://aura-fx-ten.vercel.app/subscription
```

## Payment Link URLs

### For Aura FX Standard (£79/month)
**Success URL:**
```
https://aura-fx-ten.vercel.app/payment-success?payment_success=true&subscription=true&plan=aura
```

### For A7FX Elite (£199/month)
**Success URL:**
```
https://aura-fx-ten.vercel.app/payment-success?payment_success=true&subscription=true&plan=a7fx
```

## How It Works

1. **User clicks subscribe** → Redirected to Stripe payment link
2. **User completes payment** → Stripe redirects to success URL with parameters
3. **PaymentSuccess page** → Detects plan type from URL parameter
4. **Backend API** → Sets correct role:
   - `plan=aura` → Role: `premium`
   - `plan=a7fx` → Role: `a7fx`
5. **User redirected** → Automatically redirected to `/community` with new role active

## URL Parameters Explained

| Parameter | Value | Description |
|-----------|-------|-------------|
| `payment_success` | `true` | Indicates successful payment |
| `subscription` | `true` | Identifies this as a subscription purchase |
| `plan` | `aura` or `a7fx` | Determines which subscription tier to assign |

## Testing

### Test Aura FX Subscription (£79/month)
1. Use test card: `4242 4242 4242 4242`
2. Complete payment
3. Should redirect to: `https://aura-fx-ten.vercel.app/payment-success?payment_success=true&subscription=true&plan=aura`
4. User should get `premium` role

### Test A7FX Elite Subscription (£199/month)
1. Use test card: `4242 4242 4242 4242`
2. Complete payment
3. Should redirect to: `https://aura-fx-ten.vercel.app/payment-success?payment_success=true&subscription=true&plan=a7fx`
4. User should get `a7fx` role

## Important Notes

1. **Plan Parameter is Critical**: The `plan` parameter determines which role the user gets
2. **Multiple Payment Links**: You may need separate payment links for each plan, or use metadata to distinguish
3. **Webhook Support**: The system also supports Stripe webhooks for payment events
4. **Fallback**: If plan parameter is missing, defaults to `aura` (premium role)

## Stripe Webhook Configuration (Optional but Recommended)

If you want to use webhooks for more reliable payment processing:

1. Go to **Developers** → **Webhooks** in Stripe Dashboard
2. Add endpoint: `https://aura-fx-ten.vercel.app/api/stripe/webhook`
3. Select events:
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`

## Troubleshooting

### User not getting correct role
- Check URL parameters in browser after redirect
- Verify `plan` parameter is present and correct
- Check browser console for API errors
- Verify backend received plan parameter in request

### Redirect not working
- Verify success URL is correctly configured in Stripe Dashboard
- Check for typos in URL
- Ensure HTTPS is used (not HTTP)
- Check browser console for redirect errors
