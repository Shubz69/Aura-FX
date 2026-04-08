/**
 * MT5 investor-bridge: singleflight background sync, persistent cache updates,
 * preset analytics (computeAnalytics via __analytics_node.cjs), incremental history hints.
 */
const path = require('path');
const crypto = require('crypto');
const { performMt5Operation } = require('./mtSyncService');
const { hasMtBridgeCredentials } = require('./mtSyncProvider');
const { upsertTradeCacheRows, loadCachedTradesForRange } = require('./auraPlatformTradeCache');
const {
  normalizeMtRow,
  dedupeNormalizedTrades,
  filterTradesByDays,
  MAX_HISTORY_LOOKBACK_DAYS,
} = require('./mtTradeNormalize');
const { safeMtLog, isAuraDiagnosticsEnabled } = require('./auraProductionUtils');
const {
  PRESET_DAY_WINDOWS,
  safeParsePresetBlob,
  putPresetEntries,
  getPresetEntryMeta,
  ANALYTICS_PRESET_ENGINE_VERSION,
} = require('./auraAnalyticsPresets');

const COOLDOWN_MS = Math.max(
  15000,
  Math.min(120000, parseInt(process.env.AURA_MT_BG_SYNC_COOLDOWN_MS || '45000', 10) || 45000),
);

/** Separate cooldown for preset-only warm jobs (dedupe storms). */
const PRESET_WARM_COOLDOWN_MS = Math.max(
  3000,
  Math.min(60000, parseInt(process.env.AURA_PRESET_WARM_COOLDOWN_MS || '8000', 10) || 8000),
);

/** @type {Map<string, Promise<void>>} */
const inflightBg = new Map();
/** @type {Map<string, number>} */
const lastScheduleMs = new Map();

/** @type {Map<string, Promise<void>>} */
const inflightPresetWarm = new Map();
/** @type {Map<string, number>} */
const lastPresetWarmScheduleMs = new Map();

function bridgeCacheKey(userId, platformId) {
  return `${userId}:${platformId}`;
}

function loadAnalyticsNode() {
  return require(path.join(__dirname, '__analytics_node.cjs'));
}

function safeJson(raw, fallback) {
  if (raw == null) return fallback;
  try {
    let s = raw;
    if (Buffer.isBuffer(s)) s = s.toString('utf8');
    if (typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
    return JSON.parse(String(s));
  } catch {
    return fallback;
  }
}

function maxCloseTimeMsFromTrades(trades) {
  let max = 0;
  for (const t of trades || []) {
    const raw = t.closeTime || t.created_at || t.openTime;
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (Number.isFinite(ms) && ms > max) max = ms;
  }
  return max;
}

function normalizeWorkerHistory(platformId, rawTrades) {
  const netPnlBreakdown = {
    explicit_net: 0,
    gross_includes_fees: 0,
    rollup_commission_swap: 0,
  };
  const mapped = [];
  for (let i = 0; i < rawTrades.length; i++) {
    const p = rawTrades[i];
    try {
      const hasSym = !!(p && (p.symbol || p.Symbol || p.SYMBOL || p.instrument || p.pair || p.s));
      if (!hasSym) continue;
      const row = normalizeMtRow(p, platformId, i, netPnlBreakdown);
      const pair = String(row.pair || '').trim();
      if (!pair || pair === '—') continue;
      mapped.push(row);
    } catch (_) {
      /* row discard */
    }
  }
  const windowed = filterTradesByDays(mapped, MAX_HISTORY_LOOKBACK_DAYS);
  return dedupeNormalizedTrades(windowed);
}

async function fetchHistoryFromWorker(credentials, platformId, syncState, requestId) {
  const days = MAX_HISTORY_LOOKBACK_DAYS;
  const opts = { days, trigger: 'scheduled', requestId };
  const sinceMs = syncState?.lastDealCloseMs;
  if (sinceMs != null && Number.isFinite(Number(sinceMs)) && Number(sinceMs) > 0) {
    const overlapMs = 3600000;
    opts.sinceCloseTimeMs = Math.max(0, Number(sinceMs) - overlapMs);
  }
  return performMt5Operation('deal_history', credentials, platformId, opts);
}

/**
 * Build presetMeta for mt_sync_state_json (observability + quick equality checks).
 */
function buildPresetMeta(tradesMax, accountObj, auraAnalysisClosedDataKey) {
  const windows = [];
  for (const d of PRESET_DAY_WINDOWS) {
    const subset = filterTradesByDays(tradesMax, d);
    windows.push({
      days: d,
      fp: auraAnalysisClosedDataKey(subset, accountObj),
    });
  }
  return {
    engineVersion: ANALYTICS_PRESET_ENGINE_VERSION,
    windows,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Computes only missing or stale preset entries; skips unchanged fingerprints (same engine version).
 * Does not delete last-good presets on failure paths (caller must not overwrite blob on error).
 */
async function maybeWarmAnalyticsPresets(executeQuery, userId, platformId, opts = {}) {
  const {
    bypassCooldown = false,
    reason = 'unspecified',
  } = opts;

  const warmKey = bridgeCacheKey(userId, platformId);
  if (!bypassCooldown) {
    const last = lastPresetWarmScheduleMs.get(warmKey) || 0;
    if (Date.now() - last < PRESET_WARM_COOLDOWN_MS) {
      if (isAuraDiagnosticsEnabled()) {
        safeMtLog('aura_preset_warm_skipped', { userId, platformId, reason: 'cooldown', trigger: reason }, 'info');
      }
      return;
    }
  }
  lastPresetWarmScheduleMs.set(warmKey, Date.now());

  const [rows] = await executeQuery(
    `SELECT account_info, analytics_presets_json, mt_sync_state_json FROM aura_platform_connections
     WHERE user_id = ? AND platform_id = ? LIMIT 1`,
    [userId, platformId],
  );
  const row = rows && rows[0];
  if (!row) return;

  const accountObj = safeJson(row.account_info, null);
  if (!accountObj) return;

  const tradesMax = await loadCachedTradesForRange(userId, platformId, MAX_HISTORY_LOOKBACK_DAYS, null);
  const { computeAnalytics, auraAnalysisClosedDataKey } = loadAnalyticsNode();
  const blob = safeParsePresetBlob(row.analytics_presets_json);

  const inserts = [];
  let skipped = 0;
  for (const d of PRESET_DAY_WINDOWS) {
    const subset = filterTradesByDays(tradesMax, d);
    const fp = auraAnalysisClosedDataKey(subset, accountObj);
    const meta = getPresetEntryMeta(blob, fp);
    if (
      meta
      && meta.data != null
      && meta.engineVersion === ANALYTICS_PRESET_ENGINE_VERSION
    ) {
      skipped += 1;
      continue;
    }
    /* eslint-disable no-await-in-loop */
    const analytics = await computeAnalytics(subset, accountObj);
    inserts.push({
      fingerprint: fp,
      data: analytics,
      engineVersion: ANALYTICS_PRESET_ENGINE_VERSION,
    });
  }

  let syncState = safeJson(row.mt_sync_state_json, {});
  if (!syncState || typeof syncState !== 'object') syncState = { v: 1 };
  syncState.presetMeta = buildPresetMeta(tradesMax, accountObj, auraAnalysisClosedDataKey);

  if (inserts.length === 0) {
    await executeQuery(
      `UPDATE aura_platform_connections SET mt_sync_state_json = ? WHERE user_id = ? AND platform_id = ?`,
      [JSON.stringify(syncState), userId, platformId],
    );
    if (isAuraDiagnosticsEnabled()) {
      safeMtLog(
        'aura_preset_warm_skip',
        { userId, platformId, skipped, trigger: reason },
        'info',
      );
    }
    return;
  }

  const next = putPresetEntries(blob, inserts);
  await executeQuery(
    `UPDATE aura_platform_connections SET analytics_presets_json = ?, mt_sync_state_json = ? WHERE user_id = ? AND platform_id = ?`,
    [JSON.stringify(next), JSON.stringify(syncState), userId, platformId],
  );

  if (isAuraDiagnosticsEnabled()) {
    safeMtLog(
      'aura_preset_warm_ok',
      { userId, platformId, computed: inserts.length, skipped, trigger: reason },
      'info',
    );
  }
}

function runPresetWarmSingleflight(executeQuery, userId, platformId, opts) {
  const k = `preset:${userId}:${platformId}`;
  if (inflightPresetWarm.has(k)) {
    return inflightPresetWarm.get(k);
  }
  const p = maybeWarmAnalyticsPresets(executeQuery, userId, platformId, opts)
    .catch((e) => {
      console.warn('[mtSyncCoordinator] preset warm failed:', e.message);
    })
    .finally(() => {
      inflightPresetWarm.delete(k);
    });
  inflightPresetWarm.set(k, p);
  return p;
}

/**
 * Fire-and-forget preset warm from DB cache (no MT roundtrip). Deduped + cooldown.
 */
function schedulePresetWarmAfterDbSync(executeQuery, userId, platformId, opts = {}) {
  setImmediate(() => {
    runPresetWarmSingleflight(executeQuery, userId, platformId, {
      ...opts,
      reason: opts.reason || 'db_sync',
    });
  });
}

/** Fills missing/stale preset rows; does not wipe last-good cache on failure. */
async function recomputePresetAnalytics(executeQuery, userId, platformId, _accountObj) {
  await maybeWarmAnalyticsPresets(executeQuery, userId, platformId, {
    bypassCooldown: true,
    reason: 'recomputePresetAnalytics',
  });
}

async function runBackgroundMt5BridgeSync(ctx) {
  const {
    executeQuery,
    userId,
    platformId,
    credentials,
  } = ctx;
  const requestId = ctx.requestId || crypto.randomUUID();

  if (!hasMtBridgeCredentials(credentials)) return;

  let connRow;
  try {
    const [r] = await executeQuery(
      `SELECT account_info, mt_sync_state_json FROM aura_platform_connections
       WHERE user_id = ? AND platform_id = ? LIMIT 1`,
      [userId, platformId],
    );
    connRow = r && r[0];
  } catch (e) {
    console.warn('[mtSyncCoordinator] load connection row:', e.message);
    return;
  }
  if (!connRow) return;

  let syncState = safeJson(connRow.mt_sync_state_json, {});
  if (!syncState || typeof syncState !== 'object') syncState = { v: 1 };

  const accRes = await performMt5Operation('account_snapshot', credentials, platformId, {
    trigger: 'platform_account_refresh',
    requestId,
  });

  if (accRes.ok && accRes.accountInfo) {
    await executeQuery(
      `UPDATE aura_platform_connections SET account_info = ?, last_sync = NOW()
       WHERE user_id = ? AND platform_id = ?`,
      [JSON.stringify(accRes.accountInfo), userId, platformId],
    );
    await executeQuery(
      `UPDATE aura_platform_connections SET analytics_presets_json = NULL WHERE user_id = ? AND platform_id = ?`,
      [userId, platformId],
    );
    syncState.lastAccountBgError = null;
  } else {
    safeMtLog('mt5_bg_account_failed', { platformId, code: accRes.code || null }, 'warn');
    syncState.lastAccountBgError = {
      at: new Date().toISOString(),
      code: accRes.code || null,
      message: String(accRes.error || '').slice(0, 240),
    };
  }

  const histRes = await fetchHistoryFromWorker(credentials, platformId, syncState, requestId);

  if (!histRes.ok) {
    safeMtLog('mt5_bg_history_failed', { platformId, code: histRes.code || null }, 'warn');
    syncState.lastHistoryBgError = {
      at: new Date().toISOString(),
      code: histRes.code || null,
      message: String(histRes.error || '').slice(0, 240),
    };
    await executeQuery(
      `UPDATE aura_platform_connections SET mt_sync_state_json = ? WHERE user_id = ? AND platform_id = ?`,
      [JSON.stringify(syncState), userId, platformId],
    );
    return;
  }

  syncState.lastHistoryBgError = null;

  const rawTrades = Array.isArray(histRes.trades) ? histRes.trades : [];
  const normalized = normalizeWorkerHistory(platformId, rawTrades);
  if (normalized.length) {
    await upsertTradeCacheRows(userId, platformId, normalized);
  }

  const merged = await loadCachedTradesForRange(userId, platformId, MAX_HISTORY_LOOKBACK_DAYS, null);
  const maxMs = maxCloseTimeMsFromTrades(merged);
  if (maxMs > 0) {
    syncState.lastDealCloseMs = maxMs;
  }
  syncState.lastHistorySyncAt = new Date().toISOString();
  syncState.lastHistoryRequestId = requestId;

  await executeQuery(
    `UPDATE aura_platform_connections SET mt_sync_state_json = ? WHERE user_id = ? AND platform_id = ?`,
    [JSON.stringify(syncState), userId, platformId],
  );

  const [accRows] = await executeQuery(
    `SELECT account_info FROM aura_platform_connections WHERE user_id = ? AND platform_id = ? LIMIT 1`,
    [userId, platformId],
  );
  const accForAnalytics = safeJson(accRows[0]?.account_info, accRes.ok ? accRes.accountInfo : null);
  if (!accForAnalytics) return;

  try {
    await runPresetWarmSingleflight(executeQuery, userId, platformId, {
      bypassCooldown: true,
      reason: 'mt5_bg_sync',
    });
  } catch (e) {
    console.warn('[mtSyncCoordinator] preset warm after bg sync:', e.message);
  }
}

function scheduleMt5BridgeBackgroundSync(executeQuery, userId, platformId, credentials, extra = {}) {
  if (!hasMtBridgeCredentials(credentials)) return false;
  const k = bridgeCacheKey(userId, platformId);
  if (inflightBg.has(k)) return false;
  const now = Date.now();
  const last = lastScheduleMs.get(k) || 0;
  if (!extra.bypassCooldown && now - last < COOLDOWN_MS) return false;
  lastScheduleMs.set(k, now);

  const p = runBackgroundMt5BridgeSync({
    executeQuery,
    userId,
    platformId,
    credentials,
    requestId: extra.requestId,
  })
    .catch((e) => console.warn('[mtSyncCoordinator] background sync:', e.message))
    .finally(() => {
      inflightBg.delete(k);
    });

  inflightBg.set(k, p);
  return true;
}

module.exports = {
  scheduleMt5BridgeBackgroundSync,
  runBackgroundMt5BridgeSync,
  bridgeCacheKey,
  COOLDOWN_MS,
  PRESET_WARM_COOLDOWN_MS,
  maybeWarmAnalyticsPresets,
  runPresetWarmSingleflight,
  schedulePresetWarmAfterDbSync,
  recomputePresetAnalytics,
};
