/**
 * Adapter grouping for health, diagnostics, and coverage honesty.
 * family: intelligence category; region: coarse geography for globe balance signals.
 */

const ADAPTER_FAMILY = {
  federal_reserve_press: 'central_bank',
  ecb_press: 'central_bank',
  boe_news: 'central_bank',
  boj_press: 'central_bank',
  snb_press: 'central_bank',
  rba_media: 'central_bank',
  bank_of_canada_press: 'central_bank',
  us_treasury_press: 'treasury_finance',
  uk_ofsi_news: 'sanctions',
  eu_council_press: 'multilateral_security',
  un_press: 'multilateral_security',
  nato_news: 'multilateral_security',
  us_state_press: 'foreign_policy',
  uk_fcdo_news: 'foreign_policy',
  whitehouse_briefing: 'executive',
  eia_news: 'energy',
  iea_news: 'energy',
  faa_newsroom: 'aviation',
  easa_newsroom: 'aviation',
  uk_caa_news: 'aviation',
  imo_media: 'maritime',
  sec_press: 'regulatory',
  cftc_press: 'regulatory',
  nasdaq_trader_notices: 'market_infrastructure',
  cme_group_press: 'market_infrastructure',
  opec_press: 'energy',
  us_dhs_news: 'security_homeland',
  us_ustr_press: 'trade_policy',
  us_doe_newsroom: 'energy',
  finra_news_releases: 'regulatory',
  australia_dfat_news: 'foreign_policy',
  afdb_news: 'development_multilateral',
  wto_news: 'trade_policy',
  canada_transport_news: 'logistics_transport',
  opensky_live: 'aviation',
  datalastic_ais_live: 'maritime',
  dvids_news_rss: 'defense_press',
  uk_mod_rss: 'defense_press',
  gcaptain_rss: 'maritime',
};

/** Coarse region for coverage diagnostics (not a legal jurisdiction). */
const ADAPTER_REGION = {
  federal_reserve_press: 'na',
  us_treasury_press: 'na',
  us_state_press: 'na',
  whitehouse_briefing: 'na',
  us_dhs_news: 'na',
  us_ustr_press: 'na',
  us_doe_newsroom: 'na',
  sec_press: 'na',
  cftc_press: 'na',
  finra_news_releases: 'na',
  faa_newsroom: 'na',
  eia_news: 'na',
  nasdaq_trader_notices: 'na',
  cme_group_press: 'na',
  canada_transport_news: 'na',
  bank_of_canada_press: 'na',
  ecb_press: 'eu',
  boe_news: 'eu',
  eu_council_press: 'eu',
  uk_fcdo_news: 'eu',
  uk_ofsi_news: 'eu',
  snb_press: 'eu',
  easa_newsroom: 'eu',
  uk_caa_news: 'eu',
  imo_media: 'global',
  un_press: 'global',
  nato_news: 'global',
  iea_news: 'global',
  opec_press: 'mea',
  australia_dfat_news: 'apac',
  boj_press: 'apac',
  rba_media: 'apac',
  wto_news: 'global',
  afdb_news: 'ssa',
  dvids_news_rss: 'na',
  uk_mod_rss: 'eu',
  gcaptain_rss: 'global',
  opensky_live: 'global',
  datalastic_ais_live: 'global',
};

const REGIONS = ['na', 'sa', 'eu', 'mea', 'ssa', 'apac', 'global'];

function adapterFamily(adapterId) {
  return ADAPTER_FAMILY[adapterId] || 'other';
}

function adapterRegion(adapterId) {
  return ADAPTER_REGION[adapterId] || 'global';
}

/**
 * Pure: aggregate adapter states by region (fresh vs weak).
 * @param {Array<{adapter_id:string,last_success_at?:Date|string|null,consecutive_failures?:number}>} states
 */
function regionAdapterRollup(states) {
  const out = {};
  for (const r of REGIONS) {
    out[r] = { total: 0, fresh: 0, staleOrNever: 0, weakAdapter: 0 };
  }
  for (const row of states || []) {
    const id = row.adapter_id;
    const reg = adapterRegion(id);
    if (!out[reg]) continue;
    const b = bucketAdapterRecencyForIso(row.last_success_at);
    out[reg].total += 1;
    if (b === 'fresh') out[reg].fresh += 1;
    if (b === 'stale' || b === 'never') out[reg].staleOrNever += 1;
    if ((row.consecutive_failures || 0) >= 2 || b === 'stale' || b === 'never') out[reg].weakAdapter += 1;
  }
  return out;
}

function bucketAdapterRecencyForIso(lastSuccessAt) {
  if (!lastSuccessAt) return 'never';
  const t = new Date(lastSuccessAt).getTime();
  if (Number.isNaN(t)) return 'never';
  const h = (Date.now() - t) / 3600000;
  if (h < 1) return 'fresh';
  if (h < 6) return 'warm';
  if (h < 24) return 'cold';
  return 'stale';
}

/**
 * Pure: merge 24h event counts by source into family + region mix.
 * @param {Record<string, number>} countsBySource
 * @param {number} totalEvents optional denominator
 */
function feedMixFromSourceCounts(countsBySource, totalEvents = 0) {
  const byFamily = {};
  const byRegion = {};
  let total = 0;
  for (const [source, c] of Object.entries(countsBySource || {})) {
    const n = Number(c) || 0;
    if (n <= 0) continue;
    total += n;
    const fam = adapterFamily(source);
    const reg = adapterRegion(source);
    byFamily[fam] = (byFamily[fam] || 0) + n;
    byRegion[reg] = (byRegion[reg] || 0) + n;
  }
  const denom = totalEvents > 0 ? totalEvents : Math.max(1, total);
  const pct = (n) => Math.round((n / denom) * 1000) / 10;
  return {
    totalEventsInWindow: total,
    byFamily: Object.fromEntries(Object.entries(byFamily).map(([k, v]) => [k, { count: v, pctOfWindow: pct(v) }])),
    byRegion: Object.fromEntries(Object.entries(byRegion).map(([k, v]) => [k, { count: v, pctOfWindow: pct(v) }])),
  };
}

/**
 * Pure: list regions that look under-covered (heuristic — not a promise of world visibility).
 * Thresholds: few fresh adapters AND low share of recent feed OR zero adapters in region.
 */
function underCoveredRegions(rollup, feedMixByRegion, opts = {}) {
  const minAdapters = opts.minAdapters ?? 1;
  const freshRatioWarn = opts.freshRatioWarn ?? 0.15;
  const feedPctWarn = opts.feedPctWarn ?? 3;
  const gaps = [];
  for (const reg of REGIONS) {
    const r = rollup[reg] || { total: 0, fresh: 0 };
    const fm = feedMixByRegion?.[reg];
    const pct = fm?.pctOfWindow ?? 0;
    const freshRatio = r.total ? r.fresh / r.total : 0;
    if (r.total < minAdapters && reg !== 'global') {
      gaps.push({ region: reg, reason: 'few_registered_adapters', adapterTotal: r.total, feedPct: pct });
      continue;
    }
    if (r.total >= minAdapters && freshRatio < freshRatioWarn && pct < feedPctWarn) {
      gaps.push({ region: reg, reason: 'stale_adapters_or_low_feed_share', freshRatio: Math.round(freshRatio * 100), feedPct: pct });
    }
  }
  return gaps;
}

/**
 * Pure: aviation + maritime adapter health from state rows (by family tag).
 */
function aviationMaritimeHealthSummary(states) {
  const avIds = new Set(Object.keys(ADAPTER_FAMILY).filter((id) => ADAPTER_FAMILY[id] === 'aviation'));
  const marLogIds = new Set(
    Object.keys(ADAPTER_FAMILY).filter(
      (id) => ADAPTER_FAMILY[id] === 'maritime' || ADAPTER_FAMILY[id] === 'logistics_transport'
    )
  );
  let avTotal = 0,
    avFresh = 0,
    avStale = 0;
  let marTotal = 0,
    marFresh = 0,
    marStale = 0;
  for (const row of states || []) {
    const id = row.adapter_id;
    const b = bucketAdapterRecencyForIso(row.last_success_at);
    if (avIds.has(id)) {
      avTotal += 1;
      if (b === 'fresh' || b === 'warm') avFresh += 1;
      if (b === 'stale' || b === 'never') avStale += 1;
    }
    if (marLogIds.has(id)) {
      marTotal += 1;
      if (b === 'fresh' || b === 'warm') marFresh += 1;
      if (b === 'stale' || b === 'never') marStale += 1;
    }
  }
  return {
    aviation: {
      adapterCount: avTotal,
      freshOrWarm: avFresh,
      staleOrNever: avStale,
      note: 'Includes regulator/FAA-style releases plus OpenSky ADS-B positions (research feed; not all aircraft worldwide).',
    },
    maritimeLogistics: {
      adapterCount: marTotal,
      freshOrWarm: marFresh,
      staleOrNever: marStale,
      note: 'IMO/gCaptain maritime trade press plus institutional notices; ship AIS tracks require a dedicated AIS provider.',
    },
  };
}

function familyUnderperformance(states) {
  const byFam = new Map();
  for (const r of states) {
    const fam = adapterFamily(r.adapter_id);
    if (!byFam.has(fam)) byFam.set(fam, { total: 0, weak: 0 });
    const x = byFam.get(fam);
    x.total += 1;
    const b = bucketAdapterRecencyForIso(r.last_success_at);
    if (b === 'stale' || b === 'never' || (r.consecutive_failures || 0) >= 2) x.weak += 1;
  }
  const out = [];
  for (const [family, { total, weak }] of byFam) {
    if (!total) continue;
    const ratio = weak / total;
    if (ratio >= 0.35) out.push({ family, weakCount: weak, totalAdapters: total, weakRatioPct: Math.round(ratio * 100) });
  }
  return out.sort((a, b) => b.weakRatioPct - a.weakRatioPct);
}

module.exports = {
  adapterFamily,
  adapterRegion,
  ADAPTER_FAMILY,
  ADAPTER_REGION,
  REGIONS,
  regionAdapterRollup,
  feedMixFromSourceCounts,
  underCoveredRegions,
  aviationMaritimeHealthSummary,
  familyUnderperformance,
  bucketAdapterRecencyForIso,
};
