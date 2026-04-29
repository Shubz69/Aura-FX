export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatCandleTooltip({ bar, symbol, interval }) {
  if (!bar || !Number.isFinite(Number(bar.time))) return null;
  const open = toNumber(bar.open);
  const high = toNumber(bar.high);
  const low = toNumber(bar.low);
  const close = toNumber(bar.close);
  const volume = toNumber(bar.volume);
  if (![open, high, low, close].every(Number.isFinite)) return null;

  const movePct = Math.abs(open) > 1e-12 ? ((close - open) / open) * 100 : null;
  const body = Math.abs(close - open);
  const range = Math.max(0, high - low);
  const upperWick = Math.max(0, high - Math.max(open, close));
  const lowerWick = Math.max(0, Math.min(open, close) - low);

  return {
    timeIso: new Date(Number(bar.time) * 1000).toISOString(),
    symbol: String(symbol || '').toUpperCase(),
    interval: String(interval || ''),
    open,
    high,
    low,
    close,
    volume,
    movePct,
    body,
    range,
    upperWick,
    lowerWick,
  };
}

export function shouldFetchCandleContext(actionType) {
  return String(actionType || '').toLowerCase() === 'click';
}
