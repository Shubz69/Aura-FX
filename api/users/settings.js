/**
 * User Settings API - GET/UPDATE user settings and trading identity
 * 
 * Endpoints:
 * - GET /api/users/settings - Get user settings
 * - PUT /api/users/settings - Update user settings
 */

const { executeQuery } = require('../db');

// Ensure user_settings table exists
async function ensureSettingsTable() {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        -- Trading Identity
        preferred_markets JSON DEFAULT '[]',
        trading_sessions JSON DEFAULT '[]',
        risk_profile ENUM('conservative', 'moderate', 'aggressive') DEFAULT 'moderate',
        trading_style ENUM('scalper', 'day_trader', 'swing_trader', 'position_trader') DEFAULT 'day_trader',
        experience_level ENUM('beginner', 'intermediate', 'advanced', 'expert') DEFAULT 'beginner',
        -- Preferences
        theme VARCHAR(50) DEFAULT 'dark',
        notifications_enabled BOOLEAN DEFAULT TRUE,
        email_notifications BOOLEAN DEFAULT TRUE,
        sound_enabled BOOLEAN DEFAULT TRUE,
        compact_mode BOOLEAN DEFAULT FALSE,
        show_online_status BOOLEAN DEFAULT TRUE,
        -- Privacy
        profile_visibility ENUM('public', 'friends', 'private') DEFAULT 'public',
        show_trading_stats BOOLEAN DEFAULT TRUE,
        show_achievements BOOLEAN DEFAULT TRUE,
        -- AI Settings
        ai_personality ENUM('professional', 'friendly', 'concise') DEFAULT 'professional',
        ai_chart_preference ENUM('candlestick', 'line', 'bar') DEFAULT 'candlestick',
        -- Timestamps
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    console.error('Error ensuring settings table:', error);
  }
}

// Ensure user_stats table exists
async function ensureStatsTable() {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS user_stats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        ai_chats_count INT DEFAULT 0,
        ai_messages_sent INT DEFAULT 0,
        courses_completed INT DEFAULT 0,
        courses_in_progress INT DEFAULT 0,
        community_messages INT DEFAULT 0,
        longest_streak INT DEFAULT 0,
        current_month_xp INT DEFAULT 0,
        total_login_days INT DEFAULT 0,
        last_stat_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    console.error('Error ensuring stats table:', error);
  }
}

// Initialize tables
ensureSettingsTable();
ensureStatsTable();

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

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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
      // Get or create settings
      let [settings] = await executeQuery(
        'SELECT * FROM user_settings WHERE user_id = ?',
        [userId]
      );

      if (!settings || settings.length === 0) {
        // Create default settings
        await executeQuery(
          `INSERT INTO user_settings (user_id, preferred_markets, trading_sessions) 
           VALUES (?, ?, ?)`,
          [userId, JSON.stringify(defaultSettings.preferred_markets), JSON.stringify(defaultSettings.trading_sessions)]
        );
        
        [settings] = await executeQuery(
          'SELECT * FROM user_settings WHERE user_id = ?',
          [userId]
        );
      }

      // Get user stats
      let [stats] = await executeQuery(
        'SELECT * FROM user_stats WHERE user_id = ?',
        [userId]
      );

      if (!stats || stats.length === 0) {
        // Calculate stats from existing data
        const [aiChats] = await executeQuery(
          'SELECT COUNT(*) as count FROM messages WHERE sender_id = ? AND channel_id LIKE ?',
          [userId, '%ai%']
        );
        
        const [communityMsgs] = await executeQuery(
          'SELECT COUNT(*) as count FROM messages WHERE sender_id = ?',
          [userId]
        );

        const [user] = await executeQuery(
          'SELECT login_streak, xp FROM users WHERE id = ?',
          [userId]
        );

        await executeQuery(
          `INSERT INTO user_stats (user_id, ai_chats_count, community_messages, longest_streak, current_month_xp) 
           VALUES (?, ?, ?, ?, ?)`,
          [userId, aiChats?.[0]?.count || 0, communityMsgs?.[0]?.count || 0, user?.[0]?.login_streak || 0, user?.[0]?.xp || 0]
        );

        [stats] = await executeQuery(
          'SELECT * FROM user_stats WHERE user_id = ?',
          [userId]
        );
      }

      // Parse JSON fields
      const settingsData = settings[0] || {};
      if (typeof settingsData.preferred_markets === 'string') {
        try { settingsData.preferred_markets = JSON.parse(settingsData.preferred_markets); } catch (e) { settingsData.preferred_markets = []; }
      }
      if (typeof settingsData.trading_sessions === 'string') {
        try { settingsData.trading_sessions = JSON.parse(settingsData.trading_sessions); } catch (e) { settingsData.trading_sessions = []; }
      }

      return res.status(200).json({
        success: true,
        settings: settingsData,
        stats: stats?.[0] || {}
      });
    }

    // PUT /api/users/settings
    if (req.method === 'PUT') {
      const updates = req.body;
      
      if (!updates || Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No updates provided' });
      }

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
          // JSON fields
          if (key === 'preferred_markets' || key === 'trading_sessions') {
            values.push(JSON.stringify(value));
          } else {
            values.push(value);
          }
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid fields to update' });
      }

      // Check if settings exist
      const [existing] = await executeQuery(
        'SELECT id FROM user_settings WHERE user_id = ?',
        [userId]
      );

      if (existing && existing.length > 0) {
        // Update
        await executeQuery(
          `UPDATE user_settings SET ${setClauses.join(', ')}, updated_at = NOW() WHERE user_id = ?`,
          [...values, userId]
        );
      } else {
        // Insert
        const fields = setClauses.map(c => c.split(' = ')[0]);
        await executeQuery(
          `INSERT INTO user_settings (user_id, ${fields.join(', ')}) VALUES (?, ${fields.map(() => '?').join(', ')})`,
          [userId, ...values]
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Settings updated successfully'
      });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('Settings API error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
