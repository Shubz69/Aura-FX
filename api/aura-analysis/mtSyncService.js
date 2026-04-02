/**
 * Single entry for MT5 worker operations — reusable from HTTP handlers and future schedulers.
 * Delegates to mtSyncProvider; adds trigger metadata for logging/background jobs.
 */
const mt = require('./mtSyncProvider');

/**
 * @param {'account_snapshot'|'positions'|'deal_history'} operation
 * @param {object} credentials
 * @param {'mt4'|'mt5'} [platformId]
 * @param {object} [options]
 * @param {'api'|'connect_validate'|'platform_account_refresh'|'history'|'scheduled'} [options.trigger]
 * @param {number} [options.days] history lookback (days)
 */
async function performMt5Operation(operation, credentials, platformId = 'mt5', options = {}) {
  const trigger = options.trigger || 'api';
  if (operation === 'account_snapshot') {
    const r = await mt.syncAccount(credentials, platformId);
    return { ...r, trigger };
  }
  if (operation === 'positions') {
    const r = await mt.getPositions(credentials, platformId, options);
    return { ...r, trigger };
  }
  if (operation === 'deal_history') {
    const r = await mt.getDealHistory(credentials, platformId, options);
    return { ...r, trigger };
  }
  return { ok: false, code: 'UNSUPPORTED_MT5_OPERATION', error: 'Unsupported operation', trigger };
}

module.exports = {
  performMt5Operation,
};
