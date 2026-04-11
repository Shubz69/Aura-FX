const { executeQuery, addColumnIfNotExists, addIndexIfNotExists } = require('../db');

let ensuredBase = false;

async function migrateEventColumns() {
  const cols = [
    ['trust_score', 'TINYINT UNSIGNED NOT NULL DEFAULT 50'],
    ['novelty_score', 'TINYINT UNSIGNED NOT NULL DEFAULT 50'],
    ['severity_score', 'TINYINT UNSIGNED NOT NULL DEFAULT 50'],
    ['market_impact_score', 'TINYINT UNSIGNED NOT NULL DEFAULT 50'],
    ['freshness_score', 'TINYINT UNSIGNED NOT NULL DEFAULT 50'],
    ['rank_score', 'TINYINT UNSIGNED NOT NULL DEFAULT 50'],
    ['story_id', 'CHAR(36) NULL'],
    ['corroboration_count', 'INT NOT NULL DEFAULT 0'],
    ['risk_bias', "VARCHAR(16) NOT NULL DEFAULT 'neutral'"],
    ['why_matters', 'TEXT NULL'],
    ['normalized_topic', 'VARCHAR(256) NULL'],
    ['story_signature', 'CHAR(64) NULL'],
  ];
  for (const [c, def] of cols) {
    await addColumnIfNotExists('surveillance_events', c, def).catch(() => {});
  }
  await addIndexIfNotExists('surveillance_events', 'idx_sv_rank_updated', 'rank_score DESC, updated_at DESC').catch(
    () => {}
  );
  await addIndexIfNotExists('surveillance_events', 'idx_sv_story', 'story_id').catch(() => {});
  await addIndexIfNotExists('surveillance_events', 'idx_sv_story_sig', 'story_signature').catch(() => {});
}

async function migrateStoriesColumns() {
  await addColumnIfNotExists('surveillance_stories', 'signature', 'CHAR(64) NULL').catch(() => {});
  await addIndexIfNotExists('surveillance_stories', 'idx_sv_stories_sig', 'signature').catch(() => {});
}

async function ensureAdapterStateTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS surveillance_adapter_state (
      adapter_id VARCHAR(64) PRIMARY KEY,
      tier VARCHAR(16) NOT NULL DEFAULT 'standard',
      interval_seconds INT NOT NULL DEFAULT 900,
      last_run_started_at DATETIME NULL,
      last_success_at DATETIME NULL,
      last_error_at DATETIME NULL,
      last_error_code VARCHAR(64) NULL,
      consecutive_failures INT NOT NULL DEFAULT 0,
      next_run_at DATETIME NULL,
      last_items_in INT NOT NULL DEFAULT 0,
      last_items_out INT NOT NULL DEFAULT 0,
      last_duration_ms INT NULL,
      meta JSON NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});
}

async function ensureStoriesTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS surveillance_stories (
      id CHAR(36) PRIMARY KEY,
      headline VARCHAR(512) NOT NULL,
      summary TEXT NULL,
      event_count INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).catch(() => {});
}

async function ensureSurveillanceSchema() {
  if (!ensuredBase) {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS surveillance_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        source VARCHAR(120) NOT NULL,
        source_type VARCHAR(64) NOT NULL DEFAULT 'official_html',
        title VARCHAR(512) NOT NULL,
        summary TEXT,
        body_snippet TEXT,
        url VARCHAR(2048) NOT NULL,
        published_at DATETIME NULL,
        detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        event_type VARCHAR(64) NOT NULL DEFAULT 'macro',
        severity TINYINT NOT NULL DEFAULT 2,
        confidence DECIMAL(5,2) NOT NULL DEFAULT 0.50,
        countries JSON,
        lat DECIMAL(10,6) NULL,
        lng DECIMAL(10,6) NULL,
        region VARCHAR(128) NULL,
        tags JSON,
        affected_assets JSON,
        impacted_markets JSON,
        sentiment VARCHAR(32) NULL,
        verification_state VARCHAR(32) NOT NULL DEFAULT 'unverified',
        image_url VARCHAR(2048) NULL,
        dedupe_keys JSON,
        source_meta JSON,
        content_hash CHAR(64) NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_surveillance_content_hash (content_hash),
        KEY idx_published (published_at DESC),
        KEY idx_updated (updated_at DESC),
        KEY idx_type_sev (event_type, severity),
        KEY idx_source (source(64))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS surveillance_ingest_runs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        adapter_id VARCHAR(64) NOT NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME NULL,
        items_in INT NOT NULL DEFAULT 0,
        items_out INT NOT NULL DEFAULT 0,
        error_code VARCHAR(64) NULL,
        duration_ms INT NULL,
        meta JSON NULL,
        KEY idx_adapter_started (adapter_id, started_at DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `).catch(() => {});
    ensuredBase = true;
  }

  await migrateEventColumns();
  await ensureAdapterStateTable();
  await ensureStoriesTable();
  await migrateStoriesColumns();
}

module.exports = { ensureSurveillanceSchema };
