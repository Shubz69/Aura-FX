/**
 * Resolves symbol universes per market category (watchlist groups, env lists, FX tier-1).
 */

const { GROUPS } = require('../../market/defaultWatchlist');
const { getEquityIngestSymbols } = require('../equities/equityUniverse');
const { FX_OHLCV_PRIORITY_V1 } = require('../ohlcvTier1');

function parseEnvSymbolList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => String(s || '').trim().toUpperCase())
        .filter(Boolean)
    ),
  ];
}

function sliceLimit(list, envKey, fallback) {
  const lim = Math.max(3, Math.min(120, parseInt(process.env[envKey] || String(fallback), 10) || fallback));
  return [...new Set(list)].slice(0, lim);
}

function symbolsFromGroup(groupKey, envKey = 'TD_GENERIC_INGEST_SYMBOL_LIMIT', fallbackLimit = 40) {
  const g = GROUPS[groupKey];
  if (!g || !g.symbols) return [];
  const raw = g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean);
  return sliceLimit(raw, envKey, fallbackLimit);
}

/**
 * @param {{ symbolSource?: string }} cat
 */
function getSymbolsForCategory(cat) {
  if (!cat || !cat.symbolSource) return [];
  switch (cat.symbolSource) {
    case 'watchlistStocksEtfs':
      return getEquityIngestSymbols();
    case 'fxTier1':
      return [...FX_OHLCV_PRIORITY_V1];
    case 'watchlistIndices':
      return symbolsFromGroup('indices');
    case 'watchlistCommodities':
      return symbolsFromGroup('commodities');
    case 'watchlistCrypto':
      return symbolsFromGroup('crypto');
    case 'watchlistUk': {
      const g = GROUPS.uk;
      if (!g || !g.symbols) {
        return sliceLimit(parseEnvSymbolList(process.env.UK_EQ_INGEST_SYMBOLS), 'TD_UK_INGEST_SYMBOL_LIMIT', 40);
      }
      const raw = g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean);
      const envExtra = parseEnvSymbolList(process.env.UK_EQ_INGEST_SYMBOLS);
      return sliceLimit([...raw, ...envExtra], 'TD_UK_INGEST_SYMBOL_LIMIT', 40);
    }
    case 'envIntlEquities':
      return sliceLimit(parseEnvSymbolList(process.env.INTL_EQ_INGEST_SYMBOLS), 'TD_INTL_EQ_INGEST_SYMBOL_LIMIT', 35);
    case 'watchlistAsx': {
      const g = GROUPS.asx;
      if (!g || !g.symbols) return [];
      const raw = g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean);
      const envExtra = parseEnvSymbolList(process.env.ASX_EQ_INGEST_SYMBOLS);
      return sliceLimit([...raw, ...envExtra], 'TD_ASX_INGEST_SYMBOL_LIMIT', 45);
    }
    case 'watchlistCboeUk': {
      const g = GROUPS.cboeUk;
      if (!g || !g.symbols) {
        return sliceLimit(parseEnvSymbolList(process.env.CBOE_UK_EQ_INGEST_SYMBOLS), 'TD_CBOE_UK_INGEST_SYMBOL_LIMIT', 25);
      }
      const raw = g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean);
      const envExtra = parseEnvSymbolList(process.env.CBOE_UK_EQ_INGEST_SYMBOLS);
      return sliceLimit([...raw, ...envExtra], 'TD_CBOE_UK_INGEST_SYMBOL_LIMIT', 25);
    }
    case 'watchlistCboeAu': {
      const g = GROUPS.cboeAu;
      if (!g || !g.symbols) {
        return sliceLimit(parseEnvSymbolList(process.env.CBOE_AU_EQ_INGEST_SYMBOLS), 'TD_CBOE_AU_INGEST_SYMBOL_LIMIT', 30);
      }
      const raw = g.symbols.map((row) => String(row.symbol || '').toUpperCase()).filter(Boolean);
      const envExtra = parseEnvSymbolList(process.env.CBOE_AU_EQ_INGEST_SYMBOLS);
      return sliceLimit([...raw, ...envExtra], 'TD_CBOE_AU_INGEST_SYMBOL_LIMIT', 30);
    }
    case 'ventureEnvSymbols': {
      const key = cat.ventureEnvSymbols;
      if (!key) return [];
      return sliceLimit(parseEnvSymbolList(process.env[key]), 'TD_VENTURE_INGEST_SYMBOL_LIMIT', 35);
    }
    default:
      return [];
  }
}

module.exports = { getSymbolsForCategory, parseEnvSymbolList, symbolsFromGroup };
