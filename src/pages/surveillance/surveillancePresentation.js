/**
 * User-facing copy and formatting for Surveillance (no data plumbing).
 */

/** Best-effort timestamp for “how fresh is this row?” */
export function eventFreshnessTimestamp(ev) {
  if (!ev || typeof ev !== 'object') return null;
  return ev.updated_at || ev.detected_at || ev.published_at || null;
}

export function trustQualityPresentation(trustScore) {
  const t = Number(trustScore);
  if (!Number.isFinite(t)) {
    return {
      short: '—',
      label: 'Source quality',
      detail: 'Trust score not available for this item.',
      tier: 'unknown',
    };
  }
  if (t >= 90) {
    return {
      short: 'Official',
      label: 'Official-grade source',
      detail: 'Highest-confidence publisher tier — primary releases and official channels.',
      tier: 'official',
    };
  }
  if (t >= 84) {
    return {
      short: 'Institutional',
      label: 'Institutional feed',
      detail: 'Established newswire or agency-grade distribution.',
      tier: 'institutional',
    };
  }
  if (t >= 78) {
    return {
      short: 'Authority',
      label: 'Public authority',
      detail: 'Government, regulator, or multilateral body statement.',
      tier: 'authority',
    };
  }
  if (t >= 68) {
    return {
      short: 'Corroborated',
      label: 'Corroborated signal',
      detail: 'Cross-checked against other items on the grid where available.',
      tier: 'corroborated',
    };
  }
  return {
    short: 'Public',
    label: 'Open publication',
    detail: 'Open web or secondary reporting — read in context with severity and corroboration.',
    tier: 'public',
  };
}

/** Same metric as backend `rank_score`; user-facing name is Intensity. */
export function intensityHint() {
  return 'Intensity (0–100): blends severity, freshness, and source confidence. Higher = more important right now.';
}

export function salienceHint() {
  return intensityHint();
}

/** Tooltip copy for the scoring info control (tape). */
export function intensityHowItWorksTooltip() {
  return 'Intensity reflects how important a development is right now, combining:\n• Severity of event\n• Freshness (recency)\n• Source reliability\n• Cross-source confirmation';
}

/** 0–100 rank score → visual band for row accent (not severity). */
export function intensityVisualBand(rankScore) {
  const n = Number(rankScore);
  if (!Number.isFinite(n)) return 'none';
  if (n >= 85) return 'peak';
  if (n >= 65) return 'high';
  if (n >= 40) return 'mid';
  return 'low';
}

/**
 * Regional heat index from digest (aggregated severity×weight).
 * Bands: 0–79 LOW, 80–139 MEDIUM, 140+ HIGH
 */
export function regionalHeatBand(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return { label: '—', band: 'unknown', title: '' };
  if (s >= 140) return { label: 'HIGH', band: 'high', title: `Heat index ${Math.round(s)}` };
  if (s >= 80) return { label: 'MEDIUM', band: 'medium', title: `Heat index ${Math.round(s)}` };
  return { label: 'LOW', band: 'low', title: `Heat index ${Math.round(s)}` };
}

/** Global tension score is capped ~0–100; keep separate scale from regional heat sums. */
export function gridTensionBand(score) {
  const s = Number(score);
  if (!Number.isFinite(s)) return { label: '—', band: 'unknown' };
  if (s >= 70) return { label: 'HIGH', band: 'high' };
  if (s >= 40) return { label: 'MODERATE', band: 'moderate' };
  return { label: 'LOW', band: 'low' };
}

/**
 * Activity level for market-watch flow scores: quartiles within the current watchlist batch.
 * If all values are nearly identical, uses absolute score thresholds instead.
 */
export function marketActivityLevels(items) {
  const list = (items || []).filter((x) => x && x.symbol != null);
  const scores = list.map((x) => Number(x.flowScore)).filter((n) => Number.isFinite(n));
  const out = new Map();
  if (!scores.length) return out;

  const sorted = [...scores].sort((a, b) => a - b);
  const spread = sorted[sorted.length - 1] - sorted[0];

  const labelFromPercentile = (p) => {
    if (p >= 0.75) return 'EXTREME';
    if (p >= 0.5) return 'HIGH';
    if (p >= 0.25) return 'MODERATE';
    return 'LOW';
  };

  const labelForScore = (s) => {
    if (spread < 4) {
      const max = sorted[sorted.length - 1];
      if (max >= 400) return 'EXTREME';
      if (max >= 200) return 'HIGH';
      if (max >= 80) return 'MODERATE';
      return 'LOW';
    }
    const below = sorted.filter((v) => v < s).length;
    const equal = sorted.filter((v) => v === s).length;
    const p = (below + equal * 0.5) / sorted.length;
    return labelFromPercentile(p);
  };

  const bandClass = (label) => {
    if (label === 'EXTREME') return 'extreme';
    if (label === 'HIGH') return 'high';
    if (label === 'MODERATE') return 'moderate';
    return 'low';
  };

  for (const x of list) {
    const s = Number(x.flowScore);
    const label = Number.isFinite(s) ? labelForScore(s) : 'LOW';
    out.set(x.symbol, {
      label,
      band: bandClass(label),
      title: `Tape attention score ${Number.isFinite(s) ? Math.round(s) : '—'} · activity vs current watchlist`,
    });
  }
  return out;
}

export function verificationPresentation(state) {
  const raw = String(state || '').trim();
  if (!raw) return '—';
  const s = raw.toLowerCase().replace(/\s+/g, '_');
  if (s.includes('verified') && !s.includes('un')) return 'Verified';
  if (s.includes('partial')) return 'Partially verified';
  if (s.includes('unverified') || s === 'unverified') return 'Unverified';
  if (s.includes('disputed')) return 'Disputed';
  return raw.replace(/_/g, ' ');
}

export function formatIsoDisplayFriendly(iso) {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
