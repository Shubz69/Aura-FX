/**
 * AURA Trading Knowledge Core
 * 
 * Comprehensive trading intelligence covering all 10 pillars:
 * 1. Market Methodology / Edge ("How")
 * 2. Risk Management / Math ("Risk")
 * 3. Psychology ("Who")
 * 4. Ecosystem ("Where")
 * 5. Fundamentals + Macro + News
 * 6. Derivatives & Market-Specific Knowledge
 * 7. Market Microstructure & Execution Quality
 * 8. Strategy Library
 * 9. Instrument Coverage
 * 10. Safety & No-Hallucination Rules
 */

// ============================================================================
// PILLAR 1: MARKET METHODOLOGY / EDGE ("HOW")
// ============================================================================

const MARKET_METHODOLOGY = {
  priceAction: {
    candlesticks: {
      bullish: {
        hammer: { desc: 'Long lower wick, small body at top', meaning: 'Buyers rejected sellers, potential reversal up', reliability: 0.65 },
        engulfing: { desc: 'Bullish candle fully engulfs prior bearish candle', meaning: 'Strong buyer control', reliability: 0.72 },
        morningStar: { desc: '3-candle pattern: bearish, doji/small body, bullish', meaning: 'Reversal from downtrend', reliability: 0.78 },
        piercingLine: { desc: 'Bullish candle closes above 50% of prior bearish body', meaning: 'Buyers regaining control', reliability: 0.62 },
        threeWhiteSoldiers: { desc: 'Three consecutive bullish candles with higher closes', meaning: 'Strong uptrend continuation', reliability: 0.75 }
      },
      bearish: {
        shootingStar: { desc: 'Long upper wick, small body at bottom', meaning: 'Sellers rejected buyers, potential reversal down', reliability: 0.65 },
        engulfing: { desc: 'Bearish candle fully engulfs prior bullish candle', meaning: 'Strong seller control', reliability: 0.72 },
        eveningStar: { desc: '3-candle pattern: bullish, doji/small body, bearish', meaning: 'Reversal from uptrend', reliability: 0.78 },
        darkCloudCover: { desc: 'Bearish candle closes below 50% of prior bullish body', meaning: 'Sellers regaining control', reliability: 0.62 },
        threeBlackCrows: { desc: 'Three consecutive bearish candles with lower closes', meaning: 'Strong downtrend continuation', reliability: 0.75 }
      },
      neutral: {
        doji: { desc: 'Open and close nearly equal', meaning: 'Indecision, potential reversal', reliability: 0.55 },
        spinningTop: { desc: 'Small body with wicks on both sides', meaning: 'Indecision, wait for confirmation', reliability: 0.50 },
        insideBar: { desc: 'Current candle range inside prior candle', meaning: 'Consolidation, breakout pending', reliability: 0.60 }
      }
    },
    concepts: {
      orderBlocks: 'Institutional supply/demand zones - last candle before impulsive move',
      fairValueGaps: 'Imbalances where price moved too fast - often revisited',
      liquiditySweeps: 'False breakouts to trigger stops before reversal',
      bos: 'Break of Structure - confirms trend continuation',
      choch: 'Change of Character - first sign of potential reversal'
    }
  },
  
  marketStructure: {
    trend: {
      uptrend: 'Higher highs (HH) and higher lows (HL)',
      downtrend: 'Lower highs (LH) and lower lows (LL)',
      identification: [
        'Draw swing highs and lows',
        'Connect with trendlines',
        'Confirm with moving averages (price above = bullish, below = bearish)',
        'Check multiple timeframes for alignment'
      ]
    },
    range: {
      definition: 'Price oscillating between horizontal support and resistance',
      trading: 'Buy at support, sell at resistance, or wait for breakout',
      confirmation: 'Multiple touches of both boundaries'
    },
    breakout: {
      definition: 'Price moving decisively beyond a key level',
      confirmation: ['Close beyond level', 'Volume expansion', 'Retest of level as new support/resistance'],
      fakeout: 'False breakout that quickly reverses - common liquidity grab'
    }
  },
  
  supportResistance: {
    types: {
      horizontal: 'Previous highs/lows, round numbers, pivots',
      dynamic: 'Moving averages, trendlines, channels',
      fibonacci: '23.6%, 38.2%, 50%, 61.8%, 78.6% retracements'
    },
    strength: [
      'Number of touches (more = stronger)',
      'Timeframe (higher TF = stronger)',
      'Volume at level',
      'Confluence (multiple factors align)'
    ]
  },
  
  volatilityRegimes: {
    low: { atr: 'below 20-period average', strategy: 'Range trading, mean reversion, smaller position sizes due to wider stops relative to target' },
    normal: { atr: 'near 20-period average', strategy: 'Standard strategies work, normal position sizing' },
    high: { atr: 'above 20-period average', strategy: 'Reduce size, wider stops, trend following preferred, avoid fading' },
    expanding: { meaning: 'Volatility increasing', implication: 'Trend likely to accelerate, avoid mean reversion' },
    contracting: { meaning: 'Volatility decreasing', implication: 'Breakout likely coming, position for expansion' }
  },
  
  multiTimeframeAnalysis: {
    hierarchy: ['Monthly → Weekly → Daily → 4H → 1H → 15M → 5M → 1M'],
    purpose: {
      higher: 'Trend direction, key levels, bias',
      middle: 'Trade setup, entry zone',
      lower: 'Entry timing, stop placement'
    },
    alignment: 'Best trades have alignment across 2-3 timeframes'
  },
  
  sessions: {
    asia: { time: '00:00-08:00 UTC', characteristics: 'Low volatility, ranging, JPY/AUD pairs active' },
    london: { time: '08:00-16:00 UTC', characteristics: 'High volatility, trends start, EUR/GBP pairs active' },
    newYork: { time: '13:00-21:00 UTC', characteristics: 'High volatility, USD pairs active, major moves' },
    overlap: { time: '13:00-16:00 UTC', characteristics: 'Highest liquidity and volatility' },
    killZones: {
      londonOpen: '07:00-10:00 UTC - often sets the daily high/low',
      nyOpen: '12:00-15:00 UTC - often reverses or extends London move',
      asianRange: 'Used as liquidity targets for London session'
    }
  },
  
  technicalIndicators: {
    trend: {
      ma: { types: ['SMA', 'EMA', 'WMA'], common: [20, 50, 100, 200], usage: 'Trend direction, dynamic S/R' },
      macd: { components: ['MACD line', 'Signal line', 'Histogram'], signals: 'Crossovers, divergence, histogram direction' },
      adx: { interpretation: '<20 weak trend, 20-40 developing, >40 strong trend' }
    },
    momentum: {
      rsi: { overbought: '>70', oversold: '<30', usage: 'Divergence, mean reversion, trend strength' },
      stochastic: { overbought: '>80', oversold: '<20', usage: 'Timing entries in trend direction' }
    },
    volume: {
      obv: 'Cumulative volume showing buying/selling pressure',
      vwap: 'Volume-weighted average price - institutional benchmark'
    },
    volatility: {
      atr: 'Average True Range - use for stop placement and position sizing',
      bollingerBands: 'Mean ± 2 std dev - shows volatility expansion/contraction'
    }
  },
  
  patterns: {
    classic: {
      headAndShoulders: { type: 'reversal', reliability: 0.75, target: 'Height from neckline' },
      doubleTop: { type: 'reversal', reliability: 0.72, target: 'Height of pattern' },
      doubleBottom: { type: 'reversal', reliability: 0.72, target: 'Height of pattern' },
      triangle: { types: ['ascending', 'descending', 'symmetrical'], breakout: '~75% of way to apex' },
      flag: { type: 'continuation', reliability: 0.70, target: 'Measured move = flagpole height' },
      wedge: { types: ['rising (bearish)', 'falling (bullish)'], reliability: 0.68 }
    },
    fibonacci: {
      retracements: [0.236, 0.382, 0.5, 0.618, 0.786],
      extensions: [1.0, 1.272, 1.618, 2.0, 2.618],
      usage: 'Identify potential reversal zones and targets'
    }
  }
};

// ============================================================================
// PILLAR 2: RISK MANAGEMENT / MATH ("RISK")
// ============================================================================

const RISK_MANAGEMENT = {
  coreRules: {
    perTradeRisk: {
      conservative: '0.5% of account',
      standard: '1% of account',
      aggressive: '2% of account (max recommended)',
      formula: 'Position Size = (Account × Risk%) / (Entry - Stop)'
    },
    maxDailyLoss: {
      recommended: '3% of account',
      action: 'Stop trading for the day if hit'
    },
    maxWeeklyLoss: {
      recommended: '6-10% of account',
      action: 'Reduce size or pause trading'
    }
  },
  
  positionSizing: {
    forex: {
      pipValue: {
        standardLot: '$10 per pip (for USD pairs)',
        miniLot: '$1 per pip',
        microLot: '$0.10 per pip',
        formula: 'Pip Value = (1 pip / exchange rate) × lot size'
      },
      lotSize: {
        formula: 'Lots = Risk Amount / (Stop in Pips × Pip Value)',
        example: '$100 risk / (20 pips × $10) = 0.5 lots'
      }
    },
    futures: {
      tickValue: {
        ES: '$12.50 per tick (0.25 points)',
        NQ: '$5 per tick (0.25 points)',
        GC: '$10 per tick ($0.10)',
        CL: '$10 per tick ($0.01)'
      },
      contracts: {
        formula: 'Contracts = Risk Amount / (Stop in Ticks × Tick Value)'
      }
    },
    stocks: {
      shares: {
        formula: 'Shares = Risk Amount / (Entry Price - Stop Price)',
        example: '$500 risk / ($100 - $95) = 100 shares'
      }
    },
    crypto: {
      sizing: 'Same as stocks - calculate based on $ risk and stop distance',
      leverage: 'Use carefully - most should use 1-3x max'
    }
  },
  
  rMultiples: {
    definition: 'R = the amount you risk on a trade',
    calculation: 'Profit ÷ Initial Risk = R-Multiple',
    targets: {
      minimum: '1R (breakeven target = 1:1)',
      standard: '2R (2:1 reward to risk)',
      extended: '3R+ (3:1 or better)'
    },
    expectancy: {
      formula: 'E = (Win% × Avg Win) - (Loss% × Avg Loss)',
      positive: 'E > 0 means profitable system over time',
      example: '(50% × 2R) - (50% × 1R) = 0.5R per trade'
    }
  },
  
  kelly: {
    formula: 'Kelly % = (bp - q) / b',
    variables: {
      b: 'Odds received (R-multiple)',
      p: 'Win probability',
      q: 'Loss probability (1 - p)'
    },
    usage: 'Optimal position size for maximum growth',
    warning: 'Use half-Kelly or quarter-Kelly in practice - full Kelly is too aggressive',
    example: 'Win rate 55%, 2:1 RR → Kelly = (2×0.55 - 0.45)/2 = 32.5% → Use 8-16%'
  },
  
  drawdown: {
    maxDrawdown: 'Largest peak-to-trough decline',
    riskOfRuin: 'Probability of blowing account',
    recoveryMath: {
      '10%': '11% needed to recover',
      '25%': '33% needed to recover',
      '50%': '100% needed to recover',
      '75%': '300% needed to recover'
    },
    prevention: [
      'Never risk more than 2% per trade',
      'Have daily/weekly loss limits',
      'Size down after consecutive losses',
      'Keep core capital protected'
    ]
  },
  
  leverage: {
    definition: 'Borrowed capital to increase position size',
    retail: {
      forex: 'Up to 50:1 in US, 30:1 in EU',
      futures: 'Varies by contract, often 10-20:1',
      crypto: 'Up to 100x on some exchanges (dangerous)'
    },
    effectiveLeverage: {
      formula: 'Total Exposure / Account Equity',
      recommended: 'Keep effective leverage under 5:1'
    },
    margin: {
      initialMargin: 'Required to open position',
      maintenanceMargin: 'Required to keep position open',
      marginCall: 'Broker demands more capital or closes positions'
    }
  },
  
  tradeManagement: {
    partials: {
      method: 'Close portion of position at targets',
      example: 'Close 50% at 1R, trail rest to 2R+',
      pros: 'Locks in profits, reduces stress',
      cons: 'Reduces overall R if trade runs'
    },
    breakeven: {
      when: 'Move stop to entry after 1R profit',
      purpose: 'Eliminate risk, let trade run free',
      warning: "Don't move too early - need room for noise"
    },
    trailing: {
      methods: ['ATR-based', 'Structure-based', 'Moving average'],
      purpose: 'Capture extended moves while protecting profits'
    }
  },
  
  correlation: {
    definition: 'How instruments move together',
    positive: 'Move same direction (EUR/USD & GBP/USD)',
    negative: 'Move opposite (USD/JPY & Gold typically)',
    risk: 'Correlated positions = concentrated risk',
    rule: 'Limit exposure to highly correlated trades'
  },
  
  propFirmRules: {
    common: {
      maxDailyLoss: '5% of starting balance',
      maxOverallLoss: '10% of starting balance',
      profitTarget: '8-10% for evaluation',
      consistencyRules: 'No single day > 50% of profits'
    },
    strategies: [
      'Trade small, hit daily limit rarely',
      'Focus on consistency over home runs',
      'Use trailing drawdown advantageously'
    ]
  }
};

// ============================================================================
// PILLAR 3: PSYCHOLOGY ("WHO")
// ============================================================================

const TRADING_PSYCHOLOGY = {
  corePrinciples: {
    discipline: {
      definition: 'Following your plan regardless of emotions',
      practices: [
        'Write trading plan before session',
        'Use checklists for entry criteria',
        'Set alerts, don\'t stare at charts',
        'Walk away after max loss hit'
      ]
    },
    patience: {
      definition: 'Waiting for A+ setups only',
      practices: [
        'Quality over quantity',
        'No trade is better than bad trade',
        'Let trades come to you',
        'Wait for confirmation'
      ]
    },
    emotionalDetachment: {
      goal: 'Trade the setup, not the P&L',
      techniques: [
        'Risk only what you can afford to lose',
        'Focus on process, not outcome',
        'Accept losses as cost of business',
        'Don\'t check P&L during trade'
      ]
    }
  },
  
  cognitiveBiases: {
    fomo: {
      name: 'Fear Of Missing Out',
      symptom: 'Chasing moves, entering late, no setup',
      solution: 'There\'s always another trade. Missing good moves is fine.'
    },
    revenge: {
      name: 'Revenge Trading',
      symptom: 'Trying to win back losses immediately',
      solution: 'Take a break after loss. Review later. Fresh start tomorrow.'
    },
    overconfidence: {
      name: 'Overconfidence Bias',
      symptom: 'Sizing up after wins, ignoring risk',
      solution: 'Stick to standard size. Wins don\'t change the math.'
    },
    recency: {
      name: 'Recency Bias',
      symptom: 'Overweighting recent results',
      solution: 'Review longer sample size. One trade means nothing.'
    },
    confirmation: {
      name: 'Confirmation Bias',
      symptom: 'Only seeing evidence that supports your view',
      solution: 'Actively look for reasons you\'re wrong.'
    },
    anchorng: {
      name: 'Anchoring',
      symptom: 'Stuck on old price levels or opinions',
      solution: 'Fresh analysis daily. Price is price.'
    },
    sunkCost: {
      name: 'Sunk Cost Fallacy',
      symptom: 'Holding losers because you\'re already down',
      solution: 'Would you enter this trade now? If no, exit.'
    }
  },
  
  journaling: {
    purpose: [
      'Track what works and what doesn\'t',
      'Identify patterns in your behavior',
      'Build confidence through data',
      'Improve systematically'
    ],
    fields: [
      'Date, time, session',
      'Instrument, direction, timeframe',
      'Setup type, entry/exit prices',
      'Stop loss, take profit, R-multiple',
      'Screenshot of setup',
      'Pre-trade emotion (1-10)',
      'Post-trade notes',
      'What went well, what to improve'
    ],
    review: {
      daily: '5 min - quick notes on trades',
      weekly: '30 min - patterns, stats, adjustments',
      monthly: 'Full statistical review, strategy tweaks'
    }
  },
  
  routines: {
    preTrade: [
      'Review economic calendar',
      'Check overnight moves',
      'Mark key levels on charts',
      'Define bias and plan for session',
      'Set maximum trades/loss for day'
    ],
    duringTrade: [
      'Follow the plan',
      'Don\'t move stop against you',
      'Take profits per plan',
      'Accept uncertainty'
    ],
    postTrade: [
      'Journal immediately',
      'No revenge trades',
      'If daily loss hit, stop',
      'Evening review'
    ]
  },
  
  probabilityMindset: {
    understanding: [
      'Any single trade can lose',
      'Edge plays out over many trades',
      '60% win rate = 4 losses every 10 trades',
      'Losses are not mistakes if plan was followed'
    ],
    practice: [
      'Think in batches of 20+ trades',
      'Focus on expectancy, not individual P&L',
      'Celebrate process, not outcomes',
      'Review stats, not emotions'
    ]
  }
};

// ============================================================================
// PILLAR 4: ECOSYSTEM ("WHERE")
// ============================================================================

const TRADING_ECOSYSTEM = {
  costs: {
    spread: {
      definition: 'Difference between bid and ask price',
      varies: 'Tight in high liquidity, wide in low liquidity',
      impact: 'Must overcome spread to profit',
      typical: {
        eurusd: '0.1-1 pip',
        gold: '$0.20-$0.50',
        crypto: '0.1-0.5%'
      }
    },
    commission: {
      types: ['Per lot', 'Per trade', 'Percentage'],
      ecn: 'Lower spread + fixed commission',
      marketMaker: 'Wider spread, no commission'
    },
    slippage: {
      definition: 'Difference between expected and actual fill price',
      causes: ['High volatility', 'Low liquidity', 'Large orders', 'News events'],
      mitigation: 'Use limit orders, avoid news, trade liquid instruments'
    },
    swap: {
      definition: 'Overnight financing cost/credit',
      calculation: 'Based on interest rate differential',
      consideration: 'Important for swing trades held overnight'
    }
  },
  
  orderTypes: {
    market: {
      description: 'Execute immediately at best available price',
      pros: 'Guaranteed fill',
      cons: 'May slip, especially in fast markets',
      use: 'When you need to be in NOW'
    },
    limit: {
      description: 'Execute at specified price or better',
      pros: 'Price control, no slippage',
      cons: 'May not fill if price doesn\'t reach',
      use: 'Entries at support, taking profit at resistance'
    },
    stop: {
      description: 'Becomes market order when price reached',
      pros: 'Automated exit for risk management',
      cons: 'Can slip through in gaps',
      use: 'Stop losses, breakout entries'
    },
    stopLimit: {
      description: 'Stop triggers limit order',
      pros: 'Price control after trigger',
      cons: 'May not fill in gaps',
      use: 'When slippage protection is critical'
    }
  },
  
  execution: {
    ecn: {
      description: 'Electronic Communication Network',
      execution: 'True market with multiple liquidity providers',
      spreads: 'Variable, can be very tight',
      best: 'Scalping, high frequency'
    },
    marketMaker: {
      description: 'Broker is counterparty',
      execution: 'Instant fills, fixed spreads',
      consideration: 'Potential conflict of interest',
      best: 'Beginners, small accounts'
    },
    stp: {
      description: 'Straight Through Processing',
      execution: 'Orders passed to liquidity providers',
      spreads: 'Variable',
      best: 'Balance of cost and execution'
    }
  },
  
  liquidity: {
    definition: 'Ease of executing large orders without price impact',
    highLiquidity: ['EUR/USD', 'US Treasuries', 'S&P 500 futures'],
    lowLiquidity: ['Exotic pairs', 'Small cap stocks', 'Illiquid crypto'],
    impact: 'Low liquidity = wider spreads, more slippage, harder exits'
  },
  
  platforms: {
    mt4: 'Retail forex standard, limited features',
    mt5: 'Upgraded MT4, more asset classes',
    ctrader: 'Modern alternative, better charting',
    tradingview: 'Charts and ideas, broker connections',
    thinkorswim: 'Full featured for US markets',
    tradovate: 'Futures focused, commission-free options'
  }
};

// ============================================================================
// PILLAR 5: FUNDAMENTALS + MACRO + NEWS
// ============================================================================

const FUNDAMENTALS_MACRO = {
  centralBanks: {
    fed: { currency: 'USD', meetings: '8x year', focus: 'Inflation (2%), employment' },
    ecb: { currency: 'EUR', meetings: '8x year', focus: 'Inflation (2%)' },
    boe: { currency: 'GBP', meetings: '8x year', focus: 'Inflation (2%)' },
    boj: { currency: 'JPY', meetings: '8x year', focus: 'Inflation, YCC' },
    rba: { currency: 'AUD', meetings: '11x year', focus: 'Inflation (2-3%)' },
    rbnz: { currency: 'NZD', meetings: '7x year', focus: 'Inflation (1-3%)' },
    boc: { currency: 'CAD', meetings: '8x year', focus: 'Inflation (1-3%)' },
    snb: { currency: 'CHF', meetings: '4x year', focus: 'Price stability, FX intervention' },
    
    hawkish: 'Higher rates → Currency strength',
    dovish: 'Lower rates → Currency weakness',
    neutral: 'Status quo → Look for shifts'
  },
  
  economicIndicators: {
    highImpact: {
      nfp: { name: 'Non-Farm Payrolls', frequency: 'Monthly', affects: 'USD', mechanism: 'Jobs growth → Fed policy' },
      cpi: { name: 'Consumer Price Index', frequency: 'Monthly', affects: 'All', mechanism: 'Inflation → Rate expectations' },
      gdp: { name: 'Gross Domestic Product', frequency: 'Quarterly', affects: 'All', mechanism: 'Growth → Currency strength' },
      fomc: { name: 'Federal Reserve Decisions', frequency: '8x year', affects: 'USD + All', mechanism: 'Rate changes → USD direction' },
      pmi: { name: 'Purchasing Managers Index', frequency: 'Monthly', affects: 'All', mechanism: '>50 expansion, <50 contraction' }
    },
    medium: {
      retailSales: 'Consumer spending health',
      industrialProduction: 'Manufacturing activity',
      employment: 'Claims, participation rate',
      housing: 'Starts, permits, prices'
    }
  },
  
  riskSentiment: {
    riskOn: {
      behavior: 'Investors seek returns, accept risk',
      beneficiaries: ['Equities', 'AUD', 'NZD', 'EM currencies', 'Crypto'],
      avoiders: ['USD', 'JPY', 'CHF', 'Gold', 'Bonds']
    },
    riskOff: {
      behavior: 'Investors seek safety, avoid risk',
      beneficiaries: ['USD', 'JPY', 'CHF', 'Gold', 'Bonds'],
      avoiders: ['Equities', 'AUD', 'NZD', 'EM currencies']
    },
    indicators: ['VIX level', 'Yield spreads', 'Currency correlations', 'Equity markets']
  },
  
  yields: {
    importance: 'Yield differentials drive currency flows',
    realYield: 'Nominal yield minus inflation',
    curve: {
      steepening: 'Economy expected to grow',
      flattening: 'Growth concerns',
      inversion: 'Recession warning (2s10s)'
    },
    impact: 'Higher yields → Currency strength (usually)'
  },
  
  commodityDrivers: {
    gold: ['Real yields (inverse)', 'USD strength (inverse)', 'Risk sentiment', 'Inflation expectations', 'Central bank buying'],
    oil: ['OPEC decisions', 'Inventories', 'Demand outlook', 'Geopolitics', 'USD strength'],
    copper: ['China demand', 'Construction activity', 'Risk sentiment']
  },
  
  geopolitics: {
    types: ['War/conflicts', 'Trade disputes', 'Sanctions', 'Elections', 'Policy changes'],
    impact: 'Uncertainty → Risk-off → Safe havens',
    trading: 'Position for uncertainty, not specific outcomes'
  }
};

// ============================================================================
// PILLAR 6: DERIVATIVES & MARKET-SPECIFIC
// ============================================================================

const DERIVATIVES_MARKETS = {
  futures: {
    specs: {
      ES: { name: 'E-mini S&P 500', tick: 0.25, tickValue: 12.50, margin: '~$12,000' },
      NQ: { name: 'E-mini Nasdaq', tick: 0.25, tickValue: 5.00, margin: '~$16,000' },
      YM: { name: 'E-mini Dow', tick: 1, tickValue: 5.00, margin: '~$8,000' },
      GC: { name: 'Gold Futures', tick: 0.10, tickValue: 10.00, margin: '~$8,000' },
      CL: { name: 'Crude Oil', tick: 0.01, tickValue: 10.00, margin: '~$7,000' },
      '6E': { name: 'Euro FX', tick: 0.00005, tickValue: 6.25, margin: '~$2,500' },
      '6J': { name: 'Japanese Yen', tick: 0.0000005, tickValue: 6.25, margin: '~$3,000' }
    },
    micro: {
      MES: { name: 'Micro E-mini S&P', tick: 0.25, tickValue: 1.25, margin: '~$1,200' },
      MNQ: { name: 'Micro E-mini Nasdaq', tick: 0.25, tickValue: 0.50, margin: '~$1,600' },
      MGC: { name: 'Micro Gold', tick: 0.10, tickValue: 1.00, margin: '~$800' }
    },
    rollover: {
      definition: 'Moving from expiring contract to next',
      timing: 'Usually 1-2 weeks before expiration',
      watch: 'Volume shifts to new contract'
    }
  },
  
  options: {
    basics: {
      call: 'Right to buy at strike price',
      put: 'Right to sell at strike price',
      premium: 'Price paid for the option',
      expiration: 'When option expires worthless or exercises'
    },
    greeks: {
      delta: 'Price change for $1 move in underlying',
      gamma: 'Rate of change in delta',
      theta: 'Time decay per day',
      vega: 'Sensitivity to implied volatility',
      rho: 'Sensitivity to interest rates'
    },
    strategies: {
      longCall: 'Bullish, limited risk, unlimited reward',
      longPut: 'Bearish, limited risk, high reward',
      coveredCall: 'Own stock + sell calls = income',
      protectivePut: 'Own stock + buy puts = insurance',
      spreads: 'Limit risk and reward by buying and selling options'
    },
    impliedVolatility: {
      high: 'Options expensive, consider selling',
      low: 'Options cheap, consider buying',
      skew: 'IV difference between puts and calls'
    }
  },
  
  cfds: {
    definition: 'Contract For Difference - derivative tracking underlying',
    pros: ['Leverage', 'Short selling easy', 'No ownership'],
    cons: ['Counterparty risk', 'Financing costs', 'Regulatory limits'],
    margin: 'Usually 3.33%-20% depending on instrument'
  },
  
  forex: {
    spotFX: {
      settlement: 'T+2',
      leverage: 'Up to 50:1 US, 30:1 EU',
      trading: '24/5'
    },
    lots: {
      standard: '100,000 units',
      mini: '10,000 units',
      micro: '1,000 units'
    },
    pips: {
      definition: 'Fourth decimal place (0.0001) for most pairs',
      jpy: 'Second decimal place (0.01) for JPY pairs',
      pipValue: 'Depends on lot size and quote currency'
    }
  }
};

// ============================================================================
// PILLAR 7: MICROSTRUCTURE & EXECUTION
// ============================================================================

const MICROSTRUCTURE = {
  spreadDynamics: {
    widening: {
      causes: ['Low liquidity', 'High volatility', 'News events', 'Session transitions'],
      impact: 'Higher cost to enter/exit',
      mitigation: 'Avoid trading during widening, use limits'
    },
    tightening: {
      causes: ['High liquidity', 'Active sessions', 'Normal conditions'],
      optimal: 'Trade during London/NY overlap for tightest spreads'
    }
  },
  
  liquidityConcepts: {
    stopRuns: {
      definition: 'Price moves to trigger stops before reversing',
      where: 'Above recent highs, below recent lows, round numbers',
      trading: 'Place stops beyond obvious levels, or use stop runs as entry'
    },
    liquiditySweeps: {
      definition: 'Quick move to grab liquidity then reverse',
      identification: 'Wick beyond level with close back inside',
      trading: 'Wait for sweep before entering reversal'
    },
    spoofing: {
      definition: 'Placing and canceling large orders to manipulate',
      detection: 'Level 2 shows large orders disappearing',
      note: 'Illegal but still occurs'
    }
  },
  
  slippageManagement: {
    modeling: {
      normal: '0-0.5 pips in liquid pairs',
      news: '5-50+ pips possible',
      illiquid: '1-5+ pips common'
    },
    reduction: [
      'Trade liquid instruments',
      'Avoid major news releases',
      'Use limit orders when possible',
      'Size appropriately for liquidity',
      'Trade during active sessions'
    ]
  },
  
  fillQuality: {
    partialFills: {
      cause: 'Order size exceeds available liquidity',
      handling: 'Break up large orders, use TWAP/VWAP'
    },
    latency: {
      retail: '50-500ms typical',
      impact: 'In fast markets, price can move significantly'
    }
  }
};

// ============================================================================
// PILLAR 8: STRATEGY LIBRARY
// ============================================================================

const STRATEGY_LIBRARY = {
  breakout: {
    description: 'Enter when price breaks through key level',
    setup: ['Identify consolidation', 'Mark breakout level', 'Wait for close beyond'],
    entry: 'On break or retest of broken level',
    stop: 'Inside the range',
    target: 'Range height or ATR multiple',
    conditions: ['High volatility', 'Clear consolidation', 'Volume confirmation']
  },
  
  fakeoutReversal: {
    description: 'Fade false breakouts after liquidity sweep',
    setup: ['Level breaks briefly', 'Strong rejection candle', 'Close back inside range'],
    entry: 'On close back inside, or retest of level',
    stop: 'Beyond the sweep wick',
    target: 'Other side of range or beyond',
    conditions: ['Clear S/R level', 'Extended move into level', 'Strong rejection']
  },
  
  meanReversion: {
    description: 'Bet on price returning to average',
    setup: ['Price extended from MA/VWAP', 'RSI overbought/oversold', 'At key level'],
    entry: 'On reversal signal at extreme',
    stop: 'Beyond recent extreme',
    target: 'Back to mean (MA/VWAP)',
    conditions: ['Ranging market', 'Low volatility', 'Clear boundaries']
  },
  
  trendFollowing: {
    description: 'Trade in direction of established trend',
    setup: ['Higher highs/lows or lower highs/lows', 'Price above/below key MAs', 'ADX > 25'],
    entry: 'On pullback to support/resistance in trend direction',
    stop: 'Beyond pullback low/high',
    target: 'Previous extreme or extension',
    conditions: ['Clear trend', 'Pullback gives entry', 'Trend aligned on higher TF']
  },
  
  pullbackContinuation: {
    description: 'Enter trend after healthy pullback',
    setup: ['Strong impulse move', 'Pullback to Fib level or MA', 'Momentum indicator reset'],
    entry: 'On rejection from pullback level',
    stop: 'Beyond pullback extreme',
    target: 'New high/low or measured move',
    conditions: ['Trending market', 'Pullback depth 38-62%', 'Lower TF reversal']
  },
  
  rangeTrade: {
    description: 'Buy support, sell resistance in range',
    setup: ['Clear horizontal boundaries', 'Multiple touches both sides', 'No trend'],
    entry: 'At range boundary with confirmation',
    stop: 'Outside range boundary',
    target: 'Opposite boundary',
    conditions: ['Well-defined range', 'ATR stable/low', 'No major news']
  },
  
  newsStraddle: {
    description: 'Position for volatility expansion around news',
    setup: ['Major news event scheduled', 'Market compressed before'],
    entry: 'Bracket orders above and below range',
    stop: 'Tight, or options-based',
    target: 'ATR expansion move',
    risk: 'Can get whipsawed both ways - use strict risk controls'
  },
  
  volatilityRegimeSelection: {
    lowVol: ['Mean reversion', 'Range trading', 'Options selling'],
    normalVol: ['Trend following', 'Pullback', 'Breakout'],
    highVol: ['Trend following only', 'Reduce size', 'Wider stops'],
    expanding: ['Breakout', 'Momentum', 'Trail stops'],
    contracting: ['Prepare for breakout', 'Range trade', 'Build position']
  }
};

// ============================================================================
// PILLAR 9: INSTRUMENT COVERAGE
// ============================================================================

const INSTRUMENT_SPECS = {
  forex: {
    majors: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD'],
    crosses: ['EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURAUD', 'GBPAUD'],
    exotics: ['USDMXN', 'USDZAR', 'USDTRY', 'USDSEK', 'USDNOK'],
    pipCalc: {
      standard: '0.0001 (4th decimal)',
      jpy: '0.01 (2nd decimal)',
      pipValue: 'Position Size × Pip Size / Exchange Rate'
    },
    sessions: {
      best: 'London/NY overlap (13:00-17:00 UTC)',
      eur: 'London session (08:00-17:00 UTC)',
      jpy: 'Tokyo session (00:00-09:00 UTC)'
    }
  },
  
  metals: {
    gold: {
      symbols: ['XAUUSD', 'GC', 'GLD'],
      tickSize: { spot: 0.01, futures: 0.10 },
      tickValue: { spot: '0.01/oz', futures: '$10' },
      drivers: ['Real yields', 'USD', 'Risk sentiment', 'CB buying']
    },
    silver: {
      symbols: ['XAGUSD', 'SI', 'SLV'],
      tickSize: { spot: 0.001, futures: 0.005 },
      drivers: ['Gold correlation', 'Industrial demand', 'USD']
    }
  },
  
  indices: {
    us: {
      sp500: { symbols: ['SPX', 'ES', 'SPY', 'SPX500'], points: 'Points, not pips' },
      nasdaq: { symbols: ['NDX', 'NQ', 'QQQ', 'NAS100'], points: 'Points' },
      dow: { symbols: ['DJI', 'YM', 'DIA', 'US30'], points: 'Points' }
    },
    europe: {
      dax: { symbols: ['DAX', 'GER40'] },
      ftse: { symbols: ['FTSE', 'UK100'] }
    },
    trading: '23 hours/day in futures, cash market hours for ETFs'
  },
  
  crypto: {
    major: {
      btc: { symbols: ['BTCUSD', 'BTC/USD', 'XBTUSD'], tickSize: 0.5 },
      eth: { symbols: ['ETHUSD', 'ETH/USD'], tickSize: 0.01 }
    },
    trading: '24/7',
    characteristics: ['High volatility', 'Weekend gaps possible', 'Correlation to risk']
  },
  
  energy: {
    wti: { symbols: ['CL', 'USOIL', 'WTI'], tickSize: 0.01, tickValue: '$10' },
    brent: { symbols: ['BZ', 'UKOIL'], tickSize: 0.01 },
    natgas: { symbols: ['NG', 'NATGAS'], tickSize: 0.001 }
  },
  
  lotSizeConversion: {
    forex: { standard: 100000, mini: 10000, micro: 1000 },
    gold: { standardOz: 100, miniOz: 10 },
    indices: 'Usually 1 contract = 1 point × multiplier'
  }
};

// ============================================================================
// PILLAR 10: SAFETY & NO-HALLUCINATION RULES
// ============================================================================

const SAFETY_RULES = {
  noHallucination: [
    'Never invent real-time prices - fetch from sources or say "unavailable"',
    'Never make up news events - cite source or say "unconfirmed"',
    'Never guarantee outcomes - trading involves risk',
    'Always label cached/stale data with age',
    'If source fails, clearly state "data unavailable" not made-up data'
  ],
  
  dataQuality: {
    live: { maxAge: 60, label: 'live' },
    recent: { maxAge: 300, label: 'recent (< 5 min)' },
    cached: { maxAge: 3600, label: 'cached (< 1 hour)' },
    stale: { maxAge: Infinity, label: 'stale - verify current price' }
  },
  
  responseMandates: {
    whyMoved: 'MUST include at least 1 specific catalyst with source',
    technical: 'MUST include specific price levels',
    sizing: 'MUST include position sizing math when SL and account provided',
    always: 'MUST follow structured format: Driver → Factors → Mechanism → Levels → Scenarios → Risk → Watch'
  },
  
  disclaimers: {
    required: 'Trading involves risk. Past performance does not guarantee future results.',
    sizing: 'Position size recommendations are educational, not financial advice.',
    news: 'News interpretation is opinion, not guaranteed market direction.'
  },
  
  sourceLabeling: {
    required: true,
    format: 'Source: {provider} | Updated: {timestamp}',
    fallback: 'Source: Cached/Unavailable | Last known: {timestamp}'
  }
};

// ============================================================================
// KNOWLEDGE RETRIEVAL
// ============================================================================

const TOPIC_MAPPINGS = {
  // Market Methodology
  'candlestick': () => MARKET_METHODOLOGY.priceAction.candlesticks,
  'price action': () => MARKET_METHODOLOGY.priceAction,
  'market structure': () => MARKET_METHODOLOGY.marketStructure,
  'support': () => MARKET_METHODOLOGY.supportResistance,
  'resistance': () => MARKET_METHODOLOGY.supportResistance,
  'trend': () => MARKET_METHODOLOGY.marketStructure.trend,
  'volatility': () => MARKET_METHODOLOGY.volatilityRegimes,
  'session': () => MARKET_METHODOLOGY.sessions,
  'indicator': () => MARKET_METHODOLOGY.technicalIndicators,
  'pattern': () => MARKET_METHODOLOGY.patterns,
  'fibonacci': () => MARKET_METHODOLOGY.patterns.fibonacci,
  'mtf': () => MARKET_METHODOLOGY.multiTimeframeAnalysis,
  'multi timeframe': () => MARKET_METHODOLOGY.multiTimeframeAnalysis,
  
  // Risk Management
  'risk': () => RISK_MANAGEMENT,
  'position size': () => RISK_MANAGEMENT.positionSizing,
  'lot size': () => RISK_MANAGEMENT.positionSizing.forex,
  'r multiple': () => RISK_MANAGEMENT.rMultiples,
  'kelly': () => RISK_MANAGEMENT.kelly,
  'drawdown': () => RISK_MANAGEMENT.drawdown,
  'leverage': () => RISK_MANAGEMENT.leverage,
  'stop loss': () => RISK_MANAGEMENT.tradeManagement,
  'partial': () => RISK_MANAGEMENT.tradeManagement.partials,
  'breakeven': () => RISK_MANAGEMENT.tradeManagement.breakeven,
  'prop': () => RISK_MANAGEMENT.propFirmRules,
  'funded': () => RISK_MANAGEMENT.propFirmRules,
  
  // Psychology
  'psychology': () => TRADING_PSYCHOLOGY,
  'discipline': () => TRADING_PSYCHOLOGY.corePrinciples.discipline,
  'fomo': () => TRADING_PSYCHOLOGY.cognitiveBiases.fomo,
  'revenge': () => TRADING_PSYCHOLOGY.cognitiveBiases.revenge,
  'journal': () => TRADING_PSYCHOLOGY.journaling,
  'bias': () => TRADING_PSYCHOLOGY.cognitiveBiases,
  'routine': () => TRADING_PSYCHOLOGY.routines,
  
  // Ecosystem
  'spread': () => TRADING_ECOSYSTEM.costs.spread,
  'commission': () => TRADING_ECOSYSTEM.costs.commission,
  'slippage': () => TRADING_ECOSYSTEM.costs.slippage,
  'order type': () => TRADING_ECOSYSTEM.orderTypes,
  'execution': () => TRADING_ECOSYSTEM.execution,
  'liquidity': () => TRADING_ECOSYSTEM.liquidity,
  
  // Fundamentals
  'fundamental': () => FUNDAMENTALS_MACRO,
  'central bank': () => FUNDAMENTALS_MACRO.centralBanks,
  'fed': () => FUNDAMENTALS_MACRO.centralBanks.fed,
  'fomc': () => FUNDAMENTALS_MACRO.centralBanks.fed,
  'nfp': () => FUNDAMENTALS_MACRO.economicIndicators.highImpact.nfp,
  'cpi': () => FUNDAMENTALS_MACRO.economicIndicators.highImpact.cpi,
  'yield': () => FUNDAMENTALS_MACRO.yields,
  'risk on': () => FUNDAMENTALS_MACRO.riskSentiment.riskOn,
  'risk off': () => FUNDAMENTALS_MACRO.riskSentiment.riskOff,
  
  // Derivatives
  'futures': () => DERIVATIVES_MARKETS.futures,
  'options': () => DERIVATIVES_MARKETS.options,
  'greeks': () => DERIVATIVES_MARKETS.options.greeks,
  'cfd': () => DERIVATIVES_MARKETS.cfds,
  
  // Microstructure
  'stop run': () => MICROSTRUCTURE.liquidityConcepts.stopRuns,
  'liquidity sweep': () => MICROSTRUCTURE.liquidityConcepts.liquiditySweeps,
  
  // Strategies
  'strategy': () => STRATEGY_LIBRARY,
  'breakout': () => STRATEGY_LIBRARY.breakout,
  'mean reversion': () => STRATEGY_LIBRARY.meanReversion,
  'trend following': () => STRATEGY_LIBRARY.trendFollowing,
  'pullback': () => STRATEGY_LIBRARY.pullbackContinuation,
  
  // Instruments
  'pip': () => INSTRUMENT_SPECS.forex.pipCalc,
  'forex': () => INSTRUMENT_SPECS.forex,
  'gold': () => INSTRUMENT_SPECS.metals.gold,
  'crypto': () => INSTRUMENT_SPECS.crypto,
  'indices': () => INSTRUMENT_SPECS.indices
};

/**
 * Retrieve relevant knowledge for a topic
 */
function getKnowledge(topic) {
  const normalizedTopic = topic.toLowerCase().trim();
  
  // Direct match
  if (TOPIC_MAPPINGS[normalizedTopic]) {
    return TOPIC_MAPPINGS[normalizedTopic]();
  }
  
  // Partial match
  for (const [key, getter] of Object.entries(TOPIC_MAPPINGS)) {
    if (normalizedTopic.includes(key) || key.includes(normalizedTopic)) {
      return getter();
    }
  }
  
  return null;
}

/**
 * Search knowledge base for query
 */
function searchKnowledge(query) {
  const results = [];
  const normalizedQuery = query.toLowerCase();
  const queryWords = normalizedQuery.split(/\s+/);
  
  // Search all pillars
  const allKnowledge = {
    MARKET_METHODOLOGY,
    RISK_MANAGEMENT,
    TRADING_PSYCHOLOGY,
    TRADING_ECOSYSTEM,
    FUNDAMENTALS_MACRO,
    DERIVATIVES_MARKETS,
    MICROSTRUCTURE,
    STRATEGY_LIBRARY,
    INSTRUMENT_SPECS,
    SAFETY_RULES
  };
  
  function searchObject(obj, path = '', pillar = '') {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      
      if (typeof value === 'string') {
        const score = calculateRelevance(value.toLowerCase(), queryWords);
        if (score > 0) {
          results.push({ path: currentPath, content: value, pillar, score });
        }
      } else if (typeof value === 'object' && value !== null) {
        searchObject(value, currentPath, pillar || key);
      }
    }
  }
  
  searchObject(allKnowledge);
  
  // Sort by score and return top results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function calculateRelevance(text, queryWords) {
  let score = 0;
  for (const word of queryWords) {
    if (word.length > 2 && text.includes(word)) {
      score += 1;
    }
  }
  return score;
}

// Export all knowledge and functions
module.exports = {
  // Knowledge Pillars
  MARKET_METHODOLOGY,
  RISK_MANAGEMENT,
  TRADING_PSYCHOLOGY,
  TRADING_ECOSYSTEM,
  FUNDAMENTALS_MACRO,
  DERIVATIVES_MARKETS,
  MICROSTRUCTURE,
  STRATEGY_LIBRARY,
  INSTRUMENT_SPECS,
  SAFETY_RULES,
  
  // Functions
  getKnowledge,
  searchKnowledge
};
