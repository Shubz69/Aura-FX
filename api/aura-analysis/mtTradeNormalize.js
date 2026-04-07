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

  // MT5 history deals: entry 1 = DEAL_ENTRY_OUT, 3 = OUT_BY (realized exit legs).
  const entNum = Number(raw.entry);
  if (entNum === 1 || entNum === 3) return 'closed';

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

/**
 * Prefer a unique MT deal ticket / id. Note: JS (0 ?? x) === 0, so treat 0 as missing.
 */
function firstStableDealKey(raw) {
  const candidates = [
    raw.ticket,
    raw.order,
    raw.deal_id,
    raw.dealId,
    raw.id,
    raw.position_id,
    raw.positionId,
    raw.external_id,
    raw.identifier,
  ];
  for (let i = 0; i < candidates.length; i++) {
    const v = candidates[i];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return String(Math.trunc(n));
    const s = String(v).trim();
    if (s !== '' && s !== '0') return s.replace(/\s/g, '');
  }
  return null;
}

function stableRowId(raw, sym, openTime, closeTime, platformId, seqIndex) {
  const key = firstStableDealKey(raw);
  if (key) return `${String(platformId)}_${key}`;
  const o = String(openTime || '').slice(0, 24);
  const c = String(closeTime || '').slice(0, 24);
  const symClean = String(sym || '').replace(/\W/g, '');
  return `gen_${platformId}_${symClean}_${o}_${c}_${seqIndex}`;
}

function pickFiniteExcursion(...candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const v = candidates[i];
    if (v == null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Map raw broker / worker excursion fields onto normalized trade properties.
 * Omits keys when unknown — Aura Analysis treats missing path data as null metrics.
 * When excursionUnit is "points"|"pips", numeric mfe/mae go to mfePoints/maePoints only (not USD).
 */
function extractExcursionFields(raw) {
  const unit = String(raw.excursionUnit ?? raw.mfeUnit ?? raw.excursion_kind ?? '').toLowerCase();
  const isPoints = unit === 'points' || unit === 'pips' || unit === 'pip';

  const mfeUsdExplicit = pickFiniteExcursion(
    raw.mfeUsd,
    raw.maxFavorableExcursionUsd,
    raw.max_favorable_excursion_usd,
    raw.MfeUsd
  );
  const maeUsdExplicit = pickFiniteExcursion(
    raw.maeUsd,
    raw.maxAdverseExcursionUsd,
    raw.max_adverse_excursion_usd,
    raw.MaeUsd
  );

  const mfeR = pickFiniteExcursion(raw.mfeR, raw.mfe_r, raw.mfe_in_r, raw.excursionMfeR);
  const maeR = pickFiniteExcursion(raw.maeR, raw.mae_r, raw.mae_in_r, raw.excursionMaeR);

  const mfeTime = normalizeTimeValue(raw.mfeTime ?? raw.mfeAt ?? raw.maxFavorableTime ?? raw.mfe_time);
  const maeTime = normalizeTimeValue(raw.maeTime ?? raw.maeAt ?? raw.maxAdverseTime ?? raw.mae_time);

  let mfeUsd = mfeUsdExplicit;
  let maeUsd = maeUsdExplicit;

  const mfeGeneric = pickFiniteExcursion(
    raw.mfe,
    raw.MFE,
    raw.maxFavorableExcursion,
    raw.max_favorable_excursion
  );
  const maeGeneric = pickFiniteExcursion(raw.mae, raw.MAE, raw.maxAdverseExcursion, raw.max_adverse_excursion);

  if (!isPoints) {
    if (mfeUsd == null && mfeGeneric != null) mfeUsd = mfeGeneric;
    if (maeUsd == null && maeGeneric != null) maeUsd = maeGeneric;
  }

  const out = {};
  if (mfeUsd != null) out.mfeUsd = Math.abs(mfeUsd);
  if (maeUsd != null) out.maeUsd = Math.abs(maeUsd);
  if (mfeR != null) out.mfeR = mfeR;
  if (maeR != null) out.maeR = maeR;
  if (mfeTime) out.mfeTime = mfeTime;
  if (maeTime) out.maeTime = maeTime;
  if (isPoints) {
    if (mfeGeneric != null) out.mfePoints = Math.abs(mfeGeneric);
    if (maeGeneric != null) out.maePoints = Math.abs(maeGeneric);
  }
  return out;
}

/**
 * Map one raw deal/position from sync worker → normalized trade row.
 * @param {object} [netStats] — optional mutator: increments keys explicit_net | gross_includes_fees | rollup_commission_swap per row (diagnostics only; do not persist).
 */
function normalizeMtRow(raw, platformId, seqIndex = 0, netStats = null) {
  const sym =
    raw.symbol || raw.Symbol || raw.SYMBOL || raw.instrument || raw.pair || raw.s || '—';

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
  const tradeStatus = inferTradeStatus(raw, openTime, closeTime);
  // MT5 deal rows carry one execution timestamp in `time` → treat as close time for closed deals.
  let openOut = openTime;
  let closeOut = closeTime;
  if (tradeStatus === 'closed') {
    if (!closeOut && openOut) closeOut = openOut;
    else if (!openOut && closeOut) openOut = closeOut;
  }

  const id = stableRowId(raw, sym, openOut, closeOut, platformId, seqIndex);

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
      raw.price_current ?? raw.priceCurrent ?? raw.closePrice ?? raw.exitPrice ?? raw.avgPrice ?? raw.price ?? 0
    ),
    openTime: openOut,
    closeTime: closeOut,
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
    created_at: closeOut || openOut || new Date().toISOString(),
    ...extractExcursionFields(raw),
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
/** Must match TerminalSync worker and platform-history max lookback. */
const MAX_HISTORY_LOOKBACK_DAYS = 3650;

function filterTradesByDays(trades, days) {
  const d = Math.min(MAX_HISTORY_LOOKBACK_DAYS, Math.max(1, Number(days) || 30));
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

/**
 * Inclusive UTC calendar range (YYYY-MM-DD). Closed trades use closeTime; open uses openTime.
 */
function filterTradesByInclusiveDateRange(trades, fromYmd, toYmd) {
  const fromM = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fromYmd || '').trim());
  const toM = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(toYmd || '').trim());
  if (!fromM || !toM) return trades;
  const fromMs = Date.UTC(+fromM[1], +fromM[2] - 1, +fromM[3]);
  const toMs = Date.UTC(+toM[1], +toM[2] - 1, +toM[3], 23, 59, 59, 999);
  if (fromMs > toMs) return trades;
  return trades.filter((t) => {
    const ref = t.tradeStatus === 'open'
      ? (t.openTime || t.created_at)
      : (t.closeTime || t.openTime || t.created_at);
    if (!ref) return false;
    const ms = new Date(ref).getTime();
    if (!Number.isFinite(ms)) return false;
    return ms >= fromMs && ms <= toMs;
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
  extractExcursionFields,
  dedupeNormalizedTrades,
  filterTradesByDays,
  filterTradesByInclusiveDateRange,
  MAX_HISTORY_LOOKBACK_DAYS,
  tradeTimeMs,
};
