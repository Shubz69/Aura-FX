# Live issue board — AuraTerminal QA

**Last updated:** 2026-04-24 — COMM-RT-REM-001 Playwright post + reload verified.

## Failed

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification |
|----|-------|----------|---------------|------------|----------------|--------|-------------------|
| *(none)* | — | — | — | — | — | — | — |

## Blocked

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification |
|----|-------|----------|---------------|------------|----------------|--------|-------------------|
| *(none)* | — | — | — | — | — | — | — |

## Needs manual verification

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification |
|----|-------|----------|---------------|------------|----------------|--------|-------------------|
| *(none)* | — | — | — | — | — | — | — |

## Passed (engineering verification)

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification |
|----|-------|----------|---------------|------------|----------------|--------|-------------------|
| COMM-RT-REM-001 | Community channel messages: faster REST reconcile + uncached GETs | P2 | `/community` | — | `src/pages/Community.js`, `src/services/Api.js`, `e2e/community-realtime-reconcile.spec.js` | Passed | `npx playwright test --config=playwright.community-realtime.config.js` — QA post in **General**, visible once before and after reload (2026-04-24) |

## Scan log (append-only)

| When | Type | Artifact | Summary |
|------|------|----------|---------|
| 2026-04-22T18:04Z | Hard-check QA | `e2e/reports/FINAL_HARDCHECK_QA_DETAIL.json` | passed=32 failed=0 blocked=0 |
| 2026-04-22 | Community realtime | `Community.js`, `Api.getChannelMessages` | Faster poll when WS up (2.5s); `skipCache` + `_cb` on channel message GETs; string-id merge dedupe; new `e2e/community-realtime-reconcile.spec.js` |
| 2026-04-24 | Community realtime E2E | `playwright.community-realtime.config.js`, `e2e/community-realtime-reconcile.spec.js` | Passed: rules ack + **General** channel `COMM_QA_E2E_*` post, single DOM match, survives reload |
