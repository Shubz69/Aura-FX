/**
 * Demo Leaderboard Data Seeder
 * 
 * Creates realistic trader usernames and XP event distributions
 * with various activity profiles to ensure natural variation
 * across daily/weekly/monthly leaderboards.
 * 
 * Activity Profiles:
 * - grinder: Consistent daily activity, high total XP
 * - sprinter: Burst activity on certain days, high peaks
 * - weekend_warrior: Most active on weekends
 * - course_binger: Large XP chunks from course completions
 * - admin_spotlight: Occasional large XP bonuses
 * - casual: Low, sporadic activity
 * - streak_master: Daily login bonus focused
 * - chat_enthusiast: Heavy community message activity
 */

const { executeQuery } = require('../db');

// Deterministic seeded random number generator
class SeededRandom {
  constructor(seed = 12345) {
    this.seed = seed;
  }
  
  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  
  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  
  shuffle(arr) {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// Username components for realistic trader handles
const USERNAME_PARTS = {
  prefixes: [
    'Alpha', 'Beta', 'Sigma', 'Delta', 'Omega', 'Apex', 'Prime', 'Neo', 'Cyber', 'Quantum',
    'Shadow', 'Ghost', 'Phantom', 'Stealth', 'Swift', 'Thunder', 'Storm', 'Frost', 'Blaze', 'Ember'
  ],
  sessions: [
    'London', 'NYC', 'Tokyo', 'Sydney', 'Frankfurt', 'Asian', 'Euro', 'US', 'Pacific', 'Atlantic'
  ],
  instruments: [
    'Gold', 'Oil', 'Euro', 'Cable', 'Aussie', 'Kiwi', 'Loonie', 'Swissy', 'Yen', 'Yuan',
    'BTC', 'ETH', 'SPX', 'NAS', 'DAX', 'FTSE', 'Nikkei', 'Crude', 'Silver', 'Copper'
  ],
  styles: [
    'Scalper', 'Swing', 'Day', 'Position', 'Trend', 'Range', 'Break', 'Momentum', 'Reversal', 'News'
  ],
  suffixes: [
    'Trader', 'FX', 'Pro', 'Capital', 'Markets', 'Pips', 'Gains', 'Alpha', 'Edge', 'Flow',
    'Hunter', 'Master', 'King', 'Queen', 'Boss', 'Chief', 'Ace', 'Elite', 'Prime', 'Max'
  ],
  names: [
    'Zephyr', 'Kai', 'Luna', 'Orion', 'Phoenix', 'Atlas', 'Nova', 'River', 'Sage', 'Aurora',
    'Caspian', 'Indigo', 'Lyra', 'Maverick', 'Seraphina', 'Titan', 'Vesper', 'Willow', 'Xander', 'Yuki',
    'Axel', 'Briar', 'Cora', 'Drake', 'Echo', 'Finn', 'Gemma', 'Hunter', 'Iris', 'Jett'
  ],
  numbers: ['1', '2', '3', '7', '8', '9', '99', '00', '21', '23', '88', '777']
};

// Activity profiles with XP generation parameters
const ACTIVITY_PROFILES = {
  grinder: {
    description: 'Consistent daily activity',
    dailyChance: 0.95,
    eventsPerDay: [3, 8],
    xpPerEvent: [5, 25],
    weekendMultiplier: 0.7,
    streakBonus: true,
    courseChance: 0.1,
    spikeChance: 0.05
  },
  sprinter: {
    description: 'Burst activity on certain days',
    dailyChance: 0.4,
    eventsPerDay: [8, 20],
    xpPerEvent: [10, 40],
    weekendMultiplier: 1.5,
    streakBonus: false,
    courseChance: 0.05,
    spikeChance: 0.2
  },
  weekend_warrior: {
    description: 'Most active on weekends',
    dailyChance: 0.3,
    eventsPerDay: [2, 6],
    xpPerEvent: [8, 30],
    weekendMultiplier: 3.0,
    streakBonus: false,
    courseChance: 0.15,
    spikeChance: 0.1
  },
  course_binger: {
    description: 'Large XP from course completions',
    dailyChance: 0.2,
    eventsPerDay: [1, 3],
    xpPerEvent: [5, 15],
    weekendMultiplier: 1.2,
    streakBonus: false,
    courseChance: 0.4,
    spikeChance: 0.15
  },
  admin_spotlight: {
    description: 'Occasional large XP bonuses',
    dailyChance: 0.5,
    eventsPerDay: [2, 5],
    xpPerEvent: [5, 20],
    weekendMultiplier: 1.0,
    streakBonus: true,
    courseChance: 0.1,
    spikeChance: 0.25
  },
  casual: {
    description: 'Low, sporadic activity',
    dailyChance: 0.25,
    eventsPerDay: [1, 3],
    xpPerEvent: [3, 12],
    weekendMultiplier: 1.1,
    streakBonus: false,
    courseChance: 0.05,
    spikeChance: 0.02
  },
  streak_master: {
    description: 'Daily login bonus focused',
    dailyChance: 0.9,
    eventsPerDay: [1, 2],
    xpPerEvent: [15, 35],
    weekendMultiplier: 1.0,
    streakBonus: true,
    courseChance: 0.05,
    spikeChance: 0.03
  },
  chat_enthusiast: {
    description: 'Heavy community message activity',
    dailyChance: 0.85,
    eventsPerDay: [5, 15],
    xpPerEvent: [3, 10],
    weekendMultiplier: 0.8,
    streakBonus: true,
    courseChance: 0.02,
    spikeChance: 0.08
  }
};

const XP_SOURCES = ['message', 'login', 'course', 'bonus', 'achievement', 'reaction', 'help', 'journal'];

// Generate a unique trader username – realistic online style, no underscores
function generateUsername(rng, usedNames) {
  let attempts = 0;
  let username;
  
  while (attempts < 50) {
    const style = rng.int(1, 6);
    
    switch (style) {
      case 1: // Prefix + Instrument (e.g. AlphaGold, CyberBTC)
        username = `${rng.pick(USERNAME_PARTS.prefixes)}${rng.pick(USERNAME_PARTS.instruments)}`;
        break;
      case 2: // Session + Style (e.g. LondonScalper, NYCDay)
        username = `${rng.pick(USERNAME_PARTS.sessions)}${rng.pick(USERNAME_PARTS.styles)}`;
        break;
      case 3: // Name + Suffix (e.g. LunaTrader, KaiPro)
        username = `${rng.pick(USERNAME_PARTS.names)}${rng.pick(USERNAME_PARTS.suffixes)}`;
        break;
      case 4: // Prefix + Name + Number (e.g. AlphaZephyr99, NeoKai21)
        username = `${rng.pick(USERNAME_PARTS.prefixes)}${rng.pick(USERNAME_PARTS.names)}${rng.pick(USERNAME_PARTS.numbers)}`;
        break;
      case 5: // Instrument + Suffix + Number (e.g. GoldTrader7, BTCPro23)
        username = `${rng.pick(USERNAME_PARTS.instruments)}${rng.pick(USERNAME_PARTS.suffixes)}${rng.pick(USERNAME_PARTS.numbers)}`;
        break;
      default: // Prefix + Style + Number (e.g. AlphaScalper42, CyberTrend99)
        username = `${rng.pick(USERNAME_PARTS.prefixes)}${rng.pick(USERNAME_PARTS.styles)}${rng.int(1, 999)}`;
    }
    
    username = username.replace(/\s+/g, '').replace(/_/g, '').substring(0, 20);
    
    if (!usedNames.has(username.toLowerCase())) {
      usedNames.add(username.toLowerCase());
      return username;
    }
    attempts++;
  }
  
  // Fallback: Trader + number, no underscore
  return `Trader${rng.int(10000, 99999)}`;
}

// Generate XP events for a user based on their profile
function generateXpEvents(rng, userId, profile, daysBack = 30) {
  const events = [];
  const now = new Date();
  const profileConfig = ACTIVITY_PROFILES[profile];
  
  for (let dayOffset = 0; dayOffset < daysBack; dayOffset++) {
    const eventDate = new Date(now);
    eventDate.setUTCDate(eventDate.getUTCDate() - dayOffset);
    eventDate.setUTCHours(0, 0, 0, 0);
    
    const dayOfWeek = eventDate.getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Determine if user is active this day
    let activityChance = profileConfig.dailyChance;
    if (isWeekend) {
      activityChance *= profileConfig.weekendMultiplier;
    }
    
    // Recent days have higher activity (recency bias)
    if (dayOffset < 3) activityChance *= 1.3;
    else if (dayOffset < 7) activityChance *= 1.1;
    
    if (rng.next() > activityChance) continue;
    
    // Generate events for this day
    const numEvents = rng.int(profileConfig.eventsPerDay[0], profileConfig.eventsPerDay[1]);
    
    for (let i = 0; i < numEvents; i++) {
      let xpAmount = rng.int(profileConfig.xpPerEvent[0], profileConfig.xpPerEvent[1]);
      let source = rng.pick(XP_SOURCES.slice(0, 3)); // Mostly messages, logins
      
      // Course completion (large XP)
      if (rng.next() < profileConfig.courseChance) {
        xpAmount = rng.int(50, 150);
        source = 'course';
      }
      
      // Spike/bonus event
      if (rng.next() < profileConfig.spikeChance) {
        xpAmount = rng.int(75, 200);
        source = rng.pick(['bonus', 'achievement', 'help']);
      }
      
      // Streak bonus (login)
      if (profileConfig.streakBonus && rng.next() < 0.15) {
        xpAmount += rng.int(10, 30);
        source = 'login';
      }
      
      // Random time during the day
      const eventTime = new Date(eventDate);
      eventTime.setUTCHours(rng.int(6, 23), rng.int(0, 59), rng.int(0, 59));
      
      events.push({
        user_id: userId,
        amount: xpAmount,
        source: source,
        created_at: eventTime
      });
    }
  }
  
  return events;
}

// Calculate level from XP
function getLevelFromXP(xp) {
  if (xp <= 0) return 1;
  if (xp >= 1000000) return 1000;
  
  if (xp < 500) return Math.floor(Math.sqrt(xp / 50)) + 1;
  if (xp < 5000) return 10 + Math.floor(Math.sqrt((xp - 500) / 100)) + 1;
  if (xp < 20000) return 50 + Math.floor(Math.sqrt((xp - 5000) / 200)) + 1;
  if (xp < 100000) return 100 + Math.floor(Math.sqrt((xp - 20000) / 500)) + 1;
  if (xp < 500000) return 200 + Math.floor(Math.sqrt((xp - 100000) / 1000)) + 1;
  return Math.min(1000, 500 + Math.floor(Math.sqrt((xp - 500000) / 2000)) + 1);
}

// Helper to get array from query result
function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
}

// Main seeding function
async function seedDemoLeaderboard(options = {}) {
  const {
    minUsers = 30,
    maxUsers = 50,
    forceReseed = false,
    seed = 42069 // Deterministic seed for reproducibility
  } = options;
  
  const rng = new SeededRandom(seed);
  const results = {
    created: 0,
    skipped: 0,
    events: 0,
    errors: []
  };
  
  try {
    // Check real user count
    const realUsersResult = await executeQuery(
      'SELECT COUNT(*) as count FROM users WHERE (is_demo = FALSE OR is_demo IS NULL) AND email NOT LIKE ?',
      ['%@aurafx.demo']
    );
    const realUserCount = getRows(realUsersResult)[0]?.count || 0;
    
    // Skip if we have enough real users (unless forcing)
    if (realUserCount >= 20 && !forceReseed) {
      return { 
        ...results, 
        message: `Sufficient real users (${realUserCount}), skipping demo seed` 
      };
    }
    
    // Check existing demo users
    const existingDemoResult = await executeQuery(
      'SELECT COUNT(*) as count FROM users WHERE is_demo = TRUE'
    );
    const existingDemoCount = getRows(existingDemoResult)[0]?.count || 0;
    
    if (existingDemoCount >= minUsers && !forceReseed) {
      return { 
        ...results, 
        message: `Demo users already seeded (${existingDemoCount})` 
      };
    }
    
    // Ensure is_demo column exists (idempotent check via information_schema)
    try {
      const colCheckResult = await executeQuery(
        `SELECT COUNT(*) as col_exists 
         FROM information_schema.columns 
         WHERE table_schema = DATABASE() 
           AND table_name = 'users' 
           AND column_name = 'is_demo'`
      );
      const colExists = getRows(colCheckResult)[0]?.col_exists > 0;
      
      if (!colExists) {
        await executeQuery('ALTER TABLE users ADD COLUMN is_demo BOOLEAN DEFAULT FALSE');
        console.log('Added is_demo column to users table');
      }
    } catch (e) {
      console.log('is_demo column check:', e.code || e.message || 'handled');
    }
    
    // Ensure xp_events table exists (CREATE TABLE IF NOT EXISTS is already idempotent)
    try {
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS xp_events (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          source VARCHAR(50) NOT NULL,
          meta JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at),
          INDEX idx_user_created (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e) {
      // Table exists or other non-fatal error
      if (e.code !== 'ER_TABLE_EXISTS_ERROR') {
        console.log('xp_events table check:', e.code || e.message);
      }
    }
    
    // Clean up old demo data if reseeding
    if (forceReseed) {
      await executeQuery('DELETE FROM xp_events WHERE user_id IN (SELECT id FROM users WHERE is_demo = TRUE)');
      await executeQuery('DELETE FROM users WHERE is_demo = TRUE');
    }
    
    // Generate users
    const usedNames = new Set();
    const profiles = Object.keys(ACTIVITY_PROFILES);
    const numUsers = rng.int(minUsers, maxUsers);
    
    for (let i = 0; i < numUsers; i++) {
      try {
        const username = generateUsername(rng, usedNames);
        const email = `demo_${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@aurafx.demo`;
        const profile = profiles[i % profiles.length]; // Distribute profiles evenly
        
        // Check if user exists
        const existingResult = await executeQuery('SELECT id FROM users WHERE email = ?', [email]);
        const existing = getRows(existingResult);
        
        let userId;
        if (existing.length === 0) {
          // Create new demo user
          const insertResult = await executeQuery(
            `INSERT INTO users (email, username, name, password, role, xp, level, is_demo, created_at) 
             VALUES (?, ?, ?, ?, ?, 0, 1, TRUE, DATE_SUB(NOW(), INTERVAL ? DAY))`,
            [email, username, username, `demo_${Date.now()}_${i}`, 'free', rng.int(30, 90)]
          );
          userId = insertResult.insertId;
          results.created++;
        } else {
          userId = existing[0].id;
          results.skipped++;
        }
        
        if (!userId) continue;
        
        // Generate XP events based on profile
        const events = generateXpEvents(rng, userId, profile, 30);
        
        // Insert events in batches
        for (const event of events) {
          try {
            await executeQuery(
              'INSERT INTO xp_events (user_id, amount, source, created_at) VALUES (?, ?, ?, ?)',
              [event.user_id, event.amount, event.source, event.created_at]
            );
            results.events++;
          } catch (e) {
            // Ignore duplicate events
          }
        }
        
        // Calculate total XP and update user
        const totalXP = events.reduce((sum, e) => sum + e.amount, 0);
        const level = getLevelFromXP(totalXP);
        
        await executeQuery(
          'UPDATE users SET xp = ?, level = ? WHERE id = ?',
          [totalXP, level, userId]
        );
        
      } catch (userError) {
        results.errors.push(`User ${i}: ${userError.message}`);
      }
    }
    
    return {
      ...results,
      message: `Demo leaderboard seeded: ${results.created} users, ${results.events} events`
    };
    
  } catch (error) {
    results.errors.push(error.message);
    return results;
  }
}

// API endpoint handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Only allow POST or authorized GET
  const authHeader = req.headers.authorization;
  const isAuthorized = authHeader === `Bearer ${process.env.CRON_SECRET}` || 
                       req.headers['x-vercel-cron'] === '1';
  
  if (req.method === 'GET' && !isAuthorized) {
    // Public GET just returns status
    try {
      const demoCountResult = await executeQuery(
        'SELECT COUNT(*) as count FROM users WHERE is_demo = TRUE'
      );
      const count = getRows(demoCountResult)[0]?.count || 0;
      
      return res.status(200).json({
        success: true,
        demoUsers: count,
        message: 'Use POST to seed demo data'
      });
    } catch (e) {
      return res.status(200).json({ success: true, demoUsers: 0 });
    }
  }
  
  // Execute seeding
  try {
    const forceReseed = req.body?.force === true || req.query?.force === 'true';
    const result = await seedDemoLeaderboard({ forceReseed });
    
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Export for direct use
module.exports.seedDemoLeaderboard = seedDemoLeaderboard;
module.exports.ACTIVITY_PROFILES = ACTIVITY_PROFILES;
