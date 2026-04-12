# Roles and tiers (Aura Terminal)

Single reference for **permission roles** vs **subscription tiers**, JWT behavior, canonical files, and audit notes (JWT grep + Community client paths).

## Two layers

| Layer | API / JWT values | Meaning |
|--------|------------------|--------|
| **Permission role** | `USER`, `ADMIN`, `SUPER_ADMIN` | Staff vs normal account. Exposed as `entitlements.role` on `GET /api/me`. |
| **Product tier** | `ACCESS`, `PRO`, `ELITE` (plus legacy aliases on read) | What the user can use (community channels, AI, etc.). From DB `subscription_plan`, `subscription_status`, `subscription_expiry`, and tier-like `users.role` values. |

**Critical:** Login signs JWT with `normalizeRole(users.role)` only ([`api/auth/login.js`](../api/auth/login.js)). Tier-like DB roles (`pro`, `elite`, `access`, `premium`, …) become **`USER`** in the token. **Do not infer Pro/Elite from `decoded.role`.** Use `decoded.id` + DB row, or trust **`GET /api/me`** ([`api/me.js`](../api/me.js)) and [`EntitlementsContext`](../src/context/EntitlementsContext.js).

## Canonical code paths

| Concern | File |
|--------|------|
| Tier from user row | [`api/utils/entitlements.js`](../api/utils/entitlements.js) — `getTier`, `getEntitlements`, `needsOnboardingReaccept` |
| Plan / legacy aliases | [`api/utils/subscriptionNormalize.js`](../api/utils/subscriptionNormalize.js) — `canonicalStoredPlanFromAny`, etc. |
| API permission role + plan for responses | [`api/utils/userResponseNormalize.js`](../api/utils/userResponseNormalize.js) |
| Client tier helper | [`src/utils/roles.js`](../src/utils/roles.js) — `getClientAccessTier`, `isPro`, `isAdmin`, `isSuperAdmin` |
| Route guards (client) | [`src/components/RouteGuards.js`](../src/components/RouteGuards.js) — uses **entitlements**, not JWT tier |
| Admin plan writes | [`api/admin/change-subscription.js`](../api/admin/change-subscription.js), [`api/admin/index.js`](../api/admin/index.js) |

## JWT `decoded.role` usage (audit)

Searched `api/**/*.js` for `decoded.role` / similar. **None** of these use JWT for Pro/Elite **tier** gating; they use identity or staff checks, sometimes combined with a **DB** read or email list.

| Location | Use of JWT role |
|----------|-----------------|
| [`api/market-data/health.js`](../api/market-data/health.js) | Super-admin-only diagnostics: `SUPER_ADMIN` or `isSuperAdminEmail` from token email. |
| [`api/admin/index.js`](../api/admin/index.js) | Admin list auth; may re-read DB role. |
| [`api/community/channels.js`](../api/community/channels.js), [`messages.js`](../api/community/channels/messages.js) | Moderation / staff checks (`ADMIN` / `SUPER_ADMIN`); message paths may compare sender DB role vs JWT. |
| [`api/messages/threads.js`](../api/messages/threads.js) | Auth identity / role string for thread access. |

**Community access enforcement:** [`api/middleware/community-access.js`](../api/middleware/community-access.js) and [`api/middleware/subscription-guard.js`](../api/middleware/subscription-guard.js) load **`users` by `decoded.id`** then evaluate `subscription_*` and DB `role` — correct pattern.

## `users.role` column (dual use)

The DB `role` field may hold:

- Staff: `admin`, `super_admin`
- Legacy / migration tier strings: `premium`, `pro`, `aura`, `elite`, `a7fx`, `access`, `user`, …

Server tier logic in `getTier` reads both `role` and `subscription_plan`. Comments in [`entitlements.js`](../api/utils/entitlements.js) that only mention `USER|ADMIN|SUPER_ADMIN` refer to **normalized permission role** for API responses, not every raw DB string.

## Super-admin email lists

Keep in sync:

- [`api/utils/entitlements.js`](../api/utils/entitlements.js) — `SUPER_ADMIN_EMAIL_FALLBACK_LOWER` + `SUPER_ADMIN_EMAIL` env
- [`src/utils/roles.js`](../src/utils/roles.js) — `REACT_APP_SUPER_ADMIN_EMAIL` + same fallbacks

## Community.jsx: client vs server

[`src/pages/Community.js`](../src/pages/Community.js) is large and mixes:

1. **Server truth** — channels with `canSee` / `canWrite` from API/bootstrap when available.
2. **Client fallbacks** — `getClientAccessTier(merged, entitlements)` ([`roles.js`](../src/utils/roles.js)), localStorage `user`, and a **`currentUserRole` IIFE** used for early channel list prep (legacy slugs `premium` / `a7fx` / `free`).

**Risk:** Duplicated string logic can drift from `getTier` / `/api/me`. A concrete bug was fixed: active `subscription_plan === 'pro'` (and DB `role === 'pro'`) was not mapped to the client’s `premium` tier slug in that IIFE, so Pro users could be misclassified as `free` for **client-side** `canAccessChannelByTier` when building cached channel shapes. Server enforcement remains authoritative.

**Recommendation:** Prefer bootstrap/API `canSee` flags; reduce reliance on `currentUserRole` localStorage-only paths as entitlements hydrate.

## Stale UI after admin changes

- JWT role/plan does not change until re-login (or your refresh flow).
- [`EntitlementsContext`](../src/context/EntitlementsContext.js) caches `/api/me` for a short window; use `refresh()` after admin grants if needed.

## Tests run (role-related)

- `npm run test:security` — includes `security-rbac`, `entitlements-api`, etc.
- `node tests/subscription-access.test.js`
- `npx jest tests/access-control.test.js --ci --watchAll=false`

All passed at the time this document was added.
