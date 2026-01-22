const mysql = require('mysql2/promise');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

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

  // Check if this is a public profile request - skip auth for public profiles
  const isPublicProfileRequest = req.url && req.url.includes('/public-profile/');
  
  // Check authentication (skip for public profile requests)
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!isPublicProfileRequest && !token) {
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
        
        // Avatar column - ensure it's TEXT (for base64 images which can be very long)
        try {
          const [columns] = await db.execute(`
            SELECT COLUMN_TYPE 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? 
            AND TABLE_NAME = 'users' 
            AND COLUMN_NAME = 'avatar'
          `, [process.env.MYSQL_DATABASE]);
          
          if (columns.length > 0) {
            const columnType = columns[0].COLUMN_TYPE.toLowerCase();
            // If it's VARCHAR (not TEXT), convert it to TEXT to handle long base64 strings
            if (columnType.includes('varchar') && !columnType.includes('text')) {
              try {
                await db.execute('ALTER TABLE users MODIFY COLUMN avatar TEXT');
                console.log('Avatar column converted to TEXT');
              } catch (alterError) {
                console.warn('Could not convert avatar column to TEXT:', alterError.message);
              }
            }
          } else {
            // Column doesn't exist, create it as TEXT
            await db.execute('ALTER TABLE users ADD COLUMN avatar TEXT');
            console.log('Avatar column created as TEXT');
          }
        } catch (e) {
          // If we can't check, try to alter to TEXT to be safe for base64
          try {
            await db.execute('ALTER TABLE users MODIFY COLUMN avatar TEXT');
            console.log('Avatar column modified to TEXT');
          } catch (alterError) {
            // If modification fails, try to add it
            try {
              await db.execute('ALTER TABLE users ADD COLUMN avatar TEXT');
              console.log('Avatar column added as TEXT');
            } catch (addError) {
              console.warn('Could not modify avatar column:', addError.message);
            }
          }
        }

        // Get update data from request body
        const { name, username, email, phone, address, bio, avatar, updateUsername } = req.body || {};

        // Build update query dynamically
        const updates = [];
        const values = [];

        // Helper to convert "None" or empty strings to NULL
        const cleanValue = (val) => {
          if (val === undefined) return undefined;
          if (val === null || val === '' || val === 'None') return null;
          return val;
        };

        // Username validation and cooldown check (only if updateUsername flag is set)
        if (username !== undefined && updateUsername) {
          // Validate username format and content
          const trimmedUsername = (username || '').trim();
          
          // Length check
          if (trimmedUsername.length < 3) {
            await db.end();
            return res.status(400).json({ success: false, message: 'Username must be at least 3 characters long' });
          }
          
          if (trimmedUsername.length > 30) {
            await db.end();
            return res.status(400).json({ success: false, message: 'Username must be 30 characters or less' });
          }
          
          // Check for valid characters (letters, numbers, spaces, hyphens, underscores)
          const validPattern = /^[a-zA-Z0-9\s_-]+$/;
          if (!validPattern.test(trimmedUsername)) {
            await db.end();
            return res.status(400).json({ success: false, message: 'Username can only contain letters, numbers, spaces, hyphens, and underscores' });
          }
          
          // Check for consecutive spaces
          if (/\s{2,}/.test(trimmedUsername)) {
            await db.end();
            return res.status(400).json({ success: false, message: 'Username cannot contain consecutive spaces' });
          }
          
          // Check for spaces at start/end
          if (trimmedUsername.startsWith(' ') || trimmedUsername.endsWith(' ')) {
            await db.end();
            return res.status(400).json({ success: false, message: 'Username cannot start or end with a space' });
          }
          
          // Check for inappropriate words (family-friendly filter)
          const inappropriateWords = [
            'fuck', 'shit', 'damn', 'hell', 'ass', 'bitch', 'bastard', 'crap',
            'sex', 'porn', 'xxx', 'nsfw',
            'kill', 'murder', 'death', 'violence',
            'drug', 'cocaine', 'heroin', 'marijuana', 'weed',
            'hate', 'racist', 'nazi',
            'stupid', 'idiot', 'moron', 'retard'
          ];
          
          const lowerUsername = trimmedUsername.toLowerCase();
          const containsInappropriate = inappropriateWords.some(word => lowerUsername.includes(word));
          if (containsInappropriate) {
            await db.end();
            return res.status(400).json({ success: false, message: 'Username contains inappropriate content. Please choose a family-friendly username.' });
          }
          
          // Check 30-day cooldown
          try {
            // Ensure last_username_change column exists
            try {
              await db.execute('SELECT last_username_change FROM users LIMIT 1');
            } catch (e) {
              await db.execute('ALTER TABLE users ADD COLUMN last_username_change DATETIME DEFAULT NULL');
            }
            
            // Get current user data
            const [currentUser] = await db.execute(
              'SELECT username, last_username_change FROM users WHERE id = ?',
              [userId]
            );
            
            // Only check cooldown if username is actually changing
            if (currentUser.length > 0 && currentUser[0].username !== trimmedUsername) {
              if (currentUser[0].last_username_change) {
                const lastChange = new Date(currentUser[0].last_username_change);
                const now = new Date();
                const daysSinceChange = Math.floor((now - lastChange) / (1000 * 60 * 60 * 24));
                const daysRemaining = 30 - daysSinceChange;
                
                if (daysRemaining > 0) {
                  await db.end();
                  return res.status(400).json({ 
                    success: false, 
                    message: `You can change your username in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.` 
                  });
                }
              }
              
              // Username is changing and cooldown passed - update timestamp
              updates.push('last_username_change = NOW()');
            }
          } catch (cooldownError) {
            console.error('Error checking username cooldown:', cooldownError);
            // Continue if cooldown check fails (for backward compatibility)
          }
          
          // Use trimmed username
          updates.push('username = ?');
          values.push(trimmedUsername);
        } else if (username !== undefined) {
          // Username update without validation (for admin updates, etc.)
          updates.push('username = ?');
          values.push(cleanValue(username));
        }

        if (name !== undefined) {
          updates.push('name = ?');
          values.push(cleanValue(name));
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
          let avatarValue = cleanValue(avatar);
          // If avatar is a base64 string, ensure it's not too long (TEXT can handle up to 65KB)
          // But we'll truncate if it's extremely long to prevent issues
          if (avatarValue && typeof avatarValue === 'string') {
            // Base64 images can be long, but TEXT column can handle up to 65,535 bytes
            // We'll limit to 60KB to be safe (60,000 characters for base64)
            if (avatarValue.length > 60000) {
              console.warn('Avatar data too long, truncating to 60KB');
              avatarValue = avatarValue.substring(0, 60000);
            }
            // If it's not a base64 data URL and not a simple filename, default to avatar_ai.png
            if (avatarValue && !avatarValue.startsWith('data:') && !avatarValue.match(/^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|gif|webp)$/)) {
              // If it looks like it might be corrupted or invalid, use default
              if (avatarValue.length > 1000 && !avatarValue.includes('base64')) {
                console.warn('Avatar value seems invalid, using default');
                avatarValue = 'avatar_ai.png';
              }
            }
          }
          updates.push('avatar = ?');
          values.push(avatarValue || 'avatar_ai.png');
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

        // Fetch updated user data (include last_username_change)
        const [updatedRows] = await db.execute(
          'SELECT id, username, email, name, phone, address, bio, avatar, role, level, xp, last_username_change FROM users WHERE id = ?',
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

  // Handle GET request for fetching user data (both /api/users/:userId and /api/users/public-profile/:userId)
  if (req.method === 'GET') {
    try {
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        // Ensure last_username_change column exists
        try {
          await db.execute('SELECT last_username_change FROM users LIMIT 1');
        } catch (e) {
          await db.execute('ALTER TABLE users ADD COLUMN last_username_change DATETIME DEFAULT NULL');
        }
        
        // Ensure created_at column exists for public profiles
        try {
          await db.execute('SELECT created_at FROM users LIMIT 1');
        } catch (e) {
          await db.execute('ALTER TABLE users ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
        }
        
        // Ensure login_streak column exists
        try {
          await db.execute('SELECT login_streak FROM users LIMIT 1');
        } catch (e) {
          await db.execute('ALTER TABLE users ADD COLUMN login_streak INT DEFAULT 0');
        }
        
        // Check if banner column exists
        let hasBanner = false;
        try {
          await db.execute('SELECT banner FROM users LIMIT 1');
          hasBanner = true;
        } catch (e) {
          // Banner column doesn't exist, will be null
        }
        
        // Check if last_seen column exists
        let hasLastSeen = false;
        try {
          await db.execute('SELECT last_seen FROM users LIMIT 1');
          hasLastSeen = true;
        } catch (e) {
          // last_seen column doesn't exist
        }
        
        // Build select fields dynamically based on what columns exist
        const baseFields = 'id, username, email, name, phone, address, bio, avatar, role, level, xp, login_streak, last_username_change, created_at';
        const fieldsWithBanner = hasBanner ? `${baseFields}, banner` : baseFields;
        const selectFields = hasLastSeen ? `${fieldsWithBanner}, last_seen` : fieldsWithBanner;
        
        let rows;
        try {
          [rows] = await db.execute(
            `SELECT ${selectFields} FROM users WHERE id = ?`,
            [userId]
          );
        } catch (selectError) {
          // If SELECT fails (e.g., column doesn't exist), try with minimal fields
          console.warn('Select with all fields failed, trying minimal fields:', selectError.message);
          try {
            [rows] = await db.execute(
              'SELECT id, username, email, name, phone, address, bio, avatar, role, level, xp, created_at FROM users WHERE id = ?',
              [userId]
            );
          } catch (minimalError) {
            console.error('Minimal select also failed:', minimalError);
            throw minimalError;
          }
        }
        
        // Close connection (using createConnection, not pool)
        if (db && typeof db.end === 'function' && !db.ended) {
          await db.end();
        }

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = rows[0];
        
        // Check if this is a public profile request (exclude personal information)
        const isPublicProfile = req.url && req.url.includes('/public-profile/');
        
        // Return user data with formatted dates
        const responseData = {
          id: user.id,
          username: user.username || user.name || 'User',
          name: user.name,
          bio: user.bio || '',
          avatar: user.avatar || 'avatar_ai.png',
          banner: (hasBanner && user.banner) ? user.banner : '',
          role: user.role || 'free',
          level: parseInt(user.level || 1),
          xp: parseFloat(user.xp || 0),
          joinDate: user.created_at,
          createdAt: user.created_at,
          login_streak: (user.login_streak !== undefined && user.login_streak !== null) ? user.login_streak : 0,
          last_seen: (hasLastSeen && user.last_seen) ? user.last_seen : null,
          stats: {
            reputation: Math.floor((user.xp || 0) / 100), // Calculate reputation from XP
            totalTrades: 0,
            winRate: 0,
            totalProfit: 0
          }
        };
        
        // Only include personal information if NOT a public profile request
        if (!isPublicProfile) {
          responseData.email = user.email;
          responseData.name = user.name;
          responseData.phone = user.phone;
          responseData.address = user.address;
          responseData.lastUsernameChange = user.last_username_change;
          responseData.createdAt = user.created_at;
        }
        
        return res.status(200).json(responseData);
      } catch (dbError) {
        console.error('Database error fetching user:', dbError);
        console.error('Error details:', {
          message: dbError.message,
          code: dbError.code,
          sqlState: dbError.sqlState,
          sqlMessage: dbError.sqlMessage
        });
        
        // Close connection (using createConnection, not pool)
        if (db && typeof db.end === 'function' && !db.ended) {
          try {
            await db.end();
          } catch (endError) {
            console.error('Error closing DB connection:', endError);
          }
        }
        
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch user data',
          error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
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

