/**
 * AURA AI Core Chat Handler
 * 
 * This module provides a robust, ChatGPT-like chat experience:
 * 1. AI response is ALWAYS generated first
 * 2. Market data is fetched in parallel and injected into context
 * 3. Conversation history is properly managed
 * 4. Images are validated and processed correctly
 * 5. All errors are gracefully handled
 */

const OpenAI = require('openai');
const dataService = require('./data-layer/data-service');
const { executeQuery } = require('../db');
const { getCached, setCached } = require('../cache');

// Live quote snapshot and price validation modules
const { 
  fetchMultipleQuotes, 
  buildQuoteContext, 
  detectInstruments,
  isQuoteStale 
} = require('./quote-snapshot');
const { 
  validateAndSanitize, 
  generatePricingInstructions 
} = require('./price-validator');

// ============= CONFIGURATION =============
const CONFIG = {
  MAX_CONVERSATION_TURNS: 20,  // Keep last 20 turns
  MAX_CONTEXT_TOKENS: 8000,     // Reserve tokens for context
  OPENAI_TIMEOUT: 25000,        // 25 second timeout for OpenAI
  DATA_FETCH_TIMEOUT: 5000,     // 5 second timeout for data
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB max image
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
};

// ============= RESPONSE SCHEMA =============
// Structured response format for consistency
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Brief summary of the response' },
    marketData: { type: 'object', description: 'Live market data if applicable' },
    analysis: { type: 'string', description: 'Detailed analysis' },
    actionItems: { type: 'array', description: 'Suggested actions if any' },
    sources: { type: 'array', description: 'Data sources used' }
  }
};

// ============= LOGGING =============
const createLogger = (requestId) => {
  const startTime = Date.now();
  const timings = {};

  return {
    requestId,
    startTime,
    timings,

    time(operation) {
      const opStart = Date.now();
      return () => {
        timings[operation] = Date.now() - opStart;
      };
    },

    log(level, message, data = {}) {
      console[level === 'error' ? 'error' : 'log'](JSON.stringify({
        requestId,
        timestamp: new Date().toISOString(),
        elapsed: Date.now() - startTime,
        level,
        message,
        ...data
      }));
    },

    summary() {
      return {
        requestId,
        totalTime: Date.now() - startTime,
        timings
      };
    }
  };
};

// ============= CONVERSATION MANAGEMENT =============
/**
 * Summarize long conversation history to fit within context limits
 */
function summarizeHistory(history, maxTurns = CONFIG.MAX_CONVERSATION_TURNS) {
  if (!history || history.length <= maxTurns * 2) {
    return history;
  }

  // Keep first 2 messages (system context) and last N turns
  const oldMessages = history.slice(2, -maxTurns * 2);
  const recentMessages = history.slice(-maxTurns * 2);

  // Create a summary of old messages
  const summaryContent = `[Previous conversation summary: ${oldMessages.length} messages about trading topics]`;
  
  return [
    history[0], // System prompt
    { role: 'system', content: summaryContent },
    ...recentMessages
  ];
}

/**
 * Build conversation messages for OpenAI
 */
function buildMessages(systemPrompt, conversationHistory, currentMessage, images = []) {
  const messages = [
    { role: 'system', content: systemPrompt }
  ];

  // Add conversation history
  if (conversationHistory && Array.isArray(conversationHistory)) {
    const summarized = summarizeHistory(conversationHistory);
    for (const msg of summarized) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content || ''
        });
      }
    }
  }

  // Add current message with images if present
  if (images && images.length > 0) {
    const content = [
      ...images.map(img => ({
        type: 'image_url',
        image_url: { url: img, detail: 'high' }
      })),
      { type: 'text', text: currentMessage || 'Please analyze this image.' }
    ];
    messages.push({ role: 'user', content });
  } else {
    messages.push({ role: 'user', content: currentMessage || '' });
  }

  return messages;
}

// ============= IMAGE VALIDATION =============
/**
 * Validate image data for multimodal input
 */
function validateImage(imageData) {
  if (!imageData) return { valid: false, error: 'No image data' };

  // Check if it's a data URL
  if (imageData.startsWith('data:')) {
    const match = imageData.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return { valid: false, error: 'Invalid data URL format' };
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // Validate mime type
    if (!CONFIG.ALLOWED_IMAGE_TYPES.includes(mimeType)) {
      return { valid: false, error: `Unsupported image type: ${mimeType}` };
    }

    // Validate size (base64 is ~4/3 larger than binary)
    const estimatedSize = (base64Data.length * 3) / 4;
    if (estimatedSize > CONFIG.MAX_IMAGE_SIZE) {
      return { valid: false, error: 'Image too large (max 10MB)' };
    }

    return { valid: true, mimeType, size: estimatedSize };
  }

  // Check if it's a URL
  if (imageData.startsWith('http://') || imageData.startsWith('https://')) {
    return { valid: true, type: 'url' };
  }

  return { valid: false, error: 'Invalid image format' };
}

/**
 * Process and validate all images
 */
function processImages(images) {
  if (!images || !Array.isArray(images)) return [];

  const validImages = [];
  const errors = [];

  for (const img of images) {
    const validation = validateImage(img);
    if (validation.valid) {
      validImages.push(img);
    } else {
      errors.push(validation.error);
    }
  }

  return { validImages, errors };
}

// ============= DATA FETCHING =============
/**
 * Detect if message needs market data
 */
function needsMarketData(message) {
  if (!message) return { needs: false };

  const patterns = {
    symbol: /\b(XAU|XAG|EUR|GBP|USD|BTC|ETH|SPY|QQQ|AAPL|MSFT|TSLA|gold|silver|bitcoin|ethereum)/i,
    action: /\b(price|trade|buy|sell|analysis|forecast|outlook|trend|level|support|resistance)/i,
    question: /\b(what|where|how|will|should|could)/i
  };

  const symbolMatch = message.match(patterns.symbol);
  const hasAction = patterns.action.test(message);
  const isQuestion = patterns.question.test(message);

  return {
    needs: !!(symbolMatch || hasAction),
    detectedSymbol: symbolMatch ? symbolMatch[0].toUpperCase() : null,
    isMarketQuestion: hasAction && isQuestion
  };
}

/**
 * Fetch market context data in parallel
 * Never blocks - always returns within timeout
 */
async function fetchMarketContext(symbol, requestId) {
  if (!symbol) return null;

  const logger = createLogger(requestId);
  const endTiming = logger.time('marketContext');

  try {
    const result = await Promise.race([
      dataService.getAllDataForSymbol(symbol, requestId),
      new Promise(resolve => setTimeout(() => resolve(null), CONFIG.DATA_FETCH_TIMEOUT))
    ]);

    endTiming();
    
    if (!result) {
      logger.log('warn', 'Market context fetch timed out', { symbol });
      return null;
    }

    return result;
  } catch (error) {
    logger.log('error', 'Market context fetch failed', { symbol, error: error.message });
    return null;
  }
}

// ============= SYSTEM PROMPT =============
/**
 * Build the system prompt with market context and STRICT pricing rules
 * 
 * @param {Object} user - User info
 * @param {Object} marketContext - Legacy market context (deprecated)
 * @param {Object} quoteContext - New structured quote context from quote-snapshot.js
 */
function buildSystemPrompt(user, marketContext = null, quoteContext = null) {
  let contextSection = '';
  
  // PRIORITY: Use the new quote context if available (strict pricing)
  if (quoteContext) {
    // Generate strict pricing instructions from quote context
    contextSection = generatePricingInstructions(quoteContext);
  } else if (marketContext?.marketData?.price > 0) {
    // Fallback to legacy market context (deprecated path)
    const md = marketContext.marketData;
    contextSection = `
**LIVE MARKET DATA (fetched just now):**
- Symbol: ${md.symbol}
- Current Price: ${md.price}
- Change: ${md.change || 0} (${md.changePercent || '0'}%)
- High: ${md.high || 'N/A'} | Low: ${md.low || 'N/A'}
- Source: ${md.source}
- Timestamp: ${new Date(md.timestamp).toISOString()}

**STRICT RULE:** You MUST ONLY use the price shown above. Do NOT guess or make up prices.
If the user asks about a different instrument, say "I don't have live data for that instrument."
`;
  } else {
    // No live data available
    contextSection = `
**CRITICAL PRICING RULES:**
Live market quotes are currently UNAVAILABLE. You MUST:
1. Say "Live quote unavailable right now" when asked about specific prices
2. Do NOT guess, estimate, or make up any price numbers
3. You may discuss general market analysis without specific prices
4. Direct users to check their trading platform for live prices
`;
  }

  if (marketContext?.calendar?.events?.length > 0) {
    contextSection += `
**TODAY'S ECONOMIC EVENTS:**
${marketContext.calendar.events.slice(0, 5).map(e => 
  `- ${e.time} ${e.event} (${e.currency}, ${e.impact} impact)`
).join('\n')}
`;
  }

  return `You are AURA AI, a professional trading assistant. You're knowledgeable, conversational, and helpful - like ChatGPT for trading.

**CORE PRINCIPLES:**
1. Be conversational and natural - talk like a helpful expert, not a robot
2. Answer questions directly and concisely
3. When discussing prices or data, ONLY use the live data provided below - NEVER GUESS
4. If you don't have live data for an instrument, clearly say "Live quote unavailable right now"
5. Always prioritize risk management in trading advice
6. Be honest about uncertainty - say "I'm not sure" when appropriate

${contextSection}

**CRITICAL - NEVER VIOLATE THESE RULES:**
- ONLY reference prices that exist in the LIVE MARKET DATA above
- If no live data is shown, say "Live quote unavailable" - do NOT guess
- Never make up specific price numbers
- Always mention the data source when citing prices
- For targets/levels, express as offsets from live price (e.g., "+$20" or "+0.5%")

**SYMBOL CONSISTENCY:**
- XAUUSD = Gold SPOT price (use for "gold", "XAU/USD", "XAUUSD")
- GC = Gold FUTURES (only use if user explicitly asks for futures)
- Never mix spot and futures prices

**USER CONTEXT:**
- Subscription: ${user?.subscription_plan || 'Premium'}
- Role: ${user?.role || 'Member'}

Respond naturally and helpfully. Be concise but thorough. NEVER guess prices.`;
}

// ============= MAIN CHAT FUNCTION =============
/**
 * Generate AI response with market context
 * This is the main entry point for chat requests
 * 
 * STRICT PRICING: This function now enforces strict pricing rules:
 * 1. Detects ALL instruments mentioned in the message
 * 2. Fetches fresh quote snapshots for each
 * 3. Injects structured quote context into the prompt
 * 4. Validates AI output and blocks/rewrites invalid prices
 */
async function generateResponse({
  message,
  images = [],
  conversationHistory = [],
  user,
  requestId
}) {
  const logger = createLogger(requestId);
  logger.log('info', 'Starting chat request', { 
    hasImages: images.length > 0,
    historyLength: conversationHistory.length
  });

  // Validate images
  const { validImages, errors: imageErrors } = processImages(images);
  if (imageErrors.length > 0) {
    logger.log('warn', 'Image validation errors', { errors: imageErrors });
  }

  // ============= NEW: DETECT ALL INSTRUMENTS =============
  // Detect ALL instruments mentioned in the message (not just one)
  const detectedInstruments = detectInstruments(message);
  logger.log('info', 'Detected instruments', { instruments: detectedInstruments });

  // ============= NEW: FETCH FRESH QUOTE SNAPSHOTS =============
  // Fetch fresh quotes for ALL detected instruments in parallel
  let quoteContext = null;
  let quotes = {};
  
  if (detectedInstruments.length > 0) {
    const endQuoteFetch = logger.time('quoteFetch');
    try {
      quotes = await fetchMultipleQuotes(detectedInstruments);
      quoteContext = buildQuoteContext(quotes);
      logger.log('info', 'Quote context built', { 
        available: quoteContext.available,
        instruments: Object.keys(quoteContext.instruments)
      });
    } catch (e) {
      logger.log('warn', 'Quote fetch failed', { error: e.message });
      quoteContext = {
        available: false,
        timestamp: new Date().toISOString(),
        instruments: {},
        message: 'Quote fetch failed: ' + e.message
      };
    }
    endQuoteFetch();
  }

  // Legacy market context (for economic calendar, news, etc.)
  const marketAnalysis = needsMarketData(message);
  const marketContextPromise = marketAnalysis.needs && marketAnalysis.detectedSymbol
    ? fetchMarketContext(marketAnalysis.detectedSymbol, requestId)
    : Promise.resolve(null);

  // Initialize OpenAI
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Wait for legacy market context (for calendar/news)
  let marketContext = null;
  try {
    marketContext = await marketContextPromise;
  } catch (e) {
    logger.log('warn', 'Market context unavailable', { error: e.message });
  }

  // ============= BUILD SYSTEM PROMPT WITH STRICT PRICING =============
  // Pass the quote context to enforce strict pricing rules
  const systemPrompt = buildSystemPrompt(user, marketContext, quoteContext);

  // Build messages
  const messages = buildMessages(systemPrompt, conversationHistory, message, validImages);

  // Determine model
  const model = validImages.length > 0 ? 'gpt-4o' : 'gpt-4o';

  logger.log('info', 'Calling OpenAI', { 
    model, 
    messageCount: messages.length,
    hasMarketContext: !!marketContext,
    hasQuoteContext: !!quoteContext?.available
  });

  const endOpenAI = logger.time('openai');

  try {
    // Call OpenAI with timeout
    const completion = await Promise.race([
      openai.chat.completions.create({
        model,
        messages,
        temperature: 0.7, // Lower temperature for more consistent pricing
        max_tokens: 1500
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI timeout')), CONFIG.OPENAI_TIMEOUT)
      )
    ]);

    endOpenAI();

    let response = completion.choices[0]?.message?.content;

    if (!response) {
      throw new Error('Empty response from OpenAI');
    }

    // ============= NEW: VALIDATE AND SANITIZE AI OUTPUT =============
    // Check that all prices in the response match the injected context
    const endValidation = logger.time('priceValidation');
    const validation = validateAndSanitize(response, quoteContext, {
      strict: false, // Don't block, just add disclaimers
      rewrite: false, // Don't rewrite, just warn
      addDisclaimer: true
    });
    endValidation();

    if (validation.modified) {
      logger.log('warn', 'Response modified by price validator', {
        invalidPrices: validation.validation.invalidPrices.length,
        blocked: validation.blocked
      });
      response = validation.sanitizedResponse;
    }

    if (validation.validation.invalidPrices.length > 0) {
      logger.log('warn', 'Invalid prices detected in AI response', {
        invalidPrices: validation.validation.invalidPrices.map(p => p.value)
      });
    }

    logger.log('info', 'Request completed', logger.summary());

    return {
      success: true,
      response,
      model: completion.model,
      usage: completion.usage,
      marketContext: marketContext ? {
        symbol: marketContext.marketData?.symbol,
        price: marketContext.marketData?.price,
        source: marketContext.marketData?.source
      } : null,
      quoteContext: quoteContext ? {
        available: quoteContext.available,
        instruments: Object.keys(quoteContext.instruments),
        timestamp: quoteContext.timestamp
      } : null,
      priceValidation: validation.validation.summary,
      requestId,
      timing: logger.summary().totalTime
    };

  } catch (error) {
    endOpenAI();
    logger.log('error', 'OpenAI call failed', { error: error.message });

    // Try to generate a fallback response
    try {
      // Even in fallback, include pricing warning if we have no quotes
      const fallbackSystemPrompt = quoteContext?.available 
        ? `You are a helpful assistant. Be brief. Current prices: ${Object.entries(quoteContext.instruments).filter(([_,q]) => q.available).map(([s,q]) => `${s}: ${q.last}`).join(', ')}`
        : 'You are a helpful assistant. Be brief. Say "Live quote unavailable" if asked about prices.';
      
      const fallbackCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: fallbackSystemPrompt },
          { role: 'user', content: message || 'Hello' }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      const fallbackResponse = fallbackCompletion.choices[0]?.message?.content;
      
      if (fallbackResponse) {
        logger.log('info', 'Fallback response generated');
        return {
          success: true,
          response: fallbackResponse,
          model: 'gpt-4o-mini',
          fallback: true,
          requestId,
          timing: logger.summary().totalTime
        };
      }
    } catch (fallbackError) {
      logger.log('error', 'Fallback also failed', { error: fallbackError.message });
    }

    // Ultimate fallback - never fail completely
    return {
      success: true,
      response: "I'm here to help! I experienced a brief issue but I'm ready to assist. Could you please repeat your question?",
      model: 'fallback',
      fallback: true,
      requestId,
      timing: logger.summary().totalTime
    };
  }
}

// ============= EXPORTS =============
module.exports = {
  generateResponse,
  validateImage,
  processImages,
  needsMarketData,
  buildSystemPrompt,
  buildMessages,
  summarizeHistory,
  CONFIG
};
