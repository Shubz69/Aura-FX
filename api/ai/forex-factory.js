// Forex Factory Economic Calendar API
// Provides economic events and news that affect forex markets

const axios = require('axios');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { date, impact } = req.body || req.query || {};

    // Forex Factory doesn't have a public API, so we'll use alternative sources
    // Option 1: Use Investing.com economic calendar API (if available)
    // Option 2: Use alternative economic calendar APIs
    
    // For now, we'll provide a structured response that the AI can use
    // In production, you would integrate with a paid economic calendar API
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Format dates
    const formatDate = (date) => {
      return date.toISOString().split('T')[0];
    };

    // Return structured economic calendar data
    // Note: This is a placeholder - in production, integrate with a real economic calendar API
    const calendarData = {
      date: date || formatDate(today),
      events: [
        {
          time: '08:30',
          currency: 'USD',
          event: 'Non-Farm Payrolls',
          impact: 'High',
          actual: null,
          forecast: null,
          previous: null
        },
        {
          time: '10:00',
          currency: 'USD',
          event: 'ISM Manufacturing PMI',
          impact: 'Medium',
          actual: null,
          forecast: null,
          previous: null
        }
      ],
      note: 'Economic calendar data. For real-time events, integrate with a professional economic calendar API like Investing.com, Trading Economics, or Bloomberg Terminal.'
    };

    // Filter by impact if specified
    if (impact) {
      calendarData.events = calendarData.events.filter(event => 
        event.impact.toLowerCase() === impact.toLowerCase()
      );
    }

    return res.status(200).json({
      success: true,
      data: calendarData,
      message: 'Economic calendar data. For production use, integrate with a professional economic calendar API.'
    });

  } catch (error) {
    console.error('Error fetching Forex Factory calendar:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to fetch economic calendar data' 
    });
  }
};
