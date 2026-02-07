# Security Documentation

This document describes the security measures implemented across the Aura FX platform.

## Authentication & Sessions

### JWT Tokens
- **Signing**: When `JWT_SECRET` is set (min 16 chars), tokens are cryptographically signed with HMAC-SHA256.
- **Verification**: All protected endpoints use `api/utils/auth.js` `verifyToken()` to validate tokens. Never trust client-provided role/tier.
- **Fallback**: If `JWT_SECRET` is not set, legacy unsigned tokens are accepted for backward compatibility. **Set JWT_SECRET in production.**

### Required Environment Variable
```
JWT_SECRET=<min 16 character secret>
```
Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### Session Rotation
- Tokens expire after 24 hours.
- On login, a new token is issued (session rotation).
- Tier/role changes invalidate entitlements cache; re-fetch on next request.

## Authorization (RBAC)

### Server-Side Enforcement
- **Never trust client**: Tier and role are derived from the database only. The `api/utils/entitlements.js` module computes access from the user row.
- **Central guard**: `api/middleware/subscription-guard.js` and `api/middleware/community-access.js` enforce access on protected routes.
- **Tiers**: FREE | PREMIUM | ELITE | ADMIN | SUPER_ADMIN (unchanged).

### Protected Endpoints
- Community: `/api/community/*` — requires plan selected or paid subscription.
- Premium AI: `/api/ai/premium-chat*` — requires PREMIUM/ELITE/ADMIN.
- Admin: `/api/admin/*` — requires admin role.

## OWASP Protections

### Input Validation
- Parameterized queries used throughout (`mysql2` `execute()`).
- `api/utils/validators.js` for request validation where applicable.
- Email format validation on login/register.

### Headers (vercel.json)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (API), `SAMEORIGIN` (pages)
- `Referrer-Policy: strict-origin-when-cross-origin`

### CSP
- Content-Security-Policy configured in `public/index.html` for scripts, frames, and connections.
- Includes reCAPTCHA domains for phone verification.

## Rate Limiting

- **Login**: 5 requests per 5 minutes per IP (`api/auth/login.js`).
- **Config**: `api/utils/rate-limiter.js` — sliding window, per-endpoint configs.
- Extend rate limiting to register, password-reset, and AI endpoints as needed.

## Secrets & Logging

- **Secrets**: Store in environment variables (Vercel, Railway, etc.). Never commit secrets.
- **Logging**: Avoid logging passwords, tokens, or full user objects. Use `api/utils/logger.js` for structured logs.
- **Audit**: Admin actions (role changes, tier grants) should be logged; extend as needed.

## Optional MFA

- MFA endpoints exist (`api/auth/mfa.js`). Enable for ADMIN/SUPER_ADMIN behind a feature flag if desired.
- No mandatory MFA for regular users (per constraints).
