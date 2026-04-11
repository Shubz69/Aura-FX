const crypto = require('crypto');
const { STOP } = require('./topic');

/**
 * Stem tokens for storyline signature (shorter than full normalized_topic).
 */
function stemTokens(title, max = 8) {
  if (!title) return [];
  const tokens = String(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  return [...new Set(tokens)].sort().slice(0, max);
}

function parseJsonArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') return [];
  try {
    const x = JSON.parse(v);
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}

function countriesArray(ev) {
  return parseJsonArray(ev.countries).map(String);
}

function impactedSymbols(ev) {
  const mk = ev.impacted_markets;
  let arr = mk;
  if (typeof mk === 'string') {
    try {
      arr = JSON.parse(mk);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((m) => m && m.symbol).filter(Boolean);
}

/**
 * Stable 64-char hex signature for an event (pre-cluster).
 */
function storySignatureFromPayload({ title, countries, event_type }) {
  const stem = stemTokens(title, 8).join('_');
  const geo = [...new Set(countriesArray({ countries }))].sort().join(',');
  const et = String(event_type || 'macro').toLowerCase();
  const raw = `${stem}|${geo}|${et}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function eventTimeMs(ev) {
  const p = ev.published_at ? new Date(ev.published_at).getTime() : NaN;
  const d = ev.detected_at ? new Date(ev.detected_at).getTime() : NaN;
  if (!Number.isNaN(p)) return p;
  if (!Number.isNaN(d)) return d;
  return Date.now();
}

function jaccardStrings(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const uni = A.size + B.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

/** Curated crisis tokens for capped cross-domain storyline bridge (clustering only). */
const CRISIS_TOKEN_RE =
  /\b(strait|canal|embargo|airspace|missile|sanctions?|oil|lng|chokepoint|blockade|closure|notam|diversion|ground stop)\b/gi;

function crisisTokenOverlap(titleA, titleB) {
  const sa = new Set();
  const sb = new Set();
  const ta = String(titleA || '').toLowerCase();
  const tb = String(titleB || '').toLowerCase();
  let m;
  const re = new RegExp(CRISIS_TOKEN_RE.source, 'gi');
  while ((m = re.exec(ta))) sa.add(m[1].toLowerCase());
  re.lastIndex = 0;
  while ((m = re.exec(tb))) sb.add(m[1].toLowerCase());
  for (const x of sa) {
    if (sb.has(x)) return true;
    if (x.endsWith('s') && sb.has(x.slice(0, -1))) return true;
    if (!x.endsWith('s') && sb.has(`${x}s`)) return true;
  }
  return false;
}

/**
 * Small boost when different event_types align on geography, time, symbols, and crisis language.
 * Capped so unrelated pairs rarely merge.
 */
function crossDomainBridgeBoost(a, b) {
  const etA = String(a.event_type || '');
  const etB = String(b.event_type || '');
  if (!etA || !etB || etA === etB) return 0;
  const dtH = Math.abs(eventTimeMs(a) - eventTimeMs(b)) / 3600000;
  if (dtH > 48) return 0;
  const ca = countriesArray(a);
  const cb = countriesArray(b);
  const cSim = jaccardStrings(ca, cb);
  const sameRegion =
    a.region &&
    b.region &&
    String(a.region) === String(b.region) &&
    String(a.region).length > 1 &&
    String(a.region).toUpperCase() !== 'GLOBAL';
  if (cSim <= 0 && !sameRegion) return 0;
  const mkSim = jaccardStrings(impactedSymbols(a), impactedSymbols(b));
  if (mkSim <= 0) return 0;
  if (!crisisTokenOverlap(a.title, b.title)) return 0;
  const raw = 0.05 + 0.07 * mkSim + 0.03 * Math.min(1, cSim || (sameRegion ? 0.35 : 0));
  return Math.min(0.12, raw);
}

/**
 * 0..1 affinity for clustering (higher = same storyline).
 */
function affiliationScore(a, b) {
  const ta = stemTokens(a.title, 10);
  const tb = stemTokens(b.title, 10);
  const tokSim = jaccardStrings(ta, tb);
  const ca = countriesArray(a);
  const cb = countriesArray(b);
  const cSim = jaccardStrings(ca, cb);
  const mkSim = jaccardStrings(impactedSymbols(a), impactedSymbols(b));
  const dtH = Math.abs(eventTimeMs(a) - eventTimeMs(b)) / 3600000;
  const timeW = dtH <= 6 ? 1 : dtH <= 24 ? 0.85 : dtH <= 72 ? 0.55 : 0.25;
  let s = 0.42 * tokSim + 0.28 * cSim + 0.18 * mkSim + 0.12 * timeW;
  const ntA = a.normalized_topic || '';
  const ntB = b.normalized_topic || '';
  if (ntA && ntA === ntB) s += 0.22;
  s += crossDomainBridgeBoost(a, b);
  return Math.min(1, s);
}

/** Lexicographic min signature in a group (stable cluster key). */
function canonicalClusterSignature(members) {
  let best = null;
  for (const m of members) {
    const sig = storySignatureFromPayload({
      title: m.title,
      countries: m.countries,
      event_type: m.event_type,
    });
    if (best == null || sig < best) best = sig;
  }
  return best || '';
}

class UnionFind {
  constructor(n) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(x) {
    if (this.p[x] !== x) this.p[x] = this.find(this.p[x]);
    return this.p[x];
  }
  union(a, b) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p[rb] = ra;
  }
}

const AFFILIATION_THRESHOLD = 0.4;

/**
 * Cluster indices 0..n-1 using union-find.
 * @returns {number[][]} list of index arrays
 */
function clusterIndices(rows) {
  const n = rows.length;
  if (n === 0) return [];
  const uf = new UnionFind(n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const ai = rows[i];
      const aj = rows[j];
      const sigI = storySignatureFromPayload({
        title: ai.title,
        countries: ai.countries,
        event_type: ai.event_type,
      });
      const sigJ = storySignatureFromPayload({
        title: aj.title,
        countries: aj.countries,
        event_type: aj.event_type,
      });
      if (sigI === sigJ || affiliationScore(ai, aj) >= AFFILIATION_THRESHOLD) {
        uf.union(i, j);
      }
    }
  }
  const buckets = new Map();
  for (let i = 0; i < n; i += 1) {
    const r = uf.find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(i);
  }
  return [...buckets.values()];
}

/**
 * Rank-first slice for heavy tape windows (keeps clustering tractable and story-stable on dense feeds).
 */
function clusterIndicesForTape(rows, cap = 220) {
  const list = [...(rows || [])].sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0)).slice(0, cap);
  return clusterIndices(list);
}

module.exports = {
  stemTokens,
  storySignatureFromPayload,
  affiliationScore,
  canonicalClusterSignature,
  clusterIndices,
  clusterIndicesForTape,
  countriesArray,
  impactedSymbols,
};
