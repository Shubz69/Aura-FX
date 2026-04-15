/**
 * Market Decoder — composed UI/decision payloads (rules-only, no invented prices).
 * Used by marketDecoderEngine; keeps the main engine file smaller.
 */

const { formatDecoderPriceForInstrument } = require('../../src/utils/decoderDisplayFormat');

function formatPx(x, instrument) {
  return formatDecoderPriceForInstrument(x, instrument);
}

function relDistPct(a, b) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  return Math.abs(a - b) / Math.abs(b);
}

/** Last bar OHLC for liquidity tagging */
function lastBarRange(highs, lows) {
  if (!highs.length || !lows.length) return { hi: null, lo: null };
  const hi = highs[highs.length - 1];
  const lo = lows[lows.length - 1];
  return { hi: Number(hi), lo: Number(lo) };
}

/**
 * @param {'resistance'|'support'} side
 * @returns {'untapped'|'tested'|'swept'|null}
 */
function liquidityState(side, level, last, barHi, barLo, marketType) {
  if (level == null || last == null || !Number.isFinite(level) || !Number.isFinite(last)) return null;
  const touchTol = marketType === 'FX' || marketType === 'Commodity' ? 0.00025 : 0.003;
  const d = relDistPct(last, level);
  if (side === 'resistance') {
    if (barHi != null && barHi >= level * (1 - touchTol)) return 'swept';
    if (d != null && d < touchTol * 2) return 'tested';
    return 'untapped';
  }
  if (barLo != null && barLo <= level * (1 + touchTol)) return 'swept';
  if (d != null && d < touchTol * 2) return 'tested';
  return 'untapped';
}

function rsiLast(closes, period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  const start = closes.length - period;
  for (let i = start; i < closes.length; i += 1) {
    const ch = Number(closes[i]) - Number(closes[i - 1]);
    if (ch >= 0) gains += ch;
    else losses -= ch;
  }
  const ag = gains / period;
  const al = losses / period;
  if (al === 0) return ag === 0 ? 50 : 100;
  const rs = ag / al;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function rsiStateLabel(rsi) {
  if (rsi == null) return { label: 'N/A', tone: 'neutral' };
  if (rsi >= 70) return { label: 'Overbought', tone: 'bear' };
  if (rsi <= 30) return { label: 'Oversold', tone: 'bull' };
  if (rsi >= 55) return { label: 'Bullish bias', tone: 'bull' };
  if (rsi <= 45) return { label: 'Bearish bias', tone: 'bear' };
  return { label: 'Neutral', tone: 'neutral' };
}

function averageDailyRangePercent(highs, lows, closes, sessions = 5) {
  const n = Math.min(sessions, highs.length, lows.length, closes.length);
  if (n < 2) return null;
  let sum = 0;
  let c = 0;
  for (let i = highs.length - n; i < highs.length; i += 1) {
    const hi = Number(highs[i]);
    const lo = Number(lows[i]);
    const cl = Number(closes[i]);
    if (!Number.isFinite(hi) || !Number.isFinite(lo) || !Number.isFinite(cl) || cl === 0) continue;
    sum += (hi - lo) / cl;
    c += 1;
  }
  if (!c) return null;
  return Math.round(sum * 100 * 100 / c) / 100;
}

/** Detect near-equal highs/lows in recent daily window */
function equalLiquidityNotes(highs, lows, marketType, window = 14) {
  const n = Math.min(window, highs.length, lows.length);
  if (n < 5) return { equalHighs: null, equalLows: null };
  const tol =
    marketType === 'FX' || marketType === 'Commodity'
      ? 0.00012
      : marketType === 'Crypto'
        ? 0.004
        : 0.002;
  const hSeg = highs.slice(-n).map(Number).filter(Number.isFinite);
  const lSeg = lows.slice(-n).map(Number).filter(Number.isFinite);
  const maxH = Math.max(...hSeg);
  const minL = Math.min(...lSeg);
  const hiTouches = hSeg.filter((x) => relDistPct(x, maxH) != null && relDistPct(x, maxH) < tol).length;
  const loTouches = lSeg.filter((x) => relDistPct(x, minL) != null && relDistPct(x, minL) < tol).length;
  const out = { equalHighs: null, equalLows: null };
  if (hiTouches >= 2 && maxH != null) {
    out.equalHighs = { price: maxH, touches: hiTouches, note: 'Clustered session highs — liquidity above' };
  }
  if (loTouches >= 2 && minL != null) {
    out.equalLows = { price: minL, touches: loTouches, note: 'Clustered session lows — liquidity below' };
  }
  return out;
}

function pipSizeForFx(display, marketType) {
  if (marketType !== 'FX') return null;
  const u = String(display || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (u.length === 6 && /^[A-Z]{6}$/.test(u)) {
    return u.slice(3, 6) === 'JPY' ? 0.01 : 0.0001;
  }
  return null;
}

function instrumentContext(resolved, requestRaw = null) {
  const display = String(resolved.displaySymbol || '').toUpperCase();
  const u = display.replace(/[^A-Z]/g, '');
  let base = null;
  let quote = 'USD';
  let assetClass = resolved.marketType === 'FX' ? 'fx' : resolved.marketType.toLowerCase();
  if (resolved.marketType === 'FX' && u.length === 6 && /^[A-Z]{6}$/.test(u)) {
    base = u.slice(0, 3);
    quote = u.slice(3);
  } else if (u.includes('XAU')) {
    base = 'XAU';
    quote = 'USD';
    assetClass = 'commodity';
  } else if (u.includes('XAG')) {
    base = 'XAG';
    quote = 'USD';
    assetClass = 'commodity';
  } else if (u.includes('BTC')) {
    base = 'BTC';
    quote = 'USD';
    assetClass = 'crypto';
  } else if (u.includes('ETH')) {
    base = 'ETH';
    quote = 'USD';
    assetClass = 'crypto';
  }
  let pricePrecision = 5;
  if (resolved.marketType === 'Crypto') pricePrecision = 2;
  if (resolved.marketType === 'Index' || resolved.marketType === 'Equity') pricePrecision = 2;
  const canonical = resolved.canonicalSymbol || display;
  return {
    requestRaw: requestRaw != null && String(requestRaw).trim() ? String(requestRaw).trim() : null,
    raw: resolved.displaySymbol,
    canonical,
    display,
    assetClass,
    marketType: resolved.marketType,
    base,
    quote,
    pricePrecision,
    pipSize: pipSizeForFx(display, resolved.marketType),
    finnhubSymbol: resolved.finnhubSymbol || null,
    yahooSymbol: resolved.yahooSymbol || null,
    watchlistGroup: resolved.watchlistGroup || null,
  };
}

/** UTC hour 0–23 */
function utcSessionWindow() {
  const h = new Date().getUTCHours();
  if (h >= 0 && h < 7) return { active: 'Asia', label: 'Asia' };
  if (h >= 7 && h < 13) return { active: 'London', label: 'London' };
  if (h >= 13 && h < 21) return { active: 'New York', label: 'New York' };
  return { active: 'Asia', label: 'Asia (late)' };
}

function phaseForSession(name, condition, volLabel, net, activeName) {
  const isActive = name === activeName;
  if (condition === 'Event Risk') return { behavior: 'Caution', detail: 'Macro headline risk' };
  if (condition === 'Trend' || (Math.abs(net) >= 3 && volLabel !== 'Low')) {
    if (isActive) return { behavior: 'Expansion', detail: 'Volatility & trend cues' };
    return { behavior: 'Follow-through', detail: 'Prior session impulse' };
  }
  if (condition === 'Choppy' || (Math.abs(net) <= 1 && volLabel === 'Low')) {
    return { behavior: 'Range', detail: 'Two-way, mean-reversion prone' };
  }
  if (volLabel === 'High') {
    if (isActive) return { behavior: 'Expansion', detail: 'Wide daily ranges' };
    return { behavior: 'Reversal', detail: 'Late session mean-revert risk' };
  }
  return { behavior: 'Range', detail: 'Balanced flow' };
}

function buildSessionFlow(condition, volLabel, net) {
  const { active, label } = utcSessionWindow();
  const mk = (name) => ({ session: name, ...phaseForSession(name, condition, volLabel, net, active) });
  return {
    currentSession: label,
    utcNote: 'Phases derived from daily structure + volatility regime (not intraday OHLC).',
    asia: mk('Asia'),
    london: mk('London'),
    newYork: mk('New York'),
  };
}

function sessionAlignmentLabel(activeLabel, bias) {
  const b = String(bias || '');
  if (b === 'Neutral') return 'Weak';
  if (activeLabel === 'London' && (b === 'Bullish' || b === 'Bearish')) return 'Moderate';
  if (activeLabel === 'New York' && (b === 'Bullish' || b === 'Bearish')) return 'Moderate';
  if (activeLabel === 'Asia') return b === 'Neutral' ? 'Weak' : 'Moderate';
  return 'Weak';
}

function structureQualityLabel(net, pivOk, sparse) {
  if (sparse) return 'Provisional';
  if (!pivOk) return 'Incomplete';
  if (Math.abs(net) >= 3) return 'Clean';
  if (Math.abs(net) >= 1) return 'Mixed';
  return 'Balanced';
}

function computeReadinessScore100({ conviction, momentum, eventSoon, pulseState, net, pivOk, sparse }) {
  let score = 52;
  if (eventSoon) score -= 28;
  if (conviction === 'High') score += 14;
  if (conviction === 'Low') score -= 12;
  if (momentum === 'Rising') score += 10;
  if (momentum === 'Weakening') score -= 6;
  if (pulseState === 'Trending Clean') score += 12;
  if (pulseState === 'Choppy') score -= 14;
  if (pulseState === 'Event Driven') score -= 22;
  if (pulseState === 'Unstable') score -= 16;
  score += Number(net) * 5;
  if (!pivOk) score -= 14;
  if (sparse) score -= 12;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function checkStatus(ok, pending, invalid) {
  if (invalid) return 'invalid';
  if (pending) return 'pending';
  if (ok) return 'valid';
  return 'pending';
}

function buildConfirmationEngine({
  net,
  piv,
  last,
  eventHighImpactSoon,
  conviction,
  condition,
  readiness100,
  sparse,
  volLabel,
  calOk,
  pairMeetingCount,
  crossAlignment,
  structureInsufficient,
}) {
  const structureInsufficientFlag = Boolean(structureInsufficient);
  const pivOk = piv && piv.r1 != null && piv.s1 != null;
  const structureOk = pivOk && Math.abs(net) >= 2;
  const liquidityOk = pivOk && last != null;
  const sessionOk =
    !structureInsufficientFlag && condition !== 'Event Risk' && conviction !== 'Low';
  const volatilityOk = volLabel !== 'High' || conviction === 'High';
  const eventOk = !eventHighImpactSoon;

  const crossChecked = crossAlignment && Number(crossAlignment.checked) > 0;
  let correlationOk = calOk !== false;
  let correlationPending = false;
  let correlationVerdict =
    pairMeetingCount > 0
      ? `${pairMeetingCount} pair-scoped releases queued`
      : 'Calendar + cross-asset context from rules stack';
  if (crossChecked) {
    const { aligned, misaligned, checked } = crossAlignment;
    if (misaligned > aligned) {
      correlationOk = false;
      correlationPending = true;
      correlationVerdict = `Cross legs diverge (${aligned} align / ${misaligned} oppose of ${checked} sampled)`;
    } else if (aligned > misaligned) {
      correlationVerdict = `Cross legs supportive (${aligned}/${checked} match session direction)`;
    } else {
      correlationPending = aligned === 0 && misaligned === 0;
      correlationVerdict =
        aligned === 0 && misaligned === 0
          ? `${checked} cross quotes loaded — directional match n/a (flat primary)`
          : `Cross legs mixed (${checked} sampled)`;
    }
  }

  const checks = [
    {
      id: 'structure',
      label: 'Structure',
      status: structureInsufficientFlag
        ? 'invalid'
        : checkStatus(structureOk, !pivOk || Math.abs(net) < 2, false),
      verdict: structureInsufficientFlag
        ? 'Insufficient daily history — bias and MAs are not scored'
        : !pivOk
          ? 'Pivot grid incomplete'
          : Math.abs(net) < 2
            ? 'No clean directional lean'
            : 'Rules align with lean',
    },
    {
      id: 'liquidity',
      label: 'Liquidity',
      status: structureInsufficientFlag
        ? checkStatus(false, true, false)
        : checkStatus(liquidityOk, !pivOk, false),
      verdict: structureInsufficientFlag
        ? 'Defer level-backed liquidity reads until the daily pack is complete'
        : pivOk
          ? 'Classic levels active'
          : 'Wait for level grid',
    },
    {
      id: 'session',
      label: 'Session',
      status: structureInsufficientFlag
        ? checkStatus(false, true, false)
        : checkStatus(sessionOk, condition === 'Choppy' && conviction === 'Low', eventHighImpactSoon),
      verdict: structureInsufficientFlag
        ? `${condition} — session labels are contextual only until structure loads`
        : eventHighImpactSoon
          ? 'High-impact window'
          : `${condition} · ${conviction} conviction`,
    },
    {
      id: 'volatility',
      label: 'Volatility',
      status: checkStatus(volatilityOk, volLabel === 'Moderate' && conviction === 'Low', false),
      verdict: `${volLabel} daily range regime`,
    },
    {
      id: 'eventRisk',
      label: 'Event risk',
      status: checkStatus(eventOk, !calOk && !eventHighImpactSoon, eventHighImpactSoon),
      verdict: eventHighImpactSoon ? 'Elevated into data' : calOk ? 'Calendar online' : 'Calendar degraded',
    },
    {
      id: 'correlation',
      label: 'Correlation',
      status: checkStatus(correlationOk, correlationPending, false),
      verdict: correlationVerdict,
    },
  ];

  let finalAction = 'WAIT';
  if (eventHighImpactSoon) finalAction = 'CAUTION';
  else if (readiness100 >= 78 && structureOk && eventOk) finalAction = 'EXECUTE';
  else if (readiness100 >= 62 && pivOk && !eventHighImpactSoon) finalAction = 'READY';
  else if (readiness100 < 38 || eventHighImpactSoon) finalAction = 'CAUTION';

  if (structureInsufficientFlag) {
    finalAction = eventHighImpactSoon ? 'CAUTION' : 'WAIT';
  }

  return {
    checks,
    finalAction,
    readinessScore: structureInsufficientFlag ? Math.min(readiness100, 32) : readiness100,
  };
}

function buildSmartAlerts({
  piv,
  last,
  bias,
  marketType,
  instrument,
  equalNotes,
  eventHighImpactSoon,
  rsiVal,
  volLabel,
  structureInsufficient,
}) {
  const alerts = [];
  const px = (x) => (x == null ? null : formatPx(x, instrument || { marketType }));
  if (structureInsufficient) {
    alerts.push({
      type: 'data',
      text: 'Daily structure is not scored yet — pivot / sweep alerts are suppressed until at least five daily closes load.',
    });
    if (eventHighImpactSoon) {
      alerts.push({
        type: 'event',
        text: 'High-impact macro window — cut size and avoid new exposure into the print unless your plan explicitly trades the release',
      });
    }
    if (volLabel === 'High') {
      alerts.push({
        type: 'vol',
        text: 'Loaded window shows wide ranges — size defensively until full history confirms the regime.',
      });
    }
    return alerts.slice(0, 7);
  }
  if (eventHighImpactSoon) {
    alerts.push({
      type: 'event',
      text: 'High-impact macro window — cut size and avoid new exposure into the print unless your plan explicitly trades the release',
    });
  }
  if (piv?.r1 != null && last != null) {
    alerts.push({
      type: 'breakout',
      text: `Break and close above ${px(piv.r1)} (R1) for continuation toward ${px(piv.r2)}`,
    });
  }
  if (piv?.s1 != null && last != null) {
    alerts.push({
      type: 'sweep',
      text: `Sweep below ${px(piv.s1)} (S1) then reclaim for reversal trap; sustained break confirms weakness`,
    });
  }
  if (piv?.pivot != null && last != null) {
    alerts.push({
      type: 'pivot',
      text: `Daily pivot ${px(piv.pivot)} — bias flips if auction holds wrong side into close`,
    });
  }
  if (equalNotes?.equalHighs?.price != null) {
    alerts.push({
      type: 'liquidity',
      text: `Equal highs ~${px(equalNotes.equalHighs.price)} — stops cluster; breakout or fade failed breaks`,
    });
  }
  if (equalNotes?.equalLows?.price != null) {
    alerts.push({
      type: 'liquidity',
      text: `Equal lows ~${px(equalNotes.equalLows.price)} — downside liquidity pool`,
    });
  }
  if (rsiVal != null && Number.isFinite(Number(rsiVal))) {
    const r = Number(rsiVal);
    if (r >= 72) {
      alerts.push({
        type: 'rsi',
        text: `RSI ${r} stretched — mean-reversion risk on fresh longs; wait for pullback or break confirmation`,
      });
    } else if (r <= 28) {
      alerts.push({
        type: 'rsi',
        text: `RSI ${r} washed — short-cover / bounce risk; do not blindly fade without structure break`,
      });
    }
  }
  if (volLabel === 'High' && piv?.pivot != null && last != null) {
    alerts.push({
      type: 'vol',
      text: `High last-session range — use wider stops or smaller size around ${px(piv.pivot)} pivot`,
    });
  }
  if (bias === 'Neutral' && alerts.length === 0) {
    alerts.push({
      type: 'wait',
      text: 'No mechanical trigger until structure breaks a defined level',
    });
  }
  return alerts.slice(0, 7);
}

function buildChartOverlayPlan({ piv, prevH, prevL, wr, marketType, last }) {
  const levels = [];
  const add = (price, label, kind) => {
    if (price == null || !Number.isFinite(Number(price))) return;
    levels.push({ price: Number(price), label, kind });
  };
  if (piv) {
    add(piv.pivot, 'Pivot', 'pivot');
    add(piv.r1, 'R1', 'resistance');
    add(piv.r2, 'R2', 'resistance');
    add(piv.s1, 'S1', 'support');
    add(piv.s2, 'S2', 'support');
  }
  add(prevH, 'Prior H', 'session');
  add(prevL, 'Prior L', 'session');
  if (wr?.wh != null) add(wr.wh, 'Wk high', 'htf');
  if (wr?.wl != null) add(wr.wl, 'Wk low', 'htf');
  return {
    horizontalLevels: levels,
    lastPrice: last != null ? Number(last) : null,
    note: 'Daily OHLC — intraday session boxes require intraday feed.',
  };
}

function eventRiskState(events, eventHighImpactSoon, scope) {
  if (eventHighImpactSoon) return { state: 'elevated', scope: scope || 'calendar' };
  const hi = (events || []).some((e) => e.impact === 'High');
  if (hi) return { state: 'moderate', scope: scope || 'calendar' };
  return { state: 'low', scope: scope || 'calendar' };
}

function scenarioToneFromBias(bias, net) {
  if (Math.abs(net) >= 3) return 'continuation';
  if (Math.abs(net) <= 1) return 'mean reversion';
  return 'wait';
}

function buildCrossAssetTiles(bundle, resolved) {
  const display = String(resolved.displaySymbol || '').toUpperCase().replace(/[^A-Z]/g, '');
  const rows = [];
  const add = (key, label, symbol, relation) => {
    const raw = bundle && bundle[key];
    if (!raw) return;
    const price = raw.c != null && Number.isFinite(Number(raw.c)) ? Number(raw.c) : null;
    const changePercent = raw.dp != null && Number.isFinite(Number(raw.dp)) ? Number(raw.dp) : null;
    const available = Boolean(raw.ok && (price != null || changePercent != null));
    const quoteStatus = available ? 'ok' : raw.ok === false ? 'offline' : 'pending';
    const hint =
      available ? null : quoteStatus === 'offline' ? 'No live quote (check API keys / limits)' : 'Price pending';
    rows.push({ id: key, label, symbol, price, changePercent, relation, available, quoteStatus, hint });
  };
  add('eurusd', 'EUR/USD', 'EURUSD', display === 'EURUSD' ? 'This pair' : 'USD ↔ EUR');
  add('spy', 'S&P (SPY)', 'SPY', 'US risk');
  if (resolved.marketType === 'Commodity' || display.includes('XAU')) {
    add('xau', 'Gold', 'XAUUSD', 'Real-yield / USD');
  } else {
    add('xau', 'Gold', 'XAUUSD', 'Flight to quality');
  }
  if (resolved.marketType === 'Crypto' || display.includes('BTC')) {
    add('btc', 'Bitcoin', 'BTCUSD', 'Crypto beta');
  } else {
    add('btc', 'Bitcoin', 'BTCUSD', 'Risk appetite');
  }
  const filtered = rows.filter((r) => !(display === 'EURUSD' && r.id === 'eurusd'));
  return (filtered.length ? filtered : rows).slice(0, 4);
}

function enrichKeyLevels({
  piv,
  prevH,
  prevL,
  last,
  highs,
  lows,
  marketType,
  instrument,
  wr,
}) {
  const bar = lastBarRange(highs, lows);
  const equalNotes = equalLiquidityNotes(highs, lows, marketType);
  const rows = [];
  const pushRow = (key, label, price, side) => {
    if (price == null || !Number.isFinite(Number(price))) {
      rows.push({ key, label, price: null, display: '—', liquidity: null, distancePct: null });
      return;
    }
    const p = Number(price);
    const liq = side ? liquidityState(side, p, last, bar.hi, bar.lo, marketType) : null;
    const d = last != null ? relDistPct(last, p) : null;
    rows.push({
      key,
      label,
      price: p,
      display: formatPx(p, instrument || { marketType }),
      liquidity: liq,
      distancePct: d != null ? Math.round(d * 10000) / 100 : null,
    });
  };
  pushRow('r1', 'Resistance (R1)', piv?.r1, 'resistance');
  pushRow('s1', 'Support (S1)', piv?.s1, 'support');
  pushRow('pdh', 'Prior session high', prevH, 'resistance');
  pushRow('pdl', 'Prior session low', prevL, 'support');
  pushRow('wh', 'Week range high', wr?.wh, 'resistance');
  pushRow('wl', 'Week range low', wr?.wl, 'support');
  if (equalNotes.equalHighs) {
    rows.push({
      key: 'eqh',
      label: 'Liquidity (equal highs)',
      price: equalNotes.equalHighs.price,
      display: formatPx(equalNotes.equalHighs.price, instrument || { marketType }),
      liquidity: 'untapped',
      distancePct: last != null ? Math.round(relDistPct(last, equalNotes.equalHighs.price) * 10000) / 100 : null,
      note: equalNotes.equalHighs.note,
    });
  }
  if (equalNotes.equalLows) {
    rows.push({
      key: 'eql',
      label: 'Liquidity (equal lows)',
      price: equalNotes.equalLows.price,
      display: formatPx(equalNotes.equalLows.price, instrument || { marketType }),
      liquidity: 'untapped',
      distancePct: last != null ? Math.round(relDistPct(last, equalNotes.equalLows.price) * 10000) / 100 : null,
      note: equalNotes.equalLows.note,
    });
  }
  return { rows, equalLiquidity: equalNotes };
}

module.exports = {
  instrumentContext,
  rsiLast,
  rsiStateLabel,
  averageDailyRangePercent,
  buildSessionFlow,
  sessionAlignmentLabel,
  structureQualityLabel,
  computeReadinessScore100,
  buildConfirmationEngine,
  buildSmartAlerts,
  buildChartOverlayPlan,
  eventRiskState,
  scenarioToneFromBias,
  buildCrossAssetTiles,
  enrichKeyLevels,
  utcSessionWindow,
};
