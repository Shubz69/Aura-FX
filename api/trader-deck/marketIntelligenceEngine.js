/**
 * Market Intelligence Engine – builds Trader Deck dashboard payload from normalized API data.
 * Rule-based regime, pulse, drivers, cross-asset, market changes, trader focus, risk radar.
 */

const { getFinnhubData } = require('./services/finnhubService');
const { getFmpData } = require('./services/fmpService');
const { getFredData } = require('./services/fredService');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { toCanonical, usesForexSessionContext } = require('../ai/utils/symbol-registry');
const {
  buildSessionContext,
  alignPulseObservationalNotes,
} = require('./marketOutlookSessionContext');

async function getTwelveDataQuote(symbol) {
  try {
    const { fetchQuoteDto } = require('../market-data/marketDataLayer');
    const { changeVsPreviousClose, changeVsPreviousCloseOnly } = require('../market-data/priceMath');
    const canonical = toCanonical(symbol);
    const tdFeat = usesForexSessionContext(canonical) ? 'fx-trader-deck' : 'trader-deck';
    const dto = await fetchQuoteDto(canonical, { feature: tdFeat });
    if (!dto || dto.last == null || !Number.isFinite(dto.last) || dto.last <= 0) return null;
    const c = dto.last;
    const vs = changeVsPreviousClose(dto);
    const vsOnly = changeVsPreviousCloseOnly(dto);
    if (usesForexSessionContext(canonical)) {
      if (vsOnly.changePct == null || !Number.isFinite(vsOnly.changePct)) return null;
      return {
        c,
        pc: dto.prevClose != null && Number.isFinite(dto.prevClose) ? dto.prevClose : null,
        d: vsOnly.change,
        dp: vsOnly.changePct,
      };
    }
    let pc = dto.prevClose;
    if (pc == null || !Number.isFinite(pc)) pc = dto.open;
    if (pc == null || !Number.isFinite(pc)) return null;
    const d = c - pc;
    const dp = vs.changePct != null && Number.isFinite(vs.changePct) ? vs.changePct : pc !== 0 ? (d / Math.abs(pc)) * 100 : 0;
    return { c, pc, d, dp };
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
  return 'Mixed';
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
function buildMarketRegime(fred, finnhub, fmp, spxQuote, fng, options = {}) {
  const treasury = getTreasury10y(fred, fmp);
  const hasRates = treasury != null && !Number.isNaN(treasury);
  const regime = hasRates && treasury > 4.25
    ? 'Rate Sensitivity'
    : hasRates && treasury < 3.4
      ? 'Liquidity Driven'
      : 'Risk Rotation';
  const primary = hasRates ? 'Bond Yields' : 'Global Liquidity';
  const secondary = 'Macro Data + Commodities + Cross-asset flows';
  const pulseScore =
    options.pulseScore != null && Number.isFinite(Number(options.pulseScore))
      ? Number(options.pulseScore)
      : buildMarketPulse(fred, finnhub, fmp, spxQuote, fng).score;
  const marketSentiment = sentimentFromScore(pulseScore) === 'Mixed' ? 'Neutral / Mixed' : sentimentFromScore(pulseScore);
  const bias = sentimentFromScore(pulseScore);
  const tradeEnvironment =
    pulseScore >= 68
      ? 'Trending'
      : pulseScore <= 32
        ? 'Volatile'
        : hasRates && treasury > 4.4
          ? 'Event-Driven'
          : 'Choppy';
  const absSkew = Math.abs(pulseScore - 50);
  const biasStrength = absSkew >= 22 ? 'Strong' : absSkew >= 12 ? 'Moderate' : 'Soft';
  const convictionClarity =
    tradeEnvironment === 'Volatile' || tradeEnvironment === 'Choppy'
      ? 'Low'
      : absSkew >= 18
        ? 'Clear'
        : 'Mixed';
  return {
    currentRegime: regime,
    bias,
    primaryDriver: primary,
    secondaryDriver: secondary,
    marketSentiment,
    tradeEnvironment,
    biasStrength,
    convictionClarity,
  };
}

// --- Pulse logic ---
function buildMarketPulse(fred, finnhub, fmp, spxQuote, fng, options = {}) {
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

  const riskScore = options.riskScore != null && Number.isFinite(Number(options.riskScore))
    ? Number(options.riskScore)
    : null;
  if (riskScore != null) {
    score = Math.round(score * 0.75 + (100 - riskScore) * 0.25);
  }
  if (options.timeframe === 'weekly') {
    score = Math.round(score * 0.9 + 5);
  }

  score = Math.max(0, Math.min(100, score));
  const state = sentimentFromScore(score);
  const label = state === 'Risk On' ? 'RISK ON' : state === 'Risk Off' ? 'RISK OFF' : 'MIXED';
  const recommendedAction = [];
  if (state === 'Risk Off') {
    recommendedAction.push('Defensive risk tone visible across beta and duration legs.');
    recommendedAction.push('Cross-asset confirmation tends to be slower when yields and USD disagree.');
    recommendedAction.push('Macro catalysts can widen ranges versus drift sessions.');
  } else if (state === 'Risk On') {
    recommendedAction.push('Constructive risk tone when equities, credit, and FX beta align.');
    recommendedAction.push('Correlation persistence matters more than single-asset bursts.');
    recommendedAction.push('Scheduled data still resets correlation even in risk-on tape.');
  } else {
    recommendedAction.push('Mixed tape: two-way macro repricing without a single dominant hinge.');
    recommendedAction.push('Liquidity reshapes at session overlaps and headline clocks.');
    recommendedAction.push('Cross-asset dispersion often rises when narratives diverge by region.');
  }
  return { state, score, label, confidence: score, recommendedAction, fng: fng || null };
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
    effect: treasury > 4 ? 'Pressure on equities and gold' : 'Supportive for duration assets',
  });
  drivers.push({
    name: 'US Dollar',
    direction: eurUsd && eurUsd.dp != null ? (eurUsd.dp < 0 ? 'up' : eurUsd.dp > 0 ? 'down' : 'neutral') : 'neutral',
    impact: 'high',
    biasLabel: eurUsd && eurUsd.dp != null ? (eurUsd.dp < 0 ? 'Strong' : 'Weak') : '—',
    effect: 'FX pairs and commodities repricing around USD trend',
  });
  const oilDp = oil && oil.dp != null ? oil.dp : null;
  const oilPrice = oil && oil.c != null ? oil.c : null;
  drivers.push({
    name: 'Oil Prices',
    direction: oilDp != null ? (oilDp > 0.3 ? 'up' : oilDp < -0.3 ? 'down' : 'neutral') : 'neutral',
    impact: 'medium',
    biasLabel: oilDp != null ? (oilDp > 0.3 ? 'Rising' : oilDp < -0.3 ? 'Falling' : 'Stable') : '—',
    value: oilPrice != null ? `$${Number(oilPrice).toFixed(2)}` : undefined,
    effect: 'Inflation expectations and risk sentiment shift',
  });
  const spxDp = spxQuote && spxQuote.dp != null ? spxQuote.dp : null;
  drivers.push({
    name: 'Equity Markets',
    direction: spxDp != null ? (spxDp > 0.3 ? 'up' : spxDp < -0.3 ? 'down' : 'neutral') : 'neutral',
    impact: 'high',
    biasLabel: spxDp != null ? (spxDp > 0.5 ? 'Bullish' : spxDp < -0.5 ? 'Bearish' : 'Flat') : '—',
    value: spxQuote && spxQuote.c ? `${Number(spxQuote.c).toFixed(0)}` : undefined,
    effect: 'Global risk appetite transmission into FX and crypto',
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

  const btc = finnhub.forex && finnhub.forex.btc ? finnhub.forex.btc : null;
  const btcDp = btc && btc.dp != null ? Number(btc.dp) : null;
  signals.push({
    asset: 'Crypto',
    signal: btcDp != null ? (btcDp > 0.7 ? 'Risk appetite improving' : btcDp < -0.7 ? 'Defensive tone' : 'Range-bound') : 'Following broad risk sentiment',
    direction: btcDp != null ? (btcDp > 0.3 ? 'up' : btcDp < -0.3 ? 'down' : 'neutral') : 'neutral',
  });

  const vix = fmp && fmp.vix != null ? Number(fmp.vix) : null;
  signals.push({
    asset: 'Volatility',
    signal: vix != null ? (vix > 20 ? `Elevated (${vix.toFixed(1)})` : `Contained (${vix.toFixed(1)})`) : 'Watch for volatility clustering',
    direction: 'neutral',
  });

  if (rsi != null) {
    signals.push({
      asset: 'DXY RSI',
      signal:
        rsi > 70
          ? `Overbought (${rsi.toFixed(1)})`
          : rsi < 30
            ? `Oversold (${rsi.toFixed(1)})`
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
    { keywords: ['fed', 'rate', 'interest', 'fomc', 'powell'], title: 'Rates narrative shifted intraday and repriced risk assets' },
    { keywords: ['cpi', 'inflation', 'consumer price'], title: 'Inflation-sensitive assets adjusted to fresh macro impulse' },
    { keywords: ['jobs', 'employment', 'nfp', 'nonfarm', 'unemployment'], title: 'USD and yields reacted to labor-data surprise tone' },
    { keywords: ['treasury', 'yield', 'bond', '10-year'], title: 'Yield direction altered equity and gold momentum' },
    { keywords: ['dollar', 'usd', 'greenback', 'eur', 'euro'], title: 'USD pressure/strength rebalanced major FX pairs' },
    { keywords: ['gold', 'xau', 'precious'], title: 'Gold repriced against real-yield and risk backdrop' },
    { keywords: ['oil', 'brent', 'wti', 'opec', 'supply'], title: 'Oil tone influenced inflation expectations and risk sentiment' },
    { keywords: ['bitcoin', 'btc', 'crypto', 'ethereum'], title: 'Crypto remained a proxy for speculative risk appetite' },
    { keywords: ['geopolitic', 'war', 'tension', 'election'], title: 'Geopolitical risk added cross-asset volatility premium' },
  ];
  for (const t of themes) {
    const match = headlines.some((h) => t.keywords.some((k) => (h || '').toLowerCase().includes(k)));
    if (match && !seen.has(t.title)) {
      seen.add(t.title);
      items.push({ title: t.title, priority: 'medium' });
    }
  }
  if (items.length === 0) {
    items.push({ title: 'Cross-asset tone stayed mixed as macro and liquidity signals diverged', priority: 'medium' });
    items.push({ title: 'No dominant narrative: markets priced incremental evidence rather than a single theme', priority: 'low' });
  }
  return items.slice(0, 6);
}

function summarizeWeeklyMarketChanges(keyDrivers, crossAssetSignals, riskRadar) {
  const items = [];
  const highRisk = (riskRadar?.items || []).filter((x) => String(x?.impact || x?.severity || '').toLowerCase() === 'high').length;
  if (highRisk >= 3) {
    items.push({ title: 'High-impact event concentration is elevated this week', priority: 'high' });
  }
  const yields = (crossAssetSignals || []).find((s) => s.asset === 'Yields');
  if (yields && /rising|elevated/i.test(String(yields.signal || ''))) {
    items.push({ title: 'Yield trend remains a dominant weekly macro driver', priority: 'medium' });
  }
  const usdDriver = (keyDrivers || []).find((d) => d.name === 'US Dollar');
  if (usdDriver && usdDriver.direction !== 'neutral') {
    items.push({ title: 'USD directional pressure likely to shape majors this week', priority: 'medium' });
  }
  if (items.length === 0) {
    items.push({ title: 'Weekly tone is mixed; narrative resolution likely tracks scheduled macro releases', priority: 'medium' });
  }
  return items.slice(0, 6);
}

function crossAssetAlignmentLabel(signals) {
  if (!Array.isArray(signals)) return 'mixed';
  let up = 0;
  let down = 0;
  for (const s of signals) {
    if (!s || !s.asset || s.asset === 'Volatility' || s.asset === 'DXY RSI') continue;
    if (s.direction === 'up') up += 1;
    else if (s.direction === 'down') down += 1;
  }
  if (up >= 3 && down <= 1) return 'aligned_up';
  if (down >= 3 && up <= 1) return 'aligned_down';
  return 'mixed';
}

function dedupeFocus(items) {
  const seen = new Set();
  const out = [];
  for (const x of items) {
    const t = String(x.title || '').trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(x);
  }
  return out;
}

// --- Trader Focus (session + risk + cross-asset; rule-based) ---
function buildTraderFocus(fred, finnhub, keyDrivers, crossAssetSignals, options = {}) {
  const focus = [];
  const sc = options.sessionContext;
  const align = options.crossAlign || crossAssetAlignmentLabel(crossAssetSignals);
  const ny = sc && sc.sessions && sc.sessions.newYork;
  const ld = sc && sc.sessions && sc.sessions.london;
  const as = sc && sc.sessions && sc.sessions.asia;
  const clustering = options.clustering != null ? Number(options.clustering) : null;

  if (ny && ny.state === 'event_sensitive') {
    focus.push({
      title: 'NY high-impact windows concentrate depth and correlation resets',
      reason: 'Session context · NY event cadence',
    });
  } else if (ld && ld.state === 'event_sensitive') {
    focus.push({
      title: 'London-window prints often reprice EUR and GBP before US liquidity arrives',
      reason: 'Session context · EU/UK events',
    });
  }

  if (ny && ny.state === 'reversal_risk') {
    focus.push({
      title: 'Late-session mean-reversion risk rises after directional extension',
      reason: 'Session context · reversal tone',
    });
  }

  if ((as && as.state === 'choppy') || (ny && ny.state === 'choppy') || (ld && ld.state === 'choppy')) {
    focus.push({
      title: 'Choppy conditions often show uneven participation and headline-driven repricing',
      reason: 'Session context · choppy',
    });
  }

  if (ny && ny.state === 'trend_continuation' && align !== 'mixed') {
    focus.push({
      title: 'Trend maintenance is more plausible while cross-asset tape stays aligned',
      reason: 'Session + cross-asset alignment',
    });
  }

  if (as && as.state === 'liquidity_build' && ny && ny.state === 'range_bound') {
    focus.push({
      title: 'Asia liquidity build against NY balance can produce false breaks until depth returns',
      reason: 'Asia liquidity vs NY balance',
    });
  }

  if (clustering != null && clustering > 62) {
    focus.push({
      title: 'Macro releases cluster in time — variance can bunch into tight windows',
      reason: 'Risk engine · clustering',
    });
  }

  if (fred.treasury10y != null) {
    focus.push({ title: 'Bond yields remain the hinge between duration, gold, and USD', reason: 'Primary macro driver' });
  }
  const usdSignal = (crossAssetSignals || []).find((s) => s.asset === 'USD');
  if (usdSignal && usdSignal.direction !== 'neutral') {
    focus.push({ title: 'USD direction is filtering majors and commodity invoicing', reason: 'FX sensitivity' });
  }

  if (!(ny && ny.state === 'event_sensitive')) {
    focus.push({
      title: 'High-impact event spacing still matters for realized correlation',
      reason: 'Macro calendar structure',
    });
  }

  focus.push({
    title: 'Cross-asset dispersion often signals narrative rotation before a single theme wins',
    reason: 'Macro structure',
  });

  if ((keyDrivers || []).some((d) => d.name === 'Bond Yields' && d.direction === 'up')) {
    focus.push({ title: 'Rising yields keep rate-sensitive legs in focus for transmission', reason: 'Yields rising' });
  }
  if (options.timeframe === 'weekly') {
    focus.push({ title: 'Weekly risk windows are visible on the macro calendar ahead of liquidity shifts', reason: 'Weekly lens' });
  }
  if (String(options.riskLevel || '').toLowerCase() === 'high' || String(options.riskLevel || '').toLowerCase() === 'extreme') {
    focus.push({ title: 'Risk engine reads elevated — tails and gap risk deserve extra attention', reason: 'Risk engine state' });
  }

  return dedupeFocus(focus).slice(0, 6);
}

// --- Risk Radar: high-signal calendar + headline “watch” lines (deduped, capped) ---
const RR_HORIZON_DAYS = 10;
const RR_MAX_CALENDAR = 7;
const RR_MAX_TOTAL = 8;

function parseNaiveDateTimeParts(raw) {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] || 0),
    minute: Number(m[5] || 0),
    second: Number(m[6] || 0),
  };
}

function getOffsetMsForTimeZone(timestampMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(timestampMs));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - timestampMs;
}

function zonedDateTimeToUtcTimestamp(parts, timeZone) {
  const naiveUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let ts = naiveUtc;
  for (let i = 0; i < 2; i += 1) {
    const offset = getOffsetMsForTimeZone(ts, timeZone);
    ts = naiveUtc - offset;
  }
  return ts;
}

/** Align with api/trader-deck/economic-calendar.js — FMP/TE date strings vary. */
function parseDateToTimestamp(raw) {
  if (raw == null || raw === '') return NaN;
  const rawStr = String(raw).trim();
  if (!rawStr) return NaN;
  let parsed = Date.parse(rawStr);
  if (!Number.isNaN(parsed)) return parsed;
  const tzFixed = rawStr.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  parsed = Date.parse(tzFixed);
  if (!Number.isNaN(parsed)) return parsed;
  const naive = parseNaiveDateTimeParts(rawStr.replace('T', ' '));
  if (!naive) return NaN;
  return zonedDateTimeToUtcTimestamp(naive, 'America/New_York');
}

function parseEventTimeMs(raw) {
  return parseDateToTimestamp(raw);
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

function resolveReferenceDateMs(referenceDate) {
  if (!referenceDate || typeof referenceDate !== 'string') return Date.now();
  const parsed = Date.parse(`${referenceDate.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function buildRiskRadar(fmp, options = {}) {
  const calendar = Array.isArray(fmp.economicCalendar) ? fmp.economicCalendar : [];
  const refNow = resolveReferenceDateMs(options.referenceDate);
  const now = Date.now();
  const horizonDays = options.timeframe === 'weekly' ? 21 : RR_HORIZON_DAYS;
  const horizonMs = refNow + horizonDays * 24 * 60 * 60 * 1000;
  const startOfToday = new Date(refNow);
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

  const fallbackItems = [
      { title: 'High-impact US data (CPI, NFP, GDP) — check calendar', severity: 'high', impact: 'high', currency: 'USD' },
      { title: 'Central-bank decisions and rates path risk', severity: 'medium', impact: 'medium', currency: 'GLB' },
      { title: 'Liquidity windows around clustered releases', severity: 'medium', impact: 'medium', currency: 'GLB' },
    ];
  const radarItems = calendarOut.length === 0 ? fallbackItems : calendarOut.slice(0, RR_MAX_TOTAL);

  const eventRisk = Math.min(100, Math.round((rows.slice(0, 4).reduce((sum, r) => sum + (r._score || 0), 0) / 4) || 35));
  const highImpactCount = rows.filter((r) => (r.impact || r.severity) === 'high').length;
  const geopoliticalRisk = Math.min(90, 30 + highImpactCount * 10);
  const volatility = Math.min(100, Math.round(eventRisk * 0.65 + geopoliticalRisk * 0.35));
  const clustering = Math.min(100, Math.max(20, Math.round((rows.length / Math.max(1, horizonDays)) * 22)));
  const liquidity = rows.some((r) => (r.time || '').toLowerCase().includes('all day')) ? 58 : 46;
  const score = Math.round(eventRisk * 0.34 + geopoliticalRisk * 0.18 + volatility * 0.18 + liquidity * 0.14 + clustering * 0.16);
  const level = score >= 80 ? 'Extreme' : score >= 65 ? 'High' : score >= 45 ? 'Moderate' : 'Low';

  let nextRiskEventInMins = null;
  const nowMs = refNow > now ? now : refNow;
  for (const r of rows.sort((a, b) => (a._ms || 0) - (b._ms || 0))) {
    if (r._ms && r._ms > nowMs) {
      nextRiskEventInMins = Math.max(1, Math.round((r._ms - nowMs) / 60000));
      break;
    }
  }

  return {
    score,
    level,
    breakdown: {
      eventRisk,
      geopoliticalRisk,
      volatility,
      liquidity,
      clustering,
    },
    nextRiskEventInMins,
    items: radarItems,
    /** Internal only — stripped before API payload; used for session context rules */
    _calendarRows: rows,
  };
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
function buildPayload(fred, finnhub, fmp, spxQuote, fng, rsi, options = {}) {
  const timeframe = options.timeframe === 'weekly' ? 'weekly' : 'daily';
  const riskRadarRaw = buildRiskRadar(fmp, { timeframe, referenceDate: options.date });
  const calendarRows = riskRadarRaw._calendarRows || [];
  const riskRadar = {
    score: riskRadarRaw.score,
    level: riskRadarRaw.level,
    breakdown: riskRadarRaw.breakdown,
    nextRiskEventInMins: riskRadarRaw.nextRiskEventInMins,
    items: riskRadarRaw.items || [],
  };

  const marketPulseBase = buildMarketPulse(fred, finnhub, fmp, spxQuote, fng, {
    riskScore: riskRadar.score,
    timeframe,
  });
  const marketRegime = buildMarketRegime(fred, finnhub, fmp, spxQuote, fng, { pulseScore: marketPulseBase.score });
  const keyDrivers = buildKeyDrivers(fred, finnhub, fmp, spxQuote);
  const crossAssetSignals = buildCrossAssetSignals(fred, finnhub, fmp, spxQuote, rsi);
  const crossAlign = crossAssetAlignmentLabel(crossAssetSignals);
  const refMs = resolveReferenceDateMs(options.date);
  const vix = fmp && fmp.vix != null ? Number(fmp.vix) : null;
  const spxDp = spxQuote && spxQuote.dp != null ? Number(spxQuote.dp) : null;
  const yieldRecent = getTreasuryRecentDirection(fred);

  let sessionContext = buildSessionContext({
    referenceMs: refMs,
    marketPulse: marketPulseBase,
    pulseState: marketPulseBase.state,
    riskEngine: {
      level: riskRadar.level,
      breakdown: riskRadar.breakdown,
      score: riskRadar.score,
    },
    crossAssetSignals,
    calendarRows,
    vix,
    spxDp,
    yieldRecent,
  });

  sessionContext = gateTrendStatesForRiskOff(sessionContext, marketPulseBase.state);

  let marketPulse = alignPulseObservationalNotes(marketPulseBase, sessionContext);

  const marketChangesToday = timeframe === 'weekly'
    ? summarizeWeeklyMarketChanges(keyDrivers, crossAssetSignals, riskRadar)
    : buildMarketChangesToday(finnhub, fmp);
  const traderFocus = buildTraderFocus(fred, finnhub, keyDrivers, crossAssetSignals, {
    timeframe,
    riskLevel: riskRadar.level,
    sessionContext,
    crossAlign,
    clustering: riskRadar.breakdown && riskRadar.breakdown.clustering,
  });
  const headlineSample = collectHeadlineSample(finnhub, fmp);

  return {
    marketRegime,
    marketPulse,
    sessionContext,
    keyDrivers,
    crossAssetSignals,
    marketChangesToday,
    traderFocus,
    riskRadar: riskRadar.items || [],
    riskEngine: {
      score: riskRadar.score,
      level: riskRadar.level,
      breakdown: riskRadar.breakdown,
      nextRiskEventInMins: riskRadar.nextRiskEventInMins,
    },
    headlineSample,
    timeframe,
    updatedAt: new Date().toISOString(),
  };
}

/** If pulse is Risk Off, downgrade trend_continuation rows to range_bound for consistency */
function gateTrendStatesForRiskOff(sessionContext, pulseState) {
  if (!sessionContext || !sessionContext.sessions || pulseState !== 'Risk Off') return sessionContext;
  const sessions = { ...sessionContext.sessions };
  for (const key of ['asia', 'london', 'newYork']) {
    const row = sessions[key];
    if (!row || row.state !== 'trend_continuation') continue;
    sessions[key] = {
      ...row,
      state: 'range_bound',
      tags: Array.from(new Set([...(row.tags || []), 'mean reversion'])).slice(0, 2),
      summary: `Risk-off pulse caps follow-through; ${row.summary || ''}`.trim(),
    };
  }
  return { ...sessionContext, sessions };
}

function forexRowHasSessionChange(row) {
  return row && row.dp != null && Number.isFinite(Number(row.dp));
}

/** Prefer Twelve Data session % when available so pulse / drivers track live quotes. */
function mergeForexWithTwelveData(fhForex, tdEur, tdGold, tdOil) {
  const f = fhForex && typeof fhForex === 'object' ? fhForex : {};
  return {
    eurUsd: forexRowHasSessionChange(tdEur) ? tdEur : f.eurUsd || null,
    gold: forexRowHasSessionChange(tdGold) ? tdGold : f.gold || null,
    oil: forexRowHasSessionChange(tdOil) ? tdOil : f.oil || null,
  };
}

async function runEngine(options = {}) {
  const [finnhub, fmp, fred, spxQuote, fng, rsi, tdEur, tdGold, tdOil] = await Promise.all([
    getFinnhubData().catch((e) => ({ news: [], forex: {}, errors: [e.message] })),
    getFmpData().catch((e) => ({ economicCalendar: [], news: [], treasury: null, errors: [e.message] })),
    getFredData().catch((e) => ({ treasury10y: null, cpi: null, unemployment: null, raw: {}, errors: [e.message] })),
    getTwelveDataQuote('SPX').catch(() => null),
    getFearAndGreedIndex().catch(() => null),
    getAlphaVantageRSI().catch(() => null),
    getTwelveDataQuote('EURUSD').catch(() => null),
    getTwelveDataQuote('XAUUSD').catch(() => null),
    getTwelveDataQuote('USOIL').catch(() => null),
  ]);

  const finnhubMerged = {
    ...finnhub,
    forex: mergeForexWithTwelveData(finnhub.forex, tdEur, tdGold, tdOil),
  };

  return buildPayload(fred, finnhubMerged, fmp, spxQuote, fng, rsi, options);
}

module.exports = { runEngine, buildPayload, getTwelveDataQuote };
