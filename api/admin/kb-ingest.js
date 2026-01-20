// Admin-Only Knowledge Base Ingestion Endpoint
// Allows admins to add trading knowledge, strategies, and rules to the KB

const { kbIngest } = require('../ai/knowledge-base');
const { getDbConnection } = require('../db');

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

  // Check admin access
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // Decode token
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    const payloadBase64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payloadBase64.length % 4;
    const paddedPayload = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
    const payloadJson = Buffer.from(paddedPayload, 'base64').toString('utf-8');
    const decoded = JSON.parse(payloadJson);
    const userId = decoded.id || decoded.userId;

    // Verify user is admin
    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    try {
      const [userRows] = await db.execute(
        'SELECT id, email, role FROM users WHERE id = ?',
        [userId]
      );

      if (userRows.length === 0) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = userRows[0];
      const userRole = (user.role || '').toLowerCase();
      const isAdmin = userRole === 'admin' || userRole === 'super_admin' || user.email?.toLowerCase() === 'shubzfx@gmail.com';

      if (!isAdmin) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(403).json({ success: false, message: 'Admin access required for KB ingestion' });
      }

      // Get ingestion parameters
      const { title, content, category = 'general', tags = [] } = req.body;

      if (!title || !content) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(400).json({
          success: false,
          message: 'Title and content are required'
        });
      }

      // Ingest into knowledge base
      const result = await kbIngest(
        title,
        content,
        category,
        'admin',
        Array.isArray(tags) ? tags : (tags ? [tags] : [])
      );

      if (!result) {
        if (db && typeof db.release === 'function') {
          db.release();
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to ingest into knowledge base'
        });
      }

      if (db && typeof db.release === 'function') {
        db.release();
      }

      return res.status(200).json({
        success: true,
        message: 'Knowledge base entry created successfully',
        entry: result
      });

    } catch (dbError) {
      console.error('Database error in KB ingestion:', dbError);
      if (db && typeof db.release === 'function') {
        db.release();
      }
      return res.status(500).json({
        success: false,
        message: 'Database error',
        error: dbError.message
      });
    }

  } catch (error) {
    console.error('Error in KB ingestion:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};
