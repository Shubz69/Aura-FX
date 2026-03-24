require('../utils/suppress-warnings');
/**
 * GET /api/trader-deck/economic-calendar
 * Returns economic calendar events for the next 7 days.
 * Priority chain:
 *   1. Forex Factory (HTML scrape — free, no key)
 *   2. FMP /stable/economic-calendar (requires FMP_API_KEY)
 *   3. Trading Economics (requires TRADING_ECONOMICS_API_KEY)
 *   4. Static fallback payload
 * Cached 15 minutes server-side.
 */

const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { getCached, setCached } = require('../cache');

const CACHE_KEY = 'trader-deck:economic-calendar:v5';
const CACHE_TTL_MS = 45 * 1000; // 45 s — fresher calendar for release times

const IMPACT_COLORS = { High: 'high', Medium: 'medium', Low: 'low' };

// --- Normalise helpers ---
function normImpact(raw) {
  if (!raw) return 'low';
  const s = String(raw).toLowerCase();
  if (s.includes('high') || s === '3' || s === '1') return 'high';
  if (s.includes('medium') || s.includes('moderate') || s === '2') return 'medium';
  return 'low';
}

function normCountry(raw) {
  if (!raw) return '';
  const map = {
    'united states': 'USD', 'euro area': 'EUR', 'eurozone': 'EUR',
    'united kingdom': 'GBP', 'japan': 'JPY', 'canada': 'CAD',
    'australia': 'AUD', 'new zealand': 'NZD', 'switzerland': 'CHF',
    'china': 'CNH', 'germany': 'EUR',
    // Forex Factory / short codes (ISO-3166 → reporting currency)
    us: 'USD', eu: 'EUR', gb: 'GBP', uk: 'GBP', jp: 'JPY', ca: 'CAD',
    au: 'AUD', nz: 'NZD', ch: 'CHF', cn: 'CNH',
  };
  const lower = raw.toLowerCase();
  return map[lower] || raw.toUpperCase().slice(0, 3);
}

function parseNaiveDateTimeParts(raw) {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] || 0),
    minute: Number(m[5] || 0),
    second: Number(m[6] || 0),
  };
}

function getOffsetMsForTimeZone(timestampMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(timestampMs));
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - timestampMs;
}

function zonedDateTimeToUtcTimestamp(parts, timeZone) {
  const naiveUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let ts = naiveUtc;
  // Iterate to handle DST boundaries accurately.
  for (let i = 0; i < 2; i += 1) {
    const offset = getOffsetMsForTimeZone(ts, timeZone);
    ts = naiveUtc - offset;
  }
  return ts;
}

function parseDateToTimestamp(rawDate, options = {}) {
  const defaultTimeZone = options.defaultTimeZone || 'UTC';
  if (!rawDate) return null;
  const raw = String(rawDate).trim();
  if (!raw) return null;
  let parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;

  // Handle timezone offsets without colon (e.g. -0400)
  const tzFixed = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  parsed = Date.parse(tzFixed);
  if (!Number.isNaN(parsed)) return parsed;

  // Handle naive provider datetime strings in the expected provider timezone.
  const naive = parseNaiveDateTimeParts(raw.replace('T', ' '));
  if (naive) {
    return zonedDateTimeToUtcTimestamp(naive, defaultTimeZone);
  }
  return null;
}

function normalizeValue(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normalizeEventShape(input, fallbackSource = 'fallback') {
  const ts = parseDateToTimestamp(input.timestamp ?? input.ts ?? input.datetime ?? input.date, {
    defaultTimeZone: input.sourceTimeZone || 'America/New_York',
  });
  const date = input.date ? String(input.date).slice(0, 10) : (ts ? new Date(ts).toISOString().slice(0, 10) : null);
  return {
    date,
    time: input.time || 'All Day',
    timestamp: ts,
    currency: normCountry(input.currency || ''),
    impact: normImpact(input.impact),
    event: input.event || 'Economic Event',
    // preserve numeric zero; empty string becomes null
    actual: normalizeValue(input.actual ?? input.Actual ?? input.value),
    forecast: normalizeValue(input.forecast ?? input.Forecast ?? input.estimate),
    previous: normalizeValue(input.previous ?? input.Previous ?? input.prior),
    source: input.source || fallbackSource,
  };
}

function parseClockLabelToMinutes(timeLabel) {
  const raw = String(timeLabel || '').trim();
  if (!raw || /^all day$/i.test(raw)) return Number.MAX_SAFE_INTEGER;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return Number.MAX_SAFE_INTEGER - 1;
  let h = Number(m[1]) % 12;
  const minute = Number(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM') h += 12;
  return h * 60 + minute;
}

function compareEvents(a, b) {
  const ta = Number(a.timestamp);
  const tb = Number(b.timestamp);
  const hasTa = Number.isFinite(ta) && ta > 0;
  const hasTb = Number.isFinite(tb) && tb > 0;
  if (hasTa && hasTb) return ta - tb;
  if (hasTa) return -1;
  if (hasTb) return 1;

  const da = String(a.date || '');
  const db = String(b.date || '');
  if (da !== db) return da.localeCompare(db);

  const ma = parseClockLabelToMinutes(a.time);
  const mb = parseClockLabelToMinutes(b.time);
  if (ma !== mb) return ma - mb;
  return String(a.event || '').localeCompare(String(b.event || ''));
}

function resolveViewerTimeZone(req) {
  const raw = req?.headers?.['x-vercel-ip-timezone'];
  const tz = raw ? String(raw).trim() : '';
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch (_) {
    return 'UTC';
  }
}

// --- Provider 1: Forex Factory JSON CDN (official FF data feed, no API key needed) ---
async function fromForexFactory(days = 7) {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 86400 * 1000);
    const allEvents = [];

    // FF publishes this-week and next-week JSON feeds via their CDN
    const feeds = [
      'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
      'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
    ];

    for (const feedUrl of feeds) {
      try {
        const res = await fetchWithTimeout(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AuraFX/1.0)',
            'Accept': 'application/json',
          },
        }, 10000);
        if (!res.ok) continue;

        const raw = await res.json();
        if (!Array.isArray(raw)) continue;

        // Today's date in ET (FF dates are expressed in ET)
        const etTodayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

        for (const ev of raw) {
          // ev.date is ISO with ET offset e.g. "2025-03-18T10:00:00-0400"
          const ts = parseDateToTimestamp(ev.date);
          if (!ts) continue;
          const evDate = new Date(ts);
          if (!ev.title || !ev.country) continue;
          if ((ev.impact || '').toLowerCase() === 'non-economic') continue;

          // Extract date/time from the raw string (ET — what traders expect)
          const rawDate = ev.date || '';
          const dateMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
          const dateStr = dateMatch ? dateMatch[1] : evDate.toISOString().slice(0, 10);

          // Include ALL of today's events (even past ones — needed to show actuals)
          // Skip events from previous days or beyond the cutoff
          if (dateStr < etTodayStr || evDate > cutoff) continue;

          const timeMatch = rawDate.match(/T(\d{2}):(\d{2})/);
          let timeStr = 'All Day';
          if (timeMatch) {
            const h24 = parseInt(timeMatch[1], 10);
            const min = timeMatch[2];
            const ampm = h24 >= 12 ? 'PM' : 'AM';
            const h12 = h24 % 12 || 12;
            timeStr = `${h12}:${min} ${ampm}`;
          }

          allEvents.push(normalizeEventShape({
            date: dateStr,
            time: timeStr,
            timestamp: ts, // UTC ms — used by frontend for precision scheduling
            currency: normCountry(ev.country) || String(ev.country || '').toUpperCase().slice(0, 3),
            impact: normImpact(ev.impact),
            event: ev.title,
            actual: ev.actual,
            forecast: ev.forecast,
            previous: ev.previous,
            source: 'ForexFactory',
          }, 'ForexFactory'));
        }
      } catch (_) {
        // Try next feed
      }
    }

    return allEvents.length > 0 ? allEvents : null;
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] FF JSON error:', e.message);
    return null;
  }
}

// --- Provider 2: FMP economic calendar ---
async function fromFMP(days = 7) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;
  try {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${apiKey}`;
    const res = await fetchWithTimeout(url, {}, 12000);
    if (!res.ok) return null;
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw
      .map((e) => normalizeEventShape({
      date: (e.date || '').slice(0, 10),
      time: e.date ? new Date(e.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'All Day',
      timestamp: parseDateToTimestamp(e.date, { defaultTimeZone: 'America/New_York' }),
      currency: normCountry(e.country || e.currency || ''),
      impact: normImpact(e.importance || e.impact),
      event: e.name || e.event || 'Economic Event',
      actual: e.actual,
      forecast: e.forecast,
      previous: e.previous,
      source: 'FMP',
      sourceTimeZone: 'America/New_York',
    }, 'FMP'))
      .sort(compareEvents)
      .slice(0, 80);
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] FMP error:', e.message);
    return null;
  }
}

// --- Provider 3: Trading Economics ---
async function fromTradingEconomics(days = 7) {
  const apiKey = process.env.TRADING_ECONOMICS_API_KEY;
  if (!apiKey) return null;
  try {
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const url = `https://api.tradingeconomics.com/calendar/country/all/${from}/${to}?c=${encodeURIComponent(apiKey)}&f=json`;
    const res = await fetchWithTimeout(url, {}, 10000);
    if (!res.ok) return null;
    const raw = await res.json();
    if (!Array.isArray(raw)) return null;
    return raw
      .map((e) => normalizeEventShape({
      date: (e.Date || '').slice(0, 10),
      time: e.Date ? new Date(e.Date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'All Day',
      timestamp: parseDateToTimestamp(e.Date, { defaultTimeZone: 'America/New_York' }),
      currency: normCountry(e.Country || e.Currency || ''),
      impact: normImpact(e.Importance),
      event: e.Event || e.Category || 'Economic Event',
      actual: e.Actual,
      forecast: e.Forecast,
      previous: e.Previous,
      source: 'TradingEconomics',
      sourceTimeZone: 'America/New_York',
    }, 'TradingEconomics'))
      .sort(compareEvents)
      .slice(0, 80);
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] TE error:', e.message);
    return null;
  }
}

// --- Static fallback ---
function staticFallback() {
  const today = new Date().toISOString().slice(0, 10);
  return [
    { date: today, time: '8:30 AM', currency: 'USD', impact: 'high', event: 'Non-Farm Payrolls', actual: null, forecast: null, previous: null, source: 'fallback' },
    { date: today, time: '8:30 AM', currency: 'USD', impact: 'high', event: 'CPI m/m', actual: null, forecast: null, previous: null, source: 'fallback' },
    { date: today, time: '10:00 AM', currency: 'USD', impact: 'medium', event: 'ISM Manufacturing PMI', actual: null, forecast: null, previous: null, source: 'fallback' },
    { date: today, time: 'All Day', currency: 'EUR', impact: 'high', event: 'ECB Interest Rate Decision', actual: null, forecast: null, previous: null, source: 'fallback' },
    { date: today, time: '7:00 AM', currency: 'GBP', impact: 'medium', event: 'UK GDP m/m', actual: null, forecast: null, previous: null, source: 'fallback' },
  ].map((ev) => normalizeEventShape(ev, 'fallback'));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const viewerTimeZone = resolveViewerTimeZone(req);
  const cacheKey = `${CACHE_KEY}:${viewerTimeZone}`;

  // ?refresh=1 bypasses cache — used by frontend for precision fetches at event release time
  const forceRefresh = req.query.refresh === '1';
  const cached = forceRefresh ? null : getCached(cacheKey, CACHE_TTL_MS);
  if (cached) return res.status(200).json({ success: true, ...cached, cached: true });

  const days = Math.min(14, Math.max(1, parseInt(req.query.days, 10) || 7));

  let events = null;
  let source = 'fallback';

  // Try providers in order
  events = await fromForexFactory(days);
  if (events && events.length > 0) { source = 'ForexFactory'; }
  else {
    events = await fromFMP(days);
    if (events && events.length > 0) { source = 'FMP'; }
    else {
      events = await fromTradingEconomics(days);
      if (events && events.length > 0) { source = 'TradingEconomics'; }
      else {
        events = staticFallback();
        source = 'fallback';
      }
    }
  }

  // Sort by UTC timestamp when available for stable ordering across providers.
  events.sort(compareEvents);

  const fetchedAt = new Date().toISOString();
  const payload = {
    events,
    source,
    days,
    viewerTimeZone,
    updatedAt: fetchedAt,
    fetchedAt,
    sourceUpdatedAt: fetchedAt,
  };
  setCached(cacheKey, payload, CACHE_TTL_MS);

  return res.status(200).json({ success: true, ...payload, cached: false });
};

module.exports._test = {
  parseDateToTimestamp,
  normalizeEventShape,
  resolveViewerTimeZone,
};
