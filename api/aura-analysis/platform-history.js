/**
 * /api/aura-analysis/platform-history
 * GET — fetch trade history from a connected trading platform.
 * Query params: platformId, days (default 90)
 */
const { executeQuery } = require('../db');
const { verifyToken } = require('../utils/auth');
const crypto = require('crypto');
const https = require('https');
const { hasMtBridgeCredentials, getPositions } = require('./terminalSyncBridge');
const { setAuraCorsHeaders } = require('./cors');

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

// ── Normalise a raw trade into a unified shape ─────────────────────────────
function normaliseTrade(raw, platform) {
  return {
    id: raw.id || raw.orderId || raw.ticket || String(Math.random()),
    pair: raw.symbol || raw.instrument || raw.pair || raw.s || '—',
    direction: raw.type === 0 || raw.side === 'BUY' || raw.positionType === 'long' ? 'buy' : 'sell',
    pnl: parseFloat(raw.profit || raw.realizedPnl || raw.pnl || raw.realized_pnl || 0),
    volume: parseFloat(raw.volume || raw.qty || raw.executedQty || raw.size || 0),
    entryPrice: parseFloat(raw.entryPrice || raw.price || raw.openPrice || 0),
    closePrice: parseFloat(raw.closePrice || raw.exitPrice || raw.avgPrice || 0),
    openTime: raw.openTime || raw.time || raw.transactTime || raw.createdTime || null,
    closeTime: raw.closeTime || raw.updateTime || null,
    commission: parseFloat(raw.commission || raw.fee || 0),
    swap: parseFloat(raw.swap || 0),
    rMultiple: raw.rMultiple || null,
    session: detectSession(raw.openTime || raw.time),
    platform,
    created_at: raw.closeTime || raw.openTime || raw.time || new Date().toISOString(),
  };
}

function detectSession(timeVal) {
  if (!timeVal) return 'Unknown';
  const h = new Date(timeVal).getUTCHours();
  if (h >= 0 && h < 8) return 'Asian';
  if (h >= 7 && h < 12) return 'London';
  if (h >= 12 && h < 17) return 'New York';
  if (h >= 17 && h < 21) return 'NY/London Close';
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
async function fetchMetaApiHistory(creds, days) {
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
    }, 'MT5'));

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
        const result = await getPositions(creds);
        if (!result.ok) return { ok: false, error: result.error };
        // Bridge exposes open positions; map into the expected trade-like shape.
        const trades = result.trades.map((p, idx) => normaliseTrade({
          id: p.ticket || p.identifier || `pos_${idx}`,
          symbol: p.symbol,
          type: Number(p.type) === 0 ? 0 : 1,
          profit: p.profit,
          volume: p.volume || p.lots,
          entryPrice: p.price_open || p.priceOpen || p.price,
          closePrice: p.price_current || p.priceCurrent || p.closePrice || 0,
          openTime: normalizeTimeValue(p.time || p.time_msc || p.openTime),
          closeTime: normalizeTimeValue(p.time_update || p.timeUpdate || p.closeTime),
          commission: p.commission || 0,
          swap: p.swap || 0,
        }, 'MT5'));
        return { ok: true, trades };
      }
      return fetchMetaApiHistory(creds, days);
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

  const { platformId, days: daysParam } = req.query || {};
  if (!platformId) return res.status(400).json({ success: false, error: 'platformId required' });
  const days = Math.min(365, Math.max(1, parseInt(daysParam, 10) || 30));

  const [rows] = await executeQuery(
    `SELECT credentials_enc FROM aura_platform_connections
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

  const result = await fetchHistoryForPlatform(platformId, creds, days);

  if (!result.ok) return res.status(502).json({ success: false, error: result.error });

  return res.status(200).json({
    success: true,
    trades: result.trades,
    count: result.trades.length,
    platformId,
    days,
  });
};
