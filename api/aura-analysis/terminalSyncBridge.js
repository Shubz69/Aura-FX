const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 20000;
const BRIDGE_ERROR = {
  CONFIG_MISSING: 'TERMINALSYNC_CONFIG_MISSING',
  WORKER_URL_NOT_CONFIGURED: 'TERMINALSYNC_WORKER_URL_NOT_CONFIGURED',
  WORKER_URL_INVALID: 'TERMINALSYNC_WORKER_URL_INVALID',
  REQUEST_FAILED: 'TERMINALSYNC_REQUEST_FAILED',
  TIMEOUT: 'TERMINALSYNC_TIMEOUT',
  UNAUTHORIZED_SECRET: 'TERMINALSYNC_UNAUTHORIZED_SECRET',
  SYNC_FAILED: 'TERMINALSYNC_SYNC_FAILED',
  POSITIONS_FAILED: 'TERMINALSYNC_POSITIONS_FAILED',
};

function getBridgeConfig() {
  const baseUrl = process.env.TERMINALSYNC_WORKER_URL || process.env.PYTHON_WORKER_URL || '';
  const workerSecret = process.env.TERMINALSYNC_WORKER_SECRET || process.env.WORKER_SECRET || '';
  return { baseUrl, workerSecret };
}

function getBridgeConfigStatus() {
  const { baseUrl, workerSecret } = getBridgeConfig();
  const missing = [];
  if (!String(baseUrl || '').trim()) missing.push('TERMINALSYNC_WORKER_URL|PYTHON_WORKER_URL');
  if (!String(workerSecret || '').trim()) missing.push('TERMINALSYNC_WORKER_SECRET|WORKER_SECRET');
  return {
    ok: missing.length === 0,
    missing,
    baseUrl,
    workerSecret,
  };
}

function bridgeFailure(code, message, extra = {}) {
  return { ok: false, code, error: message || code, ...extra };
}

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  // Allow passing host:port without protocol in env by assuming http.
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

function postJson(baseUrl, path, payload, workerSecret, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const normalized = normalizeBaseUrl(baseUrl);
    if (!normalized) {
      resolve(bridgeFailure(
        BRIDGE_ERROR.WORKER_URL_NOT_CONFIGURED,
        'MT5 bridge worker URL is not configured'
      ));
      return;
    }

    let endpoint;
    try {
      endpoint = new URL(`${normalized}${path}`);
    } catch {
      resolve(bridgeFailure(
        BRIDGE_ERROR.WORKER_URL_INVALID,
        'MT5 bridge worker URL is invalid'
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
            resolve(bridgeFailure(
              BRIDGE_ERROR.UNAUTHORIZED_SECRET,
              parsed.detail || parsed.error || 'MT5 bridge authentication failed',
              { statusCode: res.statusCode || 0, data: parsed }
            ));
            return;
          }
          resolve({
            ok,
            statusCode: res.statusCode || 0,
            data: parsed,
            code: ok ? null : BRIDGE_ERROR.REQUEST_FAILED,
            error: ok ? null : (parsed.detail || parsed.error || `HTTP_${res.statusCode}`),
          });
        });
      }
    );

    req.on('error', (err) => resolve(bridgeFailure(
      BRIDGE_ERROR.REQUEST_FAILED,
      err.message || 'MT5 bridge request failed'
    )));
    req.on('timeout', () => {
      req.destroy();
      resolve(bridgeFailure(BRIDGE_ERROR.TIMEOUT, 'MT5 bridge request timed out'));
    });
    req.write(body);
    req.end();
  });
}

function hasMtBridgeCredentials(credentials) {
  return !!(credentials && credentials.login && credentials.password && credentials.server);
}

function toBridgePayload(credentials) {
  return {
    login: Number(credentials.login),
    password: String(credentials.password || ''),
    server: String(credentials.server || ''),
  };
}

async function syncAccount(credentials) {
  const configStatus = getBridgeConfigStatus();
  if (!configStatus.ok) {
    return bridgeFailure(
      BRIDGE_ERROR.CONFIG_MISSING,
      'MT5 bridge is not configured in API runtime environment',
      { missing: configStatus.missing }
    );
  }
  const { baseUrl, workerSecret } = configStatus;
  if (!hasMtBridgeCredentials(credentials)) {
    return bridgeFailure('MT5_LOGIN_PASSWORD_SERVER_REQUIRED', 'MT5 login/password/server are required');
  }
  const response = await postJson(baseUrl, '/api/v1/sync', toBridgePayload(credentials), workerSecret);
  if (!response.ok) {
    const code = response.code || BRIDGE_ERROR.SYNC_FAILED;
    return bridgeFailure(code, response.error || 'MT5 account sync failed', { statusCode: response.statusCode || 0 });
  }

  const data = response.data?.data || {};
  return {
    ok: true,
    accountInfo: {
      balance: Number(data.balance || 0),
      equity: Number(data.equity || 0),
      profit: Number(data.profit || 0),
      margin: Number(data.margin || 0),
      currency: data.currency || 'USD',
      platform: 'MT5',
      bridge: 'TerminalSyncc',
      server: credentials.server,
      login: Number(credentials.login),
    },
  };
}

async function getPositions(credentials) {
  const configStatus = getBridgeConfigStatus();
  if (!configStatus.ok) {
    return bridgeFailure(
      BRIDGE_ERROR.CONFIG_MISSING,
      'MT5 bridge is not configured in API runtime environment',
      { missing: configStatus.missing }
    );
  }
  const { baseUrl, workerSecret } = configStatus;
  if (!hasMtBridgeCredentials(credentials)) {
    return bridgeFailure('MT5_LOGIN_PASSWORD_SERVER_REQUIRED', 'MT5 login/password/server are required');
  }
  const response = await postJson(baseUrl, '/api/v1/positions', toBridgePayload(credentials), workerSecret);
  if (!response.ok) {
    const code = response.code || BRIDGE_ERROR.POSITIONS_FAILED;
    return bridgeFailure(code, response.error || 'MT5 positions fetch failed', { statusCode: response.statusCode || 0 });
  }

  const trades = Array.isArray(response.data?.trades) ? response.data.trades : [];
  return { ok: true, trades };
}

module.exports = {
  hasMtBridgeCredentials,
  syncAccount,
  getPositions,
  BRIDGE_ERROR,
};
