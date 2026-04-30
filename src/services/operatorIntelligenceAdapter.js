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

export async function fetchIntelligenceFeed() {
  await delay(110);
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

export async function fetchOperatorChartPack(symbol, timeframeId) {
  await delay(60);
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
