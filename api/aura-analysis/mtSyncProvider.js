/**
 * MetaTrader read-only investor access — hosted sync service (no user VPS).
 * Uses MT5_WORKER_URL (or AURA_MT_SYNC_URL / legacy envs) + WORKER_SECRET (or legacy secrets).
 * Never log passwords or full credential objects.
 *
 * Integration contract: see ./mtWorkerAdapter.js
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');
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

const DEFAULT_TIMEOUT_MS = 20000;

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
  return { ok: false, code, error: message || code, ...extra };
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

function postJson(baseUrl, path, payload, workerSecret, timeoutMs = DEFAULT_TIMEOUT_MS) {
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
    const req = transport.request(
      {
        hostname: endpoint.hostname,
        port: endpoint.port || (endpoint.protocol === 'https:' ? 443 : 80),
        path: `${endpoint.pathname}${endpoint.search || ''}`,
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'x-worker-secret': workerSecret || '',
        },
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
      safeMtLog('worker_transport_error', { code: err?.code || err?.name || 'error' });
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

async function postJsonWithRetry(baseUrl, path, payload, workerSecret, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let r = await postJson(baseUrl, path, payload, workerSecret, timeoutMs);
  if (r.ok || !r.transportRetryable) return r;
  safeMtLog('worker_transport_retry', { path: String(path || '') });
  r = await postJson(baseUrl, path, payload, workerSecret, timeoutMs);
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
 */
async function syncAccount(credentials, platformId = 'mt5') {
  const configStatus = getSyncConfigStatus();
  if (!configStatus.ok) {
    return syncFailure(
      MT_SYNC_ERROR.CONFIG_MISSING,
      'MetaTrader data service is not configured',
      { missing: configStatus.missing },
    );
  }
  if (!hasMtInvestorCredentials(credentials)) {
    return syncFailure(
      'MT5_LOGIN_PASSWORD_SERVER_REQUIRED',
      'Account login, investor password, and broker server are required',
    );
  }

  let creds = { ...credentials };
  if (platformId === 'mt5') {
    const sv = validateMt5ServerInput(credentials.server);
    if (!sv.ok) {
      return syncFailure('MT5_SERVER_INVALID', sv.error || 'Invalid broker server name.');
    }
    creds.server = sv.server;
    const lv = validateMt5NumericLogin(credentials.login);
    if (!lv.ok) {
      return syncFailure('MT5_LOGIN_FAILED', lv.error);
    }
    creds.login = lv.loginStr;
  }

  const { baseUrl, workerSecret } = configStatus;
  const servers =
    platformId === 'mt5' ? buildServerAttemptList(creds.server) : [String(creds.server)];

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
    );
    lastResp = response;
    if (response.ok) {
      usedServer = serverTry;
      break;
    }
    const wc = response.workerCode || '';
    const wm = `${response.workerMessage || ''} ${response.error || ''}`;
    if (i < servers.length - 1 && shouldAttemptServerFallback(wc, wm)) {
      safeMtLog('mt5_server_fallback_attempt', { attempt: i + 1, workerCode: wc || null });
      continue;
    }
    break;
  }

  if (!lastResp || !lastResp.ok) {
    const outCode =
      lastResp?.workerCode || lastResp?.code || MT_SYNC_ERROR.SYNC_FAILED;
    return syncFailure(
      outCode,
      sanitizeWorkerMessageForClient(
        lastResp?.error,
        'Could not verify MetaTrader account',
      ),
      { statusCode: lastResp?.statusCode || 0 },
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
  };
}

/**
 * Fetch positions / deal history from sync service.
 */
async function getPositions(credentials, platformId = 'mt5', options = {}) {
  const configStatus = getSyncConfigStatus();
  if (!configStatus.ok) {
    return syncFailure(
      MT_SYNC_ERROR.CONFIG_MISSING,
      'MetaTrader data service is not configured',
      { missing: configStatus.missing },
    );
  }
  if (!hasMtInvestorCredentials(credentials)) {
    return syncFailure(
      'MT5_LOGIN_PASSWORD_SERVER_REQUIRED',
      'Account login, investor password, and broker server are required',
    );
  }

  let creds = { ...credentials };
  if (platformId === 'mt5') {
    const sv = validateMt5ServerInput(credentials.server);
    if (!sv.ok) {
      return syncFailure('MT5_SERVER_INVALID', sv.error || 'Invalid broker server name.');
    }
    creds.server = sv.server;
    const lv = validateMt5NumericLogin(credentials.login);
    if (!lv.ok) {
      return syncFailure('MT5_LOGIN_FAILED', lv.error);
    }
    creds.login = lv.loginStr;
  }

  const { baseUrl, workerSecret } = configStatus;
  const servers =
    platformId === 'mt5' ? buildServerAttemptList(creds.server) : [String(creds.server)];

  let lastResp = null;
  for (let i = 0; i < servers.length; i++) {
    const serverTry = servers[i];
    const payload = {
      ...toServicePayload(creds, platformId, serverTry),
      ...(options.days != null && Number.isFinite(Number(options.days))
        ? { days: Math.min(365, Math.max(1, Math.floor(Number(options.days)))) }
        : {}),
    };
    const response = await postJsonWithRetry(baseUrl, '/api/v1/positions', payload, workerSecret);
    lastResp = response;
    if (response.ok) break;
    const wc = response.workerCode || '';
    const wm = `${response.workerMessage || ''} ${response.error || ''}`;
    if (i < servers.length - 1 && shouldAttemptServerFallback(wc, wm)) {
      safeMtLog('mt5_positions_server_fallback', { attempt: i + 1, workerCode: wc || null });
      continue;
    }
    break;
  }

  if (!lastResp || !lastResp.ok) {
    const outCode = lastResp?.workerCode || lastResp?.code || MT_SYNC_ERROR.POSITIONS_FAILED;
    return syncFailure(
      outCode,
      sanitizeWorkerMessageForClient(lastResp?.error, 'Could not load MetaTrader history'),
      { statusCode: lastResp?.statusCode || 0 },
    );
  }

  const { rows, warnings } = extractPositionsPayload(lastResp.data, platformId);
  if (isAuraDiagnosticsEnabled()) {
    warnings.forEach((w) => console.warn('[mt-worker]', w));
  }
  return { ok: true, trades: rows };
}

/**
 * Fetch closed deal history (realized P&L) from POST /api/v1/history — not open positions.
 */
async function getDealHistory(credentials, platformId = 'mt5', options = {}) {
  const configStatus = getSyncConfigStatus();
  if (!configStatus.ok) {
    return syncFailure(
      MT_SYNC_ERROR.CONFIG_MISSING,
      'MetaTrader data service is not configured',
      { missing: configStatus.missing },
    );
  }
  if (!hasMtInvestorCredentials(credentials)) {
    return syncFailure(
      'MT5_LOGIN_PASSWORD_SERVER_REQUIRED',
      'Account login, investor password, and broker server are required',
    );
  }

  let creds = { ...credentials };
  if (platformId === 'mt5') {
    const sv = validateMt5ServerInput(credentials.server);
    if (!sv.ok) {
      return syncFailure('MT5_SERVER_INVALID', sv.error || 'Invalid broker server name.');
    }
    creds.server = sv.server;
    const lv = validateMt5NumericLogin(credentials.login);
    if (!lv.ok) {
      return syncFailure('MT5_LOGIN_FAILED', lv.error);
    }
    creds.login = lv.loginStr;
  }

  const { baseUrl, workerSecret } = configStatus;
  const servers =
    platformId === 'mt5' ? buildServerAttemptList(creds.server) : [String(creds.server)];

  let lastResp = null;
  for (let i = 0; i < servers.length; i++) {
    const serverTry = servers[i];
    const payload = {
      ...toServicePayload(creds, platformId, serverTry),
      ...(options.days != null && Number.isFinite(Number(options.days))
        ? { days: Math.min(365, Math.max(1, Math.floor(Number(options.days)))) }
        : {}),
    };
    const response = await postJsonWithRetry(baseUrl, '/api/v1/history', payload, workerSecret);
    lastResp = response;
    if (response.ok) break;
    const wc = response.workerCode || '';
    const wm = `${response.workerMessage || ''} ${response.error || ''}`;
    if (i < servers.length - 1 && shouldAttemptServerFallback(wc, wm)) {
      safeMtLog('mt5_history_server_fallback', { attempt: i + 1, workerCode: wc || null });
      continue;
    }
    break;
  }

  if (!lastResp || !lastResp.ok) {
    const outCode = lastResp?.workerCode || lastResp?.code || MT_SYNC_ERROR.POSITIONS_FAILED;
    return syncFailure(
      outCode,
      sanitizeWorkerMessageForClient(lastResp?.error, 'Could not load MetaTrader deal history'),
      { statusCode: lastResp?.statusCode || 0 },
    );
  }

  const { rows, warnings } = extractPositionsPayload(lastResp.data, platformId);
  if (isAuraDiagnosticsEnabled()) {
    warnings.forEach((w) => console.warn('[mt-worker]', w));
  }
  return { ok: true, trades: rows };
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
