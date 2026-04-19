# Aura Terminal — Core workspaces reference (detailed)

**What this document is**  
A **single, exhaustive, product-focused** guide to seven areas of Aura Terminal: **Trader Desk**, **The Operator**, **Journal**, **Surveillance**, **Performance & DNA**, **Backtesting**, and **Aura Analysis**. It lists **every main tab, sub-tab, nested route, and major panel** the user can encounter, and explains **what it is for** and **how it helps**.

**What this document is not**  
It does not cover marketing pages, auth, community, Premium AI-only flows, or admin tools—only the workspaces listed above.

**Routes**  
Paths match the React app router (`src/App.js`). Nested paths use `…` where a parent URL is implied.

---

## Table of contents

1. [Trader Desk (`/trader-deck`)](#1-trader-desk-trader-deck)  
2. [The Operator (`/trader-deck/trade-validator/…`)](#2-the-operator-trader-decktrade-validator)  
3. [Journal (`/journal`)](#3-journal-journal)  
4. [Surveillance (`/surveillance`)](#4-surveillance-surveillance)  
5. [Performance & DNA](#5-performance--dna)  
6. [Backtesting (`/backtesting/…`)](#6-backtesting-backtesting)  
7. [Aura Analysis (`/aura-analysis/…`)](#7-aura-analysis-aura-analysis)

---

## 1. Trader Desk (`/trader-deck`)

**Overall purpose**  
One **pre-trade command center**: world time, session status, a **single selected calendar date**, and two major modes—**Market Outlook** vs **Market Intelligence**—so preparation is **date-aligned** (no mixing Monday bias with Friday events).

### 1.1 Global chrome (always on this page)

| Element | What it does | How it helps |
|--------|----------------|--------------|
| **World clocks rail** | Shows key market cities’ time. | Avoids timestamp confusion; anchors “now” for global markets. |
| **Session row (tiles)** | Major sessions with **OPEN / CLOSED** and countdown-style phrasing. | Tells you *when* the environment deserves full focus vs light attention. |
| **Calendar bar** | Selected date, prev/next (day or week), opens **full calendar overlay**. | Fast navigation across the exact day you are researching. |
| **Full calendar overlay** | Month grid to pick a date; close control. | Jump to a specific day without repeated clicking. |
| **Date bounds** | Picker limited to a sensible past/future window. | Prevents nonsense dates and keeps data requests meaningful. |

### 1.2 Top-level tabs (two modes)

#### **MARKET OUTLOOK**

**Period sub-tabs**

| Sub-tab | What it shows | How it helps |
|---------|----------------|--------------|
| **DAILY** | Outlook payload for the **selected day**. | Tactical posture for today’s session plan. |
| **WEEKLY** | Outlook payload for the **selected week framing**. | Slower themes for swing/context around intraday moves. |

**Extra control (Outlook only)**

| Control | What it does | How it helps |
|---------|--------------|--------------|
| **Economic calendar** (button → overlay) | **Forex Factory–style** event list for the **selected date** inside a modal overlay. | Scheduled volatility is visible next to narrative, not on another site. |

**Main content: Market Outlook panels** (all fed by desk intelligence for that date/period)

| Panel / concept | What it communicates | How it helps |
|-----------------|----------------------|--------------|
| **Market regime** | Broad environment label (trend/risk/compression as encoded). | Sets *default* aggression or patience. |
| **Market pulse** | Score + label + **recommended actions** list. | One-glance “thermometer” with posture hints. |
| **Key drivers** | Named forces with **direction** and **impact** weight. | Builds the **story** behind markets, not only levels. |
| **Cross-asset signals** | FX / risk / vol / commodities **coherence or tension**. | Spots when your pair thesis fights macro. |
| **Market changes today** | What moved vs prior narrative. | Fights **stale** trading theses. |
| **Trader focus** | Watchlist-style **focus items** (sometimes title + reason). | Turns narrative into **checkable** attention items. |
| **Risk radar** | Event / data risks (rich rows when calendar fields exist). | Landmines on the clock, not surprise spikes. |
| **Session context** | Asia / London / NY style framing. | Aligns tactics to **session phase**. |
| **AI session brief & trading priorities** | Short narrative + **priority list** when present. | Executive summary for traders who skip walls of text. |
| **Headline sample** | Curated headlines anchoring the story. | Links narrative to **actual news**. |

**Editorial / admin behavior (when enabled)**  
Saved desk content can merge **live** data with **manual overrides** so staff can correct or emphasize a shock without redeploying code.

**Right rail**  
In **Outlook** mode the **headlines rail is not shown** beside the main dashboard (layout focuses on the outlook stack).

---

#### **MARKET INTELLIGENCE**

Three synchronized controls across the bar:

1. **DAILY / WEEKLY** — same meaning as Outlook (tactical vs structural).  
2. **BRIEFS** — document-style intelligence.  
3. **MARKET DECODER** — per-symbol structured decode.

##### **BRIEFS** (sub-mode)

**Brief kinds (categories)**  
Content is organized so users can jump to the sleeve that matches their mandate:

- **Institutional Daily**  
- **Institutional Weekly**  
- **General**  
- **Stocks · Indices · Futures · Forex · Crypto · Commodities · Bonds · ETFs**

**What users do here**

- Open **in-app preview** of PDFs / Office files via embedded viewers where supported (no forced download workflow for normal reading).  
- Read **text/markdown** briefs with preview sanitization for fast executive reading.  
- Staff (when authorized) **upload**, replace, or **delete** briefs—including large files via chunked upload.

**Why it exists**  
Institutional-grade **read** experience: one place for flagship daily/weekly notes plus **asset-class** channels.

##### **MARKET DECODER** (sub-mode)

**Purpose**  
For a **chosen symbol**, produce a structured **bias / structure / risk / execution** read with caching and refresh, suitable for **importing** into Trader Lab / Validator via handoff keys.

**Symbol universe (representative)**  
FX majors & crosses, metals, energies, crypto, US indices & ETFs, VIX, DXY, etc.—the symbols discretionary traders argue about daily.

**User flow (four steps shown in the UI)**  
1. Read the brief (bias, conviction, posture).  
2. Inspect structure (levels, scenarios).  
3. Check risk context (calendar, headlines, positioning narrative).  
4. Decide execution (only if posture + trigger still align).

**Operational detail**  
- **Search / quick symbols** for fast instrument selection.  
- **Cache age / TTL** visibility so users know snapshot freshness.  
- **Silent refresh** vs explicit refresh during fast news.  
- **Fullscreen / preview** style reading for the generated brief.  
- **Voice / search** affordances as implemented in the Decoder header.

**Right rail**  
In **Market Intelligence** (non-Outlook), **News headlines** appear for the **selected date**, complementing Briefs/Decoder with breaking color.

---

### 1.3 Trader Desk — summary map (quick reference)

```
/trader-deck
├── World clocks + session tiles + calendar (always)
├── Tab: MARKET OUTLOOK
│   ├── Sub: DAILY | WEEKLY
│   ├── Button: Economic calendar (overlay)
│   └── Content: MarketOutlookView (regime, pulse, drivers, signals, changes, focus, risk, session, AI brief, headlines sample)
└── Tab: MARKET INTELLIGENCE
    ├── Sub: DAILY | WEEKLY
    ├── Mode: BRIEFS (institutional + general + 8 asset sleeves)
    └── Mode: MARKET DECODER (per-symbol brief +4-step discipline)
        └── Rail: NewsHeadlines (selected date)
```

---

## 2. The Operator (`/trader-deck/trade-validator`)

**Overall purpose**  
A **discipline terminal**: plan in **Trader Lab**, codify rules in **Trader Playbook**, then **checklist → size → log → analyze → present yourself → compare on leaderboard**.

### 2.1 Shell layout (how navigation works)

**Hero row (large links, not the small tab rail)**

| Link | Route | Role |
|------|--------|------|
| **Trader Lab** | `…/trader-lab` | Planning cockpit (chart + thesis + risk + handoffs). |
| **Trader Playbook** | `…/trader-playbook` | Rules, setups, executions, missed trades, playbook analytics, refine loop. |

**Main tab rail (The Operator)**

| # | Tab | Route | Role |
|---|-----|--------|------|
| 1 | **Overview** | `…/overview` | Compact orientation / summary into the stack. |
| 2 | **Checklist** | `…/checklist` | Scored execution checklists + **AI Chart Check**. |
| 3 | **Trade Calculator** | `…/calculator` | Risk, size, R:R before execution elsewhere. |
| 4 | **Trade Journal** | `…/journal` | Validator-scoped **trade log** (rows, export mindset). |
| 5 | **Analytics** | `…/analytics` | Validator / deck KPIs tied to process. |
| 6 | **Trader CV** | `…/trader-cv` | Narrative CV of the trader. |
| 7 | **Leaderboard** | `…/leaderboard` | Rankings in Validator context. |

**Special / redirect URLs**

| Path | Behavior |
|------|----------|
| `…/` (index) | Redirects to **Overview**. |
| `…/ai-chart-check` | Redirects to **Checklist** with `#ai-chart-check` anchor. |
| `…/trader-replay` | Redirects to **`/aura-analysis/dashboard/trader-replay`** (single canonical replay). |
| `…/missed-trade-review` | Redirects to **Playbook missed-review** canonical path. |

---

### 2.2 Checklist (`…/checklist`) — internal structure

**Entry**  
`OperatorEntry` may show a short **enter transition** when coming from certain gateways; then **`OperatorView`** loads.

**Main checklist styles (three top tabs inside the page)**

| Style | Title in UI | Intent |
|-------|-------------|--------|
| **Scalp** | SCALP EXECUTION CHECKLIST | Fast execution, precision entries, **session control**. |
| **Intra Day** | INTRA DAY EXECUTION CHECKLIST | Intraday bias, confirmations, **clean execution**. |
| **Swing** | SWING EXECUTION CHECKLIST | Higher timeframe structure, patience, **position quality**. |

**Scoring**  
Each style is designed for **100 points** total across weighted line items—discipline becomes **measurable**, not vague.

**Cards and example line items (what users actually check)**

**Scalp — three cards**

1. **Market Context** — e.g. session active, spread acceptable, no major news nearby, market moving cleanly, HTF bias clear.  
2. **Entry Quality** — e.g. key level marked, liquidity taken, structure shift, not mid-range, momentum confirms.  
3. **Risk & Execution** — e.g. logical stop, mapped target, minimum RR met, size matches plan, no emotional entry.

**Intra Day — three cards**

1. **Bias & Structure** — daily bias, HTF alignment, key zone, session direction, not choppy.  
2. **Confirmation** — level respected, liquidity taken, confirmation pattern, momentum, entry timing.  
3. **Risk & Management** — stop beyond invalidation, realistic target, RR, no conflicting correlation, fits the model.

**Swing — three cards**

1. **Higher Timeframe** — weekly/daily trend, major zone, structure, room to move.  
2. **Setup Quality** — value area entry, rejection confirmed, not late, clear invalidation, HTF-based targets.  
3. **Position Logic** — thesis survives noise, risk suits wider stop, news compatible, patience, rule-based.

**Customization**

- **Add your line** — custom checklist lines per section.  
- **Aura template** — pick template lines to bulk-add.  
- **Example images** on lines (thumbnail → larger preview) for teachable moments.  
- **Setup formation** extension area — sub-templates for **formation** detail (separate from the three execution styles).

**AI Chart Check**  
Dedicated **`AiChartCheckTab`** embedded in the checklist experience: upload / review charts under structured AI review. Deep-link **`#ai-chart-check`** jumps to this subsection.

**Confluence / gating concepts**  
UI enforces **minimum confluence** thinking (e.g. threshold percentages) so users cannot green-light trades with hollow scores.

---

### 2.3 Trader Lab (`…/trader-lab`)

**Purpose**  
**Planning before clicking buy/sell**: embedded **TradingView** chart, **multi-interval** analysis (e.g. 15m–1D), and a structured **thesis form**.

**Instrument picker**  
Broad list: FX, metals, energies, indices, US ETFs, crypto, **DXY**, **VIX**, etc., each mapped to a chart vendor symbol.

**Form themes (representative fields)**

- Session date, chart symbol, account size.  
- **Market bias** & **market state** (e.g. trending vs ranging labels).  
- **Aura confidence** numeric + **conviction** mapping.  
- **Today’s focus** (multi-line regional/geopolitical notes).  
- **Session goal**, **max trades allowed** (overtrading guard).  
- **Key drivers** & **fundamental backing** text blocks.  
- **Setup**: name, why valid, what confirms entry.  
- **Risk**: entry, stop, target, risk %, distances, emotions, during notes.  
- **Review**: outcome, R result, duration, followed rules, mistake tags, what to change.

**Persistence**  
**Local draft** storage so interrupted planning is recoverable.

**Handoffs**

- **`TRADER_LAB_HANDOFF_KEY`** → The Operator checklist context.  
- **`MARKET_DECODER_LAB_HANDOFF_KEY`** → brings Decoder context into Lab / forward.

---

### 2.4 Trader Playbook (`…/trader-playbook` + nested routes)

**Playbook index route**  
`…/trader-playbook` loads **`TraderPlaybook`** inside `PlaybookRouteOutlet`.

**Nested route**

| Route | Page | Purpose |
|-------|------|---------|
| `…/trader-playbook/missed-review` | **Missed Trade Review** | Formal review of **non-trades** (fear, hesitation, over-filtering). |

**Internal tabs inside Trader Playbook (`TraderPlaybook.js`)**

| Tab id | Label | What it is for |
|--------|--------|----------------|
| `overview` | **Overview** | Snapshot of the active setup / playbook state and navigation into deeper work. |
| `rules` | **Rules** | Entry, exit, risk buckets; wizard-driven **rule groups**; field-level editing aligned to `RULE_GROUPS` / `WIZARD_FLOW`. |
| `checklist` | **Checklist** | Playbook-specific checklist discipline tied to the defined setup (distinct from Validator execution checklist, same seriousness). |
| `trades` | **Executions** | Trade / execution log aligned to playbook analytics inputs. |
| `missed` | **Missed** | Missed-trade pattern summary and journaling aligned to playbook. |
| `analytics` | **Performance** | Playbook **performance** analytics (rule-based insights, execution breakdowns, summaries vs journal/validator trades). |
| `review` | **Refine** | **Refinement loop** after review—tighten rules from evidence. |

**Supporting concepts users feel**

- **Presets** (`PLAYBOOK_PRESETS`) to start from proven templates.  
- **Normalize setup** pipeline so saved JSON stays consistent.  
- **Replay handoff** query params (`TR_HANDOFF`, replay tool handoff) to connect replay → playbook prefill.  
- **Metric tooltips** (`METRIC_LABEL`, `MetricLabel`) so analytics aren’t mystery numbers.

---

### 2.5 Other Validator tabs (short but complete)

| Tab | Purpose |
|-----|---------|
| **Overview** | Fast health check of Validator usage and entry points. |
| **Trade Calculator** | Position size, risk amount, R-multiple math from explicit inputs. |
| **Trade Journal (Validator)** | Row-oriented trade log; export mindset; pairs with Playbook + Analytics. |
| **Analytics** | Validator KPIs: checklist scores, habit signals—**process** analytics. |
| **Trader CV** | Narrative resume of trader identity for mentors or peers. |
| **Leaderboard** | Competitive lens among users running the same discipline stack. |

---

### 2.6 The Operator — full route map

```
/trader-deck/trade-validator
├── (index → overview)
├── /overview
├── /checklist                    (+ #ai-chart-check)
├── /calculator
├── /journal
├── /analytics
├── /trader-cv
├── /leaderboard
├── /trader-lab
├── /trader-playbook
│   ├── (index → TraderPlaybook: tabs Overview, Rules, Checklist, Executions, Missed, Performance, Refine)
│   └── /missed-review            → MissedTradeReview
├── redirects: /ai-chart-check, /trader-replay, /missed-trade-review
```

---

## 3. Journal (`/journal`)

**Overall purpose**  
The **daily discipline OS**: tasks, mood, reflection, proof photos, reminders, and **date-based history**—not a single text box.

### 3.1 Top-level UI concepts

| Concept | What it does |
|---------|--------------|
| **Selected date** | Any day in your journal history (not only “today”). |
| **Calendar month** | Month navigation tied to selected date. |
| **Replay handoff** | Arriving from Trader Replay can **pre-select the replay date** and offer a **return link**. |
| **Search params** | Supports structured handoff from other tools (`useSearchParams`). |

### 3.2 The three journal tabs (primary navigation)

| Tab | Id | What it holds | How it helps |
|-----|-----|----------------|--------------|
| **Mandatory** | `mandatory` | Tasks expected on **trading days**; badge shows **count**. | Non-negotiable discipline; impossible to hide behind prose. |
| **Personal** | `personal` | Your own tasks outside mandatory lane. | Flexibility without breaking minimum standards. |
| **Reflection** | `reflection` | Longer diary + **daily mood** + note list + day images. | Emotional processing + coachable narrative. |

**Saturday rule**  
**Saturday (UTC)** can be treated as a **rest day** for mandatory tasks—copy explains using Personal / Reflection instead. This prevents burnout-driven abandonment.

### 3.3 Tasks (Mandatory & Personal)

- **Add / edit / complete / delete** tasks.  
- **Mandatory vs personal** classification drives which tab shows the task.  
- **Photo proof** per task (multi-image, capped) with **lightbox** viewer (arrows, thumbs, Esc to close).  
- **Reminders** per task: relative labels (“in ~30 min”), browser notification permission prompts, sync via shared reminder events.  
- **Month task list** loads for overview patterns.

### 3.4 Reflection panel

- **Daily mood** picker (emoji + discrete states: great → rough).  
- **Daily notes** with **autosave**, **debounced** server sync, **saved / saving / error** status for trust.  
- **Multiple notes per day** (list): add, edit, delete individual note entries for pre-market / mid / post-close without overwriting.  
- **Day images**: attach **screenshots** of charts or platform for a **visual timeline** (separate from per-task proof).

### 3.5 Journal — why it matters elsewhere

- Feeds **monthly AI report eligibility** together with trades and AI chart checks.  
- **Admin** may have extended behaviors for support or demos.  
- **Completion banners** and **streak psychology** nudge continued use.

---

## 4. Surveillance (`/surveillance`)

**Overall purpose**  
**Global situational awareness**: macro, geopolitics, conflict, transport (aviation/maritime), energy, commodities, sanctions, central banks, **high impact**—not “price only.”

### 4.1 First load (bootstrap)

On entry, the app loads a **bootstrap** package typically including:

- **Events** tape  
- **Aggregates**  
- **Sources** list  
- Whether to show **intro overlay**  
- **Briefing**  
- **Intel digest**  
- **Market watch narrative**  
- **System health**  

So the first paint is a **complete picture**, not an empty shell.

### 4.2 Topic tabs (tape filters)

| Tab id | User-facing label |
|--------|-------------------|
| `all` | All |
| `macro` | Macro |
| `geopolitics` | Geopolitics |
| `conflict` | Conflict |
| `aviation` | Aviation |
| `maritime` | Maritime |
| `energy` | Energy |
| `commodities` | Commodities |
| `sanctions` | Sanctions |
| `central_banks` | Central banks |
| `high_impact` | High impact |

**Additional filters**

- **Severity minimum** — raise the floor when noise explodes.  
- **Source filter** — focus on trusted nodes.

### 4.3 Live updates

- **Server-Sent Events** stream when available (`tick` → refresh feed).  
- **Polling fallback** on interval if stream unhealthy.  
- **Tape refresh glow** when top stories change—subtle “new info” cue without clownish popups.

### 4.4 Visual / narrative panels

| Panel | Function |
|-------|----------|
| **Globe / grid** | Spatial intuition for where risk is heating up. |
| **Region focus** | Click heat → **focusRegion**; digest + tape **filter** to that geography. |
| **Situation headline** | Lead developing story or quantified digest summary. |
| **Intel digest** | Narrative synthesis of multi-source stories. |
| **Market watch narrative** | Market-relevant “what to watch” copy. |
| **Side panels** | Intel / metrics / health as implemented (`IntelSidePanel`, etc.). |

### 4.5 Event drawer

Selecting an event opens a **drawer** that loads:

- **Full event detail**  
- **Related events**  
- **Story threads** where applicable  

Headline → context → implications, in one motion.

### 4.6 Intro overlay

First-time (or staged) **intro** can be dismissed; **intro-seen** can be posted so power users aren’t nagged.

### 4.7 Access

Surveillance is **entitlement-gated** (Elite / admin-class access in product positioning). Unauthorized users see access messaging rather than a broken page.

---

## 5. Performance & DNA

This section covers **(A)** the **Performance** analytics tab inside Aura Analysis, **(B)** the **Trader DNA** product surface, and **(C)** how **Performance** links from the **Live analytics hub** for navigation.

### 5.1 Performance — Aura Analysis tab (`/aura-analysis/dashboard/performance`)

**Shared context**  
Uses the **same trade filter set** as all Aura dashboard tabs (date range, symbol, session, direction, active linked account, presets).

**Major sections / visuals (as implemented)**

| Block | What the user learns |
|-------|----------------------|
| **Equity area chart** | Account path stress—drawdowns and recoveries visually. |
| **Hour-of-day strip** | When P/L clusters in UTC—session honesty. |
| **P/L histogram** | Distribution shape—fat tails vs tight core. |
| **Rolling expectancy** | Whether edge is **stable** or **decaying**. |
| **R-multiple histogram** | Quality of asymmetry vs noise. |
| **Scatter: P vs R** | Trade-level P/L vs R—spots weird leverage or tagging. |
| **P/L density line** | Smoothed distribution view. |
| **Instrument breakdown table** | Per symbol: trades, win%, expectancy, avg P/L, profit factor, net. |
| **Session analysis** | Which session buckets pay or tax you. |
| **Direction breakdown** | Long vs short behavioral split. |
| **Weekday performance** | Monday vs Friday mythology vs reality. |
| **Intraday footprint (UTC)** | Fine-grained time-of-day footprint. |
| **Monthly P/L** | Month bars with win rate meta—narrative of career arcs. |
| **Realized P/L quantiles** | Tail language—how extreme your good/bad days really are. |

**Outcome**  
Users stop asking “Am I profitable?” and start asking **“Am I profitable for repeatable reasons?”**

---

### 5.2 Trader DNA (`/reports/dna`)

**Purpose**  
A **long-horizon identity synthesis** of the trader—style, tendencies, strengths, failure archetypes—distinct from **monthly** “what happened lately.”

**Experience flow**

1. **Load DNA** from server (`getTraderDna`).  
2. **Elite / tier gate** may apply (`ELITE_REQUIRED` style messaging for Premium users—clear expectations).  
3. **Intro sequence** (`TraderDnaIntroSequence`) sets stakes before sealing a cycle.  
4. **Generate** (`generateTraderDna`) when eligible—may hit `CYCLE_ACTIVE` etc.  
5. **Report render** (`TraderDnaReport`) when data is present; **not-ready** state otherwise.

**Outcome**  
Better **self-selection** of markets, time horizons, mentors, and risk architecture—**who you are** with data, not ego.

---

### 5.3 Live analytics hub — Performance wayfinding (`/reports/live`)

Not a second Performance engine: a **curated index** (“report library”) with deep links, including:

- `/aura-analysis/dashboard/performance` tagged as **P/L · R · scatter**  
- Other dashboard tabs for adjacent context  

**Outcome**  
Users who “lost the bookmark” still find **Performance** and siblings quickly.

---

## 6. Backtesting (`/backtesting`)

**Purpose**  
**Deliberate practice** on historical data: replay, log trades, notebook, reports—**measure edge before live capital**.

### 6.1 Top navigation (layout tabs)

| Route | Label | Function |
|-------|--------|----------|
| `/backtesting` | **Hub** | Summary, resume session, recent list, playbook snapshot. |
| `/backtesting/sessions` | **Sessions** | Library of sessions. |
| `/backtesting/trades` | **Trades** | All trades across sessions. |
| `/backtesting/reports` | **Reports** | Global session reports archive. |
| `/backtesting/new` | **New session** | Creation wizard / form. |

### 6.2 Hub highlights

- **Summary metrics** (totals, win rate, profit factor—conceptually).  
- **Recent sessions** list.  
- **Resume** active/paused session shortcut.  
- **Playbook snapshot**: aggregate **net, trades, wins, win rate** by playbook name/id—surfaces **which playbooks** sim well.

### 6.3 Session workspace (`/backtesting/session/:sessionId/…`)

**Header / controls (conceptual)**  
Replay transport: play/pause, step, speed, jump, instrument selector, **running metrics** card, end-session flows, add-trade drawer trigger.

**Nested routes inside the session**

| Sub-route | Panel | Function |
|-----------|--------|----------|
| `(index)` | **Main stage** | Chart replay + **running metrics** + **notebook glance** rail. |
| `notebook` | **Notebook** | Full session notes fields (see below). |
| `trades` | **Trades** | Session trade table + filters + actions as allowed. |
| `reports` | **Reports** | Session-scoped reporting. |

**Notebook fields (`defaultNotebook` concept)**  
`sessionNotes`, `observations`, `worked`, `failed`, `improvements`, `lessons`, `nextRefinement`—structured debrief, not one blob.

**Running metrics (computed)**  
Includes **win rate**, **profit factor**, **avg R**, **net**, **best setup**, **best instrument**, **worst habit grade**, **average checklist score**, **equity path** from initial balance—updated as trades append.

**Trade drawer**  
Add/edit trades in overlay while chart stays visible.

**Session states**  
**Paused** vs **completed** may lock editing so completed drills stay **honest records**.

---

## 7. Aura Analysis (`/aura-analysis`)

Two major regions: **Connection Hub** and **Dashboard terminal**.

### 7.1 Connection Hub (`/aura-analysis/ai`)

**Purpose**  
Connect **MetaTrader 4/5** with **read-only / investor-password** style access so analytics ingest **real fills** without trade permission.

**User promises**  
Clear messaging: credentials are for **analytics**, not remote execution; multi-account selection later in dashboard filters.

---

### 7.2 Dashboard shell (`/aura-analysis/dashboard`)

**Entry guards**  
Dashboard may require **eligible connection** before rendering analytics.

**Filter bar (applies to every tab)**

| Control | Function |
|---------|----------|
| **Active platform** | Pick **mt4 / mt5 / other** linked account when multiple exist. |
| **Date presets** | 1D, 1W, 1M, 3M, 6M, 1Y, ALL (conceptually). |
| **Custom date range** | From/to calendar. |
| **Symbol filter** | Restrict analytics to instruments subset. |
| **Session filter** | Asia / London / NY / … buckets. |
| **Direction filter** | Long vs short vs all. |
| **Filter presets** | Save / apply / delete named filter sets. |
| **Refresh** | Pull fresh history; show last updated. |

**Tab rail (exact order)**

| # | Path | Title |
|---|------|--------|
| 1 | `…/overview` | Overview |
| 2 | `…/performance` | Performance |
| 3 | `…/risk-lab` | Risk Lab |
| 4 | `…/edge-analyzer` | Edge Analyzer |
| 5 | `…/execution-lab` | Execution Lab |
| 6 | `…/calendar` | Calendar |
| 7 | `…/psychology` | Psychology |
| 8 | `…/habits` | Habits |
| 9 | `…/growth` | Growth |
| 10 | `…/trader-replay` | Trader Replay |

---

### 7.3 Tab-by-tab: major blocks

#### **Overview** (`…/overview`)

| Block | Intent |
|-------|--------|
| KPI tiles / score rings | Fast health + discipline scores. |
| **Equity / drawdown charts** | Path truth. |
| **When you trade (UTC)** | Clock honesty. |
| **Realized P/L distribution** | Shape of outcomes. |
| **Rolling expectancy** | Edge stability. |
| **Risk snapshot** | Drawdown / tail language. |
| **Institutional signature** | Compact “style” summary card. |
| **Session performance** | Where time pays. |
| **Direction breakdown** | Long/short equity. |
| **Top instruments** | Concentration risk. |
| **Performance by day** | Week rhythm. |
| **Trading suite links** | Journal · replay · research entry points. |
| **Aura DNA overview card** | Bridge to identity layer. |

#### **Performance** (`…/performance`)  
(See §5.1 — instrument table, sessions, weekdays, monthly, quantiles, scatter, histograms, footprint.)

#### **Risk Lab** (`…/risk-lab`)

| Block | Intent |
|-------|--------|
| **Prop-style risk lens** | Challenge-style survival view. |
| **Drawdown metrics** | Depth, length, recovery. |
| **Streak & consistency** | Loss/win clustering. |
| **Execution risk** | Implementation-driven risk signals. |
| **P/L tail risk** | Worst-day / tail awareness. |
| **Simulated max DD % (MC)** | Monte Carlo style stress intuition. |

#### **Edge Analyzer** (`…/edge-analyzer`)

| Block | Intent |
|-------|--------|
| **Edge vs time (UTC)** | When edge exists. |
| **Weekday P/L heatmap** | Day-of-week structure. |
| **Session performance grid** | Session × outcome patterns. |
| **Long vs short edge** | Directional honesty. |

#### **Execution Lab** (`…/execution-lab`)

| Block | Intent |
|-------|--------|
| **Emotional timing (UTC)** | Impulse clusters. |
| **Outcome distribution** | Quality of exits/entries in aggregate. |
| **Risk management** | Stop/size adherence story. |
| **Holding time distribution** | Scalp vs swing truth. |
| **Discipline signals** | Rule-break detectors. |
| **Execution by symbol (path)** | Per-instrument path quality. |
| **Execution by session (path)** | Session path quality. |

#### **Calendar** (`…/calendar`)

| Block | Intent |
|-------|--------|
| **When you bank P/L (UTC)** | Profit-taking timing. |
| **Weekday × hour (UTC)** | 2-D habit structure. |
| **All months** | Seasonality & month clustering. |
| **Weekly P/L history** | Week-to-week rhythm. |

#### **Psychology** (`…/psychology`)

| Block | Intent |
|-------|--------|
| **Impulse timing (UTC)** | When emotions move clicks. |
| **Emotional outcome spread** | Win/loss emotional mix. |
| Narrative sections | Human-readable discipline story. |

#### **Habits** (`…/habits`)

| Block | Intent |
|-------|--------|
| **Top strengths** | What you reliably do well. |
| **Watch list (weaknesses / habits)** | Named recurring leaks. |
| **Habit flags** | Binary discipline markers. |
| **Expectancy by setup / tag** | Which habits pay. |
| **Trade metadata (rating · setup · note)** | Ground truth table for coaching. |

#### **Growth** (`…/growth`)

| Block | Intent |
|-------|--------|
| **Monthly progression** | Month-over-month trajectory. |
| **Compound projection** | Forward scenarios from discipline + edge. |

#### **Trader Replay** (`…/trader-replay`)

**Function**  
Session / trade **replay** study—canonical place linked from The Operator’s replay redirect.

**How it helps**  
Reconstruct **what was knowable when**—anti-hindsight training.

---

### 7.4 Aura Analysis — route map

```
/aura-analysis
├── (index → /aura-analysis/ai)
├── /ai Connection Hub
└── /dashboard
    ├── (index → overview)
    ├── /overview
    ├── /performance
    ├── /risk-lab
    ├── /edge-analyzer
    ├── /execution-lab
    ├── /calendar
    ├── /psychology
    ├── /habits
    ├── /growth
    └── /trader-replay
```

---

## Document maintenance

When new tabs or routes ship, update:

- `src/App.js` (routes)  
- The implementing page(s) under `src/pages/`  

Then extend this file so stakeholder descriptions stay **complete**.

---

*Last expanded: core workspaces only — Trader Desk, The Operator, Journal, Surveillance, Performance & DNA, Backtesting, Aura Analysis.*
