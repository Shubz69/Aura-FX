const { getDbConnection } = require('../../db');

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
           adminCheck[0].email !== 'shubzfx@gmail.com')) {
        await db.end();
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }

      // Fix users with active subscriptions but wrong roles
      // Rule: subscription_plan = 'aura' → role = 'premium'
      // Rule: subscription_plan = 'a7fx' or 'elite' → role = 'a7fx'
      
      let fixedCount = 0;
      const fixedUsers = [];

      // Fix users with 'aura' subscription
      const [auraUsers] = await db.execute(
        `SELECT id, email, role, subscription_status, subscription_plan 
         FROM users 
         WHERE subscription_status = 'active' 
         AND subscription_plan IN ('aura', 'Aura FX', 'premium')
         AND role != 'premium'`
      );

      for (const user of auraUsers) {
        await db.execute(
          'UPDATE users SET role = ? WHERE id = ?',
          ['premium', user.id]
        );
        fixedCount++;
        fixedUsers.push({ email: user.email, oldRole: user.role, newRole: 'premium' });
      }

      // Fix users with 'a7fx' subscription
      const [a7fxUsers] = await db.execute(
        `SELECT id, email, role, subscription_status, subscription_plan 
         FROM users 
         WHERE subscription_status = 'active' 
         AND subscription_plan IN ('a7fx', 'A7FX', 'elite', 'A7FX Elite')
         AND role != 'a7fx'`
      );

      for (const user of a7fxUsers) {
        await db.execute(
          'UPDATE users SET role = ? WHERE id = ?',
          ['a7fx', user.id]
        );
        fixedCount++;
        fixedUsers.push({ email: user.email, oldRole: user.role, newRole: 'a7fx' });
      }

      // Also fix users with inactive subscriptions - downgrade to free
      const [inactiveUsers] = await db.execute(
        `SELECT id, email, role, subscription_status 
         FROM users 
         WHERE subscription_status IN ('inactive', 'cancelled', 'expired')
         AND role IN ('premium', 'a7fx')
         AND (subscription_expiry IS NULL OR subscription_expiry < NOW())`
      );

      for (const user of inactiveUsers) {
        await db.execute(
          'UPDATE users SET role = ? WHERE id = ?',
          ['free', user.id]
        );
        fixedCount++;
        fixedUsers.push({ email: user.email, oldRole: user.role, newRole: 'free' });
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
