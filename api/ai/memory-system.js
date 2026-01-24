/**
 * AURA Persistent Memory System
 * 
 * Features:
 * - User preferences (instruments, risk rules, strategy style)
 * - Conversation summaries
 * - Daily/weekly market narrative memory
 * - Feedback capture (thumbs up/down + reason tags)
 * - Learning from feedback to improve responses
 */

const { executeQuery } = require('../db');
const { getCached, setCached } = require('../cache');

// Schema tracking
let schemaCreated = false;

// In-memory fallback for when DB is unavailable
const memoryFallback = {
  preferences: new Map(),
  narratives: new Map(),
  feedback: [],
  summaries: new Map()
};

// ============================================================================
// SCHEMA MANAGEMENT
// ============================================================================

async function ensureSchema() {
  if (schemaCreated) return;
  
  try {
    // User preferences table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS aura_user_preferences (
        user_id INT PRIMARY KEY,
        preferred_instruments JSON,
        risk_percent DECIMAL(4,2) DEFAULT 1.00,
        account_size DECIMAL(15,2),
        account_currency VARCHAR(3) DEFAULT 'USD',
        strategy_style ENUM('scalp', 'day', 'swing', 'position') DEFAULT 'swing',
        preferred_timeframes JSON,
        timezone VARCHAR(50),
        notifications_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Conversation summaries table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS aura_conversation_summaries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        session_id VARCHAR(36) NOT NULL,
        summary TEXT NOT NULL,
        key_topics JSON,
        instruments_discussed JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_session (session_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Market narrative memory table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS aura_market_narratives (
        id INT AUTO_INCREMENT PRIMARY KEY,
        instrument VARCHAR(20) NOT NULL,
        date DATE NOT NULL,
        period ENUM('daily', 'weekly') DEFAULT 'daily',
        narrative TEXT NOT NULL,
        key_drivers JSON,
        price_action JSON,
        sentiment ENUM('bullish', 'bearish', 'neutral', 'mixed'),
        confidence DECIMAL(3,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_narrative (instrument, date, period),
        INDEX idx_instrument (instrument),
        INDEX idx_date (date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Feedback table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS aura_feedback (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        request_id VARCHAR(50),
        query TEXT NOT NULL,
        response_summary TEXT,
        rating TINYINT NOT NULL CHECK (rating IN (-1, 1)),
        reason_tags JSON,
        comment TEXT,
        instrument VARCHAR(20),
        intent_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_rating (rating),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Feedback rules (learned patterns)
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS aura_feedback_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        rule_type ENUM('boost', 'penalize', 'require', 'avoid'),
        pattern VARCHAR(255) NOT NULL,
        context VARCHAR(100),
        weight DECIMAL(3,2) DEFAULT 1.00,
        source_feedback_count INT DEFAULT 1,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_type (rule_type),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    schemaCreated = true;
    console.log('AURA Memory schema ready');
  } catch (e) {
    console.log('Memory schema check:', e.code || e.message);
    schemaCreated = true;
  }
}

// ============================================================================
// USER PREFERENCES
// ============================================================================

async function getUserPreferences(userId) {
  await ensureSchema();
  
  // Try cache first
  const cached = getCached(`aura:prefs:${userId}`, 3600000); // 1 hour
  if (cached) return cached;
  
  try {
    const [rows] = await executeQuery(
      'SELECT * FROM aura_user_preferences WHERE user_id = ?',
      [userId]
    );
    
    if (rows && rows.length > 0) {
      const prefs = rows[0];
      // Parse JSON fields
      prefs.preferred_instruments = JSON.parse(prefs.preferred_instruments || '[]');
      prefs.preferred_timeframes = JSON.parse(prefs.preferred_timeframes || '["H1","H4"]');
      
      setCached(`aura:prefs:${userId}`, prefs);
      return prefs;
    }
  } catch (e) {
    console.error('Error getting preferences:', e);
  }
  
  // Return defaults
  return {
    user_id: userId,
    preferred_instruments: ['XAUUSD', 'EURUSD'],
    risk_percent: 1.0,
    account_size: null,
    account_currency: 'USD',
    strategy_style: 'swing',
    preferred_timeframes: ['H1', 'H4'],
    timezone: 'UTC',
    notifications_enabled: true
  };
}

async function updateUserPreferences(userId, updates) {
  await ensureSchema();
  
  const fields = [];
  const values = [];
  
  const allowedFields = [
    'preferred_instruments', 'risk_percent', 'account_size', 'account_currency',
    'strategy_style', 'preferred_timeframes', 'timezone', 'notifications_enabled'
  ];
  
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }
  }
  
  if (fields.length === 0) return false;
  
  values.push(userId);
  
  try {
    // Upsert
    const insertFields = ['user_id', ...Object.keys(updates).filter(k => allowedFields.includes(k))];
    const insertValues = [userId, ...values.slice(0, -1)];
    const updateClause = fields.join(', ');
    
    await executeQuery(`
      INSERT INTO aura_user_preferences (user_id, ${insertFields.slice(1).join(', ')})
      VALUES (${insertValues.map(() => '?').join(', ')})
      ON DUPLICATE KEY UPDATE ${updateClause}
    `, [...insertValues, ...values.slice(0, -1)]);
    
    // Invalidate cache
    setCached(`aura:prefs:${userId}`, null);
    
    return true;
  } catch (e) {
    console.error('Error updating preferences:', e);
    return false;
  }
}

// ============================================================================
// CONVERSATION SUMMARIES
// ============================================================================

async function storeConversationSummary(userId, sessionId, summary, topics = [], instruments = []) {
  await ensureSchema();
  
  try {
    await executeQuery(`
      INSERT INTO aura_conversation_summaries (user_id, session_id, summary, key_topics, instruments_discussed)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, sessionId, summary, JSON.stringify(topics), JSON.stringify(instruments)]);
    
    return true;
  } catch (e) {
    console.error('Error storing conversation summary:', e);
    return false;
  }
}

async function getRecentSummaries(userId, limit = 5) {
  await ensureSchema();
  
  try {
    const [rows] = await executeQuery(`
      SELECT * FROM aura_conversation_summaries
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [userId, limit]);
    
    return rows || [];
  } catch (e) {
    console.error('Error getting summaries:', e);
    return [];
  }
}

// ============================================================================
// MARKET NARRATIVE MEMORY
// ============================================================================

async function storeMarketNarrative(instrument, narrative, drivers, priceAction, sentiment, confidence = 0.7, period = 'daily') {
  await ensureSchema();
  
  const today = new Date().toISOString().slice(0, 10);
  
  try {
    await executeQuery(`
      INSERT INTO aura_market_narratives (instrument, date, period, narrative, key_drivers, price_action, sentiment, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        narrative = VALUES(narrative),
        key_drivers = VALUES(key_drivers),
        price_action = VALUES(price_action),
        sentiment = VALUES(sentiment),
        confidence = VALUES(confidence)
    `, [
      instrument, today, period, narrative,
      JSON.stringify(drivers), JSON.stringify(priceAction),
      sentiment, confidence
    ]);
    
    return true;
  } catch (e) {
    console.error('Error storing narrative:', e);
    return false;
  }
}

async function getMarketNarrative(instrument, daysBack = 1, period = 'daily') {
  await ensureSchema();
  
  const cacheKey = `aura:narrative:${instrument}:${period}:${daysBack}`;
  const cached = getCached(cacheKey, 300000); // 5 min
  if (cached) return cached;
  
  try {
    const [rows] = await executeQuery(`
      SELECT * FROM aura_market_narratives
      WHERE instrument = ? AND period = ? AND date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      ORDER BY date DESC
    `, [instrument, period, daysBack]);
    
    if (rows && rows.length > 0) {
      const narratives = rows.map(r => ({
        ...r,
        key_drivers: JSON.parse(r.key_drivers || '[]'),
        price_action: JSON.parse(r.price_action || '{}')
      }));
      
      setCached(cacheKey, narratives);
      return narratives;
    }
  } catch (e) {
    console.error('Error getting narrative:', e);
  }
  
  return [];
}

// ============================================================================
// FEEDBACK SYSTEM
// ============================================================================

const FEEDBACK_REASONS = {
  positive: [
    'accurate_analysis',
    'helpful_levels',
    'good_explanation',
    'correct_catalyst',
    'useful_sizing',
    'clear_format'
  ],
  negative: [
    'wrong_direction',
    'missed_catalyst',
    'outdated_info',
    'too_vague',
    'incorrect_levels',
    'bad_timing',
    'no_actionable_info'
  ]
};

async function storeFeedback(data) {
  await ensureSchema();
  
  const {
    userId,
    requestId,
    query,
    responseSummary,
    rating, // 1 or -1
    reasonTags = [],
    comment = null,
    instrument = null,
    intentType = null
  } = data;
  
  try {
    await executeQuery(`
      INSERT INTO aura_feedback (user_id, request_id, query, response_summary, rating, reason_tags, comment, instrument, intent_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, requestId, query, responseSummary, rating,
      JSON.stringify(reasonTags), comment, instrument, intentType
    ]);
    
    // If negative feedback, try to learn from it
    if (rating === -1 && reasonTags.length > 0) {
      await learnFromFeedback(reasonTags, query, intentType);
    }
    
    return true;
  } catch (e) {
    console.error('Error storing feedback:', e);
    return false;
  }
}

async function learnFromFeedback(reasonTags, query, intentType) {
  // Analyze negative feedback patterns and create rules
  for (const tag of reasonTags) {
    try {
      // Check if rule already exists
      const [existing] = await executeQuery(
        'SELECT id, source_feedback_count FROM aura_feedback_rules WHERE pattern = ? AND context = ?',
        [tag, intentType]
      );
      
      if (existing && existing.length > 0) {
        // Increment count
        await executeQuery(
          'UPDATE aura_feedback_rules SET source_feedback_count = source_feedback_count + 1, weight = LEAST(weight + 0.1, 2.0) WHERE id = ?',
          [existing[0].id]
        );
      } else {
        // Create new rule
        let ruleType = 'avoid';
        if (tag.includes('missed')) ruleType = 'require';
        else if (tag.includes('incorrect') || tag.includes('wrong')) ruleType = 'penalize';
        
        await executeQuery(
          'INSERT INTO aura_feedback_rules (rule_type, pattern, context) VALUES (?, ?, ?)',
          [ruleType, tag, intentType]
        );
      }
    } catch (e) {
      console.error('Error learning from feedback:', e);
    }
  }
}

async function getFeedbackRules(intentType = null) {
  await ensureSchema();
  
  try {
    let query = 'SELECT * FROM aura_feedback_rules WHERE active = TRUE';
    const params = [];
    
    if (intentType) {
      query += ' AND (context = ? OR context IS NULL)';
      params.push(intentType);
    }
    
    query += ' ORDER BY weight DESC';
    
    const [rows] = await executeQuery(query, params);
    return rows || [];
  } catch (e) {
    console.error('Error getting feedback rules:', e);
    return [];
  }
}

async function getFeedbackStats(userId = null, days = 30) {
  await ensureSchema();
  
  try {
    let query = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as positive,
        SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) as negative,
        AVG(rating) as avg_rating
      FROM aura_feedback
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    `;
    const params = [days];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    const [rows] = await executeQuery(query, params);
    
    if (rows && rows.length > 0) {
      const stats = rows[0];
      return {
        total: parseInt(stats.total) || 0,
        positive: parseInt(stats.positive) || 0,
        negative: parseInt(stats.negative) || 0,
        satisfactionRate: stats.total > 0 
          ? Math.round((stats.positive / stats.total) * 100) 
          : 0
      };
    }
  } catch (e) {
    console.error('Error getting feedback stats:', e);
  }
  
  return { total: 0, positive: 0, negative: 0, satisfactionRate: 0 };
}

// ============================================================================
// MEMORY CONTEXT BUILDER
// ============================================================================

async function buildMemoryContext(userId, instrument = null) {
  const context = {
    userPreferences: null,
    recentSummaries: [],
    marketNarratives: [],
    feedbackRules: []
  };
  
  try {
    // Get user preferences
    context.userPreferences = await getUserPreferences(userId);
    
    // Get recent conversation summaries
    context.recentSummaries = await getRecentSummaries(userId, 3);
    
    // Get market narratives for relevant instruments
    if (instrument) {
      context.marketNarratives = await getMarketNarrative(instrument, 3);
    } else if (context.userPreferences?.preferred_instruments?.length > 0) {
      const primaryInstrument = context.userPreferences.preferred_instruments[0];
      context.marketNarratives = await getMarketNarrative(primaryInstrument, 3);
    }
    
    // Get applicable feedback rules
    context.feedbackRules = await getFeedbackRules();
    
  } catch (e) {
    console.error('Error building memory context:', e);
  }
  
  return context;
}

// Export all functions
module.exports = {
  // User Preferences
  getUserPreferences,
  updateUserPreferences,
  
  // Conversation Summaries
  storeConversationSummary,
  getRecentSummaries,
  
  // Market Narratives
  storeMarketNarrative,
  getMarketNarrative,
  
  // Feedback
  FEEDBACK_REASONS,
  storeFeedback,
  getFeedbackRules,
  getFeedbackStats,
  
  // Context Builder
  buildMemoryContext,
  
  // Schema
  ensureSchema
};
