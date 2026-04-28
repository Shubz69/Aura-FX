const { executeQuery } = require('../db');

async function ensureOriginalLanguageOnMessages() {
  try {
    await executeQuery(
      `ALTER TABLE messages ADD COLUMN original_language VARCHAR(12) NULL DEFAULT NULL AFTER content`
    );
  } catch (e) {
    const msg = e.message || String(e);
    if (!/duplicate column name/i.test(msg)) {
      console.warn('messages.original_language:', msg);
    }
  }
}

async function ensureMessageTranslationsTable() {
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS message_translations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        target_language VARCHAR(12) NOT NULL,
        source_language VARCHAR(12) NOT NULL,
        translated_text MEDIUMTEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_message_target (message_id, target_language),
        INDEX idx_message_id (message_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e) {
    console.warn('message_translations table:', e.message || e);
  }
}

async function ensureCommunityAutoTranslateColumn() {
  try {
    await executeQuery(
      `ALTER TABLE user_settings ADD COLUMN community_auto_translate TINYINT(1) NOT NULL DEFAULT 1`
    );
  } catch (e) {
    const msg = e.message || String(e);
    if (!/duplicate column name/i.test(msg)) {
      console.warn('user_settings.community_auto_translate:', msg);
    }
  }
}

module.exports = {
  ensureOriginalLanguageOnMessages,
  ensureMessageTranslationsTable,
  ensureCommunityAutoTranslateColumn,
};
