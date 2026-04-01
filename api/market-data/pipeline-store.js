const { executeQuery, addColumnIfNotExists } = require('../db');

const TABLES = {
  snapshots: 'market_snapshots',
  prices: 'asset_prices',
  headlines: 'market_headlines',
  events: 'economic_events',
  decoderStates: 'decoder_states',
  briefGenerations: 'brief_generations',
  aiContextPackets: 'ai_context_packets',
  providerUsage: 'provider_usage_logs',
  refreshLocks: 'market_refresh_locks',
};

function toJson(value) {
  return value == null ? null : JSON.stringify(value);
}

function fromJson(value) {
  if (value == null || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
}

function freshnessStatus(updatedAt, ttlMs) {
  if (!updatedAt) return 'missing';
  const ts = new Date(updatedAt).getTime();
  if (!Number.isFinite(ts)) return 'unknown';
  const age = Date.now() - ts;
  if (age <= ttlMs) return 'fresh';
  if (age <= ttlMs * 3) return 'stale';
  return 'expired';
}

async function ensurePipelineTables() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.snapshots} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      snapshot_key VARCHAR(120) NOT NULL,
      snapshot_type VARCHAR(40) NOT NULL,
      timeframe VARCHAR(20) NOT NULL DEFAULT 'daily',
      as_of_ts DATETIME NOT NULL,
      source VARCHAR(80) NOT NULL,
      freshness_status VARCHAR(20) NOT NULL DEFAULT 'fresh',
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_market_snapshot (snapshot_key, timeframe)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.prices} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      symbol VARCHAR(40) NOT NULL,
      provider_symbol VARCHAR(80) NULL,
      asset_class VARCHAR(30) NULL,
      price DECIMAL(24,10) NULL,
      previous_close DECIMAL(24,10) NULL,
      change_value DECIMAL(24,10) NULL,
      change_percent DECIMAL(12,6) NULL,
      high_price DECIMAL(24,10) NULL,
      low_price DECIMAL(24,10) NULL,
      open_price DECIMAL(24,10) NULL,
      source VARCHAR(80) NOT NULL,
      freshness_status VARCHAR(20) NOT NULL DEFAULT 'fresh',
      snapshot_ts DATETIME NOT NULL,
      raw_payload JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_asset_price_symbol (symbol),
      KEY idx_asset_price_snapshot_ts (snapshot_ts)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.headlines} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      headline_hash VARCHAR(64) NOT NULL,
      headline TEXT NOT NULL,
      summary TEXT NULL,
      url VARCHAR(1024) NULL,
      source VARCHAR(80) NOT NULL,
      category VARCHAR(40) NULL,
      related_symbol VARCHAR(40) NULL,
      freshness_status VARCHAR(20) NOT NULL DEFAULT 'fresh',
      published_at DATETIME NULL,
      ingested_at DATETIME NOT NULL,
      raw_payload JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_market_headline_hash (headline_hash),
      KEY idx_market_headlines_symbol (related_symbol),
      KEY idx_market_headlines_published (published_at)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.events} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      provider_event_id VARCHAR(120) NULL,
      event_date DATE NOT NULL,
      event_time VARCHAR(32) NULL,
      event_ts DATETIME NULL,
      title VARCHAR(255) NOT NULL,
      country VARCHAR(80) NULL,
      currency VARCHAR(16) NULL,
      impact VARCHAR(20) NULL,
      actual_value VARCHAR(64) NULL,
      forecast_value VARCHAR(64) NULL,
      previous_value VARCHAR(64) NULL,
      revised_value VARCHAR(64) NULL,
      unit VARCHAR(32) NULL,
      source VARCHAR(80) NOT NULL,
      freshness_status VARCHAR(20) NOT NULL DEFAULT 'fresh',
      raw_payload JSON NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_economic_event (provider_event_id, event_date, title(120), currency),
      KEY idx_economic_events_date (event_date),
      KEY idx_economic_events_currency (currency)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.decoderStates} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      symbol VARCHAR(40) NOT NULL,
      timeframe VARCHAR(20) NOT NULL DEFAULT 'daily',
      source VARCHAR(80) NOT NULL,
      freshness_status VARCHAR(20) NOT NULL DEFAULT 'fresh',
      generated_at DATETIME NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_decoder_state_symbol (symbol, timeframe)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.briefGenerations} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      brief_key VARCHAR(120) NOT NULL,
      brief_kind VARCHAR(40) NOT NULL,
      timeframe VARCHAR(20) NOT NULL DEFAULT 'daily',
      source VARCHAR(80) NOT NULL,
      freshness_status VARCHAR(20) NOT NULL DEFAULT 'fresh',
      generated_at DATETIME NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_brief_generation (brief_key, timeframe)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.aiContextPackets} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      packet_key VARCHAR(120) NOT NULL,
      timeframe VARCHAR(20) NOT NULL DEFAULT 'daily',
      source VARCHAR(80) NOT NULL,
      freshness_status VARCHAR(20) NOT NULL DEFAULT 'fresh',
      generated_at DATETIME NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ai_context_packet (packet_key, timeframe)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.providerUsage} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(60) NOT NULL,
      feature VARCHAR(80) NOT NULL,
      usage_day DATE NOT NULL,
      usage_month VARCHAR(7) NOT NULL,
      call_count INT NOT NULL DEFAULT 0,
      last_called_at DATETIME NOT NULL,
      last_status VARCHAR(20) NULL,
      notes VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_provider_usage (provider, feature, usage_day)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.refreshLocks} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lock_key VARCHAR(120) NOT NULL,
      owner_id VARCHAR(80) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_refresh_lock (lock_key)
    )
  `);

  await addColumnIfNotExists(TABLES.snapshots, 'notes', 'VARCHAR(255) NULL');
}

async function upsertMarketSnapshot({ snapshotKey, snapshotType, timeframe = 'daily', source, asOfTs, freshnessStatus: freshness, payload, notes = null }) {
  await executeQuery(
    `INSERT INTO ${TABLES.snapshots} (snapshot_key, snapshot_type, timeframe, as_of_ts, source, freshness_status, payload, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       as_of_ts = VALUES(as_of_ts),
       source = VALUES(source),
       freshness_status = VALUES(freshness_status),
       payload = VALUES(payload),
       notes = VALUES(notes),
       updated_at = CURRENT_TIMESTAMP`,
    [snapshotKey, snapshotType, timeframe, asOfTs, source, freshness, toJson(payload), notes]
  );
}

async function upsertAssetPrices(rows) {
  for (const row of rows || []) {
    await executeQuery(
      `INSERT INTO ${TABLES.prices}
       (symbol, provider_symbol, asset_class, price, previous_close, change_value, change_percent, high_price, low_price, open_price, source, freshness_status, snapshot_ts, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         provider_symbol = VALUES(provider_symbol),
         asset_class = VALUES(asset_class),
         price = VALUES(price),
         previous_close = VALUES(previous_close),
         change_value = VALUES(change_value),
         change_percent = VALUES(change_percent),
         high_price = VALUES(high_price),
         low_price = VALUES(low_price),
         open_price = VALUES(open_price),
         source = VALUES(source),
         freshness_status = VALUES(freshness_status),
         snapshot_ts = VALUES(snapshot_ts),
         raw_payload = VALUES(raw_payload),
         updated_at = CURRENT_TIMESTAMP`,
      [
        row.symbol,
        row.providerSymbol || null,
        row.assetClass || null,
        row.price ?? null,
        row.previousClose ?? null,
        row.change ?? null,
        row.changePercent ?? null,
        row.high ?? null,
        row.low ?? null,
        row.open ?? null,
        row.source || 'unknown',
        row.freshnessStatus || 'fresh',
        row.snapshotTs,
        toJson(row.rawPayload || row),
      ]
    );
  }
}

async function upsertHeadlines(rows) {
  for (const row of rows || []) {
    await executeQuery(
      `INSERT INTO ${TABLES.headlines}
       (headline_hash, headline, summary, url, source, category, related_symbol, freshness_status, published_at, ingested_at, raw_payload)
       VALUES (SHA2(?, 256), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         summary = VALUES(summary),
         url = VALUES(url),
         category = VALUES(category),
         related_symbol = VALUES(related_symbol),
         freshness_status = VALUES(freshness_status),
         published_at = VALUES(published_at),
         ingested_at = VALUES(ingested_at),
         raw_payload = VALUES(raw_payload),
         updated_at = CURRENT_TIMESTAMP`,
      [
        `${row.headline || ''}|${row.url || ''}`,
        row.headline || '',
        row.summary || null,
        row.url || null,
        row.source || 'unknown',
        row.category || null,
        row.relatedSymbol || null,
        row.freshnessStatus || 'fresh',
        row.publishedAt || null,
        row.ingestedAt,
        toJson(row.rawPayload || row),
      ]
    );
  }
}

async function upsertEconomicEvents(rows) {
  for (const row of rows || []) {
    await executeQuery(
      `INSERT INTO ${TABLES.events}
       (provider_event_id, event_date, event_time, event_ts, title, country, currency, impact, actual_value, forecast_value, previous_value, revised_value, unit, source, freshness_status, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         event_time = VALUES(event_time),
         event_ts = VALUES(event_ts),
         country = VALUES(country),
         impact = VALUES(impact),
         actual_value = VALUES(actual_value),
         forecast_value = VALUES(forecast_value),
         previous_value = VALUES(previous_value),
         revised_value = VALUES(revised_value),
         unit = VALUES(unit),
         source = VALUES(source),
         freshness_status = VALUES(freshness_status),
         raw_payload = VALUES(raw_payload),
         updated_at = CURRENT_TIMESTAMP`,
      [
        row.providerEventId || null,
        row.eventDate,
        row.eventTime || null,
        row.eventTs || null,
        row.title,
        row.country || null,
        row.currency || null,
        row.impact || null,
        row.actual ?? null,
        row.forecast ?? null,
        row.previous ?? null,
        row.revised ?? null,
        row.unit ?? null,
        row.source || 'unknown',
        row.freshnessStatus || 'fresh',
        toJson(row.rawPayload || row),
      ]
    );
  }
}

async function upsertDecoderState({ symbol, timeframe = 'daily', source, generatedAt, freshnessStatus: freshness, payload }) {
  await executeQuery(
    `INSERT INTO ${TABLES.decoderStates} (symbol, timeframe, source, freshness_status, generated_at, payload)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       source = VALUES(source),
       freshness_status = VALUES(freshness_status),
       generated_at = VALUES(generated_at),
       payload = VALUES(payload),
       updated_at = CURRENT_TIMESTAMP`,
    [symbol, timeframe, source, freshness, generatedAt, toJson(payload)]
  );
}

async function upsertAiContextPacket({ packetKey = 'global', timeframe = 'daily', source, generatedAt, freshnessStatus: freshness, payload }) {
  await executeQuery(
    `INSERT INTO ${TABLES.aiContextPackets} (packet_key, timeframe, source, freshness_status, generated_at, payload)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       source = VALUES(source),
       freshness_status = VALUES(freshness_status),
       generated_at = VALUES(generated_at),
       payload = VALUES(payload),
       updated_at = CURRENT_TIMESTAMP`,
    [packetKey, timeframe, source, freshness, generatedAt, toJson(payload)]
  );
}

async function trackProviderUsage({ provider, feature, status = 'ok', notes = null, calledAt = new Date() }) {
  const usageDay = new Date(calledAt).toISOString().slice(0, 10);
  const usageMonth = usageDay.slice(0, 7);
  await executeQuery(
    `INSERT INTO ${TABLES.providerUsage} (provider, feature, usage_day, usage_month, call_count, last_called_at, last_status, notes)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       call_count = call_count + 1,
       last_called_at = VALUES(last_called_at),
       last_status = VALUES(last_status),
       notes = VALUES(notes),
       updated_at = CURRENT_TIMESTAMP`,
    [provider, feature, usageDay, usageMonth, calledAt, status, notes]
  );
}

async function getProviderUsageSummary({ provider, feature, days = 30 }) {
  const lookback = new Date(Date.now() - Math.max(1, Number(days) || 30) * 86400000)
    .toISOString()
    .slice(0, 10);
  const params = [lookback];
  const clauses = ['usage_day >= ?'];
  if (provider) {
    clauses.push('provider = ?');
    params.push(provider);
  }
  if (feature) {
    clauses.push('feature = ?');
    params.push(feature);
  }
  const [rows] = await executeQuery(
    `SELECT provider, feature, SUM(call_count) AS total_calls, MAX(last_called_at) AS last_called_at
     FROM ${TABLES.providerUsage}
     WHERE ${clauses.join(' AND ')}
     GROUP BY provider, feature`,
    params
  );
  return rows || [];
}

async function acquireRefreshLock(lockKey, ownerId, ttlMs = 120000) {
  const expiresAt = new Date(Date.now() + ttlMs);
  await executeQuery(`DELETE FROM ${TABLES.refreshLocks} WHERE expires_at < UTC_TIMESTAMP()`);
  const [existingRows] = await executeQuery(
    `SELECT lock_key, owner_id, expires_at FROM ${TABLES.refreshLocks} WHERE lock_key = ? LIMIT 1`,
    [lockKey]
  );
  const existing = existingRows?.[0];
  if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
    return {
      acquired: false,
      lockKey,
      ownerId: existing.owner_id,
      expiresAt: existing.expires_at,
    };
  }
  await executeQuery(
    `INSERT INTO ${TABLES.refreshLocks} (lock_key, owner_id, expires_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE
       owner_id = VALUES(owner_id),
       expires_at = VALUES(expires_at),
       updated_at = CURRENT_TIMESTAMP`,
    [lockKey, ownerId, expiresAt]
  );
  return { acquired: true, lockKey, ownerId, expiresAt };
}

async function releaseRefreshLock(lockKey, ownerId) {
  await executeQuery(
    `DELETE FROM ${TABLES.refreshLocks} WHERE lock_key = ? AND owner_id = ?`,
    [lockKey, ownerId]
  );
}

async function listActiveRefreshLocks() {
  const [rows] = await executeQuery(
    `SELECT lock_key, owner_id, expires_at, updated_at
     FROM ${TABLES.refreshLocks}
     WHERE expires_at >= UTC_TIMESTAMP()
     ORDER BY expires_at ASC`
  );
  return rows || [];
}

async function listLatestSnapshots(limit = 25) {
  const [rows] = await executeQuery(
    `SELECT snapshot_key, snapshot_type, timeframe, source, freshness_status, as_of_ts, updated_at, notes
     FROM ${TABLES.snapshots}
     ORDER BY updated_at DESC
     LIMIT ?`,
    [Math.max(1, Math.min(Number(limit) || 25, 100))]
  );
  return rows || [];
}

async function listLatestDecoderStates(limit = 25) {
  const [rows] = await executeQuery(
    `SELECT symbol, timeframe, source, freshness_status, generated_at, updated_at
     FROM ${TABLES.decoderStates}
     ORDER BY updated_at DESC
     LIMIT ?`,
    [Math.max(1, Math.min(Number(limit) || 25, 100))]
  );
  return rows || [];
}

async function getLatestSnapshot(snapshotKey, timeframe = 'daily') {
  const [rows] = await executeQuery(
    `SELECT snapshot_key, snapshot_type, timeframe, as_of_ts, source, freshness_status, payload, notes, updated_at
     FROM ${TABLES.snapshots}
     WHERE snapshot_key = ? AND timeframe = ?
     LIMIT 1`,
    [snapshotKey, timeframe]
  );
  if (!rows?.[0]) return null;
  return {
    ...rows[0],
    payload: fromJson(rows[0].payload),
  };
}

async function getLatestAiContextPacket(packetKey = 'global', timeframe = 'daily') {
  const [rows] = await executeQuery(
    `SELECT packet_key, timeframe, source, freshness_status, generated_at, payload, updated_at
     FROM ${TABLES.aiContextPackets}
     WHERE packet_key = ? AND timeframe = ?
     LIMIT 1`,
    [packetKey, timeframe]
  );
  if (!rows?.[0]) return null;
  return {
    ...rows[0],
    payload: fromJson(rows[0].payload),
  };
}

async function getLatestDecoderState(symbol, timeframe = 'daily') {
  const [rows] = await executeQuery(
    `SELECT symbol, timeframe, source, freshness_status, generated_at, payload, updated_at
     FROM ${TABLES.decoderStates}
     WHERE symbol = ? AND timeframe = ?
     LIMIT 1`,
    [symbol, timeframe]
  );
  if (!rows?.[0]) return null;
  return {
    ...rows[0],
    payload: fromJson(rows[0].payload),
  };
}

async function getLatestAssetPrices(symbols = []) {
  if (!Array.isArray(symbols) || symbols.length === 0) return [];
  const placeholders = symbols.map(() => '?').join(', ');
  const [rows] = await executeQuery(
    `SELECT symbol, provider_symbol, asset_class, price, previous_close, change_value, change_percent, high_price, low_price, open_price, source, freshness_status, snapshot_ts, updated_at
     FROM ${TABLES.prices}
     WHERE symbol IN (${placeholders})`,
    symbols
  );
  return (rows || []).map((row) => ({
    ...row,
    raw_payload: fromJson(row.raw_payload),
  }));
}

async function getRecentHeadlines({ symbol = null, limit = 20 } = {}) {
  const params = [];
  let where = '';
  if (symbol) {
    where = 'WHERE related_symbol = ?';
    params.push(symbol);
  }
  params.push(Math.max(1, Math.min(Number(limit) || 20, 100)));
  const [rows] = await executeQuery(
    `SELECT headline, summary, url, source, category, related_symbol, freshness_status, published_at, updated_at, raw_payload
     FROM ${TABLES.headlines}
     ${where}
     ORDER BY COALESCE(published_at, updated_at) DESC
     LIMIT ?`,
    params
  );
  return (rows || []).map((row) => ({
    ...row,
    raw_payload: fromJson(row.raw_payload),
  }));
}

async function getRecentEconomicEvents({ fromDate = null, toDate = null, limit = 200 } = {}) {
  const clauses = [];
  const params = [];
  if (fromDate) {
    clauses.push('event_date >= ?');
    params.push(fromDate);
  }
  if (toDate) {
    clauses.push('event_date <= ?');
    params.push(toDate);
  }
  params.push(Math.max(1, Math.min(Number(limit) || 200, 500)));
  const [rows] = await executeQuery(
    `SELECT provider_event_id, event_date, event_time, event_ts, title, country, currency, impact, actual_value, forecast_value, previous_value, revised_value, unit, source, freshness_status, updated_at, raw_payload
     FROM ${TABLES.events}
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY COALESCE(event_ts, updated_at) ASC
     LIMIT ?`,
    params
  );
  return (rows || []).map((row) => ({
    ...row,
    raw_payload: fromJson(row.raw_payload),
  }));
}

module.exports = {
  TABLES,
  ensurePipelineTables,
  freshnessStatus,
  upsertMarketSnapshot,
  upsertAssetPrices,
  upsertHeadlines,
  upsertEconomicEvents,
  upsertDecoderState,
  upsertAiContextPacket,
  trackProviderUsage,
  getProviderUsageSummary,
  acquireRefreshLock,
  releaseRefreshLock,
  listActiveRefreshLocks,
  listLatestSnapshots,
  listLatestDecoderStates,
  getLatestSnapshot,
  getLatestAiContextPacket,
  getLatestDecoderState,
  getLatestAssetPrices,
  getRecentHeadlines,
  getRecentEconomicEvents,
};
