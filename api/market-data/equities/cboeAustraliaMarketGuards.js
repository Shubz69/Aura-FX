/**
 * Cboe Australia — Twelve Data exchange CXAC (MIC CXAC by default).
 * Canonical internal suffix `.CXAC` keeps instruments distinct from ASX `.AX` / `TICKER:ASX`.
 *
 * Guardrails: use the shared `cboe_australia` category + symbol-registry only (no ad-hoc routes).
 * Twelve Data remains primary for quotes/series; fundamentals/analysis/regulatory paths are
 * DB/cache-first on hot requests with cron refresh — see registry `skipIngestDatasetKeys` for
 * inherited keys intentionally skipped from ingest as low-value for this venue.
 *
 * @see https://twelvedata.com/exchanges/cxac
 */

const { ASX_EXCHANGE } = require('./asxTwelveDataReference');

function cboeAustraliaTdExchangeCode() {
  return String(process.env.TWELVE_DATA_CBOE_AU_EXCHANGE_CODE || 'CXAC').trim() || 'CXAC';
}

/** MIC for /exchange_schedule when Twelve Data expects MIC. */
function cboeAustraliaMic() {
  return String(process.env.TWELVE_DATA_CBOE_AU_MIC || 'CXAC').trim() || 'CXAC';
}

function warnIfCboeAustraliaOverlapsAsxExchangeCode() {
  try {
    const asx = String(ASX_EXCHANGE || 'ASX').toUpperCase();
    const cx = cboeAustraliaTdExchangeCode().toUpperCase();
    if (asx && cx && asx === cx) {
      console.warn(
        '[cboeAustraliaMarketGuards] Cboe Australia TWELVE_DATA_CBOE_AU_EXCHANGE_CODE equals ASX code "' +
          asx +
          '". Use CXAC (or another distinct TD code) so .CXAC and .AX symbols do not collide.'
      );
    }
  } catch (_) {
    /* ignore */
  }
}
warnIfCboeAustraliaOverlapsAsxExchangeCode();

module.exports = {
  cboeAustraliaTdExchangeCode,
  cboeAustraliaMic,
};
