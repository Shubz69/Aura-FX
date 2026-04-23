# Aura Terminal™ â€” final full-site scan report

- **Generated:** 2026-04-21T23:10:18.005Z
- **Base URL:** https://www.auraterminal.ai
- **Targets scanned:** 40

## 1. Executive summary

Automated scan visited **40** entry points using **public**, **authenticated user**, and **admin** Playwright storage states where applicable. Each target was evaluated independently; navigation and assertion failures on one page did not stop the rest. Verdicts: **39 passed**, **0 failed**, **0 blocked**, **1 need manual verification**. Aggregate console errors: **6** unique strings; API HTTP â‰¥400 (excluding pure auth noise): **3** samples.

## 2. Passed features/pages

- **PUB-001** â€” Home (/) [public] â€” _loads_with_substance_
- **PUB-002** â€” Courses (/courses) [public] â€” _loads_with_substance_
- **PUB-003** â€” Explore (/explore) [public] â€” _loads_with_substance_
- **PUB-004** â€” Contact (/contact) [public] â€” _loads_with_substance_
- **PUB-005** â€” Terms (/terms) [public] â€” _loads_with_substance_
- **PUB-006** â€” Privacy (/privacy) [public] â€” _loads_with_substance_
- **PUB-007** â€” Login (/login) [public] â€” _loads_with_substance_
- **PUB-008** â€” Register (/register) [public] â€” _loads_with_substance_
- **USR-001** â€” Profile (/profile) [user] â€” _loads_with_substance_
- **USR-002** â€” Subscription (/subscription) [user] â€” _loads_with_substance_
- **USR-003** â€” Messages (support) (/messages) [user] â€” _loads_with_substance_
- **USR-004** â€” Reports hub (/reports) [user] â€” _loads_with_substance_
- **USR-005** â€” Reports live hub (/reports/live) [user] â€” _loads_with_substance_
- **USR-006** â€” Reports DNA (/reports/dna) [user] â€” _intentional_gate_or_upsell_
- **USR-007** â€” Manual metrics entry (/manual-metrics) [user] â€” _loads_with_substance_
- **USR-008** â€” Manual metrics dashboard (/manual-metrics/dashboard) [user] â€” _loads_with_substance_
- **USR-009** â€” Manual metrics processing (/manual-metrics/processing) [user] â€” _loads_with_substance_
- **USR-010** â€” Trader deck hub (/trader-deck) [user] â€” _loads_with_substance_
- **USR-011** â€” Trader deck validator overview (/trader-deck/trade-validator/overview) [user] â€” _loads_with_substance_
- **USR-012** â€” Trader deck journal (/trader-deck/trade-validator/journal) [user] â€” _loads_with_substance_
- **USR-013** â€” Aura connection hub (/aura-analysis/ai) [user] â€” _loads_with_substance_
- **USR-014** â€” Aura dashboard overview (/aura-analysis/dashboard/overview) [user] â€” _loads_with_substance_
- **USR-015** â€” Aura dashboard performance (/aura-analysis/dashboard/performance) [user] â€” _loads_with_substance_
- **USR-016** â€” Aura risk lab (/aura-analysis/dashboard/risk-lab) [user] â€” _loads_with_substance_
- **USR-017** â€” Backtesting hub (/backtesting) [user] â€” _loads_with_substance_
- **USR-018** â€” Backtesting sessions (/backtesting/sessions) [user] â€” _loads_with_substance_
- **USR-019** â€” Surveillance (/surveillance) [user] â€” _loads_with_substance_
- **USR-020** â€” Premium AI (/premium-ai) [user] â€” _intentional_gate_or_upsell_
- **USR-022** â€” Journal (/journal) [user] â€” _loads_with_substance_
- **USR-023** â€” Leaderboard (/leaderboard) [user] â€” _loads_with_substance_
- **USR-024** â€” Live metrics (/live-metrics) [user] â€” _loads_with_substance_
- **ADM-001** â€” Admin panel (/admin) [admin] â€” _loads_with_substance_
- **ADM-002** â€” Admin inbox (/admin/inbox) [admin] â€” _loads_with_substance_
- **ADM-003** â€” Admin users (/admin/users) [admin] â€” _loads_with_substance_
- **ADM-004** â€” Admin messages (/admin/messages) [admin] â€” _loads_with_substance_
- **ADM-005** â€” Admin journal (/admin/journal) [admin] â€” _loads_with_substance_
- **ADM-006** â€” Pipeline health (/admin/pipeline-health) [admin] â€” _loads_with_substance_
- **ADM-007** â€” Integration health (/admin/integration-health) [admin] â€” _loads_with_substance_
- **ADM-008** â€” Settings (/settings) [admin] â€” _loads_with_substance_

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

- **USR-006** /reports/dna: passed â€” intentional_gate_or_upsell
- **USR-020** /premium-ai: passed â€” intentional_gate_or_upsell

## 11. Console / network / API issue summary

### Unique console error samples (capped)
- Failed to load resource: the server responded with a status of 403 ()
- [observability] {scope: api.response_interceptor, type: auth, correlationId: fb75c3ce-2c15-4768-9479-f10aba20e5e0, status: 403, code: ERR_BAD_REQUEST}
- Access forbidden: Authentication failed or insufficient permissions
- Error fetching users for autocomplete: W
- [observability] {scope: api.response_interceptor, type: auth, correlationId: 988c7037-c377-42b6-acc9-b0f184372868, status: 403, code: ERR_BAD_REQUEST}
- [observability] {scope: api.response_interceptor, type: auth, correlationId: de29a2cb-e8ae-4179-bb84-afe6e6391001, status: 403, code: ERR_BAD_REQUEST}

### API HTTP â‰¥400 samples (capped)
- 403 https://www.auraterminal.ai/api/community/update-presence
- 403 https://www.auraterminal.ai/api/community/users
- 403 https://www.auraterminal.ai/api/admin/journal-stats

## 12. Highest-priority remaining fixes

*(none flagged automatic â€” follow manual list)*

---

## Raw data

Machine-readable: `e2e/reports/final-full-site-scan-data.json`
