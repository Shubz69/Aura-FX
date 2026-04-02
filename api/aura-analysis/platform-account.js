/**
 * /api/aura-analysis/platform-account
 * GET — fetch live account information from a connected trading platform.
 * Query param: platformId
 */
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const crypto = require('crypto');
const https = require('https');
const { hasMtBridgeCredentials } = require('./mtSyncProvider');
const { performMt5Operation } = require('./mtSyncService');
const { ensurePlatformConnectionsColumns, patchConnectionRow } = require('./platformConnectionMeta');
const { setAuraCorsHeaders, safeJsonParse } = require('./cors');
const { publicAccountLiveError, safeMtLog, isAuraDiagnosticsEnabled } = require('./auraProductionUtils');

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

function httpsGet(hostname, path, headers = {}, timeoutMs = 12000) {
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

// ── Platform fetchers ──────────────────────────────────────────────────────

async function fetchMetaApiAccount(creds, platformId = 'mt5') {
  const { statusCode, body, error } = await httpsGet(
    'mt-client-api-v1.london.agiliumtrade.ai',
    `/users/current/accounts/${encodeURIComponent(creds.accountId)}/account-information`,
    { 'auth-token': creds.token, 'Content-Type': 'application/json' }
  );
  if (error || statusCode !== 200) {
    return { ok: false, error: error || body?.message || `MetaAPI ${statusCode}` };
  }
  const plat =
    platformId === 'mt4'
      ? 'MT4'
      : platformId === 'mt5'
        ? 'MT5'
        : String(creds.accountId || '').toUpperCase().startsWith('MT4')
          ? 'MT4'
          : 'MT5';
  return {
    ok: true,
    data: {
      balance: body.balance || 0,
      equity: body.equity || 0,
      margin: body.margin || 0,
      freeMargin: body.freeMargin || 0,
      marginLevel: body.marginLevel || 0,
      currency: body.currency || 'USD',
      name: body.name || '',
      server: body.broker || body.server || '',
      leverage: body.leverage || 0,
      platform: plat,
      tradeAllowed: body.tradeAllowed,
      providerSource: 'metaapi',
    },
  };
}

async function fetchBinanceAccount(creds) {
  const ts = Date.now();
  const qs = `timestamp=${ts}`;
  const sig = crypto.createHmac('sha256', creds.apiSecret).update(qs).digest('hex');
  const { statusCode, body, error } = await httpsGet(
    'api.binance.com',
    `/api/v3/account?${qs}&signature=${sig}`,
    { 'X-MBX-APIKEY': creds.apiKey }
  );
  if (error || statusCode !== 200) return { ok: false, error: error || body?.msg || `Binance ${statusCode}` };
  const usdt = (body.balances || []).find((b) => b.asset === 'USDT');
  const btc = (body.balances || []).find((b) => b.asset === 'BTC');
  return {
    ok: true,
    data: {
      balance: usdt ? parseFloat(usdt.free) + parseFloat(usdt.locked) : 0,
      equity: usdt ? parseFloat(usdt.free) + parseFloat(usdt.locked) : 0,
      currency: 'USDT',
      btcBalance: btc ? parseFloat(btc.free) + parseFloat(btc.locked) : 0,
      canTrade: body.canTrade,
      platform: 'Binance',
      totalAssets: (body.balances || []).filter((b) => parseFloat(b.free) + parseFloat(b.locked) > 0).length,
    },
  };
}

async function fetchBybitAccount(creds) {
  const ts = Date.now().toString();
  const recvWindow = '5000';
  const paramStr = `${ts}${creds.apiKey}${recvWindow}`;
  const sig = crypto.createHmac('sha256', creds.apiSecret).update(paramStr).digest('hex');
  const { statusCode, body, error } = await httpsGet(
    'api.bybit.com',
    `/v5/account/wallet-balance?accountType=UNIFIED`,
    {
      'X-BAPI-API-KEY': creds.apiKey,
      'X-BAPI-SIGN': sig,
      'X-BAPI-SIGN-METHOD': 'HMAC_SHA256',
      'X-BAPI-TIMESTAMP': ts,
      'X-BAPI-RECV-WINDOW': recvWindow,
    }
  );
  if (error || statusCode !== 200 || body.retCode !== 0) {
    return { ok: false, error: error || body?.retMsg || `Bybit ${statusCode}` };
  }
  const list = body.result?.list?.[0] || {};
  return {
    ok: true,
    data: {
      balance: parseFloat(list.totalWalletBalance || 0),
      equity: parseFloat(list.totalEquity || 0),
      margin: parseFloat(list.totalInitialMargin || 0),
      freeMargin: parseFloat(list.totalAvailableBalance || 0),
      currency: 'USDT',
      platform: 'Bybit',
    },
  };
}

async function fetchForPlatform(platformId, creds) {
  switch (platformId) {
    case 'mt5':
    case 'mt4':
      if (hasMtBridgeCredentials(creds)) {
        const result = await performMt5Operation('account_snapshot', creds, platformId, {
          trigger: 'platform_account_refresh',
        });
        if (!result.ok) return { ok: false, error: result.error, code: result.code };
        return { ok: true, data: result.accountInfo };
      }
      return fetchMetaApiAccount(creds, platformId);
    case 'binance':
      return fetchBinanceAccount(creds);
    case 'bybit':
      return fetchBybitAccount(creds);
    default:
      return { ok: true, data: { platform: platformId, note: 'Live fetch not yet implemented' } };
  }
}

// ── Handler ────────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  setAuraCorsHeaders(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { platformId } = req.query || {};
  if (!platformId) return res.status(400).json({ success: false, error: 'platformId required' });

  try {
    await ensurePlatformConnectionsColumns(executeQuery);
  } catch (e) {
    console.error('platform-account column migrate:', e.message);
  }

  const [rows] = await executeQuery(
    `SELECT credentials_enc, account_info FROM aura_platform_connections
     WHERE user_id = ? AND platform_id = ? AND status = 'active'`,
    [decoded.id, platformId]
  );
  if (!rows.length) return res.status(404).json({ success: false, error: 'Platform not connected' });

  let creds;
  try {
    creds = JSON.parse(decrypt(rows[0].credentials_enc));
  } catch {
    return res.status(500).json({ success: false, error: 'Credential decryption failed' });
  }

  const result = await fetchForPlatform(platformId, creds);

  if (!result.ok) {
    safeMtLog('account_live_fetch_failed', { platformId, code: result.code || null });
    try {
      await patchConnectionRow(executeQuery, decoded.id, platformId, {
        last_sync_at: true,
        last_error_code: result.code || 'unknown',
        last_error_message: publicAccountLiveError(result.code, result.error).slice(0, 512),
        connection_status: 'error',
      });
    } catch (e) {
      console.error('platform-account patch error:', e.message);
    }
    const cached = safeJsonParse(rows[0].account_info, null);
    if (cached) {
      const body = {
        success: true,
        account: cached,
        stale: true,
        dataSource: 'cache',
      };
      if (isAuraDiagnosticsEnabled()) {
        body.diagnostics = { context: 'platform-account', dataSource: 'cache', stale: true };
      }
      return res.status(200).json(body);
    }
    return res.status(502).json({
      success: false,
      error: publicAccountLiveError(result.code, result.error),
      code: result.code || null,
    });
  }

  // Update cached account info + last_sync
  await executeQuery(
    `UPDATE aura_platform_connections SET account_info = ?, last_sync = NOW()
     WHERE user_id = ? AND platform_id = ?`,
    [JSON.stringify(result.data), decoded.id, platformId]
  );
  try {
    await patchConnectionRow(executeQuery, decoded.id, platformId, {
      last_sync_at: true,
      last_success_at: true,
      connection_status: 'connected',
    });
  } catch (e) {
    console.error('platform-account success patch:', e.message);
  }

  return res.status(200).json({
    success: true,
    account: result.data,
    stale: false,
    dataSource: 'live',
  });
};
