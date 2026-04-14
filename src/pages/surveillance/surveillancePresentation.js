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

export function salienceHint() {
  return 'Salience (0–100) is how strongly the terminal surfaces this item on the live tape. It blends severity, corroboration, source quality, and freshness — similar scores mean comparable weighting, not identical risk.';
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
