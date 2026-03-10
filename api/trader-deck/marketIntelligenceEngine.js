/**
 * Market Intelligence Engine – builds Trader Deck dashboard payload from normalized API data.
 * Rule-based regime, pulse, drivers, cross-asset, market changes, trader focus, risk radar.
 */

const { getFinnhubData } = require('./services/finnhubService');
const { getFmpData } = require('./services/fmpService');
const { getFredData } = require('./services/fredService');

// --- Internal helpers (direction from change) ---
function directionFromChange(prev, curr) {
  if (curr == null || prev == null) return 'neutral';
  const c = Number(curr);
  const p = Number(prev);
  if (Number.isNaN(c) || Number.isNaN(p)) return 'neutral';
  if (c > p) return 'up';
  if (c < p) return 'down';
  return 'neutral';
}

function sentimentFromScore(score) {
  if (score >= 65) return 'Risk On';
  if (score <= 35) return 'Risk Off';
  return 'Neutral';
}

// --- Resolve 10Y yield (FRED primary, FMP fallback) ---
function getTreasury10y(fred, fmp) {
  if (fred.treasury10y != null && !Number.isNaN(fred.treasury10y)) return fred.treasury10y;
  const t = fmp.treasury;
  if (t && (t.year10 != null || t.year10Yield != null)) return Number(t.year10 ?? t.year10Yield);
  return null;
}

// --- Regime logic ---
function buildMarketRegime(fred, finnhub, fmp) {
  const treasury = getTreasury10y(fred, fmp);
  const hasRates = treasury != null && !Number.isNaN(treasury);
  const regime = hasRates && treasury > 4 ? 'Rate Sensitivity' : hasRates && treasury < 3.5 ? 'Growth / Low Rates' : 'Mixed';
  const primary = hasRates ? 'Bond Yields' : 'Macro Data';
  const secondary = 'US Economic Data';
  const pulseScore = buildMarketPulse(fred, finnhub, fmp).score;
  const marketSentiment = sentimentFromScore(pulseScore);
  return {
    currentRegime: regime,
    primaryDriver: primary,
    secondaryDriver: secondary,
    marketSentiment,
  };
}

// --- Pulse logic ---
function buildMarketPulse(fred, finnhub, fmp) {
  let score = 50;
  const treasury = getTreasury10y(fred, fmp);
  const eurUsd = finnhub.forex && finnhub.forex.eurUsd ? finnhub.forex.eurUsd : null;
  const gold = finnhub.forex && finnhub.forex.gold ? finnhub.forex.gold : null;

  if (eurUsd && eurUsd.dp != null) {
    if (eurUsd.dp > 0) score -= 8;
    else if (eurUsd.dp < 0) score += 8;
  }
  if (gold && gold.dp != null) {
    if (gold.dp > 0) score += 10;
    else if (gold.dp < 0) score -= 10;
  }
  if (treasury != null && treasury > 4.2) score -= 5;
  else if (treasury != null && treasury < 3.5) score += 5;

  score = Math.max(0, Math.min(100, score));
  const state = sentimentFromScore(score);
  const label = state === 'Risk On' ? 'RISK ON' : state === 'Risk Off' ? 'RISK OFF' : 'NEUTRAL';
  return { state, score, label };
}

// --- Key drivers ---
function buildKeyDrivers(fred, finnhub, fmp) {
  const drivers = [];
  const treasury = getTreasury10y(fred, fmp);
  const eurUsd = finnhub.forex && finnhub.forex.eurUsd ? finnhub.forex.eurUsd : null;
  const gold = finnhub.forex && finnhub.forex.gold ? finnhub.forex.gold : null;

  drivers.push({
    name: 'Bond Yields',
    direction: treasury != null && treasury > 4 ? 'up' : treasury != null && treasury < 3.5 ? 'down' : 'neutral',
    impact: 'high',
    biasLabel: treasury != null ? (treasury > 4 ? 'Rising' : treasury < 3.5 ? 'Falling' : 'Stable') : '—',
    value: treasury != null ? `${Number(treasury).toFixed(2)}%` : undefined,
  });
  drivers.push({
    name: 'US Dollar',
    direction: eurUsd && eurUsd.dp != null ? (eurUsd.dp < 0 ? 'up' : eurUsd.dp > 0 ? 'down' : 'neutral') : 'neutral',
    impact: 'medium',
    biasLabel: eurUsd && eurUsd.dp != null ? (eurUsd.dp < 0 ? 'Strong' : 'Weak') : '—',
  });
  drivers.push({
    name: 'Oil Prices',
    direction: 'neutral',
    impact: 'low',
    biasLabel: '—',
  });
  drivers.push({
    name: 'Geopolitical Risk',
    direction: 'neutral',
    impact: 'medium',
    biasLabel: 'Monitor',
  });
  return drivers;
}

// --- Cross-asset signals ---
function buildCrossAssetSignals(fred, finnhub, fmp) {
  const signals = [];
  const treasury = getTreasury10y(fred, fmp);
  const eurUsd = finnhub.forex && finnhub.forex.eurUsd ? finnhub.forex.eurUsd : null;
  const gold = finnhub.forex && finnhub.forex.gold ? finnhub.forex.gold : null;

  signals.push({
    asset: 'Yields',
    signal: treasury != null && treasury > 4 ? 'Rising' : treasury != null && treasury < 3.5 ? 'Falling' : 'Neutral',
    direction: treasury != null && treasury > 4 ? 'up' : treasury != null && treasury < 3.5 ? 'down' : 'neutral',
    strength: treasury != null && (treasury > 4.5 || treasury < 3) ? 'strong' : 'moderate',
  });
  signals.push({
    asset: 'USD',
    signal: eurUsd && eurUsd.dp != null ? (eurUsd.dp < 0 ? 'Strong' : 'Weak') : 'Neutral',
    direction: eurUsd && eurUsd.dp != null ? (eurUsd.dp < 0 ? 'up' : eurUsd.dp > 0 ? 'down' : 'neutral') : 'neutral',
  });
  signals.push({
    asset: 'Gold',
    signal: gold && gold.dp != null ? (gold.dp > 0 ? 'Bullish' : gold.dp < 0 ? 'Bearish' : 'Neutral') : 'Neutral',
    direction: gold && gold.dp != null ? (gold.dp > 0 ? 'up' : gold.dp < 0 ? 'down' : 'neutral') : 'neutral',
  });
  signals.push({ asset: 'Stocks', signal: 'Neutral', direction: 'neutral' });
  signals.push({ asset: 'Oil', signal: '—', direction: 'neutral' });
  return signals;
}

// --- Market Change Today (from news themes) ---
function buildMarketChangesToday(finnhub, fmp) {
  const items = [];
  const headlines = []
    .concat((finnhub.news || []).map((n) => n.headline))
    .concat((fmp.news || []).map((n) => n.title))
    .filter(Boolean);
  const seen = new Set();
  const themes = [
    { keywords: ['fed', 'rate', 'interest', 'fomc', 'powell'], title: 'Fed policy in focus' },
    { keywords: ['cpi', 'inflation', 'consumer price'], title: 'Inflation data in focus' },
    { keywords: ['jobs', 'employment', 'nfp', 'nonfarm', 'unemployment'], title: 'Labour market in focus' },
    { keywords: ['treasury', 'yield', 'bond', '10-year'], title: 'Bond yields driving moves' },
    { keywords: ['dollar', 'usd', 'greenback', 'eur', 'euro'], title: 'USD strength in focus' },
    { keywords: ['gold', 'xau', 'precious'], title: 'Gold reacting to macro' },
    { keywords: ['geopolitic', 'war', 'tension', 'election'], title: 'Geopolitical risk in focus' },
  ];
  for (const t of themes) {
    const match = headlines.some((h) => t.keywords.some((k) => (h || '').toLowerCase().includes(k)));
    if (match && !seen.has(t.title)) {
      seen.add(t.title);
      items.push({ title: t.title, priority: 'medium' });
    }
  }
  if (items.length === 0) {
    items.push({ title: 'Macro and rates driving sentiment', priority: 'medium' });
    items.push({ title: 'Watch USD and bond yields', priority: 'low' });
  }
  return items.slice(0, 6);
}

// --- Trader Focus ---
function buildTraderFocus(fred, finnhub, keyDrivers, crossAssetSignals) {
  const focus = [];
  if (fred.treasury10y != null) focus.push({ title: 'Watch US bond yields', reason: 'Primary macro driver' });
  const usdSignal = (crossAssetSignals || []).find((s) => s.asset === 'USD');
  if (usdSignal && usdSignal.direction !== 'neutral') focus.push({ title: 'Monitor EURUSD reaction to USD', reason: 'FX sensitivity' });
  focus.push({ title: "Track gold's reaction to real yields", reason: 'Inverse correlation' });
  if ((keyDrivers || []).some((d) => d.name === 'Bond Yields' && d.direction === 'up')) focus.push({ title: 'Rate-sensitive assets under pressure', reason: 'Yields rising' });
  return focus.slice(0, 5);
}

// --- Risk Radar (from FMP economic calendar) ---
function buildRiskRadar(fmp) {
  const calendar = fmp.economicCalendar || [];
  const highKeywords = ['cpi', 'inflation', 'nfp', 'employment', 'nonfarm', 'fomc', 'fed', 'interest rate', 'gdp'];
  const mediumKeywords = ['pmi', 'retail', 'consumer', 'speech', 'powell', 'treasury'];
  const mapItem = (e) => {
    const name = (e.name || e.event || '').toString();
    const lower = name.toLowerCase();
    let severity = 'low';
    if (highKeywords.some((k) => lower.includes(k))) severity = 'high';
    else if (mediumKeywords.some((k) => lower.includes(k))) severity = 'medium';
    return {
      title: name || 'Economic release',
      time: e.date || undefined,
      severity,
      category: e.country || 'US',
    };
  };
  const sorted = calendar
    .slice()
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 12)
    .map(mapItem);
  if (sorted.length === 0) {
    return [
      { title: 'Upcoming CPI Report', severity: 'high', category: 'US' },
      { title: 'Fed speakers this week', severity: 'medium', category: 'US' },
      { title: 'Geopolitical tensions', severity: 'medium', category: 'Global' },
    ];
  }
  return sorted;
}

// --- Main engine ---
function buildPayload(fred, finnhub, fmp) {
  const marketPulse = buildMarketPulse(fred, finnhub, fmp);
  const marketRegime = buildMarketRegime(fred, finnhub, fmp);
  const keyDrivers = buildKeyDrivers(fred, finnhub, fmp);
  const crossAssetSignals = buildCrossAssetSignals(fred, finnhub, fmp);
  const marketChangesToday = buildMarketChangesToday(finnhub, fmp);
  const traderFocus = buildTraderFocus(fred, finnhub, keyDrivers, crossAssetSignals);
  const riskRadar = buildRiskRadar(fmp);

  return {
    marketRegime,
    marketPulse,
    keyDrivers,
    crossAssetSignals,
    marketChangesToday,
    traderFocus,
    riskRadar,
    updatedAt: new Date().toISOString(),
  };
}

async function runEngine() {
  const [finnhub, fmp, fred] = await Promise.all([
    getFinnhubData().catch((e) => ({ news: [], forex: {}, errors: [e.message] })),
    getFmpData().catch((e) => ({ economicCalendar: [], news: [], treasury: null, errors: [e.message] })),
    getFredData().catch((e) => ({ treasury10y: null, cpi: null, unemployment: null, raw: {}, errors: [e.message] })),
  ]);

  return buildPayload(fred, finnhub, fmp);
}

module.exports = { runEngine, buildPayload };
