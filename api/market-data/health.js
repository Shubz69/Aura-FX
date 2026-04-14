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
  getOhlcvIngestSummary,
  getForexOhlcvCoverageReport,
  listTwelveDataCoverageForStorageCategory,
} = require('./pipeline-store');
const {
  FX_OHLCV_PRIORITY_V1,
  CRYPTO_OHLCV_PRIORITY_V1,
  CRYPTO_TD_QUOTE_PRIORITY_V1,
  ASX_OHLCV_PRIORITY_V1,
  UK_OHLCV_PRIORITY_V1,
  CBOE_UK_OHLCV_PRIORITY_V1,
  CBOE_AU_OHLCV_PRIORITY_V1,
} = require('./ohlcvTier1');
const { GROUPS } = require('../market/defaultWatchlist');
const { summarizeCapabilitiesForAdmin } = require('./equities/twelveDataEquityCapabilities');
const { getEquityIngestSymbols } = require('./equities/equityUniverse');
const { listTwelveDataEquityCoverageForSymbols } = require('./pipeline-store');
const { getCacheStats } = require('../cache');
const { snapshot: tdMetricsSnapshot } = require('./tdMetrics');
const { stats: tdLimiterStats } = require('./tdRateLimiter');
const { uniqueSymbolsFromWatchlist } = require('./pipeline-service');
const { buildTwelveDataFrameworkDiagnostics } = require('./twelve-data-framework/adminDiagnostics');
const {
  summarizeVentureMarketsForHealth,
  ventureMarketsGloballyEnabled,
} = require('./equities/ventureRemainingMarkets');
const { FX_QUOTE_TTL_MS } = require('./cachePolicy');

function cryptoWatchlistSymbolsForHealth() {
  try {
    const g = GROUPS.crypto;
    if (g && Array.isArray(g.symbols) && g.symbols.length) {
      return [
        ...new Set(g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean)),
      ];
    }
  } catch (_) {
    /* ignore */
  }
  return [...CRYPTO_OHLCV_PRIORITY_V1];
}

function asxSymbolsForHealth() {
  try {
    const g = GROUPS.asx;
    if (g && Array.isArray(g.symbols) && g.symbols.length) {
      return [...new Set(g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean))];
    }
  } catch (_) {
    /* ignore */
  }
  return [...ASX_OHLCV_PRIORITY_V1];
}

function ukSymbolsForHealth() {
  try {
    const g = GROUPS.uk;
    if (g && Array.isArray(g.symbols) && g.symbols.length) {
      return [...new Set(g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean))];
    }
  } catch (_) {
    /* ignore */
  }
  return [...UK_OHLCV_PRIORITY_V1];
}

function cboeUkSymbolsForHealth() {
  try {
    const g = GROUPS.cboeUk;
    if (g && Array.isArray(g.symbols) && g.symbols.length) {
      return [...new Set(g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean))];
    }
  } catch (_) {
    /* ignore */
  }
  return [...CBOE_UK_OHLCV_PRIORITY_V1];
}

function cboeAuSymbolsForHealth() {
  try {
    const g = GROUPS.cboeAu;
    if (g && Array.isArray(g.symbols) && g.symbols.length) {
      return [...new Set(g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean))];
    }
  } catch (_) {
    /* ignore */
  }
  return [...CBOE_AU_OHLCV_PRIORITY_V1];
}

function technicalIndicatorsEnvEnabled() {
  return (
    String(process.env.TD_TECH_INDICATORS || '').trim() === '1' ||
    String(process.env.TD_CRYPTO_TECH_INDICATORS || '').trim() === '1'
  );
}

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
    const equitySymbols = getEquityIngestSymbols();
    const cryptoSym = cryptoWatchlistSymbolsForHealth();
    const [
      snapshots,
      decoderStates,
      aiPacket,
      headlines,
      events,
      usageSummary,
      activeLocks,
      ohlcvSummary,
      forexCoverage,
      equityCoverage,
      cryptoOhlcvCoverage,
      cryptoTdCoverage,
      forexTdCoverage,
      asxOhlcvCoverage,
      asxTdCoverage,
      ukOhlcvCoverage,
      ukTdCoverage,
      cboeUkOhlcvCoverage,
      cboeUkTdCoverage,
      cboeAuOhlcvCoverage,
      cboeAuTdCoverage,
    ] = await Promise.all([
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
      getOhlcvIngestSummary(),
      getForexOhlcvCoverageReport(FX_OHLCV_PRIORITY_V1),
      listTwelveDataEquityCoverageForSymbols(equitySymbols),
      getForexOhlcvCoverageReport(CRYPTO_OHLCV_PRIORITY_V1),
      listTwelveDataCoverageForStorageCategory('crypto', cryptoSym),
      listTwelveDataCoverageForStorageCategory('forex', FX_OHLCV_PRIORITY_V1),
      getForexOhlcvCoverageReport(asxSymbolsForHealth()),
      listTwelveDataCoverageForStorageCategory('asx_equity', asxSymbolsForHealth()),
      getForexOhlcvCoverageReport(ukSymbolsForHealth()),
      listTwelveDataCoverageForStorageCategory('uk_equity', ukSymbolsForHealth()),
      getForexOhlcvCoverageReport(cboeUkSymbolsForHealth()),
      listTwelveDataCoverageForStorageCategory('cboe_uk_equity', cboeUkSymbolsForHealth()),
      getForexOhlcvCoverageReport(cboeAuSymbolsForHealth()),
      listTwelveDataCoverageForStorageCategory('cboe_au_equity', cboeAuSymbolsForHealth()),
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

    const tdSnap = tdMetricsSnapshot();
    const twelveDataFramework = await buildTwelveDataFrameworkDiagnostics({
      cacheStats: typeof getCacheStats === 'function' ? getCacheStats() : null,
      tdSnapshot: tdSnap,
    });
    const life = tdSnap.lifetime || { twelvedata: 0, fallback: 0 };
    const tdTotal = (life.twelvedata || 0) + (life.fallback || 0);
    const fallbackRatio =
      tdTotal > 0 ? Number(((life.fallback || 0) / tdTotal).toFixed(4)) : null;

    const payload = {
      success: true,
      status: activeLocks.length > 0 ? 'refreshing' : 'ready',
      checkedAt: new Date().toISOString(),
      checkDurationMs: Date.now() - start,
      db: getPoolHealth(),
      tables: TABLES,
      marketDataLayer: {
        cache: typeof getCacheStats === 'function' ? getCacheStats() : null,
        twelveData: {
          rolling60s: {
            tdCalls: tdSnap.twelveDataCallsLast60s,
            totalCalls: tdSnap.totalCallsLast60s,
          },
          lifetime: life,
          fallbackRatio,
          throttle: tdLimiterStats(),
        },
        ohlcvIngest: ohlcvSummary,
        forex: {
          priorityPairs: FX_OHLCV_PRIORITY_V1,
          ohlcvCoverage: forexCoverage,
          twelveDataDatasetCoverage: forexTdCoverage,
          quoteTtlMs: FX_QUOTE_TTL_MS,
          layerCache: tdSnap.fxLayerCache || null,
          routeFallback: tdSnap.fxRoutes || null,
          technicalIndicators: technicalIndicatorsEnvEnabled() ? 'enabled' : 'disabled',
          ingestCron: '/api/cron/forex-twelvedata-ingest',
          note:
            'market_movers not wired for FX (response skews equity); quotes, time_series, conversion, and OHLCV ingest are primary.',
        },
        crypto: {
          priorityPairs: CRYPTO_OHLCV_PRIORITY_V1,
          quotePriorityTier1: CRYPTO_TD_QUOTE_PRIORITY_V1,
          watchlistSymbolSample: cryptoSym.slice(0, 15),
          ohlcvCoverage: cryptoOhlcvCoverage,
          twelveDataDatasetCoverage: cryptoTdCoverage,
          layerCache: tdSnap.cryptoLayerCache || null,
          routeMetrics: tdSnap.cryptoRoutes || null,
          technicalIndicators: technicalIndicatorsEnvEnabled() ? 'enabled' : 'disabled',
          ingestCron: '/api/cron/crypto-twelvedata-ingest',
          note: 'market_movers omitted (TD response is often equity-oriented; revisit with explicit crypto exchange params).',
        },
        equities: {
          ingestSymbolSample: equitySymbols.slice(0, 15),
          ingestSymbolCount: equitySymbols.length,
          twelveDataCapabilities: summarizeCapabilitiesForAdmin(),
          dbCoverage: equityCoverage,
          datasetMetrics: tdSnap.equityDatasets || null,
          refreshPolicy: {
            cron: '/api/cron/equity-twelvedata-ingest',
            envSymbolLimit: 'TD_EQUITY_INGEST_SYMBOL_LIMIT',
            defaultMaxTier: 2,
            note:
              'Primary US category id is us_market (storageCategory equity unchanged). Ingest runs us_market (NYSE/NASDAQ reference, US funds, consolidated statements, analyst_ratings/us_equities, mutual_funds family|type). Tier 3 (price_target, calendars, fund_holders, US extras) via maxTier=3. Env: TD_US_NYSE_STOCKS_OUTPUTSIZE, TD_US_NASDAQ_STOCKS_OUTPUTSIZE, TD_US_FUNDS_OUTPUTSIZE, TWELVE_DATA_US_EXCHANGE_MIC.',
          },
        },
        asx: {
          prioritySymbols: asxSymbolsForHealth(),
          ohlcvCoverage: asxOhlcvCoverage,
          twelveDataDatasetCoverage: asxTdCoverage,
          ingestCron: '/api/cron/asx-twelvedata-ingest',
          envSymbolExtras: 'ASX_EQ_INGEST_SYMBOLS',
          envIngestLimit: 'TD_ASX_INGEST_SYMBOL_LIMIT',
          symbolContract: 'Internal canonical TICKER.AX; Twelve Data requests use TICKER:ASX.',
          note:
            'Category asx_equities inherits US equity dataset map plus ASX reference keys (stocks/etf/funds/movers/schedule). Storage market_category asx_equity.',
        },
        uk: {
          prioritySymbols: ukSymbolsForHealth(),
          ohlcvCoverage: ukOhlcvCoverage,
          twelveDataDatasetCoverage: ukTdCoverage,
          ingestCron: '/api/cron/uk-twelvedata-ingest',
          envSymbolExtras: 'UK_EQ_INGEST_SYMBOLS',
          envIngestLimit: 'TD_UK_INGEST_SYMBOL_LIMIT',
          symbolContract: 'Internal canonical TICKER.L; Twelve Data requests use TICKER:LSE (TWELVE_DATA_UK_EXCHANGE_CODE).',
          note:
            'Category uk_equities inherits US equity datasets plus UK reference keys. Storage market_category uk_equity. Framework diagnostics include coverage rows and ingest runs.',
        },
        cboeUk: {
          prioritySymbols: cboeUkSymbolsForHealth(),
          ohlcvCoverage: cboeUkOhlcvCoverage,
          twelveDataDatasetCoverage: cboeUkTdCoverage,
          routeMetrics: tdSnap.cboeUkRoutes || null,
          ingestCron: '/api/cron/cboe-uk-twelvedata-ingest',
          envSymbolExtras: 'CBOE_UK_EQ_INGEST_SYMBOLS',
          envIngestLimit: 'TD_CBOE_UK_INGEST_SYMBOL_LIMIT',
          symbolContract:
            'Internal canonical TICKER.BCXE (distinct from LSE *.L); Twelve Data TICKER:BCXE (TWELVE_DATA_CBOE_UK_EXCHANGE_CODE).',
          note:
            'Category cboe_europe_equities_uk: narrow reference + core only (no US fundamentals inheritance). Super-admin twelveDataFramework.coverage lists dataset freshness; storage market_category cboe_uk_equity.',
        },
        cboeAu: {
          prioritySymbols: cboeAuSymbolsForHealth(),
          ohlcvCoverage: cboeAuOhlcvCoverage,
          twelveDataDatasetCoverage: cboeAuTdCoverage,
          routeMetrics: tdSnap.cboeAuRoutes || null,
          ingestCron: '/api/cron/cboe-au-twelvedata-ingest',
          envSymbolExtras: 'CBOE_AU_EQ_INGEST_SYMBOLS',
          envIngestLimit: 'TD_CBOE_AU_INGEST_SYMBOL_LIMIT',
          symbolContract:
            'Internal canonical TICKER.CXAC (distinct from ASX *.AX); Twelve Data TICKER:CXAC (TWELVE_DATA_CBOE_AU_EXCHANGE_CODE).',
          note:
            'Category cboe_australia: inherits US equity dataset map + AU reference + consolidated statements. Registry skipIngestDatasetKeys omits low-value inherited keys from cron (see twelveDataFramework.registry). US-scoped /analyst_ratings/us_equities is wired for category us_market only, not CXAC. Storage market_category cboe_au_equity. Fundamentals HTTP route uses TD+DB only for .CXAC.',
        },
        ventureRegional: {
          enabled: ventureMarketsGloballyEnabled(),
          supportDefault: 'limited',
          markets: summarizeVentureMarketsForHealth(),
          ingestCron: '/api/cron/venture-twelvedata-ingest',
          envIngestLimit: 'TD_VENTURE_INGEST_SYMBOL_LIMIT',
          disableEnv: 'VENTURE_REGIONAL_MARKETS=0',
          note:
            'venture_* = limited (reference+core only); exchange-qualified canonicals required. Twelve Data is primary (marketDataLayer + prices route skips Yahoo→Polygon when TD is configured). refreshTier priority|standard: standard venues use longer reference TTLs (TD_VENTURE_STANDARD_REFRESH_TTL_MULT). Ingest order: ingestCron runs priority venues first.',
        },
        twelveDataFramework,
      },
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
