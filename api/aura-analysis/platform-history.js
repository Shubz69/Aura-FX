/**
 * /api/aura-analysis/platform-history
 * GET — fetch trade history from a connected trading platform.
 * Query params: platformId, days (default 30, max MAX_HISTORY_LOOKBACK_DAYS)
 * Optional: from, to (YYYY-MM-DD, both required together) — slice metrics to inclusive UTC calendar range;
 *   lookback is expanded so data from `from` through today can be loaded.
 */
const path = require('path');
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const crypto = require('crypto');
const https = require('https');
const { hasMtBridgeCredentials } = require('./mtSyncProvider');
const { performMt5Operation } = require('./mtSyncService');
const { setAuraCorsHeaders, safeJsonParse } = require('./cors');
const { upsertTradeCacheRows, loadCachedTradesForRange } = require('./auraPlatformTradeCache');
const { listPlatformConnectionColumns, selectOrNull } = require('./platformConnectionMeta');
const {
  scheduleMt5BridgeBackgroundSync,
  schedulePresetWarmAfterDbSync,
} = require('./mtSyncCoordinator');
const {
  getPresetEntry,
  safeParsePresetBlob,
  ANALYTICS_PRESET_ENGINE_VERSION,
} = require('./auraAnalyticsPresets');
const {
  normalizeMtRow,
  dedupeNormalizedTrades,
  filterTradesByDays,
  rollupNetPnl,
  filterTradesByInclusiveDateRange,
  MAX_HISTORY_LOOKBACK_DAYS,
  extractExcursionFields,
} = require('./mtTradeNormalize');
const {
  publicHistoryError,
  isAuraDiagnosticsEnabled,
  buildHistoryDiagnostics,
  safeMtLog,
} = require('./auraProductionUtils');

function isHistoryPipelineLogEnabled() {
  return isAuraDiagnosticsEnabled() || String(process.env.AURA_HISTORY_PIPELINE_LOG || '').trim() === '1';
}

const HISTORY_STALE_MS = Math.max(
  180000,
  Math.min(7200000, parseInt(process.env.AURA_HISTORY_CACHE_STALE_MS || '720000', 10) || 720000),
);

function closedHistoryDataKey(trades, account) {
  const m = require(path.join(__dirname, '__analytics_node.cjs'));
  return m.auraAnalysisClosedDataKey(trades, account);
}

function historyCacheStale(mtSyncStateRaw) {
  const o = safeJsonParse(mtSyncStateRaw, {});
  const raw = o?.lastHistorySyncAt;
  if (!raw) return true;
  const ms = new Date(raw).getTime();
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms > HISTORY_STALE_MS;
}

function utcTodayYmd() {
  const n = new Date();
  const y = n.getUTCFullYear();
  const m = String(n.getUTCMonth() + 1).padStart(2, '0');
  const d = String(n.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** @returns {{ ok: true, range: { from: string, to: string } | null } | { ok: false, error: string }} */
function parseUtcDateRangeQuery(fromQ, toQ) {
  if ((fromQ == null || String(fromQ).trim() === '') && (toQ == null || String(toQ).trim() === '')) {
    return { ok: true, range: null };
  }
  const fromStr = String(fromQ || '').trim().slice(0, 10);
  const toStrRaw = String(toQ || '').trim().slice(0, 10);
  if (!fromStr || !toStrRaw) {
    return { ok: false, error: 'Both from and to are required (YYYY-MM-DD)' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStrRaw)) {
    return { ok: false, error: 'from and to must be YYYY-MM-DD' };
  }
  const todayStr = utcTodayYmd();
  const toStr = toStrRaw > todayStr ? todayStr : toStrRaw;
  if (fromStr > toStr) {
    return { ok: false, error: 'from must be on or before to' };
  }
  return { ok: true, range: { from: fromStr, to: toStr } };
}

function lookbackDaysFromFromYmd(fromYmd) {
  const [y, m, d] = fromYmd.split('-').map((x) => parseInt(x, 10));
  const fromMs = Date.UTC(y, m - 1, d);
  const span = Math.ceil((Date.now() - fromMs) / 86400000) + 1;
  return Math.min(MAX_HISTORY_LOOKBACK_DAYS, Math.max(1, span));
}

function applyOptionalDateSlice(trades, dateRange) {
  if (!dateRange?.from || !dateRange?.to || !Array.isArray(trades)) return trades;
  return filterTradesByInclusiveDateRange(trades, dateRange.from, dateRange.to);
}

function getEncKey() {
  const raw = process.env.PLATFORM_ENCRYPTION_KEY || process.env.JWT_SECRET || 'aura-fx-enc-key-pad-to-32chars!!';
  return crypto.createHash('sha256').update(raw).digest();
}

function decrypt(encrypted) {
  const [ivHex, tagHex, enc] = encrypted.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let out = decipher.update(enc, 'base64', 'utf8');
  out += decipher.final('utf8');
  return out;
}

function httpsGet(hostname, path, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers, timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try { resolve({ statusCode: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ statusCode: res.statusCode, body: {} }); }
        });
      }
    );
    req.on('error', (e) => resolve({ statusCode: 0, body: {}, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 0, body: {}, error: 'Timeout' }); });
    req.end();
  });
}

// ── Normalise a raw trade into a unified shape (legacy MetaAPI / exchanges) ─
function normaliseTrade(raw, platformId) {
  const sym = raw.symbol || raw.instrument || raw.pair || raw.s || '—';
  const openRaw = raw.openTime || raw.time || raw.transactTime || raw.createdTime || null;
  const closeRaw = raw.closeTime || raw.updateTime || null;
  const openTime = normalizeTimeValue(openRaw) || openRaw;
  const closeTime = normalizeTimeValue(closeRaw) || closeRaw;
  const baseId = raw.id ?? raw.orderId ?? raw.ticket ?? raw.dealId;
  const stableId =
    baseId != null && String(baseId).trim() !== ''
      ? String(baseId).trim()
      : `gen_${String(sym).replace(/\W/g, '')}_${String(closeTime || openTime || '').slice(0, 24)}`;
  const platLabel = platformId === 'mt4' ? 'MT4' : platformId === 'mt5' ? 'MT5' : String(platformId || 'MT');
  const slRaw = raw.stopLoss ?? raw.sl;
  const tpRaw = raw.takeProfit ?? raw.tp;
  const slNum = slRaw != null && slRaw !== '' ? parseFloat(slRaw) : NaN;
  const tpNum = tpRaw != null && tpRaw !== '' ? parseFloat(tpRaw) : NaN;
  const gross = parseFloat(raw.profit || raw.realizedPnl || raw.pnl || raw.realized_pnl || 0) || 0;
  const commission = parseFloat(raw.commission || raw.fee || 0) || 0;
  const swap = parseFloat(raw.swap || 0) || 0;
  const netPnl = rollupNetPnl(raw, gross, commission, swap);
  return {
    id: stableId,
    pair: sym,
    tradeStatus: 'closed',
    direction: raw.type === 0 || raw.side === 'BUY' || raw.positionType === 'long' ? 'buy' : 'sell',
    pnl: netPnl,
    grossPnl: gross,
    netPnl,
    volume: parseFloat(raw.volume || raw.qty || raw.executedQty || raw.size || raw.lots || 0),
    entryPrice: parseFloat(raw.entryPrice || raw.price || raw.openPrice || raw.price_open || 0),
    closePrice: parseFloat(raw.closePrice || raw.exitPrice || raw.avgPrice || raw.price_current || 0),
    openTime,
    closeTime,
    commission,
    swap,
    stopLoss: Number.isFinite(slNum) && slNum !== 0 ? slNum : undefined,
    takeProfit: Number.isFinite(tpNum) && tpNum !== 0 ? tpNum : undefined,
    sl: Number.isFinite(slNum) && slNum !== 0 ? slNum : undefined,
    tp: Number.isFinite(tpNum) && tpNum !== 0 ? tpNum : undefined,
    rMultiple: raw.rMultiple || null,
    session: detectSession(openRaw || closeRaw),
    platform: platLabel,
    created_at: closeTime || openTime || new Date().toISOString(),
    ...extractExcursionFields(raw),
  };
}

function detectSession(timeVal) {
  if (!timeVal) return 'Unknown';
  const h = new Date(timeVal).getUTCHours();
  if (h >= 0 && h < 8) return 'Asian';
  if (h >= 7 && h < 12) return 'London';
  if (h >= 12 && h < 17) return 'New York';
  if (h >= 17 && h < 21) return 'NY Close';
  return 'Asian';
}

function normalizeTimeValue(value) {
  if (value == null || value === '') return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

// ── MetaAPI history ────────────────────────────────────────────────────────
async function fetchMetaApiHistory(creds, days, platformId = 'mt5') {
  const endTime = new Date();
  const startTime = new Date(endTime - days * 86400 * 1000);
  const start = startTime.toISOString();
  const end = endTime.toISOString();

  const { statusCode, body, error } = await httpsGet(
    'mt-client-api-v1.london.agiliumtrade.ai',
    `/users/current/accounts/${encodeURIComponent(creds.accountId)}/history-deals/time/${encodeURIComponent(start)}/${encodeURIComponent(end)}`,
    { 'auth-token': creds.token, 'Content-Type': 'application/json' },
    20000
  );

  if (error || statusCode !== 200) {
    return { ok: false, error: error || body?.message || `MetaAPI ${statusCode}` };
  }

  const deals = Array.isArray(body) ? body : [];
  // MetaAPI returns deals; pair them into trades (entry + exit)
  const trades = deals
    .filter((d) => d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL' || d.entryType === 'DEAL_ENTRY_OUT')
    .map((d) => normaliseTrade({
      id: d.id,
      symbol: d.symbol,
      type: d.type === 'DEAL_TYPE_BUY' ? 0 : 1,
      profit: d.profit,
      volume: d.volume,
      entryPrice: d.price,
      openTime: d.time,
      commission: d.commission,
      swap: d.swap,
    }, platformId));

  return { ok: true, trades };
}

// ── Binance history ────────────────────────────────────────────────────────
async function fetchBinanceHistory(creds, days) {
  const ts = Date.now();
  const startTime = ts - days * 86400 * 1000;
  const qs = `timestamp=${ts}&startTime=${startTime}&limit=500`;
  const sig = crypto.createHmac('sha256', creds.apiSecret).update(qs).digest('hex');

  const { statusCode, body, error } = await httpsGet(
    'api.binance.com',
    `/api/v3/myTrades?${qs}&signature=${sig}`,
    { 'X-MBX-APIKEY': creds.apiKey },
    20000
  );

  if (error || statusCode !== 200) {
    return { ok: false, error: error || body?.msg || `Binance ${statusCode}` };
  }

  const raw = Array.isArray(body) ? body : [];
  const trades = raw.map((t) => normaliseTrade({
    id: t.id,
    symbol: t.symbol,
    side: t.isBuyer ? 'BUY' : 'SELL',
    realizedPnl: t.isMaker ? 0 : (parseFloat(t.quoteQty) - parseFloat(t.price) * parseFloat(t.qty)),
    qty: t.qty,
    price: t.price,
    time: t.time,
    commission: t.commission,
  }, 'Binance'));

  return { ok: true, trades };
}

// ── Bybit history ──────────────────────────────────────────────────────────
async function fetchBybitHistory(creds, days) {
  const ts = Date.now().toString();
  const recvWindow = '5000';
  const startTime = Date.now() - days * 86400 * 1000;
  const queryStr = `category=linear&limit=200&startTime=${startTime}`;
  const paramStr = `${ts}${creds.apiKey}${recvWindow}${queryStr}`;
  const sig = crypto.createHmac('sha256', creds.apiSecret).update(paramStr).digest('hex');

  const { statusCode, body, error } = await httpsGet(
    'api.bybit.com',
    `/v5/position/closed-pnl?${queryStr}`,
    {
      'X-BAPI-API-KEY': creds.apiKey,
      'X-BAPI-SIGN': sig,
      'X-BAPI-SIGN-METHOD': 'HMAC_SHA256',
      'X-BAPI-TIMESTAMP': ts,
      'X-BAPI-RECV-WINDOW': recvWindow,
    },
    20000
  );

  if (error || statusCode !== 200 || body.retCode !== 0) {
    return { ok: false, error: error || body?.retMsg || `Bybit ${statusCode}` };
  }

  const list = body.result?.list || [];
  const trades = list.map((t) => normaliseTrade({
    id: t.orderId,
    symbol: t.symbol,
    positionType: t.side === 'Buy' ? 'long' : 'short',
    realizedPnl: t.closedPnl,
    size: t.qty,
    entryPrice: t.avgEntryPrice,
    exitPrice: t.avgExitPrice,
    createdTime: t.createdTime,
  }, 'Bybit'));

  return { ok: true, trades };
}

async function fetchHistoryForPlatform(platformId, creds, days) {
  switch (platformId) {
    case 'mt5':
    case 'mt4':
      if (hasMtBridgeCredentials(creds)) {
        const result = await performMt5Operation('deal_history', creds, platformId, {
          days,
          trigger: 'history',
        });
        if (!result.ok) return { ok: false, error: result.error, code: result.code };
        const rawTrades = Array.isArray(result.trades) ? result.trades : [];
        if (isHistoryPipelineLogEnabled()) {
          safeMtLog('history_pipeline_worker_rows', { platformId, workerRowCount: rawTrades.length }, 'info');
        }
        const inputRows = rawTrades.length;
        const netPnlBreakdown = {
          explicit_net: 0,
          gross_includes_fees: 0,
          rollup_commission_swap: 0,
        };
        const mapped = [];
        let discardedRows = 0;
        for (let i = 0; i < rawTrades.length; i++) {
          const p = rawTrades[i];
          try {
            const hasSym = !!(p && (p.symbol || p.Symbol || p.SYMBOL || p.instrument || p.pair || p.s));
            if (!hasSym) {
              discardedRows++;
              continue;
            }
            const row = normalizeMtRow(p, platformId, i, netPnlBreakdown);
            const pair = String(row.pair || '').trim();
            if (!pair || pair === '—') {
              discardedRows++;
              continue;
            }
            mapped.push(row);
          } catch (_) {
            discardedRows++;
          }
        }
        const windowed = filterTradesByDays(mapped, days);
        const trades = dedupeNormalizedTrades(windowed);
        if (inputRows > 0 && mapped.length === 0) {
          safeMtLog(
            'history_pipeline_all_rows_discarded',
            {
              platformId,
              inputRows,
              discardedRows,
            },
            'warn',
          );
        } else if (inputRows > 0 && mapped.length > 0 && windowed.length === 0) {
          safeMtLog(
            'history_pipeline_day_window_empty',
            { platformId, mappedBeforeWindow: mapped.length, days },
            'info',
          );
        }
        if (isHistoryPipelineLogEnabled()) {
          safeMtLog(
            'history_pipeline_normalized',
            {
              platformId,
              mappedCount: mapped.length,
              afterDayFilter: windowed.length,
              afterDedupe: trades.length,
              discardedRows,
            },
            'info',
          );
        }
        let openCount = 0;
        let closedCount = 0;
        for (let j = 0; j < trades.length; j++) {
          if (trades[j].tradeStatus === 'open') openCount++;
          else closedCount++;
        }
        return {
          ok: true,
          trades,
          mtDiagnostics: {
            normalizedRowCount: inputRows,
            validAfterNormalize: mapped.length,
            discardedRows,
            openCount,
            closedCount,
            netPnlBreakdown,
          },
        };
      }
      return fetchMetaApiHistory(creds, days, platformId);
    case 'binance':
      return fetchBinanceHistory(creds, days);
    case 'bybit':
      return fetchBybitHistory(creds, days);
    default:
      return { ok: true, trades: [] };
  }
}

// ── Handler ────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  setAuraCorsHeaders(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { platformId, days: daysParam, from: fromQ, to: toQ, live: liveQ } = req.query || {};
  if (!platformId) return res.status(400).json({ success: false, error: 'platformId required' });

  const forceLive =
    liveQ === '1'
    || liveQ === 'true'
    || String(req.query?.refresh || '').toLowerCase() === 'live';

  const existingColumns = await listPlatformConnectionColumns(executeQuery).catch(() => new Set());

  const parsedRange = parseUtcDateRangeQuery(fromQ, toQ);
  if (!parsedRange.ok) return res.status(400).json({ success: false, error: parsedRange.error });
  const dateRange = parsedRange.range;

  let days = Math.min(MAX_HISTORY_LOOKBACK_DAYS, Math.max(1, parseInt(daysParam, 10) || 30));
  if (dateRange) {
    days = lookbackDaysFromFromYmd(dateRange.from);
  }

  const [rows] = await executeQuery(
    `SELECT ${selectOrNull(existingColumns, 'credentials_enc')},
            ${selectOrNull(existingColumns, 'account_info')},
            ${selectOrNull(existingColumns, 'analytics_presets_json')},
            ${selectOrNull(existingColumns, 'mt_sync_state_json')}
     FROM aura_platform_connections
     WHERE user_id = ? AND platform_id = ? AND status IN ('active', 'connected', 'error')`,
    [decoded.id, platformId],
  );
  if (!rows.length) {
    return res.status(200).json({
      success: true,
      trades: [],
      count: 0,
      platformId,
      days,
      stale: false,
      dataSource: 'none',
      code: 'PLATFORM_NOT_CONNECTED',
    });
  }

  let creds;
  try {
    creds = JSON.parse(decrypt(rows[0].credentials_enc));
  } catch {
    safeMtLog('history_decrypt_failed', { platformId });
    return res.status(200).json({
      success: true,
      trades: [],
      count: 0,
      platformId,
      days,
      stale: false,
      dataSource: 'none',
      code: 'CREDENTIAL_ERROR',
    });
  }

  const connRow = rows[0];
  const isMtBridge =
    (platformId === 'mt5' || platformId === 'mt4') && hasMtBridgeCredentials(creds);

  if (isMtBridge && !forceLive) {
    const cachedTrades = await loadCachedTradesForRange(decoded.id, platformId, days, dateRange);
    if (cachedTrades.length > 0) {
      const account = safeJsonParse(connRow.account_info, null);
      const analyticsInputFingerprint = closedHistoryDataKey(cachedTrades, account);
      const presetBlob = safeParsePresetBlob(connRow.analytics_presets_json);
      const precomputedAnalytics = getPresetEntry(
        presetBlob,
        analyticsInputFingerprint,
        ANALYTICS_PRESET_ENGINE_VERSION,
      );
      const revalidating = scheduleMt5BridgeBackgroundSync(
        executeQuery,
        decoded.id,
        platformId,
        creds,
      );
      if (!precomputedAnalytics) {
        schedulePresetWarmAfterDbSync(executeQuery, decoded.id, platformId, {
          reason: 'cache_fast_path_preset_miss',
        });
      }
      const stale = historyCacheStale(connRow.mt_sync_state_json);
      const body = {
        success: true,
        trades: cachedTrades,
        count: cachedTrades.length,
        platformId,
        days,
        ...(dateRange ? { dateFrom: dateRange.from, dateTo: dateRange.to } : {}),
        stale,
        dataSource: 'cache',
        cacheServedStale: stale,
        revalidating,
        precomputedAnalytics: precomputedAnalytics || undefined,
        analyticsInputFingerprint,
      };
      if (isAuraDiagnosticsEnabled()) {
        body.diagnostics = buildHistoryDiagnostics({
          dataSource: 'cache',
          stale,
          normalizedRowCount: cachedTrades.length,
          validTradeRows: cachedTrades.length,
          discardedRows: 0,
          openCount: cachedTrades.filter((t) => t.tradeStatus === 'open').length,
          closedCount: cachedTrades.filter((t) => t.tradeStatus !== 'open').length,
          netPnlBreakdown: {},
        });
      }
      if (isHistoryPipelineLogEnabled()) {
        safeMtLog(
          'history_pipeline_response',
          {
            platformId,
            returnedTradeCount: body.count,
            days,
            dataSource: 'cache',
            revalidating,
          },
          'info',
        );
      }
      return res.status(200).json(body);
    }
  }

  const result = await fetchHistoryForPlatform(platformId, creds, days);

  if (!result.ok) {
    safeMtLog('history_live_failed', { platformId, code: result.code || null });
    const stale = await loadCachedTradesForRange(decoded.id, platformId, days, dateRange);
    if (stale.length) {
      let openCount = 0;
      let closedCount = 0;
      for (let i = 0; i < stale.length; i++) {
        if (stale[i].tradeStatus === 'open') openCount++;
        else closedCount++;
      }
      const body = {
        success: true,
        trades: stale,
        count: stale.length,
        platformId,
        days,
        ...(dateRange ? { dateFrom: dateRange.from, dateTo: dateRange.to } : {}),
        stale: true,
        dataSource: 'cache',
        cacheServedStale: true,
      };
      if (isAuraDiagnosticsEnabled()) {
        body.diagnostics = buildHistoryDiagnostics({
          dataSource: 'cache',
          stale: true,
          normalizedRowCount: stale.length,
          validTradeRows: stale.length,
          discardedRows: 0,
          openCount,
          closedCount,
          netPnlBreakdown: {},
        });
      }
      return res.status(200).json(body);
    }
    const revalidatingEmpty =
      isMtBridge &&
      scheduleMt5BridgeBackgroundSync(executeQuery, decoded.id, platformId, creds);
    safeMtLog('history_live_empty_fallback', { platformId, code: result.code || null });
    return res.status(200).json({
      success: true,
      trades: [],
      count: 0,
      platformId,
      days,
      ...(dateRange ? { dateFrom: dateRange.from, dateTo: dateRange.to } : {}),
      stale: true,
      dataSource: 'unavailable',
      cacheServedStale: false,
      revalidating: revalidatingEmpty,
      code: result.code || 'HISTORY_UNAVAILABLE',
      error: publicHistoryError(result.code, result.error),
    });
  }

  await upsertTradeCacheRows(decoded.id, platformId, result.trades);

  if (isMtBridge) {
    schedulePresetWarmAfterDbSync(executeQuery, decoded.id, platformId, {
      reason: 'platform_history_live_ok',
    });
  }

  const slicedTrades = applyOptionalDateSlice(result.trades, dateRange);
  const body = {
    success: true,
    trades: slicedTrades,
    count: slicedTrades.length,
    platformId,
    days,
    ...(dateRange ? { dateFrom: dateRange.from, dateTo: dateRange.to } : {}),
    stale: false,
    dataSource: 'live',
    cacheServedStale: false,
  };
  if (isAuraDiagnosticsEnabled() && result.mtDiagnostics) {
    body.diagnostics = buildHistoryDiagnostics({
      dataSource: 'live',
      stale: false,
      normalizedRowCount: result.mtDiagnostics.normalizedRowCount,
      validTradeRows: result.trades.length,
      discardedRows: result.mtDiagnostics.discardedRows,
      openCount: result.mtDiagnostics.openCount,
      closedCount: result.mtDiagnostics.closedCount,
      netPnlBreakdown: result.mtDiagnostics.netPnlBreakdown,
    });
  }

  if (isHistoryPipelineLogEnabled()) {
    safeMtLog(
      'history_pipeline_response',
      {
        platformId,
        returnedTradeCount: body.count,
        days,
        dataSource: body.dataSource,
      },
      'info',
    );
  }

  return res.status(200).json(body);
};
