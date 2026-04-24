# Live issue board — AuraTerminal QA

**Last updated:** 2026-04-24 — strict messaging + bounded concurrency validation passed; residual API abort risk remains.

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
| QA-RISK-API-001 | Intermittent API aborts / partial fallback across key endpoints | P1 | `/api/subscription/status`, `/api/aura-analysis/platform-connect`, notifications | Network instability and retry/fallback gaps under load | `e2e/reports/FINAL_HARDCHECK_QA_DETAIL.json`, `e2e/reports/API_CONNECTIVITY_STATUS_REPORT.md`, `src/services/Api.js`, `src/context/EntitlementsContext.js`, `src/components/NavbarNotifications.js` | RISK | targeted probe (2026-04-24): key endpoints returned 200; residual load/abort risk remains |
| QA-MANUAL-DATA-001 | Financial/report metric correctness needs manual math validation | P1 | reports/deck/aura-analysis/backtesting | Automation validates presence, not formula correctness | `e2e/reports/FINAL_FULL_WEBSITE_STATUS_REPORT.md` | MANUAL | manual oracle comparison required |
| QA-MANUAL-ENT-001 | Entitlement matrix and payment business-rules need manual QA | P1 | premium/elite gates, subscription flow | Rule-level behavior requires real account/tier checks | `e2e/reports/FINAL_FULL_WEBSITE_STATUS_REPORT.md` | MANUAL | tier x route x channel matrix pending |

## Passed (engineering verification)

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification |
|----|-------|----------|---------------|------------|----------------|--------|-------------------|
| COMM-RT-REM-001 | Community channel messages: faster REST reconcile + uncached GETs | P2 | `/community` | — | `src/pages/Community.js`, `src/services/Api.js`, `e2e/community-realtime-reconcile.spec.js` | Passed | `npx playwright test --config=playwright.community-realtime.config.js` — QA post in **General**, visible once before and after reload (2026-04-24) |
| QA-RISK-MSG-001 | Admin inbox rapid-switch / burst-send product correctness | P1 | `/admin/inbox`, `/messages` | — | `src/pages/AdminInbox.js`, `e2e/strict-messaging-admininbox.spec.js`, `e2e/reports/strict-messaging-admininbox-results.json` | PASS/CLOSED | strict messaging (chromium): `rapidSwitchProductCorrectness=PASS`, admin burst=PASS, user burst=PASS, `rapidSwitchOverall=PASS_WITH_RISK` (2026-04-24) |
| QA-RISK-MSG-CONCURRENCY-001 | High-concurrency messaging reliability (bounded overlap validation) | P1 | `/admin/inbox`, `/messages`, `/api/messages/threads*` | — | `e2e/messaging-concurrency.spec.js`, `e2e/reports/messaging-concurrency-report.json`, `src/pages/AdminInbox.js`, `src/pages/Messages.js` | PASS/CLOSED (bounded) | bounded single-thread overlap run: 10/10 delivered, duplicates=0, missing=0, in-thread order preserved, no stale overwrite, no stuck composer, no reload duplicate nodes, no 429/5xx (2026-04-24) |

## Scan log (append-only)

| When | Type | Artifact | Summary |
|------|------|----------|---------|
| 2026-04-22T18:04Z | Hard-check QA | `e2e/reports/FINAL_HARDCHECK_QA_DETAIL.json` | passed=32 failed=0 blocked=0 |
| 2026-04-22 | Community realtime | `Community.js`, `Api.getChannelMessages` | Faster poll when WS up (2.5s); `skipCache` + `_cb` on channel message GETs; string-id merge dedupe; new `e2e/community-realtime-reconcile.spec.js` |
| 2026-04-24 | Community realtime E2E | `playwright.community-realtime.config.js`, `e2e/community-realtime-reconcile.spec.js` | Passed: rules ack + **General** channel `COMM_QA_E2E_*` post, single DOM match, survives reload |
| 2026-04-24 | Strict messaging final | `e2e/strict-messaging-admininbox.spec.js`, `e2e/reports/strict-messaging-admininbox-results.json` | `rapidSwitchProductCorrectness=PASS`, `adminUsersFetchReliability=RISK`, `rapidSwitchOverall=PASS_WITH_RISK`, admin/user burst checks PASS; opened `QA-RISK-MSG-CONCURRENCY-001` for bounded concurrent multi-user validation |
| 2026-04-24 | Messaging bounded concurrency | `e2e/messaging-concurrency.spec.js`, `e2e/reports/messaging-concurrency-report.json` | bounded single-thread overlap completed: admin5+user5 overlapping sends, delivered 10/10, duplicates=0, missing=0, order ok, no cross-thread leakage, no stale overwrite, composer responsive; closed `QA-RISK-MSG-CONCURRENCY-001` as bounded-pass |

