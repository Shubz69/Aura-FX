const { verifyToken } = require('../utils/auth');
const { isSuperAdminEmail } = require('../utils/entitlements');
const { getPoolHealth } = require('../db');
const {
  TABLES,
  getProviderUsageSummary,
  listActiveRefreshLocks,
  listLatestSnapshots,
  listLatestDecoderStates,
  getLatestAiContextPacket,
  getRecentHeadlines,
  getRecentEconomicEvents,
  freshnessStatus,
} = require('./pipeline-store');
const { uniqueSymbolsFromWatchlist } = require('./pipeline-service');

function requestIsSuperAdmin(req) {
  const decoded = verifyToken(req.headers.authorization);
  if (!decoded) return false;
  const role = String(decoded.role || '').toUpperCase();
  if (role === 'SUPER_ADMIN') return true;
  const email = decoded.email != null ? String(decoded.email).trim().toLowerCase() : '';
  if (email && isSuperAdminEmail({ email })) return true;
  return false;
}

function toIso(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function summarizeStatus(items, ttlMs, timestampField) {
  const counts = { fresh: 0, stale: 0, expired: 0, missing: 0, unknown: 0 };
  for (const item of items || []) {
    const status = freshnessStatus(item?.[timestampField], ttlMs);
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (!requestIsSuperAdmin(req)) {
    return res.status(403).json({ success: false, message: 'Super admin access required' });
  }

  const start = Date.now();
  try {
    const [snapshots, decoderStates, aiPacket, headlines, events, usageSummary, activeLocks] = await Promise.all([
      listLatestSnapshots(25),
      listLatestDecoderStates(25),
      getLatestAiContextPacket('global', 'daily'),
      getRecentHeadlines({ limit: 25 }),
      getRecentEconomicEvents({
        fromDate: new Date().toISOString().slice(0, 10),
        toDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        limit: 50,
      }),
      getProviderUsageSummary({ days: 31 }),
      listActiveRefreshLocks(),
    ]);

    const watchlistCount = uniqueSymbolsFromWatchlist().length;
    const usageLimits = {
      marketData: Number(process.env.API_USAGE_LIMIT_MARKET_DATA || 0) || null,
      news: Number(process.env.API_USAGE_LIMIT_NEWS || 0) || null,
      calendar: Number(process.env.API_USAGE_LIMIT_CALENDAR || 0) || null,
    };

    const usage = usageSummary.map((row) => {
      const providerKey = String(row.provider || '').toLowerCase();
      const configuredLimit =
        providerKey === 'market-data' ? usageLimits.marketData :
        providerKey === 'news' ? usageLimits.news :
        providerKey === 'calendar' ? usageLimits.calendar :
        null;
      const totalCalls = Number(row.total_calls || 0);
      const usagePct = configuredLimit ? Number(((totalCalls / configuredLimit) * 100).toFixed(2)) : null;
      return {
        provider: row.provider,
        feature: row.feature,
        totalCalls,
        lastCalledAt: toIso(row.last_called_at),
        configuredLimit,
        usagePct,
        pressure:
          usagePct == null ? 'unbounded' :
          usagePct >= 90 ? 'critical' :
          usagePct >= 80 ? 'high' :
          'normal',
      };
    });

    const payload = {
      success: true,
      status: activeLocks.length > 0 ? 'refreshing' : 'ready',
      checkedAt: new Date().toISOString(),
      checkDurationMs: Date.now() - start,
      db: getPoolHealth(),
      tables: TABLES,
      coverage: {
        watchlistSymbols: watchlistCount,
        latestSnapshots: snapshots.length,
        latestDecoderStates: decoderStates.length,
        aiContextReady: Boolean(aiPacket?.payload),
        recentHeadlines: headlines.length,
        upcomingEvents: events.length,
      },
      freshness: {
        snapshots: summarizeStatus(snapshots, 18 * 60 * 60 * 1000, 'updated_at'),
        decoderStates: summarizeStatus(decoderStates, 18 * 60 * 60 * 1000, 'updated_at'),
        headlines: summarizeStatus(headlines, 18 * 60 * 60 * 1000, 'updated_at'),
        economicEvents: summarizeStatus(events, 6 * 60 * 60 * 1000, 'updated_at'),
        aiContext: aiPacket
          ? {
              status: freshnessStatus(aiPacket.updated_at || aiPacket.generated_at, 18 * 60 * 60 * 1000),
              updatedAt: toIso(aiPacket.updated_at || aiPacket.generated_at),
              source: aiPacket.source || null,
            }
          : { status: 'missing', updatedAt: null, source: null },
      },
      activeLocks: activeLocks.map((row) => ({
        lockKey: row.lock_key,
        ownerId: row.owner_id,
        expiresAt: toIso(row.expires_at),
        updatedAt: toIso(row.updated_at),
      })),
      usage,
      latest: {
        snapshots: snapshots.slice(0, 10).map((row) => ({
          key: row.snapshot_key,
          type: row.snapshot_type,
          timeframe: row.timeframe,
          source: row.source,
          freshnessStatus: row.freshness_status,
          asOf: toIso(row.as_of_ts),
          updatedAt: toIso(row.updated_at),
          notes: row.notes || null,
        })),
        decoderStates: decoderStates.slice(0, 10).map((row) => ({
          symbol: row.symbol,
          timeframe: row.timeframe,
          source: row.source,
          freshnessStatus: row.freshness_status,
          generatedAt: toIso(row.generated_at),
          updatedAt: toIso(row.updated_at),
        })),
      },
    };

    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Pipeline health check failed',
      checkedAt: new Date().toISOString(),
      checkDurationMs: Date.now() - start,
    });
  }
};
