/**
 * Premium AI Chat - Streaming API with SSE
 * 
 * Features:
 * - Server-Sent Events for real-time token streaming
 * - Parallel data fetching with timeouts
 * - Aggressive caching for market/news data
 * - Graceful degradation when sources fail
 * - Performance monitoring and logging
 */

const { getDbConnection } = require('../db');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  ADAPTER_TIMEOUT: 3000,      // 3s timeout per adapter
  OPENAI_TIMEOUT: 45000,      // 45s for OpenAI streaming
  MAX_HISTORY: 6,             // Keep last 6 messages for context
  CACHE_TTL: 30000,           // 30s cache for market data
  MAX_TOKENS: 2500,           // Allow thorough, well-structured responses
  MODEL: 'gpt-4o',            // Smarter model for trading insights
  TEMPERATURE: 0.7
};

// Simple in-memory cache
const dataCache = new Map();

function getCached(key) {
  const entry = dataCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CONFIG.CACHE_TTL) {
    dataCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  dataCache.set(key, { data, timestamp: Date.now() });
}

// ============================================================================
// Logging
// ============================================================================

const generateRequestId = () => `stream_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

const log = (requestId, level, message, data = {}) => {
  console[level]?.(JSON.stringify({ requestId, level, message, timestamp: new Date().toISOString(), ...data }));
};

// ============================================================================
// Data Adapters with Timeout + Caching
// ============================================================================

async function fetchWithTimeout(url, options = {}, timeout = CONFIG.ADAPTER_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function getMarketData(symbol) {
  const cacheKey = `market_${symbol}`;
  const cached = getCached(cacheKey);
  if (cached) return { ...cached, fromCache: true };
  
  try {
    const response = await fetchWithTimeout(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const quote = data.chart?.result?.[0];
    if (!quote) return null;
    
    const result = {
      symbol,
      price: quote.meta?.regularMarketPrice,
      previousClose: quote.meta?.previousClose,
      change: quote.meta?.regularMarketPrice - quote.meta?.previousClose,
      changePercent: ((quote.meta?.regularMarketPrice - quote.meta?.previousClose) / quote.meta?.previousClose * 100).toFixed(2),
      high: quote.meta?.regularMarketDayHigh,
      low: quote.meta?.regularMarketDayLow
    };
    
    setCache(cacheKey, result);
    return result;
  } catch (error) {
    return null;
  }
}

async function getMarketNews() {
  const cacheKey = 'market_news';
  const cached = getCached(cacheKey);
  if (cached) return { items: cached, fromCache: true };
  
  try {
    // Use a simple news source
    const response = await fetchWithTimeout(
      'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US'
    );
    
    if (!response.ok) return { items: [], error: 'News unavailable' };
    
    const text = await response.text();
    // Parse RSS - simplified
    const items = [];
    const matches = text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
    let count = 0;
    for (const match of matches) {
      if (count++ > 0 && count <= 6) { // Skip first (feed title), get 5 items
        items.push({ title: match[1] });
      }
    }
    
    setCache(cacheKey, items);
    return { items, fromCache: false };
  } catch (error) {
    return { items: [], error: 'News temporarily unavailable' };
  }
}

// Fetch all relevant data in parallel
async function fetchAllData(message, requestId) {
  const startTime = Date.now();
  const results = { market: null, news: null, sources: [], errors: [] };
  
  // Detect symbols in message
  const symbolPatterns = [
    /\b(BTCUSD|ETHUSD|BTC|ETH|XAU|GOLD|EUR\/USD|EURUSD|GBP\/USD|GBPUSD)\b/gi,
    /\b(SPY|QQQ|AAPL|MSFT|NVDA|TSLA|AMZN|GOOGL|META)\b/gi,
    /\b(US500|SPX|NAS100|NDX|US30|DJI)\b/gi
  ];
  
  const symbols = new Set();
  for (const pattern of symbolPatterns) {
    const matches = message.match(pattern) || [];
    matches.forEach(m => symbols.add(m.toUpperCase()));
  }
  
  // Symbol mapping for Yahoo Finance
  const symbolMap = {
    'BTCUSD': 'BTC-USD', 'BTC': 'BTC-USD',
    'ETHUSD': 'ETH-USD', 'ETH': 'ETH-USD',
    'XAUUSD': 'GC=F', 'GOLD': 'GC=F', 'XAU': 'GC=F',
    'EURUSD': 'EURUSD=X', 'EUR/USD': 'EURUSD=X',
    'GBPUSD': 'GBPUSD=X', 'GBP/USD': 'GBPUSD=X',
    'US500': '^GSPC', 'SPX': '^GSPC', 'SPY': 'SPY',
    'NAS100': '^NDX', 'NDX': '^NDX', 'QQQ': 'QQQ',
    'US30': '^DJI', 'DJI': '^DJI'
  };
  
  const fetches = [];
  
  // Fetch market data for detected symbols
  const symbolsToFetch = Array.from(symbols).slice(0, 3); // Max 3 symbols
  for (const sym of symbolsToFetch) {
    const yahooSymbol = symbolMap[sym] || sym;
    fetches.push(
      getMarketData(yahooSymbol)
        .then(data => {
          if (data) {
            results.market = results.market || [];
            results.market.push(data);
            results.sources.push({ type: 'market', symbol: sym, cached: data.fromCache });
          }
        })
        .catch(() => results.errors.push(`Market data for ${sym} unavailable`))
    );
  }
  
  // Fetch news if message seems news-related
  const newsKeywords = /news|headlines|market|today|what.*happening|update|latest/i;
  if (newsKeywords.test(message)) {
    fetches.push(
      getMarketNews()
        .then(data => {
          if (data.items.length > 0) {
            results.news = data.items;
            results.sources.push({ type: 'news', cached: data.fromCache });
          }
          if (data.error) results.errors.push(data.error);
        })
        .catch(() => results.errors.push('News temporarily unavailable'))
    );
  }
  
  // Wait for all with timeout
  await Promise.race([
    Promise.allSettled(fetches),
    new Promise(resolve => setTimeout(resolve, CONFIG.ADAPTER_TIMEOUT + 500))
  ]);
  
  results.fetchTime = Date.now() - startTime;
  log(requestId, 'info', 'Data fetch complete', { 
    fetchTime: results.fetchTime,
    sources: results.sources.length,
    errors: results.errors.length
  });
  
  return results;
}

// ============================================================================
// System Prompt (Concise for Speed)
// ============================================================================

const SYSTEM_PROMPT = `You are AURA AI, a professional trading assistant. You help traders with analysis, position sizing, risk management, and market insights.

**Expertise**: Forex, crypto, stocks, commodities, indices. You understand technical analysis (support/resistance, market structure, chart patterns), fundamental drivers, and risk/reward calculations.

**Position sizing & risk**: When asked about position size, use the formula: (Account × Risk%) / (Entry - Stop Loss in price units). For forex use pips (0.0001 for most pairs, 0.01 for JPY). Always show the calculation step-by-step. Recommend 1-2% risk per trade.

**Response style**: Be direct and actionable. Use **bold** for key levels and numbers. Structure with clear steps or sections when explaining concepts. Include specific figures when data is provided. Keep explanations tight—avoid filler. If data is unavailable, use general market knowledge and note it.

**Format**: Use compact bullet points and numbered steps. Avoid large gaps between sections. Be thorough but concise.`;

// ============================================================================
// Token Decoding
// ============================================================================

function decodeToken(token) {
  if (!token) return null;
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
    
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    
    return decoded;
  } catch {
    return null;
  }
}

// ============================================================================
// Main Handler - SSE Streaming
// ============================================================================

module.exports = async (req, res) => {
  const requestId = generateRequestId();
  const startTime = Date.now();
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  
  // Auth
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = decodeToken(token);
  
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  const userId = decoded.id || decoded.userId;
  
  // Verify premium access
  let db;
  try {
    db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    
    const [users] = await db.execute(
      'SELECT id, email, role, subscription_status, subscription_plan FROM users WHERE id = ?',
      [userId]
    );
    
    if (users.length === 0) {
      if (db.release) db.release();
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = users[0];
    const SUPER_ADMIN_EMAIL = 'shubzfx@gmail.com';
    const isSuperAdmin = user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
    
    const hasAccess = isSuperAdmin ||
      ['premium', 'a7fx', 'elite', 'admin', 'super_admin'].includes(user.role) ||
      (user.subscription_status === 'active' && ['aura', 'a7fx'].includes(user.subscription_plan));
    
    if (!hasAccess) {
      if (db.release) db.release();
      return res.status(403).json({ success: false, message: 'Premium subscription required' });
    }
    
    if (db.release) db.release();
  } catch (error) {
    log(requestId, 'error', 'Auth error', { error: error.message });
    if (db?.release) db.release();
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }
  
  // Parse request
  const { message, conversationHistory = [], images = [] } = req.body;
  
  if (!message?.trim() && images.length === 0) {
    return res.status(400).json({ success: false, message: 'Message required' });
  }
  
  log(requestId, 'info', 'Request started', { userId, messageLength: message?.length });
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Request-Id', requestId);
  
  // Send initial event
  res.write(`data: ${JSON.stringify({ type: 'start', requestId })}\n\n`);
  
  try {
    // Fetch data in parallel while preparing OpenAI call
    const dataPromise = fetchAllData(message, requestId);
    
    // Trim conversation history
    const trimmedHistory = conversationHistory.slice(-CONFIG.MAX_HISTORY).map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content.slice(0, 1000) : ''
    }));
    
    // Wait for data
    const fetchedData = await dataPromise;
    
    // Send sources event
    if (fetchedData.sources.length > 0) {
      res.write(`data: ${JSON.stringify({ 
        type: 'sources', 
        sources: fetchedData.sources,
        fetchTime: fetchedData.fetchTime
      })}\n\n`);
    }
    
    // Build context
    let context = '';
    if (fetchedData.market?.length > 0) {
      context += '\n**Live Market Data:**\n';
      for (const m of fetchedData.market) {
        context += `- ${m.symbol}: $${m.price?.toFixed(2)} (${m.change >= 0 ? '+' : ''}${m.changePercent}%)\n`;
      }
    }
    if (fetchedData.news?.length > 0) {
      context += '\n**Recent Headlines:**\n';
      for (const n of fetchedData.news.slice(0, 3)) {
        context += `- ${n.title}\n`;
      }
    }
    if (fetchedData.errors.length > 0) {
      context += `\n*Note: Some data sources temporarily unavailable*\n`;
    }
    
    // Build messages for OpenAI
    const openaiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...trimmedHistory,
      { 
        role: 'user', 
        content: context ? `${message}\n\n---\nContext:${context}` : message
      }
    ];
    
    // Handle images
    if (images.length > 0) {
      const lastMessage = openaiMessages[openaiMessages.length - 1];
      lastMessage.content = [
        { type: 'text', text: lastMessage.content },
        ...images.slice(0, 2).map(img => ({
          type: 'image_url',
          image_url: { url: img, detail: 'low' }
        }))
      ];
    }
    
    // OpenAI streaming request
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service not configured' })}\n\n`);
      res.end();
      return;
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.OPENAI_TIMEOUT);
    
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: images.length > 0 ? 'gpt-4o' : CONFIG.MODEL,
        messages: openaiMessages,
        max_tokens: CONFIG.MAX_TOKENS,
        temperature: CONFIG.TEMPERATURE,
        stream: true
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      log(requestId, 'error', 'OpenAI error', { status: openaiResponse.status, error: errorText });
      
      if (openaiResponse.status === 429) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service is busy. Please try again in a moment.' })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service temporarily unavailable' })}\n\n`);
      }
      res.end();
      return;
    }
    
    // Stream tokens
    const reader = openaiResponse.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let ttfb = null;
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      if (!ttfb) {
        ttfb = Date.now() - startTime;
        log(requestId, 'info', 'TTFB', { ttfb });
      }
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
      
      for (const line of lines) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          
          if (content) {
            fullContent += content;
            res.write(`data: ${JSON.stringify({ type: 'token', content })}\n\n`);
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
    
    // Send completion event
    const totalTime = Date.now() - startTime;
    log(requestId, 'info', 'Request complete', { totalTime, ttfb, contentLength: fullContent.length });
    
    res.write(`data: ${JSON.stringify({ 
      type: 'done', 
      content: fullContent,
      timing: { total: totalTime, ttfb, dataFetch: fetchedData.fetchTime },
      sources: fetchedData.sources
    })}\n\n`);
    
    res.end();
    
  } catch (error) {
    log(requestId, 'error', 'Stream error', { error: error.message });
    
    try {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        message: error.name === 'AbortError' 
          ? 'Request timed out. Please try again.'
          : 'An error occurred. Please try again.'
      })}\n\n`);
      res.end();
    } catch {
      // Response already ended
    }
  }
};
