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

const CACHE_KEY = 'trader-deck:economic-calendar:v4';
const CACHE_TTL_MS = 60 * 1000; // 60 s — short enough to catch actuals quickly

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
  };
  const lower = raw.toLowerCase();
  return map[lower] || raw.toUpperCase().slice(0, 3);
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
          const evDate = new Date(ev.date);
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

          allEvents.push({
            date: dateStr,
            time: timeStr,
            timestamp: evDate.getTime(), // UTC ms — used by frontend for precision scheduling
            currency: ev.country,
            impact: normImpact(ev.impact),
            event: ev.title,
            actual: ev.actual || null,
            forecast: ev.forecast || null,
            previous: ev.previous || null,
            source: 'ForexFactory',
          });
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
    return raw.slice(0, 80).map((e) => ({
      date: (e.date || '').slice(0, 10),
      time: e.date ? new Date(e.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'All Day',
      currency: normCountry(e.country || e.currency || ''),
      impact: normImpact(e.importance || e.impact),
      event: e.name || e.event || 'Economic Event',
      actual: e.actual != null ? String(e.actual) : null,
      forecast: e.forecast != null ? String(e.forecast) : null,
      previous: e.previous != null ? String(e.previous) : null,
      source: 'FMP',
    }));
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
    return raw.slice(0, 80).map((e) => ({
      date: (e.Date || '').slice(0, 10),
      time: e.Date ? new Date(e.Date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : 'All Day',
      currency: normCountry(e.Country || e.Currency || ''),
      impact: normImpact(e.Importance),
      event: e.Event || e.Category || 'Economic Event',
      actual: e.Actual != null ? String(e.Actual) : null,
      forecast: e.Forecast != null ? String(e.Forecast) : null,
      previous: e.Previous != null ? String(e.Previous) : null,
      source: 'TradingEconomics',
    }));
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
  ];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  // ?refresh=1 bypasses cache — used by frontend for precision fetches at event release time
  const forceRefresh = req.query.refresh === '1';
  const cached = forceRefresh ? null : getCached(CACHE_KEY, CACHE_TTL_MS);
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

  // Sort by date + time
  events.sort((a, b) => {
    const da = (a.date || '') + (a.time || '');
    const db = (b.date || '') + (b.time || '');
    return da.localeCompare(db);
  });

  const payload = { events, source, days, updatedAt: new Date().toISOString() };
  setCached(CACHE_KEY, payload, CACHE_TTL_MS);

  return res.status(200).json({ success: true, ...payload, cached: false });
};
