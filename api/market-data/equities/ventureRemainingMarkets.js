/**
 * Venture / multi-regional equity exchanges — single shared config (no per-exchange source files).
 *
 * Guardrails:
 * - Exchange-qualified canonicals only (suffix disambiguates e.g. SAP.DE vs US listings).
 * - Twelve Data is primary for quote/EOD/time_series via marketDataLayer; prices.js avoids Yahoo/Polygon-first
 *   fallbacks when TD is configured (see api/market/prices.js).
 * - `supportLevel: 'limited'` = reference + core symbol datasets only; no synthetic fundamentals/analysis.
 * - `refreshTier: 'priority' | 'standard'` = longer TTL / lighter refresh for standard (smaller) venues.
 *
 * Disable entirely: VENTURE_REGIONAL_MARKETS=0
 */

const DAY = 86400000;

/** @typedef {'limited'} VentureSupportLevel — only honest label for this rollout (reference + core). */
/** @typedef {'priority'|'standard'} VentureRefreshTier */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   suffix: string,
 *   twelveDataExchange: string,
 *   scheduleMic: string,
 *   country: string,
 *   supportLevel: VentureSupportLevel,
 *   refreshTier: VentureRefreshTier,
 *   ingestOrder: number,
 *   envSymbolsKey: string,
 *   symbolSearchSeedEnvKey: string,
 *   symbolSearchSeedDefault: string,
 *   referenceOutputSizeEnvKey: string,
 *   referenceOutputSizeDefault: number,
 *   notes?: string,
 * }} VentureMarketDef
 */

/** Curated exchanges not covered by US / UK / ASX / Cboe UK / Cboe AU passes. TD codes are overridable per deploy. */
const VENTURE_MARKET_DEFINITIONS = [
  {
    id: 'venture_xetra',
    label: 'Germany (Xetra)',
    suffix: '.DE',
    twelveDataExchange: 'XETRA',
    scheduleMic: 'XETR',
    country: 'Germany',
    supportLevel: 'limited',
    refreshTier: 'priority',
    ingestOrder: 1,
    envSymbolsKey: 'VENTURE_XETRA_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_XETRA_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: 'SAP',
    referenceOutputSizeEnvKey: 'TD_VENTURE_XETRA_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 600,
  },
  {
    id: 'venture_tsx',
    label: 'Canada (TSX)',
    suffix: '.TO',
    twelveDataExchange: 'TSX',
    scheduleMic: 'XTSE',
    country: 'Canada',
    supportLevel: 'limited',
    refreshTier: 'priority',
    ingestOrder: 2,
    envSymbolsKey: 'VENTURE_TSX_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_TSX_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: 'SHOP',
    referenceOutputSizeEnvKey: 'TD_VENTURE_TSX_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 600,
  },
  {
    id: 'venture_tsxv',
    label: 'Canada (TSX Venture)',
    suffix: '.V',
    twelveDataExchange: 'TSXV',
    scheduleMic: 'XTSX',
    country: 'Canada',
    supportLevel: 'limited',
    refreshTier: 'standard',
    ingestOrder: 6,
    envSymbolsKey: 'VENTURE_TSXV_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_TSXV_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: 'WELL',
    referenceOutputSizeEnvKey: 'TD_VENTURE_TSXV_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 400,
  },
  {
    id: 'venture_swiss',
    label: 'Switzerland (SIX)',
    suffix: '.SW',
    twelveDataExchange: 'SIX',
    scheduleMic: 'XSWX',
    country: 'Switzerland',
    supportLevel: 'limited',
    refreshTier: 'priority',
    ingestOrder: 5,
    envSymbolsKey: 'VENTURE_SWISS_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_SWISS_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: 'NESN',
    referenceOutputSizeEnvKey: 'TD_VENTURE_SWISS_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 500,
  },
  {
    id: 'venture_milan',
    label: 'Italy (Borsa Italiana)',
    suffix: '.MI',
    twelveDataExchange: 'MIL',
    scheduleMic: 'XMIL',
    country: 'Italy',
    supportLevel: 'limited',
    refreshTier: 'standard',
    ingestOrder: 7,
    envSymbolsKey: 'VENTURE_MILAN_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_MILAN_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: 'ENI',
    referenceOutputSizeEnvKey: 'TD_VENTURE_MILAN_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 500,
  },
  {
    id: 'venture_paris',
    label: 'France (Euronext Paris)',
    suffix: '.PA',
    twelveDataExchange: 'EURONEXT',
    scheduleMic: 'XPAR',
    country: 'France',
    supportLevel: 'limited',
    refreshTier: 'standard',
    ingestOrder: 8,
    envSymbolsKey: 'VENTURE_PARIS_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_PARIS_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: 'MC',
    referenceOutputSizeEnvKey: 'TD_VENTURE_PARIS_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 500,
    notes: 'Twelve Data /stocks exchange code may require plan-specific adjustment; override twelveDataExchange via env VENTURE_PARIS_TD_EXCHANGE if needed.',
  },
  {
    id: 'venture_amsterdam',
    label: 'Netherlands (Euronext Amsterdam)',
    suffix: '.AS',
    twelveDataExchange: 'EURONEXT',
    scheduleMic: 'XAMS',
    country: 'Netherlands',
    supportLevel: 'limited',
    refreshTier: 'standard',
    ingestOrder: 9,
    envSymbolsKey: 'VENTURE_AMSTERDAM_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_AMSTERDAM_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: 'ASML',
    referenceOutputSizeEnvKey: 'TD_VENTURE_AMSTERDAM_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 400,
    notes: 'Shares EURONEXT listing table with Paris; verify ticker suffix .AS vs TD metadata on your plan.',
  },
  {
    id: 'venture_tokyo',
    label: 'Japan (TSE)',
    suffix: '.T',
    twelveDataExchange: 'TSE',
    scheduleMic: 'XJPX',
    country: 'Japan',
    supportLevel: 'limited',
    refreshTier: 'priority',
    ingestOrder: 3,
    envSymbolsKey: 'VENTURE_TOKYO_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_TOKYO_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: '7203',
    referenceOutputSizeEnvKey: 'TD_VENTURE_TOKYO_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 600,
  },
  {
    id: 'venture_hongkong',
    label: 'Hong Kong (HKEX)',
    suffix: '.HK',
    twelveDataExchange: 'HKEX',
    scheduleMic: 'XHKG',
    country: 'Hong Kong',
    supportLevel: 'limited',
    refreshTier: 'priority',
    ingestOrder: 4,
    envSymbolsKey: 'VENTURE_HONGKONG_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_HONGKONG_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: '9988',
    referenceOutputSizeEnvKey: 'TD_VENTURE_HONGKONG_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 600,
  },
  {
    id: 'venture_stockholm',
    label: 'Sweden (Nasdaq Stockholm)',
    suffix: '.ST',
    twelveDataExchange: 'STO',
    scheduleMic: 'XSTO',
    country: 'Sweden',
    supportLevel: 'limited',
    refreshTier: 'standard',
    ingestOrder: 10,
    envSymbolsKey: 'VENTURE_STOCKHOLM_SYMBOLS',
    symbolSearchSeedEnvKey: 'VENTURE_STOCKHOLM_SYMBOL_SEARCH_SEED',
    symbolSearchSeedDefault: 'ERIC-B',
    referenceOutputSizeEnvKey: 'TD_VENTURE_STOCKHOLM_REFERENCE_OUTPUTSIZE',
    referenceOutputSizeDefault: 400,
    notes: 'If TD uses a different exchange slug than STO, set VENTURE_STOCKHOLM_TD_EXCHANGE.',
  },
];

function ventureMarketsGloballyEnabled() {
  const v = String(process.env.VENTURE_REGIONAL_MARKETS || '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
}

function tdExchangeOverride(def) {
  const short = def.id.replace(/^venture_/, '').toUpperCase();
  return String(process.env[`VENTURE_${short}_TD_EXCHANGE`] || '').trim() || def.twelveDataExchange;
}

/** @returns {VentureMarketDef[]} */
function getVentureMarketDefinitions() {
  if (!ventureMarketsGloballyEnabled()) return [];
  return VENTURE_MARKET_DEFINITIONS.map((d) => ({
    ...d,
    refreshTier: d.refreshTier || 'standard',
    ingestOrder: d.ingestOrder ?? 50,
    twelveDataExchange: tdExchangeOverride(d),
  }));
}

function escapeRe(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} canonical */
function resolveVentureMarketDef(canonical) {
  const c = String(canonical || '').toUpperCase().trim();
  const defs = getVentureMarketDefinitions();
  const sorted = [...defs].sort((a, b) => b.suffix.length - a.suffix.length);
  for (const d of sorted) {
    const suf = d.suffix.toUpperCase();
    if (suf && c.endsWith(suf)) return d;
  }
  return null;
}

/** @param {string} canonical */
function resolveVentureCategoryId(canonical) {
  const d = resolveVentureMarketDef(canonical);
  return d ? d.id : null;
}

/** @param {string} canonical */
function isVentureRegionalEquity(canonical) {
  return resolveVentureMarketDef(canonical) != null;
}

function listVentureCategoryIds() {
  return [...getVentureMarketDefinitions()]
    .sort((a, b) => (a.ingestOrder || 99) - (b.ingestOrder || 99))
    .map((d) => d.id);
}

/**
 * Raw dataset map (before registry enrichEquityDatasets).
 * @param {VentureMarketDef} def
 */
function buildVentureDatasetsRaw(def) {
  const refTtlMult =
    def.refreshTier === 'standard'
      ? Math.min(2, Math.max(1, parseFloat(process.env.TD_VENTURE_STANDARD_REFRESH_TTL_MULT || '1.5') || 1.5))
      : 1;
  const refOut = Math.max(
    60,
    Math.min(
      4000,
      parseInt(process.env[def.referenceOutputSizeEnvKey] || String(def.referenceOutputSizeDefault), 10) ||
        def.referenceOutputSizeDefault
    )
  );
  const ex = () => def.twelveDataExchange;
  const mic = () => def.scheduleMic;

  const symbolCore = {
    market_state: {
      ttlMs: 2 * 3600000,
      ingestTier: 1,
      scope: 'symbol',
      clientMethod: 'fetchMarketState',
      description: `Session state (${def.label})`,
    },
    eod_latest: {
      ttlMs: 6 * 3600000,
      ingestTier: 1,
      scope: 'symbol',
      clientMethod: 'fetchEod',
      buildArgs: (sym) => [sym, new Date().toISOString().slice(0, 10)],
      description: 'EOD (current UTC calendar date)',
    },
  };

  const seedQ = () =>
    String(process.env[def.symbolSearchSeedEnvKey] || def.symbolSearchSeedDefault || 'A').trim() || 'A';
  const searchOs = Math.min(
    80,
    Math.max(10, parseInt(process.env.TD_VENTURE_SYMBOL_SEARCH_OUTPUTSIZE || '35', 10) || 35)
  );

  const reference = {
    [`${def.id}_stocks_universe`]: {
      ttlMs: Math.round(1 * DAY * refTtlMult),
      ingestTier: 2,
      scope: 'global',
      clientMethod: 'fetchStocks',
      buildArgs: () => [{ exchange: ex(), outputsize: refOut }],
      description: `Listings via /stocks (${def.twelveDataExchange})`,
    },
    [`${def.id}_exchange_schedule`]: {
      ttlMs: Math.round(6 * 3600000 * refTtlMult),
      ingestTier: 2,
      scope: 'global',
      clientMethod: 'fetchExchangeSchedule',
      buildArgs: () => {
        const today = new Date().toISOString().slice(0, 10);
        return [{ exchange: mic(), start_date: today, end_date: today }];
      },
      description: 'Hours via /exchange_schedule',
    },
    [`${def.id}_market_movers`]: {
      ttlMs: Math.round(2 * 3600000 * refTtlMult),
      ingestTier: 3,
      scope: 'global',
      clientMethod: 'fetchMarketMovers',
      buildArgs: () => [{ exchange: ex(), direction: 'up', outputsize: 25 }],
      description: 'Market movers via /market_movers',
    },
    [`${def.id}_symbol_search_seed`]: {
      ttlMs: Math.round(1 * DAY * refTtlMult),
      ingestTier: 3,
      scope: 'global',
      clientMethod: 'fetchSymbolSearch',
      buildArgs: () => [seedQ(), { outputsize: searchOs }],
      description: `symbol_search seed (${def.symbolSearchSeedEnvKey})`,
    },
  };

  return { ...symbolCore, ...reference };
}

/**
 * @param {(source: Record<string, object>) => Record<string, object>} enrichEquityDatasets
 */
function buildVentureRegistryCategories(enrichEquityDatasets) {
  const out = {};
  for (const def of getVentureMarketDefinitions()) {
    const datasets = enrichEquityDatasets(buildVentureDatasetsRaw(def));
    out[def.id] = {
      id: def.id,
      label: def.label,
      storageCategory: def.id,
      readiness: 'ready',
      symbolSource: 'ventureEnvSymbols',
      ventureEnvSymbols: def.envSymbolsKey,
      ventureExchangeMeta: {
        tdExchange: def.twelveDataExchange,
        mic: def.scheduleMic,
        country: def.country,
        supportLevel: def.supportLevel,
        refreshTier: def.refreshTier,
        suffix: def.suffix,
        notes: def.notes || null,
      },
      supportsSymbol: (c) => resolveVentureMarketDef(c)?.id === def.id,
      datasets,
      capabilities: {
        reference: true,
        core: true,
        timeSeries: true,
        fundamentals: false,
        analysis: false,
        regulatory: false,
        mutualFunds: false,
        integrationLevel: 'limited',
      },
      notes:
        (def.notes ? `${def.notes} ` : '') +
        `limited (reference+core only; exchange-suffixed canonicals). TD primary in marketDataLayer/prices when configured. Set ${def.envSymbolsKey}. refreshTier=${def.refreshTier}.`,
    };
  }
  return out;
}

function summarizeVentureMarketsForHealth() {
  return getVentureMarketDefinitions().map((d) => ({
    id: d.id,
    label: d.label,
    supportLevel: d.supportLevel,
    refreshTier: d.refreshTier,
    ingestOrder: d.ingestOrder,
    suffix: d.suffix,
    twelveDataExchange: d.twelveDataExchange,
    scheduleMic: d.scheduleMic,
    envSymbolsKey: d.envSymbolsKey,
  }));
}

module.exports = {
  VENTURE_MARKET_DEFINITIONS,
  getVentureMarketDefinitions,
  resolveVentureMarketDef,
  resolveVentureCategoryId,
  isVentureRegionalEquity,
  listVentureCategoryIds,
  buildVentureDatasetsRaw,
  buildVentureRegistryCategories,
  summarizeVentureMarketsForHealth,
  ventureMarketsGloballyEnabled,
  escapeRe,
};
