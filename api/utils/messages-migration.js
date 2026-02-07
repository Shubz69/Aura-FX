/**
 * Messages Table Migration - Real-time consistency
 *
 * Adds:
 * - client_message_id (VARCHAR) for idempotent writes / deduplication
 * - Unique index on (sender_id, client_message_id) for dedupe
 * - Index (channel_id, id) for cursor-based pagination / catch-up
 *
 * Run: node api/utils/messages-migration.js
 * Idempotent - safe to run multiple times.
 */

const { executeQuery, addIndexIfNotExists, addColumnIfNotExists } = require('../db');

async function run() {
  console.log('Messages migration: client_message_id + indexes...');

  // Add client_message_id column (nullable for backward compat)
  await addColumnIfNotExists('messages', 'client_message_id', 'VARCHAR(64) DEFAULT NULL');
  console.log('  client_message_id column ensured');

  // Unique index for dedupe - only when both are non-null
  // MySQL: unique index allows multiple NULLs in client_message_id
  try {
    const [exists] = await executeQuery(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND INDEX_NAME = 'idx_messages_client_dedupe'`
    );
    if (!exists || exists.length === 0) {
      await executeQuery(
        'CREATE UNIQUE INDEX idx_messages_client_dedupe ON messages (sender_id, client_message_id)'
      );
      console.log('  idx_messages_client_dedupe added');
    }
  } catch (e) {
    if (e.code === 'ER_DUP_KEYNAME' || e.message?.includes('Duplicate key')) {
      console.log('  idx_messages_client_dedupe already exists');
    } else {
      console.warn('  idx_messages_client_dedupe:', e.message);
    }
  }

  // Index for cursor pagination: (channel_id, id)
  await addIndexIfNotExists('messages', 'idx_messages_channel_id', ['channel_id', 'id']);
  console.log('  idx_messages_channel_id ensured');

  console.log('Messages migration complete.');
}

run().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
