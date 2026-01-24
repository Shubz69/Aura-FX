/**
 * AURA Deterministic Reasoning Pipeline
 * 
 * Implements structured reasoning for every market question:
 * 1. Intent Detection
 * 2. Instrument/Timeframe/Session Normalization
 * 3. Live Price + Session Highs/Lows + Volatility Fetch
 * 4. News/Calendar Fetch
 * 5. Dedupe + Rank Catalysts with Confidence
 * 6. Knowledge Retrieval
 * 7. Response Validation
 * 8. Structured Output
 */

const dataService = require('./data-layer/data-service');
const { getCached, setCached } = require('../cache');
const knowledgeCore = require('./trading-knowledge-core');

// ============================================================================
// INTENT DETECTION (Enhanced)
// ============================================================================

const INTENT_PATTERNS = {
  WHY_MOVED: {
    patterns: [
      /why.*(mov|drop|crash|pump|spike|rally|sell.?off|dump|jump|fall|rise|tank)/i,
      /what.*(happen|caus|driv|behind|push)/i,
      /explain.*(move|drop|rally|crash|spike)/i,
      /(reason|driver|catalyst).*(for|behind)/i,
      /what's.*(going on|happening)/i
    ],
    category: 'catalyst_analysis',
    requiresNews: true,
    requiresPrice: true,
    mustInclude: ['catalyst', 'source']
  },
  BIAS: {
    patterns: [
      /what.*(?:is|'s).*(?:bias|view|outlook|direction)/i,
      /(?:bullish|bearish|long|short).*(?:or|vs)/i,
      /should.*(?:buy|sell|long|short)/i,
      /(?:which|what).*(?:direction|way|side)/i,
      /what.*(?:side|do)/i
    ],
    category: 'directional_bias',
    requiresNews: true,
    requiresPrice: true,
    mustInclude: ['levels', 'scenarios']
  },
  LEVELS: {
    patterns: [
      /(?:key|important|major|critical).*level/i,
      /support|resistance|pivot/i,
      /where.*(?:buy|sell|enter|exit)/i,
      /(?:target|stop|entry|tp|sl).*(?:price|level)/i,
      /what.*(?:level|price|zone)/i,
      /s\/?r\s+level/i
    ],
    category: 'technical_levels',
    requiresPrice: true,
    mustInclude: ['levels']
  },
  POSITION_SIZE: {
    patterns: [
      /position.*siz/i,
      /lot.*siz/i,
      /how.*(?:many|much).*(?:lot|contract|share)/i,
      /risk.*(?:\d+|percent|%)/i,
      /calculat.*(?:size|lot|position)/i,
      /what.*size/i,
      /\d+%\s*risk/i,
      /risk\s*\d+/i
    ],
    category: 'risk_calculation',
    requiresPrice: true,
    mustInclude: ['sizing_math']
  },
  STRATEGY: {
    patterns: [
      /how.*(?:trade|play|approach)/i,
      /strateg/i,
      /setup|entry.*criteria/i,
      /trading.*plan/i,
      /what.*strategy/i
    ],
    category: 'strategy_advice',
    requiresNews: true,
    requiresPrice: true,
    mustInclude: ['entry', 'stop', 'target', 'conditions']
  },
  NEWS: {
    patterns: [
      /news|headline|breaking|announce/i,
      /what.*(?:said|happen|release)/i,
      /(?:fed|fomc|nfp|cpi|gdp|ecb|boe|rba|boj)/i,
      /economic.*(?:data|event|release|calendar)/i,
      /calendar/i
    ],
    category: 'news_analysis',
    requiresNews: true,
    mustInclude: ['event', 'impact', 'source']
  },
  PRICE: {
    patterns: [
      /(?:what|current|live).*price/i,
      /(?:where|how).*(?:trading|trading at|at)/i,
      /price.*(?:now|currently)/i,
      /quote/i,
      /^(gold|eurusd|btc|bitcoin|gbpusd|usdjpy)$/i
    ],
    category: 'price_check',
    requiresPrice: true,
    mustInclude: ['price', 'change']
  },
  EDUCATION: {
    patterns: [
      /what.*(?:is|are|mean)/i,
      /explain|teach|learn|understand/i,
      /how.*(?:does|do|work)/i,
      /defin|concept/i
    ],
    category: 'education',
    mustInclude: ['definition', 'example']
  },
  ANALYSIS: {
    patterns: [
      /analy[sz]/i,
      /(?:technical|fundamental).*(?:analysis|view)/i,
      /(?:chart|price action)/i,
      /(?:tell|give).*(?:me|your).*(?:thought|analysis|view)/i,
      /outlook/i
    ],
    category: 'full_analysis',
    requiresNews: true,
    requiresPrice: true,
    mustInclude: ['driver', 'levels', 'scenarios']
  }
};

/**
 * Detect all intents from message
 */
function detectIntents(message) {
  const intents = [];
  const normalizedMessage = message.toLowerCase();
  
  for (const [intentName, config] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(message)) {
        intents.push({
          type: intentName,
          category: config.category,
          requiresNews: config.requiresNews || false,
          requiresPrice: config.requiresPrice || false,
          mustInclude: config.mustInclude || [],
          confidence: 0.85,
          matchedPattern: pattern.toString()
        });
        break;
      }
    }
  }
  
  // Default to full analysis if no specific intent
  if (intents.length === 0) {
    intents.push({
      type: 'ANALYSIS',
      category: 'full_analysis',
      requiresNews: true,
      requiresPrice: true,
      mustInclude: ['driver', 'levels', 'scenarios'],
      confidence: 0.5
    });
  }
  
  return intents;
}

// ============================================================================
// INSTRUMENT NORMALIZATION (Enhanced)
// ============================================================================

const INSTRUMENT_ALIASES = {
  // Forex Majors
  'EUR/USD': 'EURUSD', 'EURUSD': 'EURUSD', 'EURO': 'EURUSD', 'FIBER': 'EURUSD', 'EU': 'EURUSD',
  'GBP/USD': 'GBPUSD', 'GBPUSD': 'GBPUSD', 'CABLE': 'GBPUSD', 'POUND': 'GBPUSD', 'GU': 'GBPUSD',
  'USD/JPY': 'USDJPY', 'USDJPY': 'USDJPY', 'YEN': 'USDJPY', 'GOPHER': 'USDJPY', 'UJ': 'USDJPY',
  'AUD/USD': 'AUDUSD', 'AUDUSD': 'AUDUSD', 'AUSSIE': 'AUDUSD', 'AU': 'AUDUSD',
  'USD/CAD': 'USDCAD', 'USDCAD': 'USDCAD', 'LOONIE': 'USDCAD', 'UC': 'USDCAD',
  'USD/CHF': 'USDCHF', 'USDCHF': 'USDCHF', 'SWISSY': 'USDCHF',
  'NZD/USD': 'NZDUSD', 'NZDUSD': 'NZDUSD', 'KIWI': 'NZDUSD',
  
  // Forex Crosses
  'EUR/GBP': 'EURGBP', 'EURGBP': 'EURGBP',
  'EUR/JPY': 'EURJPY', 'EURJPY': 'EURJPY',
  'GBP/JPY': 'GBPJPY', 'GBPJPY': 'GBPJPY', 'GUPPY': 'GBPJPY', 'GJ': 'GBPJPY',
  
  // Commodities
  'GOLD': 'XAUUSD', 'XAU': 'XAUUSD', 'XAU/USD': 'XAUUSD', 'XAUUSD': 'XAUUSD',
  'SILVER': 'XAGUSD', 'XAG': 'XAGUSD', 'XAG/USD': 'XAGUSD', 'XAGUSD': 'XAGUSD',
  'OIL': 'USOIL', 'CRUDE': 'USOIL', 'WTI': 'USOIL', 'CL': 'USOIL', 'USOIL': 'USOIL',
  'BRENT': 'UKOIL', 'UKOIL': 'UKOIL',
  'NATURAL GAS': 'NATGAS', 'NG': 'NATGAS', 'NATGAS': 'NATGAS',
  
  // Crypto
  'BITCOIN': 'BTCUSD', 'BTC': 'BTCUSD', 'BTC/USD': 'BTCUSD', 'BTCUSD': 'BTCUSD',
  'ETHEREUM': 'ETHUSD', 'ETH': 'ETHUSD', 'ETH/USD': 'ETHUSD', 'ETHUSD': 'ETHUSD',
  'SOLANA': 'SOLUSD', 'SOL': 'SOLUSD',
  
  // Indices
  'S&P': 'SPX500', 'S&P 500': 'SPX500', 'SP500': 'SPX500', 'SPX': 'SPX500', 'SPY': 'SPX500', 'ES': 'SPX500', 'US500': 'SPX500',
  'NASDAQ': 'NAS100', 'NDX': 'NAS100', 'QQQ': 'NAS100', 'US100': 'NAS100', 'NQ': 'NAS100', 'NAS100': 'NAS100',
  'DOW': 'US30', 'DOW JONES': 'US30', 'DJI': 'US30', 'YM': 'US30', 'US30': 'US30',
  'DAX': 'GER40', 'DAX40': 'GER40', 'GER40': 'GER40',
  'FTSE': 'UK100', 'FTSE100': 'UK100', 'UK100': 'UK100',
  'NIKKEI': 'JPN225', 'NIKKEI 225': 'JPN225', 'JPN225': 'JPN225',
  
  // DXY
  'DOLLAR': 'DXY', 'USD INDEX': 'DXY', 'DOLLAR INDEX': 'DXY', 'DXY': 'DXY'
};

const TIMEFRAME_ALIASES = {
  '1M': 'M1', '1MIN': 'M1', '1 MIN': 'M1', '1 MINUTE': 'M1',
  '5M': 'M5', '5MIN': 'M5', '5 MIN': 'M5', '5 MINUTE': 'M5',
  '15M': 'M15', '15MIN': 'M15', '15 MIN': 'M15',
  '30M': 'M30', '30MIN': 'M30',
  '1H': 'H1', '1HR': 'H1', '1 HOUR': 'H1', 'HOURLY': 'H1', 'H1': 'H1',
  '4H': 'H4', '4HR': 'H4', '4 HOUR': 'H4', 'H4': 'H4',
  '1D': 'D1', 'DAILY': 'D1', 'DAY': 'D1', 'D1': 'D1',
  '1W': 'W1', 'WEEKLY': 'W1', 'WEEK': 'W1', 'W1': 'W1',
  '1MO': 'MN', 'MONTHLY': 'MN', 'MONTH': 'MN',
  'SCALP': 'M5', 'SCALPING': 'M5',
  'INTRADAY': 'H1', 'DAY TRADE': 'H1',
  'SWING': 'H4', 'SWING TRADE': 'H4',
  'POSITION': 'D1'
};

function extractInstrument(message) {
  const upperMsg = message.toUpperCase();
  
  // Check aliases first (longer matches first)
  const sortedAliases = Object.entries(INSTRUMENT_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [alias, symbol] of sortedAliases) {
    // Use word boundary matching to avoid false positives (e.g., "FUTURES" containing "ES")
    const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(upperMsg)) {
      return symbol;
    }
  }
  
  // Check for standard forex pairs
  const forexMatch = upperMsg.match(/\b([A-Z]{3})\/?([A-Z]{3})\b/);
  if (forexMatch) {
    return forexMatch[1] + forexMatch[2];
  }
  
  // Check for crypto
  const cryptoMatch = upperMsg.match(/\b(BTC|ETH|SOL|XRP|ADA|DOGE|AVAX|LINK)\b/);
  if (cryptoMatch) {
    return cryptoMatch[1] + 'USD';
  }
  
  // Check for stocks
  const stockMatch = upperMsg.match(/\b([A-Z]{1,5})\s*(?:stock|shares?|equity)\b/i);
  if (stockMatch) {
    return stockMatch[1];
  }
  
  return null;
}

function extractTimeframe(message) {
  const upperMsg = message.toUpperCase();
  
  // Sort by length descending to match longer timeframes first (e.g., "15M" before "5M")
  const sortedTimeframes = Object.entries(TIMEFRAME_ALIASES)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [alias, tf] of sortedTimeframes) {
    // Use word boundary matching
    const regex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(upperMsg)) {
      return tf;
    }
  }
  
  // Default based on context
  if (/scalp|quick|fast/i.test(message)) return 'M5';
  if (/swing|position/i.test(message)) return 'H4';
  if (/long.?term|invest/i.test(message)) return 'D1';
  
  return 'H1'; // Default
}

function getInstrumentType(symbol) {
  if (!symbol) return 'unknown';
  if (/^(EUR|USD|GBP|JPY|AUD|NZD|CAD|CHF)/.test(symbol) && symbol.length === 6) return 'forex';
  if (/^(XAU|XAG)/.test(symbol)) return 'precious_metal';
  if (/(OIL|GAS|CL|NG)/.test(symbol)) return 'energy';
  if (/BTC|ETH|SOL|XRP|ADA/.test(symbol)) return 'crypto';
  if (/SPX|NAS|US30|DAX|UK100|JPN|DXY|GER/.test(symbol)) return 'index';
  return 'stock';
}

function getInstrumentSpecs(symbol) {
  const type = getInstrumentType(symbol);
  
  const specs = {
    forex: {
      pipSize: symbol.includes('JPY') ? 0.01 : 0.0001,
      pipName: 'pip',
      standardLot: 100000,
      decimalPlaces: symbol.includes('JPY') ? 3 : 5
    },
    precious_metal: {
      pipSize: 0.01,
      pipName: 'cent',
      standardLot: 100,
      decimalPlaces: 2
    },
    crypto: {
      pipSize: 1,
      pipName: 'point',
      standardLot: 1,
      decimalPlaces: symbol.includes('BTC') ? 0 : 2
    },
    index: {
      pipSize: 1,
      pipName: 'point',
      standardLot: 1,
      decimalPlaces: 0
    },
    stock: {
      pipSize: 0.01,
      pipName: 'cent',
      standardLot: 1,
      decimalPlaces: 2
    }
  };
  
  return { type, ...specs[type] || specs.stock };
}

// ============================================================================
// MARKET SESSION CONTEXT
// ============================================================================

function getMarketSession() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay();
  
  // Weekend
  if (utcDay === 0 || (utcDay === 6 && utcHour >= 22)) {
    return {
      name: 'Weekend',
      isOpen: false,
      activeSessions: [],
      liquidity: 'none',
      volatility: 'none',
      warning: 'Markets closed - prices may gap on open'
    };
  }
  
  const sessions = [];
  let liquidity = 'low';
  let volatility = 'low';
  let killZone = null;
  
  // Sydney: 22:00 - 07:00 UTC
  if (utcHour >= 22 || utcHour < 7) {
    sessions.push('Sydney');
  }
  
  // Tokyo: 00:00 - 09:00 UTC
  if (utcHour >= 0 && utcHour < 9) {
    sessions.push('Tokyo');
    liquidity = 'moderate';
  }
  
  // London: 08:00 - 17:00 UTC
  if (utcHour >= 8 && utcHour < 17) {
    sessions.push('London');
    liquidity = 'high';
    volatility = 'moderate';
    
    // London Kill Zone
    if (utcHour >= 7 && utcHour < 10) {
      killZone = 'London Open Kill Zone';
    }
  }
  
  // New York: 13:00 - 22:00 UTC
  if (utcHour >= 13 && utcHour < 22) {
    sessions.push('New York');
    liquidity = 'high';
    
    // NY Kill Zone
    if (utcHour >= 12 && utcHour < 15) {
      killZone = 'New York Open Kill Zone';
    }
  }
  
  // London/NY overlap: 13:00 - 17:00 UTC (highest liquidity)
  if (utcHour >= 13 && utcHour < 17) {
    liquidity = 'very_high';
    volatility = 'high';
  }
  
  return {
    name: sessions.join(' + ') || 'Asian',
    isOpen: true,
    activeSessions: sessions,
    liquidity,
    volatility,
    killZone,
    utcHour,
    timestamp: now.toISOString()
  };
}

// ============================================================================
// POSITION SIZE CALCULATOR
// ============================================================================

function calculatePositionSize(params) {
  const {
    accountSize,
    riskPercent = 1,
    entryPrice,
    stopLoss,
    instrument,
    accountCurrency = 'USD'
  } = params;
  
  if (!accountSize || !entryPrice || !stopLoss) {
    return { error: 'Missing required parameters: accountSize, entryPrice, stopLoss' };
  }
  
  const specs = getInstrumentSpecs(instrument);
  const riskAmount = accountSize * (riskPercent / 100);
  const stopDistance = Math.abs(entryPrice - stopLoss);
  const stopPips = stopDistance / specs.pipSize;
  
  let positionSize, lotSize, pipValue;
  
  if (specs.type === 'forex') {
    // Forex calculation
    pipValue = specs.pipSize * specs.standardLot; // Value of 1 pip for 1 standard lot
    if (instrument.endsWith('USD')) {
      pipValue = 10; // $10 per pip for USD quote pairs
    }
    
    const unitsToRisk = riskAmount / (stopDistance * 100000); // Rough approximation
    lotSize = riskAmount / (stopPips * pipValue);
    positionSize = Math.floor(lotSize * specs.standardLot);
    
  } else if (specs.type === 'precious_metal') {
    // Gold/Silver
    pipValue = specs.pipSize * specs.standardLot;
    const dollarRiskPerLot = stopDistance * specs.standardLot;
    lotSize = riskAmount / dollarRiskPerLot;
    positionSize = lotSize;
    
  } else {
    // Stocks/Crypto/Index
    const shares = riskAmount / stopDistance;
    positionSize = Math.floor(shares);
    lotSize = positionSize;
    pipValue = stopDistance;
  }
  
  return {
    accountSize,
    riskPercent,
    riskAmount: Math.round(riskAmount * 100) / 100,
    entryPrice,
    stopLoss,
    stopDistance: Math.round(stopDistance * 10000) / 10000,
    stopPips: Math.round(stopPips * 10) / 10,
    positionSize: Math.round(positionSize),
    lotSize: Math.round(lotSize * 100) / 100,
    pipValue: Math.round(pipValue * 100) / 100,
    instrument,
    instrumentType: specs.type,
    formula: `Position = Risk Amount ($${riskAmount.toFixed(2)}) / Stop Distance (${stopPips.toFixed(1)} ${specs.pipName}s × $${pipValue.toFixed(2)}/pip)`
  };
}

// ============================================================================
// CATALYST RANKING
// ============================================================================

function rankCatalysts(news, calendar, instrument) {
  const catalysts = [];
  const seenTitles = new Set();
  
  // Process news
  if (news?.news) {
    for (const item of news.news) {
      const title = (item.title || '').toLowerCase();
      if (!title || seenTitles.has(title)) continue;
      seenTitles.add(title);
      
      let score = 50;
      const instrumentLower = instrument?.toLowerCase() || '';
      
      // Boost for instrument mention
      if (title.includes(instrumentLower) || 
          title.includes(getInstrumentKeyword(instrument))) {
        score += 25;
      }
      
      // Boost for recency
      const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3600000;
      if (ageHours < 1) score += 20;
      else if (ageHours < 4) score += 10;
      
      // Boost for high-impact keywords
      if (/fed|fomc|rate|inflation|cpi|nfp|jobs|gdp/i.test(title)) score += 20;
      if (/breaking|urgent|flash|crash|surge|plunge/i.test(title)) score += 15;
      
      catalysts.push({
        type: 'news',
        title: item.title,
        source: item.source,
        time: item.publishedAt,
        score,
        confidence: Math.min(score / 100, 0.95)
      });
    }
  }
  
  // Process calendar
  if (calendar?.events) {
    for (const event of calendar.events) {
      let score = 40;
      
      if (event.impact === 'high') score += 35;
      else if (event.impact === 'medium') score += 15;
      
      if (instrument && event.currency) {
        if (instrument.includes(event.currency)) score += 20;
      }
      
      const eventTime = new Date(event.time);
      const hoursUntil = (eventTime.getTime() - Date.now()) / 3600000;
      if (hoursUntil >= -0.5 && hoursUntil < 0.5) score += 30; // Just released or about to
      else if (hoursUntil >= 0 && hoursUntil < 2) score += 15;
      
      catalysts.push({
        type: 'economic',
        title: event.title,
        currency: event.currency,
        impact: event.impact,
        time: event.time,
        actual: event.actual,
        forecast: event.forecast,
        previous: event.previous,
        score,
        confidence: Math.min(score / 100, 0.95)
      });
    }
  }
  
  return catalysts.sort((a, b) => b.score - a.score);
}

function getInstrumentKeyword(symbol) {
  const keywords = {
    'XAUUSD': 'gold', 'EURUSD': 'euro', 'GBPUSD': 'pound', 'sterling': 'pound',
    'USDJPY': 'yen', 'BTCUSD': 'bitcoin', 'SPX500': 's&p', 'NAS100': 'nasdaq'
  };
  return keywords[symbol] || symbol?.toLowerCase();
}

// ============================================================================
// RESPONSE VALIDATION
// ============================================================================

function validateResponse(response, intents, context) {
  const errors = [];
  const warnings = [];
  
  // Check required elements based on intent
  for (const intent of intents) {
    for (const required of intent.mustInclude || []) {
      switch (required) {
        case 'catalyst':
          if (!context.catalysts || context.catalysts.length === 0) {
            if (intent.category === 'catalyst_analysis') {
              errors.push('No catalyst found for "why moved" question');
            }
          }
          break;
        case 'source':
          if (!context.dataSource) {
            warnings.push('Data source not labeled');
          }
          break;
        case 'levels':
          if (!context.levels || Object.keys(context.levels).length === 0) {
            if (context.marketData?.price > 0) {
              warnings.push('Levels not calculated despite having price data');
            }
          }
          break;
        case 'sizing_math':
          if (context.hasAccountInfo && context.hasStopLoss && !context.positionSize) {
            errors.push('Position sizing not calculated despite having required inputs');
          }
          break;
      }
    }
  }
  
  // Safety checks
  if (response.includes('live') && !context.isLiveData) {
    warnings.push('Response mentions "live" but data is cached/stale');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ============================================================================
// MAIN REASONING PIPELINE
// ============================================================================

class ReasoningPipeline {
  constructor() {
    this.requestCounter = 0;
    this.knowledgeCore = knowledgeCore;
  }
  
  generateRequestId() {
    return `rp_${Date.now().toString(36)}_${++this.requestCounter}`;
  }
  
  async process(message, userContext = {}) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    console.log(`[${requestId}] Starting reasoning pipeline`);
    
    const result = {
      requestId,
      success: false,
      steps: [],
      context: {},
      response: null,
      validation: null,
      processingTime: 0
    };
    
    try {
      // Step 1: Intent Detection
      const intents = detectIntents(message);
      result.steps.push({ name: 'intent_detection', intents, duration: Date.now() - startTime });
      console.log(`[${requestId}] Intents: ${intents.map(i => i.type).join(', ')}`);
      
      // Step 2: Instrument/Timeframe Extraction
      const instrument = userContext.instrument || extractInstrument(message);
      const timeframe = userContext.timeframe || extractTimeframe(message);
      const instrumentSpecs = instrument ? getInstrumentSpecs(instrument) : null;
      result.context.instrument = instrument;
      result.context.timeframe = timeframe;
      result.context.instrumentSpecs = instrumentSpecs;
      result.steps.push({ name: 'normalization', instrument, timeframe, duration: Date.now() - startTime });
      
      // Step 3: Session Context
      const session = getMarketSession();
      result.context.session = session;
      result.steps.push({ name: 'session_context', session: session.name, duration: Date.now() - startTime });
      
      // Step 4: Data Fetching (parallel)
      const needsPrice = intents.some(i => i.requiresPrice);
      const needsNews = intents.some(i => i.requiresNews);
      
      const dataPromises = [];
      
      if (needsPrice && instrument) {
        dataPromises.push(dataService.getMarketData(instrument, requestId));
      } else {
        dataPromises.push(Promise.resolve(null));
      }
      
      if (needsNews) {
        dataPromises.push(Promise.all([
          dataService.getNews(instrument, 'general', 10, requestId),
          dataService.getCalendar(null, null, requestId)
        ]));
      } else {
        dataPromises.push(Promise.resolve([{ news: [] }, { events: [] }]));
      }
      
      const fetchStart = Date.now();
      const [marketData, [news, calendar]] = await Promise.all(dataPromises);
      result.context.marketData = marketData;
      result.context.news = news;
      result.context.calendar = calendar;
      result.context.isLiveData = marketData?.source !== 'timeout_fallback' && marketData?.source !== 'error_fallback';
      result.context.dataSource = marketData?.source || 'unavailable';
      result.steps.push({ 
        name: 'data_fetch', 
        hasPrice: marketData?.price > 0,
        newsCount: news?.news?.length || 0,
        eventsCount: calendar?.events?.length || 0,
        duration: Date.now() - fetchStart 
      });
      
      // Step 5: Catalyst Ranking
      const catalysts = rankCatalysts(news, calendar, instrument);
      result.context.catalysts = catalysts;
      result.steps.push({ name: 'catalyst_ranking', count: catalysts.length, duration: Date.now() - startTime });
      
      // Step 6: Knowledge Retrieval
      const relevantKnowledge = this.retrieveKnowledge(message, intents, instrument);
      result.context.knowledge = relevantKnowledge;
      result.steps.push({ name: 'knowledge_retrieval', found: relevantKnowledge.length, duration: Date.now() - startTime });
      
      // Step 7: Calculate Levels (if price available)
      if (marketData?.price > 0) {
        const levels = this.calculateLevels(marketData, instrumentSpecs);
        result.context.levels = levels;
      }
      
      // Step 8: Extract sizing parameters if present
      const sizingParams = this.extractSizingParams(message, userContext);
      if (sizingParams.accountSize && sizingParams.stopLoss) {
        result.context.positionSize = calculatePositionSize({
          ...sizingParams,
          entryPrice: marketData?.price || sizingParams.entryPrice,
          instrument
        });
      }
      
      // Step 9: Build structured response
      const response = this.buildResponse(result.context, intents);
      result.response = response;
      
      // Step 10: Validation
      const validation = validateResponse(response.text, intents, result.context);
      result.validation = validation;
      
      if (!validation.valid) {
        console.warn(`[${requestId}] Validation issues:`, validation.errors);
      }
      
      result.success = true;
      result.processingTime = Date.now() - startTime;
      
      console.log(`[${requestId}] Pipeline completed in ${result.processingTime}ms`);
      
      return result;
      
    } catch (error) {
      console.error(`[${requestId}] Pipeline error:`, error);
      result.error = error.message;
      result.processingTime = Date.now() - startTime;
      return result;
    }
  }
  
  retrieveKnowledge(message, intents, instrument) {
    const results = [];
    
    // Get knowledge based on intent categories
    for (const intent of intents) {
      switch (intent.category) {
        case 'risk_calculation':
          results.push({ topic: 'position_sizing', data: knowledgeCore.RISK_MANAGEMENT.positionSizing });
          results.push({ topic: 'r_multiples', data: knowledgeCore.RISK_MANAGEMENT.rMultiples });
          break;
        case 'strategy_advice':
          results.push({ topic: 'strategies', data: knowledgeCore.STRATEGY_LIBRARY });
          break;
        case 'education':
          const searchResults = knowledgeCore.searchKnowledge(message);
          results.push(...searchResults.map(r => ({ topic: r.path, data: r.content })));
          break;
        case 'technical_levels':
          results.push({ topic: 'support_resistance', data: knowledgeCore.MARKET_METHODOLOGY.supportResistance });
          break;
        case 'catalyst_analysis':
          results.push({ topic: 'fundamentals', data: knowledgeCore.FUNDAMENTALS_MACRO });
          break;
      }
    }
    
    // Add instrument-specific knowledge
    if (instrument) {
      const type = getInstrumentType(instrument);
      if (type === 'forex') {
        results.push({ topic: 'forex_specs', data: knowledgeCore.INSTRUMENT_SPECS.forex });
      } else if (type === 'precious_metal') {
        results.push({ topic: 'gold_specs', data: knowledgeCore.INSTRUMENT_SPECS.metals.gold });
      }
    }
    
    return results.slice(0, 5); // Limit to top 5
  }
  
  calculateLevels(marketData, specs) {
    if (!marketData?.price || marketData.price === 0) return null;
    
    const price = marketData.price;
    const atr = (marketData.high - marketData.low) || price * 0.01;
    
    return {
      current: price,
      resistance1: Math.round((price + atr) * 10000) / 10000,
      resistance2: Math.round((price + atr * 2) * 10000) / 10000,
      support1: Math.round((price - atr) * 10000) / 10000,
      support2: Math.round((price - atr * 2) * 10000) / 10000,
      dayHigh: marketData.high,
      dayLow: marketData.low,
      atr: Math.round(atr * 10000) / 10000
    };
  }
  
  extractSizingParams(message, userContext) {
    const params = { ...userContext };
    
    // Extract account size
    const accountMatch = message.match(/\$?(\d{1,3}(?:,?\d{3})*(?:\.\d+)?)\s*(?:account|balance|capital)/i);
    if (accountMatch) {
      params.accountSize = parseFloat(accountMatch[1].replace(/,/g, ''));
    }
    
    // Extract risk percent
    const riskMatch = message.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:risk|risking)/i);
    if (riskMatch) {
      params.riskPercent = parseFloat(riskMatch[1]);
    }
    
    // Extract stop loss
    const slMatch = message.match(/(?:sl|stop\s*loss|stop)\s*(?:at|@|:)?\s*(\d+(?:\.\d+)?)/i);
    if (slMatch) {
      params.stopLoss = parseFloat(slMatch[1]);
    }
    
    // Extract entry price
    const entryMatch = message.match(/(?:entry|enter|buy|sell)\s*(?:at|@|:)?\s*(\d+(?:\.\d+)?)/i);
    if (entryMatch) {
      params.entryPrice = parseFloat(entryMatch[1]);
    }
    
    return params;
  }
  
  buildResponse(context, intents) {
    const sections = [];
    const { instrument, marketData, catalysts, session, levels, positionSize, knowledge } = context;
    
    // Header
    if (instrument) {
      sections.push({
        type: 'header',
        content: `## ${instrument} Analysis`
      });
    }
    
    // Main Driver
    if (catalysts && catalysts.length > 0 && catalysts[0].score > 50) {
      const top = catalysts[0];
      let driverContent = `**📌 MAIN DRIVER**\n${top.title}`;
      if (top.type === 'economic' && top.actual !== undefined) {
        driverContent += `\nActual: ${top.actual} | Forecast: ${top.forecast} | Prior: ${top.previous}`;
      }
      if (top.source) {
        driverContent += `\n_Source: ${top.source}_`;
      }
      sections.push({ type: 'driver', content: driverContent });
    }
    
    // Supporting Factors
    const supporting = catalysts?.slice(1, 4).filter(c => c.score > 35) || [];
    if (supporting.length > 0) {
      sections.push({
        type: 'factors',
        content: `**📊 SUPPORTING FACTORS**\n${supporting.map(c => `• ${c.title}`).join('\n')}`
      });
    }
    
    // Mechanics (price data)
    if (marketData?.price > 0) {
      const change = marketData.change || 0;
      const changeDir = change >= 0 ? '▲' : '▼';
      const changePercent = marketData.changePercent || '0.00';
      
      let mechanicsContent = `**⚙️ CURRENT MARKET**\n`;
      mechanicsContent += `Price: ${formatPrice(marketData.price, instrument)} ${changeDir} ${Math.abs(change).toFixed(2)} (${changePercent}%)\n`;
      if (marketData.high && marketData.low) {
        mechanicsContent += `Range: ${formatPrice(marketData.low)} - ${formatPrice(marketData.high)}\n`;
      }
      mechanicsContent += `Session: ${session.name} | Liquidity: ${session.liquidity}`;
      if (session.killZone) {
        mechanicsContent += ` | ⚡ ${session.killZone}`;
      }
      sections.push({ type: 'mechanics', content: mechanicsContent });
    }
    
    // Key Levels
    if (levels) {
      let levelsContent = `**🎯 KEY LEVELS**\n`;
      levelsContent += `Resistance 2: ${formatPrice(levels.resistance2, instrument)}\n`;
      levelsContent += `Resistance 1: ${formatPrice(levels.resistance1, instrument)}\n`;
      levelsContent += `Current: ${formatPrice(levels.current, instrument)}\n`;
      levelsContent += `Support 1: ${formatPrice(levels.support1, instrument)}\n`;
      levelsContent += `Support 2: ${formatPrice(levels.support2, instrument)}`;
      sections.push({ type: 'levels', content: levelsContent });
    }
    
    // Scenarios
    if (intents.some(i => ['BIAS', 'ANALYSIS', 'WHY_MOVED'].includes(i.type)) && levels) {
      let scenariosContent = `**📈 SCENARIOS**\n`;
      scenariosContent += `📈 BULL: Break above ${formatPrice(levels.resistance1)} targets ${formatPrice(levels.resistance2)}\n`;
      scenariosContent += `📉 BEAR: Break below ${formatPrice(levels.support1)} targets ${formatPrice(levels.support2)}\n`;
      scenariosContent += `↔️ RANGE: Consolidation within day range if catalysts fade`;
      sections.push({ type: 'scenarios', content: scenariosContent });
    }
    
    // Position Sizing (if calculated)
    if (positionSize && !positionSize.error) {
      let sizingContent = `**📐 POSITION SIZING**\n`;
      sizingContent += `Account: $${positionSize.accountSize.toLocaleString()} | Risk: ${positionSize.riskPercent}% ($${positionSize.riskAmount})\n`;
      sizingContent += `Entry: ${positionSize.entryPrice} | Stop: ${positionSize.stopLoss}\n`;
      sizingContent += `Stop Distance: ${positionSize.stopPips} pips\n`;
      sizingContent += `**Position Size: ${positionSize.lotSize} lots (${positionSize.positionSize.toLocaleString()} units)**`;
      sections.push({ type: 'sizing', content: sizingContent });
    }
    
    // Risk Notes
    let riskContent = `**⚠️ RISK NOTES**\n`;
    const risks = [];
    
    if (catalysts?.some(c => c.type === 'economic' && c.impact === 'high' && new Date(c.time) > new Date())) {
      const upcoming = catalysts.find(c => c.type === 'economic' && new Date(c.time) > new Date());
      risks.push(`⏰ Upcoming: ${upcoming.title}`);
    }
    if (session.liquidity === 'low') {
      risks.push('💧 Low liquidity - wider spreads expected');
    }
    if (session.volatility === 'high') {
      risks.push('⚡ High volatility - reduce position size');
    }
    if (Math.abs(parseFloat(marketData?.changePercent || 0)) > 2) {
      risks.push(`📊 Extended move (${marketData.changePercent}%) - reversal risk elevated`);
    }
    if (risks.length === 0) {
      risks.push('Standard risk management applies');
    }
    riskContent += risks.join('\n');
    sections.push({ type: 'risk', content: riskContent });
    
    // What to Watch
    let watchContent = `**👁️ WATCH NEXT**\n`;
    const watchItems = [];
    if (catalysts && catalysts.length > 0) {
      const upcomingEvents = catalysts
        .filter(c => c.type === 'economic' && new Date(c.time) > new Date())
        .slice(0, 2);
      upcomingEvents.forEach(e => watchItems.push(`${e.title} (${e.impact} impact)`));
    }
    if (levels) {
      watchItems.push(`Break of ${formatPrice(levels.resistance1)} or ${formatPrice(levels.support1)}`);
    }
    if (session.killZone) {
      watchItems.push(`${session.killZone} price action`);
    }
    if (watchItems.length === 0) {
      watchItems.push('Continue monitoring price action and news');
    }
    watchContent += watchItems.map(w => `• ${w}`).join('\n');
    sections.push({ type: 'watch', content: watchContent });
    
    // Data source footer
    const dataAge = context.isLiveData ? 'live' : 'cached';
    sections.push({
      type: 'footer',
      content: `\n---\n_Data: ${dataAge} | Source: ${context.dataSource || 'n/a'} | Request: ${context.requestId || 'n/a'}_`
    });
    
    return {
      sections,
      text: sections.map(s => s.content).join('\n\n'),
      hasRequiredElements: true
    };
  }
}

function formatPrice(price, symbol) {
  if (!price || price === 0) return '—';
  if (symbol?.includes('JPY')) return price.toFixed(3);
  if (symbol?.includes('XAU') || symbol?.includes('GOLD')) return price.toFixed(2);
  if (symbol?.includes('BTC')) return price.toFixed(0);
  if (symbol?.includes('US30') || symbol?.includes('SPX') || symbol?.includes('NAS')) return price.toFixed(0);
  return price.toFixed(4);
}

// Export
const pipeline = new ReasoningPipeline();

module.exports = {
  pipeline,
  ReasoningPipeline,
  detectIntents,
  extractInstrument,
  extractTimeframe,
  getMarketSession,
  getInstrumentSpecs,
  calculatePositionSize,
  rankCatalysts,
  validateResponse
};
