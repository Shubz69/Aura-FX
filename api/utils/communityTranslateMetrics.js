const { executeQuery } = require('../db');

const TABLE = 'community_translation_metrics_daily';

function dayFromDate(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

async function ensureCommunityTranslationMetricsTable() {
  await executeQuery(
    `CREATE TABLE IF NOT EXISTS ${TABLE} (
      usage_day DATE NOT NULL PRIMARY KEY,
      provider VARCHAR(32) NOT NULL DEFAULT 'unknown',
      requests_total INT UNSIGNED NOT NULL DEFAULT 0,
      translated_characters BIGINT UNSIGNED NOT NULL DEFAULT 0,
      cache_hits INT UNSIGNED NOT NULL DEFAULT 0,
      failures INT UNSIGNED NOT NULL DEFAULT 0,
      estimated_cost_usd DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
      last_success_at DATETIME NULL,
      last_failure_at DATETIME NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
}

async function trackCommunityTranslationMetric({
  provider = 'unknown',
  translatedCharacters = 0,
  cacheHit = false,
  failed = false,
  estimatedCostUsd = 0,
  when = new Date(),
}) {
  const usageDay = dayFromDate(when);
  const chars = Math.max(0, Number(translatedCharacters) || 0);
  const estCost = Math.max(0, Number(estimatedCostUsd) || 0);
  const cacheAdd = cacheHit ? 1 : 0;
  const failAdd = failed ? 1 : 0;
  const successAt = failed ? null : when;
  const failureAt = failed ? when : null;

  await executeQuery(
    `INSERT INTO ${TABLE}
      (usage_day, provider, requests_total, translated_characters, cache_hits, failures, estimated_cost_usd, last_success_at, last_failure_at)
     VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      provider = VALUES(provider),
      requests_total = requests_total + 1,
      translated_characters = translated_characters + VALUES(translated_characters),
      cache_hits = cache_hits + VALUES(cache_hits),
      failures = failures + VALUES(failures),
      estimated_cost_usd = estimated_cost_usd + VALUES(estimated_cost_usd),
      last_success_at = COALESCE(VALUES(last_success_at), last_success_at),
      last_failure_at = COALESCE(VALUES(last_failure_at), last_failure_at),
      updated_at = CURRENT_TIMESTAMP`,
    [usageDay, String(provider || 'unknown'), chars, cacheAdd, failAdd, estCost, successAt, failureAt]
  );
}

async function getCommunityTranslationMetricsSummary({ days = 31 } = {}) {
  const lookback = dayFromDate(Date.now() - Math.max(1, Number(days) || 31) * 86400000);
  const [rows] = await executeQuery(
    `SELECT
      SUM(requests_total) AS requests_total,
      SUM(translated_characters) AS translated_characters,
      SUM(cache_hits) AS cache_hits,
      SUM(failures) AS failures,
      SUM(estimated_cost_usd) AS estimated_cost_usd,
      MAX(last_success_at) AS last_success_at,
      MAX(last_failure_at) AS last_failure_at
     FROM ${TABLE}
     WHERE usage_day >= ?`,
    [lookback]
  );
  const row = rows && rows[0] ? rows[0] : {};
  const requests = Number(row.requests_total || 0);
  const cacheHits = Number(row.cache_hits || 0);
  const failures = Number(row.failures || 0);
  return {
    requestsTotal: requests,
    translatedCharacters: Number(row.translated_characters || 0),
    cacheHits,
    failures,
    estimatedCostUsd: Number(row.estimated_cost_usd || 0),
    cacheHitRatePct: requests > 0 ? Number(((cacheHits / requests) * 100).toFixed(2)) : 0,
    failureRatePct: requests > 0 ? Number(((failures / requests) * 100).toFixed(2)) : 0,
    lastSuccessfulTranslationAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : null,
    lastFailedTranslationAt: row.last_failure_at ? new Date(row.last_failure_at).toISOString() : null,
  };
}

module.exports = {
  ensureCommunityTranslationMetricsTable,
  trackCommunityTranslationMetric,
  getCommunityTranslationMetricsSummary,
};
