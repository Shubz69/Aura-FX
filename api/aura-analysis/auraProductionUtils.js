/**
 * Production-safe helpers for Aura Analysis MT routes.
 * - No secrets in client-facing strings
 * - Diagnostics gated by AURA_ANALYSIS_DIAGNOSTICS=1 (server-only)
 */

const DIAG_FLAG = 'AURA_ANALYSIS_DIAGNOSTICS';

function isAuraDiagnosticsEnabled() {
  return String(process.env[DIAG_FLAG] || '').trim() === '1';
}

/** Safe internal log: event name + small structured fields (no payloads, no passwords). */
function safeMtLog(event, fields = {}) {
  const safe = { ...fields };
  delete safe.password;
  delete safe.secret;
  delete safe.token;
  try {
    console.warn(`[aura-mt] ${event}`, JSON.stringify(safe));
  } catch (_) {
    console.warn(`[aura-mt] ${event}`);
  }
}

const RISKY_MESSAGE = /password|passwd|secret|token|bearer|authorization|credential|investor\s*[:=]/i;
const RISKY_TECH = /ECONNREFUSED|ENOTFOUND|certificate|SSL|stack|at\s+\w+\.|sql|mysql|syntax error/i;

/**
 * Worker/provider messages must not reach the browser verbatim (may echo config or HTML).
 */
function sanitizeWorkerMessageForClient(raw, fallback) {
  const s = String(raw || '').trim();
  if (!s || s.length > 280) return fallback;
  if (RISKY_MESSAGE.test(s) || RISKY_TECH.test(s)) return fallback;
  if (/^https?:\/\//i.test(s)) return fallback;
  const allowedPrefixes = [
    'MetaTrader data service',
    'Could not verify',
    'Could not load',
    'Account login',
    'HTTP_',
  ];
  if (allowedPrefixes.some((p) => s.startsWith(p))) return s.slice(0, 240);
  return fallback;
}

const CODES = {
  CONFIG_MISSING: 'TERMINALSYNC_CONFIG_MISSING',
  WORKER_URL_NOT_CONFIGURED: 'TERMINALSYNC_WORKER_URL_NOT_CONFIGURED',
  TIMEOUT: 'TERMINALSYNC_TIMEOUT',
  UNAUTHORIZED_SECRET: 'TERMINALSYNC_UNAUTHORIZED_SECRET',
  WORKER_URL_INVALID: 'TERMINALSYNC_WORKER_URL_INVALID',
  REQUEST_FAILED: 'TERMINALSYNC_REQUEST_FAILED',
  SYNC_FAILED: 'TERMINALSYNC_SYNC_FAILED',
  POSITIONS_FAILED: 'TERMINALSYNC_POSITIONS_FAILED',
};

function publicHistoryError(code, internalMsg) {
  const fb = 'Unable to load trade history. Please try again in a moment.';
  switch (code) {
    case CODES.CONFIG_MISSING:
    case CODES.WORKER_URL_NOT_CONFIGURED:
      return 'Trading data service is temporarily unavailable. Please contact support if this continues.';
    case CODES.TIMEOUT:
      return 'Trade history request timed out. Please retry shortly.';
    case CODES.UNAUTHORIZED_SECRET:
      return 'Trading data service could not be reached securely. Please try again later.';
    case CODES.WORKER_URL_INVALID:
      return 'Trading data service configuration error. Please contact support.';
    case CODES.REQUEST_FAILED:
    case CODES.POSITIONS_FAILED:
      return sanitizeWorkerMessageForClient(internalMsg, fb);
    default:
      return sanitizeWorkerMessageForClient(internalMsg, fb);
  }
}

function publicAccountLiveError(code, internalMsg) {
  const fb = 'Unable to refresh live account data. Cached values may be shown if available.';
  switch (code) {
    case CODES.CONFIG_MISSING:
    case CODES.WORKER_URL_NOT_CONFIGURED:
      return 'Trading data service is temporarily unavailable.';
    case CODES.TIMEOUT:
      return 'Account data request timed out. Please retry.';
    case CODES.UNAUTHORIZED_SECRET:
      return 'Account service could not be reached securely. Please try again later.';
    case CODES.WORKER_URL_INVALID:
      return 'Account service configuration error. Please contact support.';
    case CODES.REQUEST_FAILED:
    case CODES.SYNC_FAILED:
    case CODES.POSITIONS_FAILED:
      return sanitizeWorkerMessageForClient(internalMsg, fb);
    default:
      return sanitizeWorkerMessageForClient(internalMsg, fb);
  }
}

function publicConnectError(code, internalMsg) {
  if (code === 'MT5_LOGIN_PASSWORD_SERVER_REQUIRED') {
    const m = String(internalMsg || '').trim();
    return m.slice(0, 300) || 'Account login, investor password, and broker server are required.';
  }
  const fb = 'Could not connect to MetaTrader. Check login, investor password, and broker server.';
  switch (code) {
    case CODES.CONFIG_MISSING:
    case CODES.WORKER_URL_NOT_CONFIGURED:
      return 'Connection service is not available. Please contact support.';
    case CODES.TIMEOUT:
      return 'Connection timed out. Please try again.';
    case CODES.UNAUTHORIZED_SECRET:
      return 'Connection could not be authenticated with the data service. Please try again later.';
    case CODES.WORKER_URL_INVALID:
      return 'Connection service configuration error. Please contact support.';
    case CODES.SYNC_FAILED:
    case CODES.REQUEST_FAILED:
      return sanitizeWorkerMessageForClient(internalMsg, fb);
    default:
      return sanitizeWorkerMessageForClient(internalMsg, fb);
  }
}

/**
 * Dev-only history diagnostics (no secrets). Caller must gate with isAuraDiagnosticsEnabled().
 */
function buildHistoryDiagnostics(fields) {
  return {
    dataSource: fields.dataSource,
    stale: !!fields.stale,
    normalizedRowCount: fields.normalizedRowCount,
    validTradeRows: fields.validTradeRows,
    discardedRows: fields.discardedRows,
    openCount: fields.openCount,
    closedCount: fields.closedCount,
    netPnlBreakdown: fields.netPnlBreakdown || {},
  };
}

module.exports = {
  isAuraDiagnosticsEnabled,
  safeMtLog,
  sanitizeWorkerMessageForClient,
  publicHistoryError,
  publicAccountLiveError,
  publicConnectError,
  buildHistoryDiagnostics,
  AURA_MT_ERROR_CODES: CODES,
};
