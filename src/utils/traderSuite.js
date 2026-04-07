export const PLAYBOOK_SETUP_OPTIONS = [
  'London Breakout',
  'NY Reversal',
  'Liquidity Sweep Reclaim',
  'Range Fade',
  'Trend Pullback Continuation',
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
