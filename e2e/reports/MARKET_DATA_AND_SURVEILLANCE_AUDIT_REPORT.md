# Market Data and Surveillance Audit Report

- Generated: 2026-04-25
- Scope: targeted Trader Desk/Market Decoder/Twelve Data + Surveillance macro-feasibility audit (no broad site scan), with Twelve Data WebSocket feasibility addendum

## 1) Targeted probe evidence

- `/api/markets/snapshot?diagnostics=1` -> `200` (~11.5s cold), second probe `200` (~0.2s warm cache)
- `/api/market/prices?symbols=BTCUSD,ETHUSD,EURUSD,XAUUSD,SPX,NVDA` -> `200` (`liveCount=6`, `delayedCount=0`, `errorCount=0`)
- `/api/ai/health` -> `503` (overall degraded), while Twelve Data service field remains healthy in payload
- `/api/trader-deck/market-intelligence?timeframe=daily` -> `200` (~17.5s)
- `/api/trader-deck/market-decoder?symbol=EURUSD&refresh=1` -> `200` (~12.6s), header `X-Market-Decoder-Engine=5`
- Targeted UI probe loaded Trader Desk route and observed successful market-intelligence/market-decoder API hits

## 2) Data lineage map (UI -> API -> provider/cache)

- Trader Desk UI (`src/pages/TraderDeck.js`) and Market Decoder view (`src/pages/trader-deck/MarketDecoderView.js`)
  - Calls `Api.getTraderDeckMarketIntelligence()` and `Api.getTraderDeckMarketDecoder()`
  - Backend routes: `api/trader-deck/market-intelligence.js` and `api/trader-deck/market-decoder.js`
- Shared live pricing UI (`src/hooks/useLivePrices.js`, `src/components/MarketTicker.js`, `TradeCalculator`)
  - Calls `/api/markets/snapshot`
  - Route builds from `api/market-data/liveHotSnapshot.js` and market-data layer/provider chain
- Batch prices route (`/api/market/prices`)
  - Uses market-data layer first, then fallback providers and stale/static fallback policy
- Twelve Data provider entrypoint
  - `api/market-data/providers/twelveDataClient.js` with throttling/dedupe (`api/market-data/tdRateLimiter.js`)

## 3) Classification by risk item

- `PASS`:
  - Endpoint connectivity for snapshot/prices/market-intelligence/market-decoder is functional (HTTP 200 in probes).
  - Sampled prices endpoint returned live rows with no delayed/error rows for tested symbols.
- `RISK`:
  - Cold-path latency on market-intelligence/market-decoder can exceed 10s.
  - `/api/ai/health` returned degraded `503`; operationally this means dependency instability can mask provider-specific health.
  - Snapshot stale fallback window and fallback pathways can surface aged data under provider pressure.
- `MANUAL/DATA-ORACLE-NEEDED`:
  - Strategy/verdict math and financial formula correctness in Trader Desk / Decoder outputs.
  - Any "authoritative price correctness" claim versus external benchmark feeds over time.

## 4) Minimal hardening applied in this pass

- `src/services/Api.js`
  - `getTraderDeckMarketDecoder` now sends uncached fetch intent (`skipCache: true`) to reduce stale client reuse during audits.
- `api/markets/snapshot.js`
  - Reduced stale-ok serving window from 15m to 5m to limit aged snapshot exposure.
- `api/market/prices.js`
  - Stale cached fallback is now bounded by `STALE_TTL` instead of accepting arbitrarily old cached entries.

## 5) Surveillance macro-data feasibility (Twelve Data)

- Current surveillance (`api/surveillance/*`) is event/feed-centric (regulatory, central-bank press, geopolitical/logistics, aviation/maritime), not a structured macro-timeseries pipeline.
- Gap:
  - First-class economic indicators (CPI, GDP, unemployment, policy rates, event-calendar values) are not represented as typed macro datasets in surveillance feed contracts.

### Proposed safe integration (Phase 1, backend-first)

- New endpoint: `GET /api/surveillance/macro/summary?countries=US,EU,UK,JP`
- Data sources:
  - Twelve Data calendar/economic endpoints where available (wrapped via `twelveDataClient` pattern)
  - Optional secondary fallback source for selected indicators if TD response is unavailable
- Response shape:
  - `asOf`, `freshnessSec`, `degraded`, `sources`, `indicators[]` (`country`, `code`, `value`, `previous`, `actualDate`, `nextRelease`, `source`, `isEstimate`)
- Caching:
  - L1 in-memory TTL: 5 min
  - L2 shared cache/store TTL: 15 min
  - Stale-while-revalidate: serve stale for up to 60 min with explicit `degraded=true`
- Rate-limit/guardrails:
  - Reuse TD throttling/dedupe (`tdRateLimiter`) with per-endpoint token budget and request collapsing
  - Hard timeout per provider call, partial-fill semantics
- Fallback behavior:
  - Never silently fabricate macro values; return last-known with `stale=true` and source timestamp
  - If no usable source, return empty indicator slots + `degraded=true` (not fake numbers)
- UI placement:
  - Add a compact "Macro Pulse" strip in Surveillance (country chips + freshness badge + degraded badge)
  - Link drill-down to Trader Desk context cards, but keep Surveillance feed as operational summary

## 6) Twelve Data WebSocket feasibility + integration audit (Venture)

### Current REST hot spots (live/near-live)

- `src/hooks/useLivePrices.js` polls `GET /api/markets/snapshot` every 30s (global singleton), used by `MarketTicker`, `Home`, and `Trade Calculator` surfaces.
- `src/pages/trader-deck/MarketDecoderView.js` runs periodic refresh via `Api.getTraderDeckMarketDecoder(...)` and manual refresh actions.
- `Trader Desk / Market Intelligence` routes call `/api/trader-deck/market-intelligence` and `/api/trader-deck/market-decoder` over REST.
- `/api/market/prices` remains a REST batch path with fallback chains and cache windows.

### Twelve Data WS suitability

- Current provider layer is REST-only (`api/market-data/providers/twelveDataClient.js`); no TD WS client exists in app runtime.
- `api/market-data/marketStreamProvider.js` is explicitly a no-op and already documents WS as a planned long-lived worker concern.
- Twelve Data support docs indicate WS supports quote streaming with:
  - separate WS credit counter from REST,
  - symbol-weighted subscriptions,
  - max ~3 concurrent connections per key (newer connection can evict older),
  - event-rate guardrails (subscribe/unsubscribe/reset events per minute).
- Conclusion: TD WS is suitable for price-tick use-cases (ticker/live quotes), not for macro calendar/news/surveillance narrative feeds.

### Backend vs frontend WS architecture decision

- **Recommended:** one shared server-side TD WS connection pool (backend worker/service), not one WS per browser.
- Reasoning:
  - protects TD connection limits and avoids browser fan-out overuse,
  - centralizes symbol subscription management and backoff/reconnect handling,
  - allows server-side cache of latest ticks and consistent client snapshots,
  - reduces REST `/price` pressure while preserving existing frontend contracts.
- Browser clients should consume app WS/SSE or short REST snapshot deltas from backend cache, not direct Twelve Data WS.

### Symbols/features affected

- High-value live symbols from current watchlist paths:
  - crypto: `BTCUSD`, `ETHUSD`, `SOLUSD`, ...
  - FX/metals: `EURUSD`, `GBPUSD`, `USDJPY`, `XAUUSD`, `XAGUSD`, ...
  - indices/equities where coverage allows.
- Feature impact:
  - `MarketTicker` / Home ticker freshness,
  - Trader Desk live cards and decoder prefill freshness,
  - reduced stale/fallback bursts on `/api/markets/snapshot` and `/api/market/prices`.

### Rate-limit / credit impact expectation

- WS subscriptions consume WS credits per subscribed symbol (not REST API credits).
- Moving persistent live symbols from REST polling to backend-shared WS should reduce REST request volume and provider timeout spikes.
- Residual REST still required for:
  - historical bars/time-series,
  - fundamentals/profile endpoints,
  - macro/economic calendar datasets (WS is not a full replacement).

### Implementation plan (safe phased)

1. Build backend TD WS worker (single connection manager, subscribe/unsubscribe registry).
2. Maintain in-memory + shared cache of latest quote ticks (`symbol -> last tick, ts, source`).
3. Expose lightweight internal stream endpoint for app servers (`/api/market/stream-snapshot` or SSE).
4. Keep `/api/markets/snapshot` as compatibility layer, but source from WS cache first.
5. Add observability: active subscriptions, reconnect count, stale-age, fallback rate.
6. Roll out by symbol cohorts (top 20 -> top 100) with guardrails.

### Risks

- Connection churn/eviction if multiple environments open > allowed TD WS connections.
- Symbol entitlement gaps between markets/plan latency tiers.
- Incorrect subscription lifecycle can leak credits.
- Need strict stale-data flags when WS drops and REST fallback takes over.

## 7) Final status

- `QA-RISK-MARKETDATA-001`: `OPEN (RISK)`
- `QA-RISK-TWELVEDATA-WS-001`: `OPEN (PLANNING/RISK)` — WS capacity exists but integration is not yet implemented.
- Recommended close criteria:
  - p95 endpoint latency SLOs for market-intelligence/decoder under representative load
  - explicit stale/degraded indicators surfaced in UI
  - manual oracle validation for high-impact formula outputs
  - backend-shared TD WS rollout with measured REST-credit reduction and freshness gain on ticker/deck paths
