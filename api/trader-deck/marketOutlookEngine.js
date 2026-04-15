/**
 * Market Outlook aggregation layer — extends market-intelligence payload with
 * structured desk context (macro briefing). No execution, scoring, or trade commands.
 */

const { STATE_LABELS } = require('./marketOutlookSessionContext');

function clamp(n, lo, hi) {
  const x = Number(n);
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

function crossAssetAlignment(signals) {
  if (!Array.isArray(signals)) return 'mixed';
  let up = 0;
  let down = 0;
  for (const s of signals) {
    if (!s || !s.asset) continue;
    if (s.asset === 'Volatility' || s.asset === 'DXY RSI') continue;
    if (s.direction === 'up') up += 1;
    else if (s.direction === 'down') down += 1;
  }
  if (up >= 3 && down <= 1) return 'aligned_up';
  if (down >= 3 && up <= 1) return 'aligned_down';
  return 'mixed';
}

function normBiasFromRegime(mr, pulseScore) {
  const b = String(mr?.bias || '').toLowerCase();
  if (/risk\s*on|bullish/.test(b)) return 'bullish';
  if (/risk\s*off|bearish/.test(b)) return 'bearish';
  if (/mixed|neutral/.test(b)) return 'mixed';
  if (pulseScore >= 58) return 'bullish';
  if (pulseScore <= 42) return 'bearish';
  return 'mixed';
}

function deriveRegimeExtended(marketRegime, marketPulse, crossAssetSignals, riskEngine) {
  const pulseScore = marketPulse?.score != null ? Number(marketPulse.score) : (marketPulse?.value != null ? Number(marketPulse.value) : 50);
  const align = crossAssetAlignment(crossAssetSignals);
  const riskScore = riskEngine?.score != null ? Number(riskEngine.score) : 50;
  const alignAdj = align === 'aligned_up' ? 6 : align === 'aligned_down' ? -6 : 0;
  const regimeScore = clamp(
    Math.round(pulseScore * 0.58 + (100 - clamp(riskScore, 0, 100)) * 0.28 + 50 * 0.14 + alignAdj),
    0,
    100,
  );

  const te = String(marketRegime?.tradeEnvironment || '').toLowerCase();
  let trendState = 'transitional';
  if (/trend/i.test(te)) trendState = 'trending';
  else if (/chop|range|choppy|volatile|mixed|balance|event/.test(te) || (pulseScore > 38 && pulseScore < 62)) {
    trendState = 'range';
  }

  const breakdown = riskEngine?.breakdown || {};
  const volSub = breakdown.volatility != null ? Number(breakdown.volatility) : 50;
  const volatilityRegime = volSub >= 66 ? 'expansion' : volSub <= 38 ? 'compression' : 'balanced';

  const liqSub = breakdown.liquidity != null ? Number(breakdown.liquidity) : 50;
  const liquidityCondition = liqSub >= 58 ? 'patchy' : liqSub <= 40 ? 'supportive' : 'normal';

  const cc = String(marketRegime?.convictionClarity || '').toLowerCase();
  let convictionLevel = 'moderate';
  if (/clear|high|firm/.test(cc)) convictionLevel = 'firm';
  else if (/low|soft|uncertain/.test(cc)) convictionLevel = 'low';

  const regimeBiasLabel = normBiasFromRegime(marketRegime, pulseScore);
  const parts = [];
  parts.push(
    `${marketRegime?.currentRegime || 'Mixed'} backdrop with ${regimeBiasLabel === 'mixed' ? 'mixed' : regimeBiasLabel} leaning risk tone.`,
  );
  if (align === 'aligned_up') parts.push('Cross-asset direction skews constructive for risk legs when correlations hold.');
  else if (align === 'aligned_down') parts.push('Cross-asset direction skews defensive while correlations stay aligned.');
  else parts.push('Cross-asset signals are not fully aligned, which often coincides with two-way macro repricing.');
  parts.push(`Volatility character is ${volatilityRegime === 'expansion' ? 'leaning active' : volatilityRegime === 'compression' ? 'relatively contained' : 'balanced'} versus recent risk-engine reads.`);
  const regimeNarrative = parts.join(' ');

  return {
    ...marketRegime,
    regimeScore,
    regimeBiasLabel,
    trendState,
    volatilityRegime,
    liquidityCondition,
    convictionLevel,
    regimeNarrative,
    crossAssetAlignment: align,
  };
}

function driverExplanation(d) {
  if (d.explanation && String(d.explanation).trim()) return String(d.explanation).trim();
  const name = String(d.name || d.title || '');
  const dir = String(d.direction || 'neutral');
  const eff = String(d.effect || '').trim();
  if (eff) return eff;
  if (/bond|yield/i.test(name)) {
    if (dir === 'up') return 'Higher yields tend to tighten financial conditions and weigh on duration-sensitive assets.';
    if (dir === 'down') return 'Falling yields often ease pressure on equities and can support gold on real-rate dynamics.';
    return 'Yield drift is a central macro transmission channel across risk and FX.';
  }
  if (/dollar|usd/i.test(name)) {
    if (dir === 'up') return 'USD strength typically filters through majors, EM FX, and commodity invoicing.';
    if (dir === 'down') return 'USD softness can relieve commodity and local-currency funding strains.';
    return 'USD direction remains a clearing price for global liquidity expectations.';
  }
  if (/oil|crude|wti|brent/i.test(name)) {
    return 'Oil reprices growth and inflation risk premia and feeds into cross-asset risk tone.';
  }
  if (/equit|spx|stock/i.test(name)) {
    return 'Equity drift anchors broad risk sentiment and correlates with credit and FX carry tone.';
  }
  return 'Macro impulse is transmitting through pricing of risk and liquidity.';
}

function driverAffectedAssets(d) {
  if (Array.isArray(d.affectedAssets) && d.affectedAssets.length) return d.affectedAssets;
  const name = String(d.name || d.title || '');
  if (/bond|yield/i.test(name)) return ['Equities', 'Gold', 'USD', 'Credit'];
  if (/dollar|usd/i.test(name)) return ['EURUSD', 'Commodities', 'EM FX', 'Gold'];
  if (/oil/i.test(name)) return ['CAD', 'NOK', 'Inflation breakevens', 'Risk'];
  if (/equit|stock/i.test(name)) return ['Credit', 'FX carry', 'Crypto beta'];
  return ['Cross-asset'];
}

function enrichKeyDrivers(drivers) {
  if (!Array.isArray(drivers)) return [];
  return drivers.map((d) => ({
    ...d,
    name: d.name || d.title,
    title: d.title || d.name,
    impact: normImpact(d.impact),
    explanation: driverExplanation(d),
    affectedAssets: driverAffectedAssets(d),
  }));
}

function normImpact(impact) {
  const s = String(impact || 'medium').toLowerCase();
  if (s === 'high' || s === '3') return 'high';
  if (s === 'low' || s === '1') return 'low';
  return 'medium';
}

function signalStrength(s) {
  if (s.strength && String(s.strength).trim()) return String(s.strength).toLowerCase();
  const sig = `${s.signal || s.label || ''}`;
  if (/strong|elevated|heavy|firm|sharp/i.test(sig)) return 'strong';
  if (/mild|steady|mid|moderate|contained/i.test(sig)) return 'moderate';
  return 'moderate';
}

function signalImplication(s) {
  if (s.implication && String(s.implication).trim()) return String(s.implication).trim();
  const asset = String(s.asset || '');
  const dir = String(s.direction || 'neutral');
  const templates = {
    Yields: {
      up: 'Yields rising → pressure on duration and growth multiples; USD can find support on rate differential stories.',
      down: 'Yields falling → supportive for equities and gold on balance; reduces broad USD pressure when paired with easing expectations.',
      neutral: 'Yields sideways → macro debates shift to growth and positioning rather than pure rate shock.',
    },
    USD: {
      up: 'USD firmer → headwind for commodities and EM funding; majors reprice around the dollar leg.',
      down: 'USD softer → relief for commodities and local markets; EUR and metals often absorb flows first.',
      neutral: 'USD balanced → idiosyncratic drivers dominate within G10.',
    },
    Gold: {
      up: 'Gold bid → defensive and real-rate hedging demand; often coincides with softer yields or elevated uncertainty.',
      down: 'Gold offered → real yields firmer or risk appetite improves versus defensive hedges.',
      neutral: 'Gold range-bound → interplay of USD and yields is neutral at the margin.',
    },
    Stocks: {
      up: 'Equities stronger → broad risk appetite improves; supports cyclical FX and crypto beta.',
      down: 'Equities weaker → de-risking flows dominate; USD and vol often reprice.',
      neutral: 'Equities flat → tape waits on macro catalysts for directional resolution.',
    },
    Oil: {
      up: 'Oil firm → inflation impulse and energy-linked currencies strengthen; can dampen consumer-led growth reads.',
      down: 'Oil heavy → disinflationary impulse for goods; can ease headline inflation pressure narratives.',
      neutral: 'Oil steady → supply narrative fades as primary driver near term.',
    },
    Crypto: {
      up: 'Crypto bid → speculative risk appetite improving alongside liquidity tone.',
      down: 'Crypto offered → de-risking in high-beta legs; liquidity sensitivity rises.',
      neutral: 'Crypto neutral → tracks broad risk with low independent catalyst.',
    },
    Volatility: {
      up: 'Volatility elevated → wider ranges and faster regime shifts across correlated assets.',
      down: 'Volatility contained → carry and trend structures face less tail shock premium.',
      neutral: 'Volatility mixed → event windows still dominate discrete repricing.',
    },
    'DXY RSI': {
      up: 'Momentum stretched on USD proxies → mean-reversion risk rises even if trend intact.',
      down: 'Momentum soft on USD proxies → trend fatigue without confirming macro shift.',
      neutral: 'USD momentum neutral → direction leans on yields and data surprises.',
    },
  };
  const bucket = templates[asset] || {
    up: `${asset} stronger → cross-read through other risk legs depends on correlation regime.`,
    down: `${asset} softer → watch for knock-on repricing in correlated hedges.`,
    neutral: `${asset} balanced → marginal for broad macro skew until impulse builds.`,
  };
  return bucket[dir] || bucket.neutral;
}

function enrichCrossAssetSignals(signals) {
  if (!Array.isArray(signals)) return [];
  return signals.map((s) => ({
    ...s,
    strength: signalStrength(s),
    implication: signalImplication(s),
  }));
}

function sessionStyleLabel(state) {
  const k = String(state || '');
  return STATE_LABELS[k] || k.replace(/_/g, ' ') || 'Mixed';
}

function sessionBiasNarrative(row, globalAlign) {
  const st = String(row?.state || '');
  if (st === 'event_sensitive') return 'Macro prints can dominate short-horizon variance.';
  if (st === 'reversal_risk') return 'Two-way risk rises after directional extension.';
  if (st === 'trend_continuation') return `Directional bias can persist while cross-asset tone stays ${globalAlign === 'mixed' ? 'mixed' : 'aligned'}.`;
  if (st === 'expansion_likely') return 'Impulse regimes are more likely as liquidity deepens.';
  if (st === 'compressed') return 'Compressed ranges often resolve with volatility rather than drift.';
  if (st === 'liquidity_build') return 'Liquidity coiling can precede directional breaks when participation returns.';
  if (st === 'choppy') return 'Choppy conditions often reflect uneven participation and headline-driven repricing.';
  if (st === 'range_bound') return 'Range dynamics dominate until a catalyst validates a break.';
  return 'Session diagnostics reflect mixed participation and event cadence.';
}

function expectedBehaviourLine(sessionKey, row) {
  const st = String(row?.state || '');
  if (st === 'inactive') return 'Institutional flow is thinned; local narratives matter more than global beta.';
  if (sessionKey === 'london' && st === 'range_bound') {
    return 'London often probes liquidity around prior balance before NY sets broader direction.';
  }
  if (sessionKey === 'london' && st === 'event_sensitive') {
    return 'London can see sharp repricing into overlapping US data risk as NY approaches.';
  }
  if (sessionKey === 'asia' && st === 'range_bound') {
    return 'Asia frequently mean-reverts inside prior ranges unless a fresh impulse arrives.';
  }
  if (sessionKey === 'newYork' && st === 'event_sensitive') {
    return 'NY windows concentrate depth; scheduled events can reshape correlation quickly.';
  }
  if (st === 'trend_continuation') return 'Trend maintenance is more plausible when cross-asset correlations hold.';
  if (st === 'reversal_risk') return 'Late-session mean reversion risk rises if positioning stretches.';
  return 'Flow tends to follow liquidity depth and headline cadence for this session archetype.';
}

function volatilityExpectationFromRow(row, riskEngine) {
  const vs = String(row?.volatilityState || '');
  if (vs === 'elevated') return 'Above-average realized ranges versus recent baseline.';
  if (vs === 'compressed') return 'Subdued realized vol with potential for expansion on impulse.';
  if (vs === 'normal') return 'Volatility near typical session norms.';
  const br = riskEngine?.breakdown?.volatility;
  if (br != null && Number(br) >= 62) return 'Macro radar suggests wider tails around catalysts.';
  return 'Volatility expectations track the live macro and liquidity calendar.';
}

function keyLevelNoteForSession(sessionKey, row) {
  if (String(row?.state || '') === 'inactive') return null;
  if (String(row?.state || '') === 'liquidity_build') {
    return 'Prior session highs/lows often act as liquidity magnets until accepted through.';
  }
  if (sessionKey === 'london') return 'London fix and ECB/BoE windows can reshape EUR and GBP drift.';
  if (sessionKey === 'newYork') return 'US cash open and macro releases frequently reset the daily distribution.';
  return 'Intraday extremes from the prior liquid session remain reference liquidity nodes.';
}

function enrichSessionContext(sessionContext, crossAlign, riskEngine) {
  if (!sessionContext || typeof sessionContext !== 'object') return sessionContext;
  const sessions = sessionContext.sessions || {};
  const keys = [
    ['asia', 'asia'],
    ['london', 'london'],
    ['newYork', 'newYork'],
  ];
  const nextSessions = { ...sessions };
  for (const [id] of keys) {
    const row = sessions[id];
    if (!row || typeof row !== 'object') continue;
    const sessionStyle = sessionStyleLabel(row.state);
    const sessionBias = sessionBiasNarrative(row, crossAlign);
    const expectedBehaviour = expectedBehaviourLine(id, row);
    const volatilityExpectation = volatilityExpectationFromRow(row, riskEngine);
    const keyLevelNote = keyLevelNoteForSession(id, row);
    const narrative = row.summary && String(row.summary).trim()
      ? String(row.summary).trim()
      : [sessionStyle, sessionBias, expectedBehaviour].filter(Boolean).join(' ');
    nextSessions[id] = {
      ...row,
      sessionStyle,
      sessionBias,
      expectedBehaviour,
      keyLevelNote,
      volatilityExpectation,
      narrative,
    };
  }
  return { ...sessionContext, sessions: nextSessions };
}

function buildMarketChangesTimeline(marketChangesToday, timeframe) {
  const label = timeframe === 'weekly' ? 'Week' : 'Session';
  const list = Array.isArray(marketChangesToday) ? marketChangesToday : [];
  return list.map((item, idx) => {
    const text = typeof item === 'string' ? item : (item?.title || item?.description || '');
    const assets = inferAssetsFromText(text);
    return {
      sortOrder: idx,
      timeLabel: `${label} update ${idx + 1}`,
      whatChanged: text,
      assetsAffected: assets,
      whyItMatters: 'Shifts the macro narrative versus the prior baseline; watch follow-through in correlated legs.',
      priority: typeof item === 'object' && item?.priority ? item.priority : 'medium',
    };
  });
}

function inferAssetsFromText(text) {
  const t = String(text || '').toLowerCase();
  const out = [];
  if (/yield|bond|rate|treasury/.test(t)) out.push('Yields');
  if (/usd|dollar|fx|eur|gbp|yen/.test(t)) out.push('FX');
  if (/gold|xau/.test(t)) out.push('Gold');
  if (/equit|stock|spx|risk/.test(t)) out.push('Equities');
  if (/oil|wti|brent/.test(t)) out.push('Oil');
  if (/crypto|btc/.test(t)) out.push('Crypto');
  if (out.length === 0) out.push('Cross-asset');
  return out.slice(0, 4);
}

function buildMarketImplications(marketRegime, crossAssetSignals, keyDrivers, align) {
  const yields = crossAssetSignals.find((s) => s.asset === 'Yields');
  const usd = crossAssetSignals.find((s) => s.asset === 'USD');
  const gold = crossAssetSignals.find((s) => s.asset === 'Gold');
  const stocks = crossAssetSignals.find((s) => s.asset === 'Stocks');
  const out = [];

  if (yields && yields.direction === 'up') {
    out.push({
      condition: 'Yields stay offered higher on the curve',
      then: 'Duration and growth multiples often remain under scrutiny',
      implication: 'Risk sentiment can stay selective until the rates impulse stabilizes',
    });
  } else if (yields && yields.direction === 'down') {
    out.push({
      condition: 'Yields continue to ease',
      then: 'Equities and gold can find incremental support on balance',
      implication: 'Broad financial conditions loosen at the margin',
    });
  }

  if (usd && usd.direction === 'up') {
    out.push({
      condition: 'USD strength persists',
      then: 'Commodities and EM assets typically face headwinds',
      implication: 'Global liquidity reprices through the dollar as the macro hinge',
    });
  } else if (usd && usd.direction === 'down') {
    out.push({
      condition: 'USD softens in parallel with yields',
      then: 'Local markets and metals often absorb relief flows',
      implication: 'Risk appetite can broaden without fresh growth shocks',
    });
  }

  if (align === 'mixed') {
    out.push({
      condition: 'Cross-asset signals stay divergent',
      then: 'Two-way macro markets dominate with faster narrative rotation',
      implication: 'Correlation breaks can amplify sector- and region-specific stories',
    });
  } else {
    out.push({
      condition: 'Cross-asset alignment holds',
      then: 'Trend structures face less internal contradiction',
      implication: 'Macro shocks transmit more linearly across hedges and risk legs',
    });
  }

  if (gold && stocks && gold.direction === 'up' && stocks.direction === 'down') {
    out.push({
      condition: 'Gold rises while equities lag',
      then: 'Defensive hedging and growth worries can coexist',
      implication: 'Real-rate and uncertainty channels matter more than pure beta',
    });
  }

  if (out.length < 3) {
    out.push({
      condition: `Tape remains in a ${marketRegime?.currentRegime || 'mixed'} regime`,
      then: 'Liquidity and data windows drive incremental repricing',
      implication: 'Narrative shifts show up first in rates and FX crosses',
    });
  }
  if (out.length < 3) {
    out.push({
      condition: 'Liquidity depth shifts at session overlaps',
      then: 'Correlation can tighten or break within hours',
      implication: 'Macro reads migrate between regional balances and NY depth',
    });
  }

  return out.slice(0, 6);
}

function buildInstrumentSnapshots(crossAssetSignals) {
  const pick = (asset) => crossAssetSignals.find((s) => s.asset === asset);
  const usd = pick('USD');
  const gold = pick('Gold');
  const stocks = pick('Stocks');
  const oil = pick('Oil');
  const crypto = pick('Crypto');
  const y = pick('Yields');

  const eurusdBias = usd?.direction === 'up' ? 'Bearish pressure' : usd?.direction === 'down' ? 'Constructive' : 'Neutral';
  const eurusdStruct = usd?.direction === 'neutral' ? 'Range' : 'Trend-sensitive';

  const rows = [
    {
      symbol: 'EURUSD',
      bias: eurusdBias,
      structure: eurusdStruct,
      keyLevel: 'Prior session extremes / London fix window',
      note: usd?.implication ? String(usd.implication).slice(0, 120) : 'USD leg sets the marginal repricing for majors.',
    },
    {
      symbol: 'XAUUSD',
      bias: gold?.direction === 'up' ? 'Bid' : gold?.direction === 'down' ? 'Offered' : 'Neutral',
      structure: gold?.direction === 'neutral' ? 'Range' : 'Impulse',
      keyLevel: 'Real-yield proxy zone (contextual)',
      note: gold?.implication ? String(gold.implication).slice(0, 120) : 'Gold tracks the rates and USD composite.',
    },
    {
      symbol: 'US500',
      bias: stocks?.direction === 'up' ? 'Risk-on tilt' : stocks?.direction === 'down' ? 'Defensive' : 'Neutral',
      structure: stocks?.direction === 'neutral' ? 'Balance' : 'Directional',
      keyLevel: 'Cash-open liquidity pocket',
      note: stocks?.implication ? String(stocks.implication).slice(0, 120) : 'Equities anchor global beta tone.',
    },
    {
      symbol: 'WTI',
      bias: oil?.direction === 'up' ? 'Firm' : oil?.direction === 'down' ? 'Heavy' : 'Steady',
      structure: 'Event-sensitive',
      keyLevel: 'Inventory and supply headlines',
      note: oil?.implication ? String(oil.implication).slice(0, 120) : 'Oil links growth and inflation expectations.',
    },
    {
      symbol: 'BTCUSD',
      bias: crypto?.direction === 'up' ? 'Risk beta on' : crypto?.direction === 'down' ? 'Risk beta off' : 'Neutral',
      structure: 'High-beta',
      keyLevel: 'Liquidity regime from USD and vol',
      note: crypto?.implication ? String(crypto.implication).slice(0, 120) : 'Crypto tracks liquidity and speculative appetite.',
    },
    {
      symbol: 'US10Y',
      bias: y?.direction === 'up' ? 'Rates higher' : y?.direction === 'down' ? 'Rates lower' : 'Sideways',
      structure: y?.strength === 'strong' ? 'Impulse' : 'Baseline',
      keyLevel: 'Recent FRED observation window',
      note: y?.implication ? String(y.implication).slice(0, 120) : 'Yields transmit macro shocks into risk assets.',
    },
  ];
  return rows;
}

function headlineSentiment(text) {
  const t = String(text || '').toLowerCase();
  if (/surge|rally|gain|ease|cut|support|optim|deal|peace|growth/.test(t) && !/fear|crash|plunge|hawk|tighten/.test(t)) {
    return 'bullish';
  }
  if (/plunge|crash|fear|hawk|tighten|inflation shock|war|sanction|default/.test(t)) return 'bearish';
  return 'neutral';
}

function headlineImpact(text) {
  const t = String(text || '').toLowerCase();
  if (/fed|cpi|nfp|gdp|ecb|boe|boj|rate|jobs|inflation|employment/.test(t)) return 'high';
  if (/earnings|oil|opec|china|tariff|election|geopolit/.test(t)) return 'medium';
  return 'low';
}

function headlineAssets(text) {
  return inferAssetsFromText(text);
}

function buildHeadlineInsights(headlineSample) {
  if (!Array.isArray(headlineSample)) return [];
  return headlineSample.slice(0, 8).map((h) => {
    const text = String(h || '').trim();
    return {
      text,
      sentiment: headlineSentiment(text),
      impact: headlineImpact(text),
      affectedAssets: headlineAssets(text),
    };
  }).filter((x) => x.text);
}

function buildPulseOutlookFields(marketPulse, keyDrivers, marketChangesToday, crossAlign, sessionContext) {
  const score = marketPulse?.score != null ? Number(marketPulse.score) : 50;
  const vol =
    score >= 72 ? 'Elevated pulse score → wider potential ranges' : score <= 34 ? 'Subdued pulse → drift-prone conditions' : 'Balanced pulse versus recent baseline';
  const topDrivers = (keyDrivers || [])
    .slice()
    .sort((a, b) => {
      const ia = normImpact(a.impact) === 'high' ? 3 : normImpact(a.impact) === 'medium' ? 2 : 1;
      const ib = normImpact(b.impact) === 'high' ? 3 : normImpact(b.impact) === 'medium' ? 2 : 1;
      return ib - ia;
    })
    .slice(0, 3)
    .map((d) => `${d.name || d.title}: ${d.direction || 'neutral'} (${normImpact(d.impact)} impact)`);

  const changes = Array.isArray(marketChangesToday) ? marketChangesToday : [];
  const first = changes[0];
  const recent = typeof first === 'string' ? first : (first?.title || first?.description || 'Narrative stable versus prior check.');
  const shift = [];
  shift.push(
    crossAlign === 'mixed'
      ? 'Cleaner cross-asset alignment would simplify the macro read.'
      : 'A break in cross-asset alignment would soften directional follow-through.',
  );
  const ny = sessionContext?.sessions?.newYork;
  if (ny && ny.state === 'event_sensitive') {
    shift.push('Post-release liquidity often resets ranges even when surprise direction is clear.');
  }
  shift.push('A material move in yields or USD typically reprices the rest of the complex.');
  shift.push('Session depth at London–NY overlap can reinforce or fade the Asia drift.');

  return {
    pulseState: marketPulse?.state || marketPulse?.label || 'Mixed',
    volatilityCondition: vol,
    topDrivers,
    recentChangeSummary: recent,
    stateShiftFactors: shift.slice(0, 4),
  };
}

function buildOutlookRiskContext(riskEngine, riskRadar) {
  if (!riskEngine && !Array.isArray(riskRadar)) return null;
  const breakdown = riskEngine?.breakdown || {};
  const clustering = breakdown.clustering != null ? Number(breakdown.clustering) : null;
  let clusteringBehavior = 'Event spacing looks typical.';
  if (clustering != null && clustering >= 62) clusteringBehavior = 'Releases cluster — macro variance can bunch into tight windows.';
  else if (clustering != null && clustering <= 38) clusteringBehavior = 'Events are spaced — narrative can evolve more gradually.';
  const vol = breakdown.volatility != null ? Number(breakdown.volatility) : null;
  let volatilityState = 'Mixed versus baseline.';
  if (vol != null && vol >= 65) volatilityState = 'Volatility radar elevated — tails more active.';
  else if (vol != null && vol <= 38) volatilityState = 'Volatility radar subdued — ranges can dominate.';
  const nextMins = riskEngine?.nextRiskEventInMins;
  const nextRiskWindow = Number.isFinite(nextMins)
    ? `Next scheduled macro window in ~${nextMins} minutes (desk clock).`
    : 'Next macro window follows the live economic calendar.';
  const upcoming = (Array.isArray(riskRadar) ? riskRadar : []).slice(0, 4).map((r) => ({
    title: typeof r === 'string' ? r : (r.title || r.event || 'Event'),
    impact: typeof r === 'object' ? normImpact(r.impact || r.severity) : 'medium',
  }));
  return {
    currentRiskLevel: riskEngine?.level || 'Moderate',
    volatilityState,
    clusteringBehavior,
    nextRiskWindow,
    upcomingEvents: upcoming,
  };
}

function buildDataFreshness(payload, timeframe) {
  const lastUpdated = payload.updatedAt || new Date().toISOString();
  let sourceTier = 'live';
  if (payload.sourceOfTruth === 'mysql-pipeline' || payload.storedSource) sourceTier = 'paid';
  if (payload.storageFreshness === 'stale' || payload.storageFreshness === 'expired') sourceTier = 'fallback';
  const degraded = Boolean(
    payload.storageFreshness === 'stale'
    || payload.storageFreshness === 'expired'
    || payload.fallbackMode
    || (Array.isArray(payload.headlineSample) && payload.headlineSample.length === 0),
  );
  const ageSec = (() => {
    const t = Date.parse(lastUpdated);
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.round((Date.now() - t) / 1000));
  })();
  let freshnessLabel = 'Live desk build';
  if (ageSec != null && ageSec < 120) freshnessLabel = `Updated ${ageSec}s ago`;
  else if (ageSec != null && ageSec < 3600) freshnessLabel = `Updated ${Math.round(ageSec / 60)}m ago`;
  else if (ageSec != null) freshnessLabel = `Updated ${Math.round(ageSec / 3600)}h ago`;
  if (payload.cached) freshnessLabel += ' · cached edge';
  if (timeframe === 'weekly') freshnessLabel += ' · weekly lens';
  return {
    lastUpdated,
    freshnessLabel,
    sourceTier,
    degraded,
  };
}

/**
 * @param {object} payload - merged market intelligence payload
 * @param {{ timeframe?: 'daily'|'weekly' }} opts
 * @returns {object} shallow-cloned payload with outlook extensions
 */
function enrichMarketOutlookPayload(payload, opts = {}) {
  if (!payload || typeof payload !== 'object') return payload;
  const timeframe = opts.timeframe === 'weekly' ? 'weekly' : (payload.timeframe === 'weekly' ? 'weekly' : 'daily');
  const crossAssetSignals = enrichCrossAssetSignals(payload.crossAssetSignals || []);
  const keyDrivers = enrichKeyDrivers(payload.keyDrivers || []);
  const align = crossAssetAlignment(crossAssetSignals);
  const marketRegime = deriveRegimeExtended(
    payload.marketRegime || {},
    payload.marketPulse || {},
    crossAssetSignals,
    payload.riskEngine || null,
  );
  const sessionContext = enrichSessionContext(payload.sessionContext || null, align, payload.riskEngine || null);
  const marketChangesTimeline = buildMarketChangesTimeline(payload.marketChangesToday || [], timeframe);
  const marketImplications = buildMarketImplications(marketRegime, crossAssetSignals, keyDrivers, align);
  const instrumentSnapshots = buildInstrumentSnapshots(crossAssetSignals);
  const headlineInsights = buildHeadlineInsights(payload.headlineSample || []);
  const pulseOutlook = buildPulseOutlookFields(
    payload.marketPulse,
    keyDrivers,
    payload.marketChangesToday,
    align,
    sessionContext,
  );
  const outlookRiskContext = buildOutlookRiskContext(payload.riskEngine || null, payload.riskRadar || []);
  const outlookDataStatus = buildDataFreshness({ ...payload, timeframe }, timeframe);

  const marketPulse = {
    ...payload.marketPulse,
    outlookPulse: pulseOutlook,
  };

  return {
    ...payload,
    marketRegime,
    marketPulse,
    keyDrivers,
    crossAssetSignals,
    sessionContext,
    marketChangesTimeline,
    marketImplications,
    instrumentSnapshots,
    headlineInsights,
    outlookRiskContext,
    outlookDataStatus,
    marketOutlookVersion: 2,
  };
}

module.exports = {
  enrichMarketOutlookPayload,
  crossAssetAlignment,
};
