/**
 * Structured system logging (instruments, calculator, MT5 pipeline, chart-check).
 * No secrets: payloads are redacted and size-capped. Disabled by default in production unless configured.
 */

const LEVEL_RANK = { error: 0, warn: 1, info: 2 };
const DEFAULT_MAX_PAYLOAD_CHARS = 4096;

const SENSITIVE_KEY_RE = /(password|secret|token|authorization|cookie|apikey|api_key|bearer)/i;

function getEnv(name) {
  if (typeof process === 'undefined' || !process.env) return undefined;
  return process.env[name];
}

function isLogEnabled() {
  const v = getEnv('SYSTEM_LOG_ENABLED') ?? getEnv('REACT_APP_SYSTEM_LOG_ENABLED');
  if (v === '0' || v === 'false') return false;
  if (v === '1' || v === 'true') return true;
  if (getEnv('NODE_ENV') === 'test') return false;
  return getEnv('NODE_ENV') !== 'production';
}

function minLevel() {
  const raw = (getEnv('SYSTEM_LOG_LEVEL') || getEnv('REACT_APP_SYSTEM_LOG_LEVEL') || 'info').toLowerCase();
  if (raw === 'error') return 'error';
  if (raw === 'warn') return 'warn';
  return 'info';
}

function shouldEmit(level) {
  if (!isLogEnabled()) return false;
  return LEVEL_RANK[level] <= LEVEL_RANK[minLevel()];
}

/**
 * @param {unknown} obj
 * @param {number} depth
 * @returns {unknown}
 */
function redactDeep(obj, depth = 0) {
  if (depth > 8) return '[max-depth]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.length > 500) return `${obj.slice(0, 500)}…`;
    return obj;
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map((x) => redactDeep(x, depth + 1));
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEY_RE.test(k)) {
      out[k] = '[redacted]';
      continue;
    }
    out[k] = redactDeep(v, depth + 1);
  }
  return out;
}

function capJson(obj) {
  try {
    const s = JSON.stringify(obj);
    if (s.length <= DEFAULT_MAX_PAYLOAD_CHARS) return obj;
    return { _truncated: true, preview: s.slice(0, DEFAULT_MAX_PAYLOAD_CHARS) + '…' };
  } catch {
    return { _error: 'stringify_failed' };
  }
}

/**
 * @param {'instrument'|'calculator'|'mt5'|'chart-check'} module
 * @param {string} action
 * @param {Record<string, unknown>} [payload]
 */
function resolveRequestId(payload) {
  if (payload && payload.requestId) return String(payload.requestId);
  return null;
}

function emit(level, module, action, payload) {
  if (!shouldEmit(level)) return;
  const rid = resolveRequestId(payload || {});
  const payloadClean = { ...(payload || {}) };
  delete payloadClean.requestId;
  const entry = {
    ts: new Date().toISOString(),
    ...(rid ? { requestId: rid } : {}),
    level,
    module,
    action,
    payload: capJson(redactDeep(payloadClean)),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export function logInfo(module, action, payload) {
  emit('info', module, action, payload);
}

export function logWarn(module, action, payload) {
  emit('warn', module, action, payload);
}

export function logError(module, action, payload) {
  emit('error', module, action, payload);
}
