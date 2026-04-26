# API Connectivity Status Report

Last updated: 2026-04-26 (home dashboard watchlist pass + snapshot `meta` instrumentation)

## Scope and method

- Targeted endpoints audited: `/api/aura-analysis/platform-connect`, `/api/subscription/status`, `/api/notifications`, `/api/markets/snapshot`, Twelve Data integrations, and core dependency routes.
- Sources used: codebase route/service inspection, `FINAL_FULL_WEBSITE_STATUS_REPORT.md`, and targeted live endpoint probes with authenticated normal-user state.
- Secrets policy: no API key values logged; only env var names and masked/boolean config state are documented.

## API connectivity map

| API name | Internal endpoint(s) | External provider | Env var(s) required | Current connection status | Last tested result | Error/failure signal | Pages/features affected |
|---|---|---|---|---|---|---|---|
| Twelve Data health probe | `/api/ai/health` (probe payload `services.twelveData`) | Twelve Data | `TWELVE_DATA_API_KEY` (+ optional `TWELVE_DATA_HEALTH_SYMBOL`) | Connected (provider), service endpoint degraded overall | `services.twelveData.status=healthy`; endpoint HTTP `503` (degraded due non-TD dependencies) | Non-TD subsystem can degrade whole health route | Ops diagnostics, provider readiness checks |
| Markets snapshot | `/api/markets/snapshot` | Twelve Data primary via market-data layer; fallback providers internal | `TWELVE_DATA_API_KEY` primary; fallbacks use `FINNHUB_API_KEY`, `POLYGON_API_KEY`, `COINMARKETCAP_API_KEY`, `FMP_API_KEY` where configured | Connected | HTTP `200` in targeted probe; stale-ok fallback implemented server-side; response **`meta`** (2026-04-26): `serverRouteCacheHit`, `cacheTtlMs`, `symbolCount`, `staleFallback` for lightweight client instrumentation | Historical `requestfailed`/abort events in prior QA artifacts | `MarketTicker`, `Home` (logged-in desk watchlist + public ticker), `TradeCalculator`, live pricing widgets |
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
- REST spike root-cause findings (dashboard minute spikes vs plan):
  - `src/pages/trader-deck/MarketDecoderView.js` background poll called decoder with `refresh=1` every ~30s, bypassing decoder cache.
  - `src/pages/trader-deck/MarketOutlookView.js` interval called market-intelligence with `refresh=true`, bypassing route cache.
  - `api/market/prices.js` had no response-level route cache or in-flight dedupe, so concurrent identical requests rebuilt independently.
  - `api/markets/snapshot.js` could trigger parallel snapshot builds under concurrent misses (no in-flight build sharing).
  - `api/market-data/liveHotSnapshot.js` default Vercel concurrency was high, increasing short-window upstream burst pressure.

## Twelve Data REST reduction changes (this pass)

- `src/pages/trader-deck/MarketDecoderView.js`
  - Background interval + visibility refresh now use cache-friendly decoder reads (`refresh=false`).
  - User-triggered decode actions still use refresh when needed.
- `src/pages/trader-deck/MarketOutlookView.js`
  - Periodic live refresh now uses cache-friendly market-intelligence reads (`refresh=false`) and skips hidden-tab polls.
- `api/markets/snapshot.js`
  - Added in-flight snapshot build dedupe so concurrent misses share one build.
- `api/market/prices.js`
  - Added short response cache TTL (default 8s), in-flight dedupe by symbol set, and route/source instrumentation.
  - Added route cache metrics (`routeCache` hits/misses/shares) and source breakdown in response meta/health.
- `api/market-data/liveHotSnapshot.js`
  - Reduced default Vercel concurrency from 34 -> 16 (non-Vercel 12 -> 10) to reduce burst fanout pressure.
- Missing/invalid/rate-limited fallback behavior:
  - TD client returns structured non-ok (`no_key`, status/error payloads) without crashing.
  - Market snapshot route returns cached/stale snapshot when provider fetch fails; emits `503` only when no viable stale snapshot exists.
  - Health probes classify `rate_limited`/`plan_or_credits` and report degraded instead of leaking secrets.

## Twelve Data WebSocket feasibility (market data only)

- Current app usage is effectively **REST-dominant** for market data (`/api/markets/snapshot`, `/api/market/prices`, decoder/intelligence endpoints); TD WebSocket usage in runtime is **0**.
- Evidence in code:
  - `api/market-data/providers/twelveDataClient.js` implements REST endpoints only.
  - `api/market-data/marketStreamProvider.js` is a no-op with explicit comment that TD WS belongs on a long-lived worker/service.
  - Frontend `useLivePrices` polls snapshot every 30s, and decoder/intelligence rely on REST refresh patterns.
- Plan-fit summary:
  - Venture supports WS credits and multi-symbol subscriptions.
  - WS credits are separate from REST credits and can reduce REST pressure for always-live symbols.
  - Connection limits and subscription event limits favor a **shared backend WS fanout**, not per-browser direct TD WS.
- Recommendation:
  - Keep TD WS strictly for market data (ticker/live quote paths).
  - Do **not** use TD WS for chat/community/admin messaging.
  - Build backend-shared TD WS ingestion + cache; let clients consume app stream/snapshot outputs.

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
  - `/api/markets/snapshot?diagnostics=1` -> `200` (`~11.5s` cold, `~0.2s` warm cache hit)
  - `/api/market/prices?symbols=BTCUSD,ETHUSD,EURUSD,XAUUSD,SPX,NVDA` -> `200` (`liveCount=6`, `delayedCount=0`, `errorCount=0`)
  - `/api/trader-deck/market-intelligence?timeframe=daily` -> `200` (`~17.5s`, uncached sample)
  - `/api/trader-deck/market-decoder?symbol=EURUSD&refresh=1` -> `200` (`~12.6s`, uncached sample, `X-Market-Decoder-Engine=5`)
- Live endpoint probe results (2026-04-25 focused sanity):
  - `/api/markets/snapshot?diagnostics=1` -> `200` (`~9.7s` cold), second probe `200` (`~81ms`)
  - `/api/market/prices?symbols=BTCUSD,ETHUSD,EURUSD,XAUUSD,SPX,NVDA` -> `200` (`~1.1s` first, `~0.26s` second)
  - `/api/ai/health` -> `200` (`services.twelveData.status=healthy`)
  - `/api/trader-deck/market-intelligence?timeframe=daily` -> `200` (`~15.6s`)
  - `/api/trader-deck/market-decoder?symbol=EURUSD` -> `200` (`~0.12s`, cached hit)
- Targeted local reliability integration test:
  - `tests/reliability-integration.test.js` -> 21 passed, 0 failed.
- Community focused sanity (2026-04-25):
  - `e2e/community-reload-persistence.spec.js` failed (`post token not visible` timeout).
  - `e2e/community-latency.spec.js` failed (`post token not visible` timeout).
  - Scripted normal-user community run observed repeated `ERR_CANCELED`/`net::ERR_ABORTED` on `/api/community/*`; no new 500/504 captured in that run.

## Current risk summary

- Remaining high/medium risks are intermittent network/request-failed behavior under load plus high-latency cold paths for market-intelligence/decoder.
- `QA-RISK-TWELVEDATA-REST-SPIKE-001` is now tracked as mitigating/verify: reduction changes are implemented in code, but dashboard minute-credit trend must confirm sustained improvement post-deploy.
- `QA-RISK-TWELVEDATA-WS-001` remains open planning risk until backend-owned WS fanout/cache is implemented.
- `/api/subscription/status` and `/api/aura-analysis/platform-connect` remain highest-priority reliability watchpoints due prior failure density.
- Twelve Data key wiring appears correct; post-key-rotation monitoring should continue on `/api/ai/health` (provider field), `/api/markets/snapshot`, and UI ticker freshness.
- Community messaging risk is now primarily reload persistence correctness (not POST 500); split focused specs (2026-04-25) show:
  - `e2e/community-latency.spec.js` PASS (no API issues; latency report generated in `community-latency-spec-report.json`).
  - `e2e/community-reload-persistence.spec.js` FAIL (`post channel=general`, `reload channel=announcements`, one-copy check fails with zero-count), confirming channel-selection/reload state issue remains open.
