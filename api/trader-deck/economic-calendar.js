require('../utils/suppress-warnings');
/**
 * GET /api/trader-deck/economic-calendar
 * Returns economic calendar events for the next N days (default 7), or a bounded range:
 *   ?date=YYYY-MM-DD  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD  (max 7 days, max ~1y lookback)
 * Range mode: FF HTML scrape per day + FMP/TE merge for prev/fcst/actual.
 * Priority chain:
 *   1. Forex Factory JSON (faireconomy CDN — schedule/titles; **no actuals in JSON**)
 *   2. Merge actuals from FMP + Trading Economics (matched by time ±MATCH_WINDOW, currency, title)
 *      Set FMP_API_KEY (and optionally TRADING_ECONOMICS_API_KEY) in production for reliable actuals.
 *   3. If still missing (post-release): Forex Factory **HTML** scrape per calendar day
 *   4. Else FMP-only / TE-only / static fallback
 * Cached ~45s server-side (bump CACHE_KEY when changing merge logic).
 *
 * Debug: set env DEBUG_TRADER_DECK_CALENDAR=1 to log ForexFactory ingest skip counts and feed errors.
 */

const cheerio = require('cheerio');
const { fetchWithTimeout } = require('./services/fetchWithTimeout');
const { getSeriesRange, SERIES_IDS } = require('./services/fredService');
const { getCached, setCached } = require('../cache');

const CACHE_KEY = 'trader-deck:economic-calendar:v8';
const CACHE_TTL_MS = 45 * 1000; // 45 s — fresher calendar for release times
const SCRAPE_DAY_CACHE_MS = 35 * 1000; // per-day HTML scrape (actuals) — short TTL
/** FF + FMP rows must align; naive API datetimes were parsed as UTC and missed by 4–5h — keep a generous window */
const MATCH_WINDOW_MS = 25 * 60 * 1000;

const IMPACT_COLORS = { High: 'high', Medium: 'medium', Low: 'low' };

// --- Normalise helpers ---
function pickFirstDefined(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
  return null;
}

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

/**
 * ISO strings with Z or ±offset are interpreted by Date.parse (correct).
 * Naive datetimes (no zone) are wall-clock in `defaultTimeZone` — Node treats naive ISO as UTC,
 * which breaks FMP-style "8:30" rows vs Forex Factory ET timestamps.
 */
function hasExplicitTimezoneOffset(raw) {
  const s = String(raw).trim();
  if (/Z$/i.test(s)) return true;
  return /[+-]\d{2}:?\d{2}$/.test(s);
}

function parseDateToTimestamp(rawDate, options = {}) {
  const defaultTimeZone = options.defaultTimeZone || 'UTC';
  if (rawDate == null || rawDate === '') return null;
  // normalizeEventShape passes through numeric ms from providers — Date.parse(string(ms)) is NaN
  if (typeof rawDate === 'number' && Number.isFinite(rawDate)) return rawDate;
  const raw = String(rawDate).trim();
  if (!raw) return null;

  if (hasExplicitTimezoneOffset(raw)) {
    let parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
    const tzFixed = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    parsed = Date.parse(tzFixed);
    if (!Number.isNaN(parsed)) return parsed;
    return null;
  }

  const naive = parseNaiveDateTimeParts(raw.replace('T', ' '));
  if (naive) {
    return zonedDateTimeToUtcTimestamp(naive, defaultTimeZone);
  }

  let parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return parsed;
  return null;
}

/** When timestamp is missing, derive from calendar date + AM/PM label in America/New_York (Forex Factory convention). */
function ensureEventTimestamp(ev) {
  const n = Number(ev && ev.timestamp);
  if (ev && Number.isFinite(n) && n > 0) return ev;
  const dateStr = ev && ev.date ? String(ev.date).slice(0, 10) : '';
  const timeLabel = ev && ev.time != null ? String(ev.time) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return ev;
  if (!timeLabel || /^all day$/i.test(timeLabel)) return ev;
  const parts = etDateAndTimeToParts(dateStr, timeLabel);
  if (!parts) return ev;
  const ts = zonedDateTimeToUtcTimestamp(parts, 'America/New_York');
  return { ...ev, timestamp: ts };
}

function etDateAndTimeToParts(dateStr, timeLabel) {
  const base = parseNaiveDateTimeParts(`${dateStr} 00:00:00`);
  if (!base) return null;
  const mins = parseAmPmTimeToMinutes(timeLabel);
  if (mins == null) return null;
  const hour = Math.floor(mins / 60);
  const minute = mins % 60;
  return {
    year: base.year,
    month: base.month,
    day: base.day,
    hour,
    minute,
    second: 0,
  };
}

function normalizeValue(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Strip lone dash / em-dash placeholders so merge + UI treat missing figures as null. */
function normalizeFigureField(v) {
  const n = normalizeValue(v);
  if (n == null) return null;
  const s = String(n).trim();
  if (s === '—' || s === '–' || s === '-' || s === '−') return null;
  if (/^n\/?a$/i.test(s)) return null;
  return n;
}

function normalizeEventShape(input, fallbackSource = 'fallback') {
  const inRaw = input && typeof input === 'object' ? input : {};
  const ts = parseDateToTimestamp(input.timestamp ?? input.ts ?? input.datetime ?? input.date, {
    defaultTimeZone: input.sourceTimeZone || 'America/New_York',
  });
  const date = input.date ? String(input.date).slice(0, 10) : (ts ? new Date(ts).toISOString().slice(0, 10) : null);
  const eventIdRaw = pickFirstDefined(
    input.providerEventId,
    input.eventId,
    input.calendarId,
    input.id,
    input.ticker,
    inRaw.CalendarId,
    inRaw.EventId,
    inRaw.Ticker,
  );
  return {
    date,
    time: input.time || 'All Day',
    timestamp: ts,
    providerEventId: eventIdRaw != null ? String(eventIdRaw) : null,
    title: input.event || 'Economic Event',
    country: normalizeValue(input.country || inRaw.Country || inRaw.country),
    currency: normCountry(input.currency || ''),
    impact: normImpact(input.impact),
    event: input.event || 'Economic Event',
    // preserve numeric zero; empty string becomes null; dash-only → null
    actual: normalizeFigureField(pickFirstDefined(input.actual, input.Actual, inRaw.ACTUAL, input.value)),
    forecast: normalizeFigureField(pickFirstDefined(input.forecast, input.Forecast, inRaw.Forecast, inRaw.TEForecast, input.estimate, inRaw.Consensus, inRaw.survey)),
    previous: normalizeFigureField(pickFirstDefined(input.previous, input.Previous, inRaw.PREVIOUS, input.prior)),
    revised: normalizeFigureField(pickFirstDefined(input.revised, inRaw.Revised, inRaw.REVISED)),
    unit: normalizeValue(pickFirstDefined(input.unit, inRaw.Unit, inRaw.unit)),
    source: input.source || fallbackSource,
    raw: inRaw,
  };
}

function formatFredValue(raw) {
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return n.toFixed(2).replace(/\.00$/, '');
}

function mapFredSeriesToEvents(seriesKey, observations, fromStr, toStr) {
  const configBySeries = {
    [SERIES_IDS.cpi]: {
      event: 'US CPI Index',
      impact: 'high',
      time: '08:30 AM',
      unit: 'index',
    },
    [SERIES_IDS.unemployment]: {
      event: 'US Unemployment Rate',
      impact: 'high',
      time: '08:30 AM',
      unit: '%',
    },
    [SERIES_IDS.treasury10y]: {
      event: 'US 10Y Treasury Yield',
      impact: 'medium',
      time: '04:00 PM',
      unit: '%',
    },
  };
  const cfg = configBySeries[seriesKey];
  if (!cfg || !Array.isArray(observations) || observations.length === 0) return [];

  let prev = null;
  const out = [];
  for (const row of observations) {
    const date = row && row.date ? String(row.date).slice(0, 10) : '';
    if (!date || date < fromStr || date > toStr) {
      if (row && row.value != null && row.value !== '') prev = row.value;
      continue;
    }
    const actual = formatFredValue(row.value);
    if (actual == null) continue;
    out.push(
      normalizeEventShape(
        {
          date,
          time: cfg.time,
          currency: 'USD',
          impact: cfg.impact,
          event: cfg.event,
          actual,
          previous: prev != null ? formatFredValue(prev) : null,
          forecast: null,
          source: 'FRED',
          sourceTimeZone: 'America/New_York',
          unit: cfg.unit,
        },
        'FRED',
      ),
    );
    prev = row.value;
  }
  return out;
}

async function fetchFredCalendarRange(fromStr, toStr) {
  const startBuffer = shiftIsoDate(fromStr, -40);
  const [cpi, unemployment, treasury] = await Promise.all([
    getSeriesRange(SERIES_IDS.cpi, { observationStart: startBuffer, observationEnd: toStr }),
    getSeriesRange(SERIES_IDS.unemployment, { observationStart: startBuffer, observationEnd: toStr }),
    getSeriesRange(SERIES_IDS.treasury10y, { observationStart: startBuffer, observationEnd: toStr }),
  ]);
  const all = []
    .concat(mapFredSeriesToEvents(SERIES_IDS.cpi, cpi.data, fromStr, toStr))
    .concat(mapFredSeriesToEvents(SERIES_IDS.unemployment, unemployment.data, fromStr, toStr))
    .concat(mapFredSeriesToEvents(SERIES_IDS.treasury10y, treasury.data, fromStr, toStr));
  if (all.length === 0) return null;
  return all.map(ensureEventTimestamp);
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
  if (hasTa && hasTb) {
    if (ta !== tb) return ta - tb;
    return String(a.event || '').localeCompare(String(b.event || ''));
  }
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

function isValidIanaTimeZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  const s = tz.trim();
  if (!s) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: s }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Prefer browser-reported IANA zone (X-Client-Timezone / ?tz=), then Vercel IP geolocation.
 */
function resolveViewerTimeZone(req) {
  const h = req?.headers || {};
  const fromHeader =
    h['x-client-timezone'] ||
    h['X-Client-Timezone'] ||
    h['X-CLIENT-TIMEZONE'];
  const q = req?.query?.tz;
  const fromQuery = q != null && String(q).trim() !== '' ? String(q).trim() : '';
  const clientFirst = fromQuery || (fromHeader ? String(fromHeader).trim() : '');
  if (isValidIanaTimeZone(clientFirst)) return clientFirst.trim();

  const raw = h['x-vercel-ip-timezone'] || h['X-Vercel-Ip-Timezone'];
  const tz = raw ? String(raw).trim() : '';
  if (isValidIanaTimeZone(tz)) return tz;
  return 'UTC';
}

function hasActualBackend(v) {
  return normalizeValue(v) != null;
}

function hasSupplementFigures(row) {
  if (!row) return false;
  return (
    hasActualBackend(row.actual) ||
    normalizeValue(row.forecast) != null ||
    normalizeValue(row.previous) != null
  );
}

function normTitle(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const A = normTitle(a);
  const B = normTitle(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const wordsA = new Set(A.split(' ').filter((w) => w.length > 2));
  const wordsB = B.split(' ').filter((w) => w.length > 2);
  if (wordsB.length === 0) return 0;
  let hit = 0;
  for (const w of wordsB) if (wordsA.has(w)) hit += 1;
  return hit / Math.max(wordsA.length, wordsB.length, 1);
}

/**
 * FF faireconomy JSON has no `actual` key at all — merge from FMP/TE by time + ccy + title.
 */
function mergeSupplementActuals(primary, supplement) {
  if (!Array.isArray(primary) || !Array.isArray(supplement) || supplement.length === 0) return primary;
  const used = new Set();
  return primary.map((ev) => {
    const evHasActual = hasActualBackend(ev.actual);
    const evHasForecast = normalizeValue(ev.forecast) != null;
    const evHasPrevious = normalizeValue(ev.previous) != null;
    if (evHasActual && evHasForecast && evHasPrevious) return ev;
    const ts = ev.timestamp;
    if (!ts) return ev;
    let best = null;
    let bestScore = -Infinity;
    supplement.forEach((sup, idx) => {
      if (used.has(idx)) return;
      if (sup.currency !== ev.currency) return;
      const st = sup.timestamp;
      if (!st) return;
      const delta = Math.abs(st - ts);
      if (delta > MATCH_WINDOW_MS) return;
      const sim = titleSimilarity(ev.event, sup.event);
      if (sim < 0.12 && delta > 5 * 60 * 1000) return;
      if (!hasSupplementFigures(sup)) return;
      const figureScore =
        (hasActualBackend(sup.actual) ? 120 : 0) +
        (normalizeValue(sup.forecast) != null ? 30 : 0) +
        (normalizeValue(sup.previous) != null ? 30 : 0);
      const score = sim * 1000 - delta / 10000 + figureScore;
      if (score > bestScore) {
        bestScore = score;
        best = { idx, sup };
      }
    });
    if (best && best.sup) {
      const merged = {
        ...ev,
        actual: evHasActual ? ev.actual : (hasActualBackend(best.sup.actual) ? best.sup.actual : ev.actual),
        forecast: evHasForecast ? ev.forecast : (normalizeValue(best.sup.forecast) != null ? best.sup.forecast : ev.forecast),
        previous: evHasPrevious ? ev.previous : (normalizeValue(best.sup.previous) != null ? best.sup.previous : ev.previous),
      };
      const changed =
        merged.actual !== ev.actual ||
        merged.forecast !== ev.forecast ||
        merged.previous !== ev.previous;
      if (changed) {
        used.add(best.idx);
        return merged;
      }
    }
    const candidates = [];
    supplement.forEach((sup, idx) => {
      if (used.has(idx)) return;
      if (sup.currency !== ev.currency) return;
      const st = sup.timestamp;
      if (!st) return;
      const delta = Math.abs(st - ts);
      if (delta > MATCH_WINDOW_MS) return;
      if (hasSupplementFigures(sup)) candidates.push({ idx, sup, delta });
    });
    candidates.sort((a, b) => a.delta - b.delta);
    if (candidates.length === 1) {
      const c = candidates[0];
      const merged = {
        ...ev,
        actual: evHasActual ? ev.actual : (hasActualBackend(c.sup.actual) ? c.sup.actual : ev.actual),
        forecast: evHasForecast ? ev.forecast : (normalizeValue(c.sup.forecast) != null ? c.sup.forecast : ev.forecast),
        previous: evHasPrevious ? ev.previous : (normalizeValue(c.sup.previous) != null ? c.sup.previous : ev.previous),
      };
      const changed =
        merged.actual !== ev.actual ||
        merged.forecast !== ev.forecast ||
        merged.previous !== ev.previous;
      if (changed) {
        used.add(c.idx);
        return merged;
      }
    }
    return ev;
  });
}

function etMinuteOfDay(ts) {
  try {
    const s = new Date(ts).toLocaleTimeString('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return parseAmPmTimeToMinutes(s);
  } catch (_) {
    return null;
  }
}

function parseAmPmTimeToMinutes(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function scrapeTimeToMinutes(timeStr) {
  const t = String(timeStr || '').trim().replace(/\s+/g, ' ');
  if (!t) return null;
  return parseAmPmTimeToMinutes(t);
}

function mergeScrapedHtml(rows, events, dateStr) {
  if (!rows || !rows.length) return events;
  return events.map((ev) => {
    if (hasActualBackend(ev.actual)) return ev;
    if (ev.date !== dateStr) return ev;
    const ts = ev.timestamp;
    const evMin = ts ? etMinuteOfDay(ts) : null;
    let best = null;
    let bestScore = -Infinity;
    for (const r of rows) {
      if (!r || !r.event) continue;
      const rowCcy = normCountry(r.currency);
      if (rowCcy !== ev.currency) continue;
      const rowMin = scrapeTimeToMinutes(r.time);
      const sim = titleSimilarity(ev.event, r.event);
      let score = sim * 100;
      if (evMin != null && rowMin != null) {
        const diff = Math.abs(evMin - rowMin);
        if (diff > 25) score -= 80;
        else score += 40 - diff;
      }
      if (score > bestScore) {
        bestScore = score;
        best = r;
      }
    }
    if (best && hasActualBackend(best.actual)) {
      return {
        ...ev,
        actual: best.actual,
        forecast: ev.forecast || best.forecast,
        previous: ev.previous || best.previous,
      };
    }
    return ev;
  });
}

async function scrapeForexFactoryHtmlDay(dateStr) {
  const cacheKey = `trader-deck:ff-scrape:${dateStr}`;
  const cached = getCached(cacheKey, SCRAPE_DAY_CACHE_MS);
  if (cached) return cached;

  const dayParam = dateStr.replace(/-/g, '');
  const url = `https://www.forexfactory.com/calendar?day=${dayParam}`;
  try {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      12000
    );
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const rows = [];
    $('.calendar__row').each((index, element) => {
      if (index === 0) return;
      const $row = $(element);
      const time = $row.find('.calendar__time').text().trim();
      const currency = normCountry($row.find('.calendar__currency').text().trim());
      const impactTitle = $row.find('.calendar__impact').attr('title') || '';
      const event = $row.find('.calendar__event').text().trim();
      const actual = $row.find('.calendar__actual').text().trim();
      const forecast = $row.find('.calendar__forecast').text().trim();
      const previous = $row.find('.calendar__previous').text().trim();
      if (!event) return;
      rows.push({
        time,
        currency: currency || '',
        impact: impactTitle.toLowerCase().includes('high')
          ? 'high'
          : impactTitle.toLowerCase().includes('medium')
            ? 'medium'
            : 'low',
        event,
        actual: actual || null,
        forecast: forecast || null,
        previous: previous || null,
      });
    });
    setCached(cacheKey, rows, SCRAPE_DAY_CACHE_MS);
    return rows;
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] FF HTML scrape error:', e.message);
    return [];
  }
}

async function enrichForexFactoryWithActuals(events, days, forceRefresh) {
  if (!events || events.length === 0) return events;
  const supplementDays = Math.min(14, Math.max(7, Number(days) || 7));
  const [fmp, te] = await Promise.all([
    fetchFmpSupplement(supplementDays),
    fetchTradingEconomicsSupplement(supplementDays),
  ]);
  let merged = mergeSupplementActuals(events, fmp || []);
  merged = mergeSupplementActuals(merged, te || []);

  const now = Date.now();
  const stillMissing = merged.some((ev) => {
    if (hasActualBackend(ev.actual)) return false;
    const ts = ev.timestamp;
    // Past release by ~15s — CDN JSON never has actual; try FMP/TE first, then HTML
    return ts && ts < now - 15000 && now - ts < 7 * 24 * 60 * 60 * 1000;
  });
  if (!stillMissing && !forceRefresh) return merged;

  const dates = new Set();
  merged.forEach((ev) => {
    if (hasActualBackend(ev.actual)) return;
    const ts = ev.timestamp;
    if (!ts || ts > now) return;
    if (ev.date) dates.add(ev.date);
  });
  const list = [...dates].sort().slice(0, 5);
  let out = merged;
  for (const d of list) {
    const rows = await scrapeForexFactoryHtmlDay(d);
    out = mergeScrapedHtml(rows, out, d);
  }
  return out;
}

// --- Provider 1: Forex Factory JSON CDN (official FF data feed, no API key needed) ---
async function fromForexFactory(days = 7) {
  const debugIngest = process.env.DEBUG_TRADER_DECK_CALENDAR === '1';
  const ingestStats = {
    feedsAttempted: 0,
    feedsHttpFail: 0,
    feedsNotArray: 0,
    skipNoTimestamp: 0,
    skipNoTitleOrCountry: 0,
    skipNonEconomic: 0,
    skipDateWindow: 0,
    accepted: 0,
  };
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
      ingestStats.feedsAttempted += 1;
      try {
        const res = await fetchWithTimeout(feedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; AuraFX/1.0)',
            'Accept': 'application/json',
          },
        }, 10000);
        if (!res.ok) {
          ingestStats.feedsHttpFail += 1;
          if (debugIngest) {
            console.debug('[trader-deck/economic-calendar] FF feed HTTP', res.status, feedUrl);
          }
          continue;
        }

        const raw = await res.json();
        if (!Array.isArray(raw)) {
          ingestStats.feedsNotArray += 1;
          continue;
        }

        // Today's date in ET (FF dates are expressed in ET)
        const etTodayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

        for (const ev of raw) {
          // ev.date is ISO with ET offset e.g. "2025-03-18T10:00:00-0400"
          const ts = parseDateToTimestamp(ev.date);
          if (!ts) {
            ingestStats.skipNoTimestamp += 1;
            continue;
          }
          const evDate = new Date(ts);
          if (!ev.title || !ev.country) {
            ingestStats.skipNoTitleOrCountry += 1;
            continue;
          }
          if ((ev.impact || '').toLowerCase() === 'non-economic') {
            ingestStats.skipNonEconomic += 1;
            continue;
          }

          // Extract date/time from the raw string (ET — what traders expect)
          const rawDate = ev.date || '';
          const dateMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
          const dateStr = dateMatch ? dateMatch[1] : evDate.toISOString().slice(0, 10);

          // Include ALL of today's events (even past ones — needed to show actuals)
          // Skip events from previous days or beyond the cutoff
          if (dateStr < etTodayStr || evDate > cutoff) {
            ingestStats.skipDateWindow += 1;
            continue;
          }

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
          ingestStats.accepted += 1;
        }
      } catch (err) {
        if (debugIngest) {
          console.debug('[trader-deck/economic-calendar] FF feed error', feedUrl, err && err.message);
        }
        // Try next feed
      }
    }

    if (debugIngest) {
      console.debug('[trader-deck/economic-calendar] fromForexFactory ingest', ingestStats, 'totalEvents', allEvents.length);
    }

    return allEvents.length > 0 ? allEvents : null;
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] FF JSON error:', e.message);
    return null;
  }
}

// --- Provider 2: FMP economic calendar ---
async function fetchFmpSupplement(days = 7) {
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
      .sort(compareEvents);
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] FMP error:', e.message);
    return null;
  }
}

async function fromFMP(days = 7) {
  const list = await fetchFmpSupplement(days);
  if (!list) return null;
  return list.slice(0, 80);
}

// --- Provider 3: Trading Economics ---
async function fetchTradingEconomicsSupplement(days = 7) {
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
        timestamp: parseDateToTimestamp(e.Date, { defaultTimeZone: 'UTC' }),
        currency: normCountry(e.Country || e.Currency || ''),
        impact: normImpact(e.Importance),
        event: e.Event || e.Category || 'Economic Event',
        actual: e.Actual,
        forecast: e.Forecast,
        previous: e.Previous,
        source: 'TradingEconomics',
        sourceTimeZone: 'UTC',
      }, 'TradingEconomics'))
      .sort(compareEvents);
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] TE error:', e.message);
    return null;
  }
}

async function fromTradingEconomics(days = 7) {
  const list = await fetchTradingEconomicsSupplement(days);
  if (!list) return null;
  return list.slice(0, 80);
}

// --- Static fallback ---
function staticFallback() {
  const today = new Date().toISOString().slice(0, 10);
  const withEtTime = (time, rest) => {
    const parts = etDateAndTimeToParts(today, time);
    const ts = parts ? zonedDateTimeToUtcTimestamp(parts, 'America/New_York') : null;
    return normalizeEventShape({ date: today, time, timestamp: ts, ...rest }, 'fallback');
  };
  return [
    withEtTime('8:30 AM', { currency: 'USD', impact: 'high', event: 'Non-Farm Payrolls', actual: null, forecast: null, previous: null, source: 'fallback' }),
    withEtTime('8:30 AM', { currency: 'USD', impact: 'high', event: 'CPI m/m', actual: null, forecast: null, previous: null, source: 'fallback' }),
    withEtTime('10:00 AM', { currency: 'USD', impact: 'medium', event: 'ISM Manufacturing PMI', actual: null, forecast: null, previous: null, source: 'fallback' }),
    normalizeEventShape({ date: today, time: 'All Day', currency: 'EUR', impact: 'high', event: 'ECB Interest Rate Decision', actual: null, forecast: null, previous: null, source: 'fallback' }, 'fallback'),
    withEtTime('7:00 AM', { currency: 'GBP', impact: 'medium', event: 'UK GDP m/m', actual: null, forecast: null, previous: null, source: 'fallback' }),
  ];
}

async function scrapeForwardDays(days = 7) {
  const dayCount = Math.max(1, Math.min(14, Number(days) || 7));
  const all = [];
  for (let i = 0; i < dayCount; i += 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + i);
    const day = d.toISOString().slice(0, 10);
    const rows = await scrapeForexFactoryHtmlDay(day);
    const events = scrapeRowsToEvents(day, rows);
    all.push(...events);
  }
  all.sort(compareEvents);
  return all;
}

// --- Explicit date range (historical / single-day browse) ---
const RANGE_MAX_DAYS = 366;
const RANGE_MAX_LOOKBACK_MS = 366 * 24 * 60 * 60 * 1000;
const HISTORICAL_RANGE_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4h — past actuals are stable
const DEFAULT_RANGE_PAST_DAYS = 7;
const DEFAULT_RANGE_FUTURE_DAYS = 14;

const ISO_DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDateOnly(s) {
  if (!s || !ISO_DATE_ONLY_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function enumerateInclusiveDays(fromStr, toStr) {
  const out = [];
  let cur = fromStr;
  while (cur <= toStr) {
    out.push(cur);
    const next = new Date(`${cur}T12:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cur = next.toISOString().slice(0, 10);
  }
  return out;
}

function calendarEtTodayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * @param {Record<string, unknown>} query
 * @returns {null | { error: string } | { from: string, to: string }}
 */
function parseCalendarRangeQuery(query) {
  const q = query || {};
  const parseBool = (v) => {
    if (v == null) return null;
    const s = String(v).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'off'].includes(s)) return false;
    return null;
  };
  const includePast = parseBool(q.includePast);
  const includeFuture = parseBool(q.includeFuture);
  let from =
    q.from != null && String(q.from).trim() !== '' ? String(q.from).trim().slice(0, 10) : null;
  let to = q.to != null && String(q.to).trim() !== '' ? String(q.to).trim().slice(0, 10) : null;
  if (q.startDate != null && String(q.startDate).trim() !== '') from = String(q.startDate).trim().slice(0, 10);
  if (q.endDate != null && String(q.endDate).trim() !== '') to = String(q.endDate).trim().slice(0, 10);
  if (q.date != null && String(q.date).trim() !== '') {
    const d = String(q.date).trim().slice(0, 10);
    from = d;
    to = d;
  }
  if (from == null && to == null) {
    const dayStr = calendarEtTodayStr();
    if (q.days != null && String(q.days).trim() !== '') {
      return null;
    }
    if (includePast === false && includeFuture === false) return { error: 'At least one of includePast/includeFuture must be true' };
    const start = includePast === false ? dayStr : enumerateInclusiveDays(shiftIsoDate(dayStr, -DEFAULT_RANGE_PAST_DAYS), dayStr)[0];
    const end = includeFuture === false ? dayStr : shiftIsoDate(dayStr, DEFAULT_RANGE_FUTURE_DAYS);
    from = start;
    to = end;
  }
  if (from == null || to == null) {
    return { error: 'Use date=YYYY-MM-DD or both from/to (or startDate/endDate)' };
  }
  if (!isValidIsoDateOnly(from) || !isValidIsoDateOnly(to)) {
    return { error: 'Invalid date (use YYYY-MM-DD)' };
  }
  if (from > to) {
    const t = from;
    from = to;
    to = t;
  }
  const days = enumerateInclusiveDays(from, to);
  if (days.length > RANGE_MAX_DAYS) {
    return { error: `Range max ${RANGE_MAX_DAYS} days` };
  }
  const fromMs = new Date(`${from}T00:00:00.000Z`).getTime();
  if (Date.now() - fromMs > RANGE_MAX_LOOKBACK_MS) {
    return { error: 'from date too far in the past (max ~1 year)' };
  }
  return { from, to };
}

function normalizeScrapedTimeForEtParts(timeRaw) {
  const raw = String(timeRaw || '').trim().replace(/\s+/g, ' ');
  if (!raw || /^all\s*day$/i.test(raw)) return 'All Day';
  const compact = raw.replace(/\s/g, '');
  const m = compact.match(/^(\d{1,2}):(\d{2})(am|pm)$/i);
  if (m) {
    return `${m[1]}:${m[2]} ${m[3].toUpperCase()}`;
  }
  const m2 = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m2) return `${m2[1]}:${m2[2]} ${m2[3].toUpperCase()}`;
  return raw;
}

function shiftIsoDate(isoDate, deltaDays) {
  const d = new Date(`${String(isoDate).slice(0, 10)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + Number(deltaDays || 0));
  return d.toISOString().slice(0, 10);
}

function parseCsvParam(v) {
  if (v == null) return [];
  const inArr = Array.isArray(v) ? v : String(v).split(',');
  return inArr
    .map((x) => String(x || '').trim())
    .filter(Boolean);
}

function statusFromEvent(ev) {
  const now = Date.now();
  if (normalizeValue(ev.actual) != null) return 'released';
  const ts = Number(ev.timestamp);
  if (!Number.isFinite(ts) || ts <= 0) {
    const timeText = String(ev.time || '').toLowerCase();
    if (!timeText || timeText.includes('all day') || timeText.includes('tentative')) return 'tentative';
    return 'unknown';
  }
  const maybeLive = normalizeValue(ev.raw?.Status || ev.raw?.status || ev.raw?.state);
  if (maybeLive && /live|ongoing|in\s*progress|inprogress/i.test(String(maybeLive))) return 'live';
  if (String(ev.time || '').toLowerCase().includes('tentative')) return 'tentative';
  if (ts > now) return 'upcoming';
  if (Math.abs(now - ts) <= 3 * 60 * 1000) return 'live';
  return 'unknown';
}

function dedupeEconomicEvents(events) {
  const map = new Map();
  for (const ev of events || []) {
    if (!ev) continue;
    const providerKey = ev.providerEventId ? `p:${String(ev.providerEventId)}` : null;
    const fallbackKey = [
      String(ev.event || ev.title || '').toLowerCase().trim(),
      String(ev.currency || '').toUpperCase().trim(),
      Number.isFinite(Number(ev.timestamp)) ? String(Number(ev.timestamp)) : '',
      String(ev.country || '').toUpperCase().trim(),
    ].join('|');
    const key = providerKey || `f:${fallbackKey}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, ev);
      continue;
    }
    const prevScore =
      (normalizeValue(prev.actual) != null ? 8 : 0) +
      (normalizeValue(prev.forecast) != null ? 3 : 0) +
      (normalizeValue(prev.previous) != null ? 3 : 0) +
      (normalizeValue(prev.revised) != null ? 2 : 0);
    const curScore =
      (normalizeValue(ev.actual) != null ? 8 : 0) +
      (normalizeValue(ev.forecast) != null ? 3 : 0) +
      (normalizeValue(ev.previous) != null ? 3 : 0) +
      (normalizeValue(ev.revised) != null ? 2 : 0);
    map.set(key, curScore > prevScore ? ev : prev);
  }
  return [...map.values()];
}

function normalizeCalendarPayloadRows(events, viewerTimeZone) {
  return (events || []).map((ev) => {
    const ts = Number(ev.timestamp);
    const hasTs = Number.isFinite(ts) && ts > 0;
    const datetimeUtc = hasTs ? new Date(ts).toISOString() : null;
    let datetimeLocal = datetimeUtc;
    if (hasTs && viewerTimeZone) {
      try {
        datetimeLocal = new Date(ts).toLocaleString('sv-SE', { timeZone: viewerTimeZone }).replace(' ', 'T');
      } catch (_) {
        datetimeLocal = datetimeUtc;
      }
    }
    const fallbackId = [
      String(ev.providerEventId || ''),
      String(ev.event || ''),
      String(ev.currency || ''),
      String(ts || ''),
      String(ev.country || ''),
    ].join('|');
    return {
      ...ev,
      id: ev.id || ev.providerEventId || fallbackId,
      providerEventId: ev.providerEventId || null,
      title: ev.title || ev.event || 'Economic Event',
      country: ev.country || null,
      currency: ev.currency || null,
      impact: ev.impact || null,
      datetimeUtc,
      datetimeLocal,
      status: statusFromEvent(ev),
      actual: ev.actual,
      forecast: ev.forecast,
      previous: ev.previous,
      revised: ev.revised ?? null,
      unit: ev.unit ?? null,
      source: ev.source || null,
      raw: ev.raw || null,
    };
  });
}

function applyQueryFilters(events, query) {
  const currencies = new Set(parseCsvParam(query?.currencies).map((s) => s.toUpperCase()));
  const countries = new Set(parseCsvParam(query?.countries).map((s) => s.toUpperCase()));
  const impacts = new Set(parseCsvParam(query?.impact).map((s) => normImpact(s)));
  let out = events || [];
  if (currencies.size > 0) out = out.filter((ev) => currencies.has(String(ev.currency || '').toUpperCase()));
  if (countries.size > 0) out = out.filter((ev) => countries.has(String(ev.country || '').toUpperCase()));
  if (impacts.size > 0) out = out.filter((ev) => impacts.has(normImpact(ev.impact)));
  return out;
}

function scrapeRowsToEvents(dateStr, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const out = [];
  for (const r of rows) {
    if (!r || !r.event) continue;
    const timeNorm = normalizeScrapedTimeForEtParts(r.time);
    out.push(
      normalizeEventShape(
        {
          date: dateStr,
          time: timeNorm,
          currency: r.currency || '',
          impact: r.impact || 'low',
          event: r.event,
          actual: r.actual,
          forecast: r.forecast,
          previous: r.previous,
          source: 'ForexFactoryHTML',
        },
        'ForexFactoryHTML',
      ),
    );
  }
  return out.map(ensureEventTimestamp);
}

async function fetchFmpCalendarRange(fromStr, toStr) {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://financialmodelingprep.com/stable/economic-calendar?from=${fromStr}&to=${toStr}&apikey=${apiKey}`;
    const res = await fetchWithTimeout(url, {}, 15000);
    if (!res.ok) return null;
    const raw = await res.json();
    if (!Array.isArray(raw) || raw.length === 0) return null;
    return raw
      .map((e) =>
        normalizeEventShape(
          {
            date: (e.date || '').slice(0, 10),
            time: e.date
              ? new Date(e.date).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })
              : 'All Day',
            timestamp: parseDateToTimestamp(e.date, { defaultTimeZone: 'America/New_York' }),
            currency: normCountry(e.country || e.currency || ''),
            impact: normImpact(e.importance || e.impact),
            event: e.name || e.event || 'Economic Event',
            actual: e.actual,
            forecast: e.forecast,
            previous: e.previous,
            source: 'FMP',
            sourceTimeZone: 'America/New_York',
          },
          'FMP',
        ),
      )
      .filter((ev) => ev.date && ev.date >= fromStr && ev.date <= toStr);
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] FMP range error:', e.message);
    return null;
  }
}

async function fetchTradingEconomicsCalendarRange(fromStr, toStr) {
  const apiKey = process.env.TRADING_ECONOMICS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://api.tradingeconomics.com/calendar/country/all/${fromStr}/${toStr}?c=${encodeURIComponent(apiKey)}&f=json`;
    const res = await fetchWithTimeout(url, {}, 12000);
    if (!res.ok) return null;
    const raw = await res.json();
    if (!Array.isArray(raw)) return null;
    return raw
      .map((e) =>
        normalizeEventShape(
          {
            date: (e.Date || '').slice(0, 10),
            time: e.Date
              ? new Date(e.Date).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                })
              : 'All Day',
            timestamp: parseDateToTimestamp(e.Date, { defaultTimeZone: 'UTC' }),
            currency: normCountry(e.Country || e.Currency || ''),
            impact: normImpact(e.Importance),
            event: e.Event || e.Category || 'Economic Event',
            actual: e.Actual,
            forecast: e.Forecast,
            previous: e.Previous,
            source: 'TradingEconomics',
            sourceTimeZone: 'UTC',
          },
          'TradingEconomics',
        ),
      )
      .filter((ev) => ev.date && ev.date >= fromStr && ev.date <= toStr);
  } catch (e) {
    console.warn('[trader-deck/economic-calendar] TE range error:', e.message);
    return null;
  }
}

async function fetchHistoricalRange(fromStr, toStr) {
  const dayList = enumerateInclusiveDays(fromStr, toStr);
  const etToday = calendarEtTodayStr();
  const ffDays = Math.max(1, Math.min(14, enumerateInclusiveDays(etToday, toStr >= etToday ? toStr : etToday).length));
  const ffRangeRowsRaw = await fromForexFactory(ffDays);
  const ffRangeRows = (Array.isArray(ffRangeRowsRaw) ? ffRangeRowsRaw : [])
    .map(ensureEventTimestamp)
    .filter((ev) => ev.date && ev.date >= fromStr && ev.date <= toStr);
  const allScraped = [];
  // Free-source mode must still populate larger windows (e.g. default -7/+14 = 22 days).
  // Keep this bounded to avoid excessive upstream load.
  if (dayList.length <= 31) {
    const CHUNK = 3;
    for (let i = 0; i < dayList.length; i += CHUNK) {
      const chunk = dayList.slice(i, i + CHUNK);
      const partial = await Promise.all(
        chunk.map(async (d) => {
          const rows = await scrapeForexFactoryHtmlDay(d);
          return scrapeRowsToEvents(d, rows);
        }),
      );
      partial.forEach((arr) => allScraped.push(...arr));
    }
  }

  let events = ffRangeRows.length > 0 ? ffRangeRows : allScraped;
  if (ffRangeRows.length > 0 && allScraped.length > 0) {
    // Use FF JSON for schedule, then fill released actuals/figures from FF HTML rows for matching dates.
    const byDate = new Map();
    for (const row of allScraped) {
      const d = String(row?.date || '');
      if (!d) continue;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(row);
    }
    let merged = events;
    for (const [d, rows] of byDate.entries()) {
      merged = mergeScrapedHtml(rows, merged, d);
    }
    events = merged;
  }
  const fmp = await fetchFmpCalendarRange(fromStr, toStr);
  if (fmp && fmp.length) {
    if (events.length === 0) {
      events = fmp.map(ensureEventTimestamp);
    } else {
      events = mergeSupplementActuals(events, fmp);
    }
  }
  const te = await fetchTradingEconomicsCalendarRange(fromStr, toStr);
  if (te && te.length) {
    if (events.length === 0) {
      events = te.map(ensureEventTimestamp);
    } else {
      events = mergeSupplementActuals(events, te);
    }
  }
  const fred = await fetchFredCalendarRange(fromStr, toStr);
  if (fred && fred.length) {
    if (events.length === 0) {
      events = fred.map(ensureEventTimestamp);
    } else {
      events = mergeSupplementActuals(events, fred);
      events = events.concat(fred);
      events = dedupeEconomicEvents(events);
    }
  }

  events = events.map(ensureEventTimestamp);
  events.sort(compareEvents);

  let source = 'ForexFactoryHTML';
  if (fmp && fmp.length) source = 'ForexFactoryHTML+FMP';
  if (te && te.length) source = source.includes('FMP') ? 'ForexFactoryHTML+FMP+TradingEconomics' : 'ForexFactoryHTML+TradingEconomics';
  if (fred && fred.length) source = source === 'empty' ? 'FRED' : `${source}+FRED`;
  if (events.length === 0 && fromStr <= calendarEtTodayStr() && toStr >= calendarEtTodayStr()) {
    // Safety fallback: keep non-empty UX when providers are transiently empty.
    source = 'fallback';
    events = staticFallback().filter((e) => e.date && e.date >= fromStr && e.date <= toStr);
  }
  if (events.length === 0) source = 'empty';

  return { events, source };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Timezone');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, message: 'Method not allowed' });

  const viewerTimeZone = resolveViewerTimeZone(req);
  const debugCalendar = process.env.DEBUG_TRADER_DECK_CALENDAR === '1';

  const rangeQ = parseCalendarRangeQuery(req.query || {});
  if (rangeQ && rangeQ.error) {
    return res.status(400).json({ success: false, message: rangeQ.error });
  }
  if (rangeQ && rangeQ.from) {
    const { from, to } = rangeQ;
    const forceRefresh = req.query.refresh === '1';
    const rangeFilterKey = JSON.stringify({
      ccy: parseCsvParam(req.query?.currencies).map((s) => s.toUpperCase()).sort(),
      ctry: parseCsvParam(req.query?.countries).map((s) => s.toUpperCase()).sort(),
      imp: parseCsvParam(req.query?.impact).map((s) => normImpact(s)).sort(),
      tz: viewerTimeZone,
    });
    const rangeKey = `trader-deck:economic-calendar:range:v2:${from}:${to}:${rangeFilterKey}`;
    const etToday = calendarEtTodayStr();
    const includesTodayOrFuture = to >= etToday;
    const rangeTtl = includesTodayOrFuture ? CACHE_TTL_MS : HISTORICAL_RANGE_CACHE_TTL_MS;
    const rangeCachedForRecovery = getCached(rangeKey, rangeTtl);
    const rangeCached = forceRefresh ? null : rangeCachedForRecovery;
    if (rangeCached) {
      return res.status(200).json({ success: true, ...rangeCached, viewerTimeZone, cached: true });
    }
    const providerHint = process.env.TRADING_ECONOMICS_API_KEY ? 'TradingEconomicsRange+FFHTML+FMP' : 'FFHTML+FMP';
    const { events, source } = await fetchHistoricalRange(from, to);
    const normalized = normalizeCalendarPayloadRows(events, viewerTimeZone);
    const deduped = dedupeEconomicEvents(normalized);
    const filteredRows = applyQueryFilters(deduped, req.query || {});
    filteredRows.sort(compareEvents);
    if (debugCalendar) {
      console.debug('[trader-deck/economic-calendar] range', {
        from,
        to,
        providerEndpoint: providerHint,
        rowsProvider: Array.isArray(events) ? events.length : 0,
        rowsNormalized: normalized.length,
        rowsDeduped: deduped.length,
        rowsFiltered: filteredRows.length,
        sample: filteredRows[0] || null,
      });
    }
    const fetchedAt = new Date().toISOString();

    const looksLikeStaticFallback = source === 'fallback' && Array.isArray(filteredRows) && filteredRows.length <= 5;
    if (forceRefresh && rangeCachedForRecovery && looksLikeStaticFallback) {
      return res.status(200).json({
        success: true,
        ...rangeCachedForRecovery,
        viewerTimeZone,
        cached: true,
        recoveredFromCache: true,
      });
    }

    const rangePayload = {
      events: filteredRows,
      source,
      from,
      to,
      days: enumerateInclusiveDays(from, to).length,
      viewerTimeZone,
      updatedAt: fetchedAt,
      fetchedAt,
      sourceUpdatedAt: fetchedAt,
    };
    setCached(rangeKey, rangePayload, rangeTtl);
    return res.status(200).json({ success: true, ...rangePayload, cached: false });
  }

  // Event list is identical for all viewers; only metadata differs — single cache key
  const defaultRangeFrom = shiftIsoDate(calendarEtTodayStr(), -DEFAULT_RANGE_PAST_DAYS);
  const defaultRangeTo = shiftIsoDate(calendarEtTodayStr(), DEFAULT_RANGE_FUTURE_DAYS);
  const useDefaultRange = req.query.days == null && req.query.date == null && req.query.from == null && req.query.to == null && req.query.startDate == null && req.query.endDate == null;
  const cacheKey = useDefaultRange ? `${CACHE_KEY}:default-range:v1` : CACHE_KEY;

  // ?refresh=1 bypasses cache — used by frontend for precision fetches at event release time
  const forceRefresh = req.query.refresh === '1';
  const cachedForRecovery = getCached(cacheKey, CACHE_TTL_MS);
  const cached = forceRefresh ? null : cachedForRecovery;
  if (cached) return res.status(200).json({ success: true, ...cached, viewerTimeZone, cached: true });

  if (useDefaultRange) {
    const forceRefreshRange = req.query.refresh === '1';
    const rangeQuery = { from: defaultRangeFrom, to: defaultRangeTo, refresh: forceRefreshRange ? '1' : undefined };
    const rangeKey = `trader-deck:economic-calendar:range:v2:${defaultRangeFrom}:${defaultRangeTo}:${JSON.stringify({ tz: viewerTimeZone })}`;
    const rangeCachedForRecovery = getCached(rangeKey, CACHE_TTL_MS);
    const rangeCached = forceRefreshRange ? null : rangeCachedForRecovery;
    if (rangeCached) {
      return res.status(200).json({ success: true, ...rangeCached, viewerTimeZone, cached: true });
    }
    const { events, source } = await fetchHistoricalRange(defaultRangeFrom, defaultRangeTo);
    const normalized = normalizeCalendarPayloadRows(events, viewerTimeZone);
    const deduped = dedupeEconomicEvents(normalized);
    const filteredRows = applyQueryFilters(deduped, req.query || {}).sort(compareEvents);
    if (debugCalendar) {
      console.debug('[trader-deck/economic-calendar] default-range', {
        from: defaultRangeFrom,
        to: defaultRangeTo,
        providerEndpoint: process.env.TRADING_ECONOMICS_API_KEY ? 'TradingEconomicsRange+FFHTML+FMP' : 'FFHTML+FMP',
        rowsProvider: Array.isArray(events) ? events.length : 0,
        rowsNormalized: normalized.length,
        rowsDeduped: deduped.length,
        rowsFiltered: filteredRows.length,
        sample: filteredRows[0] || null,
      });
    }
    const fetchedAt = new Date().toISOString();
    const payload = {
      events: filteredRows,
      source,
      from: defaultRangeFrom,
      to: defaultRangeTo,
      days: enumerateInclusiveDays(defaultRangeFrom, defaultRangeTo).length,
      viewerTimeZone,
      updatedAt: fetchedAt,
      fetchedAt,
      sourceUpdatedAt: fetchedAt,
    };
    setCached(rangeKey, payload, CACHE_TTL_MS);
    return res.status(200).json({ success: true, ...payload, cached: false });
  }

  const days = Math.min(14, Math.max(1, parseInt(req.query.days, 10) || 7));

  let events = null;
  let source = 'fallback';

  // Try providers in order
  events = await fromForexFactory(days);
  if (events && events.length > 0) {
    source = 'ForexFactory';
    // Derive timestamps from date+time before merge/scrape so matching + "past without actual" detection are reliable
    events = events.map(ensureEventTimestamp);
    // FF JSON CDN has no `actual` field — merge FMP/TE and optionally scrape FF HTML for figures
    events = await enrichForexFactoryWithActuals(events, days, forceRefresh);
  } else {
    events = await fromFMP(days);
    if (events && events.length > 0) { source = 'FMP'; }
    else {
      events = await fromTradingEconomics(days);
      if (events && events.length > 0) { source = 'TradingEconomics'; }
      else {
        const scrapedForward = await scrapeForwardDays(days);
        if (scrapedForward && scrapedForward.length > 0) {
          events = scrapedForward;
          source = 'ForexFactoryHTML';
        } else {
          events = staticFallback();
          source = 'fallback';
        }
      }
    }
  }

  events = events.map(ensureEventTimestamp);
  events = normalizeCalendarPayloadRows(events, viewerTimeZone);
  events = dedupeEconomicEvents(events);
  events = applyQueryFilters(events, req.query || {});
  // Sort by UTC timestamp when available for stable ordering across providers.
  events.sort(compareEvents);
  if (debugCalendar) {
    console.debug('[trader-deck/economic-calendar] snapshot', {
      days,
      providerEndpoint: source === 'TradingEconomics' ? 'TradingEconomicsRange(country/all/from/to)' : source,
      rowsAfterNormalizeAndDedupe: events.length,
      sample: events[0] || null,
    });
  }

  const fetchedAt = new Date().toISOString();

  const withForecastNew = Array.isArray(events)
    ? events.filter((e) => normalizeValue(e.forecast) != null).length
    : 0;
  const withActualNew = Array.isArray(events)
    ? events.filter((e) => hasActualBackend(e.actual)).length
    : 0;

  const withForecastCached = cachedForRecovery?.events
    ? cachedForRecovery.events.filter((e) => normalizeValue(e.forecast) != null).length
    : 0;
  const withActualCached = cachedForRecovery?.events
    ? cachedForRecovery.events.filter((e) => hasActualBackend(e.actual)).length
    : 0;

  const looksLikeStaticFallback = source === 'fallback' && Array.isArray(events) && events.length <= 5;
  const looksLikeFigureDrop =
    cachedForRecovery &&
    withForecastCached > 0 &&
    withForecastNew < Math.max(2, Math.floor(withForecastCached * 0.25));
  if (forceRefresh && cachedForRecovery && (looksLikeStaticFallback || looksLikeFigureDrop)) {
    return res.status(200).json({
      success: true,
      ...cachedForRecovery,
      viewerTimeZone,
      cached: true,
      recoveredFromCache: true,
    });
  }

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
  hasExplicitTimezoneOffset,
  normalizeEventShape,
  resolveViewerTimeZone,
  isValidIanaTimeZone,
  mergeSupplementActuals,
  titleSimilarity,
  ensureEventTimestamp,
  parseCalendarRangeQuery,
  isValidIsoDateOnly,
  enumerateInclusiveDays,
  mapFredSeriesToEvents,
};
