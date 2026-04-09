const crypto = require('crypto');

const { getWatchlistPayload } = require('../market/defaultWatchlist');
const { runEngine } = require('../trader-deck/marketIntelligenceEngine');
const { runMarketDecoder } = require('../trader-deck/marketDecoderEngine');
const { enrichTraderDeckPayload } = require('../trader-deck/perplexityTraderInsights');
const dataService = require('../ai/data-layer/data-service');
const {
  ensurePipelineTables,
  upsertMarketSnapshot,
  upsertAssetPrices,
  upsertHeadlines,
  upsertEconomicEvents,
  upsertDecoderState,
  upsertAiContextPacket,
  trackProviderUsage,
  getProviderUsageSummary,
  acquireRefreshLock,
  releaseRefreshLock,
  getLatestSnapshot,
  getLatestAiContextPacket,
  getLatestDecoderState,
  getLatestAssetPrices,
  getRecentHeadlines,
  getRecentEconomicEvents,
  freshnessStatus,
} = require('./pipeline-store');

const HOT_TTL_MS = 5 * 60 * 1000;
const MORNING_TTL_MS = 18 * 60 * 60 * 1000;
const CALENDAR_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_DECODER_SYMBOLS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'BTCUSD', 'SPY'];

let pipelineTablesReadyPromise = null;

async function ensurePipelineTablesReady() {
  if (!process.env.MYSQL_HOST) return false;
  if (!pipelineTablesReadyPromise) {
    pipelineTablesReadyPromise = ensurePipelineTables().catch((error) => {
      pipelineTablesReadyPromise = null;
      throw error;
    });
  }
  await pipelineTablesReadyPromise;
  return true;
}

function uniqueSymbolsFromWatchlist() {
  const watchlist = getWatchlistPayload();
  const seen = new Set();
  const symbols = [];
  const groups = watchlist?.groups && typeof watchlist.groups === 'object'
    ? Object.values(watchlist.groups)
    : [];
  for (const group of groups) {
    for (const item of group?.symbols || group?.items || []) {
      const symbol = String(item?.symbol || '').trim().toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      symbols.push(symbol);
    }
  }
  return symbols;
}

function normalizePrice(symbol, marketData) {
  return {
    symbol,
    providerSymbol: marketData?.providerSymbol || symbol,
    assetClass: marketData?.assetClass || null,
    price: marketData?.price ?? marketData?.c ?? null,
    previousClose: marketData?.previousClose ?? marketData?.pc ?? null,
    change: marketData?.change ?? marketData?.d ?? null,
    changePercent: marketData?.changePercent ?? marketData?.dp ?? null,
    high: marketData?.high ?? null,
    low: marketData?.low ?? null,
    open: marketData?.open ?? null,
    source: marketData?.source || 'unknown',
    snapshotTs: new Date(),
    freshnessStatus: 'fresh',
    rawPayload: marketData || {},
  };
}

function toMySqlDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function clampText(value, max) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

function normalizeHeadlines(headlines, symbol = null) {
  const ingestedAt = new Date();
  return (headlines || []).map((item) => ({
    headline: item.headline || '',
    summary: item.summary || '',
    url: item.url || null,
    source: item.source || item.provider || 'unknown',
    category: item.category || 'market',
    relatedSymbol: symbol || item.relatedSymbol || null,
    freshnessStatus: 'fresh',
    publishedAt: toMySqlDateTime(item.publishedAt || item.datetime || null),
    ingestedAt: toMySqlDateTime(ingestedAt),
    rawPayload: item,
  }));
}

function normalizeEconomicEvents(events) {
  return (events || []).map((item) => ({
    providerEventId: clampText(item.providerEventId || item.id || null, 120),
    eventDate: String(item.date || item.event_date || '').slice(0, 10),
    eventTime: clampText(item.time || item.event_time || null, 32),
    eventTs: toMySqlDateTime(item.datetimeUtc || item.event_ts || item.timestamp || null),
    title: clampText(item.title || item.event || 'Economic Event', 255) || 'Economic Event',
    country: clampText(item.country || null, 80),
    currency: clampText(item.currency || null, 16),
    impact: clampText(item.impact || null, 20),
    actual: clampText(item.actual ?? null, 64),
    forecast: clampText(item.forecast ?? null, 64),
    previous: clampText(item.previous ?? null, 64),
    revised: clampText(item.revised ?? null, 64),
    unit: clampText(item.unit ?? null, 32),
    source: clampText(item.source || 'unknown', 80) || 'unknown',
    freshnessStatus: 'fresh',
    rawPayload: item,
  })).filter((item) => item.eventDate);
}

function hashContext(payload) {
  return crypto.createHash('sha1').update(JSON.stringify(payload || {})).digest('hex').slice(0, 16);
}

async function evaluateUsageGuard(provider, feature) {
  if (!process.env.MYSQL_HOST) {
    return { allow: true, usagePct: 0, mode: 'normal' };
  }
  const rawLimit = Number(
    process.env[`API_USAGE_LIMIT_${String(provider || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`]
  ) || 0;
  if (!rawLimit) return { allow: true, usagePct: 0, mode: 'normal' };
  const maxPerMonth = Math.max(100, rawLimit);
  const summary = await getProviderUsageSummary({ provider, feature, days: 31 });
  const totalCalls = summary.reduce((sum, row) => sum + Number(row.total_calls || 0), 0);
  const usagePct = (totalCalls / maxPerMonth) * 100;
  if (usagePct >= 90) return { allow: false, usagePct, mode: 'critical' };
  if (usagePct >= 80) return { allow: true, usagePct, mode: 'slow' };
  return { allow: true, usagePct, mode: 'normal' };
}

async function ingestWatchlistPrices(symbols = uniqueSymbolsFromWatchlist()) {
  const rows = [];
  for (const symbol of symbols) {
    const usage = await evaluateUsageGuard('market-data', 'price-ingestion');
    if (!usage.allow) break;
    const marketData = await dataService.getMarketData(symbol);
    if (marketData && !marketData.error) {
      rows.push(normalizePrice(symbol, marketData));
      await trackProviderUsage({
        provider: marketData.source || 'market-data',
        feature: 'price-ingestion',
        status: marketData.cached ? 'cache' : 'ok',
      });
    }
  }
  if (rows.length > 0) {
    await upsertAssetPrices(rows);
  }
  return rows;
}

async function ingestHeadlines(symbol = null) {
  const usage = await evaluateUsageGuard('news', symbol ? 'symbol-news-ingestion' : 'market-news-ingestion');
  if (!usage.allow) return [];
  const news = await dataService.getNews(symbol, 'general', symbol ? 10 : 25);
  const rows = normalizeHeadlines(news?.news || [], symbol);
  if (rows.length > 0) {
    await upsertHeadlines(rows);
  }
  await trackProviderUsage({
    provider: news?.source || 'news',
    feature: symbol ? 'symbol-news-ingestion' : 'market-news-ingestion',
    status: news?.cached ? 'cache' : news?.error ? 'error' : 'ok',
  });
  return rows;
}

async function ingestEconomicCalendar() {
  const usage = await evaluateUsageGuard('calendar', 'economic-calendar-ingestion');
  if (!usage.allow) return [];
  const calendar = await dataService.getCalendar();
  const rows = normalizeEconomicEvents(calendar?.events || []);
  if (rows.length > 0) {
    await upsertEconomicEvents(rows);
  }
  await trackProviderUsage({
    provider: calendar?.source || 'calendar',
    feature: 'economic-calendar-ingestion',
    status: calendar?.cached ? 'cache' : calendar?.error ? 'error' : 'ok',
  });
  return rows;
}

async function buildAndStoreMarketSnapshot({ timeframe = 'daily', date = '' } = {}) {
  const raw = await runEngine({ timeframe, date });
  let enriched = null;
  try {
    enriched = await enrichTraderDeckPayload(raw);
  } catch (error) {
    console.warn('[market-data/pipeline] enrichTraderDeckPayload failed:', error.message || error);
  }
  const payload = {
    ...(raw || {}),
    ...(enriched || {}),
    generatedFor: date || null,
    timeframe,
  };
  await upsertMarketSnapshot({
    snapshotKey: `market-intelligence:${timeframe}:${date || 'live'}`,
    snapshotType: 'market_intelligence',
    timeframe,
    source: 'marketIntelligenceEngine',
    asOfTs: new Date(),
    freshnessStatus: 'fresh',
    payload,
  });
  return payload;
}

async function buildAndStoreDecoderStates(symbols = DEFAULT_DECODER_SYMBOLS) {
  const outputs = [];
  for (const symbol of symbols) {
    try {
      const decoded = await runMarketDecoder(symbol);
      if (!decoded?.success || !decoded?.brief) continue;
      await upsertDecoderState({
        symbol,
        timeframe: 'daily',
        source: 'marketDecoderEngine',
        generatedAt: new Date(),
        freshnessStatus: 'fresh',
        payload: decoded.brief,
      });
      outputs.push({ symbol, brief: decoded.brief });
    } catch (error) {
      console.warn('[market-data/pipeline] decoder ingest failed:', symbol, error.message || error);
    }
  }
  return outputs;
}

async function getStoredDecoderState(symbol, timeframe = 'daily') {
  const row = await getLatestDecoderState(String(symbol).toUpperCase(), timeframe);
  if (!row) return null;
  return {
    payload: row.payload,
    source: row.source,
    updatedAt: row.updated_at || row.generated_at,
    freshnessStatus: freshnessStatus(row.updated_at || row.generated_at, MORNING_TTL_MS),
  };
}

async function buildAndStoreAiContextPacket() {
  const snapshotRow = await getLatestSnapshot('market-intelligence:daily:live', 'daily');
  const latestPrices = await getLatestAssetPrices(uniqueSymbolsFromWatchlist().slice(0, 25));
  const headlines = await getRecentHeadlines({ limit: 20 });
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const calendar = await getRecentEconomicEvents({ fromDate: today, toDate: nextWeek, limit: 80 });

  const marketState = snapshotRow?.payload || null;
  const pulseScore = marketState?.marketPulse?.score ?? null;
  const decoderState = marketState?.marketRegime || null;
  const latestBrief = marketState?.aiSessionBrief || marketState?.deskBrief || null;
  const packet = {
    marketState,
    confidence: pulseScore,
    bias: marketState?.marketRegime?.bias || marketState?.marketPulse?.state || null,
    keyDrivers: marketState?.keyDrivers || [],
    monitoredAssets: latestPrices,
    headlineSummary: headlines.slice(0, 8),
    economicCalendar: calendar.slice(0, 20),
    decoderState,
    latestBrief,
    packetId: hashContext({ pulseScore, headlineCount: headlines.length, eventCount: calendar.length }),
  };

  await upsertAiContextPacket({
    packetKey: 'global',
    timeframe: 'daily',
    source: 'market-data-pipeline',
    generatedAt: new Date(),
    freshnessStatus: 'fresh',
    payload: packet,
  });

  return packet;
}

async function runMorningIngestion() {
  await ensurePipelineTablesReady();
  const lockOwner = `ingest-${Date.now()}`;
  const lock = await acquireRefreshLock('market-data:morning-ingestion', lockOwner, 10 * 60 * 1000);
  if (!lock.acquired) {
    return {
      success: true,
      skipped: true,
      reason: 'refresh-in-progress',
      lockOwner: lock.ownerId,
      generatedAt: new Date().toISOString(),
    };
  }
  const symbols = uniqueSymbolsFromWatchlist();
  try {
    const [prices, headlines, events, snapshot, decoderStates] = await Promise.all([
      ingestWatchlistPrices(symbols),
      ingestHeadlines(),
      ingestEconomicCalendar(),
      buildAndStoreMarketSnapshot({ timeframe: 'daily' }),
      buildAndStoreDecoderStates(),
    ]);
    const aiPacket = await buildAndStoreAiContextPacket();

    return {
      success: true,
      pricesStored: prices.length,
      headlinesStored: headlines.length,
      eventsStored: events.length,
      decoderStatesStored: decoderStates.length,
      snapshotReady: Boolean(snapshot),
      aiPacketReady: Boolean(aiPacket),
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await releaseRefreshLock('market-data:morning-ingestion', lockOwner);
  }
}

async function getStoredMarketIntelligence({ timeframe = 'daily', date = '' } = {}) {
  await ensurePipelineTablesReady();
  const row = await getLatestSnapshot(`market-intelligence:${timeframe}:${date || 'live'}`, timeframe);
  if (!row) return null;
  return {
    payload: row.payload,
    source: row.source,
    updatedAt: row.updated_at || row.as_of_ts,
    freshnessStatus: freshnessStatus(row.updated_at || row.as_of_ts, MORNING_TTL_MS),
  };
}

async function getStoredAiContextPacket(packetKey = 'global', timeframe = 'daily') {
  await ensurePipelineTablesReady();
  const row = await getLatestAiContextPacket(packetKey, timeframe);
  if (!row) return null;
  return {
    payload: row.payload,
    source: row.source,
    updatedAt: row.updated_at || row.generated_at,
    freshnessStatus: freshnessStatus(row.updated_at || row.generated_at, MORNING_TTL_MS),
  };
}

async function getStoredSymbolBundle(symbol) {
  await ensurePipelineTablesReady();
  const [prices, headlines] = await Promise.all([
    getLatestAssetPrices([symbol]),
    getRecentHeadlines({ symbol, limit: 10 }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const calendar = await getRecentEconomicEvents({ fromDate: today, toDate: nextWeek, limit: 80 });
  return {
    marketData: prices[0] || null,
    news: headlines,
    calendar,
    freshness: {
      marketData: freshnessStatus(prices[0]?.updated_at || prices[0]?.snapshot_ts, HOT_TTL_MS),
      news: freshnessStatus(headlines[0]?.updated_at || headlines[0]?.published_at, MORNING_TTL_MS),
      calendar: freshnessStatus(calendar[0]?.updated_at || calendar[0]?.event_ts, CALENDAR_TTL_MS),
    },
  };
}

async function getStoredBriefInputs({ timeframe = 'daily', date = '' } = {}) {
  await ensurePipelineTablesReady();
  const [market, headlines, calendar] = await Promise.all([
    getStoredMarketIntelligence({ timeframe, date }),
    getRecentHeadlines({ limit: 40 }),
    getRecentEconomicEvents({
      fromDate: new Date().toISOString().slice(0, 10),
      toDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      limit: 120,
    }),
  ]);

  return {
    market: market?.payload || null,
    headlines: headlines.map((row) => ({
      headline: row.headline,
      summary: row.summary,
      url: row.url,
      source: row.source,
      category: row.category,
      related: row.related_symbol ? [row.related_symbol] : [],
      publishedAt: row.published_at || null,
    })),
    calendar: calendar.map((row) => ({
      date: row.event_date,
      time: row.event_time,
      title: row.title,
      event: row.title,
      currency: row.currency,
      country: row.country,
      impact: row.impact,
      actual: row.actual_value,
      forecast: row.forecast_value,
      previous: row.previous_value,
      revised: row.revised_value,
      unit: row.unit,
      source: row.source,
      event_ts: row.event_ts,
    })),
    freshness: {
      market: market?.freshnessStatus || 'missing',
      headlines: freshnessStatus(headlines[0]?.updated_at || headlines[0]?.published_at, MORNING_TTL_MS),
      calendar: freshnessStatus(calendar[0]?.updated_at || calendar[0]?.event_ts, CALENDAR_TTL_MS),
    },
  };
}

module.exports = {
  runMorningIngestion,
  getStoredMarketIntelligence,
  getStoredAiContextPacket,
  getStoredDecoderState,
  getStoredSymbolBundle,
  getStoredBriefInputs,
  uniqueSymbolsFromWatchlist,
};
