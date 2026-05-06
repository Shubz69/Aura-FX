/**
 * Operator Intelligence data adapter — mock today, swap internals for live APIs later.
 */
import { operatorPulseMock } from '../data/operatorIntelligence/operatorPulse.mock';
import { marketDriversMock } from '../data/operatorIntelligence/marketDrivers.mock';
import { biasEngineMock } from '../data/operatorIntelligence/biasEngine.mock';
import { intelligenceFeedMock } from '../data/operatorIntelligence/intelligenceFeed.mock';
import { impactCalendarMock } from '../data/operatorIntelligence/impactCalendar.mock';
import { watchlistsMock } from '../data/operatorIntelligence/watchlists.mock';
import { actionSummaryMock } from '../data/operatorIntelligence/actionSummary.mock';
import { marketWatchMock } from '../data/operatorIntelligence/marketWatch.mock';
import {
  generateOperatorMockBars,
  computeSessionLevels,
} from '../data/operatorIntelligence/chartBars.mock';
import { buildCandleIntelligenceMock } from '../data/operatorIntelligence/candleIntelligence.mock';
import Api from './Api';
import {
  chartSymbolFromId,
  dataSymbolFromId,
  providerSymbolFromId,
  getInstrumentById,
  getInstrumentByChartSymbol,
  normalizeSymbol,
} from '../data/terminalInstruments';
import { normalizeChartBars } from '../lib/charts/lightweightChartData';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchOperatorPulse() {
  await delay(120);
  return { ...operatorPulseMock };
}

export async function fetchMarketDrivers() {
  await delay(100);
  return marketDriversMock.map((d) => ({ ...d }));
}

export async function fetchBiasEngine() {
  await delay(90);
  return { ...biasEngineMock };
}

const FEED_SOURCE_STRIP_RE = /\s*[-–—]\s*(reuters|bloomberg|forex factory|financial times|wsj|cnbc|yahoo finance|marketwatch)\s*$/i;

function cleanFeedText(v) {
  return String(v || '')
    .replace(FEED_SOURCE_STRIP_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferFeedImpact(text) {
  const s = String(text || '').toLowerCase();
  if (/nfp|cpi|pce|fomc|ecb|boe|boj|rate decision|jobs report|gdp|default|bank failure|geopol|sanctions|war\b/i.test(s)) {
    return 'High';
  }
  if (/fed|earnings|guidance|oil|opec|treasury|yield|inflation|employment|cut|hike|speak/i.test(s)) {
    return 'Medium';
  }
  return 'Low';
}

function mapNewsArticleToFeedRow(article, idx) {
  const headline = cleanFeedText(article.headline || article.title || '');
  const summary = cleanFeedText(article.summary || '');
  const pub = article.publishedAt || article.publishedDate || null;
  const ts = pub ? new Date(pub).toISOString() : new Date().toISOString();
  const slug = `${headline.slice(0, 48)}|${ts}`;
  const id = `td-news-${idx}-${slug.replace(/[^a-z0-9]+/gi, '').slice(0, 40)}`;
  const catRaw = String(article.category || 'market').trim() || 'market';
  const category = catRaw.charAt(0).toUpperCase() + catRaw.slice(1);
  const blob = `${headline} ${summary}`;
  const related = Array.isArray(article.related) ? article.related.map((x) => String(x || '').trim()).filter(Boolean) : [];
  return {
    id,
    ts,
    category,
    impact: inferFeedImpact(blob),
    headline: headline || 'Market update',
    affectedAssets: related.slice(0, 12),
    aiSummary: (summary || headline).slice(0, 360) || headline,
    whyItMatters: (summary || headline).slice(0, 260) || 'Liquidity and cross-asset correlations can shift quickly around headlines.',
    action: 'Trade the reaction with reduced size; confirm with your levels and risk process.',
  };
}

/**
 * Live desk wire via `/api/trader-deck/news` (Finnhub/FMP/Yahoo); falls back to mock if empty/offline.
 * @param {{ refresh?: boolean }} [opts]
 */
export async function fetchIntelligenceFeed(opts = {}) {
  const refresh = Boolean(opts.refresh);
  try {
    const res = await Api.getTraderDeckNews({ refresh });
    const articles = res?.data?.articles;
    if (Array.isArray(articles) && articles.length > 0) {
      return articles.slice(0, 40).map(mapNewsArticleToFeedRow);
    }
  } catch {
    /* use mock */
  }
  await delay(80);
  return intelligenceFeedMock.map((r) => ({ ...r }));
}

export async function fetchImpactCalendar() {
  await delay(95);
  return impactCalendarMock.map((r) => ({ ...r }));
}

export async function fetchWatchlists() {
  await delay(80);
  return {
    pairs: watchlistsMock.pairs.map((p) => ({ ...p })),
    indices: watchlistsMock.indices.map((p) => ({ ...p })),
  };
}

export async function fetchMarketWatch() {
  await delay(70);
  return marketWatchMock.map((r) => ({ ...r }));
}

export async function fetchActionSummary() {
  await delay(85);
  return { ...actionSummaryMock };
}

export async function fetchOperatorChartPack(symbol, timeframeId, opts = {}) {
  if (!opts.cacheBust) await delay(60);
  const normalized = normalizeSymbol(symbol);
  const inst = getInstrumentById(normalized) || getInstrumentByChartSymbol(symbol);
  const cleanChartSymbol = inst?.chartSymbol || chartSymbolFromId(normalized || symbol);
  const cleanDataSymbol = inst?.dataSymbol || dataSymbolFromId(normalized || symbol) || cleanChartSymbol;
  const providerSymbol = inst?.providerSymbol || providerSymbolFromId(normalized || symbol) || cleanChartSymbol;

  const tfMap = {
    '1m': '1',
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '45m': '45',
    '1H': '60',
    '4H': '240',
    D: '1D',
    '1D': '1D',
    W: '1W',
    '1W': '1W',
    '1mo': '1M',
    '1M': '1M',
    '1y': '1Y',
    '1Y': '1Y',
  };
  const requestedInterval = tfMap[String(timeframeId || '1H')] || '60';

  const trySymbols = [cleanDataSymbol, cleanChartSymbol, providerSymbol].filter(Boolean);
  let bars = [];
  let usedSymbol = cleanDataSymbol;
  let diagnostics = null;

  const chartAbort =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(42000)
      : undefined;

  for (const symTry of trySymbols) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await Api.getMarketChartHistory(symTry, {
        interval: requestedInterval,
        ...(chartAbort ? { signal: chartAbort } : {}),
        ...(opts.cacheBust ? { cacheBust: true } : {}),
      });
      const payload = response?.data || {};
      const normalizedBars = normalizeChartBars(payload?.bars);
      if (normalizedBars.length > 1) {
        bars = normalizedBars;
        usedSymbol = symTry;
        diagnostics = payload?.diagnostics || null;
        break;
      }
    } catch {
      /* try next symbol */
    }
  }

  if (!bars.length) {
    bars = generateOperatorMockBars(cleanDataSymbol || cleanChartSymbol, timeframeId);
    diagnostics = {
      providerUsed: 'mock',
      requestedInterval,
      fallbackReason: 'api_empty_or_unavailable',
    };
  }

  const levels = computeSessionLevels(bars);
  return {
    symbol: cleanChartSymbol,
    dataSymbol: cleanDataSymbol,
    providerSymbol,
    usedSymbol,
    bars,
    levels,
    diagnostics,
  };
}

export function resolveCandleIntelligence(bar, ctx) {
  try {
    return buildCandleIntelligenceMock(bar, ctx);
  } catch {
    return {
      candleTime: '—',
      direction: '—',
      bodyRangePct: 0,
      sizeLabel: '—',
      likelyDriver: 'Insufficient bar data.',
      relatedEvents: [],
      volumeVolatilityRead: '—',
      correlationRead: '—',
      whatItMeans: '—',
      practicalGuidance: 'Stand down until chart data is available.',
      exampleBlurb: '',
    };
  }
}

export async function fetchOperatorIntelligencePageBundle() {
  const [
    pulse,
    drivers,
    bias,
    feed,
    calendar,
    watchlists,
    actionSummary,
    marketWatch,
  ] = await Promise.all([
    fetchOperatorPulse(),
    fetchMarketDrivers(),
    fetchBiasEngine(),
    fetchIntelligenceFeed(),
    fetchImpactCalendar(),
    fetchWatchlists(),
    fetchActionSummary(),
    fetchMarketWatch(),
  ]);
  return {
    pulse,
    drivers,
    bias,
    feed,
    calendar,
    watchlists,
    actionSummary,
    marketWatch,
  };
}
