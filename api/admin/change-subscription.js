// api/admin/change-subscription.js
const { getDbConnection } = require('../../db');
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
    const { userId, plan } = req.body;
    
    if (!userId || !plan) {
      return res.status(400).json({ success: false, message: 'User ID and plan are required' });
    }

    // Validate plan
    const validPlans = ['free', 'premium', 'a7fx', 'elite'];
    if (!validPlans.includes(plan)) {
      return res.status(400).json({ success: false, message: 'Invalid plan. Use: free, premium, a7fx, elite' });
    }

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
      
      // Check if user is admin (or super admin)
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

      // Get current user data before update
      const [userCheck] = await db.execute(
        'SELECT email, subscription_plan, role FROM users WHERE id = ?',
        [userId]
      );

      if (userCheck.length === 0) {
        await db.end();
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const oldPlan = userCheck[0].subscription_plan || 'free';
      const userEmail = userCheck[0].email;

      // Update the user's subscription
      // Map plans to roles: premium plan → premium role, a7fx/elite → a7fx role
      let newRole = 'free';
      if (plan === 'premium') newRole = 'premium';
      if (plan === 'a7fx' || plan === 'elite') newRole = 'a7fx';

      // Set expiry date (90 days from now for paid plans)
      let expiryDate = null;
      if (plan !== 'free') {
        expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + 90);
      }

      await db.execute(
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

      await db.end();

      // Log the change (optional)
      console.log(`Admin ${adminCheck[0].email} changed ${userEmail} plan from ${oldPlan} to ${plan}`);

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
      console.error('Database error:', dbError);
      if (db && !db.ended) await db.end();
      return res.status(500).json({ success: false, message: 'Database error' });
    }

  } catch (error) {
    console.error('Error changing subscription:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to change subscription' 
    });
  }
};