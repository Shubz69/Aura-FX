const { executeQuery } = require('../db');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

// Add timeout wrapper for database operations (reduced for speed)
const withTimeout = (promise, timeoutMs = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
    )
  ]);
};

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

    // Use executeQuery helper which auto-releases connections
    // Get current user data and today's date in one query (optimized)
    let user, todayStr;
    try {
      const [users] = await withTimeout(
        executeQuery(
          'SELECT id, login_streak, last_login_date, xp, level, CURDATE() as today FROM users WHERE id = ?',
          [userId]
        ),
        2000
      );

      if (!users || users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      user = users[0];
      todayStr = user.today;
      const currentStreak = user.login_streak || 0;
      
      // Handle last_login_date - can be DATE or DATETIME
      let lastLoginDate = null;
      if (user.last_login_date) {
        // If it's a DATE string (YYYY-MM-DD), use it directly
        const dateStr = user.last_login_date.toString();
        lastLoginDate = dateStr.split('T')[0]; // Get just the date part (YYYY-MM-DD)
      }
      
      // Compare dates as strings (YYYY-MM-DD format) for accurate day comparison
      // This avoids timezone issues
      let daysDiff = null;
      if (lastLoginDate) {
        // Parse dates and calculate difference
        const lastLogin = new Date(lastLoginDate + 'T00:00:00Z'); // UTC midnight
        const today = new Date(todayStr + 'T00:00:00Z'); // UTC midnight
        daysDiff = Math.floor((today - lastLogin) / (1000 * 60 * 60 * 24));
      }
      
      // Check if user already logged in today - EARLY RETURN (fastest path)
      if (lastLoginDate && daysDiff !== null && daysDiff === 0) {
        // Already logged in today, return immediately without any database updates
        // This is the most common case and should be super fast
        return res.status(200).json({
          success: true,
          alreadyLoggedIn: true,
          streak: currentStreak,
          xpAwarded: 0, // Explicitly set to 0
          newXP: parseFloat(user.xp) || 0, // Return current XP (no change)
          newLevel: parseInt(user.level) || 1, // Return current level (no change)
          message: 'Already logged in today'
        });
      }
      
      // User hasn't logged in today - continue with XP award logic
      if (lastLoginDate && daysDiff !== null) {
        if (daysDiff > 1) {
          // Missed a day (or more), reset streak to 0 first, then start new streak at 1
          const newStreak = 1;
          const xpReward = calculateLoginXP(newStreak); // Base 25 XP for new streak
          const newXP = (parseFloat(user.xp) || 0) + xpReward;
          const newLevel = getLevelFromXP(newXP);
          
          // Single UPDATE query (optimized)
          await withTimeout(
            executeQuery(
              'UPDATE users SET login_streak = ?, last_login_date = CURDATE(), xp = ?, level = ? WHERE id = ?',
              [newStreak, newXP, newLevel, userId]
            ),
            2000
          );
          
          // Log XP gain (fire and forget - don't wait)
          executeQuery(
            'INSERT INTO xp_logs (user_id, xp_amount, action_type, description) VALUES (?, ?, ?, ?)',
            [userId, xpReward, 'daily_login', `Daily login - Streak reset to 0, new streak started (1 day)`]
          ).catch(err => console.warn('XP log failed (non-blocking):', err.message));
          
          return res.status(200).json({
            success: true,
            streak: newStreak,
            xpAwarded: xpReward,
            newXP: newXP,
            newLevel: newLevel,
            streakReset: true,
            message: 'Login streak reset to 0. New streak started!'
          });
        }
        // daysDiff === 1 means user logged in yesterday, continue to increment streak
      }

      // User logged in yesterday (daysDiff === 1) or first time (no lastLoginDate), increment streak
      // If daysDiff === 1, they logged in yesterday, so continue streak
      // If no lastLoginDate, this is their first login, start at 1
      const newStreak = (lastLoginDate && daysDiff === 1) ? currentStreak + 1 : 1;
      const xpReward = calculateLoginXP(newStreak);
      const currentXP = parseFloat(user.xp) || 0;
      const newXP = currentXP + xpReward;
      const newLevel = getLevelFromXP(newXP);
      const leveledUp = newLevel > (parseInt(user.level) || 1);

      // Update user streak, last login date, XP, and level (single query - optimized)
      await withTimeout(
        executeQuery(
          'UPDATE users SET login_streak = ?, last_login_date = CURDATE(), xp = ?, level = ? WHERE id = ?',
          [newStreak, newXP, newLevel, userId]
        ),
        2000
      );

      // Log XP gain (fire and forget - don't wait)
      executeQuery(
        'INSERT INTO xp_logs (user_id, xp_amount, action_type, description) VALUES (?, ?, ?, ?)',
        [userId, xpReward, 'daily_login', `Daily login - ${newStreak} day streak`]
      ).catch(err => console.warn('XP log failed (non-blocking):', err.message));

      // If user leveled up, trigger level-up notification (optional)
      if (leveledUp) {
        console.log(`User ${userId} leveled up to ${newLevel} from daily login`);
      }

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
      return res.status(500).json({ success: false, message: 'Database error' });
    }
  } catch (error) {
    console.error('Error in daily login:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
