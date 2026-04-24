# API Connectivity Status Report

Last updated: 2026-04-24 (targeted audit + reliability hardening pass)

## Scope and method

- Targeted endpoints audited: `/api/aura-analysis/platform-connect`, `/api/subscription/status`, `/api/notifications`, `/api/markets/snapshot`, Twelve Data integrations, and core dependency routes.
- Sources used: codebase route/service inspection, `FINAL_FULL_WEBSITE_STATUS_REPORT.md`, and targeted live endpoint probes with authenticated normal-user state.
- Secrets policy: no API key values logged; only env var names and masked/boolean config state are documented.

## API connectivity map

| API name | Internal endpoint(s) | External provider | Env var(s) required | Current connection status | Last tested result | Error/failure signal | Pages/features affected |
|---|---|---|---|---|---|---|---|
| Twelve Data health probe | `/api/ai/health` (probe payload `services.twelveData`) | Twelve Data | `TWELVE_DATA_API_KEY` (+ optional `TWELVE_DATA_HEALTH_SYMBOL`) | Connected (provider), service endpoint degraded overall | `services.twelveData.status=healthy`; endpoint HTTP `503` (degraded due non-TD dependencies) | Non-TD subsystem can degrade whole health route | Ops diagnostics, provider readiness checks |
| Markets snapshot | `/api/markets/snapshot` | Twelve Data primary via market-data layer; fallback providers internal | `TWELVE_DATA_API_KEY` primary; fallbacks use `FINNHUB_API_KEY`, `POLYGON_API_KEY`, `COINMARKETCAP_API_KEY`, `FMP_API_KEY` where configured | Connected | HTTP `200` in targeted probe; stale-ok fallback implemented server-side | Historical `requestfailed`/abort events in prior QA artifacts | `MarketTicker`, `Home`, `TradeCalculator`, live pricing widgets |
| Aura platform connectivity | `/api/aura-analysis/platform-connect` | MT bridge/MetaTrader infra (internal + external bridge) | Bridge/connection envs (no secrets exposed) | Connected with elevated risk | HTTP `200` in targeted probe; historical high request-failed count | Prior hard-check: high requestfailed volume | Aura Analysis connection hub/dashboard |
| Subscription status | `/api/subscription/status` | Stripe-backed billing state (internal DB + webhook state) | `STRIPE_SECRET_KEY` (backend billing flows), auth token | Connected with elevated risk | HTTP `200` in targeted probe | Prior hard-check: requestfailed spikes + `429` seen once | Subscription page, community gating, entitlement UI |
| Notifications | `/api/notifications`, `/api/notifications/:id/read`, `/api/notifications/read-all` | Internal DB + optional push providers | Auth token (+ push envs for web push delivery) | Connected with medium risk | HTTP `200` in targeted probe | Prior hard-check: intermittent requestfailed on unread polling | Navbar bell, notifications dropdown, community/message alerts |
| Reports eligibility | `/api/reports/eligibility` | Internal DB/service logic | Auth token | Connected with medium risk | HTTP `200` in targeted probe | Prior requestfailed in hard-check | Reports hub, DNA/live/manual metrics gating |
| Auth identity | `/api/me` | Internal DB + entitlements | Auth token | Connected with medium risk | HTTP `200` in targeted probe | Prior requestfailed in hard-check | Route guards, entitlements, user context |
| User profile by id | `/api/users/:id` | Internal DB | Auth token | Connected with medium risk | `/api/users/88` HTTP `200` in targeted probe | Prior requestfailed in hard-check | Admin inbox/user details, profile-linked views |
| Community APIs | `/api/community/channels`, `/api/community/channels/:id/messages`, `/api/community/users`, `/api/community/update-presence` | Internal DB + optional realtime infra | Auth token | Connected with guarded fallback paths | Prior realtime reconcile passed; targeted scope confirms dependent auth endpoints healthy | 403/abort noise in some prior scans under auth/state mismatch | `/community`, presence, posting/reconciliation |
| Messaging APIs | `/api/messages/threads`, `/api/messages/threads/:id/messages`, `/api/messages/threads/:id/read`, ensure-admin/user routes | Internal DB + notifications side effects | Auth token | Connected with residual edge risk | Historical strict messaging mostly pass with 2 unreliable edge scenarios | Rapid-switch/burst ordering risk still open | `/messages`, `/admin/inbox` |
| Backtesting APIs | `/api/backtesting/*` | Internal DB/calculation services | Auth token | Partially verified (manual-risk remains) | No new targeted run; prior full QA shows data presence | Mathematical correctness still manual-only | Backtesting pages/reports |
| Leaderboard APIs | `/api/leaderboard`, `/api/aura-analysis/leaderboard` | Internal DB/service aggregation | Auth token (analysis board depends on app auth) | Connected | Prior QA pass + reliability integration test pass for leaderboard windows | None critical in targeted pass | `/leaderboard`, aura-analysis leaderboard widgets |

## Twelve Data integration audit

- Key read location: backend client `api/market-data/providers/twelveDataClient.js` (`process.env.TWELVE_DATA_API_KEY`).
- Primary backend consumers:
  - `api/markets/snapshot.js` (through `market-data/liveHotSnapshot` and market-data layer).
  - `api/ai/health.js` and `api/admin/integration-health.js` provider probes.
  - `api/market/prices.js` direct provider fallback path.
- Frontend dependencies:
  - `src/hooks/useLivePrices.js` -> `/api/markets/snapshot`.
  - Used by `src/components/MarketTicker.js`, `src/pages/Home.js`, `src/pages/aura-analysis/TradeCalculator.js`.
- Missing/invalid/rate-limited fallback behavior:
  - TD client returns structured non-ok (`no_key`, status/error payloads) without crashing.
  - Market snapshot route returns cached/stale snapshot when provider fetch fails; emits `503` only when no viable stale snapshot exists.
  - Health probes classify `rate_limited`/`plan_or_credits` and report degraded instead of leaking secrets.

## Reliability hardening applied (frontend)

- `src/services/Api.js`
  - Added bounded retry helper for idempotent GET (`dedupeGetWithRetry`) with jittered backoff.
  - Applied dedupe+retry to `/api/subscription/status`, `/api/aura-analysis/platform-connect`, `/api/me`, `/api/users/:id`.
- `src/context/SubscriptionContext.js`
  - Switched subscription status loading to shared deduped API helper to reduce duplicate in-flight calls.
- `src/pages/Subscription.js`
  - Reused shared subscription-status helper for initial/verification fetches.
- `src/context/EntitlementsContext.js`
  - Added one bounded retry for transient `/api/me` failures (429/5xx), increased timeout from 3s to 5s.
  - Preserves last known-good entitlements during transient failures instead of forcing null state.
- `src/components/NavbarNotifications.js`
  - Added abort-aware request cancellation, bounded retry for transient 429/5xx, and exponential backoff after failures to reduce polling spam/noise.

## Verification result (targeted)

- Live endpoint probe results (2026-04-24):
  - `/api/subscription/status` -> `200`
  - `/api/notifications?limit=1` -> `200`
  - `/api/aura-analysis/platform-connect` -> `200`
  - `/api/reports/eligibility` -> `200`
  - `/api/me` -> `200`
  - `/api/users/88` -> `200`
  - `/api/markets/snapshot` -> `200`
  - `/api/ai/health` -> `503` with `services.twelveData.status=healthy`
- Targeted local reliability integration test:
  - `tests/reliability-integration.test.js` -> 21 passed, 0 failed.

## Current risk summary

- Remaining high/medium risks are primarily intermittent network/request-failed behavior under load, not hard endpoint outage in current targeted probe.
- `/api/subscription/status` and `/api/aura-analysis/platform-connect` remain highest-priority reliability watchpoints due prior failure density.
- Twelve Data key wiring appears correct; post-key-rotation monitoring should continue on `/api/ai/health` (provider field), `/api/markets/snapshot`, and UI ticker freshness.
