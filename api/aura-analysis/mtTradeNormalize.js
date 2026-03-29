/**
 * Stable MT4/MT5 → Aura Analysis row shape (investor-password sync worker payloads).
 * Handles string/enum deal types, epoch seconds/ms, and MT-style profit + commission + swap.
 *
 * Minimum worker fields for reliable rows (others optional):
 * - At least one of: symbol | instrument | pair | s (required; rows without are discarded upstream).
 * - For PnL: profit | pnl | realizedPnl | Profit (gross); optional netProfit | net_profit | pnlNet | totalNetProfit;
 *   optional commission, swap; optional profitIncludesCommission / profit_includes_commission / profitIncludesFees.
 * - For open vs closed: state | status | is_open | entryType | open/close times | volume + price_current (see inferTradeStatus).
 */

function finite(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function normalizeTimeValue(value) {
  if (value == null || value === '') return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    const ms = asNumber < 1e12 ? asNumber * 1000 : asNumber;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function detectSession(timeVal) {
  if (!timeVal) return 'Unknown';
  const h = new Date(timeVal).getUTCHours();
  if (h >= 0 && h < 8) return 'Asian';
  if (h >= 7 && h < 12) return 'London';
  if (h >= 12 && h < 17) return 'New York';
  if (h >= 17 && h < 21) return 'NY Close';
  return 'Asian';
}

/**
 * Infer buy/sell from MT4/MT5 / worker field shapes.
 */
function inferSide(raw) {
  const t = raw.type;
  if (t === 0 || t === '0') return 'buy';
  if (t === 1 || t === '1') return 'sell';

  const s = String(t || '').toUpperCase();
  if (
    s.includes('BUY')
    || s === 'LONG'
    || s.includes('POSITION_TYPE_BUY')
    || s.includes('DEAL_TYPE_BUY')
    || s.includes('ORDER_TYPE_BUY')
  ) return 'buy';
  if (
    s.includes('SELL')
    || s === 'SHORT'
    || s.includes('POSITION_TYPE_SELL')
    || s.includes('DEAL_TYPE_SELL')
    || s.includes('ORDER_TYPE_SELL')
  ) return 'sell';

  if (raw.side != null) {
    const side = String(raw.side).toUpperCase();
    if (side === 'BUY' || side === 'LONG') return 'buy';
    if (side === 'SELL' || side === 'SHORT') return 'sell';
  }

  const pt = String(raw.positionType || '').toLowerCase();
  if (pt === 'long' || pt === 'buy') return 'buy';
  if (pt === 'short' || pt === 'sell') return 'sell';

  return 'sell';
}

/**
 * OPEN vs CLOSED (deterministic; worker hints override heuristics).
 *
 * Rules (first match wins):
 * 1) Explicit flags: state/status open|closed, is_open / isOpen boolean.
 * 2) MT-style exit deals: entryType / entry_type contains OUT or DEAL_ENTRY_OUT.
 * 3) Timestamps: both open and close ISO, and close > open + 2s → closed.
 * 4) Open-style position: volume > 0 AND (price_current OR priceCurrent) present
 *    AND (no valid close-after-open) → open.
 * 5) Default → closed (treat as historical deal so floating PnL is not mixed into win-rate stats).
 */
function inferTradeStatus(raw, openTime, closeTime) {
  const st = String(raw.state || raw.status || '').toLowerCase();
  if (st === 'open' || st === 'position') return 'open';
  if (st === 'closed' || st === 'history' || st === 'deal' || st === 'filled') return 'closed';

  if (raw.is_open === true || raw.isOpen === true) return 'open';
  if (raw.is_open === false || raw.isOpen === false) return 'closed';

  const et = String(raw.entryType || raw.entry_type || '').toUpperCase();
  if (et.includes('OUT') || et.includes('EXIT') || et.includes('DEAL_ENTRY_OUT')) return 'closed';

  const oMs = openTime ? new Date(openTime).getTime() : NaN;
  const cMs = closeTime ? new Date(closeTime).getTime() : NaN;
  if (Number.isFinite(oMs) && Number.isFinite(cMs) && cMs > oMs + 2000) return 'closed';

  const vol = finite(raw.volume ?? raw.lots ?? raw.Volume ?? 0);
  const hasCurrent = raw.price_current != null || raw.priceCurrent != null;
  if (vol > 0 && hasCurrent && !(Number.isFinite(cMs) && cMs > oMs + 2000)) return 'open';

  return 'closed';
}

/**
 * NET PnL priority (avoid double-counting commission/swap into gross profit):
 * 1) Worker net fields: netProfit, net_profit, pnlNet, totalNetProfit, TotalNetProfit (finite).
 * 2) If profitIncludesCommission | profit_includes_commission | profitIncludesFees is true → use gross only.
 * 3) Else MT-style: gross + commission + swap (commission typically negative).
 *
 * @returns {{ amount: number, source: 'explicit_net' | 'gross_includes_fees' | 'rollup_commission_swap' }}
 */
function rollupNetPnlDetailed(raw, gross, commission, swap) {
  const candidates = [
    raw.netProfit,
    raw.net_profit,
    raw.pnlNet,
    raw.totalNetProfit,
    raw.TotalNetProfit,
  ];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c != null && Number.isFinite(Number(c))) {
      return { amount: Number(c), source: 'explicit_net' };
    }
  }
  const includes =
    raw.profitIncludesCommission === true
    || raw.profit_includes_commission === true
    || raw.profitIncludesFees === true;
  if (includes) return { amount: finite(gross), source: 'gross_includes_fees' };
  return {
    amount: finite(gross) + finite(commission) + finite(swap),
    source: 'rollup_commission_swap',
  };
}

function rollupNetPnl(raw, gross, commission, swap) {
  return rollupNetPnlDetailed(raw, gross, commission, swap).amount;
}

function stableRowId(raw, sym, openTime, closeTime, platformId, seqIndex) {
  const ticket =
    raw.ticket ?? raw.order ?? raw.dealId ?? raw.id ?? raw.positionId ?? raw.identifier;
  if (ticket != null && String(ticket).trim() !== '') {
    return `${String(platformId)}_${String(ticket).trim()}`;
  }
  const o = String(openTime || '').slice(0, 24);
  const c = String(closeTime || '').slice(0, 24);
  const symClean = String(sym || '').replace(/\W/g, '');
  return `gen_${platformId}_${symClean}_${o}_${c}_${seqIndex}`;
}

/**
 * Map one raw deal/position from sync worker → normalized trade row.
 * @param {object} [netStats] — optional mutator: increments keys explicit_net | gross_includes_fees | rollup_commission_swap per row (diagnostics only; do not persist).
 */
function normalizeMtRow(raw, platformId, seqIndex = 0, netStats = null) {
  const sym = raw.symbol || raw.instrument || raw.pair || raw.s || '—';

  const openRaw =
    raw.openTime || raw.timeSetup || raw.time_setup || raw.time || raw.open_time
    || raw.createdTime || null;
  const closeRaw =
    raw.closeTime || raw.timeUpdate || raw.time_update || raw.updateTime || raw.update_time
    || raw.doneTime || null;

  const openTime = normalizeTimeValue(openRaw) || (typeof openRaw === 'string' ? openRaw : null);
  const closeTime = normalizeTimeValue(closeRaw) || (typeof closeRaw === 'string' ? closeRaw : null);

  const gross = finite(
    raw.profit ?? raw.pnl ?? raw.realizedPnl ?? raw.realized_pnl ?? raw.Profit ?? 0
  );
  const commission = finite(raw.commission ?? raw.fee ?? raw.Commission ?? 0);
  const swap = finite(raw.swap ?? raw.Swap ?? raw.storage ?? 0);
  const netDetail = rollupNetPnlDetailed(raw, gross, commission, swap);
  const netPnl = netDetail.amount;
  if (netStats && netDetail.source) {
    const k = netDetail.source;
    netStats[k] = (netStats[k] || 0) + 1;
  }

  const slRaw = raw.stopLoss ?? raw.sl ?? raw.SL;
  const tpRaw = raw.takeProfit ?? raw.tp ?? raw.TP;
  const slNum = slRaw != null && slRaw !== '' ? finite(slRaw, NaN) : NaN;
  const tpNum = tpRaw != null && tpRaw !== '' ? finite(tpRaw, NaN) : NaN;

  const platLabel = platformId === 'mt4' ? 'MT4' : platformId === 'mt5' ? 'MT5' : String(platformId || 'MT');
  const id = stableRowId(raw, sym, openTime, closeTime, platformId, seqIndex);
  const tradeStatus = inferTradeStatus(raw, openTime, closeTime);

  return {
    id,
    pair: sym,
    tradeStatus,
    direction: inferSide(raw),
    pnl: netPnl,
    grossPnl: gross,
    netPnl,
    volume: finite(raw.volume || raw.lots || raw.qty || raw.Volume || 0),
    entryPrice: finite(
      raw.price_open ?? raw.priceOpen ?? raw.openPrice ?? raw.entryPrice ?? raw.price ?? 0
    ),
    closePrice: finite(
      raw.price_current ?? raw.priceCurrent ?? raw.closePrice ?? raw.exitPrice ?? raw.avgPrice ?? 0
    ),
    openTime,
    closeTime,
    commission,
    swap,
    stopLoss: Number.isFinite(slNum) && slNum !== 0 ? slNum : undefined,
    takeProfit: Number.isFinite(tpNum) && tpNum !== 0 ? tpNum : undefined,
    sl: Number.isFinite(slNum) && slNum !== 0 ? slNum : undefined,
    tp: Number.isFinite(tpNum) && tpNum !== 0 ? tpNum : undefined,
    rMultiple: raw.rMultiple || null,
    session: detectSession(openRaw || closeRaw),
    platform: platLabel,
    platformId,
    created_at: closeTime || openTime || new Date().toISOString(),
  };
}

function tradeTimeMs(t) {
  const d = t.closeTime || t.openTime || t.created_at;
  if (!d) return 0;
  const ms = new Date(d).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Drop duplicates (same logical deal); keep the row with the latest-looking timestamps / max info.
 */
function dedupeNormalizedTrades(trades) {
  if (!Array.isArray(trades) || trades.length < 2) return trades || [];
  const map = new Map();
  for (const t of trades) {
    const key = `${String(t.id)}|${String(t.pair || '').replace(/\s/g, '')}|${String(t.closeTime || t.openTime || '')}`.slice(0, 200);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, t);
      continue;
    }
    const prevMs = tradeTimeMs(prev);
    const nextMs = tradeTimeMs(t);
    if (nextMs >= prevMs) map.set(key, t);
  }
  return Array.from(map.values());
}

/**
 * Keep trades whose closing (or open) time falls within the last `days` calendar days.
 */
function filterTradesByDays(trades, days) {
  const d = Math.min(365, Math.max(1, Number(days) || 30));
  const cutoff = Date.now() - d * 86400000;
  return trades.filter((t) => {
    if (t.tradeStatus === 'open') {
      const ref = t.openTime || t.created_at;
      if (!ref) return true;
      const ms = new Date(ref).getTime();
      return !Number.isFinite(ms) || ms >= cutoff;
    }
    const ref = t.closeTime || t.openTime || t.created_at;
    if (!ref) return true;
    const ms = new Date(ref).getTime();
    if (!Number.isFinite(ms)) return true;
    return ms >= cutoff;
  });
}

module.exports = {
  finite,
  normalizeTimeValue,
  detectSession,
  inferSide,
  inferTradeStatus,
  rollupNetPnl,
  rollupNetPnlDetailed,
  normalizeMtRow,
  dedupeNormalizedTrades,
  filterTradesByDays,
  tradeTimeMs,
};
