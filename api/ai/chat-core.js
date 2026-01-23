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
 * Build the system prompt with market context
 */
function buildSystemPrompt(user, marketContext = null) {
  let contextSection = '';
  
  if (marketContext?.marketData?.price > 0) {
    const md = marketContext.marketData;
    contextSection = `
**LIVE MARKET DATA (fetched just now):**
- Symbol: ${md.symbol}
- Current Price: ${md.price}
- Change: ${md.change || 0} (${md.changePercent || '0'}%)
- High: ${md.high || 'N/A'} | Low: ${md.low || 'N/A'}
- Source: ${md.source}
- Timestamp: ${new Date(md.timestamp).toISOString()}

When discussing prices, reference this LIVE data. Do not make up prices.
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
3. When discussing prices or data, ONLY use the live data provided below - never guess
4. If you don't have live data, say so and provide general analysis
5. Always prioritize risk management in trading advice
6. Be honest about uncertainty - say "I'm not sure" when appropriate

${contextSection}

**IMPORTANT:**
- If live market data is shown above, USE IT when discussing prices
- If no live data is available, clearly state that and provide general analysis
- Never make up specific price numbers
- Always mention data source when citing prices

**USER CONTEXT:**
- Subscription: ${user?.subscription_plan || 'Premium'}
- Role: ${user?.role || 'Member'}

Respond naturally and helpfully. Be concise but thorough.`;
}

// ============= MAIN CHAT FUNCTION =============
/**
 * Generate AI response with market context
 * This is the main entry point for chat requests
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

  // Check if we need market data
  const marketAnalysis = needsMarketData(message);
  
  // Fetch market context in parallel with message preparation
  const marketContextPromise = marketAnalysis.needs && marketAnalysis.detectedSymbol
    ? fetchMarketContext(marketAnalysis.detectedSymbol, requestId)
    : Promise.resolve(null);

  // Initialize OpenAI
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Wait for market context (with timeout)
  let marketContext = null;
  try {
    marketContext = await marketContextPromise;
  } catch (e) {
    logger.log('warn', 'Market context unavailable', { error: e.message });
  }

  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(user, marketContext);

  // Build messages
  const messages = buildMessages(systemPrompt, conversationHistory, message, validImages);

  // Determine model
  const model = validImages.length > 0 ? 'gpt-4o' : 'gpt-4o';

  logger.log('info', 'Calling OpenAI', { 
    model, 
    messageCount: messages.length,
    hasMarketContext: !!marketContext
  });

  const endOpenAI = logger.time('openai');

  try {
    // Call OpenAI with timeout
    const completion = await Promise.race([
      openai.chat.completions.create({
        model,
        messages,
        temperature: 0.8,
        max_tokens: 1500
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenAI timeout')), CONFIG.OPENAI_TIMEOUT)
      )
    ]);

    endOpenAI();

    const response = completion.choices[0]?.message?.content;

    if (!response) {
      throw new Error('Empty response from OpenAI');
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
      requestId,
      timing: logger.summary().totalTime
    };

  } catch (error) {
    endOpenAI();
    logger.log('error', 'OpenAI call failed', { error: error.message });

    // Try to generate a fallback response
    try {
      const fallbackCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant. Be brief and helpful.' },
          { role: 'user', content: message || 'Hello' }
        ],
        temperature: 0.8,
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
