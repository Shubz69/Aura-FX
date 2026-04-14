/**
 * Compact intel panels from the current ranked tape (pure, in-memory).
 * Pass 4: denser trader-facing tie-lines (instruments + regions + tape summary).
 */

function topSymbolsFromEvent(e, n = 5) {
  const arr = [...(e.impacted_markets || [])].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
  return [...new Set(arr.map((m) => m && m.symbol).filter(Boolean))].slice(0, n);
}

function parseMetaObj(v) {
  if (v == null) return {};
  if (typeof v === 'object') return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return {};
  }
}

function observabilityNote(e) {
  const obs = parseMetaObj(e.source_meta)?.observability;
  if (!obs) return null;
  if (typeof obs === 'string') return obs.slice(0, 160);
  if (obs.disclaimer) return String(obs.disclaimer).slice(0, 160);
  if (obs.coverage === 'partial') return 'Partial coverage — not exhaustive.';
  return null;
}

function isAviationDigestHit(e) {
  if (e.event_type === 'aviation') return true;
  const t = `${e.title || ''} ${e.summary || ''}`.toLowerCase();
  return /\b(notam|airspace closure|flight diversion|ground stop|mass diversion)\b/.test(t);
}

function isMaritimeLogisticsDigestHit(e) {
  if (e.event_type === 'maritime' || e.event_type === 'logistics') return true;
  const t = `${e.title || ''} ${e.summary || ''}`.toLowerCase();
  return /\b(shipping|canal|strait|container|freight|port congestion|chokepoint|maritime)\b/.test(t);
}

function eventRecencyMs(e) {
  const a = e.updated_at || e.published_at || e.detected_at;
  const t = a ? new Date(a).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function trustBandHint(maxTrust) {
  const t = Number(maxTrust) || 0;
  if (t >= 90) return 'Tier-1 official';
  if (t >= 84) return 'Institutional';
  if (t >= 78) return 'Public authority';
  return null;
}

function buildIntelDigest(events, opts = {}) {
  const limitStories = opts.limitStories ?? 7;
  const limitImpact = opts.limitImpact ?? 7;
  const limitCorr = opts.limitCorr ?? 8;
  const limitRegions = opts.limitRegions ?? 7;
  const limitAviation = opts.limitAviation ?? 6;
  const limitMarLog = opts.limitMarLog ?? 6;

  const byStory = new Map();
  for (const e of events) {
    if (!e.story_id) continue;
    if (!byStory.has(e.story_id)) byStory.set(e.story_id, []);
    byStory.get(e.story_id).push(e);
  }

  const developingStories = [...byStory.entries()]
    .map(([story_id, arr]) => {
      const rank = Math.max(...arr.map((x) => x.rank_score || 0));
      const maxTrust = Math.max(...arr.map((x) => (x.trust_score != null ? Number(x.trust_score) : 0)));
      const latestMs = Math.max(...arr.map(eventRecencyMs));
      const byRecency = [...arr].sort((a, b) => eventRecencyMs(b) - eventRecencyMs(a));
      const lead = byRecency[0];
      const instruments = new Set();
      const regions = new Set();
      for (const x of arr) {
        topSymbolsFromEvent(x, 6).forEach((s) => instruments.add(s));
        if (x.region) regions.add(x.region);
      }
      const publisherCount = new Set(arr.map((x) => x.source).filter(Boolean)).size;
      return {
        story_id,
        headline: lead.title,
        item_count: arr.length,
        rank_score: rank,
        trust_max: maxTrust,
        top_event_id: lead.id,
        latest_at: latestMs ? new Date(latestMs).toISOString() : null,
        publisher_count: publisherCount,
        trust_band: trustBandHint(maxTrust),
        instruments: [...instruments].slice(0, 8),
        regions: [...regions].slice(0, 5),
        trade_line:
          [...instruments].slice(0, 4).join('/') +
          ([...regions].length ? ` · ${[...regions].slice(0, 2).join('/')}` : ''),
      };
    })
    .sort((a, b) => {
      const ams = a.latest_at ? new Date(a.latest_at).getTime() : 0;
      const bms = b.latest_at ? new Date(b.latest_at).getTime() : 0;
      if (bms !== ams) return bms - ams;
      const rr = (b.rank_score || 0) - (a.rank_score || 0);
      if (rr !== 0) return rr;
      return (b.trust_max || 0) - (a.trust_max || 0);
    })
    .slice(0, limitStories);

  const highMarketImpact = [...events]
    .filter((e) => (e.market_impact_score || 0) >= 28)
    .sort((a, b) => {
      const mi = (b.market_impact_score || 0) - (a.market_impact_score || 0);
      if (mi !== 0) return mi;
      return eventRecencyMs(b) - eventRecencyMs(a);
    })
    .slice(0, limitImpact)
    .map((e) => ({
      id: e.id,
      title: e.title,
      market_impact_score: e.market_impact_score,
      rank_score: e.rank_score,
      risk_bias: e.risk_bias,
      instruments: topSymbolsFromEvent(e, 4),
    }));

  const corroboratedAlerts = [...events]
    .filter((e) => e.verification_state === 'corroborated' || (e.corroboration_count || 0) > 0)
    .sort((a, b) => {
      const ca = (a.corroboration_count || 0) - (b.corroboration_count || 0);
      if (ca !== 0) return -ca;
      const ta = new Date(a.updated_at || 0).getTime();
      const tb = new Date(b.updated_at || 0).getTime();
      return tb - ta;
    })
    .slice(0, limitCorr)
    .map((e) => ({
      id: e.id,
      title: e.title,
      corroboration_count: e.corroboration_count || 0,
      story_id: e.story_id,
      rank_score: e.rank_score,
      instruments: topSymbolsFromEvent(e, 3),
    }));

  const regionHeat = {};
  for (const e of events) {
    const reg = e.region || 'GLOBAL';
    const w = 1 + (e.rank_score || 50) / 100;
    regionHeat[reg] = (regionHeat[reg] || 0) + (e.severity || 1) * w;
  }
  const regionPressure = Object.entries(regionHeat)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limitRegions)
    .map(([region, score], idx) => ({
      region,
      score: Math.round(score),
      rank: idx + 1,
      label: idx === 0 ? 'Hot' : idx < 3 ? 'Warm' : 'Watch',
    }));

  const multiSourceStories = developingStories.filter((s) => (s.publisher_count || 0) > 1).length;
  const corroboratedHits = events.filter((e) => e.verification_state === 'corroborated' || (e.corroboration_count || 0) > 0)
    .length;

  const aviationAlerts = [...events]
    .filter((e) => isAviationDigestHit(e))
    .sort((a, b) => {
      const r = (b.rank_score || 0) - (a.rank_score || 0);
      if (r !== 0) return r;
      return eventRecencyMs(b) - eventRecencyMs(a);
    })
    .slice(0, limitAviation)
    .map((e) => ({
      id: e.id,
      title: e.title,
      rank_score: e.rank_score,
      event_type: e.event_type,
      instruments: topSymbolsFromEvent(e, 4),
      observability: observabilityNote(e),
    }));

  const maritimeLogistics = [...events]
    .filter((e) => isMaritimeLogisticsDigestHit(e))
    .sort((a, b) => {
      const r = (b.rank_score || 0) - (a.rank_score || 0);
      if (r !== 0) return r;
      return eventRecencyMs(b) - eventRecencyMs(a);
    })
    .slice(0, limitMarLog)
    .map((e) => ({
      id: e.id,
      title: e.title,
      rank_score: e.rank_score,
      event_type: e.event_type,
      instruments: topSymbolsFromEvent(e, 4),
      observability: observabilityNote(e),
    }));

  return {
    summary: {
      tape_events: events.length,
      multi_source_stories: multiSourceStories,
      corroborated_hits: corroboratedHits,
    },
    developingStories,
    aviationAlerts,
    maritimeLogistics,
    highMarketImpact,
    corroboratedAlerts,
    majorRegions: regionPressure.map(({ region, score }) => ({ region, score })),
    regionPressure,
  };
}

module.exports = { buildIntelDigest, topSymbolsFromEvent, isAviationDigestHit, isMaritimeLogisticsDigestHit };
