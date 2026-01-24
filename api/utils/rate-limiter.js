/**
 * Rate Limiter with Request Coalescing
 * 
 * Provides:
 * - Sliding window rate limiting
 * - Request coalescing (dedup concurrent identical requests)
 * - Per-endpoint configuration
 */

// Rate limit storage
const rateLimits = new Map();

// Pending requests for coalescing
const pendingRequests = new Map();

/**
 * Check if request is within rate limit
 * Uses sliding window algorithm
 * 
 * @param {string} key - Unique identifier (e.g., "endpoint_userId" or "endpoint_ip")
 * @param {number} maxRequests - Maximum requests allowed in window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {boolean} True if request is allowed
 */
function checkRateLimit(key, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  // Get or create rate limit entry
  let entry = rateLimits.get(key);
  if (!entry) {
    entry = { requests: [] };
    rateLimits.set(key, entry);
  }
  
  // Remove expired requests
  entry.requests = entry.requests.filter(time => time > windowStart);
  
  // Check limit
  if (entry.requests.length >= maxRequests) {
    return false;
  }
  
  // Add current request
  entry.requests.push(now);
  return true;
}

/**
 * Get remaining requests for a key
 */
function getRemainingRequests(key, maxRequests = 100, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  const entry = rateLimits.get(key);
  if (!entry) {
    return maxRequests;
  }
  
  const validRequests = entry.requests.filter(time => time > windowStart);
  return Math.max(0, maxRequests - validRequests.length);
}

/**
 * Request coalescing - combine concurrent identical requests
 * 
 * When multiple requests for the same resource come in simultaneously,
 * only the first one executes; others wait for its result.
 * 
 * @param {string} key - Unique identifier for the request
 * @param {Function} executor - Async function to execute
 * @param {number} ttlMs - How long to cache the pending promise (default: 100ms)
 * @returns {Promise} Result of the executor
 */
async function coalesceRequest(key, executor, ttlMs = 100) {
  // Check if there's a pending request
  const pending = pendingRequests.get(key);
  if (pending && Date.now() - pending.timestamp < ttlMs) {
    // Wait for existing request
    return pending.promise;
  }
  
  // Create new request
  const promise = executor();
  const entry = {
    promise,
    timestamp: Date.now()
  };
  
  pendingRequests.set(key, entry);
  
  try {
    const result = await promise;
    return result;
  } finally {
    // Clean up after TTL
    setTimeout(() => {
      const current = pendingRequests.get(key);
      if (current === entry) {
        pendingRequests.delete(key);
      }
    }, ttlMs);
  }
}

/**
 * Clean up old rate limit entries periodically
 */
function cleanupRateLimits(maxAge = 300000) {
  const now = Date.now();
  const cutoff = now - maxAge;
  
  for (const [key, entry] of rateLimits.entries()) {
    // Remove entries with no recent requests
    const hasRecent = entry.requests.some(time => time > cutoff);
    if (!hasRecent) {
      rateLimits.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(() => cleanupRateLimits(), 300000);

/**
 * Pre-configured rate limits for different endpoint types
 */
const RATE_LIMIT_CONFIGS = {
  // High-frequency endpoints (leaderboard, community)
  HIGH: { requests: 120, windowMs: 60000 },
  
  // Medium-frequency endpoints (notifications, friends)
  MEDIUM: { requests: 60, windowMs: 60000 },
  
  // Low-frequency endpoints (AI, auth)
  LOW: { requests: 20, windowMs: 60000 },
  
  // Very restrictive (password reset, etc.)
  STRICT: { requests: 5, windowMs: 300000 },
  
  // Burst-tolerant (WebSocket connections)
  BURST: { requests: 200, windowMs: 60000 }
};

module.exports = {
  checkRateLimit,
  getRemainingRequests,
  coalesceRequest,
  cleanupRateLimits,
  RATE_LIMIT_CONFIGS
};
