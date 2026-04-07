export const PLAYBOOK_SETUP_OPTIONS = [
  'London Breakout',
  'NY Reversal',
  'Liquidity Sweep Reclaim',
  'Range Fade',
  'Trend Pullback Continuation',
  'Market Decoder',
];

export const MISTAKE_TAG_OPTIONS = [
  'early entry',
  'late exit',
  'revenge trade',
  'overtrading',
  'ignored bias',
  'sized too big',
];

export const REPLAY_PATTERN_OPTIONS = [
  'You exit early in trending markets',
  'You hesitate on continuation setups',
  'You improve when bias is already defined',
];

export function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function calculateRiskReward(entry, stopLoss, target) {
  const e = safeNumber(entry);
  const s = safeNumber(stopLoss);
  const t = safeNumber(target);
  const risk = Math.abs(e - s);
  const reward = Math.abs(t - e);
  if (!risk || !reward) return 0;
  return reward / risk;
}

/** Risk amount in account currency: accountSize * (riskPercent / 100). */
export function calculateRiskAmount(accountSize, riskPercent) {
  return (safeNumber(accountSize) * safeNumber(riskPercent)) / 100;
}

/**
 * Position size in instrument units (approximate): riskAmount / price distance to stop.
 * Useful for FX/metals when entry/stop are in price terms.
 */
export function calculatePositionSizeUnits(accountSize, riskPercent, entry, stopLoss) {
  const riskAmt = calculateRiskAmount(accountSize, riskPercent);
  const dist = Math.abs(safeNumber(entry) - safeNumber(stopLoss));
  if (!dist || !riskAmt) return 0;
  return riskAmt / dist;
}

/** Rough lot size for display (XAU ≈ 100 oz/contract; FX majors ≈ 100k units/lot). */
export function formatPositionLots(chartSymbol, units) {
  if (!Number.isFinite(units) || units <= 0) return '—';
  const s = String(chartSymbol || '');
  if (/XAU|GOLD/i.test(s)) {
    return `${(units / 100).toFixed(2)} lots`;
  }
  return `${(units / 100000).toFixed(2)} lots`;
}

export function formatRatio(value) {
  if (!Number.isFinite(value) || value <= 0) return '0.00R';
  return `${value.toFixed(2)}R`;
}

export function scoreFromChecks(checks = []) {
  if (!checks.length) return 0;
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/** Map TradingView-style symbol e.g. OANDA:EURUSD → EURUSD for calculator / journal. */
export function chartSymbolToPair(chartSymbol) {
  const s = String(chartSymbol || '').trim();
  if (!s) return 'EURUSD';
  const i = s.lastIndexOf(':');
  return i >= 0 ? s.slice(i + 1).trim() : s;
}

/** Map Market Decoder asset code to a TradingView-style symbol the lab dropdown understands. */
export function assetToChartSymbolFromDecoder(asset) {
  const raw = String(asset || '').trim().toUpperCase();
  const a = raw.replace(/[^A-Z0-9]/g, '');
  if (!a) return 'OANDA:EURUSD';
  if (a === 'BTCUSD' || a === 'BTC') return 'COINBASE:BTCUSD';
  if (a === 'SPY') return 'AMEX:SPY';
  if (a.length === 6 && /^[A-Z]{6}$/.test(a)) return `OANDA:${a}`;
  return `OANDA:${a}`;
}

function parseLevelDisplayString(str) {
  const m = String(str || '').match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

/**
 * Partial Trader Lab form fields derived from a Market Decoder API brief.
 * Merge with DEFAULT_FORM in TraderLab.
 */
export function buildLabFormPatchFromMarketDecoderBrief(brief) {
  if (!brief || typeof brief !== 'object') return {};
  const asset = brief.header?.asset || 'EURUSD';
  const chartSymbol = assetToChartSymbolFromDecoder(asset);
  const price = safeNumber(brief.header?.price, 0);
  const r1 = parseLevelDisplayString(brief.keyLevels?.keyLevelsDisplay?.resistance1);
  const s1 = parseLevelDisplayString(brief.keyLevels?.keyLevelsDisplay?.support1);
  const biasRaw = String(brief.instantRead?.bias || brief.marketPulse?.biasLabel || 'Neutral').trim();
  const biasCap = biasRaw ? biasRaw.charAt(0).toUpperCase() + biasRaw.slice(1).toLowerCase() : 'Neutral';
  const bearish = /^bearish$/i.test(biasRaw);

  let entryPrice = price || (bearish ? r1 : s1) || safeNumber(safeNumber(price, 0) || 0, 2235);
  let stopLoss = bearish ? (r1 ?? entryPrice * 1.002) : (s1 ?? entryPrice * 0.998);
  let targetPrice = bearish ? (s1 ?? entryPrice * 0.99) : (r1 ?? entryPrice * 1.01);
  if (!Number.isFinite(entryPrice)) entryPrice = 1;
  if (!Number.isFinite(stopLoss)) stopLoss = entryPrice * (bearish ? 1.01 : 0.99);
  if (!Number.isFinite(targetPrice)) targetPrice = entryPrice * (bearish ? 0.99 : 1.01);

  const conviction = String(brief.instantRead?.conviction || 'medium').toLowerCase();
  const convNorm = conviction === 'high' || conviction === 'low' ? conviction : 'medium';
  const confidence = convictionToConfidence(convNorm);

  const wmn = (brief.whatMattersNow || [])
    .map((x) => `${x.label}: ${x.text}`)
    .join('\n');
  const posture = brief.finalOutput?.currentPosture || '';
  const sub = brief.finalOutput?.postureSubtitle || brief.instantRead?.bestApproach || '';
  const whatDoISee = [posture && `Posture: ${posture}`, sub && sub !== posture && sub, wmn && `Context:\n${wmn}`].filter(Boolean).join('\n\n');

  const ex = brief.executionGuidance || {};
  const bull = brief.scenarioMap?.bullish;
  const bear = brief.scenarioMap?.bearish;
  const whyValid = [
    ex.preferredDirection && `Preferred: ${ex.preferredDirection}`,
    ex.entryCondition && `Entry: ${ex.entryCondition}`,
    bull?.condition && `Bull case: ${bull.condition}`,
    bear?.condition && `Bear case: ${bear.condition}`,
  ]
    .filter(Boolean)
    .join('\n');

  const entryConfirmation = [ex.invalidation, ex.avoidThis].filter(Boolean).join('\n');

  const tradingCond = brief.instantRead?.tradingCondition || brief.marketPulse?.marketState || '—';
  const sessionGoal = [brief.instantRead?.bestApproach, ex.preferredDirection].filter(Boolean).join(' · ') || '';

  return {
    chartSymbol,
    marketBias: biasCap,
    marketState: /range|chop|sideways/i.test(tradingCond)
      ? 'Ranging'
      : /trend/i.test(tradingCond)
        ? 'Trending'
        : String(tradingCond).slice(0, 32) || 'Trending',
    auraConfidence: confidence,
    confidence,
    conviction: convNorm,
    whatDoISee: whatDoISee || `Market Decoder import — ${asset}. Review levels and thesis.`,
    whyValid: whyValid || 'Imported from Market Decoder execution guidance.',
    entryConfirmation: entryConfirmation || ex.riskConsideration || 'Define invalidation from decoder or structure.',
    sessionGoal: sessionGoal || 'Plan from Market Decoder brief; confirm before entry.',
    todaysFocus: wmn || (Array.isArray(brief.crossAssetContext) ? brief.crossAssetContext.join('\n') : '') || '',
    entryPrice,
    stopLoss,
    targetPrice,
    setupName: 'Market Decoder',
    biasAligned: true,
    setupValid: true,
    entryConfirmed: false,
    riskDefined: true,
  };
}

export function convictionToConfidence(conviction) {
  const c = String(conviction || '').toLowerCase();
  if (c === 'high') return 85;
  if (c === 'low') return 40;
  return 65;
}

export function confidenceToConviction(confidence) {
  const n = safeNumber(confidence, 65);
  if (n >= 72) return 'high';
  if (n >= 52) return 'medium';
  return 'low';
}

/** Persisted payload for sessionStorage handoff to Trade Calculator */
export function buildTraderLabHandoff(form, rrRatio, sessionId) {
  const pair = chartSymbolToPair(form.chartSymbol);
  return {
    version: 1,
    sessionId: sessionId || null,
    savedAt: new Date().toISOString(),
    pair,
    chartSymbol: form.chartSymbol,
    entryPrice: safeNumber(form.entryPrice, 0),
    stopLoss: safeNumber(form.stopLoss, 0),
    takeProfit: safeNumber(form.targetPrice, 0),
    riskPercent: safeNumber(form.riskPercent, 0),
    accountBalance: safeNumber(form.accountSize, 0),
    thesisWhy: form.whatDoISee || '',
    thesisConfirms: form.whyValid || '',
    thesisInvalidates: form.entryConfirmation || '',
    conviction: form.conviction || confidenceToConviction(form.confidence),
    setupName: form.setupName || '',
    marketBias: form.marketBias || '',
    rrRatio: safeNumber(rrRatio, 0),
    direction: 'buy',
  };
}

export function formatThesisNotesForJournal(h) {
  if (!h) return '';
  const lines = [];
  if (h.thesisWhy) lines.push(`Why this trade?\n${h.thesisWhy}`);
  if (h.thesisConfirms) lines.push(`What confirms it?\n${h.thesisConfirms}`);
  if (h.thesisInvalidates) lines.push(`What invalidates it?\n${h.thesisInvalidates}`);
  if (h.conviction) lines.push(`Conviction: ${String(h.conviction).toUpperCase()}`);
  if (h.setupName) lines.push(`Setup: ${h.setupName}`);
  return lines.join('\n\n');
}

export function buildValidator({ setupValid, biasAligned, entryConfirmed, riskDefined }) {
  const checks = [setupValid, biasAligned, entryConfirmed, riskDefined];
  const score = scoreFromChecks(checks);
  const passed = checks.every(Boolean);
  return {
    passed,
    score,
    label: passed ? 'Valid trade' : 'Conditions not met — avoid entry',
  };
}

export function buildBehaviourSummary(form) {
  const discipline = clamp(
    Math.round(
      (safeNumber(form.confidence, 50) * 0.25) +
      (form.followedRules ? 25 : 8) +
      (form.entryConfirmed ? 20 : 6) +
      (form.biasAligned ? 20 : 6) +
      (100 - Math.min(100, safeNumber(form.emotionalIntensity, 45))) * 0.1
    ),
    0,
    100
  );

  const emotionalControl = clamp(
    Math.round((100 - Math.min(100, safeNumber(form.emotionalIntensity, 45))) * 0.7 + (form.followedRules ? 20 : 8)),
    0,
    100
  );

  const issue = form.entryConfirmed
    ? (form.followedRules ? 'Stayed structured through execution.' : 'Rules were bent after the idea was valid.')
    : 'Entered before full confirmation.';

  return {
    discipline,
    emotionalControl,
    issue,
    /** 0–10 scale for UI bars */
    disciplineOutOf10: clamp(discipline / 10, 0, 10),
    patienceOutOf10: clamp(emotionalControl / 10, 0, 10),
  };
}

export function toYmd(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}
