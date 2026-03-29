/**
 * @deprecated Use ./mtSyncProvider — re-export only for import path stability.
 * Aura Analysis MetaTrader flow uses investor-password sync via AURA_MT_SYNC_URL (or legacy TERMINALSYNC_* env).
 */
module.exports = require('./mtSyncProvider');
