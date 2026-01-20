// Tool Router - Intelligent routing system for AI agent
// Determines which tools to call based on user intent

const detectIntent = (message, conversationHistory = []) => {
  const lowerMessage = message.toLowerCase();
  const intents = {
    marketAnalysis: false,
    technical: false,
    fundamentals: false,
    risk: false,
    education: false,
    imageUpload: false,
    brokerScreenshot: false,
    strategyRules: false,
    voiceConversation: false,
    tradeRequest: false,
    priceQuery: false,
    newsQuery: false,
    calendarQuery: false
  };

  // Market analysis intent
  if (lowerMessage.includes('analyze') || lowerMessage.includes('analysis') || 
      lowerMessage.includes('outlook') || lowerMessage.includes('where will') ||
      lowerMessage.includes('what will') || lowerMessage.includes('direction')) {
    intents.marketAnalysis = true;
  }

  // Technical analysis
  if (lowerMessage.includes('technical') || lowerMessage.includes('chart') ||
      lowerMessage.includes('support') || lowerMessage.includes('resistance') ||
      lowerMessage.includes('trend') || lowerMessage.includes('pattern')) {
    intents.technical = true;
  }

  // Fundamentals
  if (lowerMessage.includes('news') || lowerMessage.includes('event') ||
      lowerMessage.includes('economic') || lowerMessage.includes('nfp') ||
      lowerMessage.includes('cpi') || lowerMessage.includes('fed') ||
      lowerMessage.includes('central bank')) {
    intents.fundamentals = true;
  }

  // Risk management
  if (lowerMessage.includes('risk') || lowerMessage.includes('position size') ||
      lowerMessage.includes('stop loss') || lowerMessage.includes('take profit') ||
      lowerMessage.includes('margin') || lowerMessage.includes('leverage')) {
    intents.risk = true;
  }

  // Education
  if (lowerMessage.includes('what is') || lowerMessage.includes('how does') ||
      lowerMessage.includes('explain') || lowerMessage.includes('teach') ||
      lowerMessage.includes('learn')) {
    intents.education = true;
  }

  // Trade request
  if (lowerMessage.includes('trade') || lowerMessage.includes('setup') ||
      lowerMessage.includes('entry') || lowerMessage.includes('give me a trade')) {
    intents.tradeRequest = true;
  }

  // Price query
  if (lowerMessage.includes('price') || lowerMessage.includes('current') ||
      lowerMessage.includes('what is') && (lowerMessage.includes('trading at') ||
      lowerMessage.includes('at now'))) {
    intents.priceQuery = true;
  }

  // News query
  if (lowerMessage.includes('news') || lowerMessage.includes('what happened') ||
      lowerMessage.includes('breaking')) {
    intents.newsQuery = true;
  }

  // Calendar query
  if (lowerMessage.includes('event') || lowerMessage.includes('calendar') ||
      lowerMessage.includes('today') || lowerMessage.includes('this week') ||
      lowerMessage.includes('upcoming')) {
    intents.calendarQuery = true;
  }

  return intents;
};

const determineRequiredTools = (intents, hasImages = false) => {
  const tools = [];

  // Always fetch market data for market analysis or trade requests
  if (intents.marketAnalysis || intents.tradeRequest || intents.priceQuery || intents.technical) {
    tools.push('get_market_data');
  }

  // Always fetch calendar for fundamentals or trade requests
  if (intents.fundamentals || intents.calendarQuery || intents.tradeRequest || intents.marketAnalysis) {
    tools.push('get_economic_calendar');
  }

  // Always fetch news for fundamentals or market analysis
  if (intents.fundamentals || intents.newsQuery || intents.marketAnalysis || intents.tradeRequest) {
    tools.push('get_market_news');
  }

  // Risk calculations for trade requests or risk queries
  if (intents.risk || intents.tradeRequest) {
    tools.push('calculate_trading_math');
  }

  // Image analysis if images present
  if (hasImages) {
    tools.push('analyze_image');
  }

  return [...new Set(tools)]; // Remove duplicates
};

const extractInstrument = (message, conversationHistory = []) => {
  const lowerMessage = message.toLowerCase();
  
  // Common instrument names
  const instrumentMap = {
    'gold': 'XAUUSD',
    'silver': 'XAGUSD',
    'oil': 'CL=F',
    'crude': 'CL=F',
    'bitcoin': 'BTCUSD',
    'btc': 'BTCUSD',
    'ethereum': 'ETHUSD',
    'eth': 'ETHUSD',
    'eurusd': 'EURUSD',
    'gbpusd': 'GBPUSD',
    'usdjpy': 'USDJPY',
    'spy': 'SPY',
    'sp500': '^GSPC',
    'nasdaq': '^IXIC',
    'dow': '^DJI'
  };

  // Check for instrument in message
  for (const [key, symbol] of Object.entries(instrumentMap)) {
    if (lowerMessage.includes(key)) {
      return symbol;
    }
  }

  // Check conversation history for mentioned instruments
  for (const msg of conversationHistory) {
    if (msg.role === 'user') {
      const content = typeof msg.content === 'string' ? msg.content : msg.content?.text || '';
      for (const [key, symbol] of Object.entries(instrumentMap)) {
        if (content.toLowerCase().includes(key)) {
          return symbol;
        }
      }
    }
  }

  return null;
};

module.exports = {
  detectIntent,
  determineRequiredTools,
  extractInstrument
};
