const { executeQuery } = require('../db');
const { postLevelUpToLevelsChannel } = require('../utils/post-level-up-to-levels-channel');
const { calculateLoginXP, getLevelFromXP } = require('../utils/xp-system');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

function displayNameFromUser(u) {
  if (!u) return 'User';
  return (u.username || u.name || (u.email && String(u.email).split('@')[0]) || 'User').toString();
}

// Add timeout wrapper for database operations (reduced for speed)
const withTimeout = (promise, timeoutMs = 2000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
    )
  ]);
};


async function logDailyLoginXpEvent(executeQuery, userId, xpReward, desc) {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS xp_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        amount DECIMAL(14, 4) NOT NULL,
        source VARCHAR(50) NOT NULL,
        meta JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      )
    `);
    await executeQuery(
      'INSERT INTO xp_events (user_id, amount, source, meta) VALUES (?, ?, ?, ?)',
      [userId, xpReward, 'daily_login', JSON.stringify({ description: desc || 'daily_login' })]
    );
  } catch (e) {
    console.warn('daily-login xp_events:', e.message);
  }
}

module.exports = async (req, res) => {
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

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    /**
     * Streak must use MySQL calendar math. mysql2 returns last_login_date as a JS Date;
     * .toString().split('T')[0] becomes "" when the string starts with "Tue…", so JS never
     * saw "yesterday" and streak stayed at 1 forever.
     */
    let user;
    try {
      const [users] = await withTimeout(
        executeQuery(
          `SELECT id, login_streak, last_login_date, xp, level, username, name, email,
            CASE WHEN last_login_date IS NULL THEN NULL
                 ELSE DATEDIFF(CURDATE(), DATE(last_login_date)) END AS days_since_last,
            CASE WHEN last_login_date IS NULL THEN 0
                 WHEN DATE(last_login_date) = CURDATE() THEN 1 ELSE 0 END AS logged_in_today
           FROM users WHERE id = ?`,
          [userId]
        ),
        2000
      );

      if (!users || users.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      user = users[0];
      const currentStreak = parseInt(user.login_streak, 10) || 0;
      const daysSinceNum =
        user.days_since_last === null || user.days_since_last === undefined
          ? null
          : Number(user.days_since_last);

      const alreadyToday =
        user.logged_in_today === 1 ||
        user.logged_in_today === '1' ||
        daysSinceNum === 0;

      if (alreadyToday) {
        return res.status(200).json({
          success: true,
          alreadyLoggedIn: true,
          streak: currentStreak,
          xpAwarded: 0,
          newXP: parseFloat(user.xp) || 0,
          newLevel: parseInt(user.level, 10) || 1,
          message: 'Already logged in today'
        });
      }

      if (daysSinceNum !== null && daysSinceNum > 1) {
        const newStreak = 1;
        const xpReward = calculateLoginXP(newStreak);
        const newXP = (parseFloat(user.xp) || 0) + xpReward;
        const newLevel = getLevelFromXP(newXP);

        const [updateResult] = await withTimeout(
          executeQuery(
            'UPDATE users SET login_streak = ?, last_login_date = CURDATE(), xp = ?, level = ? WHERE id = ? AND (last_login_date IS NULL OR DATE(last_login_date) < CURDATE())',
            [newStreak, newXP, newLevel, userId]
          ),
          2000
        );

        let affectedRows = 0;
        if (updateResult && Array.isArray(updateResult) && updateResult.length > 0) {
          if (updateResult[0] && typeof updateResult[0] === 'object' && 'affectedRows' in updateResult[0]) {
            affectedRows = updateResult[0].affectedRows || 0;
          } else if (typeof updateResult[0] === 'number') {
            affectedRows = updateResult[0];
          }
        }

        if (affectedRows === 0) {
          const [currentUserRows] = await withTimeout(
            executeQuery('SELECT login_streak, xp, level FROM users WHERE id = ?', [userId]),
            1000
          ).catch(() => [[user]]);
          const currentUser = currentUserRows && currentUserRows.length > 0 ? currentUserRows[0] : user;
          return res.status(200).json({
            success: true,
            alreadyLoggedIn: true,
            streak: parseInt(currentUser.login_streak, 10) || currentStreak,
            xpAwarded: 0,
            newXP: parseFloat(currentUser.xp) || parseFloat(user.xp) || 0,
            newLevel: parseInt(currentUser.level, 10) || parseInt(user.level, 10) || 1,
            message: 'Already logged in today'
          });
        }

        executeQuery(
          'INSERT INTO xp_logs (user_id, xp_amount, action_type, description) VALUES (?, ?, ?, ?)',
          [userId, xpReward, 'daily_login', 'Daily login — streak reset after gap (1 day)']
        ).catch(err => console.warn('XP log failed (non-blocking):', err.message));
        logDailyLoginXpEvent(executeQuery, userId, xpReward, 'streak_reset_day');

        const prevLvReset = parseInt(user.level, 10) || 1;
        if (newLevel > prevLvReset) {
          postLevelUpToLevelsChannel({
            username: displayNameFromUser(user),
            newLevel,
            senderIdFallback: userId
          }).catch(() => {});
        }

        return res.status(200).json({
          success: true,
          streak: newStreak,
          xpAwarded: xpReward,
          newXP,
          newLevel,
          streakReset: true,
          leveledUp: newLevel > prevLvReset,
          message: 'Login streak restarted after a missed day.'
        });
      }

      const newStreak = daysSinceNum === 1 ? currentStreak + 1 : 1;
      const xpReward = calculateLoginXP(newStreak);
      const currentXP = parseFloat(user.xp) || 0;
      const newXP = currentXP + xpReward;
      const newLevel = getLevelFromXP(newXP);
      const leveledUp = newLevel > (parseInt(user.level, 10) || 1);

      const [updateResult] = await withTimeout(
        executeQuery(
          'UPDATE users SET login_streak = ?, last_login_date = CURDATE(), xp = ?, level = ? WHERE id = ? AND (last_login_date IS NULL OR DATE(last_login_date) < CURDATE())',
          [newStreak, newXP, newLevel, userId]
        ),
        2000
      );

      let affectedRows = 0;
      if (updateResult && Array.isArray(updateResult) && updateResult.length > 0) {
        if (updateResult[0] && typeof updateResult[0] === 'object' && 'affectedRows' in updateResult[0]) {
          affectedRows = updateResult[0].affectedRows || 0;
        } else if (typeof updateResult[0] === 'number') {
          affectedRows = updateResult[0];
        }
      }

      if (affectedRows === 0) {
        const [currentUserRows] = await withTimeout(
          executeQuery('SELECT login_streak, xp, level FROM users WHERE id = ?', [userId]),
          1000
        ).catch(() => [[user]]);
        const currentUser = currentUserRows && currentUserRows.length > 0 ? currentUserRows[0] : user;
        return res.status(200).json({
          success: true,
          alreadyLoggedIn: true,
          streak: parseInt(currentUser.login_streak, 10) || currentStreak,
          xpAwarded: 0,
          newXP: parseFloat(currentUser.xp) || parseFloat(user.xp) || 0,
          newLevel: parseInt(currentUser.level, 10) || parseInt(user.level, 10) || 1,
          message: 'Already logged in today'
        });
      }

      executeQuery(
        'INSERT INTO xp_logs (user_id, xp_amount, action_type, description) VALUES (?, ?, ?, ?)',
        [userId, xpReward, 'daily_login', `Daily login - ${newStreak} day streak`]
      ).catch(err => console.warn('XP log failed (non-blocking):', err.message));
      logDailyLoginXpEvent(executeQuery, userId, xpReward, `streak_${newStreak}`);

      if (leveledUp) {
        console.log(`User ${userId} leveled up to ${newLevel} from daily login`);
        postLevelUpToLevelsChannel({
          username: displayNameFromUser(user),
          newLevel,
          senderIdFallback: userId
        }).catch(() => {});
      }

      return res.status(200).json({
        success: true,
        streak: newStreak,
        xpAwarded: xpReward,
        newXP,
        newLevel,
        leveledUp,
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
