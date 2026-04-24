# Final hard-check QA report

**Generated:** 2026-04-22T18:04:30.119Z
**Base URL:** https://www.auraterminal.ai

## 1. Executive summary

- Passed=29 Failed=0 Blocked=0 Manual=0
- Phase0 adminValid=true userValid=true attempts=0

## 2. Passed

- FLOW-MSG-A2U — Admin to user messaging (https://www.auraterminal.ai/admin/inbox)
- FLOW-MSG-U2A — User to admin messaging (https://www.auraterminal.ai/messages)
- DATA-reports — Data validity /reports (https://www.auraterminal.ai/reports)
- DATA-reports-dna — Data validity /reports/dna (https://www.auraterminal.ai/reports/dna)
- DATA-reports-live — Data validity /reports/live (https://www.auraterminal.ai/reports/live)
- DATA-manual-metrics-dashboard — Data validity /manual-metrics/dashboard (https://www.auraterminal.ai/manual-metrics/dashboard)
- DATA-trader-deck — Data validity /trader-deck (https://www.auraterminal.ai/trader-deck)
- DATA-trader-deck-trade-validator-overview — Data validity /trader-deck/trade-validator/overview (https://www.auraterminal.ai/trader-deck/trade-validator/overview)
- DATA-aura-analysis-dashboard-overview — Data validity /aura-analysis/dashboard/overview (https://www.auraterminal.ai/aura-analysis/dashboard/overview)
- DATA-aura-analysis-dashboard-performance — Data validity /aura-analysis/dashboard/performance (https://www.auraterminal.ai/aura-analysis/dashboard/performance)
- DATA-backtesting — Data validity /backtesting (https://www.auraterminal.ai/backtesting)
- DATA-backtesting-sessions — Data validity /backtesting/sessions (https://www.auraterminal.ai/backtesting/sessions)
- DATA-leaderboard — Data validity /leaderboard (https://www.auraterminal.ai/leaderboard)
- THIN- — Thin-shell classify / (https://www.auraterminal.ai/)
- THIN-reports — Thin-shell classify /reports (https://www.auraterminal.ai/reports)
- THIN-reports-dna — Thin-shell classify /reports/dna (https://www.auraterminal.ai/reports/dna)
- THIN-reports-live — Thin-shell classify /reports/live (https://www.auraterminal.ai/reports/live)
- THIN-backtesting-sessions — Thin-shell classify /backtesting/sessions (https://www.auraterminal.ai/backtesting/sessions)
- THIN-leaderboard — Thin-shell classify /leaderboard (https://www.auraterminal.ai/leaderboard)
- THIN-admin-inbox — Thin-shell classify /admin/inbox (https://www.auraterminal.ai/admin/inbox)
- THIN-admin-inbox-user-88 — Thin-shell classify /admin/inbox?user=88 (https://www.auraterminal.ai/admin/inbox?user=88)
- THIN-admin-users — Thin-shell classify /admin/users (https://www.auraterminal.ai/admin/users)
- THIN-settings — Thin-shell classify /settings (https://www.auraterminal.ai/settings)
- FLOW-NOTIFICATIONS — Notification system behavior (https://www.auraterminal.ai/profile)
- FLOW-SUB — Subscription flow (https://www.auraterminal.ai/subscription)
- FLOW-COMMUNITY — Community flow (https://www.auraterminal.ai/community)
- FLOW-ADMIN-USERS — Admin users flow (https://www.auraterminal.ai/admin/users)
- FLOW-SETTINGS — Settings flow (https://www.auraterminal.ai/settings)
- GATE-SURV-001 — Surveillance entitlement routing (https://www.auraterminal.ai/surveillance)

## 3. Failed

- *(none)*

## 4. Blocked

- *(none)*

## 5. Needs manual verification

- *(none)*

## 6. Messaging status

- {"a2u":"pass","u2a":"pass","status":"full-duplex-pass"}

## 7. Data/calculation validity findings

- /reports: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /reports/dna: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /reports/live: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /manual-metrics/dashboard: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /trader-deck: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /trader-deck/trade-validator/overview: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /aura-analysis/dashboard/overview: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /aura-analysis/dashboard/performance: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /backtesting: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /backtesting/sessions: status=healthy, dataPresent=true, widgets=2, numericTokens=1
- /leaderboard: status=healthy, dataPresent=true, widgets=2, numericTokens=1

## 8. API reliability findings

- /api/notifications: ok=43 httpFail=0 requestFailed=15 retryObserved=true gracefulFallback=partial
- /api/subscription/status: ok=64 httpFail=1 requestFailed=19 retryObserved=true gracefulFallback=partial
- /api/aura-analysis/platform-connect: ok=6 httpFail=0 requestFailed=36 retryObserved=true gracefulFallback=partial
- /api/reports/eligibility: ok=7 httpFail=0 requestFailed=9 retryObserved=true gracefulFallback=partial
- /api/me: ok=76 httpFail=0 requestFailed=14 retryObserved=true gracefulFallback=partial
- /api/users/88: ok=32 httpFail=0 requestFailed=16 retryObserved=true gracefulFallback=partial
- /api/markets/snapshot: ok=0 httpFail=0 requestFailed=0 retryObserved=false gracefulFallback=n/a

## 9. Thin-shell / missing-data findings

- /: thin but intentional (textLen=393)
- /reports: thin but intentional (textLen=310)
- /reports/dna: healthy (textLen=420)
- /reports/live: thin but intentional (textLen=302)
- /backtesting/sessions: thin but intentional (textLen=476)
- /leaderboard: healthy (textLen=2265)
- /admin/inbox: thin but intentional (textLen=398)
- /admin/inbox?user=88: thin but intentional (textLen=398)
- /admin/users: thin but intentional (textLen=369)
- /settings: thin but intentional (textLen=303)

## 10. Admin findings


## 11. Gating/entitlement findings

- /surveillance: landed=https://www.auraterminal.ai/surveillance verdict=healthy direct route

## 12. Notification-system findings

- {"dropdownInteractive":true,"apiOk":35,"apiFailures":11,"graceful":"yes"}

## 13. Highest-priority remaining fixes

