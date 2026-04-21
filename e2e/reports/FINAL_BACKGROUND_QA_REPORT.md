# Final background QA report

**Generated:** 2026-04-21T23:32:15.850Z  
**Base URL:** https://www.auraterminal.ai  

## 1. Executive summary

- Chapters attempted: **33** (passed 33, failed 0, blocked 0).
- Messaging user page bubbles: **0** (https://www.auraterminal.ai/messages).
- Admin inbox composer present: **true**.
- Console error samples captured: **12**; network anomaly samples: **14**.

## 2. Passed features/pages

- **PUB-HOME** — Marketing home — https://www.auraterminal.ai/ — data signal: moderate (possible thin/loading shell)
- **PUB-COURSES** — Courses — https://www.auraterminal.ai/courses — data signal: substantive (ok)
- **PUB-EXPLORE** — Explore — https://www.auraterminal.ai/explore — data signal: substantive (ok)
- **PUB-CONTACT** — Contact — https://www.auraterminal.ai/contact — data signal: substantive (ok)
- **PUB-TERMS** — Terms — https://www.auraterminal.ai/terms — data signal: substantive (ok)
- **PUB-PRIVACY** — Privacy — https://www.auraterminal.ai/privacy — data signal: substantive (ok)
- **PUB-LOGIN** — Login form — https://www.auraterminal.ai/login — data signal: substantive (ok)
- **USR-PROFILE** — Profile — https://www.auraterminal.ai/profile — data signal: substantive (ok)
- **USR-SUB** — Subscription — https://www.auraterminal.ai/subscription — data signal: substantive (ok)
- **USR-MSG** — User messages — https://www.auraterminal.ai/messages — data signal: moderate (ok)
- **USR-REP** — Reports hub — https://www.auraterminal.ai/reports — data signal: moderate (possible thin/loading shell)
- **USR-DNA** — Reports DNA — https://www.auraterminal.ai/reports/dna — data signal: moderate (possible thin/loading shell)
- **USR-REP-LIVE** — Reports live hub — https://www.auraterminal.ai/reports/live — data signal: moderate (possible thin/loading shell)
- **USR-MM-DASH** — Manual metrics dashboard — https://www.auraterminal.ai/manual-metrics/dashboard — data signal: moderate (ok)
- **USR-MM-PROC** — Manual metrics processing — https://www.auraterminal.ai/manual-metrics/processing — data signal: moderate (ok)
- **USR-DECK** — Trader deck hub — https://www.auraterminal.ai/trader-deck — data signal: substantive (ok)
- **USR-DECK-TV** — Trader deck trade validator overview — https://www.auraterminal.ai/trader-deck/trade-validator/overview — data signal: moderate (ok)
- **USR-AURA-OV** — Aura dashboard overview — https://www.auraterminal.ai/aura-analysis/dashboard/overview — data signal: moderate (ok)
- **USR-AURA-PERF** — Aura dashboard performance tab — https://www.auraterminal.ai/aura-analysis/dashboard/performance — data signal: moderate (ok)
- **USR-BT** — Backtesting hub — https://www.auraterminal.ai/backtesting — data signal: moderate (ok)
- **USR-BT-SES** — Backtesting sessions — https://www.auraterminal.ai/backtesting/sessions — data signal: moderate (possible thin/loading shell)
- **USR-SURV** — Surveillance — https://www.auraterminal.ai/community — data signal: moderate (ok)
- **USR-PREMIUM** — Premium AI landing — https://www.auraterminal.ai/premium-ai — data signal: moderate (ok)
- **USR-COMM** — Community — https://www.auraterminal.ai/community/announcements — data signal: moderate (ok)
- **USR-LB** — Leaderboard — https://www.auraterminal.ai/leaderboard — data signal: moderate (possible thin/loading shell)
- **USR-LIVE-M** — Live metrics — https://www.auraterminal.ai/aura-analysis/dashboard/performance — data signal: moderate (ok)
- **USR-JOURNAL** — Journal — https://www.auraterminal.ai/journal — data signal: substantive (ok)
- **USR-NOTIF** — Notifications dropdown — https://www.auraterminal.ai/profile — data signal: substantive (ok)
- **ADM-INBOX** — Admin inbox — https://www.auraterminal.ai/admin/inbox — data signal: moderate (possible thin/loading shell)
- **ADM-INBOX-DEEP** — Admin inbox deep link — https://www.auraterminal.ai/admin/inbox?user=88 — data signal: moderate (possible thin/loading shell)
- **ADM-PANEL** — Admin panel — https://www.auraterminal.ai/admin — data signal: moderate (ok)
- **ADM-USERS** — Admin users list — https://www.auraterminal.ai/admin/users — data signal: moderate (possible thin/loading shell)
- **ADM-SETTINGS** — Settings (admin) — https://www.auraterminal.ai/settings — data signal: moderate (possible thin/loading shell)

## 3. Failed features/pages

- *(none)*

## 4. Blocked features/pages

- *(none)*

## 5. Needs manual verification

- **PUB-HOME-MANUAL** — Marketing home: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/)
- **USR-REP-MANUAL** — Reports hub: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/reports)
- **USR-DNA-MANUAL** — Reports DNA: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/reports/dna)
- **USR-REP-LIVE-MANUAL** — Reports live hub: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/reports/live)
- **USR-BT-SES-MANUAL** — Backtesting sessions: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/backtesting/sessions)
- **USR-LB-MANUAL** — Leaderboard: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/leaderboard)
- **ADM-INBOX-MANUAL** — Admin inbox: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/admin/inbox)
- **ADM-INBOX-DEEP-MANUAL** — Admin inbox deep link: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/admin/inbox?user=88)
- **ADM-USERS-MANUAL** — Admin users list: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/admin/users)
- **ADM-SETTINGS-MANUAL** — Settings (admin): thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/settings)

## 6. Messaging status

- User `/messages`: {"url":"https://www.auraterminal.ai/messages","messageBubbles":0}
- Admin `/admin/inbox`: {"url":"https://www.auraterminal.ai/admin/inbox","hadComposer":true}

## 7. Data / calculation issues

- *(none explicitly classified; see failed + thin-shell notes)*

## 8. Info-loading / stale-data issues

- **PUB-HOME-THIN** — https://www.auraterminal.ai/ — Very little visible text or persistent loading wording
- **USR-REP-THIN** — https://www.auraterminal.ai/reports — Very little visible text or persistent loading wording
- **USR-DNA-THIN** — https://www.auraterminal.ai/reports/dna — Very little visible text or persistent loading wording
- **USR-REP-LIVE-THIN** — https://www.auraterminal.ai/reports/live — Very little visible text or persistent loading wording
- **USR-BT-SES-THIN** — https://www.auraterminal.ai/backtesting/sessions — Very little visible text or persistent loading wording
- **USR-LB-THIN** — https://www.auraterminal.ai/leaderboard — Very little visible text or persistent loading wording
- **ADM-INBOX-THIN** — https://www.auraterminal.ai/admin/inbox — Very little visible text or persistent loading wording
- **ADM-INBOX-DEEP-THIN** — https://www.auraterminal.ai/admin/inbox?user=88 — Very little visible text or persistent loading wording
- **ADM-USERS-THIN** — https://www.auraterminal.ai/admin/users — Very little visible text or persistent loading wording
- **ADM-SETTINGS-THIN** — https://www.auraterminal.ai/settings — Very little visible text or persistent loading wording

## 9. Admin issues

- *(captured under failed/blocked if any)*

## 10. Gating / entitlement issues

- **GATE-SURV-001** — Surveillance route resolved away from /surveillance (likely entitlement guard) (https://www.auraterminal.ai/community)

## 11. Console / network / API issue summary

### Console (sample)
- Failed to fetch notifications: TypeError: Failed to fetch
    at window.fetch (https://www.auraterminal.ai/static/js/main.0d5e65e6.js:2:127286)
    at https://www.auraterminal.ai/static/js/main.0d5e65
- [observability] {scope: notifications.list_fetch, type: unknown, correlationId: null, status: null, code: null}
- [observability] {scope: auth.session_verify_user, type: unknown, correlationId: null, status: null, code: null}
- [observability] {scope: reports.eligibility.fetch, type: unknown, correlationId: null, status: null, code: null}
- Failed to load resource: the server responded with a status of 403 ()
- [observability] {scope: api.response_interceptor, type: auth, correlationId: d3bf6942-b741-47da-ab8d-6f2a2df8ed9c, status: 403, code: ERR_BAD_REQUEST}
- Access forbidden: Authentication failed or insufficient permissions
- Error fetching users for autocomplete: W
- [observability] {scope: api.response_interceptor, type: auth, correlationId: 1dbffec2-447f-4272-8b41-7b4bd9b61063, status: 403, code: ERR_BAD_REQUEST}
- [observability] {scope: admin_inbox.load_users_threads, type: unknown, correlationId: null, status: null, code: null}
- Error fetching users: TypeError: Failed to fetch
    at window.fetch (https://www.auraterminal.ai/static/js/main.0d5e65e6.js:2:127286)
    at $e (https://www.auraterminal.ai/static/js/7382.de377679.ch
- Error fetching channels: TypeError: Failed to fetch
    at window.fetch (https://www.auraterminal.ai/static/js/main.0d5e65e6.js:2:127286)
    at aa (https://www.auraterminal.ai/static/js/7382.de377679

### Network (sample)
- requestfailed  https://www.auraterminal.ai/api/markets/snapshot
- requestfailed  https://www.auraterminal.ai/assets/my-bg.jpg
- requestfailed  https://www.auraterminal.ai/api/courses
- requestfailed  https://m.stripe.network/inner.html
- requestfailed  https://www.auraterminal.ai/api/notifications?limit=20
- requestfailed  https://www.auraterminal.ai/api/aura-analysis/platform-connect
- requestfailed  https://www.auraterminal.ai/api/subscription/status
- requestfailed  https://www.auraterminal.ai/api/messages/threads/30/messages?limit=50&_sync=1776814279566
- requestfailed  https://www.auraterminal.ai/static/js/9319.35d743cf.chunk.js
- requestfailed  https://www.auraterminal.ai/api/notifications?limit=1
- requestfailed  https://www.auraterminal.ai/api/users/88
- requestfailed  https://www.auraterminal.ai/static/js/1481.0bdd0e95.chunk.js
- requestfailed  https://www.auraterminal.ai/api/me
- requestfailed  https://www.auraterminal.ai/api/reports/eligibility

## 12. Highest-priority remaining fixes

- No P0/P1 failures in this pass; review P2 thin shells and gating notes.
