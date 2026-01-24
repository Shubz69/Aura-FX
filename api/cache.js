/**
 * Production-Grade In-Memory Cache
 * 
 * Features:
 * - TTL-based expiration
 * - Request coalescing (prevent stampedes)
 * - Pattern-based invalidation
 * - Cache warming
 * - Statistics and monitoring
 */

const cache = new Map();
const pendingRequests = new Map();

// Cache statistics
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
  coalesced: 0
};

// Default TTLs by category
const DEFAULT_TTLS = {
  LEADERBOARD: 60000,      // 1 minute
  LEADERBOARD_ALLTIME: 300000, // 5 minutes
  CHANNELS: 120000,        // 2 minutes
  ONLINE_COUNT: 30000,     // 30 seconds
  USER_SUMMARY: 60000,     // 1 minute
  NOTIFICATIONS_COUNT: 10000, // 10 seconds
  FRIENDS_LIST: 30000,     // 30 seconds
  MARKET_DATA: 60000,      // 1 minute
  DEFAULT: 300000          // 5 minutes
};

/**
 * Get cached data
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in milliseconds (default: 5 minutes)
 * @returns {any|null} Cached data or null if expired/not found
 */
const getCached = (key, ttl = DEFAULT_TTLS.DEFAULT) => {
  const item = cache.get(key);
  if (!item) {
    stats.misses++;
    return null;
  }
  
  const age = Date.now() - item.timestamp;
  if (age > ttl) {
    cache.delete(key);
    stats.misses++;
    return null;
  }
  
  stats.hits++;
  return item.data;
};

/**
 * Get cached data with metadata
 */
const getCachedWithMeta = (key, ttl = DEFAULT_TTLS.DEFAULT) => {
  const item = cache.get(key);
  if (!item) {
    stats.misses++;
    return { data: null, found: false };
  }
  
  const age = Date.now() - item.timestamp;
  if (age > ttl) {
    cache.delete(key);
    stats.misses++;
    return { data: null, found: false, expired: true };
  }
  
  stats.hits++;
  return { 
    data: item.data, 
    found: true, 
    age,
    stale: age > ttl * 0.8 // Flag if approaching expiration
  };
};

/**
 * Set cached data
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 * @param {number} ttl - Optional TTL override
 */
const setCached = (key, data, ttl = null) => {
  stats.sets++;
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttl || DEFAULT_TTLS.DEFAULT
  });
};

/**
 * Delete cached data
 * @param {string} key - Cache key
 */
const deleteCached = (key) => {
  const deleted = cache.delete(key);
  if (deleted) stats.invalidations++;
  return deleted;
};

/**
 * Invalidate cache entries matching a pattern
 * @param {string} pattern - Pattern to match (e.g., 'leaderboard_*')
 */
const invalidatePattern = (pattern) => {
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  let count = 0;
  
  for (const key of cache.keys()) {
    if (regex.test(key)) {
      cache.delete(key);
      count++;
    }
  }
  
  stats.invalidations += count;
  return count;
};

/**
 * Clear all cache
 */
const clearCache = () => {
  const size = cache.size;
  cache.clear();
  stats.invalidations += size;
};

/**
 * Get cache statistics
 */
const getCacheStats = () => {
  const hitRate = stats.hits + stats.misses > 0
    ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(1)
    : 0;
    
  return {
    size: cache.size,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: `${hitRate}%`,
    sets: stats.sets,
    invalidations: stats.invalidations,
    coalesced: stats.coalesced,
    keys: Array.from(cache.keys()).slice(0, 50) // Limit for display
  };
};

/**
 * Request coalescing - combine concurrent identical requests
 * Prevents cache stampedes when cache expires
 * 
 * @param {string} key - Cache key
 * @param {Function} fetcher - Async function to fetch data
 * @param {number} ttl - TTL for cached result
 * @returns {Promise} Result
 */
const getOrFetch = async (key, fetcher, ttl = DEFAULT_TTLS.DEFAULT) => {
  // Check cache first
  const cached = getCached(key, ttl);
  if (cached !== null) {
    return cached;
  }
  
  // Check if there's a pending request for this key
  const pending = pendingRequests.get(key);
  if (pending) {
    stats.coalesced++;
    return pending;
  }
  
  // Create new request
  const promise = (async () => {
    try {
      const data = await fetcher();
      setCached(key, data, ttl);
      return data;
    } finally {
      // Clean up pending request after a short delay
      // (allows other concurrent requests to benefit)
      setTimeout(() => pendingRequests.delete(key), 50);
    }
  })();
  
  pendingRequests.set(key, promise);
  return promise;
};

/**
 * Stale-while-revalidate pattern
 * Returns stale data immediately while refreshing in background
 * 
 * @param {string} key - Cache key
 * @param {Function} fetcher - Async function to fetch data
 * @param {number} ttl - Fresh TTL
 * @param {number} staleTtl - How long stale data is acceptable
 */
const getStaleWhileRevalidate = async (key, fetcher, ttl = 60000, staleTtl = 300000) => {
  const item = cache.get(key);
  const now = Date.now();
  
  if (item) {
    const age = now - item.timestamp;
    
    // Fresh - return immediately
    if (age < ttl) {
      stats.hits++;
      return item.data;
    }
    
    // Stale but acceptable - return and refresh in background
    if (age < staleTtl) {
      stats.hits++;
      // Refresh in background (fire and forget)
      getOrFetch(key, fetcher, ttl).catch(() => {});
      return item.data;
    }
  }
  
  // Too stale or not found - must fetch
  stats.misses++;
  return getOrFetch(key, fetcher, ttl);
};

/**
 * Clean expired cache entries
 */
const cleanExpired = (maxAge = 600000) => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, item] of cache.entries()) {
    const ttl = item.ttl || DEFAULT_TTLS.DEFAULT;
    if (now - item.timestamp > Math.max(ttl, maxAge)) {
      cache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`Cache cleanup: removed ${cleaned} expired entries`);
  }
  
  return cleaned;
};

/**
 * Warm the cache with common queries
 */
const warmCache = async (warmers) => {
  const results = await Promise.allSettled(
    warmers.map(async ({ key, fetcher, ttl }) => {
      try {
        const data = await fetcher();
        setCached(key, data, ttl);
        return { key, success: true };
      } catch (error) {
        return { key, success: false, error: error.message };
      }
    })
  );
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  console.log(`Cache warmed: ${successful}/${warmers.length} entries`);
  return results;
};

// Clean expired entries every 5 minutes
setInterval(() => {
  cleanExpired();
}, 300000);

module.exports = {
  getCached,
  getCachedWithMeta,
  setCached,
  deleteCached,
  invalidatePattern,
  clearCache,
  getCacheStats,
  getOrFetch,
  getStaleWhileRevalidate,
  cleanExpired,
  warmCache,
  DEFAULT_TTLS
};
