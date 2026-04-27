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
  await delay(140);
  const bars = generateOperatorMockBars(symbol, timeframeId);
  const levels = computeSessionLevels(bars);
  return { bars, levels };
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
