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

const CACHE_KEY = 'trader-deck:economic-calendar:v2';
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 min — near-live actuals

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

// --- Provider 1: Forex Factory scrape ---
async function fromForexFactory(days = 7) {
  try {
    const events = [];
    const now = new Date();
    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }

    for (const date of dates.slice(0, 3)) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${y}${m}${day}`;
      const url = `https://www.forexfactory.com/calendar?day=${dateStr}`;

      try {
        const res = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
        }, 12000);
        if (!res.ok) continue;

        const html = await res.text();
        // Simple regex extraction (no cheerio needed on serverless)
        const rowRegex = /<tr[^>]*class="[^"]*calendar__row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
        let match;
        while ((match = rowRegex.exec(html)) !== null) {
          const row = match[1];
          const text = (s) => s.replace(/<[^>]+>/g, '').trim();
          const getCell = (cls) => {
            const m2 = new RegExp(`class="[^"]*${cls}[^"]*"[^>]*>(.*?)<\/td>`, 'is').exec(row);
            return m2 ? text(m2[1]) : '';
          };
          const impactM = /calendar__impact[^>]*title="([^"]+)"/.exec(row);
          const impact = impactM ? normImpact(impactM[1]) : 'low';
          const event = getCell('calendar__event');
          const currency = getCell('calendar__currency');
          const time = getCell('calendar__time');
          const actual = getCell('calendar__actual');
          const forecast = getCell('calendar__forecast');
          const previous = getCell('calendar__previous');
          if (event && currency) {
            events.push({
              date: `${y}-${m}-${day}`,
              time: time || 'All Day',
              currency,
              impact,
              event,
              actual: actual || null,
              forecast: forecast || null,
              previous: previous || null,
              source: 'ForexFactory',
            });
          }
        }
      } catch (_) {
        // Continue to next date
      }
    }
    return events.length > 0 ? events : null;
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] FF scrape error:', e.message);
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

  const cached = getCached(CACHE_KEY, CACHE_TTL_MS);
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
