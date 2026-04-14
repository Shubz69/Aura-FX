/**
 * MarketStreamProvider — v1 no-op; real-time Twelve Data WS belongs on a long-lived worker (e.g. Railway).
 *
 * Phase B: run one TD WebSocket per instrument group on Railway, normalize to QuoteDTO, write * asset_prices or market_quote_ticks, rely on cache TTL for invalidation (no browser → TD).
 */

class NoopMarketStreamProvider {
  /** @param {{ canonicalSymbol: string, intervalKey: string, barCount: number, latestBarTimeUtcMs?: number }} _evt */
  async onOhlcvBarsWritten(_evt) {}

  /** @param {{ symbols: string[], rowCount: number, source?: string }} _evt */
  async onAssetPricesPersisted(_evt) {}
}

let instance = new NoopMarketStreamProvider();

function setMarketStreamProvider(provider) {
  instance = provider || new NoopMarketStreamProvider();
}

function getMarketStreamProvider() {
  return instance;
}

module.exports = {
  NoopMarketStreamProvider,
  getMarketStreamProvider,
  setMarketStreamProvider,
};
