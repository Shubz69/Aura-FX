/**
 * Default universe for Twelve Data equity dataset ingestion (stocks + ETFs from watchlist).
 */

const { GROUPS } = require('../../market/defaultWatchlist');

function getEquityIngestSymbols() {
  const groupKeys = ['stocks', 'etfs'];
  const out = [];
  for (const k of groupKeys) {
    const g = GROUPS[k];
    if (!g || !g.symbols) continue;
    for (const row of g.symbols) {
      if (row && row.symbol) out.push(String(row.symbol).toUpperCase());
    }
  }
  const lim = Math.max(5, Math.min(120, parseInt(process.env.TD_EQUITY_INGEST_SYMBOL_LIMIT || '45', 10) || 45));
  return [...new Set(out)].slice(0, lim);
}

module.exports = { getEquityIngestSymbols };
