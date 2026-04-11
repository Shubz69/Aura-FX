/**
 * Rule-based market relevance with directional bias when keywords are strong.
 * Pure — safe for unit tests.
 */

function eventText(event) {
  return [
    event.title,
    event.summary,
    event.body_snippet,
    ...(event.tags || []),
    ...(event.countries || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function inferRiskBias(text, markets) {
  const riskOff = /\b(sanction|default|recession|crash|war|invasion|terror|bank failure|contagion)\b/i.test(
    text
  );
  const riskOn = /\b(deal|ceasefire|rate cut|easing|breakthrough|growth|expansion|truce)\b/i.test(text);
  if (riskOff && !riskOn) return 'risk_off';
  if (riskOn && !riskOff) return 'risk_on';
  const hasSafe = markets.some((m) => ['XAUUSD', 'DXY', 'US10Y', 'US2Y'].includes(m.symbol));
  const hasRisk = markets.some((m) => ['BTC', 'ETH', 'NASDAQ', 'SPX'].includes(m.symbol));
  if (hasRisk && !hasSafe) return 'risk_on';
  if (hasSafe && markets.some((m) => m.score >= 40)) return 'risk_off';
  return 'neutral';
}

/**
 * @returns {{ symbol: string, score: number, direction: string, rationale: string[] }[]}
 */
function scoreMarkets(event) {
  const text = eventText(event);
  const out = [];
  const add = (symbol, weight, keywords, rationale, directionHint) => {
    const hit = keywords.some((k) => text.includes(k));
    if (!hit) return;
    let direction = 'neutral';
    if (directionHint === 'bearish_risk' && /\b(hike|inflation|sanction|war|default)\b/.test(text))
      direction = 'bearish_risk';
    else if (directionHint === 'bullish_risk' && /\b(cut|ease|deal|ceasefire|stimulus)\b/.test(text))
      direction = 'bullish_risk';
    else if (directionHint === 'usd_bull' && /\b(hawkish|hike|strong dollar|dxy)\b/.test(text)) direction = 'bullish';
    else if (directionHint === 'usd_bear' && /\b(dovish|cut|weak dollar)\b/.test(text)) direction = 'bearish';

    const existing = out.find((o) => o.symbol === symbol);
    if (existing) {
      existing.score = Math.min(100, existing.score + weight);
      if (rationale) existing.rationale.push(rationale);
      return;
    }
    out.push({
      symbol,
      score: Math.min(100, weight),
      direction,
      rationale: rationale ? [rationale] : [],
    });
  };

  add('XAUUSD', 28, ['gold', 'bullion', 'xau', 'precious metal'], 'Safe-haven / real-asset channel', 'bearish_risk');
  add('US30', 20, ['dow', 'us30', 'industrial', 'wall street'], 'US blue-chip beta');
  add('SPX', 22, ['s&p', 'spx', 's and p', '500 index', 'equity market'], 'Broad US equity risk', 'bullish_risk');
  add('NASDAQ', 24, ['nasdaq', 'tech', 'nvidia', 'apple', 'microsoft', 'semiconductor'], 'Growth / duration', 'bullish_risk');
  add('DXY', 30, ['dollar', 'dxy', 'fed ', 'federal reserve', 'currency', 'fx ', 'forex'], 'USD liquidity', 'usd_bull');
  add('WTI', 26, ['wti', 'crude', 'oil', 'opec', 'petroleum', 'permian'], 'US crude benchmark');
  add('BRENT', 26, ['brent', 'north sea', 'opec+'], 'Global crude benchmark');
  add('BTC', 20, ['bitcoin', 'btc'], 'Crypto risk proxy', 'bullish_risk');
  add('ETH', 16, ['ethereum', 'eth '], 'Altcoin / risk proxy', 'bullish_risk');
  add('EURUSD', 18, ['euro', 'eur/', 'ecb ', 'european central bank'], 'EUR rates channel', 'usd_bear');
  add('GBPUSD', 16, ['pound', 'sterling', 'gbp/', 'bank of england'], 'Cable / UK policy');
  add('USDJPY', 18, ['yen', 'jpy', 'bank of japan', 'boj '], 'Carry / policy divergence');
  add('USDCHF', 14, ['franc', 'chf', 'snb ', 'swiss national bank'], 'CHF safe-haven skew');
  add('US2Y', 20, ['2-year', '2y ', 'short end', 'front end'], 'Policy expectations', 'bearish_risk');
  add('US10Y', 22, ['yield', 'treasury', 'bond', 'rates ', 'qt ', 'qe ', '10-year', '10y '], 'Duration / risk-free', 'bearish_risk');
  add('SHIPPING', 15, ['shipping', 'freight', 'container', 'baltic', 'maritime', 'port'], 'Goods / supply chain');
  if (/\b(suez|panama canal|chokepoint|strait of hormuz|strait|canal closure|port congestion)\b/i.test(text)) {
    add('SHIPPING', 12, ['chokepoint'], 'Chokepoint / lane risk', 'bearish_risk');
    add('WTI', 8, ['oil'], 'Crude transit premia', 'bearish_risk');
    add('BRENT', 8, ['brent'], 'Brent transit premia', 'bearish_risk');
  }
  if (/\b(severe disruption|mass diversion|canal closure|port closure|blockade)\b/i.test(text)) {
    add('XAUUSD', 6, ['gold'], 'Haven bid on logistics shock', 'bearish_risk');
  }
  add('RISK', 18, ['risk sentiment', 'volatility', 'vix', 'safe haven'], 'Cross-asset risk tone', 'bearish_risk');

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 14);
}

/**
 * Concise institutional-style copy for drawer / tape.
 */
function buildWhyMatters(event, impactedMarkets, riskBias) {
  const parts = [];
  const top = (impactedMarkets || []).slice(0, 4);
  if (top.length) {
    const line = top
      .map((m) => {
        const dir =
          m.direction === 'bullish' || m.direction === 'bullish_risk'
            ? '+'
            : m.direction === 'bearish' || m.direction === 'bearish_risk'
              ? '−'
              : '';
        return `${m.symbol}${dir ? ` ${dir}` : ''}`;
      })
      .join(', ');
    parts.push(`Watchlist skew: ${line}.`);
  }
  if (riskBias === 'risk_off') parts.push('Tone skews defensive — duration, USD, and havens tend to reprice first.');
  if (riskBias === 'risk_on') parts.push('Tone skews constructive for risk — equities and crypto beta often lead.');
  if (event.event_type === 'sanctions')
    parts.push('Sanctions reroute trade, credit spreads, and commodity premia.');
  if (event.event_type === 'central_bank')
    parts.push('Policy surprise risk into FX forwards and curve belly.');
  if (event.event_type === 'conflict')
    parts.push('Geopolitical shock channel: vol, energy, and safe-haven flows.');
  if (event.event_type === 'maritime' || event.event_type === 'logistics')
    parts.push('Physical trade routes and freight curves can gap on operational headlines.');
  if (event.event_type === 'aviation')
    parts.push('Aviation disruption can tighten jet fuel spreads and hit travel-linked risk.');
  if (!parts.length)
    parts.push('Cross-asset repricing risk — watch liquidity, spreads, and headline velocity.');
  return parts.join(' ').slice(0, 900);
}

module.exports = { scoreMarkets, buildWhyMatters, inferRiskBias, eventText };
