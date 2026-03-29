/**
 * MetaTrader read-only investor access — hosted sync service (no user VPS).
 * POSTs login + investor password + server + platform to AURA_MT_SYNC_URL or legacy TERMINALSYNC_WORKER_URL.
 * Never log passwords or full credential objects.
 *
 * Integration contract (request/response shapes): see ./mtWorkerAdapter.js
 * Note: BRIDGE_ERROR / hasMtBridgeCredentials names are legacy aliases for API error codes
 * and investor-credential checks — not a separate bridge runtime.
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
    String(process.env.AURA_MT_SYNC_URL || '').trim()
    || String(process.env.TERMINALSYNC_WORKER_URL || '').trim()
    || String(process.env.PYTHON_WORKER_URL || '').trim();
  const workerSecret =
    String(process.env.AURA_MT_SYNC_SECRET || '').trim()
    || String(process.env.TERMINALSYNC_WORKER_SECRET || '').trim()
    || String(process.env.WORKER_SECRET || '').trim();
  return { baseUrl, workerSecret };
}

function getSyncConfigStatus() {
  const { baseUrl, workerSecret } = getSyncConfig();
  const missing = [];
  if (!baseUrl) missing.push('AURA_MT_SYNC_URL|TERMINALSYNC_WORKER_URL|PYTHON_WORKER_URL');
  if (!workerSecret) missing.push('AURA_MT_SYNC_SECRET|TERMINALSYNC_WORKER_SECRET|WORKER_SECRET');
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

function postJson(baseUrl, path, payload, workerSecret, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) {
      resolve(syncFailure(
        MT_SYNC_ERROR.WORKER_URL_NOT_CONFIGURED,
        'MetaTrader data service URL is not configured'
      ));
      return;
    }

    let endpoint;
    try {
      endpoint = new URL(`${normalized}${path}`);
    } catch {
      resolve(syncFailure(
        MT_SYNC_ERROR.WORKER_URL_INVALID,
        'MetaTrader data service URL is invalid'
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
          try { parsed = JSON.parse(raw || '{}'); } catch (_) {}
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          if (!ok && (res.statusCode === 401 || res.statusCode === 403)) {
            safeMtLog('worker_auth_rejected', { statusCode: res.statusCode || 0 });
            resolve(syncFailure(
              MT_SYNC_ERROR.UNAUTHORIZED_SECRET,
              sanitizeWorkerMessageForClient(
                parsed.detail || parsed.error,
                'MetaTrader data service authentication failed'
              ),
              { statusCode: res.statusCode || 0 }
            ));
            return;
          }
          resolve({
            ok,
            statusCode: res.statusCode || 0,
            data: parsed,
            code: ok ? null : MT_SYNC_ERROR.REQUEST_FAILED,
            error: ok
              ? null
              : sanitizeWorkerMessageForClient(
                parsed.detail || parsed.error || `HTTP_${res.statusCode}`,
                'MetaTrader data service request failed'
              ),
          });
        });
      }
    );

    req.on('error', (err) => {
      safeMtLog('worker_transport_error', { code: err?.code || err?.name || 'error' });
      resolve(syncFailure(
        MT_SYNC_ERROR.REQUEST_FAILED,
        'MetaTrader data service request failed'
      ));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(syncFailure(MT_SYNC_ERROR.TIMEOUT, 'MetaTrader data service request timed out'));
    });
    req.write(body);
    req.end();
  });
}

function hasMtInvestorCredentials(credentials) {
  return !!(credentials && credentials.login && credentials.password && credentials.server);
}

/** @deprecated use hasMtInvestorCredentials */
const hasMtBridgeCredentials = hasMtInvestorCredentials;

function toServicePayload(credentials, platformId) {
  const platform = platformId === 'mt4' ? 'MT4' : 'MT5';
  const loginRaw = String(credentials.login ?? '').trim();
  const login =
    /^\d+$/.test(loginRaw) && Number.isSafeInteger(Number(loginRaw))
      ? Number(loginRaw)
      : loginRaw;
  return {
    login,
    password: String(credentials.password || ''),
    server: String(credentials.server || ''),
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
      { missing: configStatus.missing }
    );
  }
  if (!hasMtInvestorCredentials(credentials)) {
    return syncFailure('MT5_LOGIN_PASSWORD_SERVER_REQUIRED', 'Account login, investor password, and broker server are required');
  }
  const { baseUrl, workerSecret } = configStatus;
  const response = await postJson(
    baseUrl,
    '/api/v1/sync',
    toServicePayload(credentials, platformId),
    workerSecret
  );
  if (!response.ok) {
    const code = response.code || MT_SYNC_ERROR.SYNC_FAILED;
    return syncFailure(
      code,
      sanitizeWorkerMessageForClient(
        response.error,
        'Could not verify MetaTrader account'
      ),
      { statusCode: response.statusCode || 0 }
    );
  }

  const data = extractSyncAccountObject(response.data);
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
      server: String(credentials.server || data.server || '').slice(0, 255),
      login: String(credentials.login || ''),
      leverage: Math.max(0, Math.round(safeFiniteNumber(data.leverage ?? data.Leverage, 0))),
      platform: plat,
      providerSource: 'mt-investor-sync',
      lastSyncedAt: new Date().toISOString(),
    },
  };
}

/**
 * Fetch positions / deal history from sync service (shape expected by platform-history normaliser).
 * @param {object} [options]
 * @param {number} [options.days] — optional lookback hint for the worker (if supported).
 */
async function getPositions(credentials, platformId = 'mt5', options = {}) {
  const configStatus = getSyncConfigStatus();
  if (!configStatus.ok) {
    return syncFailure(
      MT_SYNC_ERROR.CONFIG_MISSING,
      'MetaTrader data service is not configured',
      { missing: configStatus.missing }
    );
  }
  if (!hasMtInvestorCredentials(credentials)) {
    return syncFailure('MT5_LOGIN_PASSWORD_SERVER_REQUIRED', 'Account login, investor password, and broker server are required');
  }
  const { baseUrl, workerSecret } = configStatus;
  const payload = {
    ...toServicePayload(credentials, platformId),
    ...(options.days != null && Number.isFinite(Number(options.days))
      ? { days: Math.min(365, Math.max(1, Math.floor(Number(options.days)))) }
      : {}),
  };
  const response = await postJson(
    baseUrl,
    '/api/v1/positions',
    payload,
    workerSecret
  );
  if (!response.ok) {
    const code = response.code || MT_SYNC_ERROR.POSITIONS_FAILED;
    return syncFailure(
      code,
      sanitizeWorkerMessageForClient(
        response.error,
        'Could not load MetaTrader history'
      ),
      { statusCode: response.statusCode || 0 }
    );
  }

  const { rows, warnings } = extractPositionsPayload(response.data, platformId);
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
  BRIDGE_ERROR,
  MT_SYNC_ERROR,
  getSyncConfigStatus,
};
