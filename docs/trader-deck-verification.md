# Trader Deck — systematic verification record

This document satisfies the **full codebase verification** plan: mechanical gates, static risk audit notes, API vertical slice map, WebSocket contract, and a **three-pass staging/prod smoke** checklist. Re-run or update this file when Trader Deck contract changes.

## 1. Mechanical gates

| Gate | Command | Notes |
|------|---------|--------|
| Production build | `npm run build` | CRA build uses `DISABLE_ESLINT_PLUGIN=true`; ESLint is **not** enforced during this script. For full lint-on-src, run ESLint separately (may surface legacy issues). |
| Security tests | `npm run test:security` | Runs `tests/security-rbac.test.js`, `rate-limit.test.js`, `entitlements-api.test.js`, `surveillance-pure.test.js`, `csrf-trusted-origins.test.js`. |

Latest recorded run during verification work: **`npm run build`** — succeeded; **`npm run test:security`** — succeeded (same session). Re-run before each release.

## 2. Static risk audit (Trader Deck–related)

Focus patterns: **client cache overriding live API**, **swallowed errors**, **`dataQuality` visibility**.

| Area | Finding | Disposition |
|------|---------|-------------|
| [`MarketIntelligenceDashboard.js`](../src/pages/trader-deck/MarketIntelligenceDashboard.js) | `mergeDashboardFromApi` — live API wins over `localStorage` except `local_override` / explicit reload | By design |
| [`MarketOutlookView.js`](../src/pages/trader-deck/MarketOutlookView.js) | Server-stored outlook (`getTraderDeckContent` payload) vs live `getMarketIntelligence` — banner uses **`pipeline`** when `contentSource === 'saved'` so stored snapshots are visible as such | Implemented |
| [`MarketDecoderView.js`](../src/pages/trader-deck/MarketDecoderView.js) | Quick-symbol preset fetch failure falls back to default chips; optional **dev-only** `console.warn` | Acceptable; user-facing decode uses `run()` error state |
| [`MarketIntelligenceBriefsView.js`](../src/pages/trader-deck/MarketIntelligenceBriefsView.js) | `.catch(() => {})` on optional autogen / poll — intentional to avoid spamming UI when polling | Acceptable |
| [`TraderDeckTradeJournal.js`](../src/pages/trader-deck/TraderDeckTradeJournal.js), [`TraderDeckProfile.js`](../src/pages/trader-deck/TraderDeckProfile.js) | Column prefs / profile defaults in `localStorage` — **not** server intelligence merge | Acceptable |

Repo-wide `localStorage` uses outside Trader Deck (auth, chat, etc.) were **not** altered; they are unrelated to desk intelligence correctness.

## 3. API vertical slice (`Api.js` → `api/trader-deck`)

Client: [`src/services/Api.js`](../src/services/Api.js) methods under `getTraderDeck*` / `putTraderDeckContent` / brief upload/delete/preview/template.

Server entrypoints live under [`api/trader-deck/`](../api/trader-deck/) (e.g. `market-intelligence.js`, `market-decoder.js`, `market-decoder-symbols.js`, `content.js`, `economic-calendar.js`, `news.js`, `brief-preview.js`, `brief-upload.js`, `brief-delete.js`, `brief-template.js`, `headlines-daily.js`).

Views consuming these routes include:

- Market Intelligence dashboard / outlook / briefs
- Economic calendar, news feed
- Market Decoder + `MarketDecoderBriefContent`
- Trader Deck shell: [`TraderDeck.js`](../src/pages/TraderDeck.js), [`TraderDeckLayout.js`](../src/pages/trader-deck/TraderDeckLayout.js)

## 4. WebSockets

**`src/pages/trader-deck`** does not use `useWebSocket` / STOMP for core desk data; **REST + polling** are primary. Other app areas (community, inbox, admin) use sockets independently.

## 5. Three-pass runtime smoke (target deployment)

Run against **your** staging or production API (with real keys/DB/cron as applicable).

### Pass A — Live / healthy backend

1. `GET /api/trader-deck/market-intelligence?refresh=1` — expect `success`, `dataQuality: live` when engines and keys are healthy.
2. Open **Market Intelligence** dashboard — panels match payload fields; clear `localStorage` key `trader-deck-market-intelligence` and reload — live data still shown (no stale override).
3. Open **Market Outlook** for today — if server has stored outlook JSON, banner shows **stored pipeline snapshot**; otherwise live intelligence path.

### Pass B — Degraded / offline client

1. Simulate API failure or use env without keys — expect **`client_seed`** or degraded banners, not silent “perfect” live panels without flags.
2. Confirm **Retry** / reload affordances on news, calendar, briefs, overview as implemented.

### Pass C — Briefs empty vs populated

1. Pick a desk date with **DB rows** — brief list populates; preview works.
2. Pick a date with **no rows** — empty copy, **Retry fetch**, and polling behave as designed (see `MarketIntelligenceBriefsView`).

### Pass D — Intel `content` API (eight institutional sleeves)

Use the same JSON the UI consumes (`GET /api/trader-deck/content`).

1. **Browser:** DevTools → Network → filter `content` → select `intel-daily` or `intel-weekly` → **Response** tab. Check `briefs` array length and each `briefKind` (`aura_institutional_daily_*` / `aura_institutional_weekly_*`). Compare `categorySleevePack.loaded` vs `expected` (8 when complete).
2. **CLI (from repo root):** `node scripts/intel-content-network-check.js --base=https://www.auraterminal.ai --date=YYYY-MM-DD` (add `--token=JWT` if your deployment requires auth for reads). Weekly uses the **week-ending Sunday** derived from `--date`, matching [`getTraderDeckIntelStorageYmd`](../src/lib/trader-deck/deskDates.js).
3. **Interpretation:** If `briefs.length === 0` in the JSON, the empty list is **not** a React filter bug — fix generation/DB/date. If `briefs.length > 0` but the UI shows 0, signed-in **admins** see a one-line “Admin — last API brief rows … after client filter” under the list; that indicates [`normalizeBriefsList`](../src/pages/trader-deck/MarketIntelligenceBriefsView.js) dropped rows (`INTEL_API_BRIEF_KIND_RE`).

### Pass E — Extension / MIME noise (charts)

Some extensions rewrite script URLs (e.g. URLs containing `ad`), producing bogus hosts and **“MIME type text/html”** for `bundle.js`. Charts in this app register UDF via [`udfCompatibleDatafeed.js`](../src/utils/udfCompatibleDatafeed.js), not the static `datafeeds` bundle. **Reproduce in an incognito/private window with extensions disabled** before treating console errors as app regressions.

---

**Reminder:** Passing all in-repo checks plus this smoke matrix is the operational definition of “works on our deployment.” Neither the repo nor a static audit can certify a third-party network or database you have not exercised.
