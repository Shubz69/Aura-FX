// Forex Factory Economic Calendar API
// Delegates to forex-factory-calendar.js which scrapes ForexFactory,
// falls back to Trading Economics API, then returns empty calendar.
// Previously this file returned hardcoded fake data.

module.exports = require('./forex-factory-calendar');
