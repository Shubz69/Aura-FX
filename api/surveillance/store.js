const { executeQuery } = require('../db');
const { scoreMarkets, buildWhyMatters, inferRiskBias, eventText } = require('./marketImpact');
const { classifyRecord } = require('./classify');
const { buildDedupeKeys, contentHash } = require('./dedupe');
const { normalizeTopic } = require('./topic');
const { storySignatureFromPayload } = require('./storyline');
const {
  trustBaseFromAdapter,
  computeFreshnessScore,
  severityToScore,
  aggregateMarketImpactScore,
  noveltyFromSimilarCount,
  computeTrustScore,
  computeRankScore,
  disruptionBoostFromRecord,
} = require('./scoring');

function rowToEvent(r) {
  if (!r) return null;
  const parseJson = (v) => {
    if (v == null) return [];
    if (typeof v === 'object') return v;
    try {
      return JSON.parse(v);
    } catch {
      return [];
    }
  };
  return {
    id: String(r.id),
    source: r.source,
    source_type: r.source_type,
    title: r.title,
    summary: r.summary,
    body_snippet: r.body_snippet,
    url: r.url,
    published_at: r.published_at ? new Date(r.published_at).toISOString() : null,
    detected_at: r.detected_at ? new Date(r.detected_at).toISOString() : null,
    event_type: r.event_type,
    severity: Number(r.severity),
    confidence: Number(r.confidence),
    countries: parseJson(r.countries),
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    region: r.region,
    tags: parseJson(r.tags),
    affected_assets: parseJson(r.affected_assets),
    impacted_markets: parseJson(r.impacted_markets),
    sentiment: r.sentiment,
    verification_state: r.verification_state,
    image_url: r.image_url,
    dedupe_keys: parseJson(r.dedupe_keys),
    updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null,
    trust_score: r.trust_score != null ? Number(r.trust_score) : null,
    novelty_score: r.novelty_score != null ? Number(r.novelty_score) : null,
    severity_score: r.severity_score != null ? Number(r.severity_score) : null,
    market_impact_score: r.market_impact_score != null ? Number(r.market_impact_score) : null,
    freshness_score: r.freshness_score != null ? Number(r.freshness_score) : null,
    rank_score: r.rank_score != null ? Number(r.rank_score) : null,
    story_id: r.story_id || null,
    corroboration_count: r.corroboration_count != null ? Number(r.corroboration_count) : 0,
    risk_bias: r.risk_bias || 'neutral',
    why_matters: r.why_matters || null,
    normalized_topic: r.normalized_topic || null,
    story_signature: r.story_signature || null,
  };
}

async function countSimilarTopics(normalizedTopic, excludeContentHash) {
  if (!normalizedTopic) return 0;
  const [rows] = await executeQuery(
    `SELECT COUNT(*) AS c FROM surveillance_events
     WHERE normalized_topic = ?
       AND content_hash <> ?
       AND detected_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)`,
    [normalizedTopic, excludeContentHash || '']
  );
  return Number(rows?.[0]?.c) || 0;
}

async function countRecentTopicRepetition(source, normalizedTopic, excludeContentHash) {
  if (!normalizedTopic || !source) return 0;
  const [rows] = await executeQuery(
    `SELECT COUNT(*) AS c FROM surveillance_events
     WHERE source = ? AND normalized_topic = ? AND content_hash <> ?
       AND detected_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 48 HOUR)`,
    [source, normalizedTopic, excludeContentHash || '']
  );
  return Number(rows?.[0]?.c) || 0;
}

async function countRecentStorySignatureRepetition(source, storySignature, excludeContentHash) {
  if (!storySignature || !source) return 0;
  const [rows] = await executeQuery(
    `SELECT COUNT(*) AS c FROM surveillance_events
     WHERE source = ? AND story_signature = ? AND content_hash <> ?
       AND detected_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 48 HOUR)`,
    [source, storySignature, excludeContentHash || '']
  );
  return Number(rows?.[0]?.c) || 0;
}

async function upsertRawEvent(base) {
  const classified = classifyRecord({
    title: base.title,
    summary: base.summary,
    body_snippet: base.body_snippet,
  });
  const merged = {
    ...base,
    event_type: base.event_type || classified.event_type,
    severity: Math.max(base.severity || 0, classified.severity) || classified.severity,
    countries: base.countries?.length ? base.countries : classified.countries,
    lat: base.lat != null ? base.lat : classified.lat,
    lng: base.lng != null ? base.lng : classified.lng,
    region: base.region || classified.region,
    sentiment: base.sentiment || classified.sentiment,
  };
  const mk = scoreMarkets({
    title: merged.title,
    summary: merged.summary,
    body_snippet: merged.body_snippet,
    tags: merged.tags || [],
    countries: merged.countries || [],
  });
  merged.impacted_markets = mk;

  const nt = normalizeTopic(merged.title, merged.countries);
  const keys = buildDedupeKeys({
    url: merged.url,
    title: merged.title,
    publishedAt: merged.published_at,
  });
  const ch = contentHash(keys);

  const sim = await countSimilarTopics(nt, ch);
  let novelty = noveltyFromSimilarCount(sim);
  const repCount = await countRecentTopicRepetition(merged.source, nt, ch);
  const storySig = storySignatureFromPayload({
    title: merged.title,
    countries: merged.countries,
    event_type: merged.event_type,
  });
  const repStory = await countRecentStorySignatureRepetition(merged.source, storySig, ch);
  const repetitionPenalty = Math.min(38, repCount * 5 + repStory * 4);
  if (repCount > 2 || repStory > 2) {
    const drain = Math.min(28, (Math.max(0, repCount - 2) + Math.max(0, repStory - 1)) * 4);
    novelty = Math.max(15, Math.round(novelty - drain));
  }
  const publishedIso = merged.published_at
    ? typeof merged.published_at === 'string'
      ? merged.published_at
      : new Date(merged.published_at).toISOString()
    : null;
  const detectedIso = new Date().toISOString();
  const freshness = computeFreshnessScore(publishedIso, detectedIso);
  const sevSc = severityToScore(merged.severity);
  const mktSc = aggregateMarketImpactScore(mk);
  const riskBias = inferRiskBias(eventText(merged), mk);
  const baseTrust = trustBaseFromAdapter(merged.source);
  const conf01 = Math.min(1, Math.max(0.25, Number(merged.confidence) || 0.55));
  const trustSc = computeTrustScore(baseTrust, conf01, merged.corroboration_count || 0);
  const why = buildWhyMatters(merged, mk, riskBias);
  const disruptionBoost = disruptionBoostFromRecord(merged);
  const rank = computeRankScore({
    trust_score: trustSc,
    novelty_score: novelty,
    freshness_score: freshness,
    severity_score: sevSc,
    market_impact_score: mktSc,
    corroboration_count: merged.corroboration_count || 0,
    distinct_source_count: 1,
    repetition_penalty: repetitionPenalty,
    disruption_boost: disruptionBoost,
  });

  const sql = `
    INSERT INTO surveillance_events (
      source, source_type, title, summary, body_snippet, url, published_at,
      event_type, severity, confidence, countries, lat, lng, region, tags,
      affected_assets, impacted_markets, sentiment, verification_state, image_url,
      dedupe_keys, source_meta, content_hash,
      trust_score, novelty_score, severity_score, market_impact_score, freshness_score, rank_score,
      story_id, corroboration_count, risk_bias, why_matters, story_signature, normalized_topic
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      summary = VALUES(summary),
      body_snippet = VALUES(body_snippet),
      event_type = VALUES(event_type),
      severity = GREATEST(severity, VALUES(severity)),
      confidence = GREATEST(confidence, VALUES(confidence)),
      countries = VALUES(countries),
      lat = COALESCE(VALUES(lat), lat),
      lng = COALESCE(VALUES(lng), lng),
      region = COALESCE(VALUES(region), region),
      tags = VALUES(tags),
      impacted_markets = VALUES(impacted_markets),
      sentiment = VALUES(sentiment),
      source_meta = VALUES(source_meta),
      trust_score = GREATEST(trust_score, VALUES(trust_score)),
      novelty_score = VALUES(novelty_score),
      severity_score = GREATEST(severity_score, VALUES(severity_score)),
      market_impact_score = GREATEST(market_impact_score, VALUES(market_impact_score)),
      freshness_score = VALUES(freshness_score),
      rank_score = GREATEST(rank_score, VALUES(rank_score)),
      risk_bias = VALUES(risk_bias),
      why_matters = VALUES(why_matters),
      story_signature = VALUES(story_signature),
      normalized_topic = VALUES(normalized_topic),
      story_id = COALESCE(story_id, VALUES(story_id)),
      updated_at = CURRENT_TIMESTAMP
  `;
  const params = [
    merged.source,
    merged.source_type || 'official_html',
    merged.title,
    merged.summary || null,
    merged.body_snippet || null,
    merged.url,
    merged.published_at || null,
    merged.event_type,
    merged.severity,
    merged.confidence ?? 0.55,
    JSON.stringify(merged.countries || []),
    merged.lat,
    merged.lng,
    merged.region,
    JSON.stringify(merged.tags || []),
    JSON.stringify(merged.affected_assets || []),
    JSON.stringify(merged.impacted_markets || []),
    merged.sentiment,
    merged.verification_state || 'unverified',
    merged.image_url || null,
    JSON.stringify(keys),
    JSON.stringify(merged.source_meta || {}),
    ch,
    trustSc,
    novelty,
    sevSc,
    mktSc,
    freshness,
    rank,
    merged.story_id || null,
    merged.corroboration_count || 0,
    riskBias,
    why,
    storySig,
    nt,
  ];
  await executeQuery(sql, params);
  return ch;
}

function tabToEventTypes(tab) {
  const map = {
    all: null,
    macro: ['macro'],
    geopolitics: ['geopolitics'],
    conflict: ['conflict'],
    aviation: ['aviation'],
    maritime: ['maritime', 'logistics'],
    energy: ['energy'],
    commodities: ['commodities'],
    sanctions: ['sanctions'],
    central_banks: ['central_bank'],
    high_impact: null,
  };
  if (tab == null || tab === 'all') return null;
  return Object.prototype.hasOwnProperty.call(map, tab) ? map[tab] : null;
}

async function queryFeed({
  limit = 150,
  sinceUpdated,
  eventType,
  severityMin,
  source,
  tab,
}) {
  const types = tabToEventTypes(tab);
  const highImpact = tab === 'high_impact';
  let sql = `SELECT * FROM surveillance_events WHERE 1=1`;
  const params = [];
  if (sinceUpdated) {
    sql += ` AND updated_at > ?`;
    params.push(sinceUpdated);
  }
  if (eventType) {
    sql += ` AND event_type = ?`;
    params.push(eventType);
  }
  if (types && types.length) {
    sql += ` AND event_type IN (${types.map(() => '?').join(',')})`;
    params.push(...types);
  }
  if (highImpact) {
    sql += ` AND severity >= 3`;
  }
  if (severityMin != null) {
    sql += ` AND severity >= ?`;
    params.push(Number(severityMin));
  }
  if (source) {
    sql += ` AND source = ?`;
    params.push(source);
  }
  sql += ` ORDER BY rank_score DESC, updated_at DESC, COALESCE(published_at, detected_at) DESC LIMIT ?`;
  params.push(Math.min(250, Number(limit) || 150));
  const [rows] = await executeQuery(sql, params);
  return (rows || []).map(rowToEvent);
}

async function queryTopForBriefing(limit = 12) {
  const [rows] = await executeQuery(
    `SELECT * FROM surveillance_events
     ORDER BY rank_score DESC, updated_at DESC
     LIMIT ?`,
    [limit]
  );
  return (rows || []).map(rowToEvent);
}

async function queryDeltaSince(sinceIso, limit = 20) {
  if (!sinceIso) return [];
  const [rows] = await executeQuery(
    `SELECT * FROM surveillance_events
     WHERE updated_at > ?
     ORDER BY rank_score DESC, updated_at DESC
     LIMIT ?`,
    [sinceIso, limit]
  );
  return (rows || []).map(rowToEvent);
}

async function getEventById(id) {
  const [rows] = await executeQuery(`SELECT * FROM surveillance_events WHERE id = ? LIMIT 1`, [id]);
  return rowToEvent(rows && rows[0]);
}

async function getStoryBundleForEvent(ev) {
  if (!ev || !ev.story_id) return null;
  const [srows] = await executeQuery(
    `SELECT id, headline, summary, event_count FROM surveillance_stories WHERE id = ? LIMIT 1`,
    [ev.story_id]
  );
  const row = srows && srows[0];
  if (!row) return null;
  const [crow] = await executeQuery(`SELECT COUNT(*) AS c FROM surveillance_events WHERE story_id = ?`, [ev.story_id]);
  const cnt = Number(crow?.[0]?.c) || row.event_count || 0;
  const [sibs] = await executeQuery(
    `SELECT id, title, rank_score FROM surveillance_events WHERE story_id = ? AND id <> ? ORDER BY rank_score DESC LIMIT 5`,
    [ev.story_id, ev.id]
  );
  return {
    id: String(row.id),
    headline: row.headline,
    summary: row.summary,
    event_count: cnt,
    siblings: (sibs || []).map((r) => ({
      id: String(r.id),
      title: r.title,
      rank_score: r.rank_score != null ? Number(r.rank_score) : null,
    })),
  };
}

async function relatedEvents(ev, limit = 8) {
  if (!ev) return [];
  const sid = ev.story_id;
  if (sid) {
    const [storyRows] = await executeQuery(
      `SELECT * FROM surveillance_events
       WHERE id != ? AND story_id = ?
       ORDER BY rank_score DESC
       LIMIT ?`,
      [ev.id, sid, limit]
    );
    if (storyRows && storyRows.length) return storyRows.map(rowToEvent);
  }
  const [rows] = await executeQuery(
    `SELECT * FROM surveillance_events
     WHERE id != ? AND event_type = ?
     ORDER BY rank_score DESC
     LIMIT 30`,
    [ev.id, ev.event_type]
  );
  const mine = new Set((ev.countries || []).map(String));
  const scored = (rows || [])
    .map((r) => {
      const e = rowToEvent(r);
      let s = 0;
      for (const c of e.countries || []) {
        if (mine.has(String(c))) s += 2;
      }
      s += (e.rank_score || 0) * 0.01;
      return { e, s };
    })
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e);
  return scored;
}

async function computeAggregates(events) {
  const byType = {};
  let tension = 0;
  const regionHeat = {};
  const marketAcc = {};
  for (const e of events) {
    byType[e.event_type] = (byType[e.event_type] || 0) + 1;
    const w = 1 + (e.rank_score || 50) / 100;
    tension += ((e.severity || 1) * 6 + (e.market_impact_score || 20) * 0.4) * w;
    const reg = e.region || 'GLOBAL';
    regionHeat[reg] = (regionHeat[reg] || 0) + (e.severity || 1) * w;
    for (const m of e.impacted_markets || []) {
      if (!m.symbol) continue;
      marketAcc[m.symbol] = (marketAcc[m.symbol] || 0) + (m.score || 0) * w;
    }
  }
  const cap = Math.min(100, Math.round(tension / Math.max(6, events.length || 1)));
  const marketWatch = Object.entries(marketAcc)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([symbol, flowScore]) => ({ symbol, flowScore: Math.round(flowScore) }));
  return {
    countsByType: byType,
    globalTensionScore: cap,
    regionHeat,
    marketWatch,
    liveCount: events.length,
  };
}

async function listSources() {
  const [rows] = await executeQuery(
    `SELECT DISTINCT source FROM surveillance_events ORDER BY source ASC`
  );
  return (rows || []).map((r) => r.source);
}

module.exports = {
  upsertRawEvent,
  queryFeed,
  queryTopForBriefing,
  queryDeltaSince,
  getEventById,
  getStoryBundleForEvent,
  relatedEvents,
  computeAggregates,
  listSources,
  rowToEvent,
};
