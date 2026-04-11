/**
 * Trust tier by adapter id (0–100 base before corroboration).
 */
function trustBaseFromAdapter(adapterId) {
  const id = (adapterId || '').toLowerCase();
  const tier1 = new Set([
    'federal_reserve_press',
    'ecb_press',
    'us_treasury_press',
    'un_press',
    'boe_news',
    'sec_press',
    'cftc_press',
    'finra_news_releases',
  ]);
  const tier2 = new Set([
    'nato_news',
    'us_state_press',
    'uk_fcdo_news',
    'whitehouse_briefing',
    'eu_council_press',
    'uk_ofsi_news',
    'boj_press',
    'snb_press',
    'rba_media',
    'bank_of_canada_press',
    'us_ustr_press',
    'australia_dfat_news',
    'cme_group_press',
    'wto_news',
    'afdb_news',
    'easa_newsroom',
    'uk_caa_news',
  ]);
  const tier3 = new Set([
    'eia_news',
    'iea_news',
    'faa_newsroom',
    'imo_media',
    'nasdaq_trader_notices',
    'opec_press',
    'us_dhs_news',
    'us_doe_newsroom',
    'canada_transport_news',
  ]);
  if (tier1.has(id)) return 92;
  if (tier2.has(id)) return 86;
  if (tier3.has(id)) return 82;
  return 74;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function computeFreshnessScore(publishedAtIso, detectedAtIso, nowMs = Date.now()) {
  const t = publishedAtIso ? new Date(publishedAtIso).getTime() : new Date(detectedAtIso || Date.now()).getTime();
  if (Number.isNaN(t)) return 40;
  const ageH = (nowMs - t) / 3600000;
  if (ageH <= 2) return 100;
  if (ageH <= 12) return 88;
  if (ageH <= 24) return 75;
  if (ageH <= 72) return 55;
  if (ageH <= 168) return 38;
  return 22;
}

function severityToScore(severity1to5) {
  const s = Number(severity1to5) || 1;
  return Math.round(clamp01((s - 1) / 4) * 100);
}

function aggregateMarketImpactScore(impactedMarkets) {
  if (!impactedMarkets || !impactedMarkets.length) return 15;
  let sum = 0;
  for (const m of impactedMarkets) {
    sum += Math.min(100, Number(m.score) || 0);
  }
  return Math.min(100, Math.round(sum / Math.max(1, impactedMarkets.length / 2)));
}

function noveltyFromSimilarCount(countPast7d) {
  const c = Math.min(50, Number(countPast7d) || 0);
  return Math.max(15, Math.round(100 - c * 12));
}

function computeTrustScore(baseTrust, confidence01, corroborationCount) {
  const conf = Math.min(1, Math.max(0.3, Number(confidence01) || 0.5));
  let t = baseTrust * conf;
  if (corroborationCount > 0) t = Math.min(100, t + 8 * Math.min(corroborationCount, 4));
  return Math.round(Math.min(100, t));
}

/**
 * Final ordering score for tape / globe.
 * corroboration_count / distinct_source_count / repetition_penalty sharpen editorial ordering.
 */
function computeRankScore({
  trust_score,
  novelty_score,
  freshness_score,
  severity_score,
  market_impact_score,
  corroboration_count = 0,
  distinct_source_count = 1,
  repetition_penalty = 0,
  disruption_boost = 0,
}) {
  const cc = Math.min(8, Number(corroboration_count) || 0);
  const ds = Math.max(1, Number(distinct_source_count) || 1);
  const corrBoost = Math.min(30, cc * 6.5 + (ds - 1) * 5.5);
  const rep = Math.min(40, Number(repetition_penalty) || 0);
  const db = Math.min(8, Number(disruption_boost) || 0);
  const base =
    0.19 * (trust_score || 50) +
    0.11 * (novelty_score || 50) +
    0.17 * (freshness_score || 50) +
    0.17 * (severity_score || 50) +
    0.21 * (market_impact_score || 50) +
    0.15 * corrBoost +
    0.12 * db;
  return Math.round(Math.min(100, Math.max(0, base - rep * 0.38)));
}

/** Bounded rank bump for operational disruption headlines (aviation / maritime / logistics). */
function disruptionBoostFromRecord(ev) {
  const text = [ev?.title, ev?.summary, ev?.body_snippet].filter(Boolean).join(' \n ').toLowerCase();
  let b = 0;
  const et = String(ev?.event_type || '').toLowerCase();
  if (et === 'aviation' && /\b(airspace|closure|notam|ground stop|diversion|flight ban|grounding)\b/.test(text)) b += 5;
  if (et === 'maritime' && /\b(strait|canal|chokepoint|blockade|closure|convoy)\b/.test(text)) b += 5;
  if (et === 'logistics' && /\b(port congestion|canal|strike|shutdown|freight|backlog)\b/.test(text)) b += 4;
  return Math.min(8, b);
}

module.exports = {
  trustBaseFromAdapter,
  computeFreshnessScore,
  severityToScore,
  aggregateMarketImpactScore,
  noveltyFromSimilarCount,
  computeTrustScore,
  computeRankScore,
  disruptionBoostFromRecord,
};
