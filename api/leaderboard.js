const mysql = require('mysql2/promise');

// Get database connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    return null;
  }

  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
      connectTimeout: 5000,
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
    await connection.ping();
    return connection;
  } catch (error) {
    console.error('Database connection error:', error);
    return null;
  }
};

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const timeframe = req.query.timeframe || 'all-time';
    
    const db = await getDbConnection();
    if (!db) {
      // Return empty leaderboard if DB unavailable
      return res.status(200).json({ success: true, leaderboard: [] });
    }

    try {
      // Check if users table has XP/level columns
      let hasXp = false;
      let hasLevel = false;
      
      try {
        await db.execute('SELECT xp, level FROM users LIMIT 1');
        hasXp = true;
        hasLevel = true;
      } catch (e) {
        // Check individually
        try {
          await db.execute('SELECT xp FROM users LIMIT 1');
          hasXp = true;
        } catch (e2) {}
        try {
          await db.execute('SELECT level FROM users LIMIT 1');
          hasLevel = true;
        } catch (e2) {}
      }

      // Build query based on available columns
      let query = 'SELECT id, email, username, name';
      if (hasXp) query += ', xp';
      if (hasLevel) query += ', level';
      query += ' FROM users WHERE 1=1';

      // Add timeframe filter if needed (for now, just return all users)
      // You can add date filtering here if you have a created_at or last_active column
      
      if (hasXp) {
        query += ' ORDER BY xp DESC';
      } else if (hasLevel) {
        query += ' ORDER BY level DESC';
      } else {
        query += ' ORDER BY id DESC';
      }
      
      query += ' LIMIT 100'; // Limit to top 100

      const [users] = await db.execute(query);

      const leaderboard = users.map((user, index) => ({
        rank: index + 1,
        userId: user.id,
        username: user.username || user.name || user.email?.split('@')[0] || 'User',
        email: user.email,
        xp: hasXp ? (user.xp || 0) : 0,
        level: hasLevel ? (user.level || 1) : 1
      }));

      await db.end();
      return res.status(200).json({ success: true, leaderboard });
    } catch (dbError) {
      console.error('Database error fetching leaderboard:', dbError);
      if (db && !db.ended) await db.end();
      return res.status(200).json({ success: true, leaderboard: [] });
    }
  } catch (error) {
    console.error('Error in leaderboard:', error);
    return res.status(200).json({ success: true, leaderboard: [] });
  }
};

