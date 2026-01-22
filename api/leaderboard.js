const { getDbConnection, executeQuery } = require('./db');
const { getCached, setCached } = require('./cache');
// Suppress url.parse() deprecation warnings from dependencies
require('./utils/suppress-warnings');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const timeframe = req.query.timeframe || 'all-time';
    
    // Check cache first (2 minute cache for leaderboard - shorter for more real-time updates)
    const cacheKey = `leaderboard_${timeframe}`;
    const cached = getCached(cacheKey, 120000); // 2 minutes
    if (cached) {
      return res.status(200).json({ success: true, leaderboard: cached });
    }
    
    const db = await getDbConnection();
    if (!db) {
      // Return empty leaderboard if DB unavailable
      return res.status(200).json({ success: true, leaderboard: [] });
    }

    try {
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
        console.warn('xp_logs table already exists or error creating:', tableError.message);
      }

      // Check if users table has XP/level columns
      let hasXp = false;
      let hasLevel = false;
      
      try {
        await db.execute('SELECT xp, level FROM users LIMIT 1');
        hasXp = true;
        hasLevel = true;
      } catch (e) {
        // Check individually
        try {
          await db.execute('SELECT xp FROM users LIMIT 1');
          hasXp = true;
        } catch (e2) {}
        try {
          await db.execute('SELECT level FROM users LIMIT 1');
          hasLevel = true;
        } catch (e2) {}
      }

      // Calculate date range based on timeframe
      let dateFilter = '';
      let dateParams = [];
      
      if (timeframe === 'daily') {
        dateFilter = 'AND xl.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)';
      } else if (timeframe === 'weekly') {
        dateFilter = 'AND xl.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
      } else if (timeframe === 'monthly') {
        dateFilter = 'AND xl.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
      }
      // 'all-time' doesn't need a date filter

      // Query to get users with their XP gains for the selected timeframe
      let query = `
        SELECT 
          u.id,
          u.email,
          u.username,
          u.name,
          ${hasXp ? 'u.xp,' : '0 as xp,'}
          ${hasLevel ? 'u.level,' : '1 as level,'}
          u.role,
          u.avatar,
          COALESCE(SUM(xl.xp_amount), 0) as xp_gain
        FROM users u
        LEFT JOIN xp_logs xl ON u.id = xl.user_id ${dateFilter}
        GROUP BY u.id, u.email, u.username, u.name, u.xp, u.level, u.role, u.avatar
        HAVING xp_gain > 0 OR ? = 'all-time'
        ORDER BY xp_gain DESC, u.xp DESC
        LIMIT 100
      `;
      
      // For all-time, show total XP instead of gains
      if (timeframe === 'all-time') {
        query = `
          SELECT 
            id,
            email,
            username,
            name,
            ${hasXp ? 'xp,' : '0 as xp,'}
            ${hasLevel ? 'level,' : '1 as level,'}
            role,
            avatar,
            ${hasXp ? 'xp' : '0'} as xp_gain
          FROM users
          WHERE ${hasXp ? 'xp > 0' : '1=1'}
          ORDER BY ${hasXp ? 'xp' : 'id'} DESC
          LIMIT 100
        `;
      }

      const [users] = await db.execute(query, timeframe === 'all-time' ? [] : [timeframe]);
      // Don't release connection yet - we might need it for creating fake users

      // Create real user accounts if we have less than 20 users to populate leaderboard
      const fakeUsernames = [
        'Zephyr_Montgomery', 'Kai_Blackwood', 'Jasper_Thornfield', 'Luna_Vesper', 'Orion_Starlight',
        'Phoenix_Ravenwood', 'Atlas_Moonbeam', 'Nova_Shadowmere', 'River_Stormweaver', 'Sage_Emberheart',
        'Aurora_Nightshade', 'Caspian_Winterbourne', 'Indigo_Silvermoon', 'Lyra_Thunderbolt', 'Maverick_Frost',
        'Seraphina_Blaze', 'Titan_Stormrider', 'Vesper_Darkwater', 'Willow_Ember', 'Xander_Crimson',
        'Yuki_Snowfall', 'Zara_Midnight', 'Axel_Firebrand', 'Briar_Rosewood', 'Cora_Stardust'
      ];
      
      if (users.length < 20) {
        // Check if XP and level columns exist
        let hasXp = false;
        let hasLevel = false;
        try {
          await db.execute('SELECT xp, level FROM users LIMIT 1');
          hasXp = true;
          hasLevel = true;
        } catch (e) {
          try {
            await db.execute('SELECT xp FROM users LIMIT 1');
            hasXp = true;
          } catch (e2) {}
          try {
            await db.execute('SELECT level FROM users LIMIT 1');
            hasLevel = true;
          } catch (e2) {}
        }

        // Create missing columns if needed
        if (!hasXp) {
          await db.execute('ALTER TABLE users ADD COLUMN xp DECIMAL(10, 2) DEFAULT 0');
        }
        if (!hasLevel) {
          await db.execute('ALTER TABLE users ADD COLUMN level INT DEFAULT 1');
        }

        // Calculate level from XP using the correct XP system formula
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

        // Create real user accounts for leaderboard with realistic XP/Level progression
        // For time-based leaderboards, we'll generate XP logs for different timeframes
        for (let i = 0; i < Math.min(20 - users.length, fakeUsernames.length); i++) {
          const username = fakeUsernames[i];
          const email = `trader${i + 1}@aurafx.com`;
          // Generate realistic XP values that make sense with level progression
          // Top users should have higher XP (30k-50k), mid users (10k-30k), lower users (1k-10k)
          const rankMultiplier = (20 - i) / 20; // Higher rank = more XP
          const baseXP = 1000 + (rankMultiplier * 49000); // Range: 1000-50000
          const variance = Math.random() * 5000; // Add some variance
          const fakeXP = Math.floor(baseXP + variance);
          const fakeLevel = getLevelFromXP(fakeXP); // Use correct level calculation
          
          // Check if user already exists
          const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
          let userId;
          
          if (existing.length === 0) {
            // Create new user account
            const [insertResult] = await db.execute(
              'INSERT INTO users (email, username, name, password, role, xp, level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
              [email, username, username, 'leaderboard_user_' + Date.now(), 'free', fakeXP, fakeLevel]
            );
            userId = insertResult.insertId;
          } else {
            userId = existing[0].id;
            // Update existing user's XP and level
            await db.execute(
              'UPDATE users SET xp = ?, level = ? WHERE email = ?',
              [fakeXP, fakeLevel, email]
            );
          }
          
          // Generate XP logs for different timeframes to make bots beatable
          // For Today: 50-200 XP (achievable by active users)
          // For This Week: 200-800 XP (achievable by active users)
          // For This Month: 800-3000 XP (achievable by active users)
          // Make sure bots are beatable - top bot should have ~200 XP today, ~800 XP this week, ~3000 XP this month
          
          // Today's XP gain (50-200 XP range, top users have more)
          const todayXP = Math.floor(50 + (rankMultiplier * 150)); // 50-200 XP
          const todayDate = new Date();
          todayDate.setHours(0, 0, 0, 0);
          
          // This Week's XP gain (200-800 XP range)
          const weekXP = Math.floor(200 + (rankMultiplier * 600)); // 200-800 XP
          const weekStartDate = new Date();
          weekStartDate.setDate(weekStartDate.getDate() - 7);
          weekStartDate.setHours(0, 0, 0, 0);
          
          // This Month's XP gain (800-3000 XP range)
          const monthXP = Math.floor(800 + (rankMultiplier * 2200)); // 800-3000 XP
          const monthStartDate = new Date();
          monthStartDate.setDate(monthStartDate.getDate() - 30);
          monthStartDate.setHours(0, 0, 0, 0);
          
          // Generate XP logs for today (multiple activities)
          const todayActivities = Math.floor(2 + (rankMultiplier * 8)); // 2-10 activities
          for (let j = 0; j < todayActivities; j++) {
            const activityXP = Math.floor(todayXP / todayActivities);
            const activityTime = new Date(todayDate);
            activityTime.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);
            
            try {
              await db.execute(
                'INSERT INTO xp_logs (user_id, xp_amount, action_type, description, created_at) VALUES (?, ?, ?, ?, ?)',
                [userId, activityXP, 'message', `Community message - Day ${j + 1}`, activityTime]
              );
            } catch (e) {
              // Ignore duplicate or errors
            }
          }
          
          // Generate XP logs for this week (distributed across days)
          const weekActivities = Math.floor(5 + (rankMultiplier * 20)); // 5-25 activities
          for (let j = 0; j < weekActivities; j++) {
            const activityXP = Math.floor(weekXP / weekActivities);
            const daysAgo = Math.floor(Math.random() * 7);
            const activityTime = new Date(weekStartDate);
            activityTime.setDate(activityTime.getDate() + daysAgo);
            activityTime.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);
            
            try {
              await db.execute(
                'INSERT INTO xp_logs (user_id, xp_amount, action_type, description, created_at) VALUES (?, ?, ?, ?, ?)',
                [userId, activityXP, 'message', `Community message - Week activity ${j + 1}`, activityTime]
              );
            } catch (e) {
              // Ignore duplicate or errors
            }
          }
          
          // Generate XP logs for this month (distributed across days)
          const monthActivities = Math.floor(20 + (rankMultiplier * 80)); // 20-100 activities
          for (let j = 0; j < monthActivities; j++) {
            const activityXP = Math.floor(monthXP / monthActivities);
            const daysAgo = Math.floor(Math.random() * 30);
            const activityTime = new Date(monthStartDate);
            activityTime.setDate(activityTime.getDate() + daysAgo);
            activityTime.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60), 0, 0);
            
            try {
              await db.execute(
                'INSERT INTO xp_logs (user_id, xp_amount, action_type, description, created_at) VALUES (?, ?, ?, ?, ?)',
                [userId, activityXP, 'message', `Community message - Month activity ${j + 1}`, activityTime]
              );
            } catch (e) {
              // Ignore duplicate or errors
            }
          }
        }
        
        // Re-fetch users after creating/updating
        const [updatedUsers] = await db.execute(query, timeframe === 'all-time' ? [] : [timeframe]);
        users.length = 0;
        users.push(...updatedUsers);
      }
      
      // Release connection after all operations
      db.release();

      // Update users with generic trading-related usernames to more realistic names
      const genericNames = ['ProTrader', 'CommodityTrader', 'MarketMaster', 'DayTrader', 'SwingTrader', 
        'CryptoTrader', 'ForexTrader', 'StockTrader', 'OptionsTrader', 'FuturesTrader',
        'TradingPro', 'MarketGuru', 'TradingExpert', 'TradeMaster', 'ProfitTrader'];
      
      const replacementNames = [
        'Zephyr_Montgomery', 'Kai_Blackwood', 'Jasper_Thornfield', 'Luna_Vesper', 'Orion_Starlight',
        'Phoenix_Ravenwood', 'Atlas_Moonbeam', 'Nova_Shadowmere', 'River_Stormweaver', 'Sage_Emberheart',
        'Aurora_Nightshade', 'Caspian_Winterbourne', 'Indigo_Silvermoon', 'Lyra_Thunderbolt', 'Maverick_Frost'
      ];
      
      for (const user of users) {
        const currentUsername = (user.username || user.name || '').trim();
        if (genericNames.includes(currentUsername)) {
          // Find a replacement name that's not already taken
          let newUsername = null;
          for (const replacement of replacementNames) {
            const [taken] = await db.execute('SELECT id FROM users WHERE username = ? OR name = ?', [replacement, replacement]);
            if (taken.length === 0) {
              newUsername = replacement;
              break;
            }
          }
          
          // If all replacement names are taken, use a random one with a number
          if (!newUsername) {
            const randomIndex = Math.floor(Math.random() * replacementNames.length);
            newUsername = `${replacementNames[randomIndex]}_${Math.floor(Math.random() * 1000)}`;
          }
          
          // Update the user's username and name
          await db.execute(
            'UPDATE users SET username = ?, name = ? WHERE id = ?',
            [newUsername, newUsername, user.id]
          );
          
          // Update the user object for this iteration
          user.username = newUsername;
          user.name = newUsername;
        }
      }

      // Calculate level from XP function (same as above, for recalculating levels)
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

      const leaderboard = users.map((user, index) => {
        const userXP = timeframe === 'all-time' 
          ? (hasXp ? (parseFloat(user.xp) || 0) : 0)
          : (parseFloat(user.xp_gain) || 0);
        const totalXP = hasXp ? (parseFloat(user.xp) || 0) : 0;
        
        // Recalculate level from XP to ensure it matches (fixes any inconsistencies)
        const calculatedLevel = getLevelFromXP(totalXP || userXP);
        const storedLevel = hasLevel ? (parseInt(user.level) || 1) : 1;
        
        // Use calculated level if it differs from stored (ensures consistency)
        const finalLevel = Math.abs(calculatedLevel - storedLevel) > 1 ? calculatedLevel : storedLevel;
        
        return {
          rank: index + 1,
          id: user.id,
          userId: user.id,
          username: user.username || user.name || user.email?.split('@')[0] || 'User',
          email: user.email,
          xp: userXP,
          xpGain: timeframe !== 'all-time' ? (parseFloat(user.xp_gain) || 0) : null,
          totalXP: totalXP,
          level: finalLevel,
          avatar: user.avatar || 'avatar_ai.png',
          role: user.role || 'free',
          strikes: 0
        };
      });

      // Cache the result
      setCached(cacheKey, leaderboard);
      
      return res.status(200).json({ success: true, leaderboard });
    } catch (dbError) {
      console.error('Database error fetching leaderboard:', dbError);
      if (db) {
        try {
          db.release(); // Release connection if still held
        } catch (e) {
          // Ignore release errors
        }
      }
      return res.status(200).json({ success: true, leaderboard: [] });
    }
  } catch (error) {
    console.error('Error in leaderboard:', error);
    return res.status(200).json({ success: true, leaderboard: [] });
  }
};

