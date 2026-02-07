# Manual Test Checklist — Security & Performance

Use this checklist to verify no regressions and that subscription detection is instant and consistent.

## Pre-requisites
- [ ] Set `JWT_SECRET` in environment (min 16 chars) for production-like auth
- [ ] Database indexes applied: `node api/utils/database-indexes.js`

## Authentication
- [ ] Login with valid credentials → receives token, redirects correctly
- [ ] Login with invalid password → 401
- [ ] Login 6+ times rapidly from same IP → 429 (rate limited)
- [ ] Token expires after 24h → 401 on protected endpoints

## Subscription / Tier Detection
- [ ] FREE user: lands on /community, sees only general/welcome/announcements/levels
- [ ] PREMIUM user: sees premium channels, can access Premium AI
- [ ] ELITE user: sees all channels including a7fx/elite
- [ ] Admin: sees all channels, can post in announcements
- [ ] Login → entitlements resolved within 1–2 seconds (no long "Verifying access...")
- [ ] Channel switch: no page reset, no "not allowed" flash

## RBAC (Server-Side)
- [ ] FREE user: direct `GET /api/ai/premium-chat` with valid token → 403 or equivalent
- [ ] Unauthenticated: `GET /api/me` without token → 401
- [ ] PREMIUM user: `GET /api/me` → returns `canAccessAI: true`

## Caching & Performance
- [ ] Second `/api/me` request within 60s: faster (cached)
- [ ] Select FREE plan → entitlements cache invalidated, next /api/me reflects FREE

## No Regressions
- [ ] All existing routes load (Home, Community, Profile, Courses, etc.)
- [ ] No new mandatory steps (no forced MFA/captcha)
- [ ] Payment/checkout flow unchanged (if applicable)
