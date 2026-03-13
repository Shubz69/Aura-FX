/**
 * Event Risk Engine – warns when high-impact events are soon (e.g. FOMC, NFP, CPI).
 */

const DEFAULT_WINDOW_MINUTES = 120;

/**
 * High-impact event keywords for warning.
 */
const HIGH_IMPACT_KEYWORDS = ['fomc', 'nfp', 'nonfarm', 'cpi', 'interest rate', 'fed', 'ecb', 'boe', 'gdp', 'pmi', 'employment', 'inflation', 'central bank', 'decision'];

function isHighImpact(event) {
  const name = ((event.event || event.name || '') + ' ' + (event.category || '')).toLowerCase();
  const impact = (event.impact || event.Importance || '').toString().toLowerCase();
  if (impact === 'high' || impact === '3') return true;
  return HIGH_IMPACT_KEYWORDS.some(kw => name.includes(kw));
}

/**
 * Parse event time to Date (UTC).
 */
function eventTime(event) {
  const d = event.date || event.Date;
  const t = event.time || event.Time;
  if (!d && !t) return null;
  let dateStr = d;
  if (t && !dateStr) dateStr = new Date().toISOString().split('T')[0];
  if (t && typeof t === 'string') dateStr = `${dateStr}T${t.length <= 5 ? t + ':00' : t}`;
  const parsed = new Date(dateStr);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * Events within the next N minutes.
 */
function eventsWithinMinutes(events, windowMinutes = DEFAULT_WINDOW_MINUTES) {
  if (!Array.isArray(events) || events.length === 0) return [];
  const now = Date.now();
  const end = now + windowMinutes * 60 * 1000;
  return events.filter(e => {
    const t = eventTime(e);
    if (!t) return false;
    const ts = t.getTime();
    return ts >= now && ts <= end && isHighImpact(e);
  });
}

/**
 * Build warning message for traders.
 */
function analyze(calendarEvents = [], windowMinutes = DEFAULT_WINDOW_MINUTES) {
  const events = Array.isArray(calendarEvents) ? calendarEvents : (calendarEvents.events || []);
  const upcoming = eventsWithinMinutes(events, windowMinutes);

  if (upcoming.length === 0) {
    return { warning: null, highImpactEvents: [], summary: null };
  }

  const next = upcoming[0];
  const eventName = next.event || next.Event || next.name || 'High-impact event';
  const t = eventTime(next);
  const minsAway = t ? Math.round((t.getTime() - Date.now()) / 60000) : null;

  const summary = minsAway != null
    ? `High impact event in ${minsAway} minutes: ${eventName}. Expect volatility spike.`
    : `High impact event soon: ${eventName}. Expect volatility spike.`;

  return {
    warning: summary,
    highImpactEvents: upcoming.map(e => ({ name: e.event || e.Event, time: eventTime(e), impact: e.impact || 'High' })),
    summary
  };
}

module.exports = { analyze, isHighImpact, eventsWithinMinutes, eventTime };
