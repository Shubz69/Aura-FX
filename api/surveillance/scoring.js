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

/**
 * Freshness as a continuous 22–100 signal (hours + minutes), used inside rank_score.
 * Piecewise-linear between the old bucket anchors so similar-age rows still spread slightly.
 */
function computeFreshnessDetail(publishedAtIso, detectedAtIso, nowMs = Date.now()) {
  const t = publishedAtIso ? new Date(publishedAtIso).getTime() : new Date(detectedAtIso || Date.now()).getTime();
  if (Number.isNaN(t)) return 40;
  const ageMs = Math.max(0, nowMs - t);
  const ageH = ageMs / 3600000;
  const ageMin = ageMs / 60000;

  if (ageH <= 2) {
    /* Within the old “≤2h = 100” bucket, taper gently by minutes so simultaneous items differ. */
    return Math.max(96, 100 - ageMin * 0.012);
  }
  if (ageH <= 12) {
    return 100 - (ageH - 2) * 1.2;
  }
  if (ageH <= 24) {
    return 88 - ((ageH - 12) * 13) / 12;
  }
  if (ageH <= 72) {
    return 75 - ((ageH - 24) * 20) / 48;
  }
  if (ageH <= 168) {
    return 55 - ((ageH - 72) * 17) / 96;
  }
  return 22;
}

/** Stored freshness (0–100 integer) — rounded detail for UI / columns. */
function computeFreshnessScore(publishedAtIso, detectedAtIso, nowMs = Date.now()) {
  return Math.round(Math.min(100, Math.max(22, computeFreshnessDetail(publishedAtIso, detectedAtIso, nowMs))));
}

function severityToScore(severity1to5) {
  const s = Number(severity1to5) || 1;
  return Math.round(clamp01((s - 1) / 4) * 100);
}

/** Continuous 0–100 severity contribution for rank blending (avoids ties on discrete tiers). */
function severityDetailScore(severity1to5) {
  const s = Number(severity1to5) || 1;
  return clamp01((s - 1) / 4) * 100;
}

function aggregateMarketImpactScore(impactedMarkets) {
  if (!impactedMarkets || !impactedMarkets.length) return 15;
  let sum = 0;
  for (const m of impactedMarkets) {
    sum += Math.min(100, Number(m.score) || 0);
  }
  const denom = Math.max(1, impactedMarkets.length / 2);
  return Math.min(100, sum / denom);
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

/** Stable −0.5…0.5 tie-break from content hash so comparable rows rarely share the same integer rank. */
function tieBreakFromContentHash(hashHex) {
  if (!hashHex || typeof hashHex !== 'string' || hashHex.length < 8) return 0;
  const hex = hashHex.replace(/[^0-9a-f]/gi, '');
  if (hex.length < 8) return 0;
  const n = parseInt(hex.slice(0, 12), 16);
  if (!Number.isFinite(n)) return 0;
  return (n % 8191) / 8190 - 0.5;
}

/**
 * Final ordering score for tape / globe.
 * corroboration_count / distinct_source_count / repetition_penalty sharpen editorial ordering.
 * Pass floats for freshness / severity / market impact where available; optional content hash breaks ties deterministically.
 */
function computeRankScore(
  {
    trust_score,
    novelty_score,
    freshness_score,
    severity_score,
    market_impact_score,
    corroboration_count = 0,
    distinct_source_count = 1,
    repetition_penalty = 0,
    disruption_boost = 0,
  },
  contentHashHex
) {
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
  const tie = tieBreakFromContentHash(contentHashHex || '') * 2.6;
  return Math.round(Math.min(100, Math.max(0, base - rep * 0.38 + tie)));
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
  computeFreshnessDetail,
  severityToScore,
  severityDetailScore,
  aggregateMarketImpactScore,
  noveltyFromSimilarCount,
  computeTrustScore,
  computeRankScore,
  tieBreakFromContentHash,
  disruptionBoostFromRecord,
};
