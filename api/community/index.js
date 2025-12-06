const mysql = require('mysql2/promise');

// Get database connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    console.error('Missing MySQL environment variables for community');
    return null;
  }

  try {
    const connectionConfig = {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
      connectTimeout: 10000,
    };

    if (process.env.MYSQL_SSL === 'true') {
      connectionConfig.ssl = { rejectUnauthorized: false };
    } else {
      connectionConfig.ssl = false;
    }

    const connection = await mysql.createConnection(connectionConfig);
    await connection.ping();
    return connection;
  } catch (error) {
    console.error('Database connection error in community:', error.message);
    return null;
  }
};

module.exports = async (req, res) => {
  // Handle CORS - allow both www and non-www origins
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle HEAD requests
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  // Extract the path to determine which endpoint to handle
  let path = '';
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    path = url.pathname;
  } catch (e) {
    path = req.url || '';
  }

  // Handle /api/community/users
  if (path.includes('/users') && req.method === 'GET') {
    try {
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }

      try {
        const ensureUserColumn = async (columnDefinition, testQuery) => {
          try {
            await db.execute(testQuery);
          } catch (err) {
            await db.execute(`ALTER TABLE users ADD COLUMN ${columnDefinition}`);
          }
        };

        await ensureUserColumn('last_seen DATETIME DEFAULT NULL', 'SELECT last_seen FROM users LIMIT 1');
        await ensureUserColumn('created_at DATETIME DEFAULT CURRENT_TIMESTAMP', 'SELECT created_at FROM users LIMIT 1');

        const [rows] = await db.execute(
          'SELECT id, username, email, name, avatar, role, created_at, last_seen FROM users ORDER BY COALESCE(created_at, NOW()) DESC'
        );
        await db.end();

        const users = rows.map(row => ({
          id: row.id,
          username: row.username,
          email: row.email,
          name: row.name,
          avatar: row.avatar || '/avatars/avatar_ai.png',
          role: row.role,
          createdAt: row.created_at,
          lastSeen: row.last_seen
        }));

        return res.status(200).json(users);
      } catch (dbError) {
        console.error('Database error fetching users:', dbError.message);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch users'
        });
      }
    } catch (error) {
      console.error('Error in community/users:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  }

  // Handle /api/community/update-presence
  if (path.includes('/update-presence') && req.method === 'POST') {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }

      try {
        // Update user's last_seen timestamp
        await db.execute(
          'UPDATE users SET last_seen = NOW() WHERE id = ?',
          [userId]
        );
        await db.end();

        return res.status(200).json({
          success: true,
          message: 'Presence updated'
        });
      } catch (dbError) {
        console.error('Database error updating presence:', dbError.message);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to update presence'
        });
      }
    } catch (error) {
      console.error('Error in update-presence:', error);
      return res.status(500).json({
        success: false,
        message: 'An error occurred'
      });
    }
  }

  return res.status(404).json({ success: false, message: 'Endpoint not found' });
};

