/**
 * Natural-language chart navigation: symbol, timeframe, destination (Trader Lab / Replay).
 * Handoff via sessionStorage; destination pages peek, apply, then clear.
 */

export const CHART_USER_REQUEST_STORAGE_KEY = 'aura_chart_user_request_v1';

export const CHART_PATH_TRADER_LAB = '/trader-deck/trade-validator/trader-lab';
export const CHART_PATH_TRADER_REPLAY = '/aura-analysis/dashboard/trader-replay';

const ALIAS_TO_TV_SYMBOL = {
  gold: 'OANDA:XAUUSD',
  xau: 'OANDA:XAUUSD',
  xauusd: 'OANDA:XAUUSD',
  silver: 'OANDA:XAGUSD',
  xagusd: 'OANDA:XAGUSD',
  bitcoin: 'COINBASE:BTCUSD',
  btc: 'COINBASE:BTCUSD',
  btcusd: 'COINBASE:BTCUSD',
  ethereum: 'COINBASE:ETHUSD',
  eth: 'COINBASE:ETHUSD',
  ethusd: 'COINBASE:ETHUSD',
  's&p': 'OANDA:SPX500USD',
  spx: 'OANDA:SPX500USD',
  sp500: 'OANDA:SPX500USD',
  's&p500': 'OANDA:SPX500USD',
  nasdaq: 'OANDA:NAS100USD',
  nas100: 'OANDA:NAS100USD',
  ndx: 'OANDA:NAS100USD',
  nq: 'OANDA:NAS100USD',
  dow: 'OANDA:US30USD',
  us30: 'OANDA:US30USD',
  dxy: 'TVC:DXY',
  vix: 'TVC:VIX',
  oil: 'TVC:USOIL',
  wti: 'TVC:USOIL',
  brent: 'TVC:UKOIL',
  natgas: 'TVC:NATGASUSD',
  gas: 'TVC:NATGASUSD',
};

function detectTimeframe(lower) {
  if (/\b(1m|m1|1\s*m|one minute)\b/i.test(lower)) return '1';
  if (/\b(15m|m15|15\s*m)\b/i.test(lower) || /\b15\b/.test(lower)) return '15';
  if (/\b(4h|h4|240)\b/i.test(lower)) return '240';
  if (/\b(1h|h1|60m|hourly)\b/i.test(lower) || /\b60\b/.test(lower)) return '60';
  if (/\b(daily|1d|d1|day\b)/i.test(lower) || /\bd\b/.test(lower)) return '1D';
  return '';
}

function detectDestination(lower) {
  if (/trader\s*lab|trade\s*validator.*lab|\/trader-lab\b/i.test(lower)) return CHART_PATH_TRADER_LAB;
  if (/trader\s*replay|\breplay\b|dashboard\/trader-replay/i.test(lower)) return CHART_PATH_TRADER_REPLAY;
  return '';
}

function detectTvOrPair(lower) {
  const tv = lower.match(/\b(oanda|tvc|amex|nasdaq|coinbase|binance):[a-z0-9._]+\b/i);
  if (tv) return tv[0].toUpperCase();
  const slash = lower.match(/\b([a-z]{3})\s*\/\s*([a-z]{3})\b/i);
  if (slash) return `OANDA:${(slash[1] + slash[2]).toUpperCase()}`;
  const sixLetterDeny = new Set([
    'replay',
    'trader',
    'daily',
    'weekly',
    'chart',
    'market',
    'silver',
    'lab',
    'session',
    'open',
    'show',
    'load',
  ]);
  const six = lower.match(/\b([a-z]{6})\b/i);
  if (six && /^[a-z]{6}$/i.test(six[1]) && !sixLetterDeny.has(six[1].toLowerCase())) {
    return `OANDA:${six[1].toUpperCase()}`;
  }
  for (const [alias, sym] of Object.entries(ALIAS_TO_TV_SYMBOL)) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) return sym;
  }
  return '';
}

/**
 * @param {string} message
 * @returns {{ chartSymbol: string, interval: string, path: string } | null}
 */
export function parseChartNavigationIntent(message) {
  const raw = String(message || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();

  const verbOrChart =
    /\b(show|open|display|put|load|switch|navigate)\b/i.test(raw) ||
    /\b(chart|candles?|candlesticks?|timeframe|time frame)\b/i.test(lower);

  const sym = detectTvOrPair(lower);
  const interval = detectTimeframe(lower);
  const path = detectDestination(lower) || CHART_PATH_TRADER_LAB;

  if (!verbOrChart && !(sym && interval)) return null;
  if (!sym && !interval) return null;

  return {
    chartSymbol: sym || '',
    interval: interval || '',
    path,
  };
}

export function writeChartUserRequestToStorage(payload) {
  try {
    sessionStorage.setItem(
      CHART_USER_REQUEST_STORAGE_KEY,
      JSON.stringify({
        chartSymbol: payload.chartSymbol || '',
        interval: payload.interval || '',
        path: payload.path || CHART_PATH_TRADER_LAB,
        ts: Date.now(),
      })
    );
  } catch {
    /* ignore */
  }
}

export function peekChartUserRequestFromStorage() {
  try {
    const raw = sessionStorage.getItem(CHART_USER_REQUEST_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

export function clearChartUserRequestStorage() {
  try {
    sessionStorage.removeItem(CHART_USER_REQUEST_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Replay form uses `D` for daily; Trader Lab uses `1D`. */
export function intervalForReplayForm(interval) {
  const x = String(interval || '').toUpperCase();
  if (x === '1D' || x === 'D') return 'D';
  return String(interval || '15');
}

/** Trader Lab chart toolbar uses `1D` for daily. */
export function intervalForTraderLab(interval) {
  const x = String(interval || '').toUpperCase();
  if (x === 'D') return '1D';
  return String(interval || '60');
}
