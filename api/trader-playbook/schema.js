/**
 * Idempotent trader playbook schema migrations.
 */

const { executeQuery } = require('../db');

async function migratePlaybookColumns() {
  const alters = [
    "ALTER TABLE trader_playbook_setups ADD COLUMN description TEXT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN icon VARCHAR(64) DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN color VARCHAR(32) DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN status VARCHAR(24) DEFAULT 'active'",
    "ALTER TABLE trader_playbook_setups ADD COLUMN tags JSON DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN marketConditions JSON DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN entryRules JSON DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN exitRules JSON DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN riskRules JSON DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN guardrails JSON DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN checklistSections JSON DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN overviewBlocks JSON DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN reviewNotesCount INT DEFAULT 0",
    "ALTER TABLE trader_playbook_setups ADD COLUMN lastUsedAt TIMESTAMP NULL DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN archivedAt TIMESTAMP NULL DEFAULT NULL",
    "ALTER TABLE trader_playbook_setups ADD COLUMN setupType VARCHAR(64) DEFAULT NULL",
  ];
  for (const sql of alters) {
    try {
      await executeQuery(sql);
    } catch (_) {
      /* column exists */
    }
  }
}

async function touchReviewNotesCount(userId, playbookId, delta) {
  const d = Number(delta) || 0;
  if (!playbookId) return;
  await executeQuery(
    `UPDATE trader_playbook_setups SET reviewNotesCount = GREATEST(0, COALESCE(reviewNotesCount,0) + ?) WHERE id = ? AND userId = ?`,
    [d, playbookId, userId]
  );
}

async function ensureMTradesTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_playbook_m_trades (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      playbookId CHAR(36) DEFAULT NULL,
      asset VARCHAR(64) DEFAULT NULL,
      timeframe VARCHAR(32) DEFAULT NULL,
      session VARCHAR(64) DEFAULT NULL,
      direction VARCHAR(16) DEFAULT NULL,
      occurredAt DATETIME DEFAULT NULL,
      setupSummary TEXT DEFAULT NULL,
      qualificationReason TEXT DEFAULT NULL,
      missType VARCHAR(48) DEFAULT NULL,
      missReason TEXT DEFAULT NULL,
      whatShouldHaveHappened TEXT DEFAULT NULL,
      lessonLearned TEXT DEFAULT NULL,
      severity TINYINT DEFAULT NULL,
      screenshotUrl VARCHAR(2048) DEFAULT NULL,
      reviewLink VARCHAR(2048) DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_mtrade_user (userId),
      INDEX idx_mtrade_playbook (userId, playbookId),
      INDEX idx_mtrade_occurred (userId, occurredAt)
    )
  `);
}

async function ensureReviewNotesTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS trader_playbook_review_notes (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      playbookId CHAR(36) NOT NULL,
      noteType VARCHAR(32) NOT NULL,
      periodLabel VARCHAR(80) DEFAULT NULL,
      title VARCHAR(200) DEFAULT NULL,
      body TEXT DEFAULT NULL,
      confidenceRating TINYINT DEFAULT NULL,
      versionNote VARCHAR(500) DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_pb_review_user_pb (userId, playbookId),
      INDEX idx_pb_review_created (userId, createdAt)
    )
  `);
}

async function touchPlaybookLastUsed(userId, playbookId) {
  if (!playbookId) return;
  await executeQuery(
    `UPDATE trader_playbook_setups SET lastUsedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ?`,
    [playbookId, userId]
  );
}

module.exports = {
  migratePlaybookColumns,
  ensureMTradesTable,
  ensureReviewNotesTable,
  touchReviewNotesCount,
  touchPlaybookLastUsed,
};
