/**
 * AURA AI Data Layer - Robust, ChatGPT-like Architecture
 * 
 * Key principles:
 * 1. AI response is NEVER blocked by data fetching
 * 2. All external sources have caching, circuit breakers, and fallbacks
 * 3. Structured logging with request tracing
 * 4. Deterministic adapter pattern with validation
 */

const { getCached, setCached } = require('../../cache');

// ============= CONFIGURATION =============
const CONFIG = {
  // Cache TTLs (in milliseconds)
  CACHE_TTL: {
    MARKET_DATA: 30000,      // 30 seconds - prices update frequently
    ECONOMIC_CALENDAR: 300000, // 5 minutes - events don't change often
    NEWS: 120000,            // 2 minutes - news updates moderately
    TRADINGVIEW_ALERTS: 60000, // 1 minute - alerts are time-sensitive
    KNOWLEDGE_BASE: 600000   // 10 minutes - static content
  },
  
  // Timeouts (in milliseconds)
  TIMEOUTS: {
    ADAPTER_DEFAULT: 5000,   // 5 seconds max per adapter
    ADAPTER_FAST: 2000,      // 2 seconds for fast sources
    CIRCUIT_BREAKER_RESET: 30000 // 30 seconds before retrying failed adapter
  },
  
  // Circuit breaker thresholds
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 3,    // Open circuit after 3 failures
    SUCCESS_THRESHOLD: 2     // Close circuit after 2 successes
  }
};

// ============= CIRCUIT BREAKER =============
class CircuitBreaker {
  constructor(name) {
    this.name = name;
    this.failures = 0;
    this.successes = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.lastFailureTime = null;
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      // Check if we should try again
      if (Date.now() - this.lastFailureTime > CONFIG.TIMEOUTS.CIRCUIT_BREAKER_RESET) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN
  }

  recordSuccess() {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= CONFIG.CIRCUIT_BREAKER.SUCCESS_THRESHOLD) {
        this.state = 'CLOSED';
        this.successes = 0;
      }
    }
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    this.successes = 0;
    if (this.failures >= CONFIG.CIRCUIT_BREAKER.FAILURE_THRESHOLD) {
      this.state = 'OPEN';
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// ============= ADAPTER BASE CLASS =============
class DataAdapter {
  constructor(name, options = {}) {
    this.name = name;
    this.timeout = options.timeout || CONFIG.TIMEOUTS.ADAPTER_DEFAULT;
    this.circuitBreaker = new CircuitBreaker(name);
    this.requestCount = 0;
    this.lastRequestTime = null;
  }

  // Validate input before making request
  validateInput(input) {
    return true; // Override in subclass
  }

  // Validate output before returning
  validateOutput(output) {
    return output !== null && output !== undefined;
  }

  // Get cache key
  getCacheKey(params) {
    return `${this.name}:${JSON.stringify(params)}`;
  }

  // Execute with circuit breaker and timeout
  async execute(fetchFn, params, cacheTTL) {
    const cacheKey = this.getCacheKey(params);
    
    // Try cache first
    const cached = getCached(cacheKey, cacheTTL);
    if (cached) {
      return { data: cached, source: this.name, cached: true };
    }

    // Check circuit breaker
    if (!this.circuitBreaker.canExecute()) {
      return { data: null, source: this.name, error: 'Circuit breaker open', circuitOpen: true };
    }

    try {
      // Execute with timeout
      const result = await Promise.race([
        fetchFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        )
      ]);

      if (this.validateOutput(result)) {
        this.circuitBreaker.recordSuccess();
        setCached(cacheKey, result);
        this.requestCount++;
        this.lastRequestTime = Date.now();
        return { data: result, source: this.name, cached: false };
      } else {
        throw new Error('Invalid response');
      }
    } catch (error) {
      this.circuitBreaker.recordFailure();
      return { data: null, source: this.name, error: error.message };
    }
  }

  getStatus() {
    return {
      name: this.name,
      circuitBreaker: this.circuitBreaker.getStatus(),
      requestCount: this.requestCount,
      lastRequestTime: this.lastRequestTime
    };
  }
}

// ============= STRUCTURED LOGGING =============
const createLogger = (requestId) => {
  const startTime = Date.now();
  const timings = {};
  
  return {
    requestId,
    startTime,
    
    logTiming(operation, duration) {
      timings[operation] = duration;
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

// ============= DATA LAYER MANAGER =============
class DataLayerManager {
  constructor() {
    this.adapters = new Map();
    this.globalRequestCount = 0;
  }

  registerAdapter(name, adapter) {
    this.adapters.set(name, adapter);
  }

  getAdapter(name) {
    return this.adapters.get(name);
  }

  // Fetch from multiple adapters in parallel with fallback
  async fetchWithFallback(adapterNames, params, cacheTTL) {
    const promises = adapterNames.map(name => {
      const adapter = this.adapters.get(name);
      if (!adapter) return Promise.resolve({ data: null, source: name, error: 'Adapter not found' });
      return adapter.execute(() => adapter.fetch(params), params, cacheTTL);
    });

    const results = await Promise.allSettled(promises);
    
    // Return first successful result
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.data) {
        return result.value;
      }
    }

    // All failed - return the first error
    return results[0]?.value || { data: null, error: 'All adapters failed' };
  }

  // Get health status of all adapters
  getHealthStatus() {
    const status = {
      healthy: true,
      adapters: {}
    };

    for (const [name, adapter] of this.adapters) {
      const adapterStatus = adapter.getStatus();
      status.adapters[name] = adapterStatus;
      if (adapterStatus.circuitBreaker.state !== 'CLOSED') {
        status.healthy = false;
      }
    }

    return status;
  }
}

// ============= EXPORTS =============
module.exports = {
  CONFIG,
  CircuitBreaker,
  DataAdapter,
  DataLayerManager,
  createLogger
};
