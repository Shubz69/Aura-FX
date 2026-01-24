/**
 * Structured Logger with RequestId
 * 
 * Provides consistent logging across all API routes with:
 * - RequestId tracking
 * - Latency breakdowns
 * - Error codes
 * - Log levels
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Default to INFO in production, DEBUG in development
const currentLevel = process.env.LOG_LEVEL 
  ? LOG_LEVELS[process.env.LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
  : (process.env.NODE_ENV === 'production' ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG);

/**
 * Generate a unique request ID
 */
function generateRequestId(prefix = 'req') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Format log entry as structured JSON
 */
function formatLogEntry(level, requestId, message, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    requestId,
    message,
    ...data
  };
  
  // In production, output JSON; in dev, pretty print
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(entry);
  }
  
  // Dev-friendly format
  const dataStr = Object.keys(data).length > 0 
    ? ` ${JSON.stringify(data)}`
    : '';
  return `[${entry.timestamp}] [${level}] [${requestId}] ${message}${dataStr}`;
}

/**
 * Create a logger instance for a specific request
 */
function createLogger(requestId) {
  const timers = new Map();
  const latencyBreakdown = {};
  
  return {
    requestId,
    
    debug(message, data = {}) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        console.log(formatLogEntry('DEBUG', requestId, message, data));
      }
    },
    
    info(message, data = {}) {
      if (currentLevel <= LOG_LEVELS.INFO) {
        console.log(formatLogEntry('INFO', requestId, message, data));
      }
    },
    
    warn(message, data = {}) {
      if (currentLevel <= LOG_LEVELS.WARN) {
        console.warn(formatLogEntry('WARN', requestId, message, data));
      }
    },
    
    error(message, data = {}) {
      if (currentLevel <= LOG_LEVELS.ERROR) {
        // Extract error details if Error object is passed
        if (data.error instanceof Error) {
          data.error = {
            name: data.error.name,
            message: data.error.message,
            stack: data.error.stack?.split('\n').slice(0, 3).join('\n')
          };
        }
        console.error(formatLogEntry('ERROR', requestId, message, data));
      }
    },
    
    // Timer utilities for latency breakdown
    startTimer(name) {
      timers.set(name, Date.now());
    },
    
    endTimer(name) {
      const start = timers.get(name);
      if (start) {
        const duration = Date.now() - start;
        latencyBreakdown[name] = duration;
        timers.delete(name);
        return duration;
      }
      return 0;
    },
    
    getLatencyBreakdown() {
      return { ...latencyBreakdown };
    },
    
    // Log request completion with full breakdown
    complete(status, totalMs, additionalData = {}) {
      const data = {
        status,
        totalMs,
        latencyBreakdown: this.getLatencyBreakdown(),
        ...additionalData
      };
      
      if (status >= 500) {
        this.error('Request failed', data);
      } else if (status >= 400) {
        this.warn('Request error', data);
      } else {
        this.info('Request completed', data);
      }
    }
  };
}

/**
 * Request logging middleware (for Express-style handlers)
 */
function requestLogger(handler) {
  return async (req, res) => {
    const requestId = generateRequestId();
    const logger = createLogger(requestId);
    const startTime = Date.now();
    
    // Attach logger to request
    req.logger = logger;
    req.requestId = requestId;
    
    logger.info('Request started', {
      method: req.method,
      url: req.url,
      userAgent: req.headers?.['user-agent']?.substring(0, 100)
    });
    
    try {
      await handler(req, res, logger);
    } finally {
      const totalMs = Date.now() - startTime;
      // Note: status may not be available in Vercel serverless
      logger.complete(res.statusCode || 200, totalMs);
    }
  };
}

module.exports = {
  generateRequestId,
  createLogger,
  requestLogger,
  LOG_LEVELS
};
