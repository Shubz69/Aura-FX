/**
 * FRED API – 10Y yield, CPI, unemployment, macro series. Server-side only.
 */

const { getConfig } = require('../config');
const { fetchWithTimeout } = require('./fetchWithTimeout');

const BASE = 'https://api.stlouisfed.org/fred';
const TIMEOUT_MS = 12000;

const SERIES_IDS = {
  treasury10y: 'DGS10',
  cpi: 'CPIAUCSL',
  unemployment: 'UNRATE',
};

function buildUrl(path, params = {}) {
  const { fredApiKey } = getConfig();
  const q = new URLSearchParams({ file_type: 'json', api_key: fredApiKey || '', ...params });
  return `${BASE}${path}?${q.toString()}`;
}

async function getSeriesLatest(seriesId, limit = 5) {
  const { fredApiKey } = getConfig();
  if (!fredApiKey) return { ok: false, data: [], error: 'FRED key not configured' };

  const url = buildUrl('/series/observations', {
    series_id: seriesId,
    sort_order: 'desc',
    limit,
  });
  try {
    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) return { ok: false, data: [], error: `FRED ${res.status}` };
    const json = await res.json();
    const observations = (json && json.observations) || [];
    const data = observations.map((o) => ({ date: o.date, value: o.value })).filter((o) => o.value !== '.' && o.value !== '');
    return { ok: true, data };
  } catch (e) {
    console.warn('[trader-deck] FRED series error:', seriesId, e.message || e);
    return { ok: false, data: [], error: e.message || 'FRED request failed' };
  }
}

async function getTwelveDataTreasury10y() {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.twelvedata.com/price?symbol=US10Y&apikey=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, {}, 8000);
    if (!res.ok) return null;
    const json = await res.json();
    if (json && json.price) {
      const val = parseFloat(json.price);
      if (!isNaN(val) && val > 0) return val;
    }
  } catch (e) {
    console.warn('[trader-deck] Twelve Data US10Y error:', e.message || e);
  }
  return null;
}

async function getYahooTreasury10y() {
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=1d';
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    }, 8000);
    if (!res.ok) return null;
    const json = await res.json();
    const price = json && json.chart && json.chart.result && json.chart.result[0] && json.chart.result[0].meta && json.chart.result[0].meta.regularMarketPrice;
    if (price && !isNaN(price) && price > 0) return price;
  } catch (e) {
    console.warn('[trader-deck] Yahoo TNX error:', e.message || e);
  }
  return null;
}

async function getFredData() {
  const [treasury, cpi, unemployment] = await Promise.all([
    getSeriesLatest(SERIES_IDS.treasury10y),
    getSeriesLatest(SERIES_IDS.cpi),
    getSeriesLatest(SERIES_IDS.unemployment),
  ]);

  const toNum = (arr) => (Array.isArray(arr) && arr[0] && arr[0].value ? Number(arr[0].value) : null);

  let treasury10y = toNum(treasury.data);

  if (treasury10y == null) {
    treasury10y = await getTwelveDataTreasury10y();
  }
  if (treasury10y == null) {
    treasury10y = await getYahooTreasury10y();
  }

  return {
    treasury10y,
    cpi: toNum(cpi.data),
    unemployment: toNum(unemployment.data),
    raw: { treasury: treasury.data, cpi: cpi.data, unemployment: unemployment.data },
    errors: [treasury.error, cpi.error, unemployment.error].filter(Boolean),
  };
}

module.exports = { getSeriesLatest, getFredData, SERIES_IDS };
