/**
 * Mark Twelve-Data-heavy cron handlers as background traffic (lower priority vs interactive API).
 */

const { runWithTdRequestMeta } = require('../market-data/tdRequestContext');

function runTwelveDataCronWork(fn) {
  return runWithTdRequestMeta({ trafficClass: 'background' }, fn);
}

module.exports = { runTwelveDataCronWork };
