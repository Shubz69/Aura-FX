const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_TIMEOUT_MS = 20000;

function getBridgeConfig() {
  const baseUrl = process.env.TERMINALSYNC_WORKER_URL || process.env.PYTHON_WORKER_URL || '';
  const workerSecret = process.env.TERMINALSYNC_WORKER_SECRET || process.env.WORKER_SECRET || '';
  return { baseUrl, workerSecret };
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
      resolve({ ok: false, error: 'TERMINALSYNC_WORKER_URL_NOT_CONFIGURED' });
      return;
    }

    let endpoint;
    try {
      endpoint = new URL(`${normalized}${path}`);
    } catch {
      resolve({ ok: false, error: 'TERMINALSYNC_WORKER_URL_INVALID' });
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
          resolve({
            ok,
            statusCode: res.statusCode || 0,
            data: parsed,
            error: ok ? null : (parsed.detail || parsed.error || `HTTP_${res.statusCode}`),
          });
        });
      }
    );

    req.on('error', (err) => resolve({ ok: false, error: err.message || 'TERMINALSYNC_REQUEST_FAILED' }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'TERMINALSYNC_TIMEOUT' });
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
  const { baseUrl, workerSecret } = getBridgeConfig();
  if (!hasMtBridgeCredentials(credentials)) {
    return { ok: false, error: 'MT5_LOGIN_PASSWORD_SERVER_REQUIRED' };
  }
  const response = await postJson(baseUrl, '/api/v1/sync', toBridgePayload(credentials), workerSecret);
  if (!response.ok) return { ok: false, error: response.error || 'TERMINALSYNC_SYNC_FAILED' };

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
  const { baseUrl, workerSecret } = getBridgeConfig();
  if (!hasMtBridgeCredentials(credentials)) {
    return { ok: false, error: 'MT5_LOGIN_PASSWORD_SERVER_REQUIRED' };
  }
  const response = await postJson(baseUrl, '/api/v1/positions', toBridgePayload(credentials), workerSecret);
  if (!response.ok) return { ok: false, error: response.error || 'TERMINALSYNC_POSITIONS_FAILED' };

  const trades = Array.isArray(response.data?.trades) ? response.data.trades : [];
  return { ok: true, trades };
}

module.exports = {
  hasMtBridgeCredentials,
  syncAccount,
  getPositions,
};
