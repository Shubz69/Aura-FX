const mysql = require('mysql2/promise');

// Get database connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    console.error('Missing MySQL environment variables for user update');
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
    console.error('Database connection error in user update:', error.message);
    return null;
  }
};

module.exports = async (req, res) => {
  // Handle CORS
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

  // Extract userId from URL - handle both Vercel rewrites and direct paths
  let userId = null;
  
  try {
    // Try to get from query parameter first (Vercel rewrites)
    if (req.query && req.query.userId) {
      userId = req.query.userId;
    } else {
      // Try to parse from URL path - handle /api/users/1/update or /api/users/1
      let urlPath = req.url || '';
      // Remove query string if present
      if (urlPath.includes('?')) {
        urlPath = urlPath.split('?')[0];
      }
      const pathParts = urlPath.split('/').filter(p => p);
      const userIdIndex = pathParts.indexOf('users');
      if (userIdIndex !== -1 && pathParts[userIdIndex + 1]) {
        const potentialUserId = pathParts[userIdIndex + 1];
        // Check if it's a number (userId) or 'update' (which means userId is missing)
        if (potentialUserId === 'update') {
          console.error('Invalid URL format - userId missing before /update');
        } else if (!isNaN(potentialUserId)) {
          userId = potentialUserId;
        }
      }
    }
    
    // If still no userId, try regex match as fallback
    if (!userId) {
      const match = req.url?.match(/\/users\/(\d+)/);
      if (match) {
        userId = match[1];
      }
    }
  } catch (e) {
    console.error('Error parsing userId:', e);
    // Last resort: try regex on full URL
    const match = req.url?.match(/\/users\/(\d+)/);
    if (match) {
      userId = match[1];
    }
  }

  if (!userId) {
    console.error('Could not extract userId from URL:', req.url, 'Query:', req.query);
    return res.status(400).json({ success: false, message: 'User ID is required' });
  }
  
  // Ensure userId is a valid number
  userId = parseInt(userId);
  if (isNaN(userId)) {
    return res.status(400).json({ success: false, message: 'Invalid user ID format' });
  }

  // Check authentication
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Handle PUT request for updating user profile
  if (req.method === 'PUT') {
    try {
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        // Ensure all necessary columns exist
        const ensureColumn = async (columnDefinition, testQuery) => {
          try {
            await db.execute(testQuery);
          } catch (err) {
            await db.execute(`ALTER TABLE users ADD COLUMN ${columnDefinition}`);
          }
        };

        await ensureColumn('name VARCHAR(255)', 'SELECT name FROM users LIMIT 1');
        await ensureColumn('username VARCHAR(255)', 'SELECT username FROM users LIMIT 1');
        await ensureColumn('email VARCHAR(255)', 'SELECT email FROM users LIMIT 1');
        await ensureColumn('phone VARCHAR(50)', 'SELECT phone FROM users LIMIT 1');
        await ensureColumn('address TEXT', 'SELECT address FROM users LIMIT 1');
        await ensureColumn('bio TEXT', 'SELECT bio FROM users LIMIT 1');
        
        // Avatar column - check if it exists and if it's TEXT (for base64) or VARCHAR
        let avatarColumnType = 'VARCHAR(255)';
        try {
          const [columns] = await db.execute(`
            SELECT COLUMN_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'users' 
            AND COLUMN_NAME = 'avatar'
          `, [process.env.MYSQL_DATABASE]);
          
          if (columns.length > 0) {
            const columnType = columns[0].COLUMN_TYPE;
            // If it's VARCHAR and less than TEXT, we might want to keep it
            // But base64 images can be long, so we'll check the length
            if (columnType.includes('varchar') && !columnType.includes('text')) {
              // Check if we need to convert to TEXT for base64 images
              // For now, we'll try to use it as is, but VARCHAR(255) might be too small
              // Let's check if the incoming data is base64 and longer than 255
            }
          } else {
            // Column doesn't exist, create it
            await db.execute('ALTER TABLE users ADD COLUMN avatar TEXT');
            avatarColumnType = 'TEXT';
          }
        } catch (e) {
          // If we can't check, try to alter to TEXT to be safe for base64
          try {
            await db.execute('ALTER TABLE users MODIFY COLUMN avatar TEXT');
            avatarColumnType = 'TEXT';
          } catch (alterError) {
            // If modification fails, try to add it
            try {
              await db.execute('ALTER TABLE users ADD COLUMN avatar TEXT');
              avatarColumnType = 'TEXT';
            } catch (addError) {
              console.warn('Could not modify avatar column, using existing type');
            }
          }
        }

        // Get update data from request body
        const { name, username, email, phone, address, bio, avatar } = req.body || {};

        // Build update query dynamically
        const updates = [];
        const values = [];

        // Helper to convert "None" or empty strings to NULL
        const cleanValue = (val) => {
          if (val === undefined) return undefined;
          if (val === null || val === '' || val === 'None') return null;
          return val;
        };

        if (name !== undefined) {
          updates.push('name = ?');
          values.push(cleanValue(name));
        }
        if (username !== undefined) {
          updates.push('username = ?');
          values.push(cleanValue(username));
        }
        if (email !== undefined) {
          updates.push('email = ?');
          values.push(cleanValue(email));
        }
        if (phone !== undefined) {
          updates.push('phone = ?');
          values.push(cleanValue(phone));
        }
        if (address !== undefined) {
          updates.push('address = ?');
          values.push(cleanValue(address));
        }
        if (bio !== undefined) {
          updates.push('bio = ?');
          values.push(cleanValue(bio));
        }
        if (avatar !== undefined) {
          updates.push('avatar = ?');
          values.push(cleanValue(avatar) || 'avatar_ai.png');
        }

        if (updates.length === 0) {
          await db.end();
          return res.status(400).json({ success: false, message: 'No fields to update' });
        }

        // Add userId to values
        values.push(userId);

        // Execute update
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        await db.execute(query, values);

        // Fetch updated user data
        const [updatedRows] = await db.execute(
          'SELECT id, username, email, name, phone, address, bio, avatar, role, level, xp FROM users WHERE id = ?',
          [userId]
        );

        await db.end();

        if (updatedRows.length === 0) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.status(200).json({
          success: true,
          message: 'Profile updated successfully',
          user: updatedRows[0]
        });
      } catch (dbError) {
        console.error('Database error updating user:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to update profile',
          error: dbError.message
        });
      }
    } catch (error) {
      console.error('Error in user update:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Handle GET request for fetching user data
  if (req.method === 'GET') {
    try {
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        const [rows] = await db.execute(
          'SELECT id, username, email, name, phone, address, bio, avatar, role, level, xp FROM users WHERE id = ?',
          [userId]
        );
        await db.end();

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.status(200).json(rows[0]);
      } catch (dbError) {
        console.error('Database error fetching user:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch user data'
        });
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};

