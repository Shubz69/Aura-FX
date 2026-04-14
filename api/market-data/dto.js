/**
 * Internal market data DTOs — all provider outputs map here before priceMath or UI mapping.
 * @typedef {Object} QuoteDTO
 * @property {string} canonicalSymbol
 * @property {string} providerSymbol
 * @property {string} assetClass
 * @property {string} source
 * @property {number|null} last
 * @property {number|null} bid
 * @property {number|null} ask
 * @property {number|null} open
 * @property {number|null} high
 * @property {number|null} low
 * @property {number|null} prevClose
 * @property {number|null} volume
 * @property {number|null} averageVolume
 * @property {string|null} currency
 * @property {string|null} exchange
 * @property {number|null} tsUtcMs - event time ms UTC
 * @property {Object} [forexContext] - Twelve Data market_state / optional exchange_schedule (FX, metals, crypto: market_state + schedule only for FX when MIC configured)
 * @property {Object} [raw]
 */

/**
 * @typedef {Object} CandleBarDTO
 * @property {number} tUtcMs - bar open time UTC epoch ms
 * @property {number} o
 * @property {number} h
 * @property {number} l
 * @property {number} c
 * @property {number|null} v
 */

/**
 * @typedef {Object} CandleSeriesDTO
 * @property {string} canonicalSymbol
 * @property {string} providerSymbol
 * @property {string} interval - e.g. 1day, 1h
 * @property {string} source
 * @property {string|null} timezone
 * @property {CandleBarDTO[]} bars - ascending by tUtcMs
 * @property {Object} [raw]
 */

function emptyQuoteDTO(partial = {}) {
  return {
    canonicalSymbol: partial.canonicalSymbol || '',
    providerSymbol: partial.providerSymbol || '',
    assetClass: partial.assetClass || 'stock',
    source: partial.source || 'unknown',
    last: partial.last != null ? Number(partial.last) : null,
    bid: partial.bid != null ? Number(partial.bid) : null,
    ask: partial.ask != null ? Number(partial.ask) : null,
    open: partial.open != null ? Number(partial.open) : null,
    high: partial.high != null ? Number(partial.high) : null,
    low: partial.low != null ? Number(partial.low) : null,
    prevClose: partial.prevClose != null ? Number(partial.prevClose) : null,
    volume: partial.volume != null ? Number(partial.volume) : null,
    averageVolume: partial.averageVolume != null ? Number(partial.averageVolume) : null,
    currency: partial.currency || null,
    exchange: partial.exchange || null,
    tsUtcMs: partial.tsUtcMs != null ? Number(partial.tsUtcMs) : null,
    forexContext: partial.forexContext != null ? partial.forexContext : null,
    raw: partial.raw,
  };
}

function emptyCandleSeriesDTO(partial = {}) {
  return {
    canonicalSymbol: partial.canonicalSymbol || '',
    providerSymbol: partial.providerSymbol || '',
    interval: partial.interval || '1day',
    source: partial.source || 'unknown',
    timezone: partial.timezone || null,
    bars: Array.isArray(partial.bars) ? partial.bars : [],
    raw: partial.raw,
  };
}

module.exports = {
  emptyQuoteDTO,
  emptyCandleSeriesDTO,
};
