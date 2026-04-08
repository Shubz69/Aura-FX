const { getDbConnection } = require('../../db');
const { isSuperAdminEmail } = require('../../utils/entitlements');
// Suppress url.parse() deprecation warnings from dependencies
require('../../utils/suppress-warnings');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Check authentication (admin only)
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    try {
      // Decode token to verify admin
      const tokenParts = token.split('.');
      if (tokenParts.length !== 3) {
        await db.end();
        return res.status(401).json({ success: false, message: 'Invalid token' });
      }
      
      const payloadBase64 = tokenParts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const padding = payloadBase64.length % 4;
      const paddedPayload = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
      const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf-8');
      const decoded = JSON.parse(payloadJson);
      
      // Check if user is admin
      const [adminCheck] = await db.execute(
        'SELECT role, email FROM users WHERE id = ?',
        [decoded.id]
      );
      
      if (adminCheck.length === 0 ||
          (adminCheck[0].role !== 'admin' &&
           adminCheck[0].role !== 'super_admin' &&
           !isSuperAdminEmail(adminCheck[0]))) {
        await db.end();
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }

      // Fix users with active subscriptions but wrong roles (canonical writes: pro / elite / access)
      
      let fixedCount = 0;
      const fixedUsers = [];

      // Pro-tier plans → role pro
      const [proUsers] = await db.execute(
        `SELECT id, email, role, subscription_status, subscription_plan 
         FROM users 
         WHERE subscription_status = 'active' 
         AND subscription_plan IN ('aura', 'Aura Terminal', 'premium', 'pro')
         AND role != 'pro'`
      );

      for (const user of proUsers) {
        await db.execute('UPDATE users SET role = ? WHERE id = ?', ['pro', user.id]);
        fixedCount++;
        fixedUsers.push({ email: user.email, oldRole: user.role, newRole: 'pro' });
      }

      // Elite-tier plans → role elite
      const [eliteUsers] = await db.execute(
        `SELECT id, email, role, subscription_status, subscription_plan 
         FROM users 
         WHERE subscription_status = 'active' 
         AND subscription_plan IN ('a7fx', 'A7FX', 'elite', 'A7FX Elite')
         AND role != 'elite'`
      );

      for (const user of eliteUsers) {
        await db.execute('UPDATE users SET role = ? WHERE id = ?', ['elite', user.id]);
        fixedCount++;
        fixedUsers.push({ email: user.email, oldRole: user.role, newRole: 'elite' });
      }

      // Inactive subscriptions → access tier
      const [inactiveUsers] = await db.execute(
        `SELECT id, email, role, subscription_status 
         FROM users 
         WHERE subscription_status IN ('inactive', 'cancelled', 'expired')
         AND role IN ('premium', 'pro', 'a7fx', 'elite')
         AND (subscription_expiry IS NULL OR subscription_expiry < NOW())`
      );

      for (const user of inactiveUsers) {
        await db.execute(
          'UPDATE users SET role = ?, subscription_plan = ? WHERE id = ?',
          ['access', 'access', user.id]
        );
        fixedCount++;
        fixedUsers.push({ email: user.email, oldRole: user.role, newRole: 'access' });
      }

      await db.end();

      return res.status(200).json({
        success: true,
        message: `Fixed ${fixedCount} user(s)`,
        fixedCount,
        fixedUsers
      });

    } catch (dbError) {
      console.error('Database error:', dbError);
      if (db && !db.ended) await db.end();
      return res.status(500).json({ success: false, message: 'Database error' });
    }

  } catch (error) {
    console.error('Error fixing subscription roles:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fix subscription roles' 
    });
  }
};
