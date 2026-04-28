-- Community message runtime translation (optional; APIs also attempt idempotent ALTER/CREATE).
ALTER TABLE messages ADD COLUMN original_language VARCHAR(12) NULL DEFAULT NULL AFTER content;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_settings ADD COLUMN community_auto_translate TINYINT(1) NOT NULL DEFAULT 1;
