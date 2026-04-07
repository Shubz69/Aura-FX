/**
 * Idempotent schema for monthly_reports: two phases per calendar month (opener + close).
 */
async function ensureReportSchema(executeQuery) {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS monthly_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      period_year INT NOT NULL,
      period_month INT NOT NULL,
      report_type VARCHAR(20) NOT NULL COMMENT 'free|premium|elite|admin',
      status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending|generating|ready|failed',
      content_json LONGTEXT,
      generated_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_status (status)
    )
  `).catch(() => {});

  try {
    await executeQuery(
      `ALTER TABLE monthly_reports ADD COLUMN report_phase VARCHAR(24) NOT NULL DEFAULT 'month_close'`
    );
  } catch (e) {
    if (!/Duplicate column name/i.test(String(e.message))) throw e;
  }

  await executeQuery(
    `UPDATE monthly_reports SET report_phase = 'month_close' WHERE report_phase IS NULL OR report_phase = ''`
  ).catch(() => {});

  try {
    await executeQuery(`ALTER TABLE monthly_reports DROP INDEX uq_user_period`);
  } catch (e) {
    if (!/check that column/i.test(String(e.message)) && !/Can't DROP/i.test(String(e.message))) {
      /* ignore missing index */
    }
  }

  try {
    await executeQuery(
      `ALTER TABLE monthly_reports ADD UNIQUE KEY uq_user_period_phase (user_id, period_year, period_month, report_phase)`
    );
  } catch (e) {
    if (!/Duplicate key name/i.test(String(e.message))) throw e;
  }
}

module.exports = { ensureReportSchema };
