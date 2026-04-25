import { generateRequestId } from './requestCorrelation';

const RE_REALTIME = /websocket|sockjs|stomp|\/ws\b|\/topic\//i;

const getHeader = (headers, key) => {
  if (!headers || typeof headers !== 'object') return null;
  return headers[key] || headers[key.toLowerCase()] || null;
};

export function ensureCorrelationId(config = {}) {
  const next = config;
  next.headers = next.headers || {};
  const existing = getHeader(next.headers, 'X-Correlation-ID');
  const correlationId = existing || generateRequestId();
  next.headers['X-Correlation-ID'] = correlationId;
  next.__correlationId = correlationId;
  return correlationId;
}

export function getCorrelationIdFromError(error) {
  return (
    error?.config?.__correlationId ||
    getHeader(error?.config?.headers, 'X-Correlation-ID') ||
    getHeader(error?.response?.headers, 'x-correlation-id') ||
    null
  );
}

export function classifyRequestError(error) {
  if (!error) return 'unknown';
  const message = String(error?.message || '').toLowerCase();
  if (
    error?.code === 'ERR_CANCELED' ||
    error?.name === 'CanceledError' ||
    error?.name === 'AbortError' ||
    message === 'canceled' ||
    message.includes('aborted')
  ) return 'request_abort';
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''))) return 'timeout';
  if (error?.response?.status === 401 || error?.response?.status === 403) return 'auth';
  if (!error?.response && (error?.code === 'ERR_NETWORK' || /network error/i.test(String(error?.message || '')))) return 'network';
  const url = String(error?.config?.url || '');
  if (RE_REALTIME.test(url)) return 'realtime';
  if (error?.response) return 'api';
  return 'unknown';
}

export function logClassifiedError(scope, error, extra = {}) {
  const type = classifyRequestError(error);
  // Aborts/cancellations are expected in poll/switch flows; avoid console noise.
  if (type === 'request_abort') return;
  const payload = {
    scope,
    type,
    correlationId: getCorrelationIdFromError(error),
    status: error?.response?.status || null,
    code: error?.code || null,
    method: error?.config?.method || null,
    url: error?.config?.url || null,
    message: error?.response?.data?.message || error?.message || 'Unknown error',
    ...extra,
  };
  console.error('[observability]', payload);
}
