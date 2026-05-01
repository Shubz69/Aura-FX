/**
 * Surveillance pure logic — no network/DB.
 * Run: node tests/surveillance-pure.test.js
 */

const { buildDedupeKeys, contentHash, normalizeDedupeText } = require('../api/surveillance/dedupe');
const {
  listingHtmlFingerprint,
  listingFingerprintDrift,
  summarizeListingHealth,
} = require('../api/surveillance/adapterResilience');
const { buildIntelDigest } = require('../api/surveillance/intelDigest');
const { buildMarketWatchNarrative } = require('../api/surveillance/marketWatchNarrative');
const { bodySnippetFromHtml } = require('../api/surveillance/normalize');
const { scoreMarkets, inferRiskBias, buildWhyMatters } = require('../api/surveillance/marketImpact');
const { classifyRecord } = require('../api/surveillance/classify');
const { computeRankScore, disruptionBoostFromRecord } = require('../api/surveillance/scoring');
const {
  adapterRegion,
  feedMixFromSourceCounts,
  underCoveredRegions,
  familyUnderperformance,
} = require('../api/surveillance/adapterFamilies');
const { normalizeTopic } = require('../api/surveillance/topic');
const {
  storySignatureFromPayload,
  affiliationScore,
  clusterIndices,
  clusterIndicesForTape,
} = require('../api/surveillance/storyline');
const { bucketAdapterRecency } = require('../api/surveillance/adapterState');
const {
  validCoord,
  mergeGeoFallback,
  getFallbackEventById,
  FALLBACK_DEMO_EVENTS,
} = require('../api/surveillance/fallbackGeoEvents');
const { buildFeedDiagnostics, buildLiveGeoClientHints, providerEnvFlags } = require('../api/surveillance/feedDiagnostics');
const { computeAircraftImportance } = require('../api/surveillance/aircraftImportance');

let passed = 0;
let failed = 0;
function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}
function it(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}
const expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
  },
  toContain: (sub) => {
    if (!String(actual).includes(sub)) throw new Error(`Expected ${actual} to contain ${sub}`);
  },
  toBeGreaterThan: (n) => {
    if (!(actual > n)) throw new Error(`Expected ${actual} > ${n}`);
  },
  toBeLessThan: (n) => {
    if (!(actual < n)) throw new Error(`Expected ${actual} < ${n}`);
  },
});

describe('Dedupe', () => {
  it('stable content hash for same keys', () => {
    const a = buildDedupeKeys({ url: 'https://x.org/a', title: 'Hello', publishedAt: '2024-01-02' });
    const b = buildDedupeKeys({ url: 'https://x.org/a', title: 'Hello', publishedAt: '2024-01-02' });
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('different hash when title changes', () => {
    const a = buildDedupeKeys({ url: 'https://x.org/a', title: 'Hello', publishedAt: '2024-01-02' });
    const b = buildDedupeKeys({ url: 'https://x.org/a', title: 'World', publishedAt: '2024-01-02' });
    if (contentHash(a) === contentHash(b)) throw new Error('hash should differ');
  });

  it('same content hash when URL differs only by tracking params', () => {
    const a = buildDedupeKeys({
      url: 'https://gov.example/news/item?utm_source=x&utm_medium=y',
      title: 'Policy notice',
      publishedAt: '2026-01-02',
    });
    const b = buildDedupeKeys({
      url: 'https://gov.example/news/item?utm_campaign=z',
      title: 'Policy notice',
      publishedAt: '2026-01-02',
    });
    expect(contentHash(a)).toBe(contentHash(b));
  });

  it('normalizeDedupeText strips noise', () => {
    const n = normalizeDedupeText('  Hello — World!!  ');
    expect(n).toContain('hello');
    expect(n).toContain('world');
  });
});

describe('Normalize HTML', () => {
  it('bodySnippetFromHtml truncates', () => {
    const html = '<p>' + 'word '.repeat(200) + '</p>';
    const s = bodySnippetFromHtml(html, 80);
    expect(s.endsWith('…')).toBe(true);
    expect(s.length <= 81).toBe(true);
  });
});

describe('Market impact', () => {
  it('flags oil and DXY for energy/Fed headline', () => {
    const mk = scoreMarkets({
      title: 'Federal Reserve holds rates; oil jumps on supply risk',
      summary: '',
      body_snippet: '',
      tags: [],
      countries: [],
    });
    const syms = mk.map((m) => m.symbol);
    if (!syms.includes('WTI')) throw new Error('expected WTI');
    if (!syms.includes('DXY')) throw new Error('expected DXY');
  });

  it('maps Brent, ETH, USDCHF keywords', () => {
    const a = scoreMarkets({
      title: 'Brent futures jump on North Sea outage',
      summary: '',
      body_snippet: '',
      tags: [],
      countries: [],
    });
    if (!a.some((m) => m.symbol === 'BRENT')) throw new Error('expected BRENT');
    const b = scoreMarkets({
      title: 'Ethereum spot volumes spike',
      summary: '',
      body_snippet: '',
      tags: [],
      countries: [],
    });
    if (!b.some((m) => m.symbol === 'ETH')) throw new Error('expected ETH');
    const c = scoreMarkets({
      title: 'Swiss franc surges on SNB commentary',
      summary: '',
      body_snippet: '',
      tags: [],
      countries: [],
    });
    if (!c.some((m) => m.symbol === 'USDCHF')) throw new Error('expected USDCHF');
  });

  it('inferRiskBias reads conflict tone', () => {
    const t = 'invasion and sanctions escalate near the border';
    expect(inferRiskBias(t, [])).toBe('risk_off');
  });

  it('buildWhyMatters mentions watchlist symbols', () => {
    const s = buildWhyMatters(
      { event_type: 'macro' },
      [{ symbol: 'SPX', score: 40, direction: 'bullish_risk' }],
      'neutral'
    );
    expect(s).toContain('SPX');
    expect(s).toContain('Watchlist');
  });
});

describe('Scoring', () => {
  it('computeRankScore rises with trust', () => {
    const low = computeRankScore({
      trust_score: 40,
      novelty_score: 50,
      freshness_score: 50,
      severity_score: 50,
      market_impact_score: 50,
    });
    const high = computeRankScore({
      trust_score: 95,
      novelty_score: 50,
      freshness_score: 50,
      severity_score: 50,
      market_impact_score: 50,
    });
    expect(high).toBeGreaterThan(low);
  });

  it('computeRankScore rises with corroboration and distinct sources', () => {
    const base = computeRankScore({
      trust_score: 60,
      novelty_score: 55,
      freshness_score: 55,
      severity_score: 50,
      market_impact_score: 50,
      corroboration_count: 0,
      distinct_source_count: 1,
    });
    const boosted = computeRankScore({
      trust_score: 60,
      novelty_score: 55,
      freshness_score: 55,
      severity_score: 50,
      market_impact_score: 50,
      corroboration_count: 4,
      distinct_source_count: 4,
    });
    expect(boosted).toBeGreaterThan(base);
  });

  it('computeRankScore nudges upward with disruption_boost', () => {
    const base = computeRankScore({
      trust_score: 70,
      novelty_score: 55,
      freshness_score: 55,
      severity_score: 50,
      market_impact_score: 45,
      disruption_boost: 0,
    });
    const up = computeRankScore({
      trust_score: 70,
      novelty_score: 55,
      freshness_score: 55,
      severity_score: 50,
      market_impact_score: 45,
      disruption_boost: 8,
    });
    expect(up).toBeGreaterThan(base);
  });

  it('computeRankScore applies repetition penalty', () => {
    const clean = computeRankScore({
      trust_score: 70,
      novelty_score: 60,
      freshness_score: 60,
      severity_score: 55,
      market_impact_score: 55,
      repetition_penalty: 0,
    });
    const penalized = computeRankScore({
      trust_score: 70,
      novelty_score: 60,
      freshness_score: 60,
      severity_score: 55,
      market_impact_score: 55,
      repetition_penalty: 25,
    });
    expect(penalized).toBeLessThan(clean);
  });

  it('corroborated multi-source vector beats repetitive low-novelty wall', () => {
    const wall = computeRankScore({
      trust_score: 78,
      novelty_score: 38,
      freshness_score: 62,
      severity_score: 48,
      market_impact_score: 42,
      corroboration_count: 0,
      distinct_source_count: 1,
      repetition_penalty: 22,
    });
    const anchor = computeRankScore({
      trust_score: 76,
      novelty_score: 72,
      freshness_score: 64,
      severity_score: 55,
      market_impact_score: 58,
      corroboration_count: 5,
      distinct_source_count: 5,
      repetition_penalty: 0,
    });
    expect(anchor).toBeGreaterThan(wall);
  });

  it('computeRankScore tie-breaks on content hash when other inputs match', () => {
    const p = {
      trust_score: 80,
      novelty_score: 60,
      freshness_score: 90,
      severity_score: 70,
      market_impact_score: 50,
    };
    const a = computeRankScore(p, 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2');
    const b = computeRankScore(p, 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
    if (a === b) throw new Error(`tie-break expected different ranks, both ${a}`);
  });
});

describe('Adapter resilience helpers', () => {
  it('listingHtmlFingerprint is stable for identical HTML', () => {
    const html = '<html><a href="1"></a><a href="2"></a><body>x</body></html>';
    expect(listingHtmlFingerprint(html)).toBe(listingHtmlFingerprint(html));
  });

  it('listingFingerprintDrift detects fingerprint change', () => {
    const a = listingHtmlFingerprint('<a></a><a></a>');
    const b = listingHtmlFingerprint('<a></a>'.repeat(40));
    expect(listingFingerprintDrift(a, b)).toBe(true);
  });

  it('summarizeListingHealth flags stale markup risk', () => {
    const h = summarizeListingHealth({
      linksFound: 8,
      usedLinkFallback: true,
      parseFallbackCount: 2,
      zeroExtract: true,
    });
    if (!h.stale_markup_risk) throw new Error('expected stale_markup_risk');
    if (!h.used_link_filter_fallback) throw new Error('expected fallback flag');
  });
});

describe('Adapter regions & feed mix', () => {
  it('adapterRegion defaults unknown ids to global', () => {
    expect(adapterRegion('unknown_adapter_xyz')).toBe('global');
  });

  it('feedMixFromSourceCounts groups by region and family', () => {
    const mix = feedMixFromSourceCounts({ federal_reserve_press: 10, imo_media: 5 }, 15);
    if (!mix.byRegion.na) throw new Error('expected na region');
    if (!mix.byFamily.central_bank) throw new Error('expected central_bank family');
  });

  it('underCoveredRegions flags low-adapter regions', () => {
    const rollup = { sa: { total: 0, fresh: 0 }, na: { total: 10, fresh: 9 } };
    const gaps = underCoveredRegions(rollup, { sa: { pctOfWindow: 0 }, na: { pctOfWindow: 80 } });
    if (!gaps.some((g) => g.region === 'sa')) throw new Error('expected sa gap');
  });

  it('familyUnderperformance surfaces weak adapter ratios', () => {
    const states = [
      { adapter_id: 'sec_press', last_success_at: null, consecutive_failures: 0 },
      { adapter_id: 'cftc_press', last_success_at: null, consecutive_failures: 3 },
      { adapter_id: 'finra_news_releases', last_success_at: null, consecutive_failures: 3 },
    ];
    const fams = familyUnderperformance(states);
    if (!fams.length) throw new Error('expected at least one weak family');
  });
});

describe('Storyline', () => {
  const iso = '2026-04-10T14:00:00.000Z';

  it('storySignatureFromPayload is stable for same semantic input', () => {
    const a = storySignatureFromPayload({
      title: 'Energy export curbs tighten on key trading routes',
      countries: ['US', 'EU'],
      event_type: 'sanctions',
    });
    const b = storySignatureFromPayload({
      title: 'Energy export curbs tighten on key trading routes',
      countries: ['EU', 'US'],
      event_type: 'sanctions',
    });
    expect(a).toBe(b);
  });

  it('affiliationScore links overlapping geo and headline variants', () => {
    const e1 = {
      title: 'Sanctions package announced against trading entities',
      countries: '["EU","US"]',
      event_type: 'sanctions',
      normalized_topic: 'topic_sanctions_x',
      impacted_markets: '[]',
      published_at: iso,
      detected_at: iso,
    };
    const e2 = {
      title: 'Sanctions announced on trading entities in new package',
      countries: '["US","EU"]',
      event_type: 'sanctions',
      normalized_topic: 'topic_sanctions_x',
      impacted_markets: '[]',
      published_at: iso,
      detected_at: iso,
    };
    expect(affiliationScore(e1, e2)).toBeGreaterThan(0.39);
    const clusters = clusterIndices([e1, e2]);
    if (clusters.length !== 1 || clusters[0].length !== 2) {
      throw new Error('expected one cluster of two events');
    }
  });

  it('affiliationScore cross-domain bridge lifts sanctions + maritime with shared strait and symbols', () => {
    const e1 = {
      title: 'US and EU widen sanctions on Hormuz strait oil shipping networks',
      countries: '["SA","AE"]',
      event_type: 'sanctions',
      normalized_topic: 'nt_sanctions_hormuz',
      impacted_markets: [{ symbol: 'WTI', score: 50 }],
      region: 'SA',
      published_at: iso,
      detected_at: iso,
    };
    const e2 = {
      title: 'Maritime traffic advisory warns of delays through Hormuz strait',
      countries: '["AE","SA"]',
      event_type: 'maritime',
      normalized_topic: 'nt_maritime_hormuz',
      impacted_markets: [{ symbol: 'WTI', score: 40 }],
      region: 'SA',
      published_at: iso,
      detected_at: iso,
    };
    expect(affiliationScore(e1, e2)).toBeGreaterThan(0.39);
    const clusters = clusterIndices([e1, e2]);
    if (clusters.length !== 1 || clusters[0].length !== 2) throw new Error('expected cross-domain cluster merge');
  });

  it('affiliationScore stays low for disjoint narratives', () => {
    const a = {
      title: 'Central bank leaves benchmark rates unchanged',
      countries: '["JP"]',
      event_type: 'macro',
      normalized_topic: 'topic_macro_jp',
      impacted_markets: '[]',
      published_at: iso,
      detected_at: iso,
    };
    const b = {
      title: 'Port congestion delays container shipping schedules',
      countries: '["CN"]',
      event_type: 'logistics',
      normalized_topic: 'topic_logistics_cn',
      impacted_markets: '[]',
      published_at: iso,
      detected_at: iso,
    };
    expect(affiliationScore(a, b)).toBeLessThan(0.4);
  });

  it('clusterIndicesForTape keeps same-signature items together on a noisy tape', () => {
    const iso = '2026-05-01T10:00:00.000Z';
    const mk = (title, rank, id) => ({
      id,
      title,
      countries: '["US"]',
      event_type: 'macro',
      normalized_topic: 'nt',
      impacted_markets: '[]',
      published_at: iso,
      detected_at: iso,
      rank_score: rank,
    });
    const core = [
      mk('Same institutional headline for tape clustering', 100, 1),
      mk('Same institutional headline for tape clustering', 99, 2),
      mk('Same institutional headline for tape clustering', 98, 3),
    ];
    const noise = Array.from({ length: 28 }, (_, i) =>
      mk(`Unrelated flash headline number ${i} for noise floor`, 12 + (i % 4), 100 + i)
    );
    const rows = [...noise, ...core].sort(() => Math.random() - 0.5);
    const clusters = clusterIndicesForTape(rows, 220);
    const big = clusters.reduce((m, c) => Math.max(m, c.length), 0);
    if (big < 3) throw new Error('expected a 3+ cluster from identical signatures');
  });
});

describe('Intel digest + narrative', () => {
  it('buildIntelDigest attaches instruments and summary', () => {
    const events = [
      {
        id: '1',
        story_id: 's1',
        title: 'Oil supply risk rises',
        rank_score: 90,
        market_impact_score: 60,
        corroboration_count: 0,
        verification_state: 'unverified',
        region: 'MENA',
        impacted_markets: [{ symbol: 'WTI', score: 70 }],
        updated_at: '2026-01-01T00:00:00Z',
        event_type: 'energy',
      },
      {
        id: '2',
        story_id: 's1',
        title: 'Follow-on oil supply risk',
        rank_score: 85,
        market_impact_score: 55,
        corroboration_count: 0,
        verification_state: 'unverified',
        region: 'MENA',
        impacted_markets: [{ symbol: 'BRENT', score: 50 }],
        updated_at: '2026-01-01T00:00:00Z',
        event_type: 'energy',
      },
    ];
    const d = buildIntelDigest(events, { limitStories: 3, limitImpact: 3, limitCorr: 3, limitRegions: 3 });
    if (!d.summary || d.summary.tape_events !== 2) throw new Error('summary tape_events');
    if (!Array.isArray(d.aviationAlerts) || !Array.isArray(d.maritimeLogistics)) {
      throw new Error('expected aviation and maritime digest arrays');
    }
    if (!d.developingStories[0].instruments || !d.developingStories[0].instruments.includes('WTI')) {
      throw new Error('expected instruments on developing story');
    }
    const agg = {
      marketWatch: [
        { symbol: 'WTI', flowScore: 10 },
        { symbol: 'DXY', flowScore: 8 },
      ],
    };
    const nar = buildMarketWatchNarrative(events, agg, d);
    if (!nar || nar.length < 2) throw new Error('expected narrative groups');
  });

  it('buildIntelDigest fills aviation and maritime-logistics strips', () => {
    const events = [
      {
        id: 'a1',
        story_id: null,
        title: 'NOTAM airspace closure extended west',
        rank_score: 82,
        event_type: 'aviation',
        impacted_markets: [{ symbol: 'US30', score: 30 }],
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'm1',
        story_id: null,
        title: 'Panama canal transit delays for container queue',
        rank_score: 71,
        event_type: 'logistics',
        impacted_markets: [{ symbol: 'SHIPPING', score: 40 }],
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];
    const d = buildIntelDigest(events, { limitAviation: 5, limitMarLog: 5 });
    if (!d.aviationAlerts?.some((x) => x.id === 'a1')) throw new Error('expected aviation strip item');
    if (!d.maritimeLogistics?.some((x) => x.id === 'm1')) throw new Error('expected maritime strip item');
  });
});

describe('Adapter recency bucket', () => {
  it('bucketAdapterRecency maps age to fresh / warm / cold / stale', () => {
    const fixed = Date.UTC(2026, 3, 10, 12, 0, 0);
    const orig = Date.now;
    Date.now = () => fixed;
    try {
      expect(bucketAdapterRecency(new Date(fixed - 20 * 60 * 1000).toISOString())).toBe('fresh');
      expect(bucketAdapterRecency(new Date(fixed - 3 * 3600000).toISOString())).toBe('warm');
      expect(bucketAdapterRecency(new Date(fixed - 12 * 3600000).toISOString())).toBe('cold');
      expect(bucketAdapterRecency(new Date(fixed - 30 * 3600000).toISOString())).toBe('stale');
      expect(bucketAdapterRecency(null)).toBe('never');
    } finally {
      Date.now = orig;
    }
  });
});

describe('Topic normalize', () => {
  it('stable for same title and countries', () => {
    const a = normalizeTopic('Central Bank Holds Rates Steady', ['US', 'DE']);
    const b = normalizeTopic('Central Bank Holds Rates Steady', ['DE', 'US']);
    expect(a).toBe(b);
  });
});

describe('Classify', () => {
  it('detects sanctions language', () => {
    const r = classifyRecord({
      title: 'OFAC sanctions designation',
      summary: '',
      body_snippet: '',
    });
    expect(r.event_type).toBe('sanctions');
  });

  it('detects logistics from supply chain language', () => {
    const r = classifyRecord({
      title: 'Port congestion and freight index spike on Asia routes',
      summary: '',
      body_snippet: '',
    });
    expect(r.event_type).toBe('logistics');
  });

  it('disruptionBoostFromRecord responds to aviation closure phrasing', () => {
    expect(
      disruptionBoostFromRecord({
        event_type: 'aviation',
        title: 'Temporary airspace closure and diversions',
        summary: '',
      })
    ).toBeGreaterThan(0);
  });

  it('classifies submarine mentions as maritime', () => {
    const r = classifyRecord({
      title: 'Submarine fleet movement reported in Baltic Sea shipping lanes',
      summary: '',
      body_snippet: '',
    });
    expect(r.event_type).toBe('maritime');
  });
});

describe('Surveillance geo fallback', () => {
  it('validCoord rejects null and 0,0', () => {
    expect(validCoord(10, 20)).toBe(true);
    expect(validCoord(0, 0)).toBe(false);
    expect(validCoord(null, 1)).toBe(false);
    expect(validCoord(100, 0)).toBe(false);
  });

  it('mergeGeoFallback adds renderable demos when feed empty', () => {
    const m = mergeGeoFallback([], { minGeoMarkers: 4, tab: null });
    if (m.mergedDemoCount < 1) throw new Error('expected demo merge');
    if (m.geoAfter < 1) throw new Error('expected geo after');
    const withCoords = m.events.filter((e) => validCoord(e.lat, e.lng));
    if (withCoords.length < m.geoAfter) throw new Error('coords');
    const kinds = new Set(m.events.filter((e) => e.is_demo).map((e) => e.marker_kind));
    if (!kinds.has('aircraft') || !kinds.has('submarine')) throw new Error('expected aircraft and submarine demos');
  });

  it('mergeGeoFallback skips demos when country filter active', () => {
    const m = mergeGeoFallback([], { countryIso2: 'US', minGeoMarkers: 4, tab: null });
    expect(m.mergedDemoCount).toBe(0);
    expect(m.reason).toBe('country_filter_no_demo_merge');
  });

  it('mergeGeoFallback does not merge when live geo sufficient', () => {
    const live = Array.from({ length: 8 }).map((_, i) => ({
      id: String(i),
      lat: 10 + i * 0.1,
      lng: 20 + i * 0.1,
      event_type: 'aviation',
      severity: 2,
    }));
    const m = mergeGeoFallback(live, { minGeoMarkers: 4, tab: null });
    expect(m.mergedDemoCount).toBe(0);
    expect(m.reason).toBe('sufficient_live_geo');
  });

  it('getFallbackEventById returns demo envelope', () => {
    const first = FALLBACK_DEMO_EVENTS[0];
    const g = getFallbackEventById(first.id);
    if (!g || !g.is_demo) throw new Error('demo by id');
    expect(g.source).toContain('fallback');
  });

  it('buildFeedDiagnostics shapes safe payload', () => {
    const d = buildFeedDiagnostics({
      liveEventCount: 0,
      geoTaggedLive: 0,
      mergedDemoCount: 5,
      mergeReason: 'empty_feed',
      finalGeoCount: 5,
      tab: 'all',
      countryIso2: null,
    });
    if (d.mergedDemoCount !== 5) throw new Error('diag');
    if (d.demoLabel !== 'synthetic_geo_markers') throw new Error('label');
  });
});

describe('Aviation importance + live geo hints', () => {
  it('computeAircraftImportance marks military + hotspot as high or notable', () => {
    const r = computeAircraftImportance({
      lat: 48.5,
      lng: 35.0,
      hints: ['military_air_candidate'],
      squawk: '',
      velocity: 220,
      baroAltitude: 10000,
      localClusterCount: 1,
    });
    if (!r.aircraft_importance || r.aircraft_importance === 'routine') throw new Error('expected non-routine');
    if (!String(r.aircraft_importance_reason || '').length) throw new Error('reason');
  });

  it('buildLiveGeoClientHints has OpenSky + maritime policy (no paid vessel adapter)', () => {
    const env = providerEnvFlags();
    const h = buildLiveGeoClientHints(
      [
        {
          adapter_id: 'opensky_live',
          last_success_at: '2026-01-01T00:00:00.000Z',
          last_ingest_run: {
            fetched_count: 12,
            normalized_emitted: 10,
            opensky_fetched_count: 12,
            opensky_normalized_emitted: 10,
          },
          events_written_24h: 40,
        },
      ],
      env
    );
    if (!h.opensky) throw new Error('opensky hints');
    if (h.datalastic != null) throw new Error('datalastic hints must not exist');
    if (!h.maritime_context || h.maritime_context.live_vessel_tracking_enabled !== false) {
      throw new Error('expected live_vessel_tracking_enabled false');
    }
    const msg = (h.messages || []).join(' ');
    if (!msg.includes('Live vessel tracking not enabled')) throw new Error('expected vessel policy message');
  });

  it('surveillance adapter registry has no paid vessel ingest module', () => {
    const { ADAPTERS } = require('../api/surveillance/adapters');
    const ids = ADAPTERS.map((a) => a.id);
    if (ids.includes('datalastic_ais_live')) throw new Error('datalastic_ais_live must not be registered');
    let fileGone = false;
    try {
      require.resolve('../api/surveillance/adapters/datalasticAisLive.js');
    } catch {
      fileGone = true;
    }
    if (!fileGone) throw new Error('datalasticAisLive.js should be removed');
  });
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
