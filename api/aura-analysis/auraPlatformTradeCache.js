/**
 * Idempotent cache for normalized MetaTrader trades per user + platform (dedupe on refresh).
 */
const { executeQuery } = require('../db');
const {
  dedupeNormalizedTrades,
  filterTradesByDays,
  filterTradesByInclusiveDateRange,
} = require('./mtTradeNormalize');

const BATCH_SIZE = 45;

async function ensureTradeCacheTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS aura_platform_trade_cache (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      platform_id VARCHAR(20) NOT NULL,
      deal_key VARCHAR(192) NOT NULL,
      trade_json JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_aura_plat_deal (user_id, platform_id, deal_key),
      KEY idx_user_plat (user_id, platform_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function stableDealKey(t) {
  const id = String(t.id ?? '').trim();
  const sym = String(t.pair ?? t.symbol ?? '').trim().replace(/\s+/g, '');
  const ct = String(t.closeTime ?? t.created_at ?? '').trim();
  const ot = String(t.openTime ?? '').trim();
  if (id && sym) return `${id}|${sym}|${ct}`.slice(0, 192);
  if (id) return `${id}|${ct || ot}`.slice(0, 192);
  return `h|${sym}|${ot}|${ct}`.slice(0, 192);
}

async function upsertTradeCacheRows(userId, platformId, trades) {
  if (!userId || !platformId || !Array.isArray(trades) || trades.length === 0) return;
  await ensureTradeCacheTable();

  const rows = [];
  for (const t of trades) {
    const key = stableDealKey(t);
    if (!key || key.length < 2) continue;
    let json;
    try {
      json = JSON.stringify(t);
    } catch {
      continue;
    }
    rows.push({ key, json });
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    if (!chunk.length) continue;
    const placeholders = chunk.map(() => '(?, ?, ?, ?)').join(', ');
    const params = chunk.flatMap((r) => [userId, platformId, r.key, r.json]);
    try {
      // eslint-disable-next-line no-await-in-loop
      await executeQuery(
        `INSERT INTO aura_platform_trade_cache (user_id, platform_id, deal_key, trade_json)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE trade_json = VALUES(trade_json), updated_at = CURRENT_TIMESTAMP`,
        params
      );
    } catch (e) {
      console.warn('[aura-platform-trade-cache] batch upsert failed, falling back per-row:', e.message);
      for (const r of chunk) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await executeQuery(
            `INSERT INTO aura_platform_trade_cache (user_id, platform_id, deal_key, trade_json)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE trade_json = VALUES(trade_json), updated_at = CURRENT_TIMESTAMP`,
            [userId, platformId, r.key, r.json]
          );
        } catch (err) {
          console.warn('[aura-platform-trade-cache] upsert skipped:', err.message);
        }
      }
    }
  }
}

/**
 * Last-resort history when live worker fails — filtered to requested window, deduped.
 */
async function loadCachedTradesForRange(userId, platformId, days, dateRange = null) {
  if (!userId || !platformId) return [];
  try {
    await ensureTradeCacheTable();
    const [rows] = await executeQuery(
      `SELECT trade_json FROM aura_platform_trade_cache
       WHERE user_id = ? AND platform_id = ?`,
      [userId, platformId]
    );
    const trades = [];
    for (const row of rows || []) {
      try {
        let raw = row.trade_json;
        if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
        const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (t && typeof t === 'object') trades.push(t);
      } catch (_) { /* skip */ }
    }
    const deduped = dedupeNormalizedTrades(trades);
    let out = filterTradesByDays(deduped, days);
    if (dateRange?.from && dateRange?.to) {
      out = filterTradesByInclusiveDateRange(out, dateRange.from, dateRange.to);
    }
    return out;
  } catch (e) {
    console.warn('[aura-platform-trade-cache] load cache failed:', e.message);
    return [];
  }
}

module.exports = {
  ensureTradeCacheTable,
  upsertTradeCacheRows,
  stableDealKey,
  loadCachedTradesForRange,
};
