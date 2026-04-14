/**
 * UI label for currency crosses. Storage, API keys, and DB use compact canonicals (e.g. EURUSD).
 * Matches server rule: 6-letter instruments that are FX/metals/crypto USD majors render as ABC/DEF.
 */

export function formatPairLabel(asset) {
  const raw = String(asset || '').toUpperCase();
  const s = raw.replace(/[^A-Z]/g, '');
  if (s.length === 6 && /^[A-Z]{6}$/.test(s)) {
    return `${s.slice(0, 3)}/${s.slice(3)}`;
  }
  if (/XAU/.test(s) || /BTC/.test(s)) {
    const base = s.replace(/USD$/, '');
    return base ? `${base}/USD` : raw || '—';
  }
  return raw || '—';
}
