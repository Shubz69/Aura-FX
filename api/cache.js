/**
 * Simple in-memory cache for API responses
 * Use this to cache expensive database queries
 */

const cache = new Map();

/**
 * Get cached data
 * @param {string} key - Cache key
 * @param {number} ttl - Time to live in milliseconds (default: 5 minutes)
 * @returns {any|null} Cached data or null if expired/not found
 */
const getCached = (key, ttl = 300000) => {
  const item = cache.get(key);
  if (!item) return null;
  
  const age = Date.now() - item.timestamp;
  if (age > ttl) {
    cache.delete(key);
    return null;
  }
  
  return item.data;
};

/**
 * Set cached data
 * @param {string} key - Cache key
 * @param {any} data - Data to cache
 */
const setCached = (key, data) => {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
};

/**
 * Delete cached data
 * @param {string} key - Cache key
 */
const deleteCached = (key) => {
  cache.delete(key);
};

/**
 * Clear all cache
 */
const clearCache = () => {
  cache.clear();
};

/**
 * Get cache statistics
 */
const getCacheStats = () => {
  return {
    size: cache.size,
    keys: Array.from(cache.keys())
  };
};

/**
 * Clean expired cache entries
 */
const cleanExpired = (ttl = 300000) => {
  const now = Date.now();
  for (const [key, item] of cache.entries()) {
    if (now - item.timestamp > ttl) {
      cache.delete(key);
    }
  }
};

// Clean expired entries every 10 minutes
setInterval(() => {
  cleanExpired();
}, 600000);

module.exports = {
  getCached,
  setCached,
  deleteCached,
  clearCache,
  getCacheStats,
  cleanExpired
};
