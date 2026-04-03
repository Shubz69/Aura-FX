/**
 * MetaTrader read-only investor access — hosted sync service (no user VPS).
 * Uses MT5_WORKER_URL (or AURA_MT_SYNC_URL / legacy envs) + WORKER_SECRET (or legacy secrets).
 * Never log passwords or full credential objects.
 *
 * Integration contract: see ./mtWorkerAdapter.js
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const {
  recordMt5SyncAttempt,
  recordMt5SyncFailure,
} = require('../utils/systemMetrics');
const ERROR_CODES = require('../utils/errorCodes');
const {
  extractPositionsPayload,
  extractSyncAccountObject,
  validateSyncSnapshotShape,
} = require('./mtWorkerAdapter');
const {
  sanitizeWorkerMessageForClient,
  safeMtLog,
  isAuraDiagnosticsEnabled,
} = require('./auraProductionUtils');
const {
  validateMt5ServerInput,
  buildServerAttemptList,
  shouldAttemptServerFallback,
} = require('./mtBrokerServers');
const { MAX_HISTORY_LOOKBACK_DAYS } = require('./mtTradeNormalize');

const DEFAULT_TIMEOUT_MS = 20000;
/** Connection Hub validate — worker may need longer than default; avoid double-timeout retry (20s+20s). */
const CONNECT_VALIDATE_TIMEOUT_MS = 48000;

/** Client-facing codes — keep TERMINALSYNC_* strings for existing frontend error mapping. */
const MT_SYNC_ERROR = {
  CONFIG_MISSING: 'TERMINALSYNC_CONFIG_MISSING',
  WORKER_URL_NOT_CONFIGURED: 'TERMINALSYNC_WORKER_URL_NOT_CONFIGURED',
  WORKER_URL_INVALID: 'TERMINALSYNC_WORKER_URL_INVALID',
  REQUEST_FAILED: 'TERMINALSYNC_REQUEST_FAILED',
  TIMEOUT: 'TERMINALSYNC_TIMEOUT',
  UNAUTHORIZED_SECRET: 'TERMINALSYNC_UNAUTHORIZED_SECRET',
  SYNC_FAILED: 'TERMINALSYNC_SYNC_FAILED',
  POSITIONS_FAILED: 'TERMINALSYNC_POSITIONS_FAILED',
};

const BRIDGE_ERROR = MT_SYNC_ERROR;

function getSyncConfig() {
  const baseUrl =
    String(process.env.MT5_WORKER_URL || '').trim()
    || String(process.env.AURA_MT_SYNC_URL || '').trim()
    || String(process.env.TERMINALSYNC_WORKER_URL || '').trim()
    || String(process.env.PYTHON_WORKER_URL || '').trim();
  const workerSecret =
    String(process.env.WORKER_SECRET || '').trim()
    || String(process.env.AURA_MT_SYNC_SECRET || '').trim()
    || String(process.env.TERMINALSYNC_WORKER_SECRET || '').trim();
  return { baseUrl, workerSecret };
}

function getSyncConfigStatus() {
  const { baseUrl, workerSecret } = getSyncConfig();
  const missing = [];
  if (!baseUrl) {
    missing.push('MT5_WORKER_URL|AURA_MT_SYNC_URL|TERMINALSYNC_WORKER_URL|PYTHON_WORKER_URL');
  }
  if (!workerSecret) missing.push('WORKER_SECRET|AURA_MT_SYNC_SECRET|TERMINALSYNC_WORKER_SECRET');
  return { ok: missing.length === 0, missing, baseUrl, workerSecret };
}

function syncFailure(code, message, extra = {}) {
  const errCode =
    extra.errorCode ||
    (String(code || '').includes('MT5_LOGIN') || code === 'MT5_LOGIN_FAILED'
      ? ERROR_CODES.MT5_LOGIN_FAILED
      : String(code || '').includes('SERVER') || code === 'MT5_SERVER_INVALID'
        ? ERROR_CODES.MT5_SERVER_INVALID
        : code === ERROR_CODES.MT5_NO_HISTORY
          ? ERROR_CODES.MT5_NO_HISTORY
          : code || ERROR_CODES.SYSTEM_ERROR);
  const { errorCode: _ignored, ...rest } = extra;
  return { ok: false, code, error: message || code, ...rest, errorCode: errCode };
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

function extractDetailCode(detail) {
  if (detail && typeof detail === 'object' && !Array.isArray(detail) && detail.code) {
    return String(detail.code);
  }
  return null;
}

function extractDetailMessage(detail) {
  if (detail == null) return '';
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object' && !Array.isArray(detail)) {
    return String(detail.message || detail.msg || '');
  }
  return '';
}

function postJson(baseUrl, path, payload, workerSecret, timeoutMs = DEFAULT_TIMEOUT_MS, requestId = null) {
  return new Promise((resolve) => {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) {
      resolve(syncFailure(
        MT_SYNC_ERROR.WORKER_URL_NOT_CONFIGURED,
        'MetaTrader data service URL is not configured',
        { transportRetryable: false },
      ));
      return;
    }

    let endpoint;
    try {
      endpoint = new URL(`${normalized}${path}`);
    } catch {
      resolve(syncFailure(
        MT_SYNC_ERROR.WORKER_URL_INVALID,
        'MetaTrader data service URL is invalid',
        { transportRetryable: false },
      ));
      return;
    }

    const body = JSON.stringify(payload || {});
    const transport = endpoint.protocol === 'https:' ? https : http;
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-worker-secret': workerSecret || '',
    };
    if (requestId) headers['X-Request-ID'] = String(requestId);
    const req = transport.request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
        path: `${endpoint.pathname}${endpoint.search || ''}`,
        method: 'POST',
        timeout: timeoutMs,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed = {};
          try {
            parsed = JSON.parse(raw || '{}');
          } catch (_) {
            parsed = {};
          }
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          const detail = parsed.detail;
          const workerCode = extractDetailCode(detail);
          const workerMessage = extractDetailMessage(detail);

          if (!ok && (res.statusCode === 401 || res.statusCode === 403)) {
            safeMtLog('worker_auth_rejected', { statusCode: res.statusCode || 0 });
            resolve({
              ok: false,
              statusCode: res.statusCode || 0,
              data: parsed,
              code: MT_SYNC_ERROR.UNAUTHORIZED_SECRET,
              error: sanitizeWorkerMessageForClient(
                workerMessage || parsed.error,
                'MetaTrader data service authentication failed',
              ),
              workerCode: workerCode || MT_SYNC_ERROR.UNAUTHORIZED_SECRET,
              workerMessage: workerMessage || '',
              transportRetryable: false,
            });
            return;
          }

          const clientErr =
            workerMessage || extractDetailMessage(parsed) || parsed.error || `HTTP_${res.statusCode}`;

          resolve({
            ok,
            statusCode: res.statusCode || 0,
            data: parsed,
            code: ok ? null : (workerCode || MT_SYNC_ERROR.REQUEST_FAILED),
            error: ok
              ? null
              : sanitizeWorkerMessageForClient(clientErr, 'MetaTrader data service request failed'),
            workerCode: workerCode || null,
            workerMessage: workerMessage || null,
            transportRetryable: false,
          });
        });
      },
    );

    req.on('error', (err) => {
      const code = err?.code || err?.name || 'error';
      // Transient network closes are common; retry may succeed — avoid warning noise in production logs.
      const transient = ['ECONNRESET', 'ECONNABORTED', 'EPIPE', 'ECANCELED', 'ENETUNREACH'].includes(
        String(code),
      );
      safeMtLog('worker_transport_error', { code }, transient ? 'info' : 'warn');
      resolve(syncFailure(
        MT_SYNC_ERROR.REQUEST_FAILED,
        'MetaTrader data service request failed',
        { transportRetryable: true },
      ));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(syncFailure(MT_SYNC_ERROR.TIMEOUT, 'MetaTrader data service request timed out', {
        transportRetryable: true,
      }));
    });
    req.write(body);
    req.end();
  });
}

async function postJsonWithRetry(
  baseUrl,
  path,
  payload,
  workerSecret,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  requestId = null,
  options = {},
) {
  const { skipRetryOnTimeout = true } = options;
  let r = await postJson(baseUrl, path, payload, workerSecret, timeoutMs, requestId);
  if (r.ok || !r.transportRetryable) return r;
  /* Doubling 20s timeouts produced ~41s connects and 504s; retry transient sockets only. */
  if (skipRetryOnTimeout && r.code === MT_SYNC_ERROR.TIMEOUT) {
    delete r.transportRetryable;
    return r;
  }
  safeMtLog('worker_transport_retry', { path: String(path || '') }, 'info');
  r = await postJson(baseUrl, path, payload, workerSecret, timeoutMs, requestId);
  if (r.transportRetryable) delete r.transportRetryable;
  return r;
}

function hasMtInvestorCredentials(credentials) {
  if (!credentials) return false;
  const login = String(credentials.login ?? '').trim();
  const password = String(credentials.password ?? '');
  const server = String(credentials.server ?? '').trim();
  return !!(login && password && server);
}

/** @deprecated use hasMtInvestorCredentials */
const hasMtBridgeCredentials = hasMtInvestorCredentials;

function validateMt5NumericLogin(login) {
  const s = String(login ?? '').trim();
  if (!/^\d+$/.test(s)) {
    return { ok: false, error: 'MT5 account login must be numeric.' };
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) {
    return { ok: false, error: 'MT5 account login is invalid.' };
  }
  return { ok: true, loginStr: s, loginNum: n };
}

function toServicePayload(credentials, platformId, serverOverride) {
  const platform = platformId === 'mt4' ? 'MT4' : 'MT5';
  const server =
    serverOverride != null ? String(serverOverride) : String(credentials.server || '');
  let login;
  if (platform === 'MT5') {
    const lv = validateMt5NumericLogin(credentials.login);
    login = lv.ok ? lv.loginNum : Number(String(credentials.login || '').trim()) || 0;
  } else {
    const loginRaw = String(credentials.login ?? '').trim();
    login =
      /^\d+$/.test(loginRaw) && Number.isSafeInteger(Number(loginRaw))
        ? Number(loginRaw)
        : loginRaw;
  }
  return {
    login,
    password: String(credentials.password || ''),
    server,
    platform,
  };
}

function normalizePlatformLabel(platformId) {
  return platformId === 'mt4' ? 'MT4' : 'MT5';
}

function safeFiniteNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Validate investor credentials and return account snapshot fields for UI + cache.
 * @param {object} [options] requestId for correlation; forwarded to worker as X-Request-ID
 */
async function syncAccount(credentials, platformId = 'mt5', options = {}) {
  const requestId = options.requestId || crypto.randomUUID();
  const connectValidate = options.trigger === 'connect_validate';
  const syncTimeoutMs = connectValidate ? CONNECT_VALIDATE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  const configStatus = getSyncConfigStatus();
  if (!configStatus.ok) {
    return syncFailure(
      MT_SYNC_ERROR.CONFIG_MISSING,
      'MetaTrader data service is not configured',
      { missing: configStatus.missing, requestId, errorCode: ERROR_CODES.SYSTEM_ERROR },
    );
  }
  if (!hasMtInvestorCredentials(credentials)) {
    return syncFailure(
      'MT5_LOGIN_PASSWORD_SERVER_REQUIRED',
      'Account login, investor password, and broker server are required',
      { requestId, errorCode: ERROR_CODES.SYSTEM_ERROR },
    );
  }

  let creds = { ...credentials };
  if (platformId === 'mt5') {
    const sv = validateMt5ServerInput(credentials.server);
    if (!sv.ok) {
      return syncFailure('MT5_SERVER_INVALID', sv.error || 'Invalid broker server name.', {
        requestId,
        errorCode: ERROR_CODES.MT5_SERVER_INVALID,
      });
    }
    creds.server = sv.server;
    const lv = validateMt5NumericLogin(credentials.login);
    if (!lv.ok) {
      return syncFailure('MT5_LOGIN_FAILED', lv.error, { requestId, errorCode: ERROR_CODES.MT5_LOGIN_FAILED });
    }
    creds.login = lv.loginStr;
  }

  recordMt5SyncAttempt();

  const { baseUrl, workerSecret } = configStatus;
  const fullServerList =
    platformId === 'mt5' ? buildServerAttemptList(creds.server) : [String(creds.server)];
  /* During connect, one attempt keeps total time under the serverless limit; user can retry with a different server. */
  const servers = connectValidate ? fullServerList.slice(0, 1) : fullServerList;

  let lastResp = null;
  let usedServer = creds.server;

  for (let i = 0; i < servers.length; i++) {
    const serverTry = servers[i];
    const payload = toServicePayload(creds, platformId, serverTry);
    const response = await postJsonWithRetry(
      baseUrl,
      '/api/v1/sync',
      payload,
      workerSecret,
      syncTimeoutMs,
      requestId,
      { skipRetryOnTimeout: true },
    );
    lastResp = response;
    if (response.ok) {
      usedServer = serverTry;
      break;
    }
    const wc = response.workerCode || '';
    const wm = `${response.workerMessage || ''} ${response.error || ''}`;
    if (i < servers.length - 1 && shouldAttemptServerFallback(wc, wm)) {
      safeMtLog('mt5_server_fallback_attempt', { attempt: i + 1, workerCode: wc || null }, 'info');
      continue;
    }
    break;
  }

  if (!lastResp || !lastResp.ok) {
    recordMt5SyncFailure();
    const outCode =
      lastResp?.workerCode || lastResp?.code || MT_SYNC_ERROR.SYNC_FAILED;
    return syncFailure(
      outCode,
      sanitizeWorkerMessageForClient(
        lastResp?.error,
        'Could not verify MetaTrader account',
      ),
      {
        statusCode: lastResp?.statusCode || 0,
        requestId,
        errorCode:
          String(outCode).includes('LOGIN') || outCode === 'MT5_LOGIN_FAILED'
            ? ERROR_CODES.MT5_LOGIN_FAILED
            : String(outCode).includes('SERVER') || outCode === 'MT5_SERVER_INVALID'
              ? ERROR_CODES.MT5_SERVER_INVALID
              : ERROR_CODES.SYSTEM_ERROR,
      },
    );
  }

  const data = extractSyncAccountObject(lastResp.data);
  if (isAuraDiagnosticsEnabled()) {
    validateSyncSnapshotShape(data).forEach((w) => console.warn('[mt-worker] sync:', w));
  }
  const plat = normalizePlatformLabel(platformId);
  const ml = safeFiniteNumber(data.marginLevel ?? data.MarginLevel, NaN);
  return {
    ok: true,
    accountInfo: {
      balance: safeFiniteNumber(data.balance ?? data.Balance, 0),
      equity: safeFiniteNumber(data.equity ?? data.Equity, 0),
      profit: safeFiniteNumber(data.profit ?? data.Profit, 0),
      margin: safeFiniteNumber(data.margin ?? data.Margin, 0),
      freeMargin: safeFiniteNumber(data.freeMargin ?? data.FreeMargin ?? data.margin_free, 0),
      marginLevel: Number.isFinite(ml) && ml > 0 ? ml : undefined,
      currency: String(data.currency || data.Currency || 'USD').slice(0, 12) || 'USD',
      name: String(data.name || data.Name || '').slice(0, 255),
      server: String(usedServer || data.server || '').slice(0, 255),
      login: String(creds.login || ''),
      leverage: Math.max(0, Math.round(safeFiniteNumber(data.leverage ?? data.Leverage, 0))),
      platform: plat,
      providerSource: 'mt-investor-sync',
      lastSyncedAt: new Date().toISOString(),
    },
    requestId,
  };
}

/**
 * Fetch positions / deal history from sync service.
 */
async function getPositions(credentials, platformId = 'mt5', options = {}) {
  const requestId = options.requestId || crypto.randomUUID();
  const configStatus = getSyncConfigStatus();
  if (!configStatus.ok) {
    return syncFailure(
      MT_SYNC_ERROR.CONFIG_MISSING,
      'MetaTrader data service is not configured',
      { missing: configStatus.missing, requestId, errorCode: ERROR_CODES.SYSTEM_ERROR },
    );
  }
  if (!hasMtInvestorCredentials(credentials)) {
    return syncFailure(
      'MT5_LOGIN_PASSWORD_SERVER_REQUIRED',
      'Account login, investor password, and broker server are required',
      { requestId, errorCode: ERROR_CODES.SYSTEM_ERROR },
    );
  }

  let creds = { ...credentials };
  if (platformId === 'mt5') {
    const sv = validateMt5ServerInput(credentials.server);
    if (!sv.ok) {
      return syncFailure('MT5_SERVER_INVALID', sv.error || 'Invalid broker server name.', {
        requestId,
        errorCode: ERROR_CODES.MT5_SERVER_INVALID,
      });
    }
    creds.server = sv.server;
    const lv = validateMt5NumericLogin(credentials.login);
    if (!lv.ok) {
      return syncFailure('MT5_LOGIN_FAILED', lv.error, { requestId, errorCode: ERROR_CODES.MT5_LOGIN_FAILED });
    }
    creds.login = lv.loginStr;
  }

  recordMt5SyncAttempt();

  const { baseUrl, workerSecret } = configStatus;
  const servers =
    platformId === 'mt5' ? buildServerAttemptList(creds.server) : [String(creds.server)];

  let lastResp = null;
  for (let i = 0; i < servers.length; i++) {
    const serverTry = servers[i];
    const payload = {
      ...toServicePayload(creds, platformId, serverTry),
      ...(options.days != null && Number.isFinite(Number(options.days))
        ? { days: Math.min(MAX_HISTORY_LOOKBACK_DAYS, Math.max(1, Math.floor(Number(options.days)))) }
        : {}),
    };
    const response = await postJsonWithRetry(
      baseUrl,
      '/api/v1/positions',
      payload,
      workerSecret,
      DEFAULT_TIMEOUT_MS,
      requestId,
    );
    lastResp = response;
    if (response.ok) break;
    const wc = response.workerCode || '';
    const wm = `${response.workerMessage || ''} ${response.error || ''}`;
    if (i < servers.length - 1 && shouldAttemptServerFallback(wc, wm)) {
      safeMtLog('mt5_positions_server_fallback', { attempt: i + 1, workerCode: wc || null }, 'info');
      continue;
    }
    break;
  }

  if (!lastResp || !lastResp.ok) {
    recordMt5SyncFailure();
    const outCode = lastResp?.workerCode || lastResp?.code || MT_SYNC_ERROR.POSITIONS_FAILED;
    return syncFailure(
      outCode,
      sanitizeWorkerMessageForClient(lastResp?.error, 'Could not load MetaTrader history'),
      {
        statusCode: lastResp?.statusCode || 0,
        requestId,
        errorCode: ERROR_CODES.SYSTEM_ERROR,
      },
    );
  }

  const { rows, warnings } = extractPositionsPayload(lastResp.data, platformId);
  if (isAuraDiagnosticsEnabled()) {
    warnings.forEach((w) => console.info('[mt-worker]', w));
  }
  return { ok: true, trades: rows, requestId };
}

/**
 * Fetch closed deal history (realized P&L) from POST /api/v1/history — not open positions.
 */
async function getDealHistory(credentials, platformId = 'mt5', options = {}) {
  const requestId = options.requestId || crypto.randomUUID();
  const configStatus = getSyncConfigStatus();
  if (!configStatus.ok) {
    return syncFailure(
      MT_SYNC_ERROR.CONFIG_MISSING,
      'MetaTrader data service is not configured',
      { missing: configStatus.missing, requestId, errorCode: ERROR_CODES.SYSTEM_ERROR },
    );
  }
  if (!hasMtInvestorCredentials(credentials)) {
    return syncFailure(
      'MT5_LOGIN_PASSWORD_SERVER_REQUIRED',
      'Account login, investor password, and broker server are required',
      { requestId, errorCode: ERROR_CODES.SYSTEM_ERROR },
    );
  }

  let creds = { ...credentials };
  if (platformId === 'mt5') {
    const sv = validateMt5ServerInput(credentials.server);
    if (!sv.ok) {
      return syncFailure('MT5_SERVER_INVALID', sv.error || 'Invalid broker server name.', {
        requestId,
        errorCode: ERROR_CODES.MT5_SERVER_INVALID,
      });
    }
    creds.server = sv.server;
    const lv = validateMt5NumericLogin(credentials.login);
    if (!lv.ok) {
      return syncFailure('MT5_LOGIN_FAILED', lv.error, { requestId, errorCode: ERROR_CODES.MT5_LOGIN_FAILED });
    }
    creds.login = lv.loginStr;
  }

  recordMt5SyncAttempt();

  const { baseUrl, workerSecret } = configStatus;
  const servers =
    platformId === 'mt5' ? buildServerAttemptList(creds.server) : [String(creds.server)];

  let lastResp = null;
  for (let i = 0; i < servers.length; i++) {
    const serverTry = servers[i];
    const payload = {
      ...toServicePayload(creds, platformId, serverTry),
      ...(options.days != null && Number.isFinite(Number(options.days))
        ? { days: Math.min(MAX_HISTORY_LOOKBACK_DAYS, Math.max(1, Math.floor(Number(options.days)))) }
        : {}),
    };
    const response = await postJsonWithRetry(
      baseUrl,
      '/api/v1/history',
      payload,
      workerSecret,
      DEFAULT_TIMEOUT_MS,
      requestId,
    );
    lastResp = response;
    if (response.ok) break;
    const wc = response.workerCode || '';
    const wm = `${response.workerMessage || ''} ${response.error || ''}`;
    if (i < servers.length - 1 && shouldAttemptServerFallback(wc, wm)) {
      safeMtLog('mt5_history_server_fallback', { attempt: i + 1, workerCode: wc || null }, 'info');
      continue;
    }
    break;
  }

  if (!lastResp || !lastResp.ok) {
    recordMt5SyncFailure();
    const outCode = lastResp?.workerCode || lastResp?.code || MT_SYNC_ERROR.POSITIONS_FAILED;
    return syncFailure(
      outCode,
      sanitizeWorkerMessageForClient(lastResp?.error, 'Could not load MetaTrader deal history'),
      {
        statusCode: lastResp?.statusCode || 0,
        requestId,
        errorCode: ERROR_CODES.SYSTEM_ERROR,
      },
    );
  }

  const { rows, warnings } = extractPositionsPayload(lastResp.data, platformId);
  if (isAuraDiagnosticsEnabled()) {
    warnings.forEach((w) => console.info('[mt-worker]', w));
  }
  if (isAuraDiagnosticsEnabled() || String(process.env.AURA_HISTORY_PIPELINE_LOG || '').trim() === '1') {
    safeMtLog('history_worker_extract', { platformId, rowCount: rows.length }, 'info');
  }
  const out = { ok: true, trades: rows, requestId };
  if (rows.length === 0) {
    out.noticeCode = ERROR_CODES.MT5_NO_HISTORY;
  }
  return out;
}

module.exports = {
  hasMtInvestorCredentials,
  hasMtBridgeCredentials,
  syncAccount,
  getPositions,
  getDealHistory,
  BRIDGE_ERROR,
  MT_SYNC_ERROR,
  getSyncConfigStatus,
};
