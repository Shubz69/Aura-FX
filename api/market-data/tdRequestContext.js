/**
 * Async-local metadata for Twelve Data HTTP (feature tag + traffic class).
 * Cron/ingest sets trafficClass=background so the shared gate deprioritizes vs API/UI.
 */

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

const DEFAULT = Object.freeze({
  trafficClass: 'interactive',
  throttleFeature: null,
});

function getTdRequestMeta() {
  return storage.getStore() || DEFAULT;
}

/**
 * Merge patch into current async context (or start a new one) and run fn.
 * @param {Partial<{ trafficClass: 'interactive'|'background', throttleFeature: string|null }>} patch
 * @param {() => any} fn
 */
function runWithTdRequestMeta(patch, fn) {
  const parent = storage.getStore();
  const next = { ...(parent || {}), ...patch };
  if (!next.trafficClass) next.trafficClass = 'interactive';
  return storage.run(next, fn);
}

module.exports = {
  getTdRequestMeta,
  runWithTdRequestMeta,
  DEFAULT,
};
