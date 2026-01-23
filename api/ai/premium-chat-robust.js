/**
 * AURA AI Premium Chat - Production Robust Handler
 * 
 * This module provides ChatGPT-quality reliability guarantees:
 * - ALWAYS returns { success: true, response: string } for valid requests
 * - External data never blocks the AI response
 * - All errors are gracefully handled
 * - Structured logging with request tracing
 * - Backward compatible with existing frontend
 */

const { getDbConnection, executeQuery } = require('../db');
const { getCached, setCached } = require('../cache');

// ============= CONFIGURATION =============
const CONFIG = {
  // Timeouts
  OPENAI_TIMEOUT: 30000,        // 30 seconds for OpenAI
  DATA_FETCH_TIMEOUT: 5000,     // 5 seconds for external data
  DB_TIMEOUT: 3000,             // 3 seconds for DB operations
  TOTAL_REQUEST_TIMEOUT: 55000, // 55 seconds total (Vercel limit is 60s)
  
  // Limits
  MAX_CONVERSATION_TURNS: 20,
  MAX_MESSAGE_LENGTH: 10000,
  MAX_IMAGES: 5,
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  
  // Retry settings
  MAX_RETRIES: 2,
  RETRY_DELAY: 500,
  
  // Cache TTLs
  USER_CACHE_TTL: 60000,        // 1 minute for user data
  MARKET_CACHE_TTL: 30000,      // 30 seconds for market data
};

// ============= LOGGING =============
const createLogger = (requestId) => {
  const startTime = Date.now();
  const timings = {};
  
  return {
    requestId,
    startTime,
    
    time(operation) {
      const opStart = Date.now();
      return () => {
        timings[operation] = Date.now() - opStart;
      };
    },
    
    log(level, message, data = {}) {
      const entry = {
        requestId,
        timestamp: new Date().toISOString(),
        elapsed: Date.now() - startTime,
        level,
        message,
        ...data
      };
      
      if (level === 'error') {
        console.error(JSON.stringify(entry));
      } else {
        console.log(JSON.stringify(entry));
      }
    },
    
    getTimings() {
      return { ...timings, total: Date.now() - startTime };
    }
  };
};

// Generate unique request ID
const generateRequestId = () => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// ============= INPUT VALIDATION =============
function validateRequest(body) {
  const errors = [];
  
  // Validate message
  if (body.message !== undefined && body.message !== null) {
    if (typeof body.message !== 'string') {
      errors.push('Message must be a string');
    } else if (body.message.length > CONFIG.MAX_MESSAGE_LENGTH) {
      errors.push(`Message exceeds maximum length of ${CONFIG.MAX_MESSAGE_LENGTH}`);
    }
  }
  
  // Validate images
  if (body.images !== undefined) {
    if (!Array.isArray(body.images)) {
      errors.push('Images must be an array');
    } else if (body.images.length > CONFIG.MAX_IMAGES) {
      errors.push(`Maximum ${CONFIG.MAX_IMAGES} images allowed`);
    }
  }
  
  // Validate conversation history
  if (body.conversationHistory !== undefined) {
    if (!Array.isArray(body.conversationHistory)) {
      errors.push('Conversation history must be an array');
    }
  }
  
  // Require message or images
  const hasMessage = body.message && typeof body.message === 'string' && body.message.trim().length > 0;
  const hasImages = body.images && Array.isArray(body.images) && body.images.length > 0;
  
  if (!hasMessage && !hasImages) {
    errors.push('Message or images required');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      message: body.message?.trim() || '',
      images: Array.isArray(body.images) ? body.images.slice(0, CONFIG.MAX_IMAGES) : [],
      conversationHistory: Array.isArray(body.conversationHistory) 
        ? body.conversationHistory.slice(-CONFIG.MAX_CONVERSATION_TURNS * 2)
        : []
    }
  };
}

// ============= IMAGE VALIDATION =============
function validateImages(images) {
  if (!images || !Array.isArray(images)) return { valid: [], invalid: [] };
  
  const valid = [];
  const invalid = [];
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  for (const img of images) {
    if (!img || typeof img !== 'string') {
      invalid.push({ image: img, error: 'Invalid image data' });
      continue;
    }
    
    // Check data URL format
    if (img.startsWith('data:')) {
      const match = img.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        invalid.push({ image: img.substring(0, 50), error: 'Invalid data URL format' });
        continue;
      }
      
      const mimeType = match[1];
      const base64Data = match[2];
      
      if (!allowedTypes.includes(mimeType)) {
        invalid.push({ image: img.substring(0, 50), error: `Unsupported type: ${mimeType}` });
        continue;
      }
      
      // Check size (base64 is ~4/3 larger than binary)
      const estimatedSize = (base64Data.length * 3) / 4;
      if (estimatedSize > CONFIG.MAX_IMAGE_SIZE) {
        invalid.push({ image: img.substring(0, 50), error: 'Image too large (max 10MB)' });
        continue;
      }
      
      valid.push(img);
    } else if (img.startsWith('http://') || img.startsWith('https://')) {
      // URL - accept but note we can't validate size
      valid.push(img);
    } else {
      invalid.push({ image: img.substring(0, 50), error: 'Invalid image format' });
    }
  }
  
  return { valid, invalid };
}

// ============= TOKEN DECODING =============
function decodeToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'No token provided' };
  }
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'Invalid token format' };
    }
    
    // Decode payload
    const payloadBase64 = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const padding = payloadBase64.length % 4;
    const paddedPayload = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
    
    const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf-8');
    const decoded = JSON.parse(payloadJson);
    
    // Check expiration
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Token expired' };
    }
    
    return {
      valid: true,
      payload: decoded,
      userId: decoded.id || decoded.userId
    };
  } catch (error) {
    return { valid: false, error: 'Token decode failed' };
  }
}

// ============= USER VERIFICATION =============
async function verifyUser(userId, logger) {
  const cacheKey = `user_${userId}`;
  const cached = getCached(cacheKey, CONFIG.USER_CACHE_TTL);
  if (cached) {
    return { success: true, user: cached, cached: true };
  }
  
  const endTiming = logger.time('dbUserVerify');
  
  try {
    const [rows] = await Promise.race([
      executeQuery(
        'SELECT id, email, role, subscription_status, subscription_plan FROM users WHERE id = ?',
        [userId]
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB timeout')), CONFIG.DB_TIMEOUT))
    ]);
    
    endTiming();
    
    if (!rows || rows.length === 0) {
      return { success: false, error: 'User not found' };
    }
    
    const user = rows[0];
    setCached(cacheKey, user);
    
    return { success: true, user, cached: false };
  } catch (error) {
    endTiming();
    logger.log('error', 'User verification failed', { error: error.message });
    return { success: false, error: error.message };
  }
}

// ============= ACCESS CHECK =============
function checkAccess(user) {
  const SUPER_ADMIN_EMAIL = 'shubzfx@gmail.com';
  
  const isSuperAdmin = user.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
  const hasRole = ['premium', 'a7fx', 'elite', 'admin', 'super_admin'].includes(user.role);
  const hasSubscription = user.subscription_status === 'active' && 
    ['aura', 'a7fx', 'premium', 'elite'].includes(user.subscription_plan);
  
  return isSuperAdmin || hasRole || hasSubscription;
}

// ============= CONVERSATION HISTORY =============
function buildConversationMessages(systemPrompt, history, currentMessage, validImages) {
  const messages = [
    { role: 'system', content: systemPrompt }
  ];
  
  // Add history (already limited by validation)
  if (history && Array.isArray(history)) {
    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        // Handle messages with images in history
        if (msg.images && Array.isArray(msg.images) && msg.images.length > 0) {
          messages.push({
            role: msg.role,
            content: [
              ...msg.images.map(img => ({
                type: 'image_url',
                image_url: { url: img }
              })),
              { type: 'text', text: msg.content || '' }
            ]
          });
        } else {
          messages.push({
            role: msg.role,
            content: msg.content || ''
          });
        }
      }
    }
  }
  
  // Add current message
  if (validImages.length > 0) {
    messages.push({
      role: 'user',
      content: [
        ...validImages.map(img => ({
          type: 'image_url',
          image_url: { url: img, detail: 'high' }
        })),
        { type: 'text', text: currentMessage || 'Please analyze this image.' }
      ]
    });
  } else {
    messages.push({
      role: 'user',
      content: currentMessage || ''
    });
  }
  
  return messages;
}

// ============= SYSTEM PROMPT =============
function getSystemPrompt(user) {
  const tier = user.subscription_plan === 'a7fx' || user.role === 'elite' ? 'A7FX Elite' : 'Premium';
  
  return `You are AURA AI, a professional trading assistant. You're knowledgeable, conversational, helpful, and engaging - just like ChatGPT.

**CORE PRINCIPLES:**
1. Be conversational and natural - talk like a helpful expert, not a robot
2. Answer questions directly - don't refuse to help
3. When discussing markets, be clear about what is your analysis vs live data
4. Always prioritize risk management in trading advice
5. Be honest about uncertainty

**RESPONSE FORMAT:**
When providing trading analysis, structure your response clearly:
- **Current Situation**: What's happening now
- **Key Drivers**: What's moving the market
- **Technical View**: Key levels, trends, patterns
- **Risk Factors**: What could go wrong
- **Recommendation**: Clear, actionable guidance

**USER CONTEXT:**
- Subscription: ${tier}
- Role: ${user.role || 'Member'}

Be helpful, conversational, and engaging. Answer questions naturally.`;
}

// ============= MAIN HANDLER =============
async function handlePremiumChat(req) {
  const requestId = generateRequestId();
  const logger = createLogger(requestId);
  
  logger.log('info', 'Request started', { 
    method: req.method,
    contentLength: req.headers?.['content-length']
  });
  
  // Validate request body
  const validation = validateRequest(req.body || {});
  if (!validation.valid) {
    logger.log('warn', 'Validation failed', { errors: validation.errors });
    return {
      status: 400,
      body: {
        success: false,
        message: validation.errors.join(', '),
        requestId
      }
    };
  }
  
  const { message, images, conversationHistory } = validation.sanitized;
  
  // Validate images
  const imageValidation = validateImages(images);
  if (imageValidation.invalid.length > 0) {
    logger.log('warn', 'Some images invalid', { invalid: imageValidation.invalid });
  }
  
  // Decode and validate token
  const token = req.headers?.authorization?.replace('Bearer ', '');
  const tokenResult = decodeToken(token);
  
  if (!tokenResult.valid) {
    logger.log('warn', 'Token invalid', { error: tokenResult.error });
    return {
      status: 401,
      body: {
        success: false,
        message: tokenResult.error,
        requestId
      }
    };
  }
  
  // Verify user
  const userResult = await verifyUser(tokenResult.userId, logger);
  
  if (!userResult.success) {
    logger.log('warn', 'User verification failed', { error: userResult.error });
    return {
      status: 404,
      body: {
        success: false,
        message: userResult.error === 'User not found' ? 'User not found' : 'Verification failed',
        requestId
      }
    };
  }
  
  const user = userResult.user;
  
  // Check access
  if (!checkAccess(user)) {
    logger.log('warn', 'Access denied', { userId: user.id, role: user.role });
    return {
      status: 403,
      body: {
        success: false,
        message: 'Premium subscription required to access the AI assistant.',
        requestId
      }
    };
  }
  
  // Initialize OpenAI
  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Build messages
  const systemPrompt = getSystemPrompt(user);
  const messages = buildConversationMessages(
    systemPrompt,
    conversationHistory,
    message,
    imageValidation.valid
  );
  
  // Determine model (use vision model if images present)
  const model = imageValidation.valid.length > 0 ? 'gpt-4o' : 'gpt-4o';
  
  logger.log('info', 'Calling OpenAI', { 
    model, 
    messageCount: messages.length,
    hasImages: imageValidation.valid.length > 0
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
    
    if (!response || response.trim() === '') {
      throw new Error('Empty response from OpenAI');
    }
    
    logger.log('info', 'Request completed', {
      timings: logger.getTimings(),
      responseLength: response.length
    });
    
    return {
      status: 200,
      body: {
        success: true,
        response,
        model: completion.model,
        usage: completion.usage,
        requestId,
        timing: logger.getTimings().total
      }
    };
    
  } catch (error) {
    endOpenAI();
    logger.log('error', 'OpenAI call failed', { error: error.message });
    
    // Try fallback with simpler model
    try {
      logger.log('info', 'Attempting fallback');
      
      const fallbackCompletion = await Promise.race([
        openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: 'You are a helpful trading assistant. Be concise and helpful.' },
            { role: 'user', content: message || 'Hello' }
          ],
          temperature: 0.8,
          max_tokens: 800
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Fallback timeout')), 15000)
        )
      ]);
      
      const fallbackResponse = fallbackCompletion.choices[0]?.message?.content;
      
      if (fallbackResponse && fallbackResponse.trim() !== '') {
        logger.log('info', 'Fallback succeeded', { timings: logger.getTimings() });
        
        return {
          status: 200,
          body: {
            success: true,
            response: fallbackResponse,
            model: 'gpt-4o-mini',
            fallback: true,
            requestId,
            timing: logger.getTimings().total
          }
        };
      }
    } catch (fallbackError) {
      logger.log('error', 'Fallback also failed', { error: fallbackError.message });
    }
    
    // Ultimate fallback - NEVER return empty response
    logger.log('warn', 'Using ultimate fallback response');
    
    return {
      status: 200,
      body: {
        success: true,
        response: "I'm here to help with your trading questions! I experienced a brief hiccup, but I'm ready to assist. Could you please repeat your question? I can help with market analysis, trading strategies, technical analysis, and more.",
        model: 'fallback',
        fallback: true,
        requestId,
        timing: logger.getTimings().total
      }
    };
  }
}

// ============= EXPRESS HANDLER =============
module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }
  
  // Check API key
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      success: false,
      message: 'AI service is not configured. Please contact support.'
    });
  }
  
  try {
    const result = await handlePremiumChat(req);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Unhandled error in premium-chat-robust:', error);
    
    // Even for unhandled errors, return a valid response
    return res.status(200).json({
      success: true,
      response: "I'm here to help! I encountered a temporary issue but I'm ready to assist. Please try your question again.",
      model: 'error-fallback',
      fallback: true,
      requestId: generateRequestId()
    });
  }
};

// Export helpers for testing
module.exports.validateRequest = validateRequest;
module.exports.validateImages = validateImages;
module.exports.decodeToken = decodeToken;
module.exports.checkAccess = checkAccess;
module.exports.CONFIG = CONFIG;
