'use strict';

const { stats: tdRestStats } = require('../market-data/tdRateLimiter');
const { snapshotDiagnostics: wsSnapshotDiagnostics } = require('../market-data/twelveWsManager');
const { getLiveQuotesStreamDiagnostics } = require('./live-quotes-stream');
const { getSnapshotRouteDiagnostics } = require('../markets/snapshot');
const { verifyToken } = require('../utils/auth');
const { isSuperAdminEmail } = require('../utils/entitlements');

function isSuperAdmin(req) {
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded) return false;
  const role = String(decoded.role || '').toUpperCase();
  if (role === 'SUPER_ADMIN') return true;
  const email = String(decoded.email || '').trim().toLowerCase();
  return Boolean(email && isSuperAdminEmail({ email }));
}

function isAuthorized(req) {
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  if (!isProd) return true;

  const envKey = String(process.env.INTERNAL_DIAGNOSTICS_KEY || '').trim();
  const providedKey =
    String(req.headers['x-internal-diagnostics-key'] || req.headers['x-diagnostics-key'] || '').trim();

  if (envKey && providedKey && envKey === providedKey) return true;
  return isSuperAdmin(req);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Internal-Diagnostics-Key, X-Diagnostics-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(403).json({ success: false, message: 'Diagnostics access denied' });
  }

  const rest = tdRestStats();
  const ws = wsSnapshotDiagnostics();
  const sse = getLiveQuotesStreamDiagnostics();
  const snapshot = getSnapshotRouteDiagnostics();

  return res.status(200).json({
    success: true,
    checkedAt: new Date().toISOString(),
    restCallsThisMinute: rest.rollingWindowUsedSlots,
    restBudgetRemaining: Math.max(0, rest.maxRpm - rest.rollingWindowUsedSlots),
    activeSseClients: sse.activeSseClients,
    activeWsSubscriptions: ws.twelveWsActiveSubscriptions,
    snapshotFallbackCount: snapshot.snapshotFallbackCount,
    wsMessagesReceived: ws.twelveWsMessagesReceived,
    diagnostics: {
      wsConnected: ws.connected,
      trackedSymbols: ws.trackedSymbols,
      trackedSymbolRefs: ws.trackedSymbolRefs,
      restDedupeJoinsLifetime: rest.dedupeJoinsLifetime,
      snapshotCacheTtlMs: snapshot.cacheTtlMs,
    },
  });
};
