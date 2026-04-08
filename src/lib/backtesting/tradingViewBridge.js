import { assetToChartSymbolFromDecoder } from '../../utils/traderSuite';

/**
 * Map backtesting replay timeframe (M5, H1, …) to TradingView embed widget `interval` strings.
 * @param {string} timeframe
 * @returns {string}
 */
export function bridgeTimeframeToTvInterval(timeframe) {
  const t = String(timeframe || 'M15').toUpperCase();
  if (t === 'M1') return '1';
  if (t === 'M5') return '5';
  if (t === 'M15') return '15';
  if (t === 'M30') return '30';
  if (t === 'H1') return '60';
  if (t === 'H4') return '240';
  if (t === 'D1' || t === '1D') return 'D';
  return '15';
}

/**
 * Resolve bridge.symbol (e.g. EURUSD) to a TradingView symbol string (e.g. OANDA:EURUSD).
 * @param {{ symbol?: string }} bridge
 */
export function bridgeToTradingViewSymbol(bridge) {
  const raw = String(bridge?.symbol || 'EURUSD').trim();
  if (!raw || raw === '—') return 'OANDA:EURUSD';
  if (raw.includes(':')) return raw;
  return assetToChartSymbolFromDecoder(raw);
}
