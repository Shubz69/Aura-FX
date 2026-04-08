/**
 * Subscription Guard Middleware
 * 
 * STRICT SERVER-SIDE ACCESS CONTROL for Community APIs
 * 
 * Usage:
 * const { requireCommunityAccess } = require('./middleware/subscription-guard');
 * module.exports = requireCommunityAccess(async (req, res, context) => { ... });
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const { isSuperAdminEmail } = require('../utils/entitlements');

/**
 * Check if user has community access (server-authoritative)
 * Returns: { hasAccess: boolean, accessType: string, userId: number, error: string|null }
 */
async function checkCommunityAccess(authHeader) {
  const decoded = verifyToken(authHeader);
  
  if (!decoded || !decoded.id) {
    return { hasAccess: false, accessType: 'NONE', userId: null, error: 'UNAUTHORIZED' };
  }
  
  const userId = decoded.id;
  
  try {
    const [rows] = await executeQuery(`
      SELECT 
        id, email, role, 
        subscription_status, 
        subscription_plan, 
        subscription_expiry,
        payment_failed
      FROM users 
      WHERE id = ?
    `, [userId]);
    
    if (!rows || rows.length === 0) {
      return { hasAccess: false, accessType: 'NONE', userId, error: 'USER_NOT_FOUND' };
    }
    
    const user = rows[0];
    const now = new Date();
    const expiryDate = user.subscription_expiry ? new Date(user.subscription_expiry) : null;
    const dbRole = (user.role || '').toString().trim().toLowerCase();
    const subStatus = (user.subscription_status || '').toString().trim().toLowerCase();
    const planLower = (user.subscription_plan || '').toString().trim().toLowerCase();

    if (user.email && isSuperAdminEmail(user)) {
      return { hasAccess: true, accessType: 'ADMIN', userId, error: null };
    }

    // Check payment failed
    if (user.payment_failed) {
      return { hasAccess: false, accessType: 'NONE', userId, error: 'PAYMENT_FAILED' };
    }

    // Admin access (always has access) — case-insensitive vs DB/JWT
    if (['admin', 'super_admin'].includes(dbRole)) {
      return { hasAccess: true, accessType: 'ADMIN', userId, error: null };
    }

    // Active or trialing with valid period end (align with entitlements / Stripe)
    const isPaidWindow =
      (subStatus === 'active' || subStatus === 'trialing') && expiryDate && expiryDate > now;

    const hasRoleAccess = ['premium', 'pro', 'elite', 'a7fx'].includes(dbRole);

    if (isPaidWindow || hasRoleAccess) {
      const planId = planLower || dbRole;

      if (['a7fx', 'elite'].includes(planId) || dbRole === 'elite' || dbRole === 'a7fx') {
        return { hasAccess: true, accessType: 'ELITE_ACTIVE', userId, error: null };
      }

      if (['aura', 'premium', 'pro'].includes(planId) || dbRole === 'premium' || dbRole === 'pro') {
        return { hasAccess: true, accessType: 'PRO_ACTIVE', userId, error: null };
      }
    }
    
    // Plan selected (including Access): grant community access (ACCESS = allowlist only; server enforces channels)
    const plan = (user.subscription_plan || '').toString().trim().toLowerCase();
    if (plan.length > 0) {
      return {
        hasAccess: true,
        accessType: plan === 'free' || plan === 'access' ? 'ACCESS' : 'NONE',
        userId,
        error: null
      };
    }
    
    // No plan selected yet
    return { hasAccess: false, accessType: 'NONE', userId, error: 'NO_SUBSCRIPTION' };
    
  } catch (err) {
    console.error('Subscription check error:', err);
    return { hasAccess: false, accessType: 'NONE', userId, error: 'SERVER_ERROR' };
  }
}

/**
 * Middleware wrapper that requires community access
 * 
 * @param {Function} handler - The API handler function (req, res, context) => {}
 * @returns {Function} - Wrapped handler with access control
 */
function requireCommunityAccess(handler) {
  return async (req, res) => {
    // CORS headers
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    // Check community access
    const accessResult = await checkCommunityAccess(req.headers.authorization);
    
    if (!accessResult.hasAccess) {
      const statusCode = accessResult.error === 'UNAUTHORIZED' ? 401 : 403;
      
      return res.status(statusCode).json({
        success: false,
        errorCode: accessResult.error,
        message: getErrorMessage(accessResult.error),
        requiresSubscription: accessResult.error === 'NO_SUBSCRIPTION'
      });
    }
    
    // Pass context to handler
    const context = {
      userId: accessResult.userId,
      accessType: accessResult.accessType
    };
    
    return handler(req, res, context);
  };
}

/**
 * Get user-friendly error message
 */
function getErrorMessage(errorCode) {
  switch (errorCode) {
    case 'UNAUTHORIZED':
      return 'Authentication required. Please log in.';
    case 'USER_NOT_FOUND':
      return 'User account not found.';
    case 'NO_SUBSCRIPTION':
      return 'An active Pro or Elite subscription is required to access the Community.';
    case 'PAYMENT_FAILED':
      return 'Your subscription payment has failed. Please update your payment method.';
    case 'SERVER_ERROR':
      return 'An error occurred. Please try again.';
    default:
      return 'Access denied.';
  }
}

module.exports = {
  requireCommunityAccess,
  checkCommunityAccess
};
