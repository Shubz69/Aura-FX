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

async function getFearAndGreedIndex() {
  try {
    const url = 'https://api.alternative.me/fng/?limit=1&format=json';
    const res = await fetchWithTimeout(url, {}, 6000);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.data && json.data[0]) {
      const val = parseInt(json.data[0].value, 10);
      const classification = json.data[0].value_classification || '';
      if (!isNaN(val) && val >= 0 && val <= 100) return { score: val, classification };
    }
  } catch (e) {
    console.warn('[trader-deck] Fear & Greed error:', e.message || e);
  }
  return null;
}

async function getAlphaVantageRSI() {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://www.alphavantage.co/query?function=RSI&symbol=SPY&interval=daily&time_period=14&series_type=close&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    const json = await res.json();
    const analysis = json && json['Technical Analysis: RSI'];
    if (analysis) {
      const keys = Object.keys(analysis);
      if (keys.length > 0) {
        const rsi = parseFloat(analysis[keys[0]]['RSI']);
        if (!isNaN(rsi) && rsi > 0) return rsi;
      }
    }
  } catch (e) {
    console.warn('[trader-deck] Alpha Vantage RSI error:', e.message || e);
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

/** Latest vs prior FRED 10Y observation → intraday-style direction for traders (not level vs 4%). */
function getTreasuryRecentDirection(fred) {
  const arr = fred && fred.raw && Array.isArray(fred.raw.treasury) ? fred.raw.treasury : [];
  const valid = arr
    .filter((o) => o && o.value != null && o.value !== '.' && !Number.isNaN(Number(o.value)))
    .map((o) => ({ date: o.date, v: Number(o.value) }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (valid.length < 2) return null;
  const latest = valid[0].v;
  const prev = valid[1].v;
  if (!Number.isFinite(latest) || !Number.isFinite(prev) || prev === 0) return null;
  const chgPct = ((latest - prev) / Math.abs(prev)) * 100;
  if (Math.abs(chgPct) < 0.015) return { direction: 'neutral', changePct: chgPct, level: latest };
  return {
    direction: chgPct > 0 ? 'up' : 'down',
    changePct: chgPct,
    level: latest,
  };
}

// --- Regime logic ---
function buildMarketRegime(fred, finnhub, fmp, spxQuote, fng) {
  const treasury = getTreasury10y(fred, fmp);
  const hasRates = treasury != null && !Number.isNaN(treasury);
  const regime = hasRates && treasury > 4 ? 'Rate Sensitivity' : hasRates && treasury < 3.5 ? 'Growth / Low Rates' : 'Mixed';
  const primary = hasRates ? 'Bond Yields' : 'Macro Data';
  const secondary = 'US Economic Data';
  const pulseScore = buildMarketPulse(fred, finnhub, fmp, spxQuote, fng).score;
  const marketSentiment = sentimentFromScore(pulseScore);
  return {
    currentRegime: regime,
    primaryDriver: primary,
    secondaryDriver: secondary,
    marketSentiment,
  };
}

// --- Pulse logic ---
function buildMarketPulse(fred, finnhub, fmp, spxQuote, fng) {
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
  if (fng && fng.score != null) {
    score = Math.round(score * 0.65 + fng.score * 0.35);
  }

  score = Math.max(0, Math.min(100, score));
  const state = sentimentFromScore(score);
  const label = state === 'Risk On' ? 'RISK ON' : state === 'Risk Off' ? 'RISK OFF' : 'NEUTRAL';
  return { state, score, label, fng: fng || null };
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
// USD "direction" = DXY-style: up = USD stronger (EURUSD down). Yields "direction" = recent change in 10Y when FRED series allows.
function buildCrossAssetSignals(fred, finnhub, fmp, spxQuote, rsi) {
  const signals = [];
  const treasury = getTreasury10y(fred, fmp);
  const yRecent = getTreasuryRecentDirection(fred);
  const eurUsd = finnhub.forex && finnhub.forex.eurUsd ? finnhub.forex.eurUsd : null;
  const gold = finnhub.forex && finnhub.forex.gold ? finnhub.forex.gold : null;
  const oil = finnhub.forex && finnhub.forex.oil ? finnhub.forex.oil : null;

  let yieldDir = 'neutral';
  let yieldSig = 'Neutral';
  let yieldStrength = 'moderate';
  if (yRecent && yRecent.direction !== 'neutral') {
    yieldDir = yRecent.direction;
    yieldSig = yRecent.direction === 'up' ? 'Rising (latest vs prior close)' : 'Falling (latest vs prior close)';
    yieldStrength = Math.abs(yRecent.changePct || 0) > 2 ? 'strong' : 'moderate';
  } else if (treasury != null) {
    yieldSig =
      treasury > 4.2 ? `Elevated (${treasury.toFixed(2)}%)` : treasury < 3.4 ? `Low (${treasury.toFixed(2)}%)` : `Mid (${treasury.toFixed(2)}%)`;
    yieldDir = 'neutral';
    yieldStrength = treasury > 4.5 || treasury < 3 ? 'strong' : 'moderate';
  }
  signals.push({
    asset: 'Yields',
    signal: yieldSig,
    direction: yieldDir,
    strength: yieldStrength,
  });

  const eurDp = eurUsd && eurUsd.dp != null ? Number(eurUsd.dp) : null;
  // EURUSD ↓ ⇒ USD stronger ⇒ USD direction "up"
  signals.push({
    asset: 'USD',
    signal:
      eurDp != null ? (eurDp < -0.02 ? 'Stronger (EURUSD lower)' : eurDp > 0.02 ? 'Weaker (EURUSD higher)' : 'Range-bound') : 'Neutral',
    direction: eurDp != null ? (eurDp < -0.02 ? 'up' : eurDp > 0.02 ? 'down' : 'neutral') : 'neutral',
  });

  const gDp = gold && gold.dp != null ? Number(gold.dp) : null;
  signals.push({
    asset: 'Gold',
    signal:
      gDp != null ? (gDp > 0.05 ? 'Pressuring higher' : gDp < -0.05 ? 'Softening' : 'Sideways') : 'Neutral',
    direction: gDp != null ? (gDp > 0.05 ? 'up' : gDp < -0.05 ? 'down' : 'neutral') : 'neutral',
  });

  const spxDp = spxQuote && spxQuote.dp != null ? spxQuote.dp : null;
  signals.push({
    asset: 'Stocks',
    signal:
      spxDp != null
        ? spxDp > 0.5
          ? 'Risk-on (broadly up)'
          : spxDp < -0.5
            ? 'Risk-off (broadly down)'
            : spxDp > 0
              ? 'Mild bid'
              : spxDp < 0
                ? 'Mild offer'
                : 'Flat'
        : 'Neutral',
    direction: spxDp != null ? (spxDp > 0.15 ? 'up' : spxDp < -0.15 ? 'down' : 'neutral') : 'neutral',
  });

  const oilDp = oil && oil.dp != null ? oil.dp : null;
  signals.push({
    asset: 'Oil',
    signal: oilDp != null ? (oilDp > 0.4 ? 'Firm' : oilDp < -0.4 ? 'Heavy' : 'Steady') : 'Neutral',
    direction: oilDp != null ? (oilDp > 0.25 ? 'up' : oilDp < -0.25 ? 'down' : 'neutral') : 'neutral',
  });

  if (rsi != null) {
    signals.push({
      asset: 'RSI(SPY)',
      signal:
        rsi > 70
          ? `Overbought (${rsi.toFixed(1)}) — pullback risk`
          : rsi < 30
            ? `Oversold (${rsi.toFixed(1)}) — bounce risk`
            : `Neutral zone (${rsi.toFixed(1)})`,
      direction: 'neutral',
    });
  }
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

// --- Risk Radar: high-signal calendar + headline “watch” lines (deduped, capped) ---
const RR_HORIZON_DAYS = 10;
const RR_MAX_CALENDAR = 7;
const RR_MAX_TOTAL = 8;

function parseEventTimeMs(raw) {
  if (!raw) return NaN;
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? NaN : t;
}

function dayKeyFromMs(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Importance from FMP/TE: higher = more market-moving. */
function importanceToBaseScore(imp) {
  if (imp == null || imp === '') return 0;
  if (typeof imp === 'string') {
    const s = imp.toLowerCase().trim();
    if (s === 'high' || s === '3') return 45;
    if (s === 'medium' || s === '2') return 28;
    if (s === 'low' || s === '1') return 12;
  }
  const n = Number(imp);
  if (Number.isNaN(n)) return 0;
  if (n >= 3) return 45;
  if (n >= 2) return 28;
  if (n >= 1) return 12;
  return 0;
}

/** Keyword tier scores — prioritize what FX/macro desks actually trade. */
function keywordScoreForEvent(name) {
  const lower = (name || '').toLowerCase();
  const tier1 = [
    'fomc',
    'federal funds',
    'interest rate decision',
    'rate decision',
    'nonfarm payroll',
    'employment situation',
    'cpi ',
    'consumer price index',
    'core cpi',
    'pce price',
    'core pce',
    'gdp advance',
    'gdp preliminary',
    'gdp final',
    'gross domestic product',
  ];
  const tier2 = [
    'nfp',
    'ppi ',
    'producer price',
    'retail sales',
    'ism ',
    'pmi ',
    'consumer confidence',
    'jobless claims',
    'initial claims',
    'jolts',
    'powell',
    'fomc minutes',
    'treasury',
    'auction',
    'housing starts',
    'building permits',
  ];
  if (tier1.some((k) => lower.includes(k.trim()))) return 95;
  if (tier2.some((k) => lower.includes(k.trim()))) return 55;
  if (/\bcpi\b|\binflation\b|\bemployment\b|\bnon[- ]?farm\b|\bgdp\b|\bfed\b/.test(lower)) return 40;
  return 15;
}

function severityFromScore(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

function calendarRowScore(e) {
  const name = (e.name || e.event || '').toString();
  const imp = e.importance != null ? e.importance : e.full && (e.full.importance || e.full.impact);
  let score = importanceToBaseScore(imp) + keywordScoreForEvent(name);
  const country = (e.country || '').toLowerCase();
  if (country === 'us' || country === 'usa' || country === 'united states' || country === 'usd') score += 8;
  return score;
}

function currencyLabelFromCountry(country) {
  const c = (country || '').toLowerCase().trim();
  if (!c) return 'USD';
  if (c === 'us' || c === 'usa' || c.includes('united states')) return 'USD';
  if (c === 'eu' || c === 'ez' || c.includes('euro zone') || c === 'de' || c === 'fr') return 'EUR';
  if (c === 'gb' || c === 'uk' || c.includes('united kingdom')) return 'GBP';
  if (c === 'jp' || c.includes('japan')) return 'JPY';
  if (c === 'ch' || c.includes('switzerland')) return 'CHF';
  if (c === 'ca' || c.includes('canada')) return 'CAD';
  if (c === 'au' || c.includes('australia')) return 'AUD';
  if (c === 'nz' || c.includes('new zealand')) return 'NZD';
  if (c.length <= 4 && /^[a-z]{2,3}$/i.test(c)) return c.toUpperCase();
  return 'GLB';
}

function normalizeCalendarEventToRadar(e) {
  const full = e.full && typeof e.full === 'object' ? e.full : {};
  const name = (e.name || e.event || full.name || full.event || '').toString() || 'Economic release';
  const dateStr = e.date || full.date || full.releaseDate || full.time || '';
  const country = (e.country || full.country || 'US').toString();
  const forecast = full.estimate ?? full.forecast ?? full.eps ?? null;
  const previous = full.previous ?? full.prior ?? null;
  const actual = full.actual ?? full.value ?? null;
  const sc = calendarRowScore(e);
  return {
    title: name,
    time: dateStr || undefined,
    severity: severityFromScore(sc),
    impact: severityFromScore(sc),
    category: country,
    currency: currencyLabelFromCountry(country),
    forecast,
    previous,
    actual,
    _ms: parseEventTimeMs(dateStr),
    _score: sc,
  };
}

function buildRiskRadar(fmp, finnhub) {
  const calendar = Array.isArray(fmp.economicCalendar) ? fmp.economicCalendar : [];
  const now = Date.now();
  const horizonMs = now + RR_HORIZON_DAYS * 24 * 60 * 60 * 1000;
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const rows = [];
  const dedupe = new Set();

  for (const raw of calendar) {
    const e = normalizeCalendarEventToRadar(raw);
    const ms = e._ms;
    if (Number.isNaN(ms) || ms < startOfToday.getTime() || ms > horizonMs) continue;
    const dk = `${dayKeyFromMs(ms)}|${(e.title || '').toLowerCase().trim()}`;
    if (dedupe.has(dk)) continue;
    dedupe.add(dk);
    rows.push(e);
  }

  rows.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return (a._ms || 0) - (b._ms || 0);
  });

  const calendarOut = rows.slice(0, RR_MAX_CALENDAR).map((r) => {
    const { _ms, _score, ...rest } = r;
    return rest;
  });

  const calTitlesLower = new Set(calendarOut.map((r) => (r.title || '').toLowerCase()));

  const headlineWatch = buildRiskRadarHeadlineWatch(finnhub, fmp, calTitlesLower);
  const merged = [...calendarOut, ...headlineWatch].slice(0, RR_MAX_TOTAL);

  if (merged.length === 0) {
    return [
      { title: 'High-impact US data (CPI, NFP, GDP) — check calendar', severity: 'high', impact: 'high', currency: 'USD' },
      { title: 'Fed guidance & yields — watch headlines', severity: 'medium', impact: 'medium', currency: 'USD' },
      { title: 'Geopolitical headlines — risk flows', severity: 'medium', impact: 'medium', currency: 'GLB' },
    ];
  }
  return merged;
}

/** Short “market watch” lines from headlines when they add context calendar rows don’t cover. */
function buildRiskRadarHeadlineWatch(finnhub, fmp, calendarTitlesLower) {
  const headlines = []
    .concat((finnhub.news || []).map((n) => n.headline))
    .concat((fmp.news || []).map((n) => n.title))
    .filter(Boolean);
  const blob = headlines.join(' ').toLowerCase();

  const themes = [
    { keys: ['fomc', 'fed ', 'powell', 'interest rate'], title: 'Headlines: Fed / rates in focus', minMatch: 1 },
    { keys: ['cpi', 'inflation', 'consumer price'], title: 'Headlines: inflation narrative active', minMatch: 1 },
    { keys: ['nfp', 'nonfarm', 'jobs report', 'employment'], title: 'Headlines: labour market in focus', minMatch: 1 },
    { keys: ['treasury', 'yield', '10-year', 'bond'], title: 'Headlines: yield curve / bonds moving', minMatch: 1 },
    { keys: ['dollar', 'usd', 'euro', 'eurusd'], title: 'Headlines: USD & FX volatility', minMatch: 1 },
    { keys: ['geopolitic', 'war', 'sanction', 'election'], title: 'Headlines: geopolitical risk', minMatch: 1 },
  ];

  const out = [];
  const used = new Set();

  function overlapsCalendar(title) {
    const t = title.toLowerCase();
    for (const c of calendarTitlesLower) {
      if (!c) continue;
      if (c.includes('fomc') && t.includes('fed')) return true;
      if (c.includes('cpi') && t.includes('inflation')) return true;
      if ((c.includes('nfp') || c.includes('payroll')) && t.includes('labour')) return true;
    }
    return false;
  }

  for (const th of themes) {
    const hits = th.keys.filter((k) => blob.includes(k));
    if (hits.length < th.minMatch) continue;
    if (used.has(th.title)) continue;
    if (overlapsCalendar(th.title)) continue;
    used.add(th.title);
    out.push({
      title: th.title,
      time: undefined,
      severity: 'medium',
      impact: 'medium',
      currency: 'NEWS',
      category: 'Headline',
    });
    if (out.length >= 2) break;
  }
  return out;
}

function collectHeadlineSample(finnhub, fmp) {
  const a = (finnhub.news || []).map((n) => n.headline).filter(Boolean);
  const b = (fmp.news || []).map((n) => n.title).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const h of [...a, ...b]) {
    const t = (h || '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 14) break;
  }
  return out;
}

// --- Main engine ---
function buildPayload(fred, finnhub, fmp, spxQuote, fng, rsi) {
  const marketPulse = buildMarketPulse(fred, finnhub, fmp, spxQuote, fng);
  const marketRegime = buildMarketRegime(fred, finnhub, fmp, spxQuote, fng);
  const keyDrivers = buildKeyDrivers(fred, finnhub, fmp, spxQuote);
  const crossAssetSignals = buildCrossAssetSignals(fred, finnhub, fmp, spxQuote, rsi);
  const marketChangesToday = buildMarketChangesToday(finnhub, fmp);
  const traderFocus = buildTraderFocus(fred, finnhub, keyDrivers, crossAssetSignals);
  const riskRadar = buildRiskRadar(fmp, finnhub);
  const headlineSample = collectHeadlineSample(finnhub, fmp);

  return {
    marketRegime,
    marketPulse,
    keyDrivers,
    crossAssetSignals,
    marketChangesToday,
    traderFocus,
    riskRadar,
    headlineSample,
    updatedAt: new Date().toISOString(),
  };
}

async function runEngine() {
  const [finnhub, fmp, fred, spxQuote, fng, rsi] = await Promise.all([
    getFinnhubData().catch((e) => ({ news: [], forex: {}, errors: [e.message] })),
    getFmpData().catch((e) => ({ economicCalendar: [], news: [], treasury: null, errors: [e.message] })),
    getFredData().catch((e) => ({ treasury10y: null, cpi: null, unemployment: null, raw: {}, errors: [e.message] })),
    getTwelveDataQuote('SPX').catch(() => null),
    getFearAndGreedIndex().catch(() => null),
    getAlphaVantageRSI().catch(() => null),
  ]);

  return buildPayload(fred, finnhub, fmp, spxQuote, fng, rsi);
}

module.exports = { runEngine, buildPayload };
