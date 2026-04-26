/**
 * Logged-in home dashboard watchlist rotation pool.
 * Canonical symbols must match GET /api/markets/snapshot keys (see api/market/defaultWatchlist.js).
 * Kept moderate-sized so one hook subscription does not churn listeners; snapshot still returns full universe.
 */
export const HOME_DASHBOARD_MARKET_POOL = [
  'BTCUSD',
  'ETHUSD',
  'SOLUSD',
  'EURUSD',
  'GBPUSD',
  'USDJPY',
  'AUDUSD',
  'USDCAD',
  'XAUUSD',
  'XAGUSD',
  'SPX',
  'NDX',
  'DJI',
  'AAPL',
  'NVDA',
  'TSLA',
  'MSFT',
  'AMZN',
  'GOOGL',
  'META',
  'SPY',
  'QQQ',
  'DXY',
  'VIX',
];

/** Visible rows at once (matches prior four-row layout). */
export const HOME_DASHBOARD_WATCHLIST_VISIBLE = 4;

/** Rotate visible slice every ~22s while tab visible (no extra REST vs global snapshot poll). */
export const HOME_DASHBOARD_WATCHLIST_ROTATE_MS = 22000;
