# Trader CV – Data Mapping & Implementation

This document explains how the new **Trader CV** tab (inside Trade Validator) connects to existing platform data, what is real vs placeholder, and what is needed for full live scoring and future PDF export.

---

## 1. Where Trader CV Lives

- **Location:** Trade Validator → tab **"Trader CV"** (between Analytics and Leaderboard).
- **Route:** `/trader-deck/trade-validator/trader-cv`.
- **Shell:** Same as other Trade Validator tabs (`TradeValidatorShell`); no existing tabs or routes were removed or broken.

---

## 2. Two Separate Score Systems

| System | Purpose | Where used |
|--------|--------|------------|
| **Platform Discipline Score** | Journal completion, tasks, routine, streaks, activity (existing) | Journal, XP, existing discipline logic |
| **Aurax Trading Behaviour Score** | Risk, rules, consistency, emotional control from **trading behaviour** | Trader CV only |

Trader CV uses **only** the Aurax Trading Behaviour Score. Platform Discipline (e.g. journal task completion, login streak for journal) is left intact and can still be used elsewhere; we only **read** `user.login_streak` and trade data for Trader CV.

---

## 3. Existing Fields Usable for Each Category

### Risk Discipline (30%)

- **From `aura_analysis_trades`:**
  - `risk_percent`, `risk_amount`, `stop_loss`, `position_size`, `entry_price`
- **Logic today:** Penalise oversized risk (>1.5× target), no stop loss, no risk amount. Score 0–100.
- **Extension:** When MT5/API exists, add: max risk rule breaches, daily risk breaches, overleveraging, trades without defined risk.

### Rule Adherence (30%)

- **From `aura_analysis_trades`:**
  - `checklist_score`, `checklist_total`, `checklist_percent` (saved when user submits from Trade Validator with checklist).
- **Logic today:** Average of checklist completion % across trades; message when some trades below 70%.
- **Extension:** Confluence confirmation, setup validity, session validity, required fields – can all be added as columns or JSON and fed into the same calculator.

### Consistency (25%)

- **From trades:** `created_at` (to count distinct trading days).
- **From user:** `login_streak` (journal streak) – optional.
- **Logic today:** Mix of trading days count, streak, and optional routine completion rate (currently 0 if not provided).
- **Extension:** Journal task completion rate, session discipline, review completion – pass into `computeConsistency` options.

### Emotional Control (15%)

- **From platform today:** No emotional fields in `aura_analysis_trades`.
- **Optional:** Journal daily notes / mood (e.g. `journal_daily.mood`, notes text) can be passed as `moodAfter` / `reflectionNotes` into `computeEmotionalControl`.
- **Logic today:** Fallback score 50 with “More journal reflections needed”; if notes contain negative keywords (revenge, frustration, etc.) score is reduced. Confidence marked as `low` when data is scarce.
- **Extension:** Add per-trade or per-session fields: confidence before/after, emotion during/after, rushed entry, revenge trading. Feed into same function.

---

## 4. New Fields to Add (If Not Present)

- **Emotional / reflection (optional):**
  - In journal: already have `journal_daily.notes`, `journal_daily.mood` – can be used for emotional control without schema change.
  - For per-trade emotion: could add `aura_analysis_trades.emotion_before`, `emotion_after`, `rushed_entry` (or a JSON `meta` column) later.
- **Routine completion:** If you have a “routine completion” metric (e.g. from journal tasks), pass it as `routineCompletionRate` into `computeConsistency`; no DB change required in Trader CV code.
- **Monthly PDF:** No new fields strictly required; the same Aurax breakdown, trade quality, conditions, and review summary can be rendered to PDF when you add an export endpoint.

---

## 5. Calculations: Real vs Placeholder

| Item | Status | Notes |
|------|--------|--------|
| Aurax Score formula | **Real** | (Risk×0.30 + Rule×0.30 + Consistency×0.25 + Emotional×0.15), clamped 0–100. |
| Risk Discipline | **Real** | Based on `risk_percent`, `stop_loss`, `risk_amount` from trades. |
| Rule Adherence | **Real** | Based on `checklist_score` / `checklist_total` or `checklist_percent` from trades. |
| Consistency | **Real** | Trading days + optional `login_streak`; routine rate is an optional input (0 if not provided). |
| Emotional Control | **Partial** | Structure is real; scoring uses notes/mood if provided, else fallback 50 and “need more data”. |
| Trade Quality Score | **Real** | Per-trade score from checklist %, risk, session, RR; average and trend from last 30 trades. |
| Best Conditions | **Real** | From trade `session`, `pair`, `created_at` (day of week), `pnl`. |
| Streaks | **Real** | Journal streak from `user.login_streak`; rule adherence streak and disciplined days from trades. |
| Review summary | **Real** | Strengths/weaknesses/actions derived from breakdown + best conditions. |

---

## 6. How Aurax Score Should Update

- **Per trade:** Recompute when new trade is saved (client can refetch trades and recompute; no backend cron required for display).
- **Daily / weekly / monthly:** Same: recalc on demand from current trades (and optional journal data). For “monthly snapshot” you can store a cached Aurax Score in DB or in a monthly report table when you add PDF – not required for current UI.

---

## 7. How Trade Quality Score Is Stored and Recalculated

- **Storage:** Trade Quality is **not** stored in DB. It is computed from existing trade fields: `checklist_percent` (or score/total), `risk_percent`, `stop_loss`, `session`, `rr`.
- **Recalculation:** Whenever Trader CV loads (or trades list updates), `getAverageTradeQuality(trades)` and per-trade `getTradeQualityScore(trade)` are run. No backend job needed. If you later want to store “trade_quality” on each trade for reporting, you can add a column and backfill from this formula.

---

## 8. How Streaks Are Tracked (Without Breaking Platform Discipline)

- **Journal streak:** Read-only use of `user.login_streak` (existing). We do not change how that streak is computed (that stays in Platform Discipline / journal logic).
- **Rule adherence streak:** Computed in Trader CV from **trades**: count consecutive trades (by date) with checklist ≥70%. No new table.
- **Disciplined days streak:** Consecutive calendar days with at least one trade. No new table.
- So: Trader CV only **consumes** existing user + trade data; it does not overwrite or replace Platform Discipline scoring.

---

## 9. Database / Schema Changes Required

- **None** for the current Trader CV implementation. It uses:
  - `aura_analysis_trades` (existing)
  - `users` (e.g. `login_streak`, name/username) (existing)
- **Optional later:**
  - `trader_cv_snapshots` (e.g. monthly) for PDF/history: `user_id`, `period`, `aurax_score`, `breakdown` JSON, `created_at`.
  - Per-trade emotional fields or `meta` JSON on `aura_analysis_trades` for richer emotional control scoring.

---

## 10. Backend / Frontend Services, Hooks, Utilities

- **Frontend:**
  - **Page:** `src/pages/aura-analysis/TraderCVTab.js` – fetches trades, runs all engines, renders sections.
  - **Utilities (all under `src/lib/aura-analysis/trader-cv/`):**
    - `auraxScoreCalculator.js` – Aurax Score from 4 components, rank title.
    - `behaviourAnalytics.js` – Risk, Rule, Consistency, Emotional scores and messages.
    - `tradeQualityCalculator.js` – Per-trade quality, average, trend, badges.
    - `streakEngine.js` – Journal, rule adherence, disciplined-day streaks; rank title.
    - `traderInsightsEngine.js` – Best conditions, review summary, monthly stats.
  - **API:** Uses existing `Api.getAuraAnalysisTrades({})` (and optionally journal APIs if you pass mood/notes into behaviour analytics).
- **Backend:** No new endpoints required. Optional future: endpoint that returns precomputed Aurax + breakdown + monthly stats for PDF or caching (e.g. `GET /api/aura-analysis/trader-cv`).

---

## 11. Monthly PDF Trader Statement (Future)

- **Data:** All data needed is already available: Aurax Score, breakdown, trade quality, best conditions, streaks, review summary, monthly stats. Structure the payload so a future endpoint can return the same object.
- **Suggested shape:** One “trader CV summary” object: `{ auraxScore, breakdown, quality, conditions, streaks, review, monthlyStats, period }`. Frontend or backend can then render to PDF when you add the export feature.
- **Schema:** Optional `trader_cv_snapshots` table for historical monthly snapshots; not required for first version of PDF (can generate on demand from trades).

---

## 12. Files Created

- `src/lib/aura-analysis/trader-cv/auraxScoreCalculator.js`
- `src/lib/aura-analysis/trader-cv/behaviourAnalytics.js`
- `src/lib/aura-analysis/trader-cv/tradeQualityCalculator.js`
- `src/lib/aura-analysis/trader-cv/streakEngine.js`
- `src/lib/aura-analysis/trader-cv/traderInsightsEngine.js`
- `src/pages/aura-analysis/TraderCVTab.js`
- `src/styles/aura-analysis/TraderCV.css`
- `TRADER_CV_DATA_AND_IMPLEMENTATION.md` (this file)

## 13. Files Modified

- `src/components/trader-deck/TradeValidatorShell.js` – Added “Trader CV” tab to `TABS`.
- `src/App.js` – Lazy import for `TraderCVTab`, route `trader-cv` under Trade Validator.

---

## 14. Assumptions and Placeholders

- **Emotional control:** If no journal notes/mood are passed, score defaults to 50 and message asks for more reflections; confidence is “low”. No UI break.
- **Routine completion rate:** Not read from anywhere yet; passed as 0. When you have a metric (e.g. from journal tasks), pass it into `computeConsistency` in `TraderCVTab`.
- **Best conditions:** Needs at least 5 trades; otherwise shows “More trade data is needed”.
- **Trade Quality:** Uses only existing trade fields; “Excellent” / “Good” / “Needs Work” / “Poor” from same formula (checklist, risk, session, RR).
- **Rank titles:** Rookie &lt; 45, Structured 45+, Disciplined 60+, Elite 75+, Precision 90+.

---

## 15. Connecting Journal Data for Emotional Control (Optional)

To improve emotional control scoring:

1. In `TraderCVTab`, call `Api.getJournalDaily(date)` for recent dates (e.g. last 7–30 days) or use an existing “recent notes” endpoint.
2. Collect `notes` and `mood` into arrays.
3. Pass to `computeBehaviourBreakdown` as `options.reflectionNotes` and `options.moodAfter`.
4. `computeEmotionalControl` will then use them and set confidence to “medium” when there are enough entries.

No schema change required if `journal_daily` already has `notes` and `mood`.
