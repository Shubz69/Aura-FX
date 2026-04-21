# Live issue board — AuraTerminal QA

**Last updated:** 2026-04-21T23:51:17Z — remediation cycle (strict messaging verify + `/reports` empty-state).

## Failed

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification |
|----|-------|----------|---------------|------------|----------------|--------|-------------------|
| E2E-MSG-FULL-001 | Full strict messaging: user → admin inbox visibility (known) | P1 | `/messages` → `/admin/inbox` | **Prod bundle:** admin inbox previously polled thread GET only when WebSocket was disconnected, so user→admin could miss the 7s window if STOMP did not deliver. **Code:** `AdminInbox.js` now polls every 1.5s regardless of WS; deduped `onThreadMessage`; `_sync` on loads. **Spec:** before step 2, admin opens `/admin/inbox?user=<normalUserId>` from storage state. **Verify:** `npx playwright test --config=playwright.strict-messaging.config.js --grep stress` vs `https://www.auraterminal.ai` still **FAIL** step 2 until frontend deploy picks up `AdminInbox.js`. | `e2e/strict-messaging-admininbox.spec.js`, `src/pages/AdminInbox.js` | Open — **blocked on deploy** | 2026-04-21T23:51:17Z |

## Passed

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification |
|----|-------|----------|---------------|------------|----------------|--------|-------------------|
| VER-API-001 | Thread messages API (production) | P0 | API | — | `api/messages/threads.js` | Passed | Prior post-deploy |
| VER-STRICT-FIRST-001 | Admin → user strict first-check | P0 | Messaging | — | `e2e/strict-admin-to-user-first.spec.js` | Passed | Prior post-deploy |
| VER-STRICT-PART-001 | Admin → user strict suite segment | P0 | Messaging | — | `e2e/strict-messaging-admininbox.spec.js` | Passed | Prior post-deploy |
| PASS-DATA-CACHE-001 | Aura GET cache bypass | P1 | Aura dashboards | — | `src/services/Api.js` | Passed | Prior remediation |
| PASS-RPT-001 | Reports live eligibility | P1 | `/reports/live` | — | `useReportsEligibility.js` | Passed | Prior |
| QA-PASS-AGG-001 | Final background QA: **33** chapters passed | P3 | Site-wide | — | `e2e/final-background-full-qa-pass.spec.js` | Passed | 2026-04-21T23:32:15.850Z — see report |
| QA-PASS-PUB-HOME | Marketing home | P3 | https://www.auraterminal.ai/ | Automated pass | Final QA | Passed | bodyChars=319 |
| QA-PASS-PUB-COURSES | Courses | P3 | https://www.auraterminal.ai/courses | Automated pass | Final QA | Passed | bodyChars=708 |
| QA-PASS-PUB-EXPLORE | Explore | P3 | https://www.auraterminal.ai/explore | Automated pass | Final QA | Passed | bodyChars=3690 |
| QA-PASS-PUB-CONTACT | Contact | P3 | https://www.auraterminal.ai/contact | Automated pass | Final QA | Passed | bodyChars=1098 |
| QA-PASS-PUB-TERMS | Terms | P3 | https://www.auraterminal.ai/terms | Automated pass | Final QA | Passed | bodyChars=4725 |
| QA-PASS-PUB-PRIVACY | Privacy | P3 | https://www.auraterminal.ai/privacy | Automated pass | Final QA | Passed | bodyChars=5151 |
| QA-PASS-PUB-LOGIN | Login form | P3 | https://www.auraterminal.ai/login | Automated pass | Final QA | Passed | bodyChars=806 |
| QA-PASS-USR-PROFILE | Profile | P3 | https://www.auraterminal.ai/profile | Automated pass | Final QA | Passed | bodyChars=9320 |
| QA-PASS-USR-SUB | Subscription | P3 | https://www.auraterminal.ai/subscription | Automated pass | Final QA | Passed | bodyChars=950 |
| QA-PASS-USR-MSG | User messages | P3 | https://www.auraterminal.ai/messages | Automated pass | Final QA | Passed | bodyChars=435 |
| QA-PASS-USR-REP | Reports hub | P3 | https://www.auraterminal.ai/reports | Automated pass | Final QA | Passed | bodyChars=307 |
| QA-PASS-USR-DNA | Reports DNA | P3 | https://www.auraterminal.ai/reports/dna | Automated pass | Final QA | Passed | bodyChars=458 |
| QA-PASS-USR-REP-LIVE | Reports live hub | P3 | https://www.auraterminal.ai/reports/live | Automated pass | Final QA | Passed | bodyChars=301 |
| QA-PASS-USR-MM-DASH | Manual metrics dashboard | P3 | https://www.auraterminal.ai/manual-metrics/dashboard | Automated pass | Final QA | Passed | bodyChars=413 |
| QA-PASS-USR-MM-PROC | Manual metrics processing | P3 | https://www.auraterminal.ai/manual-metrics/processing | Automated pass | Final QA | Passed | bodyChars=323 |
| QA-PASS-USR-DECK | Trader deck hub | P3 | https://www.auraterminal.ai/trader-deck | Automated pass | Final QA | Passed | bodyChars=6979 |
| QA-PASS-USR-DECK-TV | Trader deck trade validator overview | P3 | https://www.auraterminal.ai/trader-deck/trade-validator/overview | Automated pass | Final QA | Passed | bodyChars=575 |
| QA-PASS-USR-AURA-OV | Aura dashboard overview | P3 | https://www.auraterminal.ai/aura-analysis/dashboard/overview | Automated pass | Final QA | Passed | bodyChars=467 |
| QA-PASS-USR-AURA-PERF | Aura dashboard performance tab | P3 | https://www.auraterminal.ai/aura-analysis/dashboard/performance | Automated pass | Final QA | Passed | bodyChars=467 |
| QA-PASS-USR-BT | Backtesting hub | P3 | https://www.auraterminal.ai/backtesting | Automated pass | Final QA | Passed | bodyChars=561 |
| QA-PASS-USR-BT-SES | Backtesting sessions | P3 | https://www.auraterminal.ai/backtesting/sessions | Automated pass | Final QA | Passed | bodyChars=475 |
| QA-PASS-USR-SURV | Surveillance | P3 | https://www.auraterminal.ai/community | Automated pass | Final QA | Passed | bodyChars=202 |
| QA-PASS-USR-PREMIUM | Premium AI landing | P3 | https://www.auraterminal.ai/premium-ai | Automated pass | Final QA | Passed | bodyChars=467 |
| QA-PASS-USR-COMM | Community | P3 | https://www.auraterminal.ai/community/announcements | Automated pass | Final QA | Passed | bodyChars=559 |
| QA-PASS-USR-LB | Leaderboard | P3 | https://www.auraterminal.ai/leaderboard | Automated pass | Final QA | Passed | bodyChars=408 |
| QA-PASS-USR-LIVE-M | Live metrics | P3 | https://www.auraterminal.ai/aura-analysis/dashboard/performance | Automated pass | Final QA | Passed | bodyChars=467 |
| QA-PASS-USR-JOURNAL | Journal | P3 | https://www.auraterminal.ai/journal | Automated pass | Final QA | Passed | bodyChars=3247 |
| QA-PASS-USR-NOTIF | Notifications dropdown | P3 | https://www.auraterminal.ai/profile | Automated pass | Final QA | Passed | bodyChars=9896 |
| QA-PASS-ADM-INBOX | Admin inbox | P3 | https://www.auraterminal.ai/admin/inbox | Automated pass | Final QA | Passed | bodyChars=393 |
| QA-PASS-ADM-INBOX-DEEP | Admin inbox deep link | P3 | https://www.auraterminal.ai/admin/inbox?user=88 | Automated pass | Final QA | Passed | bodyChars=400 |
| QA-PASS-ADM-PANEL | Admin panel | P3 | https://www.auraterminal.ai/admin | Automated pass | Final QA | Passed | bodyChars=553 |
| QA-PASS-ADM-USERS | Admin users list | P3 | https://www.auraterminal.ai/admin/users | Automated pass | Final QA | Passed | bodyChars=369 |
| QA-PASS-ADM-SETTINGS | Settings (admin) | P3 | https://www.auraterminal.ai/settings | Automated pass | Final QA | Passed | bodyChars=342 |

## Blocked

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification |
|----|-------|----------|---------------|------------|----------------|--------|-------------------|
| *(none)* | — | — | — | — | — | — | — |

## Needs manual verification

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification |
|----|-------|----------|---------------|------------|----------------|--------|-------------------|
| GATE-SURV-001 | Surveillance route resolved away from /surveillance (likely entitlement guard) | P2 | https://www.auraterminal.ai/community | Entitlement/gating | Final QA | Needs manual | requested /surveillance landed https://www.auraterminal.ai/community |
| PUB-HOME-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/ | May be intentional | Final QA | Needs manual | Very little visible text or persistent loading wording |
| USR-REP-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/reports | Blank main when `eligibility` null (e.g. no token) — **fixed in app** with sign-in/retry panel | `src/pages/reports/ReportsPage.js` | Needs manual (re-check prod post-deploy) | 2026-04-21T23:51Z — code landed |
| USR-DNA-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/reports/dna | May be intentional | Final QA | Needs manual | Very little visible text or persistent loading wording |
| USR-REP-LIVE-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/reports/live | May be intentional | Final QA | Needs manual | Very little visible text or persistent loading wording |
| USR-BT-SES-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/backtesting/sessions | May be intentional | Final QA | Needs manual | Very little visible text or persistent loading wording |
| USR-LB-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/leaderboard | May be intentional | Final QA | Needs manual | Very little visible text or persistent loading wording |
| ADM-INBOX-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/admin/inbox | May be intentional | Final QA | Needs manual | Very little visible text or persistent loading wording |
| ADM-INBOX-DEEP-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/admin/inbox?user=88 | May be intentional | Final QA | Needs manual | Very little visible text or persistent loading wording |
| ADM-USERS-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/admin/users | May be intentional | Final QA | Needs manual | Very little visible text or persistent loading wording |
| ADM-SETTINGS-THIN | Thin/loading shell review | P2 | https://www.auraterminal.ai/settings | May be intentional | Final QA | Needs manual | Very little visible text or persistent loading wording |
| PUB-HOME-MANUAL | Marketing home: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/) | P3 | — | — | Final QA | Needs manual | — |
| USR-REP-MANUAL | Reports hub: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/reports) | P3 | — | — | Final QA | Needs manual | — |
| USR-DNA-MANUAL | Reports DNA: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/reports/dna) | P3 | — | — | Final QA | Needs manual | — |
| USR-REP-LIVE-MANUAL | Reports live hub: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/reports/live) | P3 | — | — | Final QA | Needs manual | — |
| USR-BT-SES-MANUAL | Backtesting sessions: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/backtesting/se | P3 | — | — | Final QA | Needs manual | — |
| USR-LB-MANUAL | Leaderboard: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/leaderboard) | P3 | — | — | Final QA | Needs manual | — |
| ADM-INBOX-MANUAL | Admin inbox: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/admin/inbox) | P3 | — | — | Final QA | Needs manual | — |
| ADM-INBOX-DEEP-MANUAL | Admin inbox deep link: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/admin/inbox?u | P3 | — | — | Final QA | Needs manual | — |
| ADM-USERS-MANUAL | Admin users list: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/admin/users) | P3 | — | — | Final QA | Needs manual | — |
| ADM-SETTINGS-MANUAL | Settings (admin): thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/settings) | P3 | — | — | Final QA | Needs manual | — |

## Scan log (append-only)

| When | Type | Artifact | Summary |
|------|------|----------|---------|
| 2026-04-21T23:32Z | Final background QA | `e2e/reports/final-background-qa-detail.json` | passed=33 failed=0 blocked=0 |
| 2026-04-21T23:51Z | Targeted strict messaging | `playwright.strict-messaging.config.js` `--grep stress` | **FAIL** user→admin (`.admin-inbox-message-text` not within 7s on prod); aligns with undeployed `AdminInbox` polling fix |
| 2026-04-21T23:51Z | Code | `src/pages/reports/ReportsPage.js` | Replaced `!eligibility` **blank** render with sign-in / retry panel (addresses thin-shell class when token or eligibility missing) |
