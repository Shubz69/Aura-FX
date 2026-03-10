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

async function getFredData() {
  const [treasury, cpi, unemployment] = await Promise.all([
    getSeriesLatest(SERIES_IDS.treasury10y),
    getSeriesLatest(SERIES_IDS.cpi),
    getSeriesLatest(SERIES_IDS.unemployment),
  ]);

  const toNum = (arr) => (Array.isArray(arr) && arr[0] && arr[0].value ? Number(arr[0].value) : null);

  return {
    treasury10y: toNum(treasury.data),
    cpi: toNum(cpi.data),
    unemployment: toNum(unemployment.data),
    raw: { treasury: treasury.data, cpi: cpi.data, unemployment: unemployment.data },
    errors: [treasury.error, cpi.error, unemployment.error].filter(Boolean),
  };
}

module.exports = { getSeriesLatest, getFredData, SERIES_IDS };
