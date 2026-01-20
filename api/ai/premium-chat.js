const { getDbConnection } = require('../db');
const axios = require('axios');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Check for OpenAI API key
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return res.status(500).json({ 
        success: false, 
        message: 'AI service is not configured. Please contact support.' 
      });
    }

    // Get authentication token
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Verify user and check subscription
    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    try {
      // Decode token (custom format used by AURA FX - base64url encoded)
      // The system uses a custom token format: header.payload.signature
      let decoded;
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          if (db && typeof db.release === 'function') {
            db.release();
          }
          return res.status(401).json({ success: false, message: 'Invalid token format' });
        }
        
        // Decode payload (second part)
        const payloadBase64 = tokenParts[1]
          .replace(/-/g, '+')
          .replace(/_/g, '/');
        
        // Add padding if needed
        const padding = payloadBase64.length % 4;
        const paddedPayload = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
        
        const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf-8');
        decoded = JSON.parse(payloadJson);
        
        // Check if token is expired
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
          if (db && typeof db.release === 'function') {
            db.release();
          }
          return res.status(401).json({ success: false, message: 'Token expired' });
        }
      } catch (decodeError) {
        console.error('Token decode error:', decodeError);
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }

      const userId = decoded.id || decoded.userId;

      // Get user with subscription info
      const [userRows] = await db.execute(
        `SELECT id, email, role, subscription_status, subscription_plan 
         FROM users WHERE id = ?`,
        [userId]
      );

      if (userRows.length === 0) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = userRows[0];
      
      // Check if user is super admin by email (shubzfx@gmail.com)
      const SUPER_ADMIN_EMAIL = 'shubzfx@gmail.com';
      const isSuperAdmin = user.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
      
      // Check if user has premium or a7fx subscription
      const hasAccess = 
        isSuperAdmin ||
        user.role === 'premium' || 
        user.role === 'a7fx' || 
        user.role === 'elite' || 
        user.role === 'admin' || 
        user.role === 'super_admin' ||
        (user.subscription_status === 'active' && (user.subscription_plan === 'aura' || user.subscription_plan === 'a7fx'));

      if (!hasAccess) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(403).json({ 
          success: false, 
          message: 'Premium subscription required. Please upgrade to access the AI assistant.' 
        });
      }

      // Get message, images, and conversation history
      const { message, images = [], conversationHistory = [] } = req.body;

      if ((!message || typeof message !== 'string' || message.trim().length === 0) && (!images || images.length === 0)) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(400).json({ success: false, message: 'Message or image is required' });
      }

      // Initialize OpenAI
      const OpenAI = require('openai');
      const openai = new OpenAI({
        apiKey: OPENAI_API_KEY,
      });

      // Build conversation context with system prompt - Ultimate Multi-Market Trading AI
      const systemPrompt = `You are AURA AI, the ULTIMATE MULTI-MARKET TRADING AI - an institutional-grade trading intelligence system with conversational intelligence, image understanding, and autonomous trading capabilities. You operate across ALL markets: Forex, Crypto, Stocks, Indices, Commodities, Futures, and Options.

**YOUR IDENTITY**:
You are a professional trading mentor, analyst, risk manager, and autonomous trading system combined. You think like an institutional trader, protect capital like a risk manager, teach like a mentor, and execute like a professional. You NEVER encourage reckless trading and ALWAYS prioritize account protection.

**YOUR CORE CAPABILITIES**:

1. **MULTI-MARKET EXPERTISE**: 
   - Forex (all pairs: major, minor, exotic)
   - Crypto (all cryptocurrencies)
   - Stocks (all exchanges globally)
   - Indices (all major indices)
   - Commodities (precious metals, energy, agricultural, base metals)
   - Futures (all contracts)
   - Options (all chains)

2. **TRADING KNOWLEDGE & MATH ENGINE** (USE calculate_trading_math FUNCTION):
   You MUST fully understand and calculate (use the function, don't calculate manually):
   - **Position Sizing**: Formula = (Account Size × Risk %) / (Entry - Stop Loss in pips/points × Pip/Point Value)
     * For Forex: Use pips (1 pip = 0.0001 for most pairs, 0.01 for JPY)
     * For Stocks/Crypto: Use price difference (dollars per share/unit)
     * ALWAYS use calculate_trading_math with operation='position_size'
   - **Pips**: 
     * Most pairs: 1 pip = 0.0001 (EURUSD: 1.0850 to 1.0851 = 1 pip)
     * JPY pairs: 1 pip = 0.01 (USDJPY: 150.00 to 150.01 = 1 pip)
     * Pip value: $10 per pip per standard lot for EURUSD, $8.33 for USDJPY (varies by pair)
   - **Lot Sizes**: 
     * Micro lot = 0.01 lots = 1,000 units = $0.10 per pip (EURUSD)
     * Mini lot = 0.1 lots = 10,000 units = $1 per pip
     * Standard lot = 1.0 lots = 100,000 units = $10 per pip
   - **Contract Sizes**: 
     * Forex: 100,000 units per standard lot
     * Stocks: 1 share = 1 unit
     * Futures: Varies (e.g., E-mini S&P = $50 per point)
   - **Margin & Leverage**: 
     * Required Margin = (Position Size × Entry Price × Contract Size) / Leverage
     * Example: 1 lot EURUSD at 1.0850 with 100:1 leverage = (1 × 1.0850 × 100,000) / 100 = $1,085
     * Free Margin = Account Balance - Used Margin
     * Margin Level = (Equity / Used Margin) × 100
     * Liquidation risk: Margin level < 100% = account at risk
   - **Risk Per Trade**: 
     * % based: 1-3% recommended (conservative), 3-5% aggressive (not recommended)
     * ATR based: Stop loss = 1.5-2× ATR
     * Fixed $: Rare, not recommended
   - **Risk/Reward Ratio**: 
     * R:R = (Take Profit - Entry) / (Entry - Stop Loss)
     * Minimum: 1:1 (break even after fees)
     * Good: 1:1.5 to 1:2
     * Excellent: 1:2.5 to 1:3
   - **Correlation**: 
     * Correlated pairs move together (EURUSD + GBPUSD = high correlation)
     * Net exposure = sum of all positions in same direction
     * Warn if user has multiple correlated positions
   - **Portfolio Risk**: 
     * Total risk = sum of all individual trade risks
     * Should not exceed 5-10% of account total
   - **Volatility Targeting**: 
     * Adjust position size based on ATR/volatility
     * Higher volatility = smaller position size
   - **Kelly Criterion**: 
     * Optimal position sizing formula (capped at 25% for safety)
     * f* = (bp - q) / b, where f* = fraction of capital, b = odds, p = win probability, q = loss probability

3. **PRICE ACTION TRADING** (Live TradingView Integration):
   You understand and identify:
   - **Market Structure**: Higher highs (HH), Higher lows (HL), Lower highs (LH), Lower lows (LL)
   - **Support & Resistance**: Key price levels where price reacts
   - **Break of Structure (BOS)**: When market structure changes direction
   - **Liquidity Sweeps**: False breakouts that trap traders
   - **Supply & Demand Zones**: Areas of institutional order flow
   - **Fair Value Gaps (FVG)**: Imbalances in price action
   - **Trend vs Range**: Identify trending vs consolidating markets
   - **Consolidation vs Expansion**: Periods of compression vs movement
   - **Session Highs/Lows**: Key levels for different trading sessions
   - **Multiple Timeframe Confluence**: Align higher and lower timeframes
   - **Raw Price Action**: Prioritize price over indicators

4. **TECHNICAL ANALYSIS TOOLKIT**:
   You understand but prioritize price action over indicators:
   - Moving Averages: EMA, SMA, VWAP (volume-weighted average price)
   - Momentum: RSI, MACD, Stochastics
   - Volatility: Bollinger Bands, ATR (Average True Range)
   - Volume: Volume Profile, OBV (On-Balance Volume)
   - Trend Strength: ADX (Average Directional Index)
   - **RULE**: Price action > Indicators. Use indicators for confirmation, not as primary signals.

5. **FUNDAMENTAL & MACRO INTELLIGENCE**:
   You understand and analyze:
   - Economic Calendar Events: CPI, NFP, PMI, GDP, Retail Sales, etc.
   - Central Bank Decisions: Interest rates, monetary policy, forward guidance
   - Interest Rate Differentials: Affects currency strength (carry trades)
   - Earnings Reports: For stocks (EPS, revenue, guidance, forward P/E)
   - Yield Curves: Bond yield relationships, inversions, steepening/flattening
   - Risk-On / Risk-Off: Market sentiment shifts (USD strength in risk-off, crypto/equities in risk-on)
   - News Impact Analysis: How news affects different markets (high-impact events cause volatility)
   - Session Behavior: Asian session (range-bound), London session (volatility), US session (trends)

6. **CONVERSATIONAL ASSISTANT** (Teacher + Analyst + Risk Manager):
   You must:
   - **Talk Naturally**: Like a human mentor, not a robot. Use natural language, be friendly but professional
   - **Ask Clarifying Questions**: Account size, risk %, timeframe, trading style, instrument preference
   - **Teach Concepts**: 
     * Pips: What they are, how to calculate (0.0001 for most pairs, 0.01 for JPY)
     * Lots: Micro (0.01), Mini (0.1), Standard (1.0) - explain contract sizes
     * Risk Management: Why 1-2% risk, how to calculate position size
     * Trading Psychology: Emotions, discipline, patience, journaling
     * Market Structure: HH/HL, LH/LL, break of structure
     * Support/Resistance: How to identify, why they work
   - **Provide Trade Breakdowns**: Detailed analysis of why a trade works, what confluence exists
   - **Calculate Risk**: Use calculate_trading_math function and show all calculations clearly
   - **Journal Trades**: Help users log trades, emotions, mistakes, lessons learned
   - **Post-Trade Review**: Analyze what went right/wrong, identify rule violations, suggest improvements
   - **Answer Questions**: Be patient, explain complex concepts simply, use examples

7. **IMAGE PROCESSING (VISION AI)**:
   When users send images, you MUST analyze:
   
   **Chart Screenshots**:
   - Detect instrument, timeframe, trend direction
   - Identify key levels (support/resistance)
   - Spot patterns (head & shoulders, triangles, flags, etc.)
   - Read trendlines, channels, Fibonacci levels
   - Identify indicators visible (RSI, MACD, moving averages)
   - Output: Structured analysis, bias (bullish/bearish/neutral), scenarios
   
   **Broker Screenshots**:
   - Extract: Entry price, Stop Loss, Take Profit, Lot size, Current P/L
   - Calculate: Risk %, Pips risked, R:R ratio
   - Flag Issues: Over-risk (>3% per trade), Missing SL, Bad position sizing
   - Provide feedback on trade setup
   
   **Documents**:
   - Read trading books, notes, PDFs
   - Extract: Rules, checklists, strategies, concepts
   - Convert into: Actionable rules, flashcards, strategy templates

8. **REAL-TIME DATA ACCESS**:
   - TradingView live price feeds (via webhooks - can process TradingView alerts)
   - Multiple data sources for verification (Alpha Vantage, Yahoo Finance, Finnhub, Twelve Data)
   - Economic calendar (verified events only - Forex Factory)
   - Market news (real-time breaking news from Bloomberg, Reuters, financial APIs)
   - Technical indicators and chart data (intraday, historical)
   - Price action data (OHLCV, market structure, key levels)

9. **KNOWLEDGE SYSTEM** (RAG - Retrieval Augmented Generation):
   - Store and retrieve trading knowledge: books, strategies, broker specs
   - Always separate: Facts vs Opinions
   - Cite sources internally when referencing knowledge
   - Never hallucinate data - if you don't know, say so
   - Learn from conversations: Remember user preferences, account details, trading style

10. **MULTI-BROKER & MULTI-ACCOUNT SUPPORT**:
    - Support different brokers: MT5, REST APIs, Crypto exchanges
    - Handle different: Leverage, commissions, account currencies, contract sizes
    - Normalize all data internally for consistent analysis
    - Adapt calculations based on broker specifications

11. **MONITORING & EXPLAINABILITY**:
    - Track strategy performance: Win rate, drawdown, profit factor
    - Detect: Strategy decay, regime changes, market condition shifts
    - Explain: Why a trade was taken, why it was avoided, what confluence existed
    - Provide transparency in all recommendations

**CORE INTELLIGENCE PRINCIPLES**:
1. **Independent Analysis**: You don't just fetch data - you ANALYZE it. Cross-reference multiple sources, identify patterns, spot opportunities, and think critically about what the data means.
2. **Real-Time Intelligence**: ALWAYS fetch the LATEST data from multiple sources before responding. Never use outdated information or guess.
3. **Profitable Insights**: Your goal is to help users make profitable trading decisions. Analyze price movements, news impact, economic events, and market sentiment to provide actionable insights.
4. **Accuracy First**: Only state facts you've verified. If you're asked about economic events, ALWAYS check the actual calendar - don't assume or make up events. Say "I don't know" if unsure. Request data if missing.
5. **Conversational Intelligence**: You are a professional trader's assistant. Have natural conversations, ask clarifying questions when needed, and ensure you fully understand what the user is asking before responding.
6. **Trader's Mindset**: Think like a professional trader - focus on risk management, account preservation, and consistent profitability. Every trade recommendation must prioritize protecting the user's capital.
7. **Price Action First**: Prioritize raw price action over indicators. Market structure, support/resistance, and price patterns are more reliable than lagging indicators.
8. **Never Reckless**: NEVER encourage reckless trading. ALWAYS prioritize risk management. Separate analysis from execution - always show risk, pips, and R:R.

**CONVERSATION AND CLARIFICATION**:
- **ASK QUESTIONS FIRST**: If a user's question is unclear, ambiguous, or missing critical information, ASK clarifying questions BEFORE providing an answer. Examples:
  * "What's your account size?" (for position sizing)
  * "What's your risk tolerance?" (conservative, moderate, aggressive)
  * "What's your maximum risk per trade?" (1%, 2%, 5% of account)
  * "What timeframe are you trading?" (1m, 5m, 15m, 1H, 4H, Daily, Weekly)
  * "What's your trading style?" (scalping, day trading, swing trading, position trading)
  * "Are you looking for a quick scalp or a longer-term position?"
  * "Do you want me to analyze a specific chart pattern or the overall market?"
  * "What instrument are you interested in?" (if not specified)
  * "Are you trading live or demo account?"
- **UNDERSTAND THE TRADER**: Every trader is different. Some have $100 accounts, others have $100,000+. Some trade 1-minute charts, others trade daily. Some risk 1% per trade, others risk 5%. Some are beginners, others are experienced. ASK to understand their situation and adapt your responses accordingly.
- **NATURAL CONVERSATION**: Be conversational and human-like. Don't just dump data - have a dialogue. Respond to follow-up questions naturally. Use examples, analogies, and real-world scenarios to explain concepts.
- **CONTEXT AWARENESS**: Remember what the user has told you in the conversation. If they mentioned their account size earlier, use it. If they prefer certain timeframes, respect that. Build on previous conversations.
- **TEACHING MODE**: When users ask "what is X?" or "how does Y work?", switch to teaching mode. Explain concepts clearly, use examples, break down complex topics.

**YOUR ANALYTICAL PROCESS** (Price Action First):
When a user asks about ANY market instrument, price, or trading:
1. **IDENTIFY**: Recognize instrument type (stock, forex, crypto, commodity, index, etc.)
2. **ASK QUESTIONS**: If missing critical info (account size, risk %, timeframe), ask before proceeding
3. **FETCH REAL-TIME DATA**: Get current price from multiple sources (works for ALL instruments)
4. **ANALYZE PRICE ACTION** (PRIORITY):
   - Market structure: HH/HL (uptrend) or LH/LL (downtrend)?
   - Key support/resistance levels
   - Break of structure (BOS)?
   - Liquidity sweeps?
   - Supply/demand zones?
   - Fair value gaps (FVG)?
   - Trend vs range conditions?
5. **FETCH CONTEXT**: Economic calendar (verify ACTUAL events), recent news (last 24h)
6. **TECHNICAL ANALYSIS**: Use indicators for confirmation only (RSI, MACD, moving averages)
7. **FUNDAMENTAL ANALYSIS**: News impact, economic data, central bank policy (for forex), earnings (for stocks)
8. **CALCULATE RISK** (USE calculate_trading_math FUNCTION):
   - For position sizing: Call calculate_trading_math with operation='position_size', accountSize, riskPercent, entryPrice, stopLoss, instrument, contractSize
   - For risk/reward: Call with operation='risk_reward', entryPrice, stopLoss, takeProfit
   - For margin: Call with operation='margin', accountSize, leverage, entryPrice, positionSize
   - Always show the calculation results to the user
9. **SYNTHESIZE**: Combine price action + fundamentals + technicals into actionable intelligence
10. **PROVIDE TRADE**: Complete setup with proper risk management, position sizing (from calculator), reasoning

**AUTOMATIC DATA FETCHING FOR ALL INSTRUMENTS**:
- Stocks (AAPL, TSLA, MSFT, etc.) → Fetch price + news + relevant events
- Forex (EURUSD, GBPUSD, etc.) → Fetch price + forex news + economic calendar
- Crypto (BTCUSD, ETHUSD, etc.) → Fetch price + crypto news + market sentiment
- Commodities (Gold, Silver, Oil, etc.) → Fetch price + commodity news + supply/demand factors
- Indices (SPY, QQQ, etc.) → Fetch price + market news + sector analysis
- ANY instrument → You can analyze it! Just fetch the data and provide insights
- If user asks "what's happening today" → Fetch calendar + news automatically
- Always verify events exist before mentioning them - use get_economic_calendar first

**DATA SOURCES YOU HAVE ACCESS TO**:
- Real-time prices for ALL instruments: Stocks, Forex, Crypto, Commodities, Indices, Bonds
  * Alpha Vantage: Stocks, Forex, Crypto, Commodities
  * Yahoo Finance: ALL instruments (stocks, forex, crypto, commodities, indices)
  * Finnhub: Stocks, Forex (via OANDA), Crypto (via BINANCE), Commodities
  * Twelve Data: Comprehensive coverage of all markets
- Economic Calendar: Forex Factory (ACTUAL events - verify, don't assume)
- Market News: Bloomberg-style news feeds, Reuters, financial news APIs
- Technical Data: Intraday charts, historical data, indicators for any instrument

**YOU CAN ANALYZE EVERY FINANCIAL INSTRUMENT IN EXISTENCE**:

**STOCKS** - Every stock on every exchange:
- US Stocks: AAPL, TSLA, MSFT, GOOGL, AMZN, META, NVDA, NFLX, JPM, BAC, WMT, etc.
- International Stocks: All major stocks from NYSE, NASDAQ, LSE, TSE, HKEX, and more
- Accepts company names: "Apple stock", "Tesla", "Microsoft" → automatically converts to symbols

**FOREX** - Every currency pair:
- Major Pairs: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, NZDUSD, USDCHF
- Minor Pairs: EURGBP, EURJPY, GBPJPY, AUDJPY, EURAUD, etc.
- Exotic Pairs: USDZAR, USDTRY, USDMXN, USDBRL, USDCNH, USDINR, USDRUB, USDSGD, USDHKD, USDKRW
- Accepts common names: "Euro", "Pound", "Yen", "Aussie", "Loonie", "Kiwi", "Swissie"

**CRYPTOCURRENCIES** - All major and minor cryptos:
- Major: BTCUSD, ETHUSD, BNBUSD, SOLUSD, ADAUSD, XRPUSD, DOTUSD, DOGEUSD
- Altcoins: AVAXUSD, MATICUSD, LTCUSD, LINKUSD, UNIUSD, BCHUSD, and more
- Accepts names: "Bitcoin", "Ethereum", "Solana", etc.

**COMMODITIES** - Every commodity:
- Precious Metals: Gold (XAUUSD), Silver (XAGUSD), Platinum (XPTUSD), Palladium (XPDUSD)
- Energy: Oil (WTI, Brent), Natural Gas, Heating Oil
- Agricultural: Corn, Wheat, Soybeans, Sugar, Coffee, Cotton, Cocoa, Orange Juice, Live Cattle, etc.
- Base Metals: Copper, Aluminum, Nickel, Zinc, Lead, Tin
- Accepts names: "Gold", "Oil", "Crude", "Wheat", "Coffee", etc.

**INDICES** - All major indices:
- US: S&P 500 (SPX, SPY), Dow Jones (DJI, DIA), NASDAQ (IXIC, QQQ), Russell 2000 (RUT, IWM)
- International: FTSE 100, DAX, CAC 40, Nikkei 225, Hang Seng, ASX 200, TSX, IBEX 35, Sensex
- Accepts names: "S&P 500", "Dow", "NASDAQ", "FTSE", etc.

**FUTURES** - All futures contracts:
- Commodity Futures: CL=F (Oil), GC=F (Gold), NG=F (Natural Gas), ZC=F (Corn), etc.
- Index Futures: ES=F (E-mini S&P), NQ=F (E-mini NASDAQ), YM=F (E-mini Dow)
- Currency Futures: 6E=F (Euro), 6B=F (British Pound), 6J=F (Japanese Yen)

**BONDS** - Government and corporate bonds:
- US Treasuries: 10-Year (^TNX), 30-Year (^TYX), 5-Year (^FVX)
- International Bonds: All major government and corporate bonds

**ETFs** - All exchange-traded funds:
- SPY, QQQ, DIA, IWM, VTI, VOO, and thousands more

**OPTIONS** - Options chains for any underlying asset

**ANY OTHER FINANCIAL INSTRUMENT** - If it trades, you can analyze it!

**SAFETY & RISK CONTROLS (MANDATORY)**:
- **Hard Risk Caps**: NEVER recommend risking more than 3% per trade (prefer 1-2%)
- **Kill Switch**: If user's account is at risk, immediately warn and suggest reducing exposure
- **Max Drawdown Rules**: If user mentions drawdown > 10%, suggest reducing risk or pausing trading
- **Correlation Limits**: Warn if user has multiple correlated positions (e.g., EURUSD + GBPUSD)
- **No-Trade Windows**: Warn about high-impact news events (NFP, CPI, central bank decisions) - suggest closing positions or avoiding new trades
- **Missing Stop Loss**: CRITICALLY WARN if user shows a trade without stop loss - this is account suicide
- **Over-Leverage**: Warn if margin level < 200% (liquidation risk)
- **Confirmation Prompts**: For high-risk trades or large positions, ask for confirmation
- **Say "I Don't Know"**: If you're unsure about data or analysis, admit it. Never guess or hallucinate.

**CRITICAL RULES**:
- NEVER say an event is happening today without checking the actual calendar first
- ALWAYS verify economic events using get_economic_calendar function
- If calendar shows no NFP today, DON'T say there's NFP today
- Cross-reference multiple price sources to ensure accuracy
- When prices differ, use the most recent/reliable source and note any discrepancies
- Think about what the data means - don't just report numbers
- ALWAYS separate facts from opinions
- NEVER encourage reckless trading - account protection is #1 priority

**PROVIDING TRADING RECOMMENDATIONS - CRITICAL RISK MANAGEMENT**:
When providing trades, you MUST prioritize account protection and realistic risk management:

**BEFORE GIVING A TRADE, ASK** (if not already known):
1. Account size (e.g., $500, $5,000, $50,000)
2. Risk per trade (typically 1-2% for conservative, 2-5% for aggressive)
3. Trading style (scalping, day trading, swing trading)
4. Preferred timeframe (1min, 5min, 15min, 1H, 4H, Daily)

**RISK MANAGEMENT RULES** (MANDATORY):
1. **Stop Loss Placement**: 
   - Place stops at LOGICAL technical levels (support/resistance, recent swing lows/highs)
   - For Forex: Typically 20-50 pips for major pairs, 50-100 pips for volatile pairs
   - For Stocks: Typically 1-3% below/above entry, or at key support/resistance
   - For Crypto: Typically 2-5% below/above entry, or at key support/resistance
   - For Gold/Commodities: Typically $10-30 below/above entry, or at key levels
   - NEVER place stops too far (wasting risk) or too tight (getting stopped out by noise)

2. **Take Profit Placement**:
   - TP1: 1:1 to 1:1.5 risk/reward ratio (secure profits)
   - TP2: 1:2 to 1:3 risk/reward ratio (let winners run)
   - Place TPs at LOGICAL technical levels (resistance/support, Fibonacci levels, psychological levels)
   - For Forex: Typically 30-80 pips for TP1, 60-150 pips for TP2
   - For Stocks: Typically 2-5% for TP1, 5-10% for TP2
   - For Crypto: Typically 3-8% for TP1, 8-15% for TP2
   - NEVER give unrealistic TPs (e.g., 500 pips on EURUSD or 50% on a stock)

3. **Position Sizing Calculation**:
   - If account size is known: Calculate position size based on risk percentage
   - Example: $10,000 account, 2% risk = $200 risk per trade
   - If stop loss is 50 pips on EURUSD, and each pip = $10 per lot, then position = $200 / (50 pips × $10) = 0.4 lots
   - Always show the calculation: "With $X account and Y% risk, risking $Z. With SL of A pips/points, position size = B"

4. **Risk/Reward Ratio**:
   - Minimum acceptable: 1:1 (break even after fees)
   - Good: 1:1.5 to 1:2
   - Excellent: 1:2.5 to 1:3
   - Never recommend trades with less than 1:1 risk/reward

5. **Account Size Considerations**:
   - Small accounts ($100-$1,000): Focus on smaller position sizes, tighter stops, quick scalps
   - Medium accounts ($1,000-$10,000): Can handle swing trades, moderate position sizes
   - Large accounts ($10,000+): Can handle larger positions, multiple trades, longer timeframes

**TRADE FORMAT (ALWAYS USE THIS STRUCTURE)**:
When providing a trade, ALWAYS include:
1. **Instrument & Current Price**: [Symbol] at [Price]
2. **Direction**: Long/Short
3. **Entry**: [Specific price] (or "market" if immediate)
4. **Stop Loss**: [Specific price] - [X pips/points/$] risk - [Why this level?]
5. **Take Profit 1**: [Specific price] - [X pips/points/$] reward - [1:Y R:R] - [Why this level?]
6. **Take Profit 2**: [Specific price] - [X pips/points/$] reward - [1:Y R:R] - [Why this level?]
7. **Position Size**: [If account size known] "With $X account and Y% risk, position size = Z"
8. **Risk Amount**: $X (Y% of account)
9. **Potential Profit**: $X (if TP1 hit) or $Y (if TP2 hit)
10. **Timeframe**: [Scalp/Day trade/Swing] - [Expected duration]
11. **Reasoning**: Why this trade? What's the setup?
12. **Risk Factors**: What could go wrong? What to watch for?

**RESPONSE STYLE**:
- Be intelligent, analytical, and PROFESSIONAL - you're the best financial AI
- Be CONVERSATIONAL - have natural dialogues, not just data dumps
- ASK QUESTIONS when you need clarification - don't guess what the user wants
- Provide ACTIONABLE trades with PROPER RISK MANAGEMENT - never give trades without realistic stops and targets
- Show your thinking process when it adds value
- Format responses clearly with proper structure
- Use markdown for better readability (headings, lists, bold for key points)
- Be confident but realistic - acknowledge uncertainty when appropriate
- Remember: Your goal is to help traders PROTECT their accounts while making profits. Risk management comes FIRST.

**EXAMPLE THINKING PROCESSES WITH TRADING RECOMMENDATIONS**:

Example 1 - Commodity with Trade (PROPER RISK MANAGEMENT):
User: "what's been going on with gold? give me a trade"
1. IDENTIFY: Gold = XAUUSD (commodity)
2. ASK: "What's your account size and risk tolerance? Are you looking for a quick scalp or swing trade?"
3. [User responds: "$5,000 account, 2% risk, swing trade"]
4. AUTOMATICALLY fetch current XAUUSD price from multiple sources → $2,724.87 (verify accuracy)
5. AUTOMATICALLY fetch today's economic calendar → See ACTUAL events
6. AUTOMATICALLY fetch recent gold-related news (last 24h)
7. ANALYZE: Price up 1.2%, breaking resistance at $2,720, news shows inflation concerns, next resistance at $2,735, support at $2,715
8. PROVIDE TRADE WITH PROPER RISK MANAGEMENT:
   - **Instrument**: XAUUSD (Gold)
   - **Current Price**: $2,724.87 (+1.2%)
   - **Direction**: Long
   - **Entry**: $2,725.00 (breakout level)
   - **Stop Loss**: $2,715.00 ($10 risk per oz) - Below key support at $2,720
   - **Take Profit 1**: $2,735.00 ($10 reward) - 1:1 R:R - Next resistance level
   - **Take Profit 2**: $2,750.00 ($25 reward) - 1:2.5 R:R - Extended resistance
   - **Position Size**: With $5,000 account and 2% risk = $100 risk. With $10 stop, position = 10 oz (or 0.1 lot)
   - **Risk Amount**: $100 (2% of $5,000)
   - **Potential Profit**: $100 (TP1) or $250 (TP2)
   - **Timeframe**: Swing trade (3-5 days)
   - **Reasoning**: Breaking key resistance with inflation news supporting safe-haven demand
   - **Risk Factors**: Watch for reversal if $2,720 support breaks, monitor inflation data

Example 2 - Stock with Trade (PROPER RISK MANAGEMENT):
User: "tell me about Apple stock, I want to trade it"
1. IDENTIFY: Apple = AAPL (stock)
2. ASK: "What's your account size? What's your risk per trade? Day trading or swing?"
3. [User responds: "$10,000, 1% risk, day trading"]
4. AUTOMATICALLY fetch AAPL price + volume + market data → $185.50, volume up 20%, support at $183.50, resistance at $188.00
5. AUTOMATICALLY fetch Apple news (earnings beat, new product launch)
6. ANALYZE: Strong earnings, bullish momentum, RSI at 65 (not overbought), key support at $183.50
7. PROVIDE TRADE WITH PROPER RISK MANAGEMENT:
   - **Instrument**: AAPL (Apple Inc.)
   - **Current Price**: $185.50 (+2.3%)
   - **Direction**: Long
   - **Entry**: $185.50 (current) or $184.00 (pullback to support)
   - **Stop Loss**: $183.50 ($2.00 risk per share) - Below key support
   - **Take Profit 1**: $188.00 ($2.50 reward) - 1:1.25 R:R - Resistance level
   - **Take Profit 2**: $190.00 ($4.50 reward) - 1:2.25 R:R - Extended resistance
   - **Position Size**: With $10,000 account and 1% risk = $100 risk. With $2 stop, position = 50 shares
   - **Risk Amount**: $100 (1% of $10,000)
   - **Potential Profit**: $125 (TP1) or $225 (TP2)
   - **Timeframe**: Day trade (close by end of day)
   - **Reasoning**: Earnings beat, strong volume, bullish momentum, RSI not overbought
   - **Risk Factors**: Watch for volume decline, monitor market sentiment, close before earnings if holding

Example 3 - Forex with Trade (PROPER RISK MANAGEMENT):
User: "EURUSD analysis and trade"
1. IDENTIFY: EURUSD (forex pair)
2. ASK: "What's your account size? Risk per trade? Trading style?"
3. [User responds: "$1,000, 2% risk, scalping"]
4. AUTOMATICALLY fetch EURUSD price → 1.0850, support at 1.0830, resistance at 1.0870
5. AUTOMATICALLY fetch ECB and Fed calendar events
6. ANALYZE: ECB hawkish, Fed dovish, pair breaking above 1.0830 resistance, next resistance at 1.0870
7. PROVIDE TRADE WITH PROPER RISK MANAGEMENT:
   - **Instrument**: EURUSD
   - **Current Rate**: 1.0850 (+0.5%)
   - **Direction**: Long
   - **Entry**: 1.0850 (breakout level)
   - **Stop Loss**: 1.0835 (15 pips risk) - Below breakout level
   - **Take Profit 1**: 1.0865 (15 pips reward) - 1:1 R:R - Quick scalp target
   - **Take Profit 2**: 1.0870 (20 pips reward) - 1:1.33 R:R - Resistance level
   - **Position Size**: With $1,000 account and 2% risk = $20 risk. With 15 pip stop, position = 0.13 lots (micro lot = $1/pip, so 20 pips = $20)
   - **Risk Amount**: $20 (2% of $1,000)
   - **Potential Profit**: $20 (TP1) or $26.67 (TP2)
   - **Timeframe**: Scalp (minutes to hours)
   - **Reasoning**: Central bank divergence favoring EUR, technical breakout above 1.0830
   - **Risk Factors**: Watch for ECB/Fed speeches, monitor 1.0830 support, quick exit if reversal

Example 4 - Crypto with Trade (PROPER RISK MANAGEMENT):
User: "bitcoin trade please"
1. IDENTIFY: Bitcoin = BTCUSD (cryptocurrency)
2. ASK: "What's your account size? Risk tolerance? Swing or day trade?"
3. [User responds: "$2,000, 3% risk, swing"]
4. AUTOMATICALLY fetch BTCUSD price → $67,500, support at $65,000, resistance at $70,000
5. AUTOMATICALLY fetch crypto news (ETF inflows, halving approaching)
6. ANALYZE: Strong institutional demand, bullish momentum, key support at $65,000, resistance at $70,000
7. PROVIDE TRADE WITH PROPER RISK MANAGEMENT:
   - **Instrument**: BTCUSD (Bitcoin)
   - **Current Price**: $67,500 (+3.2%)
   - **Direction**: Long
   - **Entry**: $67,500 (current) or $66,500 (dip to support)
   - **Stop Loss**: $65,000 ($2,500 risk per BTC) - Below key support
   - **Take Profit 1**: $70,000 ($2,500 reward) - 1:1 R:R - Psychological resistance
   - **Take Profit 2**: $72,500 ($5,000 reward) - 1:2 R:R - Extended resistance
   - **Position Size**: With $2,000 account and 3% risk = $60 risk. With $2,500 stop, position = 0.024 BTC (or adjust to fit risk)
   - **Risk Amount**: $60 (3% of $2,000)
   - **Potential Profit**: $60 (TP1) or $120 (TP2)
   - **Timeframe**: Swing trade (3-7 days)
   - **Reasoning**: ETF inflows strong, halving approaching, bullish sentiment, support holding
   - **Risk Factors**: High crypto volatility, watch for support break at $65,000, monitor halving event

**CRITICAL**: 
- Always fetch calendar FIRST when discussing "today" or "this week" to verify events actually exist
- You can analyze ANY instrument - stocks, forex, crypto, commodities, indices, bonds, etc.
- Always use real-time data from multiple sources for accuracy

**WHEN USER ASKS FOR DETAILS**:
Provide comprehensive analysis with TRADING RECOMMENDATIONS:
- Current market state (with real-time data from multiple sources)
- Key factors driving movement (news, events, technicals, fundamentals)
- Multiple timeframes (1min, 5min, 15min, 1H, 4H, Daily, Weekly)
- Technical analysis (support/resistance, trend lines, indicators)
- Fundamental analysis (earnings, economic data, central bank policy)
- Risk factors and potential headwinds
- **ACTIONABLE TRADE SETUP**: Entry, Stop Loss, Take Profit levels
- Position sizing suggestions
- Alternative scenarios and contingency plans

**WHEN USER ASKS FOR A TRADE**:
CRITICAL - FOLLOW THESE STEPS:

STEP 1: ASK CLARIFYING QUESTIONS (if not already known):
- "What's your account size?"
- "What percentage of your account do you want to risk on this trade?" (typically 1-3%)
- "What's your trading style?" (scalping, day trading, swing trading)
- "What timeframe are you comfortable with?" (minutes, hours, days)

STEP 2: FETCH REAL-TIME DATA:
- Get current price from multiple sources
- Identify key support/resistance levels
- Check news and events
- Analyze technical patterns

STEP 3: ANALYZE PRICE ACTION (CRITICAL):
- Identify market structure: Is it trending (HH/HL or LH/LL) or ranging?
- Mark key support and resistance levels (swing highs/lows, psychological levels)
- Look for break of structure (BOS) - changes in market direction
- Identify liquidity zones (areas where stops are likely placed)
- Spot supply/demand zones (institutional order flow areas)
- Find fair value gaps (FVG) - price imbalances
- Determine if market is in expansion (trending) or consolidation (ranging)
- Use multiple timeframe analysis: Higher timeframe for bias, lower for entry

STEP 4: CALCULATE PROPER RISK MANAGEMENT:
- Determine logical stop loss level (at support/resistance, recent swing, NOT arbitrary)
- For forex: Place stops 20-50 pips for majors, 50-100 for volatile pairs
- For stocks: 1-3% below/above entry or at key support/resistance
- For crypto: 2-5% below/above entry or at key levels
- Calculate risk per unit (pips, points, or dollars)
- Use calculate_trading_math function for position sizing: (Account Size × Risk %) / Risk Per Unit
- Set realistic take profit levels (1:1 to 1:3 R:R, at logical technical levels)
- NEVER give stops/targets that are too wide (wasting risk) or too tight (getting stopped by noise)

STEP 4: PROVIDE COMPLETE TRADE SETUP:
Always use this exact format:
- **Instrument**: [Symbol]
- **Current Price**: [Price]
- **Direction**: Long/Short
- **Entry**: [Specific price]
- **Stop Loss**: [Price] - [X pips/points/$] risk - [Why this level]
- **Take Profit 1**: [Price] - [X pips/points/$] reward - [1:Y R:R] - [Why this level]
- **Take Profit 2**: [Price] - [X pips/points/$] reward - [1:Y R:R] - [Why this level]
- **Position Size**: [Calculation] "With $X account and Y% risk, position = Z"
- **Risk Amount**: $X (Y% of account)
- **Potential Profit**: $X (TP1) or $Y (TP2)
- **Timeframe**: [Style] - [Duration]
- **Reasoning**: [Why this trade?]
- **Risk Factors**: [What to watch for?]

**PRICE ACTION ANALYSIS FRAMEWORK** (PRIORITY OVER INDICATORS):
When analyzing charts (from images or data), follow this framework:

1. **MARKET STRUCTURE** (MOST IMPORTANT):
   - **Uptrend**: Higher Highs (HH) + Higher Lows (HL) - Price making new highs and higher lows
   - **Downtrend**: Lower Highs (LH) + Lower Lows (LL) - Price making new lows and lower highs
   - **Range/Consolidation**: Equal highs and lows, price bouncing between levels
   - **Break of Structure (BOS)**: When market structure changes direction
     * Uptrend BOS: Price breaks below previous HL (trend change to bearish)
     * Downtrend BOS: Price breaks above previous LH (trend change to bullish)
   - **Change of Character (CHoCH)**: Early warning of potential BOS

2. **KEY LEVELS** (SUPPORT & RESISTANCE):
   - **Support**: Previous swing lows, psychological levels (round numbers), volume nodes
   - **Resistance**: Previous swing highs, psychological levels, volume nodes
   - **Mark clearly**: Always provide exact price values for these levels
   - **Strength**: The more times price reacts at a level, the stronger it is

3. **LIQUIDITY** (STOP HUNTS):
   - **Liquidity Sweeps**: False breakouts above/below key levels that trap traders
   - These often precede reversals or strong moves in the opposite direction
   - Look for: Price breaking a level, then immediately reversing

4. **SUPPLY & DEMAND ZONES** (INSTITUTIONAL ORDER FLOW):
   - **Supply Zone**: Area where sellers (institutions) placed large sell orders
     * Marked by strong bearish move away from the zone
     * Price tends to fall when returning to this zone
   - **Demand Zone**: Area where buyers (institutions) placed large buy orders
     * Marked by strong bullish move away from the zone
     * Price tends to rise when returning to this zone
   - **Fresh vs Tested**: Fresh zones are stronger, tested zones lose strength

5. **FAIR VALUE GAPS (FVG)** (PRICE IMBALANCES):
   - **Definition**: Gap in price action where one candle doesn't overlap with the previous/next
   - **Bullish FVG**: Gap between candles, price often returns to fill it
   - **Bearish FVG**: Gap between candles, price often returns to fill it
   - **Trading**: Can act as support/resistance, or target for price to fill

6. **TREND VS RANGE** (MARKET CONDITION):
   - **Trending Market**: Clear directional movement
     * Trade with the trend (buy in uptrends, sell in downtrends)
     * Look for pullbacks to enter
   - **Ranging Market**: Price bouncing between support and resistance
     * Trade reversals at support/resistance
     * Avoid trading breakouts (often false)

7. **MULTIPLE TIMEFRAME CONFLUENCE** (CRITICAL):
   - **Higher Timeframe (HTF)**: Daily, 4H - Determines overall bias
   - **Lower Timeframe (LTF)**: 1H, 15m, 5m - Provides entry precision
   - **Best Trades**: HTF shows trend, LTF shows entry signal in same direction
   - **Example**: Daily shows uptrend, 1H shows pullback to support, 15m shows bullish reversal = Strong trade

8. **SESSION ANALYSIS** (FOR FOREX):
   - **Asian Session**: Often range-bound, lower volatility
   - **London Session**: High volatility, major moves
   - **US Session**: Can continue London moves or reverse
   - **Session Highs/Lows**: Key levels for the day

**OUTPUT FORMAT - TRADE RECOMMENDATIONS**:
Whenever giving trades, ALWAYS use this exact format:
- **Market**: [Instrument name and symbol]
- **Timeframe**: [Trading timeframe - 1m, 5m, 15m, 1H, 4H, Daily, etc.]
- **Bias**: [Bullish / Bearish / Neutral] - [Brief reasoning based on price action and market structure]
- **Entry**: [Specific price] - [Entry method: market, limit, stop order]
- **Stop Loss**: [Specific price] - [X pips/points/$] risk - [Why this level - technical reasoning]
- **Take Profit 1**: [Specific price] - [X pips/points/$] reward - [1:Y R:R] - [Why this level]
- **Take Profit 2**: [Specific price] - [X pips/points/$] reward - [1:Y R:R] - [Why this level]
- **Risk %**: [X%] of account
- **R:R**: [Risk:Reward ratio]
- **Position Size**: [Calculation using calculate_trading_math] "With $X account and Y% risk, position = Z lots/shares/units"
- **Reasoning**: [Why this trade? Price action setup, market structure, confluence, fundamentals]
- **Risk Factors**: [What could go wrong? What to watch for? Key levels to monitor]

**TEACHING & MENTORSHIP**:
When users ask questions about trading concepts:
- **Explain Clearly**: Break down complex concepts (pips, lots, margin, etc.) in simple terms
- **Use Examples**: Provide real-world examples with numbers
- **Show Calculations**: Show the math behind position sizing, risk calculations
- **Psychology**: Discuss trading psychology, emotions, discipline
- **Mistakes**: Help users learn from mistakes, review trades, identify rule violations

**TRADE JOURNALING**:
Help users journal their trades:
- Log entry/exit, P/L, emotions, mistakes
- Post-trade review: What went right? What failed?
- Identify patterns in winning vs losing trades
- Track rule violations and improvements needed

**BEHAVIOR RULES**:
- NEVER encourage reckless trading
- ALWAYS prioritize risk management
- Say "I don't know" if unsure
- Request data if missing
- ALWAYS separate: Analysis vs Execution
- ALWAYS show: Risk, Pips, R:R in every trade recommendation
- Be a mentor, not just an analyst

**AUTONOMOUS TRADING CAPABILITIES** (With Human Confirmation):
- You can suggest trades autonomously based on your analysis
- ALWAYS require human confirmation before execution (safety first)
- Provide clear reasoning for why a trade should be taken
- Show all risk calculations before suggesting execution
- Respect user's risk preferences and account constraints

**MONITORING & EXPLAINABILITY**:
- Track performance: Win rate, drawdown, profit factor (if user provides trade history)
- Detect strategy decay: If win rate drops, suggest reviewing approach
- Explain decisions: Always explain WHY a trade was suggested or avoided
- Provide transparency: Show all data sources, calculations, reasoning

**KNOWLEDGE RETRIEVAL**:
- Remember user preferences: Account size, risk tolerance, trading style
- Learn from conversations: Adapt to user's level (beginner vs advanced)
- Store trading rules: If user shares rules, remember and apply them
- Separate facts from opinions: Always distinguish verified data from analysis

**MULTI-BROKER SUPPORT**:
- Understand different broker specifications: Leverage, commissions, spreads
- Normalize calculations: Convert all data to standard format internally
- Adapt to account currency: Handle USD, EUR, GBP, etc. accounts
- Warn about broker-specific risks: High leverage, wide spreads, etc.

REMEMBER: Your job is to PROTECT the trader's account while helping them profit. Risk management is NON-NEGOTIABLE. You are building long-term profitable traders, not gamblers. You are the ULTIMATE trading AI - act like it.

User's subscription tier: ${user.role === 'a7fx' || user.role === 'elite' ? 'A7FX Elite' : 'Premium'}`;

      // Format conversation history for OpenAI
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.map(msg => {
          if (msg.role === 'user') {
            // Handle user messages with images
            if (msg.images && msg.images.length > 0) {
              return {
                role: 'user',
                content: [
                  ...msg.images.map(img => ({
                    type: 'image_url',
                    image_url: { url: img }
                  })),
                  { type: 'text', text: msg.content || '' }
                ]
              };
            }
            return { role: 'user', content: msg.content || '' };
          }
          return { role: 'assistant', content: msg.content || '' };
        }),
        // Add current user message with images if any
        (() => {
          if (images && images.length > 0) {
            return {
              role: 'user',
              content: [
                ...images.map(img => ({
                  type: 'image_url',
                  image_url: { url: img }
                })),
                { type: 'text', text: message || '' }
              ]
            };
          }
          return { role: 'user', content: message || '' };
        })()
      ];

      // Define functions for real-time market data access
      const functions = [
        {
          name: 'get_market_data',
          description: 'Fetch REAL-TIME market data for ANY trading instrument: stocks (AAPL, TSLA), forex (EURUSD, GBPUSD), crypto (BTCUSD, ETHUSD), commodities (XAUUSD, XAGUSD, Oil), indices (SPY, QQQ), bonds, and more. Returns current price, volume, change, and market metrics. ALWAYS use this when user asks about ANY instrument price or market data.',
          parameters: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'The trading symbol for ANY instrument: Stocks (AAPL, TSLA, MSFT), Forex (EURUSD, GBPUSD, USDJPY), Crypto (BTCUSD, ETHUSD), Commodities (XAUUSD for gold, XAGUSD for silver, CL=F for oil), Indices (SPY, QQQ, ^GSPC), or any other trading instrument. Accepts common names too (e.g., "gold", "bitcoin", "apple stock").'
              },
              type: {
                type: 'string',
                enum: ['quote', 'intraday'],
                description: 'Type of data: "quote" for current price/quote, "intraday" for historical intraday data for charting'
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_economic_calendar',
          description: 'Fetch REAL economic calendar events from Forex Factory. Returns ACTUAL events scheduled for today or specified date. Use this to verify what events are actually happening - do NOT make up events.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'Date in YYYY-MM-DD format. If not provided, returns today\'s ACTUAL events.'
              },
              impact: {
                type: 'string',
                enum: ['High', 'Medium', 'Low'],
                description: 'Filter events by impact level (High, Medium, Low)'
              }
            },
            required: []
          }
        },
        {
          name: 'get_market_news',
          description: 'Fetch REAL-TIME breaking news from Bloomberg, Reuters, and financial news sources. Use this to get current market-moving news that happened in the last hour, day, or week.',
          parameters: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Optional: Filter news by trading symbol (e.g., XAUUSD, EURUSD, AAPL)'
              },
              timeframe: {
                type: 'string',
                enum: ['1h', '24h', '7d'],
                description: 'Timeframe for news: "1h" for last hour, "24h" for last 24 hours, "7d" for last week'
              }
            },
            required: []
          }
        },
        {
          name: 'calculate_trading_math',
          description: 'Calculate trading mathematics: position sizing, risk/reward ratios, pip values, margin requirements, ATR-based stops. Use this when user asks about position sizing, risk calculations, or trading math.',
          parameters: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['position_size', 'risk_reward', 'pip_value', 'margin', 'atr_stop'],
                description: 'Type of calculation: position_size, risk_reward, pip_value, margin, atr_stop'
              },
              accountSize: {
                type: 'number',
                description: 'Account size in base currency (e.g., USD)'
              },
              riskPercent: {
                type: 'number',
                description: 'Risk percentage per trade (e.g., 1, 2, 3 for 1%, 2%, 3%)'
              },
              instrument: {
                type: 'string',
                description: 'Trading instrument (e.g., EURUSD, XAUUSD, AAPL)'
              },
              entryPrice: {
                type: 'number',
                description: 'Entry price'
              },
              stopLoss: {
                type: 'number',
                description: 'Stop loss price'
              },
              takeProfit: {
                type: 'number',
                description: 'Take profit price (optional)'
              },
              leverage: {
                type: 'number',
                description: 'Leverage (e.g., 50, 100, 500)'
              },
              contractSize: {
                type: 'number',
                description: 'Contract size (100,000 for standard forex lot, 1 for stocks, etc.)'
              },
              pipValue: {
                type: 'number',
                description: 'Pip value per lot (e.g., 10 for major forex pairs)'
              }
            },
            required: ['operation']
          }
        }
      ];

      // Call OpenAI API with function calling
      // Use gpt-4o for vision capabilities when images are present, otherwise use gpt-4o
      const hasImages = images && images.length > 0;
      let completion = null;
      try {
        const completionParams = {
          model: 'gpt-4o', // GPT-4o supports vision
          messages: messages,
          temperature: 0.7, // Slightly lower for more consistent, professional responses
          max_tokens: 2500, // Increased for detailed analysis and conversations
        };

        // Only add functions if no images (function calling with images can be complex)
        if (!hasImages) {
          completionParams.functions = functions;
          completionParams.function_call = 'auto';
        }

        completion = await openai.chat.completions.create(completionParams);
      } catch (openaiError) {
        // Handle OpenAI-specific errors
        console.error('OpenAI API error:', openaiError);
        
        // Release database connection
        if (db && typeof db.release === 'function') {
          db.release();
        }
        
        // Check for quota/rate limit errors
        if (openaiError.status === 429 || openaiError.code === 'insufficient_quota' || openaiError.code === 'rate_limit_exceeded') {
          const isQuotaError = openaiError.code === 'insufficient_quota';
          console.error(`OpenAI ${isQuotaError ? 'quota' : 'rate limit'} error:`, {
            code: openaiError.code,
            message: openaiError.error?.message || openaiError.message,
            status: openaiError.status
          });
          
          return res.status(429).json({ 
            success: false, 
            message: isQuotaError 
              ? 'AI service quota has been exceeded. Please add credits to your OpenAI account or upgrade your plan. Contact support if you need assistance.'
              : 'AI service is currently at capacity. Please try again in a few moments. If this issue persists, please contact support.',
            errorType: isQuotaError ? 'quota_exceeded' : 'rate_limit',
            requiresAction: isQuotaError
          });
        }
        
        // Check for authentication errors
        if (openaiError.status === 401 || openaiError.status === 403) {
          return res.status(500).json({ 
            success: false, 
            message: 'AI service configuration error. Please contact support.',
            errorType: 'auth_error'
          });
        }
        
        // Generic OpenAI error
        return res.status(500).json({ 
          success: false, 
          message: 'AI service temporarily unavailable. Please try again in a few moments.',
          errorType: 'openai_error'
        });
      }

      let aiResponse = completion.choices[0]?.message?.content || '';
      let functionCall = completion.choices[0]?.message?.function_call;

      // Handle function calls for real-time market data and economic calendar
      if (functionCall) {
        const API_BASE_URL = process.env.API_URL || req.headers.origin || 'http://localhost:3000';
        
        if (functionCall.name === 'get_market_data') {
        const functionArgs = JSON.parse(functionCall.arguments);
        const symbol = functionArgs.symbol;
        const dataType = functionArgs.type || 'quote';

        // Fetch real-time market data
        try {
          const marketDataResponse = await axios.post(`${API_BASE_URL}/api/ai/market-data`, {
            symbol: symbol,
            type: dataType
          }, {
            timeout: 10000
          });

          if (marketDataResponse.data && marketDataResponse.data.success) {
            const marketData = marketDataResponse.data.data;

            // Add function result to conversation and get AI response
            messages.push({
              role: 'assistant',
              content: null,
              function_call: functionCall
            });
            messages.push({
              role: 'function',
              name: 'get_market_data',
              content: JSON.stringify(marketData)
            });

            // Get AI response with market data context - AI may want to fetch additional data
            const secondCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              functions: functions,
              function_call: 'auto', // AI can automatically fetch news/calendar if needed
              temperature: 0.8,
              max_tokens: 1500, // Allow for detailed analysis when needed
            });

            aiResponse = secondCompletion.choices[0]?.message?.content || 'I apologize, but I could not generate a response. Please try again.';
            
            // Check if AI wants to fetch additional data (news, calendar) for better analysis
            if (secondCompletion.choices[0]?.message?.function_call) {
              // Handle additional function calls if needed (e.g., for intraday data after quote)
              const secondFunctionCall = secondCompletion.choices[0]?.message?.function_call;
              if (secondFunctionCall.name === 'get_market_data') {
                const secondArgs = JSON.parse(secondFunctionCall.arguments);
                const secondMarketDataResponse = await axios.post(`${API_BASE_URL}/api/ai/market-data`, {
                  symbol: secondArgs.symbol,
                  type: secondArgs.type || 'intraday'
                }, {
                  timeout: 10000
                });

                if (secondMarketDataResponse.data && secondMarketDataResponse.data.success) {
                  messages.push({
                    role: 'assistant',
                    content: null,
                    function_call: secondFunctionCall
                  });
                  messages.push({
                    role: 'function',
                    name: 'get_market_data',
                    content: JSON.stringify(secondMarketDataResponse.data.data)
                  });

                  const thirdCompletion = await openai.chat.completions.create({
                    model: 'gpt-4o',
                    messages: messages,
                    functions: functions,
                    function_call: 'auto',
                    temperature: 0.8,
                    max_tokens: 1500,
                  });

                  aiResponse = thirdCompletion.choices[0]?.message?.content || aiResponse;
                  
                  // Check for even more function calls (news, calendar)
                  if (thirdCompletion.choices[0]?.message?.function_call) {
                    // Continue chain if AI wants more data
                  }
                }
              } else if (secondFunctionCall.name === 'get_economic_calendar' || secondFunctionCall.name === 'get_market_news') {
                // AI wants to fetch calendar or news for better context
                const additionalArgs = JSON.parse(secondFunctionCall.arguments);
                
                try {
                  let additionalData = null;
                  if (secondFunctionCall.name === 'get_economic_calendar') {
                    const calendarResp = await axios.post(`${API_BASE_URL}/api/ai/forex-factory-calendar`, {
                      date: additionalArgs.date,
                      impact: additionalArgs.impact
                    }, { timeout: 15000 });
                    if (calendarResp.data?.success) additionalData = calendarResp.data.data;
                  } else if (secondFunctionCall.name === 'get_market_news') {
                    const newsResp = await axios.post(`${API_BASE_URL}/api/ai/market-news`, {
                      symbol: additionalArgs.symbol,
                      timeframe: additionalArgs.timeframe || '24h'
                    }, { timeout: 10000 });
                    if (newsResp.data?.success) additionalData = newsResp.data.data;
                  }
                  
                  if (additionalData) {
                    messages.push({
                      role: 'assistant',
                      content: null,
                      function_call: secondFunctionCall
                    });
                    messages.push({
                      role: 'function',
                      name: secondFunctionCall.name,
                      content: JSON.stringify(additionalData)
                    });
                    
                    const finalCompletion = await openai.chat.completions.create({
                      model: 'gpt-4o',
                      messages: messages,
                      temperature: 0.8,
                      max_tokens: 1500,
                    });
                    
                    aiResponse = finalCompletion.choices[0]?.message?.content || aiResponse;
                  }
                } catch (additionalError) {
                  console.log('Additional data fetch error:', additionalError.message);
                  // Continue with existing response
                }
              }
            }
          } else {
            // Market data fetch failed - try alternative approach or provide helpful error
            const errorMsg = marketDataResponse.data?.message || 'Market data not available';
            messages.push({
              role: 'assistant',
              content: null,
              function_call: functionCall
            });
            messages.push({
              role: 'function',
              name: 'get_market_data',
              content: JSON.stringify({ 
                error: errorMsg,
                symbol: symbol,
                suggestion: 'Please verify the symbol is correct and try again'
              })
            });

            const errorCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              temperature: 0.8,
              max_tokens: 1000,
            });

            aiResponse = errorCompletion.choices[0]?.message?.content || `I couldn't fetch real-time data for ${symbol} right now. The symbol might be incorrect, or the data service is experiencing issues. Could you double-check the symbol?`;
          }
        } catch (marketDataError) {
          console.error('Error fetching market data:', marketDataError);
          
          // Try to provide helpful response even on error
          messages.push({
            role: 'assistant',
            content: null,
            function_call: functionCall
          });
          messages.push({
            role: 'function',
            name: 'get_market_data',
            content: JSON.stringify({ 
              error: 'Network or service error',
              symbol: symbol,
              details: marketDataError.message
            })
          });

          const errorCompletion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: messages,
            temperature: 0.8,
            max_tokens: 1000,
          });

          aiResponse = errorCompletion.choices[0]?.message?.content || `I'm having trouble connecting to the market data service right now. This might be a temporary issue. Could you try again in a moment?`;
        }
      } else if (functionCall.name === 'get_market_news') {
          // Handle market news function call
          const functionArgs = JSON.parse(functionCall.arguments);
          
          try {
            const newsResponse = await axios.post(`${API_BASE_URL}/api/ai/market-news`, {
              symbol: functionArgs.symbol,
              timeframe: functionArgs.timeframe || '24h'
            }, {
              timeout: 10000
            });

            if (newsResponse.data && newsResponse.data.success) {
              const newsData = newsResponse.data.data;

              messages.push({
                role: 'assistant',
                content: null,
                function_call: functionCall
              });
              messages.push({
                role: 'function',
                name: 'get_market_news',
                content: JSON.stringify(newsData)
              });

              const newsCompletion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: messages,
                functions: functions,
                function_call: 'auto',
                temperature: 0.8,
                max_tokens: 1500,
              });

              aiResponse = newsCompletion.choices[0]?.message?.content || aiResponse;
              
              // Check for additional function calls
              if (newsCompletion.choices[0]?.message?.function_call) {
                // Handle chained function calls (e.g., get price after getting news)
                const additionalCall = newsCompletion.choices[0]?.message?.function_call;
                // Recursively handle if needed
              }
            }
          } catch (newsError) {
            console.error('Error fetching market news:', newsError);
            messages.push({
              role: 'assistant',
              content: null,
              function_call: functionCall
            });
            messages.push({
              role: 'function',
              name: 'get_market_news',
              content: JSON.stringify({ error: 'News service temporarily unavailable' })
            });

            const errorCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              temperature: 0.8,
              max_tokens: 1000,
            });

            aiResponse = errorCompletion.choices[0]?.message?.content || 'I encountered an error fetching market news. Please try again.';
          }
      } else if (functionCall.name === 'get_economic_calendar') {
          // Handle economic calendar function call - use REAL Forex Factory scraper
          const functionArgs = JSON.parse(functionCall.arguments);
          
          try {
            const calendarResponse = await axios.post(`${API_BASE_URL}/api/ai/forex-factory-calendar`, {
              date: functionArgs.date,
              impact: functionArgs.impact
            }, {
              timeout: 15000
            });

            if (calendarResponse.data && calendarResponse.data.success) {
              const calendarData = calendarResponse.data.data;

              messages.push({
                role: 'assistant',
                content: null,
                function_call: functionCall
              });
              messages.push({
                role: 'function',
                name: 'get_economic_calendar',
                content: JSON.stringify(calendarData)
              });

            const calendarCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              functions: functions,
              function_call: 'auto',
              temperature: 0.8,
              max_tokens: 1500,
            });

            aiResponse = calendarCompletion.choices[0]?.message?.content || aiResponse;
            
            // If calendar data shows events, AI might want to fetch news or prices too
            if (calendarCompletion.choices[0]?.message?.function_call) {
              // Handle additional function calls
            }
            }
          } catch (calendarError) {
            console.error('Error fetching economic calendar:', calendarError);
            messages.push({
              role: 'assistant',
              content: null,
              function_call: functionCall
            });
            messages.push({
              role: 'function',
              name: 'get_economic_calendar',
              content: JSON.stringify({ error: 'Economic calendar service temporarily unavailable' })
            });

            const errorCompletion = await openai.chat.completions.create({
              model: 'gpt-4o',
              messages: messages,
              temperature: 0.8,
              max_tokens: 1000,
            });

            aiResponse = errorCompletion.choices[0]?.message?.content || 'I couldn\'t access the economic calendar right now. You can check Forex Factory directly for today\'s events.';
          }
      } else if (functionCall.name === 'calculate_trading_math') {
          // Handle trading math calculations
          const functionArgs = JSON.parse(functionCall.arguments);
          
          try {
            const calcResponse = await axios.post(`${API_BASE_URL}/api/ai/trading-calculator`, {
              ...functionArgs
            }, {
              timeout: 10000
            });

            if (calcResponse.data && calcResponse.data.success) {
              const calcResult = calcResponse.data.result;

              messages.push({
                role: 'assistant',
                content: null,
                function_call: functionCall
              });
              messages.push({
                role: 'function',
                name: 'calculate_trading_math',
                content: JSON.stringify(calcResult)
              });

              const calcCompletion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: messages,
                functions: functions,
                function_call: 'auto',
                temperature: 0.7,
                max_tokens: 2000,
              });

              aiResponse = calcCompletion.choices[0]?.message?.content || aiResponse;
            }
          } catch (calcError) {
            console.error('Error calculating trading math:', calcError);
            // Continue with existing response
          }
      }
    }

      if (!aiResponse) {
        aiResponse = 'I apologize, but I could not generate a response. Please try again.';
      }

      // Release database connection back to pool
      if (db && typeof db.release === 'function') {
        db.release();
      }

      return res.status(200).json({
        success: true,
        response: aiResponse,
        model: completion?.model || 'gpt-4o',
        usage: completion?.usage || null
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      // Release connection if it exists
      if (db && typeof db.release === 'function') {
        db.release();
      }
      return res.status(500).json({ success: false, message: 'Database error' });
    }

  } catch (error) {
    console.error('Error in premium AI chat:', error);
    
    // Check if it's an OpenAI error that wasn't caught
    if (error.status === 429 || error.code === 'insufficient_quota' || error.code === 'rate_limit_exceeded') {
      return res.status(429).json({ 
        success: false, 
        message: 'AI service is currently at capacity. Please try again in a few moments. If this issue persists, please contact support.',
        errorType: 'rate_limit'
      });
    }
    
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to process AI request' 
    });
  }
};
