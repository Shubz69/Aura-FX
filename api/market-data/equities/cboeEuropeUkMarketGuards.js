/**
 * Cboe Europe Equities UK (Twelve Data MIC BCXE, country UK).
 * Canonical internal suffix `.BCXE` keeps instruments distinct from LSE/AIM `.L`.
 *
 * @see https://twelvedata.com/exchanges/bcxe
 */

function cboeEuropeUkTdExchangeCode() {
  return String(process.env.TWELVE_DATA_CBOE_UK_EXCHANGE_CODE || 'BCXE').trim() || 'BCXE';
}

/** MIC for /exchange_schedule when TD expects MIC. */
function cboeEuropeUkMic() {
  return String(process.env.TWELVE_DATA_CBOE_UK_MIC || 'BCXE').trim() || 'BCXE';
}

/**
 * If LSE and Cboe UK TD exchange codes are identical, `TICKER:CODE` parsing can mis-route.
 * Logs once at process start (best-effort).
 */
function warnIfCboeUkExchangeCodeCollidesWithLse() {
  try {
    const { ukTwelveDataExchangeCode } = require('./ukMarketGuards');
    const u = ukTwelveDataExchangeCode().toUpperCase();
    const b = cboeEuropeUkTdExchangeCode().toUpperCase();
    if (u && b && u === b) {
      console.warn(
        '[cboeEuropeUkMarketGuards] TWELVE_DATA_UK_EXCHANGE_CODE and TWELVE_DATA_CBOE_UK_EXCHANGE_CODE are both "' +
          u +
          '". Use distinct Twelve Data exchange codes so .L (LSE/AIM) and .BCXE (Cboe UK) symbols do not collide.'
      );
    }
  } catch (_) {
    /* ignore */
  }
}
warnIfCboeUkExchangeCodeCollidesWithLse();

module.exports = {
  cboeEuropeUkTdExchangeCode,
  cboeEuropeUkMic,
};
