/**
 * Production-Grade Request Handler
 * 
 * Wraps API handlers to ensure:
 * - Consistent JSON response shape
 * - No uncaught errors
 * - Request ID tracking
 * - Latency logging
 * - CORS headers
 */

const { generateRequestId, createLogger } = require('./logger');
const { checkRateLimit } = require('./rate-limiter');

// Standard error codes
const ERROR_CODES = {
  UNAUTHORIZED: { status: 401, message: 'Authentication required' },
  FORBIDDEN: { status: 403, message: 'Access denied' },
  NOT_FOUND: { status: 404, message: 'Resource not found' },
  VALIDATION_ERROR: { status: 400, message: 'Invalid request' },
  RATE_LIMITED: { status: 429, message: 'Too many requests' },
  SERVER_ERROR: { status: 500, message: 'Internal server error' },
  SERVICE_UNAVAILABLE: { status: 503, message: 'Service temporarily unavailable' },
  TIMEOUT: { status: 504, message: 'Request timeout' }
};

/**
 * Set standard CORS headers
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/**
 * Send a standardized JSON response
 */
function sendResponse(res, status, data, requestId) {
  setCorsHeaders(res);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Request-ID', requestId);
  
  const response = {
    ...data,
    requestId,
    timestamp: new Date().toISOString()
  };
  
  res.status(status).json(response);
}

/**
 * Send an error response
 */
function sendError(res, errorCode, details = {}, requestId) {
  const error = ERROR_CODES[errorCode] || ERROR_CODES.SERVER_ERROR;
  
  sendResponse(res, error.status, {
    success: false,
    errorCode,
    message: details.message || error.message,
    ...details
  }, requestId);
}

/**
 * Parse JSON body safely
 */
async function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }
  
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      // Limit body size to 1MB
      if (body.length > 1048576) {
        resolve({ _error: 'Body too large' });
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({ _error: 'Invalid JSON' });
      }
    });
    req.on('error', () => {
      resolve({ _error: 'Read error' });
    });
  });
}

/**
 * Decode JWT token (basic extraction without verification)
 */
function decodeToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  try {
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload;
  } catch {
    return null;
  }
}

/**
 * Create a hardened API handler
 * 
 * Options:
 * - prefix: Request ID prefix (e.g., 'lb' for leaderboard)
 * - requireAuth: Whether authentication is required
 * - rateLimit: Rate limit config { requests, windowMs }
 * - timeout: Request timeout in ms
 */
function createHandler(handler, options = {}) {
  const {
    prefix = 'req',
    requireAuth = false,
    rateLimit = null,
    timeout = 30000
  } = options;
  
  return async (req, res) => {
    const requestId = generateRequestId(prefix);
    const logger = createLogger(requestId);
    const startTime = Date.now();
    
    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      setCorsHeaders(res);
      res.status(200).end();
      return;
    }
    
    try {
      logger.info('Request started', {
        method: req.method,
        url: req.url
      });
      
      // Rate limiting
      if (rateLimit) {
        const clientId = req.headers['x-forwarded-for'] || 
                        req.connection?.remoteAddress || 
                        'unknown';
        const rateLimitKey = `${prefix}_${clientId}`;
        
        const allowed = checkRateLimit(rateLimitKey, rateLimit.requests, rateLimit.windowMs);
        if (!allowed) {
          logger.warn('Rate limited', { clientId });
          sendError(res, 'RATE_LIMITED', {
            message: 'Too many requests. Please try again later.',
            retryAfter: Math.ceil(rateLimit.windowMs / 1000)
          }, requestId);
          return;
        }
      }
      
      // Authentication check
      let userId = null;
      if (requireAuth) {
        const token = decodeToken(req.headers.authorization);
        if (!token?.id) {
          sendError(res, 'UNAUTHORIZED', {}, requestId);
          return;
        }
        userId = token.id;
      } else {
        // Try to extract user ID even if not required
        const token = decodeToken(req.headers.authorization);
        userId = token?.id || null;
      }
      
      // Parse body for POST/PUT
      let body = {};
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        body = await parseBody(req);
        if (body._error) {
          sendError(res, 'VALIDATION_ERROR', { message: body._error }, requestId);
          return;
        }
      }
      
      // Parse query parameters
      const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const query = Object.fromEntries(urlObj.searchParams);
      
      // Create context object
      const context = {
        requestId,
        logger,
        userId,
        body,
        query,
        method: req.method,
        url: req.url,
        headers: req.headers,
        startTime
      };
      
      // Execute handler with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), timeout);
      });
      
      const result = await Promise.race([
        handler(context, req, res),
        timeoutPromise
      ]);
      
      // If handler already sent response, we're done
      if (res.headersSent) {
        return;
      }
      
      // Send result
      if (result) {
        const status = result.status || (result.success === false ? 400 : 200);
        sendResponse(res, status, result, requestId);
      }
      
    } catch (error) {
      const totalMs = Date.now() - startTime;
      
      // Handle timeout
      if (error.message === 'TIMEOUT') {
        logger.error('Request timeout', { totalMs, timeout });
        if (!res.headersSent) {
          sendError(res, 'TIMEOUT', {}, requestId);
        }
        return;
      }
      
      // Log error
      logger.error('Unhandled error', { 
        error,
        totalMs
      });
      
      // Send error response
      if (!res.headersSent) {
        sendError(res, 'SERVER_ERROR', {
          message: process.env.NODE_ENV === 'production' 
            ? 'An unexpected error occurred'
            : error.message
        }, requestId);
      }
    } finally {
      const totalMs = Date.now() - startTime;
      logger.complete(res.statusCode || 200, totalMs);
    }
  };
}

/**
 * Utility to send success response from within handler
 */
function success(data = {}) {
  return {
    success: true,
    ...data
  };
}

/**
 * Utility to send error response from within handler
 */
function error(errorCode, details = {}) {
  return {
    success: false,
    errorCode,
    status: ERROR_CODES[errorCode]?.status || 500,
    ...details
  };
}

module.exports = {
  createHandler,
  sendResponse,
  sendError,
  parseBody,
  decodeToken,
  setCorsHeaders,
  success,
  error,
  ERROR_CODES
};
