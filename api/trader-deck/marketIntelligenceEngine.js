/**
 * Market Intelligence Engine – builds Trader Deck dashboard payload from normalized API data.
 * Rule-based regime, pulse, drivers, cross-asset, market changes, trader focus, risk radar.
 */

const { getFinnhubData } = require('./services/finnhubService');
const { getFmpData } = require('./services/fmpService');
const { getFredData } = require('./services/fredService');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');

async function getTwelveDataQuote(symbol) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 7000);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.close && !data.code) {
      const close = parseFloat(data.close);
      const prev = parseFloat(data.previous_close);
      if (isNaN(close) || close <= 0) return null;
      const d = isNaN(prev) ? 0 : close - prev;
      const dp = isNaN(prev) || prev === 0 ? 0 : (d / prev) * 100;
      return { c: close, pc: prev, d, dp };
    }
  } catch (e) {
    console.warn('[trader-deck] Twelve Data quote error:', symbol, e.message || e);
  }
  return null;
}

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
function buildMarketRegime(fred, finnhub, fmp, spxQuote) {
  const treasury = getTreasury10y(fred, fmp);
  const hasRates = treasury != null && !Number.isNaN(treasury);
  const regime = hasRates && treasury > 4 ? 'Rate Sensitivity' : hasRates && treasury < 3.5 ? 'Growth / Low Rates' : 'Mixed';
  const primary = hasRates ? 'Bond Yields' : 'Macro Data';
  const secondary = 'US Economic Data';
  const pulseScore = buildMarketPulse(fred, finnhub, fmp, spxQuote).score;
  const marketSentiment = sentimentFromScore(pulseScore);
  return {
    currentRegime: regime,
    primaryDriver: primary,
    secondaryDriver: secondary,
    marketSentiment,
  };
}

// --- Pulse logic ---
function buildMarketPulse(fred, finnhub, fmp, spxQuote) {
  let score = 50;
  const treasury = getTreasury10y(fred, fmp);
  const eurUsd = finnhub.forex && finnhub.forex.eurUsd ? finnhub.forex.eurUsd : null;
  const gold = finnhub.forex && finnhub.forex.gold ? finnhub.forex.gold : null;
  const oil = finnhub.forex && finnhub.forex.oil ? finnhub.forex.oil : null;

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
  if (spxQuote && spxQuote.dp != null) {
    if (spxQuote.dp > 0.5) score += 8;
    else if (spxQuote.dp < -0.5) score -= 8;
    else if (spxQuote.dp > 0) score += 3;
    else if (spxQuote.dp < 0) score -= 3;
  }
  if (oil && oil.dp != null) {
    if (oil.dp > 2) score -= 3;
    else if (oil.dp < -2) score += 3;
  }

  score = Math.max(0, Math.min(100, score));
  const state = sentimentFromScore(score);
  const label = state === 'Risk On' ? 'RISK ON' : state === 'Risk Off' ? 'RISK OFF' : 'NEUTRAL';
  return { state, score, label };
}

// --- Key drivers ---
function buildKeyDrivers(fred, finnhub, fmp, spxQuote) {
  const drivers = [];
  const treasury = getTreasury10y(fred, fmp);
  const eurUsd = finnhub.forex && finnhub.forex.eurUsd ? finnhub.forex.eurUsd : null;
  const oil = finnhub.forex && finnhub.forex.oil ? finnhub.forex.oil : null;

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
  const oilDp = oil && oil.dp != null ? oil.dp : null;
  const oilPrice = oil && oil.c != null ? oil.c : null;
  drivers.push({
    name: 'Oil Prices',
    direction: oilDp != null ? (oilDp > 0.3 ? 'up' : oilDp < -0.3 ? 'down' : 'neutral') : 'neutral',
    impact: 'medium',
    biasLabel: oilDp != null ? (oilDp > 0.3 ? 'Rising' : oilDp < -0.3 ? 'Falling' : 'Stable') : '—',
    value: oilPrice != null ? `$${Number(oilPrice).toFixed(2)}` : undefined,
  });
  const spxDp = spxQuote && spxQuote.dp != null ? spxQuote.dp : null;
  drivers.push({
    name: 'Equity Markets',
    direction: spxDp != null ? (spxDp > 0.3 ? 'up' : spxDp < -0.3 ? 'down' : 'neutral') : 'neutral',
    impact: 'high',
    biasLabel: spxDp != null ? (spxDp > 0.5 ? 'Bullish' : spxDp < -0.5 ? 'Bearish' : 'Flat') : '—',
    value: spxQuote && spxQuote.c ? `${Number(spxQuote.c).toFixed(0)}` : undefined,
  });
  return drivers;
}

// --- Cross-asset signals ---
function buildCrossAssetSignals(fred, finnhub, fmp, spxQuote) {
  const signals = [];
  const treasury = getTreasury10y(fred, fmp);
  const eurUsd = finnhub.forex && finnhub.forex.eurUsd ? finnhub.forex.eurUsd : null;
  const gold = finnhub.forex && finnhub.forex.gold ? finnhub.forex.gold : null;
  const oil = finnhub.forex && finnhub.forex.oil ? finnhub.forex.oil : null;

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
  const spxDp = spxQuote && spxQuote.dp != null ? spxQuote.dp : null;
  signals.push({
    asset: 'Stocks',
    signal: spxDp != null ? (spxDp > 0.5 ? 'Bullish' : spxDp < -0.5 ? 'Bearish' : spxDp > 0 ? 'Mildly Bullish' : 'Mildly Bearish') : 'Neutral',
    direction: spxDp != null ? (spxDp > 0.2 ? 'up' : spxDp < -0.2 ? 'down' : 'neutral') : 'neutral',
  });
  const oilDp = oil && oil.dp != null ? oil.dp : null;
  signals.push({
    asset: 'Oil',
    signal: oilDp != null ? (oilDp > 0.5 ? 'Rising' : oilDp < -0.5 ? 'Falling' : 'Stable') : 'Neutral',
    direction: oilDp != null ? (oilDp > 0.3 ? 'up' : oilDp < -0.3 ? 'down' : 'neutral') : 'neutral',
  });
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
function buildPayload(fred, finnhub, fmp, spxQuote) {
  const marketPulse = buildMarketPulse(fred, finnhub, fmp, spxQuote);
  const marketRegime = buildMarketRegime(fred, finnhub, fmp, spxQuote);
  const keyDrivers = buildKeyDrivers(fred, finnhub, fmp, spxQuote);
  const crossAssetSignals = buildCrossAssetSignals(fred, finnhub, fmp, spxQuote);
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
  const [finnhub, fmp, fred, spxQuote] = await Promise.all([
    getFinnhubData().catch((e) => ({ news: [], forex: {}, errors: [e.message] })),
    getFmpData().catch((e) => ({ economicCalendar: [], news: [], treasury: null, errors: [e.message] })),
    getFredData().catch((e) => ({ treasury10y: null, cpi: null, unemployment: null, raw: {}, errors: [e.message] })),
    getTwelveDataQuote('SPX').catch(() => null),
  ]);

  return buildPayload(fred, finnhub, fmp, spxQuote);
}

module.exports = { runEngine, buildPayload };
