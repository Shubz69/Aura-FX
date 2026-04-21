# Live issue board — AuraTerminal QA + remediation

**Last updated:** 2026-04-21 (autonomous remediation pass)  
**Single source of truth** for Failed / Passed / Blocked / Needs manual verification.

---

## Failed

*(none — all actionable items are fixed in repo or moved to Blocked pending deploy / prod verification.)*

---

## Passed

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification result |
|----|-------|----------|---------------|------------|----------------|--------|-------------------------|
| PASS-CSP-001 | Google Translate script blocked by CSP | P3 | Site-wide | `script-src-elem` omitted `https://translate.google.com` | `public/index.html` | Fixed locally | CSP meta updated; needs deploy to confirm console clean |
| PASS-RPT-001 | `/reports/live` stuck on “Loading…” | P1 | `/reports/live` | `useReportsEligibility` returned early when `token` falsy without clearing `loading` | `src/pages/reports/useReportsEligibility.js` | Fixed locally | Code path: `setLoading(false)` when `!token` |
| PASS-NET-001 | `net::ERR_ABORTED` on navigations | P2 | Various | In-flight XHR cancelled on route change / fast automation | Browser + `Api.js` | Accepted | Not a functional defect; observability noise under fast scans |
| GATE-001 | Reports DNA / manual metrics gating | P2 | `/reports/dna`, manual metrics | Pre-gate UX | `src/components/RouteGuards.js` | Previously verified | `targeted-verification-results.json` |
| OBS-001 | API correlation / error taxonomy | P3 | Global | Observability | `src/utils/apiObservability.js`, `src/services/Api.js` | Previously verified | Prior session |

---

## Blocked

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification result |
|----|-------|----------|---------------|------------|----------------|--------|-------------------------|
| BLK-E2E-001 | Strict support-thread E2E step 7 (admin → user UI ≤7s) | P0 | `www.auraterminal.ai` / `/messages` | Production still serves pre-fix bundle; local fixes not on CDN yet | `src/pages/Messages.js`, `e2e/strict-admin-to-user-first.spec.js` | **Blocked — deploy** | `npx playwright test --config=playwright.strict-first.config.js` — step 7 still fails on prod after local fixes |
| BLK-E2E-002 | Thread WS broadcast JSON safety (BigInt) | P0 | Railway websocket + Vercel `POST …/messages` | Raw MySQL row in `JSON.stringify` could break broadcast; fixed in API | `api/messages/threads.js` | **Blocked — deploy** | Code fix only; needs Vercel API deploy + optional Railway if WS URL unchanged |
| BLK-POST-001 | Intermittent `POST …/threads/:id/messages` 500 in prod | P0 | Vercel `/api/messages/threads` | Requires live logs / deploy SHA correlation | `api/messages/threads.js` | **Blocked — env/prod** | No stable local repro; continue after deploy + log review |

**Deploy checkpoint actions (exact):**

1. Deploy **Vercel** with: `src/pages/Messages.js`, `src/pages/AdminInbox.js`, `src/pages/reports/useReportsEligibility.js`, `public/index.html`, `api/messages/threads.js`.
2. Re-run: `npx playwright test --config=playwright.strict-first.config.js` (uses `e2e/reports/auraterminal-admin.json` + `auraterminal-normal-user.json`).
3. If step 7 still fails, pull **Vercel** function log for failing `POST` using request `X-Vercel-Id` and Railway WS `/api/broadcast-thread-message` response.

---

## Needs manual verification

| ID | Title | Severity | Affected area | Root cause | Files involved | Status | Last verification result |
|----|-------|----------|---------------|------------|----------------|--------|-------------------------|
| MAN-001 | Human pass: admin inbox → user `/messages` latency | P1 | `/admin/inbox`, `/messages` | Real browser perception | — | Open | After deploy |
| MAN-002 | `/surveillance` vs `/community` redirect for gated users | P2 | `/surveillance` | Entitlement vs bug | `SurveillanceGuard`, routing | Open | `priority-focus-scan.json` |

---

## Scan log (append-only)

| When | Type | Artifact | Summary |
|------|------|----------|---------|
| 2026-04-21T21:58Z | Priority focus scan | `e2e/reports/priority-focus-scan.json` | Auth normal-user surface pass |
| 2026-04-21T22:09Z | Strict messaging | Playwright `playwright.strict-first.config.js` | Step 7 failed on **production** URL (pre-deploy bundle) |

---

## Summary of fixes (this pass)

- **Messages (support thread):** 1.5s REST reconcile always (removed WS “quiet period” skip); cache-bust param on thread GET; refresh on `visibilitychange` + after WS `wireRealtime`; stable realtime message `id` when missing; **do not overwrite server thread with localStorage** on load error if a thread already exists.
- **Admin inbox:** STOMP handler compares `threadId` with `String(...)` parity to avoid dropped events on type mismatch.
- **Reports live hub:** `useReportsEligibility` no longer leaves `loading` true forever when `token` is temporarily absent.
- **API thread broadcast:** `jsonSafeDeep` on message/thread payload before `fetch` to websocket server (BigInt-safe JSON).
- **CSP:** Allow `https://translate.google.com` for `script-src` / `script-src-elem`.
