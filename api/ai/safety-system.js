// Safety System - Risk Controls and Enforcement
// Hard caps, kill switches, circuit breakers, no-trade windows

const { getDbConnection } = require('../db');

// Default safety limits
const SAFETY_LIMITS = {
  MAX_RISK_PERCENT: 3, // Maximum risk per trade (%)
  MAX_LEVERAGE: 500, // Maximum leverage
  MAX_DAILY_LOSS_PERCENT: 10, // Maximum daily loss (%)
  MAX_DRAWDOWN_PERCENT: 20, // Maximum drawdown (%)
  MIN_MARGIN_LEVEL: 200, // Minimum margin level (%)
  NO_TRADE_WINDOW_MINUTES: 30 // Minutes before/after high-impact news
};

/**
 * Check if risk percentage is within limits
 * @param {Number} riskPercent - Risk percentage per trade
 * @returns {Object} Validation result
 */
function validateRiskPercent(riskPercent) {
  if (riskPercent > SAFETY_LIMITS.MAX_RISK_PERCENT) {
    return {
      valid: false,
      error: `Risk exceeds maximum allowed (${SAFETY_LIMITS.MAX_RISK_PERCENT}%). Current: ${riskPercent}%`,
      recommendation: `Reduce risk to ${SAFETY_LIMITS.MAX_RISK_PERCENT}% or less`
    };
  }
  
  if (riskPercent < 0.1) {
    return {
      valid: false,
      error: 'Risk is too low (less than 0.1%)',
      recommendation: 'Minimum risk is 0.1%'
    };
  }
  
  return { valid: true };
}

/**
 * Check if leverage is within limits
 * @param {Number} leverage - Leverage ratio
 * @returns {Object} Validation result
 */
function validateLeverage(leverage) {
  if (leverage > SAFETY_LIMITS.MAX_LEVERAGE) {
    return {
      valid: false,
      error: `Leverage exceeds maximum allowed (${SAFETY_LIMITS.MAX_LEVERAGE}:1). Current: ${leverage}:1`,
      recommendation: `Reduce leverage to ${SAFETY_LIMITS.MAX_LEVERAGE}:1 or less`
    };
  }
  
  return { valid: true };
}

/**
 * Check margin level safety
 * @param {Number} marginLevel - Margin level percentage
 * @returns {Object} Validation result
 */
function validateMarginLevel(marginLevel) {
  if (marginLevel < 100) {
    return {
      valid: false,
      error: 'CRITICAL: Margin level below 100% - account at liquidation risk!',
      recommendation: 'Immediately close positions or add funds',
      severity: 'critical'
    };
  }
  
  if (marginLevel < SAFETY_LIMITS.MIN_MARGIN_LEVEL) {
    return {
      valid: false,
      error: `WARNING: Margin level below recommended minimum (${SAFETY_LIMITS.MIN_MARGIN_LEVEL}%). Current: ${marginLevel.toFixed(2)}%`,
      recommendation: 'Consider reducing position size or adding funds',
      severity: 'warning'
    };
  }
  
  return { valid: true };
}

/**
 * Check daily loss limit
 * @param {Number} userId - User ID
 * @param {Number} accountSize - Current account size
 * @param {Number} startingBalance - Starting balance for the day
 * @returns {Object} Validation result
 */
async function checkDailyLossLimit(userId, accountSize, startingBalance) {
  if (!startingBalance || startingBalance <= 0) {
    return { valid: true }; // Can't check without starting balance
  }
  
  const dailyLoss = startingBalance - accountSize;
  const dailyLossPercent = (dailyLoss / startingBalance) * 100;
  
  if (dailyLossPercent >= SAFETY_LIMITS.MAX_DAILY_LOSS_PERCENT) {
    return {
      valid: false,
      error: `Daily loss limit reached (${SAFETY_LIMITS.MAX_DAILY_LOSS_PERCENT}%). Current loss: ${dailyLossPercent.toFixed(2)}%`,
      recommendation: 'Stop trading for today. Review trades and resume tomorrow.',
      severity: 'critical',
      killSwitch: true
    };
  }
  
  if (dailyLossPercent >= SAFETY_LIMITS.MAX_DAILY_LOSS_PERCENT * 0.8) {
    return {
      valid: true,
      warning: `Approaching daily loss limit (${dailyLossPercent.toFixed(2)}% of ${SAFETY_LIMITS.MAX_DAILY_LOSS_PERCENT}%)`,
      recommendation: 'Consider reducing position sizes or stopping for today',
      severity: 'warning'
    };
  }
  
  return { valid: true };
}

/**
 * Check drawdown limit
 * @param {Number} userId - User ID
 * @param {Number} accountSize - Current account size
 * @param {Number} peakBalance - Peak account balance
 * @returns {Object} Validation result
 */
async function checkDrawdownLimit(userId, accountSize, peakBalance) {
  if (!peakBalance || peakBalance <= 0) {
    return { valid: true };
  }
  
  const drawdown = peakBalance - accountSize;
  const drawdownPercent = (drawdown / peakBalance) * 100;
  
  if (drawdownPercent >= SAFETY_LIMITS.MAX_DRAWDOWN_PERCENT) {
    return {
      valid: false,
      error: `Maximum drawdown reached (${SAFETY_LIMITS.MAX_DRAWDOWN_PERCENT}%). Current drawdown: ${drawdownPercent.toFixed(2)}%`,
      recommendation: 'Circuit breaker activated. Review strategy and reduce risk.',
      severity: 'critical',
      circuitBreaker: true
    };
  }
  
  if (drawdownPercent >= SAFETY_LIMITS.MAX_DRAWDOWN_PERCENT * 0.8) {
    return {
      valid: true,
      warning: `Approaching maximum drawdown (${drawdownPercent.toFixed(2)}% of ${SAFETY_LIMITS.MAX_DRAWDOWN_PERCENT}%)`,
      recommendation: 'Consider reducing risk or pausing trading',
      severity: 'warning'
    };
  }
  
  return { valid: true };
}

/**
 * Check for high-impact news events (no-trade window)
 * @param {Array} calendarEvents - Economic calendar events
 * @param {Date} tradeTime - Intended trade time
 * @returns {Object} Validation result
 */
function checkNoTradeWindow(calendarEvents, tradeTime = new Date()) {
  if (!calendarEvents || calendarEvents.length === 0) {
    return { valid: true };
  }
  
  const highImpactEvents = calendarEvents.filter(event => {
    const impact = (event.impact || '').toLowerCase();
    return impact === 'high' || impact === 'red';
  });
  
  if (highImpactEvents.length === 0) {
    return { valid: true };
  }
  
  const windowMs = SAFETY_LIMITS.NO_TRADE_WINDOW_MINUTES * 60 * 1000;
  const nearbyEvents = highImpactEvents.filter(event => {
    if (!event.time || !event.date) return false;
    
    const eventTime = new Date(event.date + 'T' + event.time);
    const timeDiff = Math.abs(eventTime - tradeTime);
    
    return timeDiff <= windowMs;
  });
  
  if (nearbyEvents.length > 0) {
    const eventNames = nearbyEvents.map(e => e.event || e.name).join(', ');
    return {
      valid: false,
      error: `High-impact news event(s) within ${SAFETY_LIMITS.NO_TRADE_WINDOW_MINUTES} minutes: ${eventNames}`,
      recommendation: 'Avoid opening new positions. Consider closing existing positions before the event.',
      severity: 'warning',
      events: nearbyEvents
    };
  }
  
  return { valid: true };
}

/**
 * Check correlation limits (warn if multiple correlated positions)
 * @param {Array} positions - Current positions [{symbol, direction, size}]
 * @returns {Object} Validation result
 */
function checkCorrelationLimits(positions) {
  if (!positions || positions.length < 2) {
    return { valid: true };
  }
  
  // Correlation map (simplified - in production, use actual correlation data)
  const correlations = {
    'EURUSD': ['GBPUSD', 'EURGBP', 'AUDUSD'],
    'GBPUSD': ['EURUSD', 'EURGBP', 'AUDUSD'],
    'XAUUSD': ['XAGUSD', 'USD'],
    'SPY': ['QQQ', 'DIA', 'IWM']
  };
  
  const warnings = [];
  const positionSymbols = positions.map(p => p.symbol?.toUpperCase());
  
  for (const pos of positions) {
    const symbol = pos.symbol?.toUpperCase();
    const correlated = correlations[symbol] || [];
    
    const correlatedPositions = positions.filter(p => {
      const pSymbol = p.symbol?.toUpperCase();
      return correlated.includes(pSymbol) && p.direction === pos.direction;
    });
    
    if (correlatedPositions.length > 0) {
      warnings.push({
        symbol,
        correlated: correlatedPositions.map(p => p.symbol),
        message: `${symbol} has ${correlatedPositions.length} correlated position(s) in same direction`,
        recommendation: 'Consider reducing net exposure to avoid over-concentration'
      });
    }
  }
  
  if (warnings.length > 0) {
    return {
      valid: true,
      warning: 'Multiple correlated positions detected',
      warnings,
      recommendation: 'Monitor net exposure across correlated instruments'
    };
  }
  
  return { valid: true };
}

/**
 * Comprehensive safety check before trade execution
 * @param {Object} tradeParams - Trade parameters
 * @param {Number} userId - User ID
 * @param {Array} calendarEvents - Economic calendar events
 * @param {Array} currentPositions - Current positions
 * @returns {Object} Safety validation result
 */
async function validateTradeSafety(tradeParams, userId, calendarEvents = [], currentPositions = []) {
  const {
    riskPercent,
    leverage,
    marginLevel,
    accountSize,
    startingBalance,
    peakBalance,
    isDemo = false
  } = tradeParams;
  
  const checks = {
    riskPercent: riskPercent ? validateRiskPercent(riskPercent) : { valid: true },
    leverage: leverage ? validateLeverage(leverage) : { valid: true },
    marginLevel: marginLevel ? validateMarginLevel(marginLevel) : { valid: true },
    dailyLoss: accountSize && startingBalance ? await checkDailyLossLimit(userId, accountSize, startingBalance) : { valid: true },
    drawdown: accountSize && peakBalance ? await checkDrawdownLimit(userId, accountSize, peakBalance) : { valid: true },
    noTradeWindow: checkNoTradeWindow(calendarEvents),
    correlation: checkCorrelationLimits(currentPositions)
  };
  
  const errors = [];
  const warnings = [];
  let killSwitch = false;
  let circuitBreaker = false;
  
  for (const [checkName, result] of Object.entries(checks)) {
    if (!result.valid) {
      if (result.severity === 'critical' || result.killSwitch) {
        errors.push({ check: checkName, ...result });
        if (result.killSwitch) killSwitch = true;
        if (result.circuitBreaker) circuitBreaker = true;
      } else {
        warnings.push({ check: checkName, ...result });
      }
    } else if (result.warning) {
      warnings.push({ check: checkName, ...result });
    }
  }
  
  return {
    safe: errors.length === 0,
    errors,
    warnings,
    killSwitch,
    circuitBreaker,
    checks,
    recommendation: errors.length > 0 
      ? 'TRADE BLOCKED: Fix errors before proceeding'
      : warnings.length > 0
      ? 'Proceed with caution - review warnings'
      : 'Trade parameters are safe'
  };
}

/**
 * Get user's daily trading statistics
 * @param {Number} userId - User ID
 * @returns {Object} Daily stats
 */
async function getDailyStats(userId) {
  const db = await getDbConnection();
  if (!db) return null;
  
  try {
    // Get today's starting balance (from first trade or account snapshot)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // This would need a trades table - for now return null
    // In production, query actual trade history
    
    if (db && typeof db.release === 'function') {
      db.release();
    }
    
    return {
      startingBalance: null, // Would come from database
      currentBalance: null,
      dailyLoss: null,
      dailyLossPercent: null,
      tradesToday: 0,
      peakBalance: null,
      drawdown: null,
      drawdownPercent: null
    };
  } catch (error) {
    console.error('Error getting daily stats:', error);
    if (db && typeof db.release === 'function') {
      db.release();
    }
    return null;
  }
}

module.exports = {
  SAFETY_LIMITS,
  validateRiskPercent,
  validateLeverage,
  validateMarginLevel,
  checkDailyLossLimit,
  checkDrawdownLimit,
  checkNoTradeWindow,
  checkCorrelationLimits,
  validateTradeSafety,
  getDailyStats
};
