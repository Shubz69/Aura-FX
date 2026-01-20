// Forex Factory Economic Calendar Scraper
// Fetches real economic events from Forex Factory

const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { date } = req.body || req.query || {};
    
    // Default to today if no date provided
    let targetDate = new Date();
    if (date) {
      targetDate = new Date(date);
    }
    
    // Format date for Forex Factory (YYYY-MM-DD)
    const dateStr = targetDate.toISOString().split('T')[0];
    const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Forex Factory calendar URL
    // Note: Forex Factory uses a specific format - we'll try to get today's events
    const calendarUrl = `https://www.forexfactory.com/calendar?day=${dateStr.split('-').join('')}`;
    
    try {
      const response = await axios.get(calendarUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const events = [];
      
      // Parse Forex Factory calendar table
      $('.calendar__row').each((index, element) => {
        if (index === 0) return; // Skip header row
        
        const $row = $(element);
        const time = $row.find('.calendar__time').text().trim();
        const currency = $row.find('.calendar__currency').text().trim();
        const impact = $row.find('.calendar__impact').attr('title') || '';
        const event = $row.find('.calendar__event').text().trim();
        const actual = $row.find('.calendar__actual').text().trim();
        const forecast = $row.find('.calendar__forecast').text().trim();
        const previous = $row.find('.calendar__previous').text().trim();
        
        if (event && time) {
          events.push({
            time,
            currency,
            impact: impact.toLowerCase().includes('high') ? 'High' : 
                   impact.toLowerCase().includes('medium') ? 'Medium' : 'Low',
            event,
            actual: actual || null,
            forecast: forecast || null,
            previous: previous || null
          });
        }
      });
      
      if (events.length > 0) {
        return res.status(200).json({
          success: true,
          data: {
            date: dateStr,
            events: events,
            source: 'Forex Factory'
          }
        });
      }
    } catch (scrapeError) {
      console.log('Forex Factory scraping error:', scrapeError.message);
    }
    
    // Fallback: Use Trading Economics API if available
    try {
      const TRADING_ECONOMICS_API_KEY = process.env.TRADING_ECONOMICS_API_KEY;
      if (TRADING_ECONOMICS_API_KEY) {
        const response = await axios.get(`https://api.tradingeconomics.com/calendar`, {
          params: {
            country: 'united states',
            d1: dateStr,
            importance: '1,2,3', // High, Medium, Low
            format: 'json'
          },
          headers: {
            'Authorization': `Client ${TRADING_ECONOMICS_API_KEY}`
          },
          timeout: 10000
        });
        
        if (response.data && Array.isArray(response.data)) {
          const events = response.data.map(event => ({
            time: event.Date ? new Date(event.Date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
            currency: event.Country || 'USD',
            impact: event.Importance === 1 ? 'High' : event.Importance === 2 ? 'Medium' : 'Low',
            event: event.Event || event.Category,
            actual: event.Actual || null,
            forecast: event.Forecast || null,
            previous: event.Previous || null
          }));
          
          return res.status(200).json({
            success: true,
            data: {
              date: dateStr,
              events: events,
              source: 'Trading Economics'
            }
          });
        }
      }
    } catch (teError) {
      console.log('Trading Economics error:', teError.message);
    }
    
    // Return empty calendar if all sources fail
    return res.status(200).json({
      success: true,
      data: {
        date: dateStr,
        events: [],
        message: 'Economic calendar data temporarily unavailable. Please check Forex Factory directly.'
      }
    });

  } catch (error) {
    console.error('Error fetching Forex Factory calendar:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch economic calendar data' 
    });
  }
};
