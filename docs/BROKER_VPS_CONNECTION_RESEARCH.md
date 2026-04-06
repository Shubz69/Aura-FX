# Broker Connectivity Through VPS (Research Notes)

## Goal

Create a practical shortlist of brokers and connectivity paths that can run reliably through a VPS for 24/7 execution.

## Important Clarification

There is no single global "all brokers" list for VPS connectivity. In practice, you connect through one of these routes:

1. Broker-provided terminal support (MT4/MT5/cTrader/NinjaTrader) running on Windows VPS.
2. Broker API (REST/WebSocket/FIX/TWS/Gateway) running as a service on VPS.
3. Platform-mediated broker connection (for example, TradingView integrated brokers).

## Official Sources (Start Here)

- MetaTrader 5 official broker finder: <https://www.metatrader5.com/en/find-broker>
- Spotware cTrader broker program page: <https://www.spotware.com/ctrader/brokers/>
- NinjaTrader brokerage/connectivity options: <https://ninjatrader.com/trading-platform/customize/market-data-brokerage-options/>
- TradingView broker directory: <https://www.tradingview.com/brokers/>
- Interactive Brokers TWS requirements: <https://www.interactivebrokers.com/en/trading/tws-requirements.php>

## VPS-Compatible Broker Paths

### 1) MT4/MT5 Route (Most Common for FX/CFD)

Works when broker supports MetaTrader terminal login and allows EAs.

Commonly used broker examples:
- IC Markets
- Pepperstone
- FP Markets
- FOREX.com
- IG
- XM

Notes:
- Many brokers offer "sponsored/free VPS" only above volume/balance thresholds.
- Latency is best when VPS region is close to broker trade servers (London/NY typically).
- Use MT5 for newer features; keep MT4 where legacy EAs are required.

### 2) cTrader Route

Works when broker issues cTrader accounts and permits cBots/API workflows.

Examples (check current availability by region/account type):
- IC Markets (cTrader offering)
- Pepperstone (cTrader offering)
- FP Markets (cTrader offering)

Notes:
- cTrader broker coverage changes frequently; validate directly in broker onboarding.
- cTrader + VPS is typically stable for algo execution when resources are sized correctly.

### 3) NinjaTrader Route (Futures/Some FX Integration)

Works through NinjaTrader-supported brokerage/connectivity providers.

Examples from official NinjaTrader connectivity ecosystem:
- NinjaTrader Brokerage
- Interactive Brokers
- FOREX.com / City Index
- FXCM

Notes:
- Third-party support can depend on license model and current integration policy.
- Validate supported instruments per broker (futures vs FX vs CFDs).

### 4) TradingView-Integrated Route

Works by connecting users to brokers listed in TradingView broker directory.

Examples in TradingView ecosystem:
- OANDA
- FOREX.com
- Interactive Brokers
- TradeStation
- AMP Futures
- Tradovate
- Alpaca

Notes:
- "Integrated in TradingView" is not the same as "full API for custom automation."
- Confirm order types/session behavior before production rollout.

### 5) Direct API Route (Best for Product-Controlled Execution)

Works with brokers offering stable APIs suitable for server-side automation on VPS.

Examples:
- Interactive Brokers (TWS/IB Gateway API)
- Alpaca (REST/WebSocket)
- OANDA (REST API)

Notes:
- This route gives the most control for auditability/retries/risk rules.
- Requires stronger engineering around reconnects, rate limits, idempotency, and kill-switches.

## Minimum VPS Baseline

For a first production-ready setup:
- OS: Windows Server (for MT4/MT5/cTrader/NinjaTrader terminals)
- CPU: 2-4 vCPU
- RAM: 4-8 GB
- Disk: 80+ GB SSD
- Network: low-latency location near broker server
- Ops: automatic restart scripts, monitoring, and daily backup snapshots

## Broker Onboarding Checklist (Per Broker)

1. Confirm platform support (MT5/cTrader/API) for your exact account type.
2. Confirm regional/legal availability for your user base.
3. Confirm VPS policy (allowed, free/sponsored criteria, limits).
4. Confirm algo permissions (EAs/cBots/API order automation).
5. Run paper/sandbox if available.
6. Run live micro-account test for:
   - Login stability for 72h
   - Reconnect behavior
   - Order placement latency
   - Partial fills/slippage handling
   - Stop/TP behavior across volatility

## Recommended Next Step for Aura

Start with a phased broker stack instead of trying to support everything at once:

1. **Tier 1 (Launch):** MT5 brokers + one API broker
   - MT5: IC Markets, Pepperstone, or FP Markets (choose by your user region)
   - API: Interactive Brokers or Alpaca (depending on asset coverage needed)
2. **Tier 2:** Add cTrader brokers
3. **Tier 3:** Add TradingView-linked broker flow for discretionary users

This keeps support manageable while still covering most user demand.

## Last Updated

2026-04-06
