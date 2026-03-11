/**
 * Shared utils for Aura Analysis (formatting, safe numbers, etc.)
 */

export function formatCurrency(value, decimals = 2) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value, decimals = 2) {
  return `${Number(value).toFixed(decimals)}%`;
}

export function formatNumber(value, decimals = 2) {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Safe number for display: no NaN/Infinity. */
export function safeNum(n, fallback = 0) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return n;
}

export function formatCurrencySafe(value, decimals = 2) {
  const v = safeNum(value, 0);
  return formatCurrency(v, decimals);
}

/** Distance in pips, points, ticks, or price units. */
export function formatDistance(value, unit = 'pip', decimals = 1) {
  const v = safeNum(value, 0);
  const s = v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  if (unit === 'pip') return `${s} pips`;
  if (unit === 'point') return `${s} pts`;
  if (unit === 'ticks') return `${s} ticks`;
  return s;
}

/** Risk:reward ratio, e.g. 2.50 */
export function formatRR(value, decimals = 2) {
  const v = safeNum(value, 0);
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Position size: lots / contracts / units / shares. */
export function formatPositionSize(value, kind = 'lots') {
  const v = safeNum(value, 0);
  if (kind === 'lots') {
    const s = v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return `${s} lots`;
  }
  const isWhole = Number.isInteger(v) || Math.abs(v - Math.round(v)) < 1e-9;
  const s = isWhole
    ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  if (kind === 'contracts') return `${s} contracts`;
  if (kind === 'shares') return `${s} shares`;
  return `${s} units`;
}

/** Position size label from asset class. */
export function getPositionSizeKind(assetClass) {
  const c = (assetClass || '').toLowerCase();
  if (c === 'indices' || c === 'stocks' || c === 'futures') return 'contracts';
  if (c === 'crypto') return 'units';
  return 'lots';
}

export function formatPercentSafe(value, decimals = 2) {
  const v = safeNum(value, 0);
  return formatPercent(v, decimals);
}

export function formatRSafe(value, decimals = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  } catch {
    return '—';
  }
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-US');
  } catch {
    return '—';
  }
}

/** Filter trades that have a closed result. */
export function getClosedTrades(trades) {
  if (!Array.isArray(trades)) return [];
  return trades.filter((t) => t && ['win', 'loss', 'breakeven'].includes(t.result));
}
