// TradingView Webhook Endpoint
// Receives and processes TradingView alerts
// NO scraping - only webhook-based integration

const { getDbConnection } = require('../db');

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const alert = req.body;
    
    // TradingView alert structure:
    // {
    //   "symbol": "XAUUSD",
    //   "timeframe": "1h",
    //   "price": 2724.50,
    //   "action": "buy" | "sell" | "alert",
    //   "message": "Custom message",
    //   "timestamp": 1234567890,
    //   "strategy": "Strategy name",
    //   "indicator": "RSI",
    //   "value": 65.5
    // }

    if (!alert || !alert.symbol) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid alert format. Symbol is required.' 
      });
    }

    // Store alert in database for AI to access
    const db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    try {
      // Create tradingview_alerts table if it doesn't exist
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tradingview_alerts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          symbol VARCHAR(50) NOT NULL,
          timeframe VARCHAR(20),
          price DECIMAL(20, 8),
          action VARCHAR(20),
          message TEXT,
          strategy VARCHAR(100),
          indicator VARCHAR(50),
          value DECIMAL(20, 8),
          timestamp BIGINT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_symbol_timeframe (symbol, timeframe),
          INDEX idx_timestamp (timestamp)
        )
      `);

      // Insert alert
      await db.execute(`
        INSERT INTO tradingview_alerts 
        (symbol, timeframe, price, action, message, strategy, indicator, value, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        alert.symbol,
        alert.timeframe || null,
        alert.price || null,
        alert.action || 'alert',
        alert.message || null,
        alert.strategy || null,
        alert.indicator || null,
        alert.value || null,
        alert.timestamp || Math.floor(Date.now() / 1000)
      ]);

      // Release database connection
      if (db && typeof db.release === 'function') {
        db.release();
      }

      return res.status(200).json({ 
        success: true, 
        message: 'Alert received and stored',
        alert: {
          symbol: alert.symbol,
          action: alert.action,
          timestamp: alert.timestamp
        }
      });

    } catch (dbError) {
      console.error('Database error storing TradingView alert:', dbError);
      if (db && typeof db.release === 'function') {
        db.release();
      }
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to store alert' 
      });
    }

  } catch (error) {
    console.error('Error processing TradingView webhook:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Failed to process webhook' 
    });
  }
};

// Function to get recent alerts for AI to use
async function getRecentAlerts(symbol = null, timeframe = null, limit = 10) {
  const db = await getDbConnection();
  if (!db) return [];

  try {
    let query = 'SELECT * FROM tradingview_alerts WHERE 1=1';
    const params = [];

    if (symbol) {
      query += ' AND symbol = ?';
      params.push(symbol);
    }

    if (timeframe) {
      query += ' AND timeframe = ?';
      params.push(timeframe);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const [rows] = await db.execute(query, params);
    
    if (db && typeof db.release === 'function') {
      db.release();
    }

    return rows;
  } catch (error) {
    console.error('Error fetching TradingView alerts:', error);
    if (db && typeof db.release === 'function') {
      db.release();
    }
    return [];
  }
}

module.exports.getRecentAlerts = getRecentAlerts;
