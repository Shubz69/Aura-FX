const { executeQuery } = require('../db');

async function ensureBacktestTables() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS backtest_sessions (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      sessionName VARCHAR(255) NOT NULL,
      description TEXT,
      status VARCHAR(24) NOT NULL DEFAULT 'draft',
      marketType VARCHAR(40) DEFAULT NULL,
      instrumentsJson JSON DEFAULT NULL,
      playbookId CHAR(36) DEFAULT NULL,
      playbookName VARCHAR(160) DEFAULT NULL,
      initialBalance DECIMAL(18,4) NOT NULL DEFAULT 100000,
      currentBalance DECIMAL(18,4) NOT NULL DEFAULT 100000,
      riskModel VARCHAR(32) DEFAULT 'fixed_percent',
      dateStart DATE DEFAULT NULL,
      dateEnd DATE DEFAULT NULL,
      replayTimeframe VARCHAR(32) DEFAULT 'M15',
      replayGranularity VARCHAR(32) DEFAULT 'candle',
      tradingHoursMode VARCHAR(32) DEFAULT 'all',
      objective VARCHAR(64) DEFAULT NULL,
      objectiveDetail TEXT,
      strategyContextJson JSON DEFAULT NULL,
      draftFormJson JSON DEFAULT NULL,
      chartPrefsJson JSON DEFAULT NULL,
      notes TEXT,
      totalTrades INT NOT NULL DEFAULT 0,
      totalWins INT NOT NULL DEFAULT 0,
      totalLosses INT NOT NULL DEFAULT 0,
      totalBreakeven INT NOT NULL DEFAULT 0,
      grossProfit DECIMAL(20,6) NOT NULL DEFAULT 0,
      grossLoss DECIMAL(20,6) NOT NULL DEFAULT 0,
      netPnl DECIMAL(20,6) NOT NULL DEFAULT 0,
      winRate DECIMAL(16,8) DEFAULT NULL,
      profitFactor DECIMAL(20,8) DEFAULT NULL,
      expectancy DECIMAL(20,8) DEFAULT NULL,
      avgR DECIMAL(20,8) DEFAULT NULL,
      maxDrawdown DECIMAL(20,6) DEFAULT NULL,
      timeSpentSeconds INT NOT NULL DEFAULT 0,
      startedAt TIMESTAMP NULL DEFAULT NULL,
      completedAt TIMESTAMP NULL DEFAULT NULL,
      lastReplayAt DATETIME DEFAULT NULL,
      lastActiveInstrument VARCHAR(64) DEFAULT NULL,
      replaySpeed DECIMAL(10,4) NOT NULL DEFAULT 1,
      completionRecapJson JSON DEFAULT NULL,
      ephemeralExpiresAt DATETIME DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bt_sess_user (userId),
      INDEX idx_bt_sess_status (userId, status),
      INDEX idx_bt_sess_updated (userId, updatedAt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS backtest_trades (
      id CHAR(36) PRIMARY KEY,
      sessionId CHAR(36) NOT NULL,
      userId INT NOT NULL,
      instrument VARCHAR(64) NOT NULL,
      marketType VARCHAR(40) DEFAULT NULL,
      direction VARCHAR(12) NOT NULL,
      entryPrice DECIMAL(24,8) NOT NULL,
      stopLoss DECIMAL(24,8) DEFAULT NULL,
      takeProfit DECIMAL(24,8) DEFAULT NULL,
      exitPrice DECIMAL(24,8) DEFAULT NULL,
      positionSize DECIMAL(24,8) DEFAULT NULL,
      riskPercent DECIMAL(14,8) DEFAULT NULL,
      initialRiskAmount DECIMAL(20,6) DEFAULT NULL,
      pnlAmount DECIMAL(20,6) NOT NULL DEFAULT 0,
      pnlPercent DECIMAL(20,10) DEFAULT NULL,
      rMultiple DECIMAL(20,10) DEFAULT NULL,
      pipsOrPoints DECIMAL(20,6) DEFAULT NULL,
      openTime DATETIME DEFAULT NULL,
      closeTime DATETIME DEFAULT NULL,
      durationSeconds INT DEFAULT NULL,
      timeframe VARCHAR(32) DEFAULT NULL,
      sessionLabel VARCHAR(64) DEFAULT NULL,
      playbookId CHAR(36) DEFAULT NULL,
      playbookName VARCHAR(160) DEFAULT NULL,
      setupName VARCHAR(160) DEFAULT NULL,
      entryModel VARCHAR(160) DEFAULT NULL,
      confidenceScore TINYINT DEFAULT NULL,
      bias VARCHAR(120) DEFAULT NULL,
      marketCondition VARCHAR(120) DEFAULT NULL,
      checklistScore DECIMAL(10,4) DEFAULT NULL,
      ruleAdherenceScore DECIMAL(10,4) DEFAULT NULL,
      qualityGrade VARCHAR(8) DEFAULT NULL,
      emotionalState VARCHAR(48) DEFAULT NULL,
      resultType VARCHAR(16) NOT NULL DEFAULT 'breakeven',
      notes TEXT,
      mistakesJson JSON DEFAULT NULL,
      tagsJson JSON DEFAULT NULL,
      partialsJson JSON DEFAULT NULL,
      checklistItemsJson JSON DEFAULT NULL,
      extraContextJson JSON DEFAULT NULL,
      screenshotUrl VARCHAR(512) DEFAULT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bt_tr_user (userId),
      INDEX idx_bt_tr_session (sessionId),
      INDEX idx_bt_tr_close (userId, closeTime)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS backtest_session_notes (
      id CHAR(36) PRIMARY KEY,
      sessionId CHAR(36) NOT NULL,
      userId INT NOT NULL,
      content LONGTEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_bt_notes_session (sessionId),
      INDEX idx_bt_notes_user (userId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS backtest_saved_trades (
      id CHAR(36) PRIMARY KEY,
      userId INT NOT NULL,
      sessionId CHAR(36) DEFAULT NULL,
      sourceTradeId CHAR(36) DEFAULT NULL,
      instrument VARCHAR(64) NOT NULL,
      direction VARCHAR(12) NOT NULL,
      entryTime DATETIME DEFAULT NULL,
      entryPrice DECIMAL(24,8) NOT NULL,
      exitTime DATETIME DEFAULT NULL,
      exitPrice DECIMAL(24,8) DEFAULT NULL,
      lotSize DECIMAL(24,8) DEFAULT NULL,
      pnlAmount DECIMAL(20,6) NOT NULL DEFAULT 0,
      result VARCHAR(16) NOT NULL DEFAULT 'breakeven',
      timeframe VARCHAR(32) DEFAULT NULL,
      replayReferenceJson JSON DEFAULT NULL,
      screenshotUrl VARCHAR(512) DEFAULT NULL,
      notes TEXT,
      aiFeedback TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_bt_saved_user (userId, createdAt),
      INDEX idx_bt_saved_session (sessionId),
      INDEX idx_bt_saved_trade (sourceTradeId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const alters = [
    'ALTER TABLE backtest_sessions ADD COLUMN ephemeralExpiresAt DATETIME NULL DEFAULT NULL',
    'ALTER TABLE backtest_sessions ADD COLUMN completionRecapJson JSON DEFAULT NULL',
    'ALTER TABLE backtest_trades ADD COLUMN screenshotUrl VARCHAR(512) DEFAULT NULL',
    'ALTER TABLE backtest_saved_trades ADD COLUMN replayReferenceJson JSON DEFAULT NULL',
    'ALTER TABLE backtest_saved_trades ADD COLUMN screenshotUrl VARCHAR(512) DEFAULT NULL',
    'ALTER TABLE backtest_saved_trades ADD COLUMN notes TEXT',
    'ALTER TABLE backtest_saved_trades ADD COLUMN aiFeedback TEXT',
  ];
  for (const sql of alters) {
    try {
      await executeQuery(sql);
    } catch (_) {
      /* exists */
    }
  }
}

module.exports = { ensureBacktestTables };
