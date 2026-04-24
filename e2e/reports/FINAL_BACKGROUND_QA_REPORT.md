# Final background QA report

**Generated:** 2026-04-22T16:22:28.182Z  
**Base URL:** https://www.auraterminal.ai  

## 1. Executive summary

- Chapters attempted: **35** (passed 8, failed 27, blocked 0).
- Messaging user page bubbles: **0** (https://www.auraterminal.ai/login).
- Admin inbox composer present: **false**.
- Console error samples captured: **0**; network anomaly samples: **8**.

## 2. Passed features/pages

- **PUB-HOME** — Marketing home — https://www.auraterminal.ai/ — data signal: moderate (possible thin/loading shell)
- **PUB-COURSES** — Courses — https://www.auraterminal.ai/courses — data signal: substantive (ok)
- **PUB-EXPLORE** — Explore — https://www.auraterminal.ai/explore — data signal: substantive (ok)
- **PUB-CONTACT** — Contact — https://www.auraterminal.ai/contact — data signal: substantive (ok)
- **PUB-TERMS** — Terms — https://www.auraterminal.ai/terms — data signal: substantive (ok)
- **PUB-PRIVACY** — Privacy — https://www.auraterminal.ai/privacy — data signal: substantive (ok)
- **PUB-LOGIN** — Login form — https://www.auraterminal.ai/login — data signal: substantive (ok)
- **USR-REP** — Reports hub — https://www.auraterminal.ai/reports — data signal: moderate (ok)

## 3. Failed features/pages

### MSG-A2U (P1)
- **URL / feature:** https://www.auraterminal.ai/messages — Messaging admin → user support-thread delivery
- **Description:** Admin-sent message not visible on user page within bounded timeout
- **Likely root cause:** Realtime/polling latency or thread mismatch
- **Evidence:** locator.fill: Timeout 10000ms exceeded.
Call log:
[2m  - waiting for locator('.admin-inbox-form-row input[type="text"]')[22m

- **Known vs new:** known

### MSG-U2A (P1)
- **URL / feature:** https://www.auraterminal.ai/admin/inbox — Messaging user → admin support-thread delivery
- **Description:** User-sent message not visible in admin inbox within bounded timeout
- **Likely root cause:** Realtime/polling latency or selected-thread mismatch
- **Evidence:** locator.fill: Timeout 10000ms exceeded.
Call log:
[2m  - waiting for locator('.message-input')[22m

- **Known vs new:** known

### USR-PROFILE (P1)
- **URL / feature:** https://www.auraterminal.ai/profile — Profile
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-SUB (P1)
- **URL / feature:** https://www.auraterminal.ai/subscription — Subscription
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-MSG (P1)
- **URL / feature:** https://www.auraterminal.ai/messages — User messages
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-DNA (P1)
- **URL / feature:** https://www.auraterminal.ai/reports/dna — Reports DNA
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-REP-LIVE (P1)
- **URL / feature:** https://www.auraterminal.ai/reports/live — Reports live hub
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-MM-DASH (P1)
- **URL / feature:** https://www.auraterminal.ai/manual-metrics/dashboard — Manual metrics dashboard
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-MM-PROC (P1)
- **URL / feature:** https://www.auraterminal.ai/manual-metrics/processing — Manual metrics processing
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-DECK (P1)
- **URL / feature:** https://www.auraterminal.ai/trader-deck — Trader deck hub
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-DECK-TV (P1)
- **URL / feature:** https://www.auraterminal.ai/trader-deck/trade-validator/overview — Trader deck trade validator overview
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-AURA-OV (P1)
- **URL / feature:** https://www.auraterminal.ai/aura-analysis/dashboard/overview — Aura dashboard overview
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-AURA-PERF (P1)
- **URL / feature:** https://www.auraterminal.ai/aura-analysis/dashboard/performance — Aura dashboard performance tab
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-BT (P1)
- **URL / feature:** https://www.auraterminal.ai/backtesting — Backtesting hub
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-BT-SES (P1)
- **URL / feature:** https://www.auraterminal.ai/backtesting/sessions — Backtesting sessions
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-SURV (P1)
- **URL / feature:** https://www.auraterminal.ai/surveillance — Surveillance
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-PREMIUM (P1)
- **URL / feature:** https://www.auraterminal.ai/premium-ai — Premium AI landing
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-COMM (P1)
- **URL / feature:** https://www.auraterminal.ai/community — Community
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":319,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP Loading… AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems operational","looksLogin":true,"looksError":false,"stuckLoading":true}}
- **Known vs new:** new

### USR-LB (P1)
- **URL / feature:** https://www.auraterminal.ai/leaderboard — Leaderboard
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-LIVE-M (P1)
- **URL / feature:** https://www.auraterminal.ai/live-metrics — Live metrics
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-JOURNAL (P1)
- **URL / feature:** https://www.auraterminal.ai/journal — Journal
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### USR-NOTIF (P1)
- **URL / feature:** https://www.auraterminal.ai/leaderboard — Notifications dropdown
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### ADM-INBOX (P1)
- **URL / feature:** https://www.auraterminal.ai/admin/inbox — Admin inbox
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### ADM-INBOX-DEEP (P1)
- **URL / feature:** https://www.auraterminal.ai/admin/inbox?user=88 — Admin inbox deep link
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### ADM-PANEL (P1)
- **URL / feature:** https://www.auraterminal.ai/admin — Admin panel
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### ADM-USERS (P1)
- **URL / feature:** https://www.auraterminal.ai/admin/users — Admin users list
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new

### ADM-SETTINGS (P1)
- **URL / feature:** https://www.auraterminal.ai/settings — Settings (admin)
- **Description:** Redirected or rendered login while expecting authenticated shell
- **Likely root cause:** Expired Playwright storage state or guard mis-route
- **Evidence:** {"http":200,"digest":{"len":427,"sample":"AURA TERMINAL™ HOME C & S EXPLORE WHY AURA TERMINAL™ CONTACT US SIGN IN SIGN UP SIGN IN ACCESS YOUR TRADING ACCOUNT EMAIL OR USERNAME PASSWORD LOGIN FORGOT PASSWORD? Don't have an account? SIGN UP AURA TERMINAL™ Trade smarter with AI-powered insights. PLATFORM Home C&S Explore Why Aura Terminal™ Contact RESOURCES Plans Affiliation Privacy Policy Terms of Service © 2025 AURA TERMINAL™. All rights reserved. All systems oper","looksLogin":true,"looksError":false
- **Known vs new:** new


## 4. Blocked features/pages

- *(none)*

## 5. Needs manual verification

- **PUB-HOME-MANUAL** — Marketing home: thin or loading-heavy shell — confirm gating vs defect (https://www.auraterminal.ai/)

## 6. Messaging status

- User `/messages`: {"url":"https://www.auraterminal.ai/login","messageBubbles":0}
- Admin `/admin/inbox`: {"url":"https://www.auraterminal.ai/login","hadComposer":false}

## 7. Data / calculation issues

- **MSG-A2U** — Admin-sent message not visible on user page within bounded timeout
- **MSG-U2A** — User-sent message not visible in admin inbox within bounded timeout
- **USR-PROFILE** — Redirected or rendered login while expecting authenticated shell
- **USR-SUB** — Redirected or rendered login while expecting authenticated shell
- **USR-MSG** — Redirected or rendered login while expecting authenticated shell
- **USR-DNA** — Redirected or rendered login while expecting authenticated shell
- **USR-REP-LIVE** — Redirected or rendered login while expecting authenticated shell
- **USR-MM-DASH** — Redirected or rendered login while expecting authenticated shell
- **USR-MM-PROC** — Redirected or rendered login while expecting authenticated shell
- **USR-DECK** — Redirected or rendered login while expecting authenticated shell
- **USR-DECK-TV** — Redirected or rendered login while expecting authenticated shell
- **USR-AURA-OV** — Redirected or rendered login while expecting authenticated shell
- **USR-AURA-PERF** — Redirected or rendered login while expecting authenticated shell
- **USR-BT** — Redirected or rendered login while expecting authenticated shell
- **USR-BT-SES** — Redirected or rendered login while expecting authenticated shell
- **USR-SURV** — Redirected or rendered login while expecting authenticated shell
- **USR-PREMIUM** — Redirected or rendered login while expecting authenticated shell
- **USR-COMM** — Redirected or rendered login while expecting authenticated shell
- **USR-LB** — Redirected or rendered login while expecting authenticated shell
- **USR-LIVE-M** — Redirected or rendered login while expecting authenticated shell
- **USR-JOURNAL** — Redirected or rendered login while expecting authenticated shell
- **USR-NOTIF** — Redirected or rendered login while expecting authenticated shell
- **ADM-INBOX** — Redirected or rendered login while expecting authenticated shell
- **ADM-INBOX-DEEP** — Redirected or rendered login while expecting authenticated shell
- **ADM-PANEL** — Redirected or rendered login while expecting authenticated shell
- **ADM-USERS** — Redirected or rendered login while expecting authenticated shell
- **ADM-SETTINGS** — Redirected or rendered login while expecting authenticated shell

## 8. Info-loading / stale-data issues

- **PUB-HOME-THIN** — https://www.auraterminal.ai/ — Very little visible text or persistent loading wording

## 9. Admin issues

- ADM-INBOX: Redirected or rendered login while expecting authenticated shell
- ADM-INBOX-DEEP: Redirected or rendered login while expecting authenticated shell
- ADM-PANEL: Redirected or rendered login while expecting authenticated shell
- ADM-USERS: Redirected or rendered login while expecting authenticated shell
- ADM-SETTINGS: Redirected or rendered login while expecting authenticated shell

## 10. Gating / entitlement issues

- *(none)*

## 11. Console / network / API issue summary

### Console (sample)

### Network (sample)
- requestfailed  https://www.auraterminal.ai/api/markets/snapshot
- requestfailed  https://www.auraterminal.ai/assets/my-bg.jpg
- requestfailed  https://www.auraterminal.ai/api/courses
- requestfailed  https://www.google.com/maps/vt?pb=!1m5!1m4!1i9!2i256!3i170!4i256!2m3!1e0!2sm!3i776539984!2m3!1e2!2sspotlit!5i1!3m13!2sen!3sUS!5e289!12m5!1e68!2m2!1sset!2sRoadmap!4e2!12m3!1e37!2m1!
- requestfailed  https://www.google.com/maps/vt?pb=!1m5!1m4!1i9!2i254!3i169!4i256!2m3!1e0!2sm!3i776539984!2m3!1e2!2sspotlit!5i1!3m13!2sen!3sUS!5e289!12m5!1e68!2m2!1sset!2sRoadmap!4e2!12m3!1e37!2m1!
- requestfailed  https://js.stripe.com/v3/m-outer-3437aaddcdf6922d623e172c2d6f9278.html
- requestfailed  https://www.auraterminal.ai/static/js/9319.35d743cf.chunk.js
- requestfailed  https://www.auraterminal.ai/static/js/1481.6535b6d1.chunk.js

## 12. Highest-priority remaining fixes

1. **MSG-A2U** (P1): Messaging admin → user support-thread delivery — Admin-sent message not visible on user page within bounded timeout
1. **MSG-U2A** (P1): Messaging user → admin support-thread delivery — User-sent message not visible in admin inbox within bounded timeout
1. **USR-PROFILE** (P1): Profile — Redirected or rendered login while expecting authenticated shell
1. **USR-SUB** (P1): Subscription — Redirected or rendered login while expecting authenticated shell
1. **USR-MSG** (P1): User messages — Redirected or rendered login while expecting authenticated shell
1. **USR-DNA** (P1): Reports DNA — Redirected or rendered login while expecting authenticated shell
1. **USR-REP-LIVE** (P1): Reports live hub — Redirected or rendered login while expecting authenticated shell
1. **USR-MM-DASH** (P1): Manual metrics dashboard — Redirected or rendered login while expecting authenticated shell
1. **USR-MM-PROC** (P1): Manual metrics processing — Redirected or rendered login while expecting authenticated shell
1. **USR-DECK** (P1): Trader deck hub — Redirected or rendered login while expecting authenticated shell
1. **USR-DECK-TV** (P1): Trader deck trade validator overview — Redirected or rendered login while expecting authenticated shell
1. **USR-AURA-OV** (P1): Aura dashboard overview — Redirected or rendered login while expecting authenticated shell
