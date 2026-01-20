// Rate Limiting Middleware
// Prevents abuse of AI endpoints and webhooks

// In-memory rate limit store (in production, use Redis)
const rateLimitStore = new Map();

// Default rate limits
const RATE_LIMITS = {
  '/api/ai/premium-chat': { requests: 30, window: 60000 }, // 30 requests per minute
  '/api/tradingview-webhook': { requests: 100, window: 60000 }, // 100 requests per minute
  '/api/ai/market-data': { requests: 60, window: 60000 }, // 60 requests per minute
  '/api/ai/market-news': { requests: 30, window: 60000 }, // 30 requests per minute
  '/api/ai/forex-factory-calendar': { requests: 20, window: 60000 }, // 20 requests per minute
  '/api/ai/trading-calculator': { requests: 100, window: 60000 }, // 100 requests per minute
  default: { requests: 30, window: 60000 } // Default: 30 requests per minute
};

/**
 * Rate limiting middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
function rateLimiter(req, res, next) {
  const path = req.path || req.url.split('?')[0];
  const limit = RATE_LIMITS[path] || RATE_LIMITS.default;
  
  // Get identifier (user ID if authenticated, IP if not)
  const identifier = req.user?.id || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'anonymous';
  const key = `${path}:${identifier}`;
  
  const now = Date.now();
  const windowStart = now - limit.window;
  
  // Get or create rate limit entry
  let entry = rateLimitStore.get(key);
  
  if (!entry) {
    entry = { requests: [], resetTime: now + limit.window };
    rateLimitStore.set(key, entry);
  }
  
  // Clean old requests outside the window
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);
  
  // Check if limit exceeded
  if (entry.requests.length >= limit.requests) {
    const retryAfter = Math.ceil((entry.requests[0] + limit.window - now) / 1000);
    
    res.setHeader('X-RateLimit-Limit', limit.requests);
    res.setHeader('X-RateLimit-Remaining', 0);
    res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
    res.setHeader('Retry-After', retryAfter);
    
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      message: `Too many requests. Limit: ${limit.requests} per ${limit.window / 1000} seconds. Retry after ${retryAfter} seconds.`,
      retryAfter
    });
  }
  
  // Add current request
  entry.requests.push(now);
  entry.resetTime = now + limit.window;
  
  // Set rate limit headers
  res.setHeader('X-RateLimit-Limit', limit.requests);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, limit.requests - entry.requests.length));
  res.setHeader('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
  
  // Clean up old entries periodically (every 5 minutes)
  if (Math.random() < 0.01) { // 1% chance on each request
    cleanupRateLimitStore();
  }
  
  next();
}

/**
 * Clean up old rate limit entries
 */
function cleanupRateLimitStore() {
  const now = Date.now();
  const maxAge = 3600000; // 1 hour
  
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetTime < now - maxAge) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Get rate limit status for a user/IP
 * @param {String} path - API path
 * @param {String} identifier - User ID or IP
 * @returns {Object} Rate limit status
 */
function getRateLimitStatus(path, identifier) {
  const limit = RATE_LIMITS[path] || RATE_LIMITS.default;
  const key = `${path}:${identifier}`;
  const entry = rateLimitStore.get(key);
  
  if (!entry) {
    return {
      limit: limit.requests,
      remaining: limit.requests,
      reset: new Date(Date.now() + limit.window).toISOString()
    };
  }
  
  const now = Date.now();
  const windowStart = now - limit.window;
  entry.requests = entry.requests.filter(timestamp => timestamp > windowStart);
  
  return {
    limit: limit.requests,
    remaining: Math.max(0, limit.requests - entry.requests.length),
    reset: new Date(entry.resetTime).toISOString()
  };
}

module.exports = {
  rateLimiter,
  getRateLimitStatus,
  RATE_LIMITS
};
