/**
 * Structured extension points for additional lawful, official public publishers.
 * Implement new feeds as modules under ./adapters (see htmlListAdapter.js, federalReserve.js),
 * then append the module to ADAPTERS in ./adapters/index.js.
 *
 * Categories we prioritize: central banks, regulators, treasuries, foreign affairs,
 * sanctions, exchanges, transport, aviation, maritime, multilateral institutions.
 * Do not lower trust tiers to inflate volume.
 */
const EXTENSION_CATEGORIES = Object.freeze([
  'central_bank',
  'regulator',
  'treasury_finance',
  'foreign_affairs',
  'sanctions',
  'exchange',
  'transport',
  'aviation',
  'maritime',
  'multilateral',
]);

module.exports = { EXTENSION_CATEGORIES };
