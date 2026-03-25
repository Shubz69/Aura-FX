/**
 * Community Access Middleware
 * 
 * Server-side middleware to protect all /community/* API routes
 * 
 * STRICT ACCESS RULES:
 * - Requires authentication (valid JWT token)
 * - Requires active paid subscription:
 *   - AURA_FX_ACTIVE (£99/month subscription)
 *   - A7FX_ELITE_ACTIVE (£250/month subscription)
 * - Admin role always has access
 * 
 * This is the SERVER-SIDE enforcement layer.
 * Client-side route guards are defense-in-depth only.
 */

const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');

/**
 * Check if user has community access based on subscription/role
 * 
 * @param {string} userId - The user ID to check
 * @returns {Object} - { hasAccess: boolean, accessType: string, reason: string }
 */
async function checkCommunityAccess(userId) {
  if (!userId) {
    return { hasAccess: false, accessType: 'NONE', reason: 'No user ID provided' };
  }
  
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
      return { hasAccess: false, accessType: 'NONE', reason: 'User not found' };
    }

    const user = rows[0];
    const now = new Date();
    const role = (user.role || '').toString().trim().toLowerCase();
    const plan = (user.subscription_plan || '').toString().trim().toLowerCase();
    
    // Super admin by email: full access regardless of DB role (Shubzfx@gmail.com)
    const superAdminEmail = 'shubzfx@gmail.com';
    if (user.email && user.email.toString().trim().toLowerCase() === superAdminEmail) {
      return { hasAccess: true, accessType: 'ADMIN', reason: 'Super admin' };
    }
    
    // Check for payment failure first (highest priority denial)
    if (user.payment_failed) {
      return { hasAccess: false, accessType: 'PAYMENT_FAILED', reason: 'Payment failed - subscription inactive' };
    }
    
    // Admin check - always has access
    if (['admin', 'super_admin'].includes(role)) {
      return { hasAccess: true, accessType: 'ADMIN', reason: 'Admin role' };
    }
    
    // Check subscription status and expiry
    const expiryDate = user.subscription_expiry ? new Date(user.subscription_expiry) : null;
    const normalizedStatus = (user.subscription_status || '').toString().trim().toLowerCase();
    const isSubscriptionActive = user.subscription_status === 'active' &&
                                  expiryDate && 
                                  expiryDate > now;
    const isExpired = !!(expiryDate && expiryDate <= now);
    
    // A7FX Elite check (£250)
    if (isSubscriptionActive && ['a7fx', 'elite'].includes(plan)) {
      return { hasAccess: true, accessType: 'A7FX_ELITE_ACTIVE', reason: 'A7FX Elite subscription active' };
    }
    
    // Aura Terminal check (£99)
    if (isSubscriptionActive && ['aura', 'premium'].includes(plan)) {
      return { hasAccess: true, accessType: 'AURA_FX_ACTIVE', reason: 'Aura Terminal subscription active' };
    }
    // Legacy role-based fallback for migrated users without expiry rows.
    // Never allow role-only fallback for explicitly expired users.
    if (!isExpired && ['elite', 'a7fx'].includes(role)) {
      return { hasAccess: true, accessType: 'A7FX_ELITE_ACTIVE', reason: 'Legacy elite role fallback' };
    }
    if (!isExpired && role === 'premium') {
      return { hasAccess: true, accessType: 'AURA_FX_ACTIVE', reason: 'Legacy premium role fallback' };
    }
    
    // No valid subscription or role
    return { hasAccess: false, accessType: 'NONE', reason: 'No active subscription' };
    
  } catch (error) {
    console.error('Error checking community access:', error);
    // On database error, deny access for security
    return { hasAccess: false, accessType: 'ERROR', reason: 'Access check failed' };
  }
}

/**
 * Middleware to require community access
 * Use this in API routes that should only be accessible to paying subscribers
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function (optional, for Express middleware pattern)
 * @returns {Object|null} - Returns error response if denied, or accessInfo if granted
 */
async function requireCommunityAccess(req, res) {
  const decoded = verifyToken(req.headers.authorization);
  
  if (!decoded || !decoded.id) {
    return {
      denied: true,
      response: () => res.status(401).json({
        success: false,
        errorCode: 'UNAUTHORIZED',
        message: 'Authentication required',
        redirect: '/login'
      })
    };
  }
  
  // Check community access
  const accessInfo = await checkCommunityAccess(decoded.id);
  
  if (!accessInfo.hasAccess) {
    return {
      denied: true,
      response: () => res.status(403).json({
        success: false,
        errorCode: 'COMMUNITY_ACCESS_DENIED',
        message: 'Community access requires an active subscription',
        accessType: accessInfo.accessType,
        reason: accessInfo.reason,
        redirect: '/subscription'
      })
    };
  }
  
  // Access granted
  return {
    denied: false,
    userId: decoded.id,
    accessType: accessInfo.accessType,
    reason: accessInfo.reason
  };
}

/**
 * Wrapper function to use in Vercel API routes
 * Returns a guard function that checks access before proceeding
 * 
 * Usage:
 * const { communityApiGuard } = require('../middleware/community-access');
 * 
 * module.exports = async (req, res) => {
 *   const guard = await communityApiGuard(req, res);
 *   if (guard.denied) return guard.response();
 *   
 *   // Proceed with API logic...
 *   // guard.userId is available
 *   // guard.accessType is available
 * };
 */
const communityApiGuard = requireCommunityAccess;

module.exports = {
  checkCommunityAccess,
  requireCommunityAccess,
  communityApiGuard
};
