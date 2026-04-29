export function buildReplayTradeUrl(tradeId) {
  return `/aura-analysis/dashboard/trader-replay?tradeId=${encodeURIComponent(String(tradeId || ''))}`;
}
