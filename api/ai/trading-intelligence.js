/**
 * Trading Intelligence System
 * Best-in-class market assistant with:
 * - Intent detection (why moved / bias / levels / risk / news)
 * - Instrument + timeframe normalization
 * - Live market data with session context
 * - News/macro data with deduplication
 * - Market narrative memory
 * - Trader-grade structured responses
 */

const dataService = require('./data-layer/data-service');
const { getCached, setCached } = require('../cache');

// ============================================================================
// INTENT DETECTION
// ============================================================================

const INTENT_PATTERNS = {
  WHY_MOVED: {
    patterns: [
      /why.*(mov|drop|crash|pump|spike|rally|sell.?off|dump|jump)/i,
      /what.*(happen|caus|driv|behind)/i,
      /explain.*(move|drop|rally)/i,
      /(reason|driver).*(for|behind)/i
    ],
    category: 'catalyst_analysis',
    requiresNews: true,
    requiresPrice: true
  },
  BIAS: {
    patterns: [
      /what.*(?:is|'s).*(?:bias|view|outlook|direction)/i,
      /(?:bullish|bearish|long|short).*(?:or|vs)/i,
      /should.*(?:buy|sell|long|short)/i,
      /(?:which|what).*(?:direction|way|side)/i
    ],
    category: 'directional_bias',
    requiresNews: true,
    requiresPrice: true
  },
  LEVELS: {
    patterns: [
      /(?:key|important|major).*level/i,
      /support|resistance|pivot/i,
      /where.*(?:buy|sell|enter|exit)/i,
      /(?:target|stop|entry).*(?:price|level)/i,
      /what.*(?:level|price)/i
    ],
    category: 'technical_levels',
    requiresPrice: true
  },
  RISK: {
    patterns: [
      /risk|danger|warning|caution/i,
      /what.*(?:watch|careful|avoid)/i,
      /(?:safe|dangerous).*(?:to|trade)/i,
      /position.*siz/i
    ],
    category: 'risk_assessment',
    requiresNews: true,
    requiresPrice: true
  },
  NEWS: {
    patterns: [
      /news|headline|breaking|announce/i,
      /what.*(?:said|happen|release)/i,
      /(?:fed|fomc|nfp|cpi|gdp|ecb|boe)/i,
      /economic.*(?:data|event|release)/i
    ],
    category: 'news_analysis',
    requiresNews: true
  },
  PRICE: {
    patterns: [
      /(?:what|current|live).*price/i,
      /(?:where|how).*(?:trading|trading at)/i,
      /price.*(?:now|currently)/i,
      /quote/i
    ],
    category: 'price_check',
    requiresPrice: true
  },
  ANALYSIS: {
    patterns: [
      /analy[sz]/i,
      /(?:technical|fundamental).*(?:analysis|view)/i,
      /(?:chart|price action)/i,
      /(?:tell|give).*(?:me|your).*(?:thought|analysis)/i
    ],
    category: 'full_analysis',
    requiresNews: true,
    requiresPrice: true
  }
};

// Detect user intent from message
function detectIntent(message) {
  const intents = [];
  
  for (const [intentName, config] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(message)) {
        intents.push({
          type: intentName,
          category: config.category,
          requiresNews: config.requiresNews || false,
          requiresPrice: config.requiresPrice || false,
          confidence: 0.8
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
      confidence: 0.5
    });
  }
  
  return intents;
}

// ============================================================================
// INSTRUMENT NORMALIZATION
// ============================================================================

const INSTRUMENT_ALIASES = {
  // Forex
  'EUR/USD': 'EURUSD', 'EUR USD': 'EURUSD', 'EURO': 'EURUSD', 'FIBER': 'EURUSD',
  'GBP/USD': 'GBPUSD', 'CABLE': 'GBPUSD', 'POUND': 'GBPUSD',
  'USD/JPY': 'USDJPY', 'YEN': 'USDJPY', 'GOPHER': 'USDJPY',
  'AUD/USD': 'AUDUSD', 'AUSSIE': 'AUDUSD',
  'USD/CAD': 'USDCAD', 'LOONIE': 'USDCAD',
  'USD/CHF': 'USDCHF', 'SWISSY': 'USDCHF',
  'NZD/USD': 'NZDUSD', 'KIWI': 'NZDUSD',
  
  // Commodities
  'GOLD': 'XAUUSD', 'XAU': 'XAUUSD', 'XAU/USD': 'XAUUSD',
  'SILVER': 'XAGUSD', 'XAG': 'XAGUSD', 'XAG/USD': 'XAGUSD',
  'OIL': 'USOIL', 'CRUDE': 'USOIL', 'WTI': 'USOIL', 'CL': 'USOIL',
  'BRENT': 'UKOIL',
  'NATURAL GAS': 'NATGAS', 'NG': 'NATGAS',
  
  // Crypto
  'BITCOIN': 'BTCUSD', 'BTC': 'BTCUSD', 'BTC/USD': 'BTCUSD',
  'ETHEREUM': 'ETHUSD', 'ETH': 'ETHUSD', 'ETH/USD': 'ETHUSD',
  
  // Indices
  'S&P': 'SPX500', 'S&P 500': 'SPX500', 'SP500': 'SPX500', 'SPY': 'SPX500',
  'NASDAQ': 'NAS100', 'NDX': 'NAS100', 'QQQ': 'NAS100', 'US100': 'NAS100',
  'DOW': 'US30', 'DOW JONES': 'US30', 'DJI': 'US30',
  'DAX': 'GER40', 'DAX40': 'GER40',
  'FTSE': 'UK100', 'FTSE100': 'UK100',
  'NIKKEI': 'JPN225', 'NIKKEI 225': 'JPN225',
  
  // DXY
  'DOLLAR': 'DXY', 'USD INDEX': 'DXY', 'DOLLAR INDEX': 'DXY'
};

const TIMEFRAME_ALIASES = {
  // Minutes
  '1M': 'M1', '1MIN': 'M1', '1 MIN': 'M1', '1 MINUTE': 'M1',
  '5M': 'M5', '5MIN': 'M5', '5 MIN': 'M5', '5 MINUTE': 'M5',
  '15M': 'M15', '15MIN': 'M15', '15 MIN': 'M15', '15 MINUTE': 'M15',
  '30M': 'M30', '30MIN': 'M30', '30 MIN': 'M30',
  
  // Hours
  '1H': 'H1', '1HR': 'H1', '1 HOUR': 'H1', 'HOURLY': 'H1',
  '4H': 'H4', '4HR': 'H4', '4 HOUR': 'H4',
  
  // Daily+
  '1D': 'D1', 'DAILY': 'D1', 'DAY': 'D1',
  '1W': 'W1', 'WEEKLY': 'W1', 'WEEK': 'W1',
  '1MO': 'MN', 'MONTHLY': 'MN', 'MONTH': 'MN',
  
  // Intraday terms
  'SCALP': 'M5', 'SCALPING': 'M5',
  'INTRADAY': 'H1', 'DAY TRADE': 'H1',
  'SWING': 'H4', 'SWING TRADE': 'H4'
};

function extractInstrument(message) {
  const upperMsg = message.toUpperCase();
  
  // Check aliases first
  for (const [alias, symbol] of Object.entries(INSTRUMENT_ALIASES)) {
    if (upperMsg.includes(alias)) {
      return symbol;
    }
  }
  
  // Check for standard forex pairs
  const forexMatch = upperMsg.match(/\b([A-Z]{3})\/?([A-Z]{3})\b/);
  if (forexMatch) {
    return forexMatch[1] + forexMatch[2];
  }
  
  // Check for crypto
  const cryptoMatch = upperMsg.match(/\b(BTC|ETH|SOL|XRP|ADA|DOGE)\b/);
  if (cryptoMatch) {
    return cryptoMatch[1] + 'USD';
  }
  
  // Check for stocks (all caps 1-5 letters)
  const stockMatch = upperMsg.match(/\b([A-Z]{1,5})\s*(?:stock|shares?|equity)\b/i);
  if (stockMatch) {
    return stockMatch[1];
  }
  
  return null;
}

function extractTimeframe(message) {
  const upperMsg = message.toUpperCase();
  
  for (const [alias, tf] of Object.entries(TIMEFRAME_ALIASES)) {
    if (upperMsg.includes(alias)) {
      return tf;
    }
  }
  
  // Default based on context
  if (/scalp|quick|fast/i.test(message)) return 'M5';
  if (/swing|position/i.test(message)) return 'H4';
  if (/long.?term|invest/i.test(message)) return 'D1';
  
  return 'H1'; // Default to hourly
}

function getInstrumentType(symbol) {
  if (/^(EUR|USD|GBP|JPY|AUD|NZD|CAD|CHF)/.test(symbol) && symbol.length === 6) return 'forex';
  if (/^(XAU|XAG)/.test(symbol)) return 'commodity';
  if (/(OIL|GAS|CL|NG)/.test(symbol)) return 'commodity';
  if (/BTC|ETH|SOL|XRP|ADA/.test(symbol)) return 'crypto';
  if (/SPX|NAS|US30|DAX|UK100|JPN|DXY/.test(symbol)) return 'index';
  return 'stock';
}

// ============================================================================
// MARKET SESSION CONTEXT
// ============================================================================

function getMarketSession() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay();
  
  // Weekend
  if (utcDay === 0 || utcDay === 6) {
    return {
      name: 'Weekend',
      isOpen: false,
      activeSessions: [],
      liquidity: 'none',
      volatility: 'none'
    };
  }
  
  const sessions = [];
  let liquidity = 'low';
  let volatility = 'low';
  
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
  }
  
  // New York: 13:00 - 22:00 UTC
  if (utcHour >= 13 && utcHour < 22) {
    sessions.push('New York');
    liquidity = 'high';
  }
  
  // London/NY overlap: 13:00 - 17:00 UTC (highest liquidity)
  if (utcHour >= 13 && utcHour < 17) {
    liquidity = 'very high';
    volatility = 'high';
  }
  
  return {
    name: sessions.join('/') || 'Asian',
    isOpen: true,
    activeSessions: sessions,
    liquidity,
    volatility,
    utcHour,
    timestamp: now.toISOString()
  };
}

// ============================================================================
// CATALYST RANKING & DEDUPLICATION
// ============================================================================

function rankCatalysts(news, calendar, instrument) {
  const catalysts = [];
  const seenTitles = new Set();
  
  // Process news
  if (news?.news) {
    for (const item of news.news) {
      const title = item.title?.toLowerCase() || '';
      
      // Dedupe by similarity
      const isDupe = Array.from(seenTitles).some(seen => 
        similarity(title, seen) > 0.7
      );
      
      if (!isDupe && title) {
        seenTitles.add(title);
        
        // Calculate relevance score
        let score = 50;
        
        // Boost for instrument mention
        if (title.includes(instrument?.toLowerCase()) || 
            title.includes(getInstrumentKeyword(instrument))) {
          score += 30;
        }
        
        // Boost for recency
        const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / 3600000;
        if (ageHours < 1) score += 20;
        else if (ageHours < 4) score += 10;
        
        // Boost for high-impact keywords
        if (/fed|fomc|rate|inflation|cpi|nfp|jobs|gdp/i.test(title)) score += 15;
        if (/breaking|urgent|flash/i.test(title)) score += 10;
        
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
  }
  
  // Process calendar events
  if (calendar?.events) {
    for (const event of calendar.events) {
      const title = event.title?.toLowerCase() || '';
      
      let score = 40;
      
      // Impact level
      if (event.impact === 'high') score += 30;
      else if (event.impact === 'medium') score += 15;
      
      // Currency relevance
      if (instrument && event.currency) {
        if (instrument.includes(event.currency)) score += 20;
      }
      
      // Time proximity
      const eventTime = new Date(event.time);
      const hoursUntil = (eventTime.getTime() - Date.now()) / 3600000;
      if (hoursUntil >= 0 && hoursUntil < 1) score += 25;
      else if (hoursUntil >= -1 && hoursUntil < 0) score += 30; // Just released
      
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
  
  // Sort by score descending
  catalysts.sort((a, b) => b.score - a.score);
  
  return catalysts;
}

function similarity(s1, s2) {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(s1, s2) {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) costs[j] = j;
      else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1))
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

function getInstrumentKeyword(symbol) {
  const keywords = {
    'XAUUSD': 'gold', 'EURUSD': 'euro', 'GBPUSD': 'pound',
    'USDJPY': 'yen', 'BTCUSD': 'bitcoin', 'SPX500': 's&p'
  };
  return keywords[symbol] || symbol?.toLowerCase();
}

// ============================================================================
// MARKET NARRATIVE MEMORY
// ============================================================================

class MarketNarrativeMemory {
  constructor() {
    this.dailyNarratives = new Map();
    this.weeklyThemes = [];
    this.instrumentBias = new Map();
  }
  
  // Store narrative for instrument
  storeNarrative(instrument, narrative) {
    const key = `${instrument}_${this.getDateKey()}`;
    const existing = this.dailyNarratives.get(key) || [];
    
    existing.push({
      timestamp: Date.now(),
      narrative,
      session: getMarketSession().name
    });
    
    // Keep last 10 narratives per day
    if (existing.length > 10) existing.shift();
    
    this.dailyNarratives.set(key, existing);
    
    // Cache to persistent storage
    setCached(`narrative:${key}`, existing);
  }
  
  // Get today's narrative context
  getTodayNarrative(instrument) {
    const key = `${instrument}_${this.getDateKey()}`;
    
    // Try memory first
    let narratives = this.dailyNarratives.get(key);
    
    // Try cache
    if (!narratives) {
      narratives = getCached(`narrative:${key}`, 86400000); // 24h
    }
    
    return narratives || [];
  }
  
  // Update instrument bias
  updateBias(instrument, bias, confidence) {
    const existing = this.instrumentBias.get(instrument) || {
      bullish: 0, bearish: 0, neutral: 0, lastUpdate: null
    };
    
    existing[bias] = (existing[bias] || 0) + confidence;
    existing.lastUpdate = Date.now();
    
    this.instrumentBias.set(instrument, existing);
  }
  
  // Get consensus bias
  getConsensusBias(instrument) {
    const bias = this.instrumentBias.get(instrument);
    if (!bias) return { direction: 'neutral', strength: 0 };
    
    const total = bias.bullish + bias.bearish + bias.neutral;
    if (total === 0) return { direction: 'neutral', strength: 0 };
    
    if (bias.bullish > bias.bearish && bias.bullish > bias.neutral) {
      return { direction: 'bullish', strength: bias.bullish / total };
    }
    if (bias.bearish > bias.bullish && bias.bearish > bias.neutral) {
      return { direction: 'bearish', strength: bias.bearish / total };
    }
    return { direction: 'neutral', strength: bias.neutral / total };
  }
  
  getDateKey() {
    return new Date().toISOString().slice(0, 10);
  }
  
  getWeekKey() {
    const d = new Date();
    const week = Math.ceil((d.getDate() + 6 - d.getDay()) / 7);
    return `${d.getFullYear()}-W${week}`;
  }
}

const narrativeMemory = new MarketNarrativeMemory();

// ============================================================================
// TRADER-GRADE RESPONSE GENERATOR
// ============================================================================

function buildTraderResponse(context) {
  const {
    instrument,
    timeframe,
    marketData,
    catalysts,
    session,
    intent,
    todayNarrative,
    consensusBias
  } = context;
  
  const response = {
    sections: [],
    dataLabels: [],
    confidence: 0.7
  };
  
  // 1. MAIN DRIVER
  const topCatalyst = catalysts[0];
  if (topCatalyst && topCatalyst.score > 60) {
    response.sections.push({
      title: '📌 MAIN DRIVER',
      content: formatMainDriver(topCatalyst, instrument, marketData)
    });
    response.confidence = Math.max(response.confidence, topCatalyst.confidence);
  }
  
  // 2. SUPPORTING FACTORS
  const supportingCatalysts = catalysts.slice(1, 4).filter(c => c.score > 40);
  if (supportingCatalysts.length > 0) {
    response.sections.push({
      title: '📊 SUPPORTING FACTORS',
      content: supportingCatalysts.map(c => `• ${c.title}`).join('\n')
    });
  }
  
  // 3. MARKET MECHANICS
  if (marketData?.price > 0) {
    response.sections.push({
      title: '⚙️ MECHANICS',
      content: formatMechanics(marketData, session)
    });
    response.dataLabels.push(marketData.source ? `Price: ${marketData.source}` : 'Price: cached');
  }
  
  // 4. KEY LEVELS
  if (intent.some(i => ['LEVELS', 'ANALYSIS', 'BIAS'].includes(i.type))) {
    response.sections.push({
      title: '🎯 KEY LEVELS',
      content: formatKeyLevels(marketData, instrument)
    });
  }
  
  // 5. SCENARIOS
  if (intent.some(i => ['BIAS', 'ANALYSIS', 'WHY_MOVED'].includes(i.type))) {
    response.sections.push({
      title: '📈 SCENARIOS',
      content: formatScenarios(marketData, catalysts, consensusBias)
    });
  }
  
  // 6. RISK NOTES
  response.sections.push({
    title: '⚠️ RISK NOTES',
    content: formatRiskNotes(catalysts, session, marketData)
  });
  
  // Add data source labels
  if (response.dataLabels.length > 0) {
    response.dataSourceNote = `Data sources: ${response.dataLabels.join(', ')}`;
  }
  
  return response;
}

function formatMainDriver(catalyst, instrument, marketData) {
  if (catalyst.type === 'economic') {
    let content = `${catalyst.title}`;
    if (catalyst.actual !== undefined) {
      content += `\nActual: ${catalyst.actual} | Forecast: ${catalyst.forecast} | Previous: ${catalyst.previous}`;
    }
    return content;
  }
  
  return catalyst.title;
}

function formatMechanics(marketData, session) {
  const lines = [];
  
  if (marketData.price > 0) {
    lines.push(`Current: ${formatPrice(marketData.price, marketData.symbol)}`);
    
    if (marketData.change !== undefined) {
      const direction = marketData.change >= 0 ? '▲' : '▼';
      lines.push(`Change: ${direction} ${Math.abs(marketData.change).toFixed(2)} (${marketData.changePercent}%)`);
    }
    
    if (marketData.high && marketData.low) {
      lines.push(`Day Range: ${formatPrice(marketData.low)} - ${formatPrice(marketData.high)}`);
      const range = marketData.high - marketData.low;
      const position = ((marketData.price - marketData.low) / range * 100).toFixed(0);
      lines.push(`Position in Range: ${position}%`);
    }
  }
  
  lines.push(`Session: ${session.name} (Liquidity: ${session.liquidity})`);
  
  return lines.join('\n');
}

function formatKeyLevels(marketData, instrument) {
  if (!marketData?.price || marketData.price === 0) {
    return 'Live data unavailable - check recent price action for levels';
  }
  
  const price = marketData.price;
  const atr = (marketData.high - marketData.low) || price * 0.01;
  
  const levels = [
    `Resistance 2: ${formatPrice(price + atr * 2)}`,
    `Resistance 1: ${formatPrice(price + atr)}`,
    `Current: ${formatPrice(price)}`,
    `Support 1: ${formatPrice(price - atr)}`,
    `Support 2: ${formatPrice(price - atr * 2)}`
  ];
  
  if (marketData.high && marketData.low) {
    levels.unshift(`Day High: ${formatPrice(marketData.high)}`);
    levels.push(`Day Low: ${formatPrice(marketData.low)}`);
  }
  
  return levels.join('\n');
}

function formatScenarios(marketData, catalysts, consensusBias) {
  const scenarios = [];
  
  const bias = consensusBias?.direction || 'neutral';
  const strength = consensusBias?.strength || 0;
  
  if (bias === 'bullish' || strength < 0.3) {
    scenarios.push(`📈 BULLISH: Break above ${formatPrice((marketData?.high || marketData?.price * 1.01))} targets ${formatPrice((marketData?.price || 0) * 1.02)}`);
  }
  
  if (bias === 'bearish' || strength < 0.3) {
    scenarios.push(`📉 BEARISH: Break below ${formatPrice((marketData?.low || marketData?.price * 0.99))} targets ${formatPrice((marketData?.price || 0) * 0.98)}`);
  }
  
  scenarios.push(`↔️ RANGE: Consolidation between day high/low likely if catalysts fade`);
  
  return scenarios.join('\n');
}

function formatRiskNotes(catalysts, session, marketData) {
  const risks = [];
  
  // Check for upcoming high-impact events
  const upcomingHighImpact = catalysts.filter(c => 
    c.type === 'economic' && c.impact === 'high' &&
    new Date(c.time) > new Date()
  );
  
  if (upcomingHighImpact.length > 0) {
    risks.push(`⏰ Upcoming: ${upcomingHighImpact[0].title}`);
  }
  
  // Session-based risks
  if (session.liquidity === 'low') {
    risks.push('💧 Low liquidity - wider spreads expected');
  }
  
  if (session.volatility === 'high') {
    risks.push('⚡ High volatility session - adjust position size');
  }
  
  // Price-based risks
  if (marketData?.price > 0) {
    const dayMove = Math.abs(parseFloat(marketData.changePercent) || 0);
    if (dayMove > 2) {
      risks.push(`📊 Extended move today (${dayMove}%) - reversal risk elevated`);
    }
  }
  
  if (risks.length === 0) {
    risks.push('Standard risk management applies');
  }
  
  return risks.join('\n');
}

function formatPrice(price, symbol) {
  if (!price || price === 0) return '—';
  
  // Determine decimal places based on instrument
  if (symbol?.includes('JPY')) return price.toFixed(3);
  if (symbol?.includes('XAU') || symbol?.includes('GOLD')) return price.toFixed(2);
  if (symbol?.includes('BTC')) return price.toFixed(0);
  
  return price.toFixed(4);
}

// ============================================================================
// MAIN INTELLIGENCE ENGINE
// ============================================================================

class TradingIntelligence {
  constructor() {
    this.narrativeMemory = narrativeMemory;
    this.requestCounter = 0;
  }
  
  generateRequestId() {
    return `ti_${Date.now()}_${++this.requestCounter}`;
  }
  
  async processQuery(message, options = {}) {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    console.log(`[${requestId}] Processing trading query`);
    
    try {
      // 1. Detect intent
      const intents = detectIntent(message);
      console.log(`[${requestId}] Detected intents:`, intents.map(i => i.type));
      
      // 2. Extract instrument and timeframe
      const instrument = options.instrument || extractInstrument(message);
      const timeframe = options.timeframe || extractTimeframe(message);
      const instrumentType = instrument ? getInstrumentType(instrument) : null;
      
      console.log(`[${requestId}] Instrument: ${instrument}, Timeframe: ${timeframe}`);
      
      // 3. Get market session context
      const session = getMarketSession();
      
      // 4. Fetch required data in parallel
      const needsNews = intents.some(i => i.requiresNews);
      const needsPrice = intents.some(i => i.requiresPrice);
      
      const dataPromises = [];
      
      if (needsPrice && instrument) {
        dataPromises.push(dataService.getMarketData(instrument, requestId));
      } else {
        dataPromises.push(Promise.resolve(null));
      }
      
      if (needsNews) {
        dataPromises.push(
          Promise.all([
            dataService.getNews(instrument, 'general', 10, requestId),
            dataService.getCalendar(null, null, requestId)
          ])
        );
      } else {
        dataPromises.push(Promise.resolve([{ news: [] }, { events: [] }]));
      }
      
      const [marketData, [news, calendar]] = await Promise.all(dataPromises);
      
      // 5. Rank and dedupe catalysts
      const catalysts = rankCatalysts(news, calendar, instrument);
      console.log(`[${requestId}] Found ${catalysts.length} catalysts`);
      
      // 6. Get narrative context
      const todayNarrative = instrument ? this.narrativeMemory.getTodayNarrative(instrument) : [];
      const consensusBias = instrument ? this.narrativeMemory.getConsensusBias(instrument) : null;
      
      // 7. Build trader-grade response
      const response = buildTraderResponse({
        instrument,
        instrumentType,
        timeframe,
        marketData,
        catalysts,
        session,
        intent: intents,
        todayNarrative,
        consensusBias
      });
      
      // 8. Store in narrative memory
      if (instrument && response.sections.length > 0) {
        this.narrativeMemory.storeNarrative(instrument, {
          catalysts: catalysts.slice(0, 3),
          marketData: { price: marketData?.price, change: marketData?.change }
        });
      }
      
      const duration = Date.now() - startTime;
      console.log(`[${requestId}] Completed in ${duration}ms`);
      
      return {
        success: true,
        requestId,
        instrument,
        timeframe,
        instrumentType,
        session,
        response,
        catalysts: catalysts.slice(0, 5),
        marketData,
        processingTime: duration,
        dataQuality: {
          hasPriceData: marketData?.price > 0,
          hasCatalysts: catalysts.length > 0,
          topCatalystConfidence: catalysts[0]?.confidence || 0
        }
      };
      
    } catch (error) {
      console.error(`[${requestId}] Error:`, error);
      
      return {
        success: false,
        requestId,
        error: error.message,
        fallbackResponse: {
          sections: [{
            title: '⚠️ DATA ISSUE',
            content: 'Unable to fetch complete market data. Based on general knowledge:\n' +
                     '• Check recent price action on your charting platform\n' +
                     '• Review economic calendar for scheduled events\n' +
                     '• Monitor major news sources for breaking headlines'
          }]
        },
        processingTime: Date.now() - startTime
      };
    }
  }
  
  // Format response for display
  formatForDisplay(result) {
    if (!result.success) {
      return result.fallbackResponse?.sections?.map(s => 
        `**${s.title}**\n${s.content}`
      ).join('\n\n') || 'Unable to process request';
    }
    
    let output = '';
    
    // Header
    if (result.instrument) {
      output += `## ${result.instrument} Analysis\n\n`;
    }
    
    // Sections
    for (const section of result.response.sections) {
      output += `**${section.title}**\n${section.content}\n\n`;
    }
    
    // Data source note
    if (result.response.dataSourceNote) {
      output += `\n---\n_${result.response.dataSourceNote}_\n`;
    }
    
    return output;
  }
}

// Export singleton
const tradingIntelligence = new TradingIntelligence();

module.exports = {
  tradingIntelligence,
  TradingIntelligence,
  detectIntent,
  extractInstrument,
  extractTimeframe,
  getMarketSession,
  rankCatalysts,
  narrativeMemory
};
