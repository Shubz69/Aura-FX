/**
 * Per-request context for serverless handlers (correlation ID without threading).
 */

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function runWithRequestContext(requestId, fn) {
  return storage.run({ requestId: String(requestId || '').trim() || null }, fn);
}

function getAsyncRequestId() {
  const s = storage.getStore();
  return s && s.requestId ? s.requestId : null;
}

module.exports = { runWithRequestContext, getAsyncRequestId };
