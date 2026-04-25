-- Community schema migration (run once, outside request lifecycle).
-- Removes the need for runtime DDL in api/community/channels/messages.js.

CREATE TABLE IF NOT EXISTS channel_push_prefs (
  user_id INT NOT NULL,
  channel_id VARCHAR(191) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_push_at DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, channel_id),
  INDEX idx_channel_throttle (channel_id, last_push_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Required messages indexes for community reads:
-- 1) channel_id
-- 2) id (PRIMARY KEY)
-- 3) (channel_id, id) composite for cursor/no-cursor ordering
SET @has_idx_channel := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'messages'
    AND index_name = 'idx_messages_channel_id'
);
SET @sql_idx_channel := IF(
  @has_idx_channel = 0,
  'ALTER TABLE messages ADD INDEX idx_messages_channel_id (channel_id)',
  'SELECT 1'
);
PREPARE stmt1 FROM @sql_idx_channel;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

SET @has_idx_channel_id := (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'messages'
    AND index_name = 'idx_messages_channel_id_id'
);
SET @sql_idx_channel_id := IF(
  @has_idx_channel_id = 0,
  'ALTER TABLE messages ADD INDEX idx_messages_channel_id_id (channel_id, id)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql_idx_channel_id;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
