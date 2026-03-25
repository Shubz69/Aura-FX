/**
 * Parse economic calendar figure strings (%, K/M/B suffixes, ranges) for beat/miss coloring.
 */

const INVERT_KEYWORDS = [
  'unemployment',
  'jobless',
  'claims',
  'layoff',
  'layoffs',
  'job cut',
  'continuing jobless',
  'initial jobless',
  'underemployment',
];

function nearlyEqual(a, b) {
  const scale = 1 + Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 1e-9 + 1e-7 * scale;
}

function parseSingleNumber(raw) {
  let s = String(raw).trim().replace(/\s+/g, '');
  if (!s || s === '—' || s === '--') return null;
  s = s.replace(/^[(]|[)]$/g, '');

  const hasPct = s.includes('%');
  s = s.replace(/%/g, '');

  let mult = 1;
  const last = s.slice(-1).toUpperCase();
  if (last === 'B' && /[0-9]B$/i.test(s)) {
    mult = 1e9;
    s = s.slice(0, -1);
  } else if (last === 'M' && /[0-9]M$/i.test(s)) {
    mult = 1e6;
    s = s.slice(0, -1);
  } else if (last === 'K' && /[0-9]K$/i.test(s)) {
    mult = 1e3;
    s = s.slice(0, -1);
  }

  s = s.replace(/,/g, '');
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return hasPct ? n : n * mult;
}

/**
 * @param {string|null|undefined} str
 * @returns {number|null}
 */
export function parseEconomicFigure(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s || s === '—' || s === '--' || /^n\/?a$/i.test(s)) return null;

  const rangeSep = /\s*[-–]\s*/;
  if (rangeSep.test(s)) {
    const parts = s.split(rangeSep).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const a = parseSingleNumber(parts[0]);
      const b = parseSingleNumber(parts[1]);
      if (a != null && b != null) return (a + b) / 2;
    }
  }

  return parseSingleNumber(s);
}

/**
 * @param {string|null|undefined} actual
 * @param {string|null|undefined} forecast
 * @param {string} [eventTitle='']
 * @returns {'beat'|'miss'|'flat'|'unknown'}
 */
export function getActualVsForecastTone(actual, forecast, eventTitle = '') {
  const a = parseEconomicFigure(actual);
  const f = parseEconomicFigure(forecast);
  if (a == null || f == null) return 'unknown';
  if (nearlyEqual(a, f)) return 'flat';

  let diff = a - f;
  const title = String(eventTitle).toLowerCase();
  const invert = INVERT_KEYWORDS.some((kw) => title.includes(kw));
  if (invert) diff = -diff;

  if (diff > 0) return 'beat';
  if (diff < 0) return 'miss';
  return 'flat';
}
