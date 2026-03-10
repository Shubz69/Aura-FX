/**
 * Market Intelligence data for Trader Deck.
 * Structure is API-ready: swap getMarketIntelligence() implementation for live data later.
 */

export const DEFAULT_MARKET_REGIME = {
  currentRegime: '',
  primaryDriver: '',
  secondaryDriver: '',
  marketSentiment: '',
};

export const DEFAULT_MARKET_PULSE = { value: 50, label: 'NEUTRAL' }; // value 0–100

export const SEED_MARKET_INTELLIGENCE = {
  marketRegime: {
    currentRegime: 'Rate Sensitivity',
    primaryDriver: 'Bond Yields',
    secondaryDriver: 'US Economic Data',
    marketSentiment: 'Neutral',
  },
  marketPulse: { value: 50, label: 'NEUTRAL' },
  keyDrivers: [
    { title: 'Bond Yields', direction: 'up', impact: 'High' },
    { title: 'US Dollar', direction: 'up', impact: 'Medium' },
    { title: 'Oil Prices', direction: 'down', impact: 'Low' },
    { title: 'Geopolitical Risk', direction: 'up', impact: 'Medium' },
  ],
  crossAssetSignals: [
    { asset: 'Yields', direction: 'up', label: 'Bullish' },
    { asset: 'USD', direction: 'up', label: 'Strong' },
    { asset: 'Gold', direction: 'down', label: 'Bearish' },
    { asset: 'Stocks', direction: 'neutral', label: 'Neutral' },
    { asset: 'Oil', direction: 'up', label: 'Rising' },
  ],
  marketChangesToday: [
    'Strong US Jobs Data',
    'Bond Yields Surging',
    'USD Gaining Strength',
    'Gold Under Pressure',
  ],
  traderFocus: [
    'Watch US bond yields',
    'Monitor EURUSD levels',
    "Track gold's reaction to yields",
  ],
  riskRadar: [
    'Upcoming CPI Report',
    'Fed Speakers Today',
    'Geopolitical Tensions',
  ],
};

export async function getMarketIntelligence() {
  // Later: return (await Api.getTraderDeckMarketIntelligence())?.data ?? SEED_MARKET_INTELLIGENCE;
  return Promise.resolve(SEED_MARKET_INTELLIGENCE);
}
