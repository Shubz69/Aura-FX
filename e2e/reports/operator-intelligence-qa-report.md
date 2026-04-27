# Operator Intelligence — Playwright QA report

**Generated:** 2026-04-27 (local run)

## Overall: **PASS**

| Step | Result |
|------|--------|
| Playwright (`npm run test:e2e:operator-intelligence`) | PASS (Chromium, ~15s) |
| `npm run build` | PASS (`Compiled successfully`, exit 0) |
| `node scripts/verify-i18n-locales.mjs` | PASS (after restoring `navbar.operatorIntelligence` in all locales) |

## How to re-run

```bash
npm run test:e2e:operator-intelligence
```

- Config: `playwright.operator-intelligence.config.js` (starts CRA with `REACT_APP_API_URL=` so `/api` stays same-origin and CSP is satisfied on `http://localhost:3000`).
- HTML report: `e2e/playwright-report-operator-intelligence/index.html`
- Auth: rewrites `e2e/reports/auraterminal-normal-user.json` origin to `PLAYWRIGHT_BASE_URL` / `http://localhost:3000` (same pattern as other Aura Terminal e2e specs).

## Screenshots (full-page)

Relative to repo root:

- `e2e/artifacts/operator-intelligence-qa/oi-desktop.png` (1440×900)
- `e2e/artifacts/operator-intelligence-qa/oi-tablet.png` (834×1112)
- `e2e/artifacts/operator-intelligence-qa/oi-mobile.png` (390×844)

*(An earlier failed run may leave `e2e/artifacts/operator-intelligence-qa/oi-FAILURE-state.png`; safe to delete.)*

## What was verified

- `/operator-intelligence` loads when authenticated (no stuck login for this route).
- Navbar user menu: `/operator-intelligence` link is **immediately after** `/operator-galaxy`; label matches **Operator Intelligence** (or localized equivalent / missing-key fallback pattern).
- Sections visible: Aura Pulse, Market Drivers, Operator Bias Engine, Live Market View, Market Intelligence Feed, Market Impact Calendar, Action summary (“What to do now”).
- Desktop: click chart → **Candle Intelligence** dialog → content including “Practical guidance” → close via backdrop (avoids navbar intercepting drawer close).
- No horizontal overflow on `.oi-page` for desktop / tablet / mobile checks.
- **Blocking** console: none after filters (see below).

## Console errors

### Blocking (must be empty for PASS)

- **None** on last successful run.

### Ignored (documented dev / stale JWT / tooling noise)

The spec filters these categories so local QA does not fail on environment noise that is **not** Operator Intelligence regressions:

- `403 (Forbidden)` / “Access forbidden” / `api.response_interceptor` with `type: auth` (saved Playwright JWT can be expired vs live API).
- `auth.session_verify_user` observability lines tied to the above.
- `Subscription fetch error: AxiosError` when auth is marginal.
- `WebSocket connection to 'ws://localhost:3000/ws' failed: Invalid frame header` — CRA dev client vs app STOMP on the same `/ws` path.

**Recommended:** regenerate `e2e/reports/auraterminal-normal-user.json` when JWT expires (`e2e/create-normal-user-state.spec.js` / `manual-save-normal-user-state.spec.js`) to reduce ignored noise and validate real `/api/me` flows.

## Visual issues

- None noted on last pass (layout / overflow checks passed).

## Build (`npm run build`)

- **PASS** — production bundle built after Playwright; CRA reported `Compiled successfully`.

## Recommended fixes (follow-up)

1. **Auth storage:** Refresh `e2e/reports/auraterminal-normal-user.json` periodically so `/api/me` and subscription calls succeed in e2e (fewer ignored 403s).
2. **Dev WebSocket:** Consider separating STOMP path from CRA HMR (e.g. different path than `/ws`) to remove “Invalid frame header” noise in local dev.
3. **i18n:** Ensure `navbar.operatorIntelligence` stays in **all** `src/i18n/locales/*/common.json` files when adding navbar keys (parity enforced by `npm run verify:i18n`).

## Repo files touched for this QA

- `tests/operator-intelligence.spec.js` — new Playwright spec.
- `playwright.operator-intelligence.config.js` — focused config (Chromium + webServer env).
- `playwright.config.js` — `testDir: '.'` + `testMatch` includes `tests/**/*.spec.js`.
- `package.json` — script `test:e2e:operator-intelligence`.
- `src/i18n/locales/*/common.json` — `navbar.operatorIntelligence` restored across locales.
