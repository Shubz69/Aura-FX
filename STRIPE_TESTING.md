# Stripe Subscription Testing Guide

## Fixing "A processing error occurred" (400 on api.stripe.com/v1/payment_methods)

This error happens **on Stripe's checkout page** before payment completes. Common cause: **Test vs Live mode mismatch**.

### Rule: Never Mix Test and Live
- **Test Payment Link** → Use **test card** `4242 4242 4242 4242` only
- **Live Payment Link** → Use **real card** only

Using a real card on a test link (or test card on a live link) often produces a 400 error.

---

## How to Test Subscriptions Safely

### 1. Use Stripe Test Mode

1. In [Stripe Dashboard](https://dashboard.stripe.com), toggle **Test mode** (top right).
2. Go to **Products** → **Payment Links**.
3. Create or use existing Payment Links **in Test mode**.
4. Copy the **Test** payment link URL (it may include `/test/` in the path).

### 2. Test Card Numbers (Test mode only)

| Card number | Result |
|-------------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 3220` | 3D Secure required |

- Use any future expiry (e.g. `12/30`)
- Use any 3-digit CVC
- Use any valid billing address

### 3. Configure Success URL in Stripe (Required)

Each Payment Link must have the correct success URL with `plan`:

**Aura FX Premium (£99):**
```
https://aura-fx-ten.vercel.app/payment-success?payment_success=true&subscription=true&plan=aura
```

**A7FX Elite (£250):**
```
https://aura-fx-ten.vercel.app/payment-success?payment_success=true&subscription=true&plan=a7fx
```

Without `plan=aura` or `plan=a7fx`, the app may default to the wrong tier.

---

## Webhook: checkout.session.completed

The app now activates subscriptions via the `checkout.session.completed` webhook when payment succeeds. This means:

- **No bypass** – payment must succeed on Stripe.
- **Works for all users** – even if the redirect or `subscription-success` call fails, the webhook will activate the subscription.

### Enable the Webhook in Stripe

1. Go to **Developers** → **Webhooks**.
2. Add endpoint: `https://aura-fx-ten.vercel.app/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed` (for first-time subscriptions)
   - `invoice.payment_succeeded` (for renewals)
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** and set `STRIPE_WEBHOOK_SECRET` in Vercel env (optional; enables signature verification).

---

## Verifying Subscription Access

After a successful test payment:

1. You should be redirected to `/payment-success` and then `/community`.
2. Premium/Elite channels should be visible.
3. `/api/me` should return `subscription_status: "active"` and the correct `role`.

---

## Checklist

- [ ] Using **Test mode** Payment Links for testing
- [ ] Using test card **4242 4242 4242 4242** (not a real card)
- [ ] Success URL includes `plan=aura` or `plan=a7fx`
- [ ] `checkout.session.completed` webhook is enabled
- [ ] User email on checkout matches an existing account in your app
