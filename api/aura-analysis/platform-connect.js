/**
 * /api/aura-analysis/platform-connect
 * Manage trading platform connections for Aura Analysis.
 * Credentials are AES-256-GCM encrypted before storing in DB.
 * GET    — list user's active connections
 * POST   — connect a platform (validate creds + store encrypted)
 * DELETE — disconnect a platform
 */
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const crypto = require('crypto');
const https = require('https');
const { hasMtBridgeCredentials, syncAccount, BRIDGE_ERROR } = require('./terminalSyncBridge');
const { setAuraCorsHeaders, safeJsonParse } = require('./cors');

// ── Encryption helpers ─────────────────────────────────────────────────────
function safeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizePlatformId(platformId) {
  return safeString(platformId).toLowerCase();
}

function normalizeMtCredentials(credentials = {}) {
  return {
    login: safeString(
      credentials.login ??
      credentials.accountLogin ??
      credentials.username ??
      credentials.user
    ),
    password: safeString(
      credentials.password ??
      credentials.pass ??
      credentials.passwd
    ),
    server: safeString(
      credentials.server ??
      credentials.brokerServer ??
      credentials.broker
    ),
    accountId: safeString(credentials.accountId),
    token: safeString(credentials.token),
  };
}

function sanitizeConnectRequest(payload) {
  const body = payload || {};
  const platformId = normalizePlatformId(body.platformId || body.platform || body.platform_id);
  const rawCredentials =
    (body.credentials && typeof body.credentials === 'object' && body.credentials) ||
    (body.credential && typeof body.credential === 'object' && body.credential) ||
    {};
  const credentials = platformId === 'mt5' || platformId === 'mt4'
    ? normalizeMtCredentials(rawCredentials)
    : rawCredentials;

  return { platformId, credentials };
}

function parseRequestBody(rawBody) {
  if (!rawBody) return {};
  if (typeof rawBody === 'object') return rawBody;
  if (typeof rawBody === 'string') return safeJsonParse(rawBody, {});
  return {};
}

function getMissingMtFields(credentials) {
  const missing = [];
  if (!safeString(credentials?.login)) missing.push('credentials.login');
  if (!safeString(credentials?.password)) missing.push('credentials.password');
  if (!safeString(credentials?.server)) missing.push('credentials.server');
  return missing;
}

function toConnectDebugSummary(platformId, credentials) {
  return {
    platformId,
    hasCredentialsObject: !!credentials && typeof credentials === 'object',
    credentialKeys: credentials && typeof credentials === 'object' ? Object.keys(credentials).slice(0, 12) : [],
    hasLogin: !!safeString(credentials?.login),
    hasPassword: !!safeString(credentials?.password),
    hasServer: !!safeString(credentials?.server),
    hasMetaAccountId: !!safeString(credentials?.accountId),
    hasMetaToken: !!safeString(credentials?.token),
  };
}

function resolveConnectErrorStatus(validation) {
  const code = String(validation?.code || '');
  const error = String(validation?.error || '');
  if (code === BRIDGE_ERROR.CONFIG_MISSING || code === BRIDGE_ERROR.WORKER_URL_NOT_CONFIGURED) return 503;
  if (code === BRIDGE_ERROR.TIMEOUT) return 504;
  if (code === BRIDGE_ERROR.UNAUTHORIZED_SECRET) return 502;
  if (code === BRIDGE_ERROR.WORKER_URL_INVALID) return 500;
  if (
    code === 'MT5_LOGIN_PASSWORD_SERVER_REQUIRED' ||
    error === 'MT5_LOGIN_PASSWORD_SERVER_REQUIRED'
  ) return 400;
  return 400;
}

function getEncKey() {
  const raw = process.env.PLATFORM_ENCRYPTION_KEY || process.env.JWT_SECRET || 'aura-fx-enc-key-pad-to-32chars!!';
  return crypto.createHash('sha256').update(raw).digest(); // always 32 bytes
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncKey(), iv);
  let enc = cipher.update(plaintext, 'utf8', 'base64');
  enc += cipher.final('base64');
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc}`;
}

function decrypt(encrypted) {
  const [ivHex, tagHex, enc] = encrypted.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let out = decipher.update(enc, 'base64', 'utf8');
  out += decipher.final('utf8');
  return out;
}

// ── Platform validators ────────────────────────────────────────────────────

function httpsGet(hostname, path, headers = {}, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const req = https.request(
      { hostname, path, method: 'GET', headers, timeout: timeoutMs },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ statusCode: res.statusCode, body: {} });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ statusCode: 0, body: {}, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ statusCode: 0, body: {}, error: 'Timeout' }); });
    req.end();
  });
}

async function validateMetaApi(accountId, token) {
  const { statusCode, body, error } = await httpsGet(
    'mt-client-api-v1.london.agiliumtrade.ai',
    `/users/current/accounts/${encodeURIComponent(accountId)}/account-information`,
    { 'auth-token': token, 'Content-Type': 'application/json' }
  );
  if (error) return { ok: false, error };
  if (statusCode !== 200) return { ok: false, error: body.message || `MetaAPI error ${statusCode}` };
  return {
    ok: true,
    accountInfo: {
      balance: body.balance || 0,
      equity: body.equity || 0,
      margin: body.margin || 0,
      freeMargin: body.freeMargin || 0,
      currency: body.currency || 'USD',
      name: body.name || '',
      server: body.broker || body.server || '',
      leverage: body.leverage || 0,
      platform: accountId.toUpperCase().startsWith('MT4') ? 'MT4' : 'MT5',
    },
  };
}

async function validateBinance(apiKey, apiSecret) {
  const ts = Date.now();
  const qs = `timestamp=${ts}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  const { statusCode, body, error } = await httpsGet(
    'api.binance.com',
    `/api/v3/account?${qs}&signature=${sig}`,
    { 'X-MBX-APIKEY': apiKey }
  );
  if (error) return { ok: false, error };
  if (statusCode !== 200) return { ok: false, error: body.msg || `Binance error ${statusCode}` };
  const usdtBalance = (body.balances || []).find(b => b.asset === 'USDT');
  return {
    ok: true,
    accountInfo: {
      balance: usdtBalance ? parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked) : 0,
      currency: 'USDT',
      platform: 'Binance',
      canTrade: body.canTrade,
    },
  };
}

async function validateBybit(apiKey, apiSecret) {
  const ts = Date.now().toString();
  const recvWindow = '5000';
  const paramStr = `${ts}${apiKey}${recvWindow}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(paramStr).digest('hex');
  const { statusCode, body, error } = await httpsGet(
    'api.bybit.com',
    `/v5/account/wallet-balance?accountType=UNIFIED`,
    {
      'X-BAPI-API-KEY': apiKey,
      'X-BAPI-SIGN': sig,
      'X-BAPI-SIGN-METHOD': 'HMAC_SHA256',
      'X-BAPI-TIMESTAMP': ts,
      'X-BAPI-RECV-WINDOW': recvWindow,
    }
  );
  if (error) return { ok: false, error };
  if (statusCode !== 200 || body.retCode !== 0) {
    return { ok: false, error: body.retMsg || `Bybit error ${statusCode}` };
  }
  const list = body.result?.list?.[0];
  return {
    ok: true,
    accountInfo: {
      balance: parseFloat(list?.totalWalletBalance || 0),
      equity: parseFloat(list?.totalEquity || 0),
      currency: 'USDT',
      platform: 'Bybit',
    },
  };
}

async function validateKraken(apiKey, apiSecret) {
  const nonce = Date.now().toString();
  const postData = `nonce=${nonce}`;
  const path = '/0/private/Balance';
  const message = nonce + postData;
  const secretBuf = Buffer.from(apiSecret, 'base64');
  const hash = crypto.createHash('sha256').update(message).digest();
  const hmac = crypto.createHmac('sha512', secretBuf).update(path + hash).digest('base64');

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.kraken.com',
        path,
        method: 'POST',
        headers: {
          'API-Key': apiKey,
          'API-Sign': hmac,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 12000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const body = JSON.parse(data);
            if (body.error && body.error.length > 0) {
              resolve({ ok: false, error: body.error[0] });
            } else {
              const usdBalance = parseFloat(body.result?.ZUSD || body.result?.USD || 0);
              resolve({ ok: true, accountInfo: { balance: usdBalance, currency: 'USD', platform: 'Kraken' } });
            }
          } catch {
            resolve({ ok: false, error: 'Parse error' });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });
    req.write(postData);
    req.end();
  });
}

// Platforms not yet implemented with live validation return ok:true with minimal info
async function validateGeneric(platformId) {
  return { ok: true, accountInfo: { platform: platformId, status: 'connected', note: 'Manual verification required' } };
}

async function validateCredentials(platformId, credentials) {
  switch (platformId) {
    case 'mt5':
    case 'mt4': {
      // Prefer TerminalSyncc bridge credentials when supplied.
      if (hasMtBridgeCredentials(credentials)) {
        return syncAccount(credentials);
      }
      const { accountId, token } = credentials;
      if (!accountId || !token) {
        return { ok: false, error: 'For MT5/MT4 provide login/password/server or MetaAPI accountId/token' };
      }
      return validateMetaApi(accountId, token);
    }
    case 'binance': {
      const { apiKey, apiSecret } = credentials;
      if (!apiKey || !apiSecret) return { ok: false, error: 'apiKey and apiSecret required for Binance' };
      return validateBinance(apiKey, apiSecret);
    }
    case 'bybit': {
      const { apiKey, apiSecret } = credentials;
      if (!apiKey || !apiSecret) return { ok: false, error: 'apiKey and apiSecret required for Bybit' };
      return validateBybit(apiKey, apiSecret);
    }
    case 'kraken': {
      const { apiKey, apiSecret } = credentials;
      if (!apiKey || !apiSecret) return { ok: false, error: 'apiKey and apiSecret required for Kraken' };
      return validateKraken(apiKey, apiSecret);
    }
    default:
      return validateGeneric(platformId);
  }
}

// ── DB setup ───────────────────────────────────────────────────────────────
async function ensureTable() {
  await executeQuery(`
    CREATE TABLE IF NOT EXISTS aura_platform_connections (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      platform_id VARCHAR(50) NOT NULL,
      account_label VARCHAR(255),
      credentials_enc TEXT NOT NULL,
      account_info JSON,
      connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_sync TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      status VARCHAR(20) DEFAULT 'active',
      UNIQUE KEY uq_user_platform (user_id, platform_id)
    )
  `);
}

// ── Handler ────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  setAuraCorsHeaders(req, res, 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const userId = decoded.id;

  try {
    await ensureTable();
  } catch (e) {
    console.error('Table ensure failed:', e.message);
    return res.status(500).json({ success: false, error: 'CONNECTIONS_TABLE_INIT_FAILED' });
  }

  // ── GET — list connections ─────────────────────────────────────────────
  if (req.method === 'GET') {
    const [rows] = await executeQuery(
      `SELECT platform_id, account_label, account_info, connected_at, last_sync, status
       FROM aura_platform_connections WHERE user_id = ? AND status = 'active'`,
      [userId]
    );
    return res.status(200).json({
      success: true,
      connections: rows.map((r) => ({
        platformId: r.platform_id,
        label: r.account_label,
        accountInfo: safeJsonParse(r.account_info, null),
        connectedAt: r.connected_at,
        lastSync: r.last_sync,
        status: r.status,
      })),
    });
  }

  // ── POST — connect platform ────────────────────────────────────────────
  if (req.method === 'POST') {
    const parsedBody = parseRequestBody(req.body);
    const { platformId, credentials } = sanitizeConnectRequest(parsedBody);
    if (!platformId || !credentials || typeof credentials !== 'object') {
      console.warn('Aura connect rejected invalid payload', toConnectDebugSummary(platformId, credentials));
      return res.status(400).json({ success: false, error: 'platformId and credentials required' });
    }
    if ((platformId === 'mt5' || platformId === 'mt4') && !hasMtBridgeCredentials(credentials)) {
      const missing = getMissingMtFields(credentials);
      // Keep support for MetaAPI fallback, but return explicit field-level feedback for MT bridge payloads.
      if (!safeString(credentials.accountId) || !safeString(credentials.token)) {
        console.warn('Aura connect rejected MT payload', { ...toConnectDebugSummary(platformId, credentials), missing });
        return res.status(400).json({
          success: false,
          error: 'MT5/MT4 credentials are incomplete',
          missing,
          accepted: ['credentials.login', 'credentials.password', 'credentials.server'],
          fallbackAccepted: ['credentials.accountId', 'credentials.token'],
        });
      }
    }

    let validation;
    try {
      validation = await validateCredentials(platformId, credentials);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Validation error: ' + e.message });
    }

    if (!validation.ok) {
      console.warn('Aura connect validation failed', { ...toConnectDebugSummary(platformId, credentials), reason: validation.error });
      const statusCode = resolveConnectErrorStatus(validation);
      return res.status(statusCode).json({
        success: false,
        error: validation.error,
        code: validation.code || null,
        missing: Array.isArray(validation.missing) ? validation.missing : undefined,
      });
    }

    const credEnc = encrypt(JSON.stringify(credentials));
    const accountInfoJson = JSON.stringify(validation.accountInfo || {});
    const label =
      credentials.accountId ||
      credentials.login ||
      (credentials.apiKey ? credentials.apiKey.slice(0, 8) + '...' : null) ||
      platformId;

    await executeQuery(
      `INSERT INTO aura_platform_connections
         (user_id, platform_id, account_label, credentials_enc, account_info, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE
         credentials_enc = VALUES(credentials_enc),
         account_info = VALUES(account_info),
         account_label = VALUES(account_label),
         last_sync = NOW(),
         status = 'active'`,
      [userId, platformId, label, credEnc, accountInfoJson]
    );

    return res.status(200).json({ success: true, accountInfo: validation.accountInfo });
  }

  // ── DELETE — disconnect ────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const platformId = req.query?.platformId || req.body?.platformId;
    if (!platformId) return res.status(400).json({ success: false, error: 'platformId required' });

    await executeQuery(
      `UPDATE aura_platform_connections SET status = 'disconnected'
       WHERE user_id = ? AND platform_id = ?`,
      [userId, platformId]
    );
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
};
