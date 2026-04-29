/**
 * Legacy nested URL compatibility: /api/trader-replay/trades/:tradeId
 * Vercel rewrites here with ?tradeId= so the handler always receives a query param.
 * Reuses the list/detail implementation in trades.js.
 */
module.exports = require('./trades.js');
