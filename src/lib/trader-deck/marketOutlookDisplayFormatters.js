import { sessionStateDisplayLabel } from '../../data/marketIntelligence';

export function formatSessionStateLabel(stateKey) {
  return sessionStateDisplayLabel(stateKey);
}

/** Relative freshness from ISO timestamp (client clock). */
export function formatRelativeFreshness(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diffMs = Date.now() - t;
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return 'Updated just now';
  if (m < 60) return `Updated ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `Updated ${h}h ago`;
  return `Updated ${iso.slice(0, 10)}`;
}

export function currentSessionShortLabel(key) {
  const k = String(key || '').toLowerCase();
  const map = {
    asia: 'Asia',
    london: 'London',
    new_york: 'New York',
    overlap: 'Overlap',
    closed: 'Closed',
  };
  return map[k] || (k ? k.replace(/_/g, ' ') : '');
}
