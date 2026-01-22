const { getDbConnection } = require('../db');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

/**
 * Calculate XP reward based on login streak
 * Base: 25 XP, scales with streak length
 */
const calculateLoginXP = (streak) => {
  const baseXP = 25;
  // Bonus XP increases with streak: +5 XP per 7 days (capped at 100 bonus)
  const bonusMultiplier = Math.min(Math.floor(streak / 7), 20); // Max 20 bonuses = 100 bonus XP
  const bonusXP = bonusMultiplier * 5;
  return baseXP + bonusXP;
};

/**
 * Calculate level from XP (same as XP system)
 */
const getLevelFromXP = (xp) => {
  if (xp <= 0) return 1;
  if (xp >= 1000000) return 1000;
  
  if (xp < 500) {
    return Math.floor(Math.sqrt(xp / 50)) + 1;
  } else if (xp < 5000) {
    const baseLevel = 10;
    const remainingXP = xp - 500;
    return baseLevel + Math.floor(Math.sqrt(remainingXP / 100)) + 1;
  } else if (xp < 20000) {
    const baseLevel = 50;
    const remainingXP = xp - 5000;
    return baseLevel + Math.floor(Math.sqrt(remainingXP / 200)) + 1;
  } else if (xp < 100000) {
    const baseLevel = 100;
    const remainingXP = xp - 20000;
    return baseLevel + Math.floor(Math.sqrt(remainingXP / 500)) + 1;
  } else if (xp < 500000) {
    const baseLevel = 200;
    const remainingXP = xp - 100000;
    return baseLevel + Math.floor(Math.sqrt(remainingXP / 1000)) + 1;
  } else {
    const baseLevel = 500;
    const remainingXP = xp - 500000;
    return Math.min(1000, baseLevel + Math.floor(Math.sqrt(remainingXP / 2000)) + 1);
  }
};

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
    const userId = req.body.userId || req.query.userId;
    const token = req.headers.authorization?.replace('Bearer ', '') || req.body.token || req.query.token;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    try {
      // Ensure required columns exist
      try {
        await db.execute('SELECT login_streak, last_login_date, xp, level FROM users LIMIT 1');
      } catch (e) {
        // Add missing columns
        try {
          await db.execute('ALTER TABLE users ADD COLUMN login_streak INT DEFAULT 0');
        } catch (e2) {}
        try {
          await db.execute('ALTER TABLE users ADD COLUMN last_login_date DATE DEFAULT NULL');
        } catch (e2) {}
        try {
          await db.execute('ALTER TABLE users ADD COLUMN xp DECIMAL(10, 2) DEFAULT 0');
        } catch (e2) {}
        try {
          await db.execute('ALTER TABLE users ADD COLUMN level INT DEFAULT 1');
        } catch (e2) {}
      }

      // Ensure xp_logs table exists
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS xp_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            xp_amount DECIMAL(10, 2) NOT NULL,
            action_type VARCHAR(50) NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_created_at (created_at),
            INDEX idx_action_type (action_type)
          )
        `);
      } catch (tableError) {
        // Table already exists
      }

      // Get current user data
      const [users] = await db.execute(
        'SELECT id, login_streak, last_login_date, xp, level FROM users WHERE id = ?',
        [userId]
      );

      if (!users || users.length === 0) {
        await db.end();
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const user = users[0];
      const currentStreak = user.login_streak || 0;
      // Handle last_login_date - can be DATE or DATETIME
      let lastLoginDate = null;
      if (user.last_login_date) {
        // If it's a DATE string (YYYY-MM-DD), add time component for proper parsing
        const dateStr = user.last_login_date.toString();
        lastLoginDate = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
      }
      const currentDate = new Date();
      // Get today's date at midnight for accurate comparison
      const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
      
      // Check if user already logged in today
      if (lastLoginDate) {
        // Normalize last login date to midnight for accurate day comparison
        const lastLogin = new Date(lastLoginDate.getFullYear(), lastLoginDate.getMonth(), lastLoginDate.getDate());
        const daysDiff = Math.floor((today - lastLogin) / (1000 * 60 * 60 * 24));
        
        if (daysDiff === 0) {
          // Already logged in today, return current streak without awarding XP
          await db.end();
          return res.status(200).json({
            success: true,
            alreadyLoggedIn: true,
            streak: currentStreak,
            message: 'Already logged in today'
          });
        } else if (daysDiff > 1) {
          // Missed a day (or more), reset streak to 1
          const newStreak = 1;
          const xpReward = calculateLoginXP(newStreak); // Base 25 XP for new streak
          const newXP = (parseFloat(user.xp) || 0) + xpReward;
          const newLevel = getLevelFromXP(newXP);
          
          await db.execute(
            'UPDATE users SET login_streak = ?, last_login_date = CURDATE(), xp = ?, level = ? WHERE id = ?',
            [newStreak, newXP, newLevel, userId]
          );
          
          // Log XP gain
          await db.execute(
            'INSERT INTO xp_logs (user_id, xp_amount, action_type, description) VALUES (?, ?, ?, ?)',
            [userId, xpReward, 'daily_login', `Daily login - Streak reset, new streak started (1 day)`]
          );
          
          await db.end();
          return res.status(200).json({
            success: true,
            streak: newStreak,
            xpAwarded: xpReward,
            newXP: newXP,
            newLevel: newLevel,
            message: 'Login streak reset. New streak started!'
          });
        }
        // daysDiff === 1 means user logged in yesterday, continue to increment streak
      }

      // User logged in yesterday (or first time), increment streak
      const newStreak = lastLoginDate ? currentStreak + 1 : 1;
      const xpReward = calculateLoginXP(newStreak);
      const currentXP = parseFloat(user.xp) || 0;
      const newXP = currentXP + xpReward;
      const newLevel = getLevelFromXP(newXP);
      const leveledUp = newLevel > (parseInt(user.level) || 1);

      // Update user streak, last login date, XP, and level
      await db.execute(
        'UPDATE users SET login_streak = ?, last_login_date = CURDATE(), xp = ?, level = ? WHERE id = ?',
        [newStreak, newXP, newLevel, userId]
      );

      // Log XP gain
      await db.execute(
        'INSERT INTO xp_logs (user_id, xp_amount, action_type, description) VALUES (?, ?, ?, ?)',
        [userId, xpReward, 'daily_login', `Daily login - ${newStreak} day streak`]
      );

      // If user leveled up, trigger level-up notification (optional)
      if (leveledUp) {
        // You can add level-up notification logic here if needed
        console.log(`User ${userId} leveled up to ${newLevel} from daily login`);
      }

      await db.end();

      return res.status(200).json({
        success: true,
        streak: newStreak,
        xpAwarded: xpReward,
        newXP: newXP,
        newLevel: newLevel,
        leveledUp: leveledUp,
        message: `Login streak: ${newStreak} days! +${xpReward} XP`
      });

    } catch (dbError) {
      console.error('Database error in daily login:', dbError);
      if (db && !db.ended) {
        try {
          await db.end();
        } catch (e) {
          // Ignore
        }
      }
      return res.status(500).json({ success: false, message: 'Database error' });
    }
  } catch (error) {
    console.error('Error in daily login:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
