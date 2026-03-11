// api/admin/change-subscription.js
const { getDbConnection } = require('../../db');
require('../../utils/suppress-warnings');

// Debug logger
const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    timestamp,
    level,
    endpoint: 'change-subscription',
    message,
    ...data
  }));
};

module.exports = async (req, res) => {
  const requestId = Math.random().toString(36).substring(7);
  
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    log('info', 'OPTIONS request handled', { requestId });
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    log('warn', 'Invalid method', { requestId, method: req.method });
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  log('info', 'Request started', { requestId, body: req.body });

  try {
    const { userId, plan } = req.body;
    
    log('info', 'Request data', { requestId, userId, plan });

    if (!userId || !plan) {
      log('warn', 'Missing fields', { requestId, userId, plan });
      return res.status(400).json({ success: false, message: 'User ID and plan are required' });
    }

    // Validate plan
    const validPlans = ['free', 'premium', 'a7fx', 'elite'];
    if (!validPlans.includes(plan)) {
      log('warn', 'Invalid plan', { requestId, plan });
      return res.status(400).json({ success: false, message: 'Invalid plan. Use: free, premium, a7fx, elite' });
    }

    // Check authentication (admin only)
    const token = req.headers.authorization?.replace('Bearer ', '');
    log('info', 'Auth check', { requestId, hasToken: !!token });
    
    if (!token) {
      log('warn', 'No token provided', { requestId });
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    log('info', 'Connecting to database...', { requestId });
    const db = await getDbConnection();
    
    if (!db) {
      log('error', 'Database connection failed', { requestId });
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }
    
    log('info', 'Database connected', { requestId });

    try {
      // Decode token to verify admin
      log('info', 'Decoding token...', { requestId });
      const tokenParts = token.split('.');
      log('info', 'Token parts', { requestId, parts: tokenParts.length });
      
      if (tokenParts.length !== 3) {
        log('warn', 'Invalid token format', { requestId, parts: tokenParts.length });
        await db.end();
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
      
      const payloadBase64 = tokenParts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const padding = payloadBase64.length % 4;
      const paddedPayload = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
      
      log('info', 'Decoding payload', { requestId });
      const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf-8');
      const decoded = JSON.parse(payloadJson);
      
      log('info', 'Token decoded', { requestId, userId: decoded.id });

      // Check if user is admin
      log('info', 'Checking admin status', { requestId, adminId: decoded.id });
      const [adminCheck] = await db.execute(
        'SELECT role, email FROM users WHERE id = ?',
        [decoded.id]
      );
      
      log('info', 'Admin check result', { requestId, found: adminCheck.length > 0 });
      
      if (adminCheck.length > 0) {
        log('info', 'Admin details', { 
          requestId, 
          role: adminCheck[0].role,
          email: adminCheck[0].email 
        });
      }
      
      if (adminCheck.length === 0 || 
          (adminCheck[0].role !== 'admin' && 
           adminCheck[0].role !== 'super_admin' && 
           adminCheck[0].email !== 'shubzfx@gmail.com')) {
        log('warn', 'Admin access denied', { requestId });
        await db.end();
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }

      log('info', 'Admin verified', { requestId, admin: adminCheck[0].email });

      // Get current user data before update
      log('info', 'Fetching target user', { requestId, targetUserId: userId });
      const [userCheck] = await db.execute(
        'SELECT email, subscription_plan, role FROM users WHERE id = ?',
        [userId]
      );

      if (userCheck.length === 0) {
        log('warn', 'Target user not found', { requestId, userId });
        await db.end();
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      log('info', 'Target user found', { 
        requestId, 
        email: userCheck[0].email,
        currentPlan: userCheck[0].subscription_plan,
        currentRole: userCheck[0].role
      });

      const oldPlan = userCheck[0].subscription_plan || 'free';
      const userEmail = userCheck[0].email;

      // Update the user's subscription
      let newRole = 'free';
      if (plan === 'premium') newRole = 'premium';
      if (plan === 'a7fx' || plan === 'elite') newRole = 'a7fx';

      log('info', 'Update details', { 
        requestId, 
        newPlan: plan,
        newRole,
        status: plan === 'free' ? 'inactive' : 'active'
      });

      // Set expiry date (90 days from now for paid plans)
      let expiryDate = null;
      if (plan !== 'free') {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90);
        log('info', 'Expiry set', { requestId, expiryDate: expiryDate.toISOString() });
      }

      log('info', 'Executing UPDATE query...', { requestId });
      const [updateResult] = await db.execute(
        `UPDATE users 
         SET subscription_plan = ?,
             role = ?,
             subscription_status = ?,
             subscription_expiry = ?
         WHERE id = ?`,
        [
          plan, 
          newRole, 
          plan === 'free' ? 'inactive' : 'active',
          expiryDate,
          userId
        ]
      );

      log('info', 'Update result', { 
        requestId, 
        affectedRows: updateResult.affectedRows,
        changedRows: updateResult.changedRows
      });

      await db.end();
      log('info', 'Database connection closed', { requestId });

      // Log the change
      log('info', 'Subscription changed successfully', {
        requestId,
        admin: adminCheck[0].email,
        user: userEmail,
        oldPlan,
        newPlan: plan
      });

      return res.status(200).json({
        success: true,
        message: `Changed subscription to ${plan}`,
        user: {
          id: userId,
          email: userEmail,
          oldPlan,
          newPlan: plan,
          newRole
        }
      });

    } catch (dbError) {
      log('error', 'Database error', { 
        requestId, 
        error: dbError.message,
        stack: dbError.stack,
        code: dbError.code
      });
      if (db && !db.ended) {
        await db.end();
        log('info', 'Database closed after error', { requestId });
      }
      return res.status(500).json({ 
        success: false, 
        message: 'Database error: ' + dbError.message 
      });
    }

  } catch (error) {
    log('error', 'Top level error', { 
      requestId, 
      error: error.message,
      stack: error.stack 
    });
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to change subscription' 
    });
  }
};