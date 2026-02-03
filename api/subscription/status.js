/**
 * Subscription Status API
 * 
 * GET /api/subscription/status
 * Returns the authenticated user's current subscription status
 * 
 * STRICT ACCESS CONTROL:
 * - hasCommunityAccess: true ONLY when user has active paid subscription
 * - Paid plans: AURA_FX (£99) or A7FX_ELITE (£250)
 * - Admins always have access
 * 
 * Response (entitlements - single source for RouteGuards and API filters):
 * {
 *   success: true,
 *   subscription: {
 *     tier: 'FREE' | 'AURA_FX' | 'A7FX',       // Channel access: FREE=General only, AURA_FX=premium, A7FX=elite
 *     status: 'inactive' | 'trialing' | 'active',
 *     hasCommunityAccess: boolean,
 *     planId: 'aura' | 'a7fx' | 'free' | null,
 *     planName: string | null,
 *     accessType: 'AURA_FX_ACTIVE' | 'A7FX_ELITE_ACTIVE' | 'ADMIN' | 'NONE',
 *     renewsAt, trialEndsAt, canceledAt, startedAt, isActive, daysRemaining, ...
 *   }
 * }
 */

const { executeQuery } = require('../db');
const { generateRequestId, createLogger } = require('../utils/logger');
const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('../utils/rate-limiter');

// Decode JWT token
function decodeToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  try {
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const paddedPayload = padding ? payload + '='.repeat(4 - padding) : payload;
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

// Plan display names
const PLAN_NAMES = {
  'aura': 'Aura FX Standard',
  'a7fx': 'A7FX Elite',
  'A7FX': 'A7FX Elite',
  'elite': 'A7FX Elite',
  'free': 'Free',
  'premium': 'Aura FX Standard'
};

// Plan prices
const PLAN_PRICES = {
  'aura': { amount: 99, currency: 'GBP', interval: 'month' },
  'a7fx': { amount: 250, currency: 'GBP', interval: 'month' },
  'elite': { amount: 250, currency: 'GBP', interval: 'month' },
  'free': { amount: 0, currency: 'GBP', interval: 'month' }
};

module.exports = async (req, res) => {
  const requestId = generateRequestId('sub');
  const logger = createLogger(requestId);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Request-ID', requestId);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      errorCode: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed',
      requestId
    });
  }

  // Auth check
  const decoded = decodeToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({
      success: false,
      errorCode: 'UNAUTHORIZED',
      message: 'Authentication required',
      requestId
    });
  }

  const userId = decoded.id;
  
  // Rate limiting
  const rateLimitKey = `subscription_status_${userId}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.MEDIUM.requests, RATE_LIMIT_CONFIGS.MEDIUM.windowMs)) {
    logger.warn('Rate limited', { userId });
    return res.status(429).json({
      success: false,
      errorCode: 'RATE_LIMITED',
      message: 'Too many requests',
      requestId
    });
  }

  logger.info('Fetching subscription status', { userId });

  try {
    const [rows] = await executeQuery(`
      SELECT 
        id, email, role, 
        subscription_status, 
        subscription_plan, 
        subscription_expiry, 
        subscription_started,
        payment_failed,
        has_used_free_trial
      FROM users 
      WHERE id = ?
    `, [userId]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        errorCode: 'USER_NOT_FOUND',
        message: 'User not found',
        requestId
      });
    }

    const user = rows[0];
    const now = new Date();
    
    // NORMALIZE ROLE TO LOWERCASE for case-insensitive comparison
    const userRole = (user.role || '').toLowerCase();
    const userPlan = (user.subscription_plan || '').toLowerCase();
    
    logger.info('User data retrieved', { 
      userId, 
      role: user.role, 
      normalizedRole: userRole,
      subscriptionStatus: user.subscription_status,
      subscriptionPlan: user.subscription_plan,
      subscriptionExpiry: user.subscription_expiry,
      paymentFailed: user.payment_failed
    });
    
    // Determine subscription details
    let planId = user.subscription_plan || null;
    let status = user.subscription_status || 'inactive';
    let isActive = false;
    let daysRemaining = null;
    let renewsAt = null;
    let trialEndsAt = null;
    let canceledAt = null;
    
    // Calculate expiry and status
    const expiryDate = user.subscription_expiry ? new Date(user.subscription_expiry) : null;
    
    if (expiryDate) {
      daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
      
      if (daysRemaining > 0) {
        renewsAt = expiryDate.toISOString();
      }
    }
    
    // ============= ADMIN CHECK FIRST - ADMINS ALWAYS HAVE ACCESS =============
    // This check happens BEFORE any subscription logic
    const isAdminRole = ['admin', 'super_admin'].includes(userRole);
    
    if (isAdminRole) {
      // Admins ALWAYS have access, regardless of payment status
      isActive = true;
      status = 'active';
      planId = planId || 'a7fx';
      logger.info('Admin user detected - granting full access', { userId, role: userRole });
    }
    // Check payment failed state (but NOT for admins)
    else if (user.payment_failed) {
      status = 'past_due';
      isActive = false;
    }
    // Check if subscription is active
    else if (status === 'active' && expiryDate && expiryDate > now) {
      isActive = true;
      
      // Check if still in trial period
      if (user.subscription_started) {
        const startDate = new Date(user.subscription_started);
        const daysSinceStart = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceStart <= 90 && !user.has_used_free_trial_before) {
          // User is in trial period
        }
      }
    }
    // Check if canceled but still active until period end
    else if (status === 'cancelled' || status === 'canceled') {
      if (expiryDate && expiryDate > now) {
        isActive = true;
        canceledAt = user.subscription_started;
      } else {
        isActive = false;
        status = 'canceled';
      }
    }
    // Check premium/elite role fallback
    else if (['premium', 'elite', 'a7fx'].includes(userRole)) {
      isActive = true;
      status = 'active';
      planId = planId || (userRole === 'elite' || userRole === 'a7fx' ? 'a7fx' : 'aura');
    }
    // Expired
    else if (expiryDate && expiryDate <= now) {
      status = 'inactive';
      isActive = false;
    }

    // ============= ENTITLEMENTS: tier + status + hasCommunityAccess =============
    // tier: FREE | AURA_FX | A7FX (channel visibility). status: inactive | trialing | active.
    // Trialing behaves identical to paid (tier grants access).
    let hasCommunityAccess = false;
    let accessType = 'NONE';
    let tier = 'FREE';

    // 1. ADMIN - full access, tier A7FX
    if (isAdminRole) {
      hasCommunityAccess = true;
      accessType = 'ADMIN';
      tier = 'A7FX';
      logger.info('Access granted: ADMIN', { userId, role: userRole });
    }
    // 2. A7FX Elite role or subscription (£250)
    else if (['elite', 'a7fx'].includes(userRole) || 
             (isActive && ['a7fx', 'elite'].includes(userPlan))) {
      hasCommunityAccess = true;
      accessType = 'A7FX_ELITE_ACTIVE';
      tier = 'A7FX';
      logger.info('Access granted: A7FX_ELITE_ACTIVE', { userId, role: userRole, plan: userPlan });
    }
    // 3. Aura FX role or subscription (£99)
    else if (userRole === 'premium' || 
             (isActive && ['aura', 'premium'].includes(userPlan))) {
      hasCommunityAccess = true;
      accessType = 'AURA_FX_ACTIVE';
      tier = 'AURA_FX';
      logger.info('Access granted: AURA_FX_ACTIVE', { userId, role: userRole, plan: userPlan });
    }
    // 4. FREE - community access for General channel only
    else {
      hasCommunityAccess = true;
      accessType = 'NONE';
      tier = 'FREE';
      logger.info('Access: FREE tier (General channel only)', { userId, role: userRole });
    }

    // Normalize status for entitlements: inactive | trialing | active
    const entitlementsStatus = status === 'trialing' ? 'trialing' 
      : (isActive ? 'active' : 'inactive');

    // Build response (entitlements used by RouteGuards and API filters)
    const subscription = {
      tier,
      status: entitlementsStatus,
      hasCommunityAccess,
      planId,
      planName: PLAN_NAMES[planId] || null,
      isActive,
      accessType,
      renewsAt,
      trialEndsAt,
      canceledAt,
      startedAt: user.subscription_started ? new Date(user.subscription_started).toISOString() : null,
      expiresAt: expiryDate ? expiryDate.toISOString() : null,
      daysRemaining: daysRemaining > 0 ? daysRemaining : null,
      price: PLAN_PRICES[planId] || null,
      paymentFailed: !!user.payment_failed,
      hasUsedFreeTrial: !!user.has_used_free_trial
    };

    logger.info('Subscription status fetched', { 
      userId, 
      planId: subscription.planId, 
      status: subscription.status,
      isActive: subscription.isActive 
    });

    return res.status(200).json({
      success: true,
      subscription,
      requestId
    });

  } catch (error) {
    logger.error('Error fetching subscription status', { error, userId });
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Failed to fetch subscription status',
      requestId
    });
  }
};
