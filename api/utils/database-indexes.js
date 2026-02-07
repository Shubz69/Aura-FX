/**
 * Database Indexes for Performance
 * 
 * This script ensures all necessary indexes exist for optimal query performance
 * across the platform. Run during deployment or as a migration.
 * 
 * All operations are idempotent - safe to run multiple times.
 */

const { executeQuery, addIndexIfNotExists, addColumnIfNotExists, columnExists } = require('../db');

// Index definitions for each table
const INDEXES = {
  // Users table
  users: [
    { name: 'idx_users_email', columns: 'email' },
    { name: 'idx_users_username', columns: 'username' },
    { name: 'idx_users_role', columns: 'role' },
    { name: 'idx_users_last_seen', columns: 'last_seen' },
    { name: 'idx_users_level_xp', columns: ['level', 'xp'] },
    { name: 'idx_users_subscription_status', columns: 'subscription_status' },
    { name: 'idx_users_subscription_plan', columns: 'subscription_plan' }
  ],
  
  // XP Events table (leaderboard performance)
  xp_events: [
    { name: 'idx_xp_user_created', columns: ['user_id', 'created_at'] },
    { name: 'idx_xp_created_at', columns: 'created_at' },
    { name: 'idx_xp_source', columns: 'source' }
  ],
  
  // Messages table (community performance)
  messages: [
    { name: 'idx_messages_channel_created', columns: ['channel_id', 'created_at'] },
    { name: 'idx_messages_sender', columns: 'sender_id' },
    { name: 'idx_messages_created_at', columns: 'created_at' }
  ],
  
  // Notifications table
  notifications: [
    { name: 'idx_notif_user_status_created', columns: ['user_id', 'status', 'created_at'] },
    { name: 'idx_notif_user_created', columns: ['user_id', 'created_at'] },
    { name: 'idx_notif_friend_request', columns: 'friend_request_id' }
  ],
  
  // Friend requests table
  friend_requests: [
    { name: 'idx_freq_requester', columns: 'requester_id' },
    { name: 'idx_freq_receiver', columns: 'receiver_id' },
    { name: 'idx_freq_status', columns: 'status' },
    { name: 'idx_freq_receiver_status', columns: ['receiver_id', 'status'] }
  ],
  
  // Friendships table
  friendships: [
    { name: 'idx_friendships_friend', columns: 'friend_id' }
  ],
  
  // Channels table
  channels: [
    { name: 'idx_channels_slug', columns: 'slug' },
    { name: 'idx_channels_type', columns: 'type' }
  ],
  
  // AURA AI tables
  aura_user_preferences: [
    { name: 'idx_aura_pref_user', columns: 'user_id' }
  ],
  
  aura_conversation_summaries: [
    { name: 'idx_aura_conv_user_created', columns: ['user_id', 'created_at'] }
  ],
  
  aura_market_narratives: [
    { name: 'idx_aura_narr_instrument', columns: 'instrument' },
    { name: 'idx_aura_narr_period', columns: 'period' }
  ],
  
  aura_feedback: [
    { name: 'idx_aura_fb_user', columns: 'user_id' },
    { name: 'idx_aura_fb_rating', columns: 'rating' }
  ]
};

/**
 * Check if a table exists
 */
async function tableExists(tableName) {
  try {
    const [rows] = await executeQuery(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      [tableName]
    );
    return rows && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Apply all indexes for a table
 */
async function applyTableIndexes(tableName) {
  const indexes = INDEXES[tableName];
  if (!indexes) return { added: 0, skipped: 0 };
  
  // First check if table exists
  const exists = await tableExists(tableName);
  if (!exists) {
    console.log(`Table ${tableName} does not exist, skipping indexes`);
    return { added: 0, skipped: indexes.length, tableNotFound: true };
  }
  
  let added = 0;
  let skipped = 0;
  
  for (const index of indexes) {
    try {
      const result = await addIndexIfNotExists(tableName, index.name, index.columns);
      if (result) {
        added++;
      } else {
        skipped++;
      }
    } catch (e) {
      console.error(`Error adding index ${index.name}:`, e.message);
      skipped++;
    }
  }
  
  return { added, skipped };
}

/**
 * Apply all indexes across all tables
 */
async function applyAllIndexes() {
  console.log('Starting database index application...');
  const results = {};
  let totalAdded = 0;
  let totalSkipped = 0;
  
  for (const tableName of Object.keys(INDEXES)) {
    console.log(`Processing ${tableName}...`);
    const result = await applyTableIndexes(tableName);
    results[tableName] = result;
    totalAdded += result.added;
    totalSkipped += result.skipped;
  }
  
  console.log(`\nIndex application complete:`);
  console.log(`  Added: ${totalAdded}`);
  console.log(`  Skipped/Existing: ${totalSkipped}`);
  
  return { results, totalAdded, totalSkipped };
}

/**
 * Run ANALYZE on key tables to update statistics
 */
async function analyzeKeyTables() {
  const tables = ['users', 'messages', 'xp_events', 'notifications', 'friendships'];
  
  for (const table of tables) {
    try {
      const exists = await tableExists(table);
      if (exists) {
        await executeQuery(`ANALYZE TABLE ${table}`);
        console.log(`Analyzed table: ${table}`);
      }
    } catch (e) {
      console.log(`Could not analyze ${table}:`, e.message);
    }
  }
}

/**
 * Get index statistics for monitoring
 */
async function getIndexStats() {
  try {
    const [rows] = await executeQuery(`
      SELECT 
        TABLE_NAME as tableName,
        INDEX_NAME as indexName,
        SEQ_IN_INDEX as seqInIndex,
        COLUMN_NAME as columnName,
        CARDINALITY as cardinality
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `);
    
    return rows || [];
  } catch (e) {
    console.error('Error getting index stats:', e.message);
    return [];
  }
}

module.exports = {
  INDEXES,
  tableExists,
  applyTableIndexes,
  applyAllIndexes,
  analyzeKeyTables,
  getIndexStats
};

// Run if called directly
if (require.main === module) {
  applyAllIndexes()
    .then(() => analyzeKeyTables())
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch(e => {
      console.error('Error:', e);
      process.exit(1);
    });
}
