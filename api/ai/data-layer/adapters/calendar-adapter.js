/**
 * Economic Calendar Adapter
 * Fetches economic events with caching for Forex Factory style data
 */

let axios;
try {
  axios = require('axios');
} catch (_) {
  axios = require('axios/dist/node/axios.cjs');
}
const { DataAdapter, CONFIG } = require('../index');
const { getCached, setCached } = require('../../../cache');

class CalendarAdapter extends DataAdapter {
  constructor() {
    super('EconomicCalendar', { timeout: CONFIG.TIMEOUTS.ADAPTER_DEFAULT });
  }

  // Generate cache key for date
  getCacheKeyForDate(date) {
    const d = date ? new Date(date) : new Date();
    return `calendar:${d.toISOString().split('T')[0]}`;
  }

  // Fetch from Trading Economics (primary macro/calendar provider)
  async fetchTradingEconomics(date) {
    const apiKey = process.env.TRADING_ECONOMICS_API_KEY;
    if (!apiKey) return null;

    const d = date ? new Date(date) : new Date();
    const initDate = d.toISOString().split('T')[0];
    const endDate = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // +7 days

    try {
      // Calendar by date range: /calendar/country/all/initDate/endDate
      const url = `https://api.tradingeconomics.com/calendar/country/all/${initDate}/${endDate}`;
      const response = await axios.get(url, {
        params: { c: apiKey, f: 'json' },
        timeout: this.timeout || 8000
      });

      if (!response.data || !Array.isArray(response.data)) return null;

      const events = response.data.slice(0, 50).map(item => {
        const importance = item.Importance != null ? Number(item.Importance) : 2;
        let impact = 'Medium';
        if (importance === 1) impact = 'Low';
        else if (importance === 3) impact = 'High';
        const eventDate = item.Date ? new Date(item.Date) : null;
        return {
          time: eventDate ? eventDate.toTimeString().slice(0, 5) : '',
          event: item.Event || item.Category || 'Economic release',
          currency: item.Currency || (item.Country && item.Country.slice(0, 3).toUpperCase()) || '',
          impact,
          date: eventDate ? eventDate.toISOString().split('T')[0] : initDate,
          actual: item.Actual ?? null,
          forecast: item.Forecast ?? null,
          previous: item.Previous ?? null,
          country: item.Country || null,
          source: 'Trading Economics'
        };
      });

      return events.length > 0 ? events : null;
    } catch (e) {
      if (this.logger) this.logger.warn('Trading Economics calendar failed', { error: e.message });
      else console.warn('Trading Economics calendar error:', e.message);
      return null;
    }
  }

  // Generate realistic economic calendar based on date patterns
  // This provides a fallback when APIs are unavailable
  generateFallbackCalendar(date) {
    const d = date ? new Date(date) : new Date();
    const dayOfWeek = d.getDay();
    const dayOfMonth = d.getDate();
    const events = [];

    // Common economic events by day of week
    const recurringEvents = {
      0: [], // Sunday - markets closed
      1: [ // Monday
        { time: '10:00', event: 'Manufacturing PMI', currency: 'USD', impact: 'Medium' },
      ],
      2: [ // Tuesday
        { time: '10:00', event: 'Services PMI', currency: 'USD', impact: 'Medium' },
        { time: '14:00', event: 'JOLTS Job Openings', currency: 'USD', impact: 'Medium' },
      ],
      3: [ // Wednesday
        { time: '10:30', event: 'Crude Oil Inventories', currency: 'USD', impact: 'Medium' },
        { time: '14:00', event: 'FOMC Meeting Minutes', currency: 'USD', impact: 'High' },
      ],
      4: [ // Thursday
        { time: '08:30', event: 'Initial Jobless Claims', currency: 'USD', impact: 'Medium' },
        { time: '08:30', event: 'Continuing Jobless Claims', currency: 'USD', impact: 'Low' },
      ],
      5: [ // Friday
        { time: '08:30', event: 'Nonfarm Payrolls', currency: 'USD', impact: 'High', firstFriday: true },
        { time: '08:30', event: 'Unemployment Rate', currency: 'USD', impact: 'High', firstFriday: true },
        { time: '10:00', event: 'Consumer Sentiment', currency: 'USD', impact: 'Medium' },
      ],
      6: [], // Saturday - markets closed
    };

    // Add recurring events
    const dayEvents = recurringEvents[dayOfWeek] || [];
    for (const event of dayEvents) {
      // Only add NFP on first Friday of month
      if (event.firstFriday && dayOfMonth > 7) continue;
      
      events.push({
        ...event,
        date: d.toISOString().split('T')[0],
        actual: null,
        forecast: null,
        previous: null,
        source: 'Generated fallback - verify with official sources'
      });
    }

    // Monthly events (CPI, retail sales)
    if (dayOfMonth >= 10 && dayOfMonth <= 15) {
      events.push({
        time: '08:30',
        event: 'CPI m/m',
        currency: 'USD',
        impact: 'High',
        date: d.toISOString().split('T')[0],
        source: 'Generated fallback'
      });
    }

    return events;
  }

  async fetch(params) {
    const { date, impact } = params;
    const cacheKey = this.getCacheKeyForDate(date);
    
    // Try cache first
    const cached = getCached(cacheKey, CONFIG.CACHE_TTL.ECONOMIC_CALENDAR);
    if (cached) {
      let events = cached;
      if (impact) {
        events = events.filter(e => e.impact === impact);
      }
      return { events, cached: true, source: 'cache' };
    }

    // Try Trading Economics API
    try {
      const teEvents = await this.fetchTradingEconomics(date);
      if (teEvents && teEvents.length > 0) {
        setCached(cacheKey, teEvents);
        let events = teEvents;
        if (impact) {
          events = events.filter(e => e.impact === impact);
        }
        return { events, source: 'Trading Economics' };
      }
    } catch (e) {
      // Continue to fallback
    }

    // Fallback to generated calendar
    const fallbackEvents = this.generateFallbackCalendar(date);
    setCached(cacheKey, fallbackEvents);
    
    let events = fallbackEvents;
    if (impact) {
      events = events.filter(e => e.impact === impact);
    }

    return {
      events,
      source: 'Generated fallback',
      note: 'This is an estimated calendar. Verify events with official sources like ForexFactory.com'
    };
  }
}

module.exports = CalendarAdapter;
