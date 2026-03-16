/**
 * /api/aura-analysis/platform-account
 * GET — fetch live account information from a connected trading platform.
 * Query param: platformId
 */
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const crypto = require('crypto');
const https = require('https');

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

async function fetchMetaApiAccount(creds) {
  const { statusCode, body, error } = await httpsGet(
    'mt-client-api-v1.london.agiliumtrade.ai',
    `/users/current/accounts/${encodeURIComponent(creds.accountId)}/account-information`,
    { 'auth-token': creds.token, 'Content-Type': 'application/json' }
  );
  if (error || statusCode !== 200) {
    return { ok: false, error: error || body?.message || `MetaAPI ${statusCode}` };
  }
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
      platform: 'MT5',
      tradeAllowed: body.tradeAllowed,
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
      return fetchMetaApiAccount(creds);
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
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded) return res.status(401).json({ success: false, error: 'Unauthorized' });

  const { platformId } = req.query || {};
  if (!platformId) return res.status(400).json({ success: false, error: 'platformId required' });

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
    // Return cached account info as fallback
    const cached = rows[0].account_info;
    if (cached) {
      return res.status(200).json({
        success: true,
        account: typeof cached === 'string' ? JSON.parse(cached) : cached,
        stale: true,
      });
    }
    return res.status(502).json({ success: false, error: result.error });
  }

  // Update cached account info + last_sync
  await executeQuery(
    `UPDATE aura_platform_connections SET account_info = ?, last_sync = NOW()
     WHERE user_id = ? AND platform_id = ?`,
    [JSON.stringify(result.data), decoded.id, platformId]
  );

  return res.status(200).json({ success: true, account: result.data });
};
