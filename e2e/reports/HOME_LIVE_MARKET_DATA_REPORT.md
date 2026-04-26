# Home (logged-in) live market data — audit

**Last updated:** 2026-04-26  
**Scope:** Logged-in `/` dashboard (`LoggedInDashboardHome`), watchlist strip, Market Pulse gauge, Trader Desk summary, headlines; Twelve Data path only via backend.

## 1. Data source map (logged-in home)

| UI area | Primary data | Path | Live vs cached |
|--------|----------------|------|----------------|
| **Watchlist (desk card)** | Quote rows from `GET /api/markets/snapshot` | `buildLiveHotSnapshot` → `fetchQuoteDto` / `fetchPrice` (Twelve Data–first per symbol) | Live with **server route cache** TTL 20s + HTTP `Cache-Control` max-age 30s; client poll **30s** (`useLivePrices` `SNAPSHOT_POLL_MS`), **paused when tab hidden** |
| **Market Pulse** | Trader Lab session fields (`bias`, `pct` gauge) | `Api.getTraderLabSessions()` — internal | **Not** market prices; lab-derived labels only |
| **Trader Desk summary** | Same lab session + computed KPIs from Aura trades | `Api.getAuraAnalysisTrades`, lab sessions | **Not** live TD prices |
| **Live metrics / equity mini** | Aura Analysis P&L + trade list | Internal APIs | **Not** Twelve Data |
| **Headlines** | `Api.getTraderDeckNews(false)` | Trader Deck news route | Editorial/feed, not snapshot |
| **Public hero ticker** (logged-out only on same page) | Same snapshot hook | `/api/markets/snapshot` | Same as watchlist backend path |

## 2. Root causes of “static” / stale watchlist feel (before this pass)

1. **Fixed slice:** `DeskWatchlist` used `getPricesArray().slice(0, 4)` on the **beginner set order only** — same four symbols whenever the user glanced at the card.  
2. **Slow visible refresh:** Snapshot poll at **30s** (by design, to align with CDN/browser cache and limit REST); prices could feel frozen between ticks even though the server cache rotates every ~20s.  
3. **No explicit freshness UI:** No “as of” time or server cache hint on the home watchlist card.  
4. **Fallback ambiguity:** Rows could come from `source: 'fallback'` without a compact in-card label (ticker had delayed states; desk card did not).

## 3. Changes implemented (2026-04-26)

- **`src/constants/homeDashboardMarketPool.js`** — Canonical **24-symbol** rotation pool (FX, crypto, metals, indices, major US names, macro).  
- **`src/pages/Home.js` (`DeskWatchlist`)** — Subscribes with `useLivePrices({ symbols: HOME_DASHBOARD_MARKET_POOL })`, **rotates visible window of 4** every **22s** while the document is **visible** (no extra HTTP vs global singleton poll).  
- **`src/styles/Home.css`** — Meta row + “alt” badge for fallback/delayed rows.  
- **`api/markets/snapshot.js`** — Response **`meta`**: `{ serverRouteCacheHit, cacheTtlMs, symbolCount, staleFallback }` (+ optional `buildDurationMs` on fresh builds).  
- **`src/hooks/useLivePrices.js`** — Parses `meta` into `getHealth().lastSnapshotMeta` for UI/diagnostics.

## 4. Price / % change correctness

- Server builds rows via `legacyPriceRowFromQuoteDto` (`api/market/prices.js`): **% vs previous close** when available; FX uses `changeVsPreviousCloseOnly`; else session open / zero fallbacks per existing rules.  
- **DATA-ORACLE-NEEDED:** Field-level agreement with Twelve Data’s raw quote JSON is **not** automated here; correctness is **as implemented in the backend DTO pipeline**, not independently oracle-verified per deploy.

## 5. Twelve Data / REST / WebSocket

- **Twelve Data:** Primary path remains `fetchQuoteDto` inside `liveHotSnapshot` when the key and symbol class allow.  
- **REST spike posture:** Home changes **do not** shorten `SNAPSHOT_POLL_MS` (still **30s**) — **no intentional increase** in client poll rate. Rotation is **UI-only**.  
- **WebSocket:** `api/market-data/marketStreamProvider.js` remains a **no-op**; no browser→TD WebSocket added.

## 6. Verification (targeted, 2026-04-26)

| Check | Result |
|-------|--------|
| `GET https://www.auraterminal.ai/api/markets/snapshot` | HTTP **200** (prod; pre-deploy body may omit new `meta` until release) |
| `GET https://www.auraterminal.ai/api/market/prices?symbols=BTCUSD,EURUSD` | HTTP **200** |
| `GET https://www.auraterminal.ai/api/ai/health` → `services.twelveData.status` | HTTP **200**, status **healthy** |
| Logged-in home bundle | **Manual / post-deploy:** confirm watchlist meta line, rotation every ~22s, `meta` present on snapshot after deploy |

## 7. Related risk IDs

- **QA-RISK-HOME-LIVE-MARKET-001** — Home watchlist UX + freshness labelling; bounded engineering pass; oracle-grade % verification still manual.  
- **QA-RISK-TWELVEDATA-REST-SPIKE-001** — Continued monitoring; home work does not add poll frequency.  
- **QA-RISK-TWELVEDATA-WS-001** — WS still not wired; future backend-owned stream.
