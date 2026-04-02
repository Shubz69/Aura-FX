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
const { hasMtBridgeCredentials, BRIDGE_ERROR } = require('./mtSyncProvider');
const { performMt5Operation } = require('./mtSyncService');
const { resolveBrokerDisplayInfo } = require('./mtBrokerServers');
const { ensurePlatformConnectionsColumns } = require('./platformConnectionMeta');
const { setAuraCorsHeaders, safeJsonParse } = require('./cors');
const { publicConnectError, safeMtLog } = require('./auraProductionUtils');

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
      credentials.investorPassword ??
      credentials.investor_password ??
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
  const keys = credentials && typeof credentials === 'object'
    ? Object.keys(credentials).filter((k) => !/password|pass|token|secret|investor/i.test(k)).slice(0, 12)
    : [];
  return {
    platformId,
    hasCredentialsObject: !!credentials && typeof credentials === 'object',
    credentialKeys: keys,
    hasLogin: !!safeString(credentials?.login),
    hasInvestorSecret: !!safeString(credentials?.password),
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
  if (code === 'MT5_WORKER_BUSY' || code === 'MT5_INSTANCE_BUSY') return 503;
  if (code === 'MT5_SERVER_INVALID' || code === 'MT5_LOGIN_FAILED') return 400;
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

async function validateCredentials(platformId, credentials) {
  switch (platformId) {
    case 'mt5':
    case 'mt4': {
      if (hasMtBridgeCredentials(credentials)) {
        return performMt5Operation('account_snapshot', credentials, platformId, {
          trigger: 'connect_validate',
        });
      }
      const { accountId, token } = credentials;
      if (!safeString(accountId) || !safeString(token)) {
        return {
          ok: false,
          error: 'Provide account login, investor password, and broker server.',
          missing: getMissingMtFields(credentials),
        };
      }
      return validateMetaApi(accountId, token);
    }
    default:
      return { ok: false, error: 'Only MetaTrader 4 and 5 are supported for Aura Analysis.' };
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
  await ensurePlatformConnectionsColumns(executeQuery);
  try {
    await executeQuery(
      `UPDATE aura_platform_connections SET connection_status = status WHERE connection_status IS NULL`
    );
  } catch (_) {
    /* optional until column exists */
  }
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
      `SELECT platform_id, account_label, account_info, connected_at, last_sync, status,
              broker_name, server_name, connection_status, last_sync_at, last_success_at,
              last_error_code, last_error_message
       FROM aura_platform_connections WHERE user_id = ? AND status IN ('active', 'connected')`,
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
        brokerName: r.broker_name || null,
        serverName: r.server_name || null,
        connectionStatus: r.connection_status || r.status || null,
        lastSyncAt: r.last_sync_at || r.last_sync || null,
        lastSuccessAt: r.last_success_at || null,
        lastErrorCode: r.last_error_code || null,
        lastErrorMessage: r.last_error_message || null,
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
    if (platformId !== 'mt4' && platformId !== 'mt5') {
      return res.status(400).json({ success: false, error: 'Only MetaTrader 4 and 5 connections are supported.' });
    }
    if (!hasMtBridgeCredentials(credentials)) {
      const missing = getMissingMtFields(credentials);
      if (!safeString(credentials.accountId) || !safeString(credentials.token)) {
        console.warn('Aura connect rejected MT payload', { ...toConnectDebugSummary(platformId, credentials), missing });
        return res.status(400).json({
          success: false,
          error: 'MetaTrader credentials are incomplete',
          missing,
          accepted: ['credentials.login', 'credentials.password (investor)', 'credentials.server'],
          legacyAccepted: ['credentials.accountId', 'credentials.token'],
        });
      }
    }

    let validation;
    try {
      validation = await validateCredentials(platformId, credentials);
    } catch (e) {
      console.error('Aura connect validation failed:', e?.code || e?.name || 'unknown');
      return res.status(500).json({ success: false, error: 'Could not validate connection. Please try again.' });
    }

    if (!validation.ok) {
      safeMtLog('connect_validation_failed', { platformId, code: validation.code || null });
      const statusCode = resolveConnectErrorStatus(validation);
      return res.status(statusCode).json({
        success: false,
        error: publicConnectError(validation.code, validation.error),
        code: validation.code || null,
        missing:
          validation.code === 'MT5_LOGIN_PASSWORD_SERVER_REQUIRED' && Array.isArray(validation.missing)
            ? validation.missing
            : undefined,
      });
    }

    const credEnc = encrypt(JSON.stringify(credentials));
    const accountInfoJson = JSON.stringify(validation.accountInfo || {});
    const label =
      credentials.accountId ||
      credentials.login ||
      (credentials.apiKey ? credentials.apiKey.slice(0, 8) + '...' : null) ||
      platformId;

    const brokerRow =
      platformId === 'mt5' && hasMtBridgeCredentials(credentials)
        ? resolveBrokerDisplayInfo(credentials.server)
        : { brokerName: null, serverName: null };

    await executeQuery(
      `INSERT INTO aura_platform_connections
         (user_id, platform_id, account_label, credentials_enc, account_info, status,
          broker_name, server_name, connection_status, last_sync_at, last_success_at,
          last_error_code, last_error_message)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 'connected', NOW(), NOW(), NULL, NULL)
       ON DUPLICATE KEY UPDATE
         credentials_enc = VALUES(credentials_enc),
         account_info = VALUES(account_info),
         account_label = VALUES(account_label),
         broker_name = VALUES(broker_name),
         server_name = VALUES(server_name),
         connection_status = VALUES(connection_status),
         last_sync_at = NOW(),
         last_success_at = NOW(),
         last_error_code = NULL,
         last_error_message = NULL,
         last_sync = NOW(),
         status = 'active'`,
      [
        userId,
        platformId,
        label,
        credEnc,
        accountInfoJson,
        brokerRow.brokerName,
        brokerRow.serverName || safeString(credentials.server) || null,
      ]
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
