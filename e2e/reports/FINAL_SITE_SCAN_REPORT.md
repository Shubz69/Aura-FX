# Aura Terminal — final full-site scan report

- **Generated:** 2026-04-21T23:10:18.005Z
- **Base URL:** https://www.auraterminal.ai
- **Targets scanned:** 40

## 1. Executive summary

Automated scan visited **40** entry points using **public**, **authenticated user**, and **admin** Playwright storage states where applicable. Each target was evaluated independently; navigation and assertion failures on one page did not stop the rest. Verdicts: **39 passed**, **0 failed**, **0 blocked**, **1 need manual verification**. Aggregate console errors: **6** unique strings; API HTTP ≥400 (excluding pure auth noise): **3** samples.

## 2. Passed features/pages

- **PUB-001** — Home (/) [public] — _loads_with_substance_
- **PUB-002** — Courses (/courses) [public] — _loads_with_substance_
- **PUB-003** — Explore (/explore) [public] — _loads_with_substance_
- **PUB-004** — Contact (/contact) [public] — _loads_with_substance_
- **PUB-005** — Terms (/terms) [public] — _loads_with_substance_
- **PUB-006** — Privacy (/privacy) [public] — _loads_with_substance_
- **PUB-007** — Login (/login) [public] — _loads_with_substance_
- **PUB-008** — Register (/register) [public] — _loads_with_substance_
- **USR-001** — Profile (/profile) [user] — _loads_with_substance_
- **USR-002** — Subscription (/subscription) [user] — _loads_with_substance_
- **USR-003** — Messages (support) (/messages) [user] — _loads_with_substance_
- **USR-004** — Reports hub (/reports) [user] — _loads_with_substance_
- **USR-005** — Reports live hub (/reports/live) [user] — _loads_with_substance_
- **USR-006** — Reports DNA (/reports/dna) [user] — _intentional_gate_or_upsell_
- **USR-007** — Manual metrics entry (/manual-metrics) [user] — _loads_with_substance_
- **USR-008** — Manual metrics dashboard (/manual-metrics/dashboard) [user] — _loads_with_substance_
- **USR-009** — Manual metrics processing (/manual-metrics/processing) [user] — _loads_with_substance_
- **USR-010** — Trader deck hub (/trader-deck) [user] — _loads_with_substance_
- **USR-011** — Trader deck validator overview (/trader-deck/trade-validator/overview) [user] — _loads_with_substance_
- **USR-012** — Trader deck journal (/trader-deck/trade-validator/journal) [user] — _loads_with_substance_
- **USR-013** — Aura connection hub (/aura-analysis/ai) [user] — _loads_with_substance_
- **USR-014** — Aura dashboard overview (/aura-analysis/dashboard/overview) [user] — _loads_with_substance_
- **USR-015** — Aura dashboard performance (/aura-analysis/dashboard/performance) [user] — _loads_with_substance_
- **USR-016** — Aura risk lab (/aura-analysis/dashboard/risk-lab) [user] — _loads_with_substance_
- **USR-017** — Backtesting hub (/backtesting) [user] — _loads_with_substance_
- **USR-018** — Backtesting sessions (/backtesting/sessions) [user] — _loads_with_substance_
- **USR-019** — Surveillance (/surveillance) [user] — _loads_with_substance_
- **USR-020** — Premium AI (/premium-ai) [user] — _intentional_gate_or_upsell_
- **USR-022** — Journal (/journal) [user] — _loads_with_substance_
- **USR-023** — Leaderboard (/leaderboard) [user] — _loads_with_substance_
- **USR-024** — Live metrics (/live-metrics) [user] — _loads_with_substance_
- **ADM-001** — Admin panel (/admin) [admin] — _loads_with_substance_
- **ADM-002** — Admin inbox (/admin/inbox) [admin] — _loads_with_substance_
- **ADM-003** — Admin users (/admin/users) [admin] — _loads_with_substance_
- **ADM-004** — Admin messages (/admin/messages) [admin] — _loads_with_substance_
- **ADM-005** — Admin journal (/admin/journal) [admin] — _loads_with_substance_
- **ADM-006** — Pipeline health (/admin/pipeline-health) [admin] — _loads_with_substance_
- **ADM-007** — Integration health (/admin/integration-health) [admin] — _loads_with_substance_
- **ADM-008** — Settings (/settings) [admin] — _loads_with_substance_

## 3. Failed features/pages

*(none)*

## 4. Blocked features/pages

*(none)*

## 5. Needs manual verification

- **USR-021** | https://www.auraterminal.ai/community | thin_shell_or_spa | bodyChars=242

## 6. Messaging status

- **User /messages:** passed (loads_with_substance)
- **Admin /admin/inbox:** passed (loads_with_substance)
- **Note:** This scan does not re-run strict realtime send/receive; see `ISSUE_BOARD.md` for VER-* / E2E-MSG-FULL-001.

## 7. Data/calculation issues

*(no failed/blocked/manual flags on data-heavy routes beyond list above)*

## 8. Info-loading / stale-data issues

- **Heuristic:** targets classified as `stuck_loading`, `possible_loading_or_no_mt_data`, or `api_5xx_during_load` may indicate stale or incomplete fetches.
- **USR-021** /community: thin_shell_or_spa

## 9. Admin issues

*(no admin-route failures in this pass)*

## 10. Gating / entitlement issues

- **USR-006** /reports/dna: passed — intentional_gate_or_upsell
- **USR-020** /premium-ai: passed — intentional_gate_or_upsell

## 11. Console / network / API issue summary

### Unique console error samples (capped)
- Failed to load resource: the server responded with a status of 403 ()
- [observability] {scope: api.response_interceptor, type: auth, correlationId: fb75c3ce-2c15-4768-9479-f10aba20e5e0, status: 403, code: ERR_BAD_REQUEST}
- Access forbidden: Authentication failed or insufficient permissions
- Error fetching users for autocomplete: W
- [observability] {scope: api.response_interceptor, type: auth, correlationId: 988c7037-c377-42b6-acc9-b0f184372868, status: 403, code: ERR_BAD_REQUEST}
- [observability] {scope: api.response_interceptor, type: auth, correlationId: de29a2cb-e8ae-4179-bb84-afe6e6391001, status: 403, code: ERR_BAD_REQUEST}

### API HTTP ≥400 samples (capped)
- 403 https://www.auraterminal.ai/api/community/update-presence
- 403 https://www.auraterminal.ai/api/community/users
- 403 https://www.auraterminal.ai/api/admin/journal-stats

## 12. Highest-priority remaining fixes

*(none flagged automatic — follow manual list)*

---

## Raw data

Machine-readable: `e2e/reports/final-full-site-scan-data.json`
