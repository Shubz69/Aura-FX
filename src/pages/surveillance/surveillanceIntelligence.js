import { displayNameForIso2, eventMatchesFocus, normalizeRegionKey, primaryCountryFromEvent } from './surveillanceRegionUtils';

const DEMO_TS = '2026-04-27T12:00:00.000Z';

const DEMO_FALLBACK_EVENTS = [
  {
    id: 'demo-airlift-1',
    title: 'Heavy cargo aircraft observed over Gulf transit corridor',
    summary: 'Demo intelligence: fallback aviation corridor monitoring while live feed is unavailable.',
    event_type: 'aviation',
    severity: 3,
    rank_score: 71,
    lat: 25.2,
    lng: 54.1,
    countries: ['AE', 'SA'],
    source: 'fallback_demo',
    source_type: 'demo',
    published_at: DEMO_TS,
    detected_at: DEMO_TS,
    updated_at: DEMO_TS,
    why_it_matters: 'Sustained strategic lift can imply logistics pressure around energy transport routes.',
    impacted_markets: [{ symbol: 'BRENT', score: 62, rationale: ['Air corridor and logistics sensitivity in Gulf lanes.'] }],
    marker_kind: 'aircraft',
    is_demo: true,
  },
  {
    id: 'demo-naval-1',
    title: 'Naval task group posture shift near chokepoint',
    summary: 'Demo intelligence: fallback naval route awareness marker.',
    event_type: 'maritime',
    severity: 4,
    rank_score: 78,
    lat: 26.6,
    lng: 56.3,
    countries: ['OM', 'AE'],
    source: 'fallback_demo',
    source_type: 'demo',
    published_at: DEMO_TS,
    detected_at: DEMO_TS,
    updated_at: DEMO_TS,
    why_it_matters: 'Route security posture changes often feed into freight risk premia and oil volatility.',
    impacted_markets: [{ symbol: 'WTI', score: 64, rationale: ['Potential transit risk repricing.'] }],
    marker_kind: 'naval',
    is_demo: true,
  },
  {
    id: 'demo-submarine-1',
    title: 'Sub-surface military activity indicator in North Atlantic',
    summary: 'Demo intelligence: fallback submarine activity marker.',
    event_type: 'conflict',
    severity: 4,
    rank_score: 76,
    lat: 61.8,
    lng: -18.6,
    countries: ['GB', 'NO'],
    source: 'fallback_demo',
    source_type: 'demo',
    published_at: DEMO_TS,
    detected_at: DEMO_TS,
    updated_at: DEMO_TS,
    why_it_matters: 'Military friction in shipping theatres can raise defence demand and risk-off hedging.',
    impacted_markets: [{ symbol: 'XAUUSD', score: 55, rationale: ['Higher tail-risk hedging demand.'] }],
    marker_kind: 'submarine',
    is_demo: true,
  },
  {
    id: 'demo-port-1',
    title: 'Major container port congestion watch',
    summary: 'Demo intelligence: fallback port disruption marker.',
    event_type: 'maritime',
    severity: 3,
    rank_score: 68,
    lat: 31.3,
    lng: 121.8,
    countries: ['CN'],
    source: 'fallback_demo',
    source_type: 'demo',
    published_at: DEMO_TS,
    detected_at: DEMO_TS,
    updated_at: DEMO_TS,
    why_it_matters: 'Port bottlenecks can pressure shipping rates and regional manufacturer margins.',
    impacted_markets: [{ symbol: 'SHIPPING', score: 58, rationale: ['Container throughput risk.'] }],
    marker_kind: 'trade_route',
    is_demo: true,
  },
  {
    id: 'demo-base-1',
    title: 'Air base readiness posture update',
    summary: 'Demo intelligence: fallback military base readiness marker.',
    event_type: 'conflict',
    severity: 3,
    rank_score: 67,
    lat: 35.1,
    lng: 33.3,
    countries: ['TR'],
    source: 'fallback_demo',
    source_type: 'demo',
    published_at: DEMO_TS,
    detected_at: DEMO_TS,
    updated_at: DEMO_TS,
    why_it_matters: 'Readiness shifts can reinforce defence-sector bid and broader geopolitical risk premium.',
    impacted_markets: [{ symbol: 'ITA', score: 45, rationale: ['Defence industry sentiment support.'] }],
    marker_kind: 'conflict',
    is_demo: true,
  },
  {
    id: 'demo-energy-1',
    title: 'Energy export corridor risk checkpoint',
    summary: 'Demo intelligence: fallback energy chokepoint marker.',
    event_type: 'energy',
    severity: 4,
    rank_score: 81,
    lat: 29.7,
    lng: 32.5,
    countries: ['EG'],
    source: 'fallback_demo',
    source_type: 'demo',
    published_at: DEMO_TS,
    detected_at: DEMO_TS,
    updated_at: DEMO_TS,
    why_it_matters: 'Energy route bottlenecks can tighten front-end oil/gas balances and shipping insurance costs.',
    impacted_markets: [{ symbol: 'NATGAS', score: 59, rationale: ['Route-risk premium.'] }],
    marker_kind: 'energy',
    is_demo: true,
  },
];

const HOTSPOT_COUNTRIES = new Set(['AE', 'SA', 'IR', 'IQ', 'IL', 'EG', 'TW', 'CN', 'RU', 'UA', 'TR']);

function recencyWeightForEvent(event) {
  const ts = new Date(event?.updated_at || event?.detected_at || event?.published_at || 0).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return 0.45;
  const ageHours = (Date.now() - ts) / 3600000;
  if (ageHours <= 2) return 1;
  if (ageHours <= 8) return 0.88;
  if (ageHours <= 24) return 0.7;
  if (ageHours <= 72) return 0.52;
  return 0.36;
}

function escalationScore(event) {
  const text = `${event?.title || ''} ${event?.summary || ''}`.toLowerCase();
  if ((event?.event_type || '').toLowerCase() === 'conflict' || /\bmissile|strike|troops|drone|military|naval|airstrike\b/.test(text)) return 42;
  if ((event?.event_type || '').toLowerCase() === 'sanctions' || /\bsanction|export control|asset freeze|tariff\b/.test(text)) return 28;
  if ((event?.event_type || '').toLowerCase() === 'energy' || /\boil|gas|lng|pipeline|strait|suez|hormuz\b/.test(text)) return 34;
  return 16;
}

function proximityScore(event) {
  const countries = Array.isArray(event?.countries) ? event.countries.map((c) => normalizeRegionKey(c)) : [];
  const hotspotHits = countries.filter((c) => HOTSPOT_COUNTRIES.has(c)).length;
  const lat = Number(event?.lat);
  const lng = Number(event?.lng);
  let geoBoost = 0;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    if (lat > 18 && lat < 35 && lng > 30 && lng < 60) geoBoost = 18; // Middle East / Hormuz
    else if (lat > 22 && lat < 30 && lng > 118 && lng < 125) geoBoost = 18; // Taiwan area
    else if (lat > 43 && lat < 55 && lng > 25 && lng < 42) geoBoost = 16; // Ukraine theatre
    else if (lat > 27 && lat < 33 && lng > 30 && lng < 35) geoBoost = 14; // Suez corridor
  }
  return Math.min(28, hotspotHits * 9 + geoBoost);
}

function assetSensitivityScore(event) {
  const impacted = Array.isArray(event?.impacted_markets) ? event.impacted_markets : [];
  const symSet = new Set(impacted.map((m) => String(m?.symbol || '').toUpperCase()));
  let score = 10;
  if (symSet.has('WTI') || symSet.has('BRENT') || symSet.has('NATGAS')) score += 20;
  if (symSet.has('XAUUSD') || symSet.has('XAU') || symSet.has('GOLD')) score += 12;
  if (symSet.has('DXY') || symSet.has('USDJPY') || symSet.has('EURUSD') || symSet.has('USDCNH')) score += 12;
  if (symSet.has('SHIPPING')) score += 10;
  return Math.min(34, score);
}

export function marketImpactForEvent(event) {
  const raw = escalationScore(event) + proximityScore(event) + assetSensitivityScore(event);
  const recency = recencyWeightForEvent(event);
  const weighted = Math.round(raw * recency);
  let level = 'Low';
  if (weighted >= 74) level = 'Critical';
  else if (weighted >= 54) level = 'High';
  else if (weighted >= 34) level = 'Medium';
  return { score: weighted, level, recencyWeight: recency };
}

function reactionBulletsForEvent(event, impact) {
  const text = `${event?.title || ''} ${event?.summary || ''}`.toLowerCase();
  const riskOff = /\bmissile|strike|troops|drone|escalat|military|attack|conflict|war\b/.test(text);
  const oilRisk = /\boil|lng|gas|strait|shipping|port|suez|hormuz\b/.test(text);
  return {
    fx: riskOff ? 'USD and JPY bid; higher-beta FX softer.' : 'USD mixed; regional FX driven by headline follow-through.',
    commodities: oilRisk ? 'Oil and gas risk premium may widen; gold supported on uncertainty.' : 'Gold mildly firmer if uncertainty persists.',
    indices: riskOff ? 'Risk-off tilt: defensives outperform, cyclicals can lag.' : 'Neutral-to-cautious equity tone unless escalation broadens.',
  };
}

function scenarioIdeasForEvent(event, impact, reaction) {
  if (impact.level !== 'High' && impact.level !== 'Critical') return [];
  const text = `${event?.title || ''} ${event?.summary || ''}`.toLowerCase();
  const out = [];
  if (/\bgold|safe haven|risk-off|military|escalat|strike|missile\b/.test(text)) out.push('Watch: XAUUSD long if escalation pace accelerates.');
  if (/\boil|lng|strait|hormuz|suez|pipeline|shipping\b/.test(text)) out.push('Watch: Oil breakout if route risk premium expands.');
  if (reaction.fx.includes('JPY')) out.push('Watch: JPY strength if risk-off broadens across regions.');
  if (!out.length) out.push('Watch: USD and gold strength if headline risk broadens.');
  return out.slice(0, 3);
}

export function intelligenceForEvent(event) {
  const impact = marketImpactForEvent(event);
  const immediateReaction = reactionBulletsForEvent(event, impact);
  const tradeSetupIdeas = scenarioIdeasForEvent(event, impact, immediateReaction);
  return { impact, immediateReaction, tradeSetupIdeas };
}

function confidenceFromEvents(events, dataMode) {
  if (dataMode !== 'live') return 'Low';
  const count = Array.isArray(events) ? events.length : 0;
  if (count >= 40) return 'High';
  if (count >= 14) return 'Medium';
  return 'Low';
}

export function markerKindFromEvent(event) {
  const text = `${event?.title || ''} ${event?.summary || ''}`.toLowerCase();
  if (event?.marker_kind) return event.marker_kind;
  if ((event?.event_type || '').toLowerCase() === 'aviation') return 'aircraft';
  if (/\bsubmarine|sub-surface|subsurface\b/.test(text)) return 'submarine';
  if (/\bnaval|warship|fleet|destroyer|carrier|frigate\b/.test(text)) return 'naval';
  if (/\bchokepoint|pipeline|lng|oil|gas|refinery|opec\b/.test(text)) return 'energy';
  if (/\bport|shipping|strait|canal|freight|container|route\b/.test(text)) return 'trade_route';
  if (/\bconflict|strike|missile|troops|base|drone|military\b/.test(text)) return 'conflict';
  if (/\bcpi|inflation|rate|central bank|gdp|macro\b/.test(text)) return 'economic';
  return 'country';
}

export function markerIconForKind(kind) {
  const k = String(kind || '');
  if (k === 'aircraft') return '✈';
  if (k === 'naval') return '⚓';
  if (k === 'submarine') return '⬢';
  if (k === 'conflict') return '✦';
  if (k === 'economic') return '¤';
  if (k === 'energy') return '◉';
  if (k === 'trade_route') return '⇄';
  return '◎';
}

export function buildRenderableEvents(events) {
  const safe = Array.isArray(events) ? events : [];
  if (safe.length) {
    const enriched = safe.map((e) => {
      const intel = intelligenceForEvent(e);
      return {
        ...e,
        marker_kind: markerKindFromEvent(e),
        market_impact_level: intel.impact.level,
        market_impact_score_scaled: intel.impact.score,
        recency_weight: intel.impact.recencyWeight,
        immediate_reaction: intel.immediateReaction,
        trade_setup_ideas: intel.tradeSetupIdeas,
        is_demo: !!e.is_demo,
      };
    });
    return {
      events: enriched,
      dataMode: 'live',
      fallbackActive: false,
      liveDataConfidence: confidenceFromEvents(enriched, 'live'),
    };
  }
  const fallbackEvents = DEMO_FALLBACK_EVENTS.map((e) => {
    const intel = intelligenceForEvent(e);
    return {
      ...e,
      market_impact_level: intel.impact.level,
      market_impact_score_scaled: intel.impact.score,
      recency_weight: intel.impact.recencyWeight,
      immediate_reaction: intel.immediateReaction,
      trade_setup_ideas: intel.tradeSetupIdeas,
    };
  });
  return {
    events: fallbackEvents,
    dataMode: 'fallback',
    fallbackActive: true,
    liveDataConfidence: confidenceFromEvents(fallbackEvents, 'fallback'),
  };
}

export function fallbackHeadlinesForCountry(iso2) {
  const iso = normalizeRegionKey(iso2);
  if (!/^[A-Z]{2}$/.test(iso)) return [];
  const country = displayNameForIso2(iso) || iso;
  return [
    {
      title: `Fallback headline: ${country} monitoring update`,
      source: 'Demo wire (fallback)',
      publishedAt: DEMO_TS,
      url: '',
    },
    {
      title: `Fallback headline: ${country} trade and security watch`,
      source: 'Demo wire (fallback)',
      publishedAt: DEMO_TS,
      url: '',
    },
  ];
}

function listTopSymbols(events, limit = 6) {
  const scores = new Map();
  for (const ev of events) {
    for (const m of Array.isArray(ev?.impacted_markets) ? ev.impacted_markets : []) {
      const sym = String(m?.symbol || '').trim();
      if (!sym) continue;
      scores.set(sym, (scores.get(sym) || 0) + (Number(m?.score) || 25));
    }
  }
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([symbol]) => symbol);
}

export function buildCountryIntel({ focusRegion, events, wireHeadlines, wireServiceAvailable }) {
  if (!focusRegion) return null;
  const iso = normalizeRegionKey(focusRegion);
  const scoped = (events || []).filter((e) => eventMatchesFocus(e, iso));
  const sev = scoped.reduce((m, e) => Math.max(m, Number(e?.severity) || 0), 0);
  const riskLevel = sev >= 4 ? 'High' : sev >= 3 ? 'Elevated' : scoped.length ? 'Guarded' : 'Low';
  const marketImpactSummary =
    sev >= 4
      ? 'High-volatility regime risk: monitor safe-haven flows, energy sensitivity, and transport pricing.'
      : sev >= 3
        ? 'Moderate pressure: potential FX and sector rotation impact around key headlines.'
        : 'Limited immediate pressure: keep this region on watch for escalation.';
  const topEvents = scoped.slice(0, 5);
  const impactedInstruments = listTopSymbols(scoped, 8);
  const headlines =
    wireHeadlines && wireHeadlines.length
      ? wireHeadlines
      : /^[A-Z]{2}$/.test(iso)
        ? fallbackHeadlinesForCountry(iso)
        : [];
  const headlineMode = wireHeadlines && wireHeadlines.length ? 'live' : 'fallback';
  const impactByEvent = topEvents.map((ev) => intelligenceForEvent(ev).impact);
  const impactScore = impactByEvent.length ? Math.round(impactByEvent.reduce((s, x) => s + x.score, 0) / impactByEvent.length) : 18;
  const marketImpactLevel = impactScore >= 74 ? 'Critical' : impactScore >= 54 ? 'High' : impactScore >= 34 ? 'Medium' : 'Low';
  const changedRecently =
    topEvents.length > 0
      ? `${topEvents.filter((e) => recencyWeightForEvent(e) >= 0.88).length} fresh events in the last ~8h shifted this country lens.`
      : 'No fresh changes in the current window.';
  const invalidation =
    marketImpactLevel === 'Critical' || marketImpactLevel === 'High'
      ? 'Scenario weakens if military/economic escalation headlines stop and route disruption risk normalizes.'
      : 'Scenario weakens if no new escalation arrives and risk-sensitive assets mean-revert.';
  const whyToday =
    marketImpactLevel === 'Critical'
      ? 'This geography now sits in a critical market-transmission lane touching energy and risk sentiment.'
      : marketImpactLevel === 'High'
        ? 'This geography is currently one of the stronger risk transmitters into FX, commodities, and equities.'
        : 'This geography is currently a secondary but monitor-worthy risk transmitter.';

  return {
    countryName: /^[A-Z]{2}$/.test(iso) ? displayNameForIso2(iso) || iso : iso,
    isoHint: /^[A-Z]{2}$/.test(iso) ? iso : null,
    riskLevel,
    marketImpactLevel,
    marketImpactScore: impactScore,
    keyEvents: topEvents,
    marketImpactSummary,
    impactedInstruments,
    sectors: ['FX', 'Indices', 'Commodities', 'Oil/Gas', 'Gold', 'Defence', 'Shipping'],
    energyTradeImpact:
      'Track corridor reliability, transit insurance premium changes, and rerouting pressure on major sea/air lanes.',
    headlines,
    headlineMode,
    timestampLabel: topEvents[0]?.updated_at || topEvents[0]?.detected_at || topEvents[0]?.published_at || DEMO_TS,
    sourceLabel: headlineMode === 'live' && wireServiceAvailable ? 'Live wire + Aura ingest' : 'Aura ingest + demo fallback wire',
    whyThisMattersToday: whyToday,
    whatChangedRecently: changedRecently,
    whatInvalidatesScenario: invalidation,
    immediateReaction: topEvents[0] ? intelligenceForEvent(topEvents[0]).immediateReaction : reactionBulletsForEvent({}, { level: 'Low' }),
    tradeSetupIdeas: topEvents[0] ? intelligenceForEvent(topEvents[0]).tradeSetupIdeas : [],
    traderWatch: [
      'Watch local-currency pairs versus USD and JPY for stress signals.',
      'Monitor oil/gas and shipping instruments for route disruption repricing.',
      'Check defence and safe-haven rotation against headline velocity.',
    ],
  };
}

export function buildGlobalSummary(events) {
  const safe = Array.isArray(events) ? events : [];
  const byKind = new Map();
  const byCountry = new Map();
  for (const ev of safe) {
    const kind = markerKindFromEvent(ev);
    byKind.set(kind, (byKind.get(kind) || 0) + 1);
    for (const c of Array.isArray(ev.countries) ? ev.countries : []) {
      const iso = normalizeRegionKey(c);
      if (/^[A-Z]{2}$/.test(iso)) byCountry.set(iso, (byCountry.get(iso) || 0) + (Number(ev.severity) || 1));
    }
  }
  const topCountries = Array.from(byCountry.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([iso]) => displayNameForIso2(iso) || iso);
  const topInstruments = listTopSymbols(safe, 6);
  return {
    topGlobalRisks: safe.slice(0, 3).map((e) => e.title),
    marketSensitiveCountries: topCountries,
    energyChokepoints: safe
      .filter((e) => markerKindFromEvent(e) === 'energy' || markerKindFromEvent(e) === 'trade_route')
      .slice(0, 4)
      .map((e) => e.title),
    activeCounts: {
      militaryNavalAir:
        (byKind.get('conflict') || 0) + (byKind.get('naval') || 0) + (byKind.get('submarine') || 0) + (byKind.get('aircraft') || 0),
      economic: byKind.get('economic') || 0,
      tradeRoute: byKind.get('trade_route') || 0,
    },
    highestImpactInstruments: topInstruments,
  };
}

export function eventForMarkerSelection(id, eventsById) {
  const ev = eventsById.get(String(id));
  if (!ev) return null;
  const country = primaryCountryFromEvent(ev);
  return {
    ...ev,
    marker_kind: markerKindFromEvent(ev),
    marker_icon: markerIconForKind(markerKindFromEvent(ev)),
    countries: Array.isArray(ev.countries) ? ev.countries : country ? [country] : [],
  };
}
