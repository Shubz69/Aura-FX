/**
 * Economic Calendar Adapter
 * Fetches economic events with caching for Forex Factory style data
 */

const axios = require('axios');
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

  // Fetch from Trading Economics (if API key available)
  async fetchTradingEconomics(date) {
    // Trading Economics requires paid API - implement if key available
    return null;
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
