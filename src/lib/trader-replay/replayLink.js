export function buildCsvReplayTradeId(year, month, indexZero) {
  const yi = Number(year);
  const mi = Number(month);
  const y = Number.isFinite(yi) ? yi : new Date().getFullYear();
  const m = Number.isFinite(mi) ? mi : new Date().getMonth() + 1;
  return `csv:${y}-${m}-${indexZero}`;
}

/** Decode tradeId from URL (handles double-encoding). */
export function sanitizeTradeIdQueryParam(raw) {
  if (raw == null || raw === '') return '';
  let s = String(raw).trim();
  try {
    for (let i = 0; i < 4; i += 1) {
      const next = decodeURIComponent(s.replace(/\+/g, ' '));
      if (next === s) break;
      s = next;
    }
  } catch {
    /* keep s */
  }
  return s.trim();
}

export function buildReplayTradeUrl(tradeId) {
  const id = sanitizeTradeIdQueryParam(tradeId) || String(tradeId ?? '').trim();
  const base = '/aura-analysis/dashboard/trader-replay';
  if (!id) return base;
  return `${base}?tradeId=${encodeURIComponent(id)}`;
}
