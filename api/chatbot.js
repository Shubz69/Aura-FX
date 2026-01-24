/**
 * Chatbot API - Provides helpful responses about the website
 * For financial/trading questions, redirects users to Aura AI (premium feature)
 * 
 * HARDENED:
 * - Rate limiting
 * - Concurrency protection
 * - Proper error handling
 * - Structured logging
 * - Circuit breaker for DB calls
 */

require('./utils/suppress-warnings');

const { executeQuery, executeQueryWithTimeout } = require('./db');
const { getCached, setCached } = require('./cache');
const { generateRequestId, createLogger } = require('./utils/logger');
const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('./utils/rate-limiter');
const { withCircuitBreaker, withTimeout } = require('./utils/circuit-breaker');
const { safeString, positiveInt } = require('./utils/validators');

// Track concurrent requests for load protection
let concurrentRequests = 0;
const MAX_CONCURRENT = 50;

module.exports = async (req, res) => {
  const requestId = generateRequestId('chat');
  const logger = createLogger(requestId);
  const startTime = Date.now();
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Request-ID', requestId);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      errorCode: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed',
      requestId 
    });
  }

  // Concurrency protection
  if (concurrentRequests >= MAX_CONCURRENT) {
    logger.warn('Concurrency limit reached');
    return res.status(503).json({
      success: false,
      errorCode: 'SERVICE_BUSY',
      message: 'Service is busy. Please try again shortly.',
      requestId
    });
  }

  // Rate limiting
  const clientId = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  const rateLimitKey = `chatbot_${clientId}`;
  
  if (!checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.MEDIUM.requests, RATE_LIMIT_CONFIGS.MEDIUM.windowMs)) {
    logger.warn('Rate limited', { clientId });
    return res.status(429).json({
      success: false,
      errorCode: 'RATE_LIMITED',
      message: 'Too many requests. Please wait a moment.',
      requestId
    });
  }

  concurrentRequests++;
  
  try {
    const { message, authenticated, userId, userEmail } = req.body;

    // Validate message
    const sanitizedMessage = safeString(message, 1000, '');
    if (!sanitizedMessage || sanitizedMessage.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        errorCode: 'VALIDATION_ERROR',
        message: 'Message is required',
        requestId
      });
    }

    logger.info('Chat request', { messageLength: sanitizedMessage.length, authenticated });

    const msg = sanitizedMessage.toLowerCase().trim();

    // Detect financial/trading analysis questions that require Aura AI
    const financialKeywords = [
      'analyze', 'analysis', 'technical analysis', 'fundamental analysis',
      'market analysis', 'chart analysis', 'price prediction', 'forecast',
      'trading strategy', 'entry point', 'exit point', 'stop loss', 'take profit',
      'risk reward', 'position sizing', 'portfolio', 'investment advice',
      'buy signal', 'sell signal', 'indicator', 'rsi', 'macd', 'bollinger',
      'support level', 'resistance level', 'trend', 'candlestick', 'pattern',
      'what should i trade', 'should i buy', 'should i sell', 'when to enter',
      'when to exit', 'how much to risk', 'what is my risk', 'calculate',
      'trading plan', 'risk management', 'market outlook', 'price target'
    ];

    const isFinancialQuestion = financialKeywords.some(keyword => msg.includes(keyword));

    if (isFinancialQuestion) {
      // Check if user has premium access (with circuit breaker)
      let hasPremiumAccess = false;
      
      if (authenticated && userId) {
        hasPremiumAccess = await withCircuitBreaker(
          'chatbot_db',
          async () => {
            const userIdNum = positiveInt(userId);
            if (!userIdNum) return false;
            
            // Check cache first
            const cacheKey = `user_premium_${userIdNum}`;
            const cached = getCached(cacheKey, 60000); // 1 minute cache
            if (cached !== null) return cached;
            
            const [users] = await executeQueryWithTimeout(
              `SELECT role, subscription_status, subscription_plan 
               FROM users WHERE id = ?`,
              [userIdNum],
              5000,
              requestId
            );
            
            if (users && users.length > 0) {
              const user = users[0];
              const isPremium = 
                user.role === 'premium' || 
                user.role === 'a7fx' || 
                user.role === 'elite' ||
                user.role === 'admin' ||
                user.role === 'super_admin' ||
                (user.subscription_status === 'active' && 
                 (user.subscription_plan === 'aura' || user.subscription_plan === 'a7fx'));
              
              setCached(cacheKey, isPremium, 60000);
              return isPremium;
            }
            
            return false;
          },
          () => false, // Fallback: assume no premium on failure
          { failureThreshold: 3, timeout: 10000 }
        );
      }

      const reply = hasPremiumAccess
        ? `For detailed financial analysis and trading strategies, please use <a href="/premium-ai" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">Aura AI</a>. Aura AI provides professional technical analysis, risk assessments, and trading recommendations tailored to your needs.`
        : `For detailed financial analysis and trading strategies, you'll need access to <a href="/premium-ai" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">Aura AI</a>. Aura AI is available with a Premium subscription. <a href="/subscription" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">Subscribe now</a> to unlock professional trading analysis and insights.`;

      logger.info('Financial question detected', { 
        hasPremiumAccess, 
        ms: Date.now() - startTime 
      });

      return res.status(200).json({
        success: true,
        reply,
        redirectTo: hasPremiumAccess ? '/premium-ai' : '/subscription',
        requiresPremium: !hasPremiumAccess,
        requestId
      });
    }

    // Handle general website questions (offline-capable responses)
    let reply = getStaticResponse(msg, authenticated);

    logger.info('Request completed', { ms: Date.now() - startTime });

    return res.status(200).json({
      success: true,
      reply,
      requestId
    });

  } catch (error) {
    logger.error('Chatbot error', { error, ms: Date.now() - startTime });
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'An error occurred processing your request. Please try again.',
      requestId
    });
  } finally {
    concurrentRequests--;
  }
};

// Static responses (no external calls)
function getStaticResponse(msg, authenticated) {
  // Greetings
  if (msg.includes('hello') || msg.includes('hi ') || msg.includes('hey') || msg.match(/^hi$/) || msg.match(/^hey$/)) {
    return authenticated 
      ? `Hello! 👋 I'm here to help with questions about AURA FX. What would you like to know?`
      : `Hello! Welcome to AURA FX! 👋 I can answer questions about our platform. <a href="/register" style="color: #1E90FF; text-decoration: underline;">Sign up</a> or <a href="/login" style="color: #1E90FF; text-decoration: underline;">log in</a> to access full features!`;
  }
  
  // Platform info
  if (msg.includes('what') && (msg.includes('aura') || msg.includes('platform') || msg.includes('website'))) {
    return 'AURA FX is a professional trading education platform. We teach Forex, Stocks, Crypto, and Options trading with expert strategies and 1-to-1 mentorship.';
  }
  
  // Trading education (general)
  if (msg.includes('trade') || msg.includes('trading') || msg.includes('forex') || msg.includes('crypto') || msg.includes('stock')) {
    return 'AURA FX specializes in trading education. We offer courses in Forex, Stocks, Crypto, and Options trading. Visit our <a href="/courses" style="color: #1E90FF; text-decoration: underline;">Courses page</a> to learn more.\n\n💡 For advanced trading analysis, market insights, and personalized strategies, <a href="/subscription" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">upgrade to Premium</a> to access <a href="/premium-ai" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">Aura AI</a>.';
  }
  
  // Courses
  if (msg.includes('course') || msg.includes('learn') || msg.includes('mentorship')) {
    return 'We offer 1-to-1 trading mentorship. Visit our <a href="/courses" style="color: #1E90FF; text-decoration: underline;">Courses page</a> to see details.';
  }
  
  // Pricing
  if (msg.includes('price') || msg.includes('cost') || msg.includes('subscription')) {
    return 'We offer Aura FX subscription at £99/month and A7FX Elite at £250/month. Visit our <a href="/subscription" style="color: #1E90FF; text-decoration: underline;">Subscription page</a> for details.';
  }
  
  // Sign up/Login
  if (msg.includes('sign up') || msg.includes('register') || msg.includes('create account') || msg.includes('join')) {
    return 'Great! You can <a href="/register" style="color: #1E90FF; text-decoration: underline;">sign up here</a> to access our trading courses and mentorship.';
  }
  
  // Contact
  if (msg.includes('contact') || msg.includes('support') || msg.includes('help')) {
    return 'You can <a href="/contact" style="color: #1E90FF; text-decoration: underline;">contact our support team</a> for assistance.';
  }
  
  // Community
  if (msg.includes('community') || msg.includes('forum') || msg.includes('chat')) {
    return 'Our trading community is where traders connect and share strategies. Access it through the Community section. Subscription required for full access.';
  }
  
  // Default response
  return authenticated
    ? 'I can help with general questions about AURA FX, our courses, and subscriptions. For advanced trading analysis, market insights, and personalized strategies, <a href="/subscription" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">upgrade to Premium</a> to access <a href="/premium-ai" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">Aura AI</a> - our professional AI trading assistant. What would you like to know?'
    : 'I can help with questions about AURA FX, our courses, and subscriptions. For advanced trading analysis and strategies, <a href="/register" style="color: #1E90FF; text-decoration: underline;">sign up</a> and <a href="/subscription" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">upgrade to Premium</a> to access <a href="/premium-ai" style="color: #8B5CF6; text-decoration: underline; font-weight: bold;">Aura AI</a>.';
}
