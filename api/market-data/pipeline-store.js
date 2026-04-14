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
  ohlcvBars: 'market_ohlcv_bars',
  ohlcvBackfill: 'market_ohlcv_backfill_state',
  twelveDataDatasets: 'market_twelvedata_datasets',
  tdIngestRuns: 'market_td_ingest_runs',
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

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.ohlcvBars} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      canonical_symbol VARCHAR(40) NOT NULL,
      interval_key VARCHAR(16) NOT NULL,
      bar_time_utc BIGINT NOT NULL COMMENT 'Unix ms UTC bar open',
      open_p DECIMAL(24, 10) NOT NULL,
      high_p DECIMAL(24, 10) NOT NULL,
      low_p DECIMAL(24, 10) NOT NULL,
      close_p DECIMAL(24, 10) NOT NULL,
      volume DECIMAL(24, 4) NULL,
      provider VARCHAR(40) NOT NULL DEFAULT 'twelvedata',
      ingested_at DATETIME NOT NULL,
      raw_json JSON NULL,
      UNIQUE KEY uq_ohlcv_bar (canonical_symbol, interval_key, bar_time_utc),
      KEY idx_ohlcv_sym_int_time (canonical_symbol, interval_key, bar_time_utc)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.ohlcvBackfill} (
      canonical_symbol VARCHAR(40) NOT NULL,
      interval_key VARCHAR(16) NOT NULL,
      earliest_ts BIGINT NULL,
      latest_ts BIGINT NULL,
      last_full_backfill_at DATETIME NULL,
      last_incremental_at DATETIME NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'idle',
      error_note VARCHAR(512) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (canonical_symbol, interval_key)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.twelveDataDatasets} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      canonical_symbol VARCHAR(40) NOT NULL,
      provider_symbol VARCHAR(80) NULL,
      market_category VARCHAR(24) NOT NULL DEFAULT 'equity',
      dataset_key VARCHAR(80) NOT NULL,
      provider VARCHAR(32) NOT NULL DEFAULT 'twelvedata',
      freshness_status VARCHAR(20) NOT NULL DEFAULT 'fresh',
      fetched_at DATETIME NOT NULL,
      next_refresh_after DATETIME NULL,
      payload JSON NOT NULL,
      meta JSON NULL,
      error_note VARCHAR(512) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_td_dataset (canonical_symbol, market_category, dataset_key),
      KEY idx_td_cat_fetched (market_category, fetched_at),
      KEY idx_td_symbol (canonical_symbol, fetched_at)
    )
  `);

  await executeQuery(`
    CREATE TABLE IF NOT EXISTS ${TABLES.tdIngestRuns} (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      category_id VARCHAR(32) NOT NULL,
      run_started_at DATETIME NOT NULL,
      run_finished_at DATETIME NOT NULL,
      status VARCHAR(20) NOT NULL,
      stats_json JSON NULL,
      error_summary VARCHAR(512) NULL,
      options_json JSON NULL,
      KEY idx_td_ingest_cat_time (category_id, run_started_at)
    )
  `);
}

const OHLCV_DAILY_FRESH_MS = Math.max(
  6 * 60 * 60 * 1000,
  parseInt(process.env.MD_OHLCV_DAILY_FRESH_MS || String(36 * 60 * 60 * 1000), 10) || 36 * 60 * 60 * 1000
);

async function queryOhlcvRange(canonicalSymbol, intervalKey, fromMs, toMs) {
  if (!process.env.MYSQL_HOST) return [];
  const sym = String(canonicalSymbol || '').toUpperCase();
  const intv = String(intervalKey || '1day');
  const from = Number(fromMs);
  const to = Number(toMs);
  if (!sym || !Number.isFinite(from) || !Number.isFinite(to)) return [];
  try {
    const [rows] = await executeQuery(
      `SELECT bar_time_utc, open_p, high_p, low_p, close_p, volume, provider
       FROM ${TABLES.ohlcvBars}
       WHERE canonical_symbol = ? AND interval_key = ? AND bar_time_utc >= ? AND bar_time_utc <= ?
       ORDER BY bar_time_utc ASC`,
      [sym, intv, Math.floor(from), Math.floor(to)]
    );
    return rows || [];
  } catch (_) {
    return [];
  }
}

/** True when DB has bars covering [fromMs,toMs] and latest bar is fresh enough for daily. */
async function ohlcvCoverageOk(canonicalSymbol, intervalKey, fromMs, toMs) {
  const rows = await queryOhlcvRange(canonicalSymbol, intervalKey, fromMs, toMs);
  if (!rows.length) return { ok: false, rows: [] };
  const firstT = Number(rows[0].bar_time_utc);
  const lastT = Number(rows[rows.length - 1].bar_time_utc);
  if (firstT > fromMs + 86400000 || lastT < toMs - 86400000 || rows.length < 40) {
    return { ok: false, rows: [] };
  }
  if (intervalKey === '1day') {
    const age = Date.now() - lastT;
    if (age > OHLCV_DAILY_FRESH_MS) return { ok: false, rows: [] };
  }
  return { ok: true, rows };
}

async function upsertOhlcvBars(rows) {
  if (!process.env.MYSQL_HOST || !rows || !rows.length) return;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  for (const r of rows) {
    await executeQuery(
      `INSERT INTO ${TABLES.ohlcvBars}
       (canonical_symbol, interval_key, bar_time_utc, open_p, high_p, low_p, close_p, volume, provider, ingested_at, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         open_p = VALUES(open_p),
         high_p = VALUES(high_p),
         low_p = VALUES(low_p),
         close_p = VALUES(close_p),
         volume = VALUES(volume),
         provider = VALUES(provider),
         ingested_at = VALUES(ingested_at),
         raw_json = VALUES(raw_json)`,
      [
        String(r.canonicalSymbol || '').toUpperCase(),
        String(r.intervalKey || '1day'),
        Math.floor(Number(r.barTimeUtc)),
        r.open,
        r.high,
        r.low,
        r.close,
        r.volume != null ? r.volume : null,
        r.provider || 'twelvedata',
        r.ingestedAt || now,
        toJson(r.raw || null),
      ]
    );
  }
}

async function upsertOhlcvBackfillState(row) {
  if (!process.env.MYSQL_HOST || !row) return;
  await executeQuery(
    `INSERT INTO ${TABLES.ohlcvBackfill}
     (canonical_symbol, interval_key, earliest_ts, latest_ts, last_full_backfill_at, last_incremental_at, status, error_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       earliest_ts = COALESCE(VALUES(earliest_ts), earliest_ts),
       latest_ts = COALESCE(VALUES(latest_ts), latest_ts),
       last_full_backfill_at = COALESCE(VALUES(last_full_backfill_at), last_full_backfill_at),
       last_incremental_at = COALESCE(VALUES(last_incremental_at), last_incremental_at),
       status = VALUES(status),
       error_note = VALUES(error_note),
       updated_at = CURRENT_TIMESTAMP`,
    [
      String(row.canonicalSymbol || '').toUpperCase(),
      String(row.intervalKey || '1day'),
      row.earliestTs != null ? Math.floor(row.earliestTs) : null,
      row.latestTs != null ? Math.floor(row.latestTs) : null,
      row.lastFullBackfillAt || null,
      row.lastIncrementalAt || null,
      row.status || 'idle',
      row.errorNote || null,
    ]
  );
}

async function getOhlcvBackfillState(canonicalSymbol, intervalKey) {
  if (!process.env.MYSQL_HOST) return null;
  const [rows] = await executeQuery(
    `SELECT * FROM ${TABLES.ohlcvBackfill} WHERE canonical_symbol = ? AND interval_key = ? LIMIT 1`,
    [String(canonicalSymbol || '').toUpperCase(), String(intervalKey || '1day')]
  );
  return rows && rows[0] ? rows[0] : null;
}

/**
 * Per-symbol OHLCV coverage for admin (e.g. FX majors).
 * @param {string[]} symbols
 */
async function getForexOhlcvCoverageReport(symbols = []) {
  if (!process.env.MYSQL_HOST) {
    return { configured: false, pairs: [] };
  }
  const pairs = [];
  for (const sym of symbols || []) {
    const s = String(sym || '').toUpperCase();
    if (!s) continue;
    let st = null;
    try {
      st = await getOhlcvBackfillState(s, '1day');
    } catch (_) {
      st = null;
    }
    let barCount = 0;
    try {
      const [[row]] = await executeQuery(
        `SELECT COUNT(*) AS c FROM ${TABLES.ohlcvBars} WHERE canonical_symbol = ? AND interval_key = ?`,
        [s, '1day']
      );
      barCount = Number(row && row.c) || 0;
    } catch (_) {
      barCount = 0;
    }
    const latestMs = st && st.latest_ts != null ? Number(st.latest_ts) : null;
    const earliestMs = st && st.earliest_ts != null ? Number(st.earliest_ts) : null;
    pairs.push({
      symbol: s,
      interval: '1day',
      barCount,
      latestStoredMs: latestMs,
      latestStoredIso: latestMs != null && Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : null,
      earliestStoredMs: earliestMs,
      earliestStoredIso: earliestMs != null && Number.isFinite(earliestMs) ? new Date(earliestMs).toISOString() : null,
      status: st ? st.status : null,
      lastIncrementalAt: st ? st.last_incremental_at : null,
      errorNote: st ? st.error_note : null,
    });
  }
  return { configured: true, pairs };
}

async function getOhlcvIngestSummary() {
  if (!process.env.MYSQL_HOST) {
    return { configured: false, barCount: null, backfillRowCount: null, recentBackfill: [] };
  }
  try {
    const [[barRow]] = await executeQuery(`SELECT COUNT(*) AS c FROM ${TABLES.ohlcvBars}`);
    const [[bfRow]] = await executeQuery(`SELECT COUNT(*) AS c FROM ${TABLES.ohlcvBackfill}`);
    const [recent] = await executeQuery(
      `SELECT canonical_symbol, interval_key, status, last_incremental_at, latest_ts, error_note
       FROM ${TABLES.ohlcvBackfill}
       ORDER BY COALESCE(last_incremental_at, updated_at) DESC
       LIMIT 8`
    );
    return {
      configured: true,
      barCount: Number(barRow && barRow.c) || 0,
      backfillRowCount: Number(bfRow && bfRow.c) || 0,
      recentBackfill: (recent || []).map((r) => ({
        symbol: r.canonical_symbol,
        interval: r.interval_key,
        status: r.status,
        lastIncrementalAt: r.last_incremental_at,
        latestTs: r.latest_ts,
        errorNote: r.error_note || null,
      })),
    };
  } catch (e) {
    return {
      configured: true,
      error: e.message || String(e),
      barCount: null,
      backfillRowCount: null,
      recentBackfill: [],
    };
  }
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
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const [rows] = await executeQuery(
    `SELECT snapshot_key, snapshot_type, timeframe, source, freshness_status, as_of_ts, updated_at, notes
     FROM ${TABLES.snapshots}
     ORDER BY updated_at DESC
     LIMIT ${safeLimit}`
  );
  return rows || [];
}

async function listLatestDecoderStates(limit = 25) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
  const [rows] = await executeQuery(
    `SELECT symbol, timeframe, source, freshness_status, generated_at, updated_at
     FROM ${TABLES.decoderStates}
     ORDER BY updated_at DESC
     LIMIT ${safeLimit}`
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
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const [rows] = await executeQuery(
    `SELECT headline, summary, url, source, category, related_symbol, freshness_status, published_at, updated_at, raw_payload
     FROM ${TABLES.headlines}
     ${where}
     ORDER BY COALESCE(published_at, updated_at) DESC
     LIMIT ${safeLimit}`,
    params
  );
  return (rows || []).map((row) => ({
    ...row,
    raw_payload: fromJson(row.raw_payload),
  }));
}

async function upsertTwelveDataDataset(row) {
  if (!process.env.MYSQL_HOST || !row) return;
  const canon = String(row.canonicalSymbol || '').toUpperCase();
  const cat = String(row.marketCategory || 'equity');
  const key = String(row.datasetKey || '');
  if (!canon || !key) return;
  const fetchedAt = row.fetchedAt instanceof Date ? row.fetchedAt : new Date(row.fetchedAt || Date.now());
  const fetchedSql = fetchedAt.toISOString().slice(0, 19).replace('T', ' ');
  const nextRef = row.nextRefreshAfter
    ? (row.nextRefreshAfter instanceof Date
        ? row.nextRefreshAfter.toISOString().slice(0, 19).replace('T', ' ')
        : row.nextRefreshAfter)
    : null;
  await executeQuery(
    `INSERT INTO ${TABLES.twelveDataDatasets}
     (canonical_symbol, provider_symbol, market_category, dataset_key, provider, freshness_status, fetched_at, next_refresh_after, payload, meta, error_note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       provider_symbol = VALUES(provider_symbol),
       freshness_status = VALUES(freshness_status),
       fetched_at = VALUES(fetched_at),
       next_refresh_after = VALUES(next_refresh_after),
       payload = VALUES(payload),
       meta = VALUES(meta),
       error_note = VALUES(error_note),
       updated_at = CURRENT_TIMESTAMP`,
    [
      canon,
      row.providerSymbol || null,
      cat,
      key,
      row.provider || 'twelvedata',
      row.freshnessStatus || 'fresh',
      fetchedSql,
      nextRef,
      typeof row.payload === 'string' ? row.payload : toJson(row.payload),
      row.meta != null ? (typeof row.meta === 'string' ? row.meta : toJson(row.meta)) : null,
      row.errorNote || null,
    ]
  );
}

async function getTwelveDataDataset(canonicalSymbol, marketCategory, datasetKey) {
  if (!process.env.MYSQL_HOST) return null;
  const [rows] = await executeQuery(
    `SELECT * FROM ${TABLES.twelveDataDatasets}
     WHERE canonical_symbol = ? AND market_category = ? AND dataset_key = ? LIMIT 1`,
    [String(canonicalSymbol || '').toUpperCase(), String(marketCategory || 'equity'), String(datasetKey)]
  );
  if (!rows || !rows[0]) return null;
  const r = rows[0];
  return {
    ...r,
    payload: typeof r.payload === 'string' ? fromJson(r.payload) : r.payload,
    meta: r.meta == null ? null : typeof r.meta === 'string' ? fromJson(r.meta) : r.meta,
  };
}

async function listTwelveDataCoverageForStorageCategory(marketCategory, symbols = []) {
  if (!process.env.MYSQL_HOST) return { rows: [], aggregates: [] };
  const cat = String(marketCategory || 'equity');
  const list = [...new Set((symbols || []).map((s) => String(s || '').toUpperCase()).filter(Boolean))];
  if (!list.length) return { rows: [], aggregates: [] };
  const ph = list.map(() => '?').join(',');
  const [rows] = await executeQuery(
    `SELECT canonical_symbol, dataset_key, fetched_at, freshness_status, error_note, next_refresh_after
     FROM ${TABLES.twelveDataDatasets}
     WHERE market_category = ? AND canonical_symbol IN (${ph})
     ORDER BY canonical_symbol, dataset_key`,
    [cat, ...list]
  );
  const [aggregates] = await executeQuery(
    `SELECT dataset_key, COUNT(*) AS symbol_count, MAX(fetched_at) AS last_ingest
     FROM ${TABLES.twelveDataDatasets}
     WHERE market_category = ? AND canonical_symbol IN (${ph})
     GROUP BY dataset_key`,
    [cat, ...list]
  );
  return { rows: rows || [], aggregates: aggregates || [] };
}

async function listTwelveDataEquityCoverageForSymbols(symbols = []) {
  return listTwelveDataCoverageForStorageCategory('equity', symbols);
}

async function appendTdIngestRun(row) {
  if (!process.env.MYSQL_HOST || !row) return;
  const cat = String(row.categoryId || '');
  if (!cat) return;
  const started = row.runStartedAt instanceof Date ? row.runStartedAt : new Date(row.runStartedAt || Date.now());
  const finished = row.runFinishedAt instanceof Date ? row.runFinishedAt : new Date(row.runFinishedAt || Date.now());
  await executeQuery(
    `INSERT INTO ${TABLES.tdIngestRuns}
     (category_id, run_started_at, run_finished_at, status, stats_json, error_summary, options_json)
     VALUES (?,?,?,?,?,?,?)`,
    [
      cat,
      started.toISOString().slice(0, 19).replace('T', ' '),
      finished.toISOString().slice(0, 19).replace('T', ' '),
      String(row.status || 'unknown'),
      row.statsJson != null ? (typeof row.statsJson === 'string' ? row.statsJson : toJson(row.statsJson)) : null,
      row.errorSummary || null,
      row.optionsJson != null ? (typeof row.optionsJson === 'string' ? row.optionsJson : toJson(row.optionsJson)) : null,
    ]
  );
}

async function listRecentTdIngestRuns({ categoryId = null, limit = 20 } = {}) {
  if (!process.env.MYSQL_HOST) return [];
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const params = [];
  let where = '';
  if (categoryId) {
    where = 'WHERE category_id = ?';
    params.push(String(categoryId));
  }
  const [rows] = await executeQuery(
    `SELECT id, category_id, run_started_at, run_finished_at, status, stats_json, error_summary, options_json
     FROM ${TABLES.tdIngestRuns}
     ${where}
     ORDER BY run_started_at DESC
     LIMIT ${lim}`,
    params
  );
  return (rows || []).map((r) => ({
    ...r,
    stats_json: r.stats_json != null ? (typeof r.stats_json === 'string' ? fromJson(r.stats_json) : r.stats_json) : null,
    options_json: r.options_json != null ? (typeof r.options_json === 'string' ? fromJson(r.options_json) : r.options_json) : null,
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
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
  const [rows] = await executeQuery(
    `SELECT provider_event_id, event_date, event_time, event_ts, title, country, currency, impact, actual_value, forecast_value, previous_value, revised_value, unit, source, freshness_status, updated_at, raw_payload
     FROM ${TABLES.events}
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY COALESCE(event_ts, updated_at) ASC
     LIMIT ${safeLimit}`,
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
  OHLCV_DAILY_FRESH_MS,
  queryOhlcvRange,
  ohlcvCoverageOk,
  upsertOhlcvBars,
  upsertOhlcvBackfillState,
  getOhlcvBackfillState,
  getOhlcvIngestSummary,
  getForexOhlcvCoverageReport,
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
  upsertTwelveDataDataset,
  getTwelveDataDataset,
  listTwelveDataCoverageForStorageCategory,
  listTwelveDataEquityCoverageForSymbols,
  appendTdIngestRun,
  listRecentTdIngestRuns,
};
