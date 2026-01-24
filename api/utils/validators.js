/**
 * Input Validators and Sanitizers
 * 
 * Provides:
 * - SQL parameter validation
 * - LIMIT/OFFSET clamping
 * - Input sanitization
 * - Type coercion
 */

/**
 * Clamp a numeric value between min and max
 * 
 * @param {any} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} defaultValue - Default if value is invalid
 * @returns {number} Clamped value
 */
function clamp(value, min, max, defaultValue = min) {
  const num = parseInt(value, 10);
  if (isNaN(num)) return defaultValue;
  return Math.max(min, Math.min(max, num));
}

/**
 * Validate and clamp LIMIT parameter
 * 
 * @param {any} limit - Requested limit
 * @param {number} defaultLimit - Default limit
 * @param {number} maxLimit - Maximum allowed limit
 * @returns {number} Safe limit value
 */
function safeLimit(limit, defaultLimit = 20, maxLimit = 100) {
  return clamp(limit, 1, maxLimit, defaultLimit);
}

/**
 * Validate and clamp OFFSET parameter
 * 
 * @param {any} offset - Requested offset
 * @param {number} maxOffset - Maximum allowed offset
 * @returns {number} Safe offset value
 */
function safeOffset(offset, maxOffset = 10000) {
  return clamp(offset, 0, maxOffset, 0);
}

/**
 * Validate SQL ORDER BY column against whitelist
 * 
 * @param {string} column - Requested column
 * @param {Array<string>} allowedColumns - Whitelist of allowed columns
 * @param {string} defaultColumn - Default if invalid
 * @returns {string} Safe column name
 */
function safeOrderBy(column, allowedColumns, defaultColumn) {
  if (!column) return defaultColumn;
  const sanitized = String(column).replace(/[^a-zA-Z0-9_]/g, '');
  return allowedColumns.includes(sanitized) ? sanitized : defaultColumn;
}

/**
 * Validate SQL ORDER direction
 * 
 * @param {string} direction - Requested direction
 * @returns {string} 'ASC' or 'DESC'
 */
function safeOrderDirection(direction) {
  const upper = String(direction || 'DESC').toUpperCase();
  return upper === 'ASC' ? 'ASC' : 'DESC';
}

/**
 * Validate and sanitize a string for safe use
 * 
 * @param {any} value - Value to sanitize
 * @param {number} maxLength - Maximum length
 * @param {string} defaultValue - Default if invalid
 * @returns {string} Sanitized string
 */
function safeString(value, maxLength = 255, defaultValue = '') {
  if (value === null || value === undefined) return defaultValue;
  return String(value).substring(0, maxLength);
}

/**
 * Validate UUID format
 * 
 * @param {string} value - Value to validate
 * @returns {boolean} True if valid UUID
 */
function isValidUUID(value) {
  if (!value) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate positive integer
 * 
 * @param {any} value - Value to validate
 * @returns {number|null} Validated number or null
 */
function positiveInt(value) {
  const num = parseInt(value, 10);
  return !isNaN(num) && num > 0 ? num : null;
}

/**
 * Validate enum value against allowed values
 * 
 * @param {any} value - Value to validate
 * @param {Array<string>} allowedValues - Allowed values
 * @param {string} defaultValue - Default if invalid
 * @returns {string} Validated value
 */
function safeEnum(value, allowedValues, defaultValue) {
  if (!value) return defaultValue;
  const strValue = String(value);
  return allowedValues.includes(strValue) ? strValue : defaultValue;
}

/**
 * Validate timeframe value for leaderboard
 */
function safeTimeframe(value) {
  return safeEnum(value, ['daily', 'weekly', 'monthly', 'all-time'], 'weekly');
}

/**
 * Sanitize search query
 * 
 * @param {string} query - Search query
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized query
 */
function safeSearchQuery(query, maxLength = 50) {
  if (!query) return '';
  return String(query)
    .substring(0, maxLength)
    .replace(/[%_\\]/g, char => '\\' + char) // Escape SQL wildcards
    .trim();
}

/**
 * Validate prepared statement parameters
 * Ensures no undefined values which would cause MySQL errors
 * 
 * @param {Array} params - Array of parameters
 * @param {Array} defaults - Default values for each parameter
 * @returns {Array} Validated parameters
 */
function validateParams(params, defaults = []) {
  return params.map((param, i) => {
    if (param === undefined) {
      return defaults[i] !== undefined ? defaults[i] : null;
    }
    return param;
  });
}

/**
 * Validate cursor for pagination (typically a timestamp or ID)
 * 
 * @param {string} cursor - Cursor value
 * @returns {string|null} Validated cursor or null
 */
function safeCursor(cursor) {
  if (!cursor) return null;
  
  // Allow ISO date strings
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(cursor)) {
    return cursor;
  }
  
  // Allow numeric IDs
  const num = parseInt(cursor, 10);
  if (!isNaN(num) && num > 0) {
    return String(num);
  }
  
  // Allow base36 timestamps
  if (/^[a-z0-9]+$/i.test(cursor) && cursor.length <= 20) {
    return cursor;
  }
  
  return null;
}

/**
 * Validate email format
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function isValidEmail(email) {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate username format
 * 
 * @param {string} username - Username to validate
 * @returns {boolean} True if valid username
 */
function isValidUsername(username) {
  if (!username) return false;
  // Alphanumeric, underscores, 3-30 chars
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  return usernameRegex.test(username);
}

module.exports = {
  clamp,
  safeLimit,
  safeOffset,
  safeOrderBy,
  safeOrderDirection,
  safeString,
  isValidUUID,
  positiveInt,
  safeEnum,
  safeTimeframe,
  safeSearchQuery,
  validateParams,
  safeCursor,
  isValidEmail,
  isValidUsername
};
