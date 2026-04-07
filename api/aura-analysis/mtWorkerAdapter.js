/**
 * ============================================================================
 * MT SYNC WORKER CONTRACT — Aura Analysis ↔ hosted MetaTrader read-only worker
 * ============================================================================
 *
 * Environment (server-only, never sent to browser):
 *   - MT5_WORKER_URL (preferred) or AURA_MT_SYNC_URL | TERMINALSYNC_WORKER_URL | PYTHON_WORKER_URL
 *   - WORKER_SECRET (preferred) or AURA_MT_SYNC_SECRET | TERMINALSYNC_WORKER_SECRET
 *   - Header on every request: x-worker-secret: <secret>
 *
 * --------------------------------------------------------------------------
 * POST /api/v1/sync   — validate investor login + return account snapshot
 * --------------------------------------------------------------------------
 * Request body (JSON):
 *   {
 *     login: number | string,      // MT account login
 *     password: string,            // investor (read-only) password — never logged here
 *     server: string,              // broker server name
 *     platform: "MT4" | "MT5"      // must match Aura connection row (mt4 / mt5)
 *   }
 *
 * Response (2xx, flexible envelope — adapter normalizes):
 *   Either a flat object or { data: { ... } } with any of:
 *     balance | Balance, equity | Equity, profit | Profit, margin | Margin,
 *     freeMargin | FreeMargin | margin_free, marginLevel | MarginLevel,
 *     currency | Currency, name | Name, leverage | Leverage, server (optional)
 *
 * --------------------------------------------------------------------------
 * POST /api/v1/history — fetch closed deal history (realized P&L), MT5
 * --------------------------------------------------------------------------
 * Request body (JSON):
 *   { login, password, server, platform: "MT5", days?: number }
 *   `days` optional lookback (worker default e.g. 90).
 *
 * Response (2xx):
 *   { status: "success", trades: RawRow[] }
 *   Raw rows MUST be consumable by mtTradeNormalize.normalizeMtRow() (closed exits).
 *
 * --------------------------------------------------------------------------
 * POST /api/v1/positions — open positions only (not substitute for history)
 * --------------------------------------------------------------------------
 * Request body (JSON):
 *   { login, password, server, platform, days?: number }
 *   `days` is optional; worker may ignore it and return a full set (we filter server-side).
 *
 * Response (2xx) — adapter accepts any of:
 *   - Top-level array of raw rows
 *   - { trades: RawRow[] }
 *   - { positions: RawRow[] }
 *   - { deals: RawRow[] }
 *   - { history: RawRow[] }
 *   - { data: RawRow[] | { trades?, positions?, deals? } }
 *
 * RawRow: broker-specific; must be consumable by mtTradeNormalize.normalizeMtRow().
 * Optional excursion enrichment (account currency): mfeUsd, maeUsd, mfeR, maeR,
 * mfeTime / maeAt (epoch or ISO). Use excursionUnit: "points" only with mfePoints/maePoints semantics.
 * For accurate open vs closed classification, workers SHOULD send one of:
 *   state/status ("open"|"closed"), is_open boolean, entryType (e.g. DEAL_ENTRY_OUT),
 *   or distinct open vs close timestamps (close > open by >2s).
 *
 * ============================================================================
 */

const { isAuraDiagnosticsEnabled, safeMtLog } = require('./auraProductionUtils');

const REDACT_KEYS = /password|passwd|secret|token|credential|investor/i;

/**
 * Safe debug keys from response object (never values).
 */
function summarizeEnvelopeKeys(obj, maxDepth = 2, depth = 0) {
  if (obj == null || depth > maxDepth) return [];
  if (Array.isArray(obj)) return [`[array:${obj.length}]`];
  if (typeof obj !== 'object') return [];
  return Object.keys(obj)
    .filter((k) => !REDACT_KEYS.test(k))
    .slice(0, 24);
}

/**
 * Extract raw position/deal rows from worker JSON. Single boundary: nothing leaves here unlisted.
 * @returns {{ rows: object[], warnings: string[], envelopeHint: string }}
 */
function extractPositionsPayload(parsedBody, platformId) {
  const warnings = [];
  if (parsedBody == null || (typeof parsedBody !== 'object' && !Array.isArray(parsedBody))) {
    warnings.push('positions response body missing or not an object');
    return { rows: [], warnings, envelopeHint: 'invalid' };
  }

  let rows = [];
  const data = parsedBody;

  if (Array.isArray(data)) {
    rows = data;
  } else if (Array.isArray(data.trades)) {
    rows = data.trades;
  } else if (Array.isArray(data.positions)) {
    rows = data.positions;
  } else if (Array.isArray(data.deals)) {
    rows = data.deals;
  } else if (Array.isArray(data.history)) {
    rows = data.history;
  } else if (Array.isArray(data.rows)) {
    rows = data.rows;
  } else if (Array.isArray(data.items)) {
    rows = data.items;
  } else if (Array.isArray(data.records)) {
    rows = data.records;
  } else if (data.data != null) {
    const inner = data.data;
    if (Array.isArray(inner)) {
      rows = inner;
    } else if (inner && typeof inner === 'object') {
      if (Array.isArray(inner.trades)) rows = inner.trades;
      else if (Array.isArray(inner.positions)) rows = inner.positions;
      else if (Array.isArray(inner.deals)) rows = inner.deals;
      else if (Array.isArray(inner.history)) rows = inner.history;
      else if (Array.isArray(inner.rows)) rows = inner.rows;
      else if (Array.isArray(inner.items)) rows = inner.items;
      else if (Array.isArray(inner.records)) rows = inner.records;
    }
  }

  if (!Array.isArray(rows)) rows = [];

  const filtered = rows.filter((r) => r && typeof r === 'object');
  if (filtered.length < rows.length) {
    warnings.push(`positions array contained ${rows.length - filtered.length} non-object entries (skipped)`);
  }

  const hint = summarizeEnvelopeKeys(parsedBody).join(',') || 'empty-keys';

  if (filtered.length === 0 && parsedBody && typeof parsedBody === 'object') {
    let payloadSample = '';
    try {
      payloadSample = JSON.stringify(parsedBody);
      if (payloadSample.length > 120000) payloadSample = payloadSample.slice(0, 120000);
    } catch (_) {
      payloadSample = '';
    }
    /** Heuristic: response still contains typical deal/trade field names but we extracted 0 rows → mapping gap. */
    const likelyTradePayload =
      payloadSample.length > 0 &&
      /"(symbol|Symbol|SYMBOL|volume|Volume|profit|Profit|deal|ticket|Ticket)"/i.test(payloadSample);

    if (likelyTradePayload) {
      safeMtLog(
        'positions_envelope_unmapped',
        { envelopeHint: hint, platformId, reason: 'trade_like_fields_but_zero_rows' },
        'warn',
      );
      warnings.push(
        'worker response looks like it contains deal/trade data under an unsupported JSON path — check worker envelope mapping',
      );
    } else {
      if (isAuraDiagnosticsEnabled()) {
        safeMtLog('positions_zero_rows', { envelopeHint: hint, platformId }, 'info');
      }
    }
  }

  return { rows: filtered, warnings, envelopeHint: hint };
}

/**
 * Pick account snapshot object from sync response (flat or nested data).
 */
function extractSyncAccountObject(parsedBody) {
  if (parsedBody == null || typeof parsedBody !== 'object') return {};
  const inner = parsedBody.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    return inner;
  }
  return parsedBody;
}

/**
 * Warn if snapshot lacks any numeric balance/equity hint (still non-fatal).
 */
function validateSyncSnapshotShape(accountObj) {
  const warnings = [];
  if (!accountObj || typeof accountObj !== 'object') {
    warnings.push('sync response missing account object');
    return warnings;
  }
  const hasMoney =
    accountObj.balance != null
    || accountObj.Balance != null
    || accountObj.equity != null
    || accountObj.Equity != null;
  if (!hasMoney) {
    warnings.push('sync response had no balance/equity fields (UI may show zeros)');
  }
  return warnings;
}

module.exports = {
  extractPositionsPayload,
  extractSyncAccountObject,
  validateSyncSnapshotShape,
  summarizeEnvelopeKeys,
};
