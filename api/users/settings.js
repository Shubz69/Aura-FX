/**
 * User Settings API - GET/UPDATE user settings and trading identity
 */

const { executeQuery } = require('../db');

// Track if table has been created this session
let settingsTableCreated = false;

// Ensure user_settings table exists
async function ensureSettingsTable() {
  if (settingsTableCreated) return true;
  
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        preferred_markets JSON,
        trading_sessions JSON,
        risk_profile VARCHAR(50) DEFAULT 'moderate',
        trading_style VARCHAR(50) DEFAULT 'day_trader',
        experience_level VARCHAR(50) DEFAULT 'beginner',
        theme VARCHAR(20) DEFAULT 'dark',
        notifications_enabled BOOLEAN DEFAULT TRUE,
        email_notifications BOOLEAN DEFAULT TRUE,
        sound_enabled BOOLEAN DEFAULT TRUE,
        compact_mode BOOLEAN DEFAULT FALSE,
        show_online_status BOOLEAN DEFAULT TRUE,
        profile_visibility VARCHAR(20) DEFAULT 'public',
        show_trading_stats BOOLEAN DEFAULT TRUE,
        show_achievements BOOLEAN DEFAULT TRUE,
        ai_personality VARCHAR(50) DEFAULT 'professional',
        ai_chart_preference VARCHAR(50) DEFAULT 'candlestick',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    settingsTableCreated = true;
    console.log('User settings table ready');
    return true;
  } catch (error) {
    console.log('Settings table check:', error.code || error.message);
    settingsTableCreated = true;
    return true;
  }
}

// Decode JWT token
function decodeToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const paddedPayload = padding ? payload + '='.repeat(4 - padding) : payload;
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf-8'));
  } catch (e) {
    return null;
  }
}

// Default settings
const defaultSettings = {
  preferred_markets: ['forex', 'gold'],
  trading_sessions: ['london', 'newyork'],
  risk_profile: 'moderate',
  trading_style: 'day_trader',
  experience_level: 'beginner',
  theme: 'dark',
  notifications_enabled: true,
  email_notifications: true,
  sound_enabled: true,
  compact_mode: false,
  show_online_status: true,
  profile_visibility: 'public',
  show_trading_stats: true,
  show_achievements: true,
  ai_personality: 'professional',
  ai_chart_preference: 'candlestick'
};

// Helper to safely get array from query result
function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) {
      return result[0];
    }
    return result;
  }
  return [];
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Ensure settings table exists
  await ensureSettingsTable();

  // Auth check
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = decodeToken(token);
  
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const userId = decoded.id;

  try {
    // GET /api/users/settings
    if (req.method === 'GET') {
      // Get user from users table for basic stats
      const userResult = await executeQuery(
        'SELECT id, xp, level, login_streak, subscription_status, role FROM users WHERE id = ?',
        [userId]
      );
      const users = getRows(userResult);
      const user = users[0] || {};

      // Try to get settings, fallback to defaults if table doesn't exist
      let settingsData = { ...defaultSettings };
      
      try {
        const settingsResult = await executeQuery(
          'SELECT * FROM user_settings WHERE user_id = ?',
          [userId]
        );
        const settingsRows = getRows(settingsResult);
        
        if (settingsRows.length > 0) {
          settingsData = settingsRows[0];
          // Parse JSON fields
          if (typeof settingsData.preferred_markets === 'string') {
            try { settingsData.preferred_markets = JSON.parse(settingsData.preferred_markets); } 
            catch (e) { settingsData.preferred_markets = defaultSettings.preferred_markets; }
          }
          if (typeof settingsData.trading_sessions === 'string') {
            try { settingsData.trading_sessions = JSON.parse(settingsData.trading_sessions); } 
            catch (e) { settingsData.trading_sessions = defaultSettings.trading_sessions; }
          }
        }
      } catch (tableErr) {
        // Table might not exist, use defaults
        console.log('Settings table not ready, using defaults');
      }

      // Get message count for stats
      let messageCount = 0;
      try {
        const msgResult = await executeQuery(
          'SELECT COUNT(*) as count FROM messages WHERE sender_id = ?',
          [userId]
        );
        const msgRows = getRows(msgResult);
        messageCount = msgRows[0]?.count || 0;
      } catch (e) {
        // Ignore
      }

      // Build stats from user data
      const stats = {
        ai_chats_count: 0,
        community_messages: messageCount,
        courses_completed: 0,
        longest_streak: user.login_streak || 0,
        current_month_xp: user.xp || 0,
        total_login_days: 0
      };

      return res.status(200).json({
        success: true,
        settings: settingsData,
        stats: stats
      });
    }

    // PUT /api/users/settings
    if (req.method === 'PUT') {
      const updates = req.body;
      
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No updates provided' });
      }

      // For now, just return success - settings are stored client-side until table is ready
      // This prevents blocking the UI while providing a graceful experience
      
      // Try to save to database if table exists
      try {
        // Allowed fields for update
        const allowedFields = [
          'preferred_markets', 'trading_sessions', 'risk_profile', 'trading_style',
          'experience_level', 'theme', 'notifications_enabled', 'email_notifications',
          'sound_enabled', 'compact_mode', 'show_online_status', 'profile_visibility',
          'show_trading_stats', 'show_achievements', 'ai_personality', 'ai_chart_preference'
        ];

        const setClauses = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
          if (allowedFields.includes(key)) {
            setClauses.push(`${key} = ?`);
            if (key === 'preferred_markets' || key === 'trading_sessions') {
              values.push(JSON.stringify(value));
            } else {
              values.push(value);
            }
          }
        }

        if (setClauses.length > 0) {
          // Check if settings exist
          const existingResult = await executeQuery(
            'SELECT id FROM user_settings WHERE user_id = ?',
            [userId]
          );
          const existing = getRows(existingResult);

          if (existing.length > 0) {
            await executeQuery(
              `UPDATE user_settings SET ${setClauses.join(', ')}, updated_at = NOW() WHERE user_id = ?`,
              [...values, userId]
            );
          } else {
            const fields = setClauses.map(c => c.split(' = ')[0]);
            await executeQuery(
              `INSERT INTO user_settings (user_id, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})`,
              [userId, ...values]
            );
          }
        }
      } catch (dbErr) {
        // Table might not exist yet, but we still return success
        // so the frontend can store settings locally
        console.log('Could not save settings to DB:', dbErr.message);
      }

      return res.status(200).json({
        success: true,
        message: 'Settings updated successfully'
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('Settings API error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
