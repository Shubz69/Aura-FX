/**
 * Normalize Twelve Data equity payloads into stable internal shapes (v1).
 * Avoid persisting full raw blobs when a compact summary suffices.
 */

function baseWrap(datasetKey, source, body) {
  return {
    schemaVersion: 1,
    datasetKey,
    source,
    asOf: new Date().toISOString(),
    body,
  };
}

function pick(d, keys) {
  const o = {};
  for (const k of keys) {
    if (d && d[k] !== undefined) o[k] = d[k];
  }
  return o;
}

function normalizeProfile(data) {
  if (!data || data.status === 'error' || data.code) return null;
  const meta = data.meta || {};
  const body = {
    symbol: meta.symbol || data.symbol,
    name: data.name,
    exchange: meta.exchange || data.exchange,
    mic: meta.mic_code || data.mic_code,
    currency: meta.currency || data.currency,
    sector: data.sector,
    industry: data.industry,
    employees: data.employees,
    description: data.description ? String(data.description).slice(0, 8000) : null,
    address: pick(data, ['address', 'city', 'state', 'zip', 'country']),
    phone: data.phone || null,
    weburl: data.weburl || data.website || null,
  };
  return baseWrap('profile', 'twelvedata', body);
}

function normalizeStatistics(data) {
  if (!data || data.status === 'error' || data.code) return null;
  const stats = data.statistics || data;
  const b = typeof stats === 'object' && stats !== null ? stats : {};
  const body = {
    marketCapitalization: b.market_capitalization ?? b.market_cap ?? null,
    enterpriseValue: b.enterprise_value ?? null,
    peRatio: b.pe_ratio ?? b.pe ?? null,
    pegRatio: b.peg_ratio ?? null,
    eps: b.eps ?? null,
    beta: b.beta ?? null,
    dividendYield: b.dividend_yield ?? null,
    fiftyTwoWeekHigh: b['52_week_high'] ?? b.fifty_two_week_high ?? null,
    fiftyTwoWeekLow: b['52_week_low'] ?? b.fifty_two_week_low ?? null,
    sharesOutstanding: b.shares_outstanding ?? null,
    floatShares: b.float_shares ?? null,
    avgVolume: b.avg_volume ?? b.average_volume ?? null,
    priceToSales: b.price_to_sales ?? null,
    priceToBook: b.price_to_book ?? null,
    quarterlyRevenueGrowth: b.quarterly_revenue_growth ?? null,
    quarterlyEarningsGrowthYoy: b.quarterly_earnings_growth_yoy ?? null,
 };
  return baseWrap('statistics', 'twelvedata', body);
}

function normalizeMarketCap(data) {
  if (!data || data.status === 'error' || data.code) return null;
  const body = { meta: data.meta || null, values: Array.isArray(data.values) ? data.values.slice(-24) : [] };
  return baseWrap('market_cap', 'twelvedata', body);
}

function normalizeLogo(data) {
  if (!data || data.status === 'error' || data.code) return null;
  const url = data.url || data.logo || (data.meta && data.meta.url);
  return baseWrap('logo', 'twelvedata', { url: url || null, meta: data.meta || null });
}

function normalizeStatement(datasetKey, data) {
  if (!data || data.status === 'error' || data.code) return null;
  const prefer = ['income_statement', 'balance_sheet', 'cash_flow'];
  let rows = [];
  for (const k of prefer) {
    if (Array.isArray(data[k])) {
      rows = data[k];
      break;
    }
  }
  if (!rows.length) {
    const key = Object.keys(data).find((k) => /income|balance|cash/i.test(k) && Array.isArray(data[k]));
    rows = key ? data[key] : [];
  }
  return baseWrap(datasetKey, 'twelvedata', {
    currency: data.meta?.currency || data.currency || null,
    fiscalPeriods: (rows || []).slice(0, 12).map((r) => ({
      fiscal_date: r.fiscal_date || r.date || r.period_end_date || null,
      ...pick(r, ['revenue', 'net_income', 'total_assets', 'total_liabilities', 'operating_cash_flow']),
    })),
  });
}

function normalizeDividends(data) {
  if (!data || data.status === 'error' || data.code) return null;
  const divs = data.dividends || data;
  const list = Array.isArray(divs) ? divs : [];
  return baseWrap('dividends', 'twelvedata', {
    payments: list.slice(0, 40).map((r) => pick(r, ['date', 'amount', 'currency'])),
  });
}

function normalizeSplits(data) {
  if (!data || data.status === 'error' || data.code) return null;
  const s = data.splits || data;
  const list = Array.isArray(s) ? s : [];
  return baseWrap('splits', 'twelvedata', {
    events: list.slice(0, 30).map((r) => pick(r, ['date', 'numerator', 'denominator', 'split'])),
  });
}

function normalizeEarnings(data) {
  if (!data || data.status === 'error' || data.code) return null;
  const e = data.earnings || data;
  const list = Array.isArray(e) ? e : [];
  return baseWrap('earnings', 'twelvedata', {
    history: list.slice(0, 16).map((r) =>
      pick(r, ['date', 'period', 'eps_actual', 'eps_estimate', 'surprise', 'surprise_percent'])
    ),
  });
}

function normalizeListBody(datasetKey, data, arrayPathCandidates) {
  if (!data || data.status === 'error' || data.code) return null;
  let arr = null;
  for (const p of arrayPathCandidates) {
    if (Array.isArray(data[p])) {
      arr = data[p];
      break;
    }
  }
  if (!arr) arr = [];
  return baseWrap(datasetKey, 'twelvedata', { meta: data.meta || null, items: arr.slice(0, 100) });
}

function normalizeCalendar(datasetKey, data) {
  if (!data || data.status === 'error' || data.code) return null;
  const keys = Object.keys(data);
  const arrKey = keys.find((k) => Array.isArray(data[k]));
  const arr = arrKey ? data[arrKey] : [];
  return baseWrap(datasetKey, 'twelvedata', { events: arr.slice(0, 200) });
}

function normalizeStocksSample(data) {
  if (!data || data.status === 'error' || data.code) return null;
  const arr = data.data || data.stocks || data.values || [];
  return baseWrap('stocks_reference_sample', 'twelvedata', {
    count: Array.isArray(arr) ? arr.length : 0,
    sample: Array.isArray(arr) ? arr.slice(0, 25) : [],
  });
}

function normalizeGeneric(datasetKey, data) {
  if (!data || data.status === 'error' || data.code) return null;
  return baseWrap(datasetKey, 'twelvedata', { data });
}

/**
 * @param {string} datasetKey
 * @param {object} raw */
function normalizeDatasetPayload(datasetKey, raw) {
  switch (datasetKey) {
    case 'profile':
      return normalizeProfile(raw);
    case 'statistics':
      return normalizeStatistics(raw);
    case 'market_cap':
      return normalizeMarketCap(raw);
    case 'logo':
      return normalizeLogo(raw);
    case 'income_statement_annual':
      return normalizeStatement('income_statement_annual', raw);
    case 'balance_sheet_annual':
      return normalizeStatement('balance_sheet_annual', raw);
    case 'cash_flow_annual':
      return normalizeStatement('cash_flow_annual', raw);
    case 'income_statement_consolidated_annual':
      return normalizeStatement('income_statement_consolidated_annual', raw);
    case 'balance_sheet_consolidated_annual':
      return normalizeStatement('balance_sheet_consolidated_annual', raw);
    case 'cash_flow_consolidated_annual':
      return normalizeStatement('cash_flow_consolidated_annual', raw);
    case 'dividends':
      return normalizeDividends(raw);
    case 'splits':
      return normalizeSplits(raw);
    case 'earnings':
      return normalizeEarnings(raw);
    case 'earnings_calendar_window':
    case 'ipo_calendar_window':
    case 'dividends_calendar_window':
    case 'splits_calendar_window':
      return normalizeCalendar(datasetKey, raw);
    case 'stocks_reference_sample':
      return normalizeStocksSample(raw);
    case 'key_executives':
      return normalizeListBody(datasetKey, raw, ['key_executives', 'executives', 'data']);
    case 'press_releases':
      return normalizeListBody(datasetKey, raw, ['press_releases', 'data']);
    case 'insider_transactions':
      return normalizeListBody(datasetKey, raw, ['insider_transactions', 'transaction', 'data']);
    case 'institutional_holders':
      return normalizeListBody(datasetKey, raw, ['institutional_holders', 'holders', 'data']);
    case 'fund_holders':
      return normalizeListBody(datasetKey, raw, ['fund_holders', 'holders', 'data']);
    case 'analyst_ratings_light':
    case 'analyst_ratings_us_equities':
    case 'recommendations':
    case 'price_target':
    case 'earnings_estimate':
    case 'revenue_estimate':
    case 'eps_trend':
    case 'growth_estimates':
      return normalizeGeneric(datasetKey, raw);
    default:
      return normalizeGeneric(datasetKey, raw);
  }
}

module.exports = {
  normalizeDatasetPayload,
};
