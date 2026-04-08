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
const MarketDataAdapter = require('./data-layer/adapters/market-data-adapter');
const { detectInstruments } = require('./quote-snapshot');
const { extractInstrument, detectIntent } = require('./tool-router');
const { toCanonical } = require('./utils/symbol-registry');
const { validateAndSanitize, generatePricingInstructions } = require('./price-validator');
const { getPerplexityModelForChat } = require('./perplexity-config');
const { verifyToken } = require('../utils/auth');
const { isSuperAdminEmail } = require('../utils/entitlements');
const { PERPLEXITY_API_URL } = require('./perplexity-client');

const marketDataAdapter = new MarketDataAdapter();

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  ADAPTER_TIMEOUT: 10000,     // 10s — provider chain (Twelve Data → Finnhub → …) on cold start / DB
  AI_TIMEOUT: 45000,          // 45s for Perplexity streaming
  MAX_HISTORY: 6,             // Keep last 6 messages for context
  CACHE_TTL: 30000,           // 30s cache for market data
  MAX_TOKENS: 2500,           // Allow thorough, well-structured responses
  MODEL: getPerplexityModelForChat(), // Override with PERPLEXITY_MODEL or PERPLEXITY_CHAT_MODEL
  TEMPERATURE: 0.55           // Slightly lower for factual adherence when live quotes are injected
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

/**
 * Fetch market data via central adapter (single source of truth).
 * Uses symbol registry, validators, and provider fallback; never fabricates prices.
 */
async function getMarketData(symbol) {
  try {
    const result = await marketDataAdapter.fetch({ symbol });
    if (!result || result.price == null || result.price <= 0) {
      return { symbol, price: 0, unavailable: true };
    }
    const prev = result.previous_close;
    const change = prev != null ? result.price - prev : null;
    const changePercent = (change != null && prev != null && prev !== 0)
      ? ((change / prev) * 100).toFixed(2)
      : null;
    return {
      symbol: result.symbol,
      price: result.price,
      previousClose: prev,
      change,
      changePercent,
      high: result.high,
      low: result.low,
      source: result.source,
      fromCache: result.cached || false
    };
  } catch (error) {
    return { symbol, price: 0, unavailable: true };
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

/** When the user says "gold" or "oil" without typing XAUUSD, still fetch live quotes. */
function inferSymbolsFromKeywords(message) {
  const t = (message || '').toLowerCase();
  const out = [];
  if (/\b(?:gold|spot gold|xau)\b/.test(t)) out.push('XAUUSD');
  if (/\b(?:silver|xag)\b/.test(t)) out.push('XAGUSD');
  if (/\b(?:crude|wti|brent|us oil)\b/.test(t)) out.push('CL=F');
  if (/\b(?:bitcoin|btc)\b/.test(t)) out.push('BTCUSD');
  if (/\b(?:ethereum|ether)\b/.test(t)) out.push('ETHUSD');
  if (/\b(?:s\s*&\s*p|sp500|spx)\b/.test(t)) out.push('^GSPC');
  if (/\b(?:nasdaq|nas\s*100|ndx)\b/.test(t)) out.push('^IXIC');
  if (/\b(?:dow|djia|us30)\b/.test(t)) out.push('^DJI');
  return out;
}

/** Align with quote-snapshot + tool-router so streaming chat gets the same symbol coverage as non-streaming Aura AI. */
function collectSymbolsForFetch(message, conversationHistory = []) {
  const text = typeof message === 'string' ? message : '';
  const hist = Array.isArray(conversationHistory) ? conversationHistory : [];
  const symbols = new Set();

  for (const sym of detectInstruments(text)) {
    const c = toCanonical(sym);
    if (c) symbols.add(c);
  }

  for (const msg of hist.slice(-6)) {
    if (msg.role !== 'user') continue;
    const part = typeof msg.content === 'string' ? msg.content : '';
    for (const sym of detectInstruments(part)) {
      const c = toCanonical(sym);
      if (c) symbols.add(c);
    }
  }

  const extracted = extractInstrument(text, hist);
  if (extracted) symbols.add(toCanonical(extracted));

  const extraIdx = /\b(US500|US30|DJI|DIA|SPY|QQQ|VIX|IWM|DXY)\b/gi;
  let m;
  while ((m = extraIdx.exec(text)) !== null) {
    const c = toCanonical(m[1]);
    if (c) symbols.add(c);
  }

  for (const sym of inferSymbolsFromKeywords(text)) {
    const c = toCanonical(sym);
    if (c) symbols.add(c);
  }

  return Array.from(symbols).filter(Boolean).slice(0, 6);
}

function formatPriceForContext(symbol, price) {
  if (price == null || !Number.isFinite(Number(price))) return String(price);
  const n = Number(price);
  const s = (symbol || '').toUpperCase();
  if (s.length === 6 && s.endsWith('JPY')) return n.toFixed(3);
  if (s.length === 6 && /^[A-Z]{6}$/.test(s)) return n.toFixed(5);
  if (s.includes('XAU') || s.includes('XAG')) return n.toFixed(2);
  if (s.includes('BTC') || s.includes('ETH')) return n >= 1000 ? n.toFixed(2) : n.toFixed(4);
  return n.toFixed(2);
}

/** Shape expected by price-validator / generatePricingInstructions */
function buildQuoteContextFromMarketRows(rows) {
  const instruments = {};
  for (const m of rows || []) {
    if (!m || m.unavailable || m.price == null || m.price <= 0) continue;
    const sym = m.symbol;
    instruments[sym] = {
      available: true,
      last: m.price,
      open: m.price,
      high: m.high ?? m.price,
      low: m.low ?? m.price,
      previousClose: m.previousClose,
      bid: m.price,
      ask: m.price,
      change: m.change,
      changePercent: m.changePercent != null ? String(m.changePercent) : undefined,
      displayName: sym,
    };
  }
  return {
    available: Object.keys(instruments).length > 0,
    instruments,
    timestamp: new Date().toISOString(),
  };
}

// Fetch all relevant data in parallel
async function fetchAllData(message, conversationHistory, requestId) {
  const startTime = Date.now();
  const results = { market: null, news: null, sources: [], errors: [] };
  const text = typeof message === 'string' ? message : '';
  const hist = Array.isArray(conversationHistory) ? conversationHistory : [];

  const symbolsToFetch = collectSymbolsForFetch(message, hist);

  const intents = detectIntent(text, hist);
  const wantNews =
    intents.newsQuery ||
    intents.fundamentals ||
    intents.marketAnalysis ||
    /news|headlines|what.*happening|update|latest|nfp|cpi|gdp|pmi|fed|ecb|boe|rate\s*decision/i.test(text);

  const fetches = [];

  for (const sym of symbolsToFetch) {
    fetches.push(
      getMarketData(sym)
        .then((data) => {
          if (data) {
            results.market = results.market || [];
            results.market.push(data);
            results.sources.push({ type: 'market', symbol: data.symbol, cached: data.fromCache });
          }
        })
        .catch(() => results.errors.push(`Market data for ${sym} unavailable`))
    );
  }

  if (wantNews) {
    fetches.push(
      getMarketNews()
        .then((data) => {
          if (data.items.length > 0) {
            results.news = data.items;
            results.sources.push({ type: 'news', cached: data.fromCache });
          }
          if (data.error) results.errors.push(data.error);
        })
        .catch(() => results.errors.push('News temporarily unavailable'))
    );
  }

  // Wait for all market/news fetches — do not race with a short timer (that dropped live quotes on slow providers).
  await Promise.allSettled(fetches);

  results.fetchTime = Date.now() - startTime;
  log(requestId, 'info', 'Data fetch complete', {
    fetchTime: results.fetchTime,
    symbolsRequested: symbolsToFetch,
    sources: results.sources.length,
    errors: results.errors.length,
  });

  return results;
}

// ============================================================================
// System Prompt (Concise for Speed)
// ============================================================================

const SYSTEM_PROMPT = `You are AURA AI, a professional trading assistant. Your reasoning uses Perplexity; live prices and headlines come only from the "Verified context" block appended to the user message (Twelve Data, Finnhub, Alpha Vantage, Yahoo Finance, or RSS — never invent numbers).

Expertise: Forex, crypto, stocks, commodities, indices. You apply technical analysis (support/resistance, structure, patterns), fundamentals, and risk/reward clearly.

Position sizing: When asked, use (Account × Risk%) / (Entry − Stop in price units). For forex use pip size (0.0001 most pairs, 0.01 for JPY pairs). Show the math step-by-step. Suggest 1–2% risk per trade unless the user states otherwise.

Truthfulness: For last price, bid/ask, or percentage change, use ONLY numbers from the verified live data lines. If an instrument is missing or marked unavailable, say live data is temporarily unavailable and suggest checking the broker platform — do not estimate a price.

Output rules (strict): Write in plain English only. Do not use asterisk characters, markdown, bold markers, or bullet symbols like star or hyphen lists that look like markup. Use short numbered steps (1. 2. 3.) or short paragraphs instead. No asterisks in any sentence.`;

function stripAsterisksFromAssistantText(text) {
  if (text == null || typeof text !== 'string') return text;
  return text.replace(/\*/g, '');
}

// ============================================================================
// Main Handler - SSE Streaming
// ============================================================================

async function handler(req, res) {
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

  // Parse body safely (Vercel/serverless may send string or buffer)
  let body;
  try {
    if (req.body == null) {
      body = {};
    } else if (typeof req.body === 'string') {
      body = JSON.parse(req.body || '{}');
    } else if (Buffer.isBuffer(req.body)) {
      body = JSON.parse((req.body.toString() || '{}'));
    } else {
      body = typeof req.body === 'object' ? req.body : {};
    }
  } catch (e) {
    log(requestId, 'error', 'Invalid request body', { error: e.message });
    return res.status(400).json({ success: false, message: 'Invalid request body' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = decoded.id || decoded.userId;

  // Verify premium access (resilient to missing columns or DB errors)
  let db;
  try {
    db = await getDbConnection();
    if (!db) {
      log(requestId, 'error', 'No DB connection');
      return res.status(503).json({ success: false, message: 'Service temporarily unavailable. Please try again.' });
    }

    let users;
    try {
      [users] = await db.execute(
        'SELECT id, email, role, subscription_status, subscription_plan FROM users WHERE id = ?',
        [userId]
      );
    } catch (queryErr) {
      const isUnknownColumn = (queryErr.code === 'ER_BAD_FIELD_ERROR' || (queryErr.message || '').includes('Unknown column'));
      if (isUnknownColumn) {
        try {
          [users] = await db.execute('SELECT id, email, role FROM users WHERE id = ?', [userId]);
        } catch (fallbackErr) {
          log(requestId, 'error', 'Auth fallback query error', { error: fallbackErr.message });
          if (db.release) db.release();
          return res.status(503).json({ success: false, message: 'Service temporarily unavailable. Please try again.' });
        }
      } else {
        log(requestId, 'error', 'Auth query error', { error: queryErr.message, code: queryErr.code });
        if (db.release) db.release();
        return res.status(503).json({ success: false, message: 'Service temporarily unavailable. Please try again.' });
      }
    }

    if (!users || users.length === 0) {
      if (db.release) db.release();
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = users[0];
    const isSuperAdmin = user.email && isSuperAdminEmail(user);
    const role = (user.role || '').toLowerCase();
    const subStatus = (user.subscription_status || '').toLowerCase();
    const subPlan = (user.subscription_plan || '').toLowerCase();

    const hasAccess =
      isSuperAdmin ||
      ['premium', 'pro', 'a7fx', 'elite', 'admin', 'super_admin'].includes(role) ||
      ((subStatus === 'active' || subStatus === 'trialing') &&
        ['aura', 'a7fx', 'premium', 'elite', 'pro'].includes(subPlan));

    if (!hasAccess) {
      if (db.release) db.release();
      return res.status(403).json({ success: false, message: 'Premium subscription required' });
    }

    if (db.release) db.release();
  } catch (error) {
    log(requestId, 'error', 'Auth error', { error: error.message, stack: error.stack });
    if (db?.release) db.release();
    return res.status(500).json({ success: false, message: 'Authentication error' });
  }

  // Read from parsed body
  const message = typeof body.message === 'string' ? body.message : '';
  const conversationHistory = Array.isArray(body.conversationHistory) ? body.conversationHistory : [];
  const rawImages = Array.isArray(body.images) ? body.images : [];

  // Normalize images: only valid data URLs or https URLs (Perplexity vision). Max 2, skip invalid or oversized.
  const MAX_IMAGE_URL_LENGTH = 5_000_000; // ~3.75MB base64 to avoid timeouts/limits
  const images = rawImages.slice(0, 2).map((img) => {
    const url = typeof img === 'string' ? img : (img && typeof img.url === 'string' ? img.url : null);
    if (!url || (url.length > MAX_IMAGE_URL_LENGTH)) return null;
    if (url.startsWith('data:image/') || url.startsWith('https://')) return url;
    return null;
  }).filter(Boolean);

  if (!message.trim() && images.length === 0) {
    return res.status(400).json({ success: false, message: 'Message or at least one valid image required' });
  }

  const perplexityApiKey = process.env.PERPLEXITY_API_KEY && String(process.env.PERPLEXITY_API_KEY).trim();
  if (!perplexityApiKey) {
    log(requestId, 'error', 'PERPLEXITY_API_KEY missing or empty');
    return res.status(503).json({ success: false, message: 'AI service not configured' });
  }

  log(requestId, 'info', 'Request started', { userId, messageLength: message?.length, imageCount: images.length });
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Request-Id', requestId);
  
  // Send initial event
  res.write(`data: ${JSON.stringify({ type: 'start', requestId })}\n\n`);
  
  try {
    // Fetch data in parallel while preparing Perplexity call
    const dataPromise = fetchAllData(message, conversationHistory, requestId);
    
    // Trim conversation history (Perplexity expects string content for history)
    const trimmedHistory = conversationHistory.slice(-CONFIG.MAX_HISTORY).map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? String(msg.content).slice(0, 1000) : ''
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
    
    // Build context (only verified prices; never fabricate)
    let context = '';
    if (fetchedData.market?.length > 0) {
      context += '\nLive Market Data (verified — use these exact values only):\n';
      for (const m of fetchedData.market) {
        if (m.unavailable || m.price == null || m.price <= 0) {
          context += `- ${m.symbol}: Live market data temporarily unavailable.\n`;
        } else {
          const pct =
            m.changePercent != null ? `${m.changePercent}% vs prev close` : 'N/A';
          context += `- ${m.symbol}: last ${formatPriceForContext(m.symbol, m.price)} | ${pct} | source: ${m.source || 'market adapter'}\n`;
        }
      }
    }
    if (fetchedData.news?.length > 0) {
      context += '\nRecent Headlines:\n';
      for (const n of fetchedData.news.slice(0, 3)) {
        context += `- ${n.title}\n`;
      }
    }
    if (fetchedData.errors.length > 0) {
      context += '\nNote: Some data sources were temporarily unavailable.\n';
    }
    
    const quoteContext = buildQuoteContextFromMarketRows(fetchedData.market || []);
    const pricingRules = generatePricingInstructions(quoteContext);
    const systemContent = `${SYSTEM_PROMPT}\n\n${pricingRules}`;

    // Build messages for Perplexity (official Chat Completions API; key stays server-side only)
    const openaiMessages = [
      { role: 'system', content: systemContent },
      ...trimmedHistory,
      {
        role: 'user',
        content: context ? `${message}\n\n---\nVerified context:${context}` : message,
      },
    ];
    
    // Handle images (multimodal content: text + image_url parts)
    if (images.length > 0) {
      const lastMessage = openaiMessages[openaiMessages.length - 1];
      const textPart = lastMessage.content != null ? String(lastMessage.content) : '';
      lastMessage.content = [
        { type: 'text', text: textPart },
        ...images.map((url) => ({
          type: 'image_url',
          image_url: { url: String(url), detail: 'low' }
        }))
      ];
    }
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.AI_TIMEOUT);
    
    const openaiResponse = await fetch(PERPLEXITY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${perplexityApiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.MODEL,
        messages: openaiMessages,
        max_tokens: CONFIG.MAX_TOKENS,
        temperature: CONFIG.TEMPERATURE,
        stream: true
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    
    if (!openaiResponse.ok) {
      let errorText = '';
      try {
        errorText = await openaiResponse.text();
        if (errorText.length > 2000) errorText = errorText.slice(0, 2000) + '…';
      } catch (_) {}
      log(requestId, 'error', 'Perplexity error', { status: openaiResponse.status, error: errorText });

      if (openaiResponse.status === 429) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service is busy. Please try again in a moment.' })}\n\n`);
      } else if (openaiResponse.status === 400 && /image|content|invalid/i.test(errorText)) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'Image could not be processed. Try a smaller or different image.' })}\n\n`);
      } else if (openaiResponse.status === 401 || openaiResponse.status === 403) {
        log(requestId, 'error', 'Perplexity auth failed - check PERPLEXITY_API_KEY');
        res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI service authentication failed' })}\n\n`);
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
    
    const validation = validateAndSanitize(fullContent, quoteContext, {
      strict: false,
      rewrite: true,
      addDisclaimer: true,
    });
    let finalContent = validation.sanitizedResponse || fullContent;
    finalContent = stripAsterisksFromAssistantText(finalContent);
    if (validation.modified) {
      log(requestId, 'warn', 'Price validator adjusted assistant reply', {
        invalidPrices: validation.validation?.invalidPrices?.length ?? 0,
      });
    }

    // Send completion event (client uses `content` as the saved message — may differ from streamed tokens if validator rewrote)
    const totalTime = Date.now() - startTime;
    log(requestId, 'info', 'Request complete', { totalTime, ttfb, contentLength: finalContent.length });
    
    res.write(`data: ${JSON.stringify({ 
      type: 'done', 
      content: finalContent,
      timing: { total: totalTime, ttfb, dataFetch: fetchedData.fetchTime },
      sources: fetchedData.sources
    })}\n\n`);
    
    res.end();
    
  } catch (error) {
    log(requestId, 'error', 'Stream error', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });

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
}

// Top-level catch: if handler throws before sending, return 500 with body so client gets a proper error
module.exports = async (req, res) => {
  try {
    await handler(req, res);
  } catch (err) {
    const requestId = (req && req.headers && req.headers['x-vercel-id']) || 'unknown';
    console.error(JSON.stringify({
      requestId,
      level: 'error',
      message: 'Unhandled error in premium-chat-stream',
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    }));
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json');
      res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
    }
  }
};
