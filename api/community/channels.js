const mysql = require('mysql2/promise');

const slugify = (value) => {
  if (!value) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60);
};

const toDisplayName = (value) => {
  if (!value) return '';
  return value
    .split('-')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const normalizeAccessLevel = (value) => {
  const normalized = (value || 'open')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

  const allowedLevels = new Set([
    'open',
    'read-only',
    'admin-only',
    'premium',
    'support',
    'staff'
  ]);

  return allowedLevels.has(normalized) ? normalized : 'open';
};

const normalizeCategory = (value) => {
  const normalized = (value || 'general')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'general';
};

const ensureChannelSchema = async (db) => {
  if (!process.env.MYSQL_DATABASE) {
    return;
  }

  try {
    // Check if channels table exists
    const [tables] = await db.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels'
    `, [process.env.MYSQL_DATABASE]);

    if (tables.length === 0) {
      // Table doesn't exist, will be created by ensureChannelsTable
      return;
    }

    const [columns] = await db.execute(`
      SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY, EXTRA
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels'
    `, [process.env.MYSQL_DATABASE]);

    const idColumn = columns.find((column) => column.COLUMN_NAME === 'id');
    if (idColumn) {
      // Check if id column is INT and needs to be converted to VARCHAR
      if (idColumn.DATA_TYPE === 'int' || idColumn.DATA_TYPE === 'bigint' || (idColumn.EXTRA || '').includes('auto_increment')) {
        try {
          // Drop foreign key constraints that reference channels.id first
          const [foreignKeys] = await db.execute(`
            SELECT CONSTRAINT_NAME
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = ? 
            AND REFERENCED_TABLE_NAME = 'channels' 
            AND REFERENCED_COLUMN_NAME = 'id'
          `, [process.env.MYSQL_DATABASE]);

          for (const fk of foreignKeys) {
            try {
              const [fkDetails] = await db.execute(`
                SELECT TABLE_NAME, CONSTRAINT_NAME
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                WHERE CONSTRAINT_NAME = ? AND TABLE_SCHEMA = ?
              `, [fk.CONSTRAINT_NAME, process.env.MYSQL_DATABASE]);
              
              if (fkDetails.length > 0) {
                await db.execute(`ALTER TABLE ${fkDetails[0].TABLE_NAME} DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
                console.log(`Dropped foreign key ${fk.CONSTRAINT_NAME} before converting id column`);
              }
            } catch (fkError) {
              console.log(`Note: Could not drop foreign key ${fk.CONSTRAINT_NAME}:`, fkError.message);
            }
          }

          // Drop primary key if it exists
          try {
            await db.execute('ALTER TABLE channels DROP PRIMARY KEY');
          } catch (pkError) {
            // Primary key might not exist or already dropped
            console.log('Note: Primary key drop:', pkError.message);
          }

          // Convert id from INT to VARCHAR
          await db.execute('ALTER TABLE channels MODIFY COLUMN id VARCHAR(255) NOT NULL');
          console.log('Converted channels.id from INT to VARCHAR(255)');

          // Re-add primary key
          await db.execute('ALTER TABLE channels ADD PRIMARY KEY (id)');
        } catch (alterError) {
          console.error('Error converting id column:', alterError.message);
          // If conversion fails, try to continue - might be a permission issue
        }
      } else if (idColumn.DATA_TYPE !== 'varchar') {
        // If it's some other type, try to convert it
        try {
        await db.execute('ALTER TABLE channels MODIFY COLUMN id VARCHAR(255) NOT NULL');
        } catch (alterError) {
          console.log('Note: Could not modify id column:', alterError.message);
        }
      }
    }

    const nameColumn = columns.find((column) => column.COLUMN_NAME === 'name');
    if (nameColumn && nameColumn.DATA_TYPE !== 'varchar') {
      try {
      await db.execute('ALTER TABLE channels MODIFY COLUMN name VARCHAR(255) NOT NULL');
      } catch (alterError) {
        console.log('Note: Could not modify name column:', alterError.message);
      }
    }

    // Ensure primary key exists
    const [existingPrimaryKeys] = await db.execute(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels' AND CONSTRAINT_TYPE = 'PRIMARY KEY'
    `, [process.env.MYSQL_DATABASE]);

    if (existingPrimaryKeys.length === 0) {
      try {
      await db.execute('ALTER TABLE channels ADD PRIMARY KEY (id)');
      } catch (pkError) {
        console.log('Note: Could not add primary key:', pkError.message);
      }
    }
  } catch (schemaError) {
    console.log('Channels schema alignment note:', schemaError.message);
  }
};

// Get database connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    console.error('Missing MySQL environment variables for channels');
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
    
    // Test the connection
    await connection.ping();
    
    console.log('Database connection successful for channels');
    return connection;
  } catch (error) {
    console.error('Database connection error in channels:', error.message);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno
    });
    return null;
  }
};

const ensureChannelsTable = async (db) => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS channels (
      id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(100),
      description TEXT,
      access_level VARCHAR(50) DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const PROTECTED_CHANNEL_IDS = new Set(['welcome', 'announcements', 'admin']);

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

  // Handle HEAD requests (for connection checks)
  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', '0');
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    try {
      // Default channels (fallback)
      const defaultChannels = [
        { id: 'welcome', name: 'welcome', displayName: 'Welcome', category: 'announcements', description: 'Welcome to THE GLITCH community!' },
        { id: 'announcements', name: 'announcements', displayName: 'Announcements', category: 'announcements', description: 'Important announcements' },
        { id: 'general', name: 'general', displayName: 'General', category: 'general', description: 'General discussion' }
      ];

      const db = await getDbConnection();
      if (db) {
        try {
          // Create channels table if it doesn't exist
          await ensureChannelsTable(db);
          await ensureChannelSchema(db);
          
          // Add access_level column if it doesn't exist
          try {
            await db.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'access_level'
            `, [process.env.MYSQL_DATABASE]).then(([columns]) => {
              if (columns.length === 0) {
                return db.execute('ALTER TABLE channels ADD COLUMN access_level VARCHAR(50) DEFAULT \'open\'');
              }
            });
          } catch (alterError) {
            // Column might already exist, ignore
            console.log('Note: access_level column check:', alterError.message);
          }

          // Check if channels table has the category column, if not add it
          try {
            // MySQL doesn't support IF NOT EXISTS for ALTER TABLE, so we check first
            const [columns] = await db.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'category'
            `, [process.env.MYSQL_DATABASE]);
            
            if (columns.length === 0) {
              await db.execute('ALTER TABLE channels ADD COLUMN category VARCHAR(100) DEFAULT NULL');
              console.log('Added category column to channels table');
            }
          } catch (alterError) {
            // Column might already exist or other error, log and continue
            console.log('Note: category column check:', alterError.message);
          }

          // Check if description column exists, add it if it doesn't
          try {
            const [descColumns] = await db.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'description'
            `, [process.env.MYSQL_DATABASE]);
            
            if (descColumns.length === 0) {
              await db.execute('ALTER TABLE channels ADD COLUMN description TEXT DEFAULT NULL');
              console.log('Added description column to channels table');
            }
          } catch (alterError) {
            // Column might already exist or other error, log and continue
            console.log('Note: description column check:', alterError.message);
          }

          // Check if is_system_channel column exists, add it with default if it doesn't
          try {
            const [isSystemColumns] = await db.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'is_system_channel'
            `, [process.env.MYSQL_DATABASE]);
            
            if (isSystemColumns.length === 0) {
              await db.execute('ALTER TABLE channels ADD COLUMN is_system_channel BOOLEAN DEFAULT FALSE');
              console.log('Added is_system_channel column to channels table');
            }
          } catch (alterError) {
            console.log('Note: is_system_channel column check:', alterError.message);
          }

          // Fetch channels from database, handle NULL categories safely
          let [rows] = [];
          try {
            [rows] = await db.execute('SELECT * FROM channels ORDER BY COALESCE(category, \'general\'), name');
          } catch (orderError) {
            // If ordering fails, try without category
            try {
              [rows] = await db.execute('SELECT * FROM channels ORDER BY name');
            } catch (fallbackError) {
              [rows] = await db.execute('SELECT * FROM channels');
            }
          }
          
          // Always ensure required channels exist (create/update if needed)
          try {
            // Fetch courses to create channels
            const [courses] = await db.execute('SELECT * FROM courses');
            
            // Insert default channels (welcome and announcements - everyone can see, only admins post)
            const defaultChannels = [
              { id: 'welcome', name: 'welcome', category: 'announcements', description: 'Welcome to THE GLITCH community!', accessLevel: 'read-only' },
              { id: 'announcements', name: 'announcements', category: 'announcements', description: 'Important announcements', accessLevel: 'read-only' }
            ];
            
            // Helper function to safely insert/update channels with description
            // Based on actual schema: id, name, category, description, access_level, is_system_channel (bit NOT NULL), hidden (bit NOT NULL), etc.
            const safeInsertChannel = async (channelId, channelName, channelCategory, channelDescription, channelAccess) => {
              try {
                const isSystemChannel = PROTECTED_CHANNEL_IDS.has(channelId) ? 1 : 0; // bit(1) needs 0 or 1
                const hidden = 0; // bit(1) NOT NULL - default to not hidden
                
                // Both is_system_channel and hidden exist and are NOT NULL, so we must provide them
                await db.execute(
                  'INSERT INTO channels (id, name, category, description, access_level, is_system_channel, hidden) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=?, category=?, description=?, access_level=?, is_system_channel=?, hidden=?',
                  [channelId, channelName, channelCategory, channelDescription || null, channelAccess || 'open', isSystemChannel, hidden, channelName, channelCategory, channelDescription || null, channelAccess || 'open', isSystemChannel, hidden]
                );
              } catch (insertError) {
                // If description column doesn't exist, insert without it
                if (insertError.code === 'ER_BAD_FIELD_ERROR' && insertError.message.includes('description')) {
                  const isSystemChannel = PROTECTED_CHANNEL_IDS.has(channelId) ? 1 : 0;
                  const hidden = 0;
              await db.execute(
                    'INSERT INTO channels (id, name, category, access_level, is_system_channel, hidden) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name=?, category=?, access_level=?, is_system_channel=?, hidden=?',
                    [channelId, channelName, channelCategory, channelAccess || 'open', isSystemChannel, hidden, channelName, channelCategory, channelAccess || 'open', isSystemChannel, hidden]
                  );
                } else {
                  throw insertError;
                }
              }
            };

            for (const channel of defaultChannels) {
              await safeInsertChannel(channel.id, channel.name, channel.category, channel.description, channel.accessLevel);
            }
            
            // Insert admin channel (only admins can see and post)
            await safeInsertChannel('admin', 'admin', 'staff', 'Admin-only channel', 'admin-only');
            
            // Create channels from courses (everyone can see and post)
            if (courses && courses.length > 0) {
              for (const course of courses) {
                const courseId = `course-${course.id}`;
                const courseName = (course.title || course.name || 'Unnamed Course').toLowerCase().replace(/\s+/g, '-');
                const courseDisplayName = course.title || course.name || 'Unnamed Course';
                await safeInsertChannel(courseId, courseName, 'courses', `Discussion for ${courseDisplayName}`, 'open');
              }
            }
            
            // Ensure all courses from defaultCourses are also in the database
            const defaultCourses = [
              { id: 1, title: "E-Commerce" },
              { id: 2, title: "Health & Fitness" },
              { id: 3, title: "Trading" },
              { id: 4, title: "Real Estate" },
              { id: 5, title: "Social Media" },
              { id: 6, title: "Psychology and Mindset" },
              { id: 7, title: "Algorithmic AI" },
              { id: 8, title: "Crypto" }
            ];
            
            for (const course of defaultCourses) {
              const courseId = `course-${course.id}`;
              const courseName = course.title.toLowerCase().replace(/\s+/g, '-');
              await safeInsertChannel(courseId, courseName, 'courses', `Discussion for ${course.title}`, 'open');
            }
            
            // Add trading channels (everyone can see and post)
            const tradingChannels = [
              { id: 'forex', name: 'forex', category: 'trading', description: 'Forex trading discussions' },
              { id: 'crypto', name: 'crypto', category: 'trading', description: 'Cryptocurrency trading discussions' },
              { id: 'stocks', name: 'stocks', category: 'trading', description: 'Stock market discussions' },
              { id: 'indices', name: 'indices', category: 'trading', description: 'Indices trading discussions' },
              { id: 'day-trading', name: 'day-trading', category: 'trading', description: 'Day trading strategies and discussions' },
              { id: 'swing-trading', name: 'swing-trading', category: 'trading', description: 'Swing trading discussions' },
              { id: 'commodities', name: 'commodities', category: 'trading', description: 'Commodities and metals trading insights' },
              { id: 'futures', name: 'futures', category: 'trading', description: 'Futures market strategies and setups' },
              { id: 'options', name: 'options', category: 'trading', description: 'Options trading strategies and education' },
              { id: 'prop-trading', name: 'prop-trading', category: 'trading', description: 'Prop firm challenges and funded account tips' },
              { id: 'market-analysis', name: 'market-analysis', category: 'trading', description: 'Daily market analysis and trade ideas' }
            ];
            
            for (const channel of tradingChannels) {
              await safeInsertChannel(channel.id, channel.name, channel.category, channel.description, 'open');
            }
            
            // Re-fetch channels after inserting/updating
            [rows] = await db.execute('SELECT * FROM channels ORDER BY COALESCE(category, \'general\'), name');
          } catch (insertError) {
            console.error('Error creating/updating channels:', insertError.message);
          }
          
          if (rows && rows.length > 0) {
            const channels = rows.map(row => {
              // Create a proper displayName from the name
              const displayName = row.name
                .split('-')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
              
              return {
                id: row.id,
                name: row.name,
                displayName: displayName,
                category: row.category || 'general',
                description: row.description,
                accessLevel: row.access_level || 'open',
                locked: row.access_level === 'admin-only'
              };
            });
            return res.status(200).json(channels);
          }
        } catch (dbError) {
          console.error('Database error fetching channels:', dbError);
        } finally {
          try {
            await db.end();
          } catch (endError) {
            console.log('Error closing channels DB connection:', endError.message);
          }
        }
      }

      return res.status(200).json(defaultChannels);
    } catch (error) {
      console.error('Error fetching channels:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch channels.' 
      });
    }
  }

  if (req.method === 'POST') {
    try {
      const { id, name, displayName, category, description, accessLevel } = req.body || {};
      const sourceName = displayName || name;

      if (!sourceName || !sourceName.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Channel name is required'
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
        await ensureChannelsTable(db);
        await ensureChannelSchema(db);

        // Check if description column exists, add it if it doesn't
        try {
          const [descColumns] = await db.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'description'
          `, [process.env.MYSQL_DATABASE]);
          
          if (descColumns.length === 0) {
            await db.execute('ALTER TABLE channels ADD COLUMN description TEXT DEFAULT NULL');
            console.log('Added description column to channels table');
          }
        } catch (alterError) {
          // Column might already exist or other error, log and continue
          console.log('Note: description column check:', alterError.message);
        }

        const slugBase = slugify(name || sourceName) || `channel-${Date.now()}`;
        let channelId = id && id.trim() ? slugify(id) : slugBase;
        if (!channelId) {
          channelId = `channel-${Date.now()}`;
        }

        // Ensure uniqueness of ID
        let suffix = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const [existingRows] = await db.execute('SELECT id FROM channels WHERE id = ?', [channelId]);
          if (!existingRows || existingRows.length === 0) break;
          suffix += 1;
          channelId = `${slugBase}-${suffix}`;
        }

        const channelName = slugify(name || sourceName) || channelId;
        const channelCategory = normalizeCategory(category);
        const channelDescription = description || '';
        const channelAccess = normalizeAccessLevel(accessLevel);
        const locked = channelAccess === 'admin-only';

        const [existingByName] = await db.execute('SELECT id FROM channels WHERE name = ?', [channelName]);
        if (existingByName && existingByName.length > 0) {
          return res.status(409).json({
            success: false,
            message: 'A channel with this name already exists.'
          });
        }

        // Insert channel - both is_system_channel and hidden are bit(1) NOT NULL, so we must provide them
        try {
          const isSystemChannel = PROTECTED_CHANNEL_IDS.has(channelId) ? 1 : 0; // bit(1) needs 0 or 1
          const hidden = 0; // bit(1) NOT NULL - default to not hidden
          
          await db.execute(
            'INSERT INTO channels (id, name, category, description, access_level, is_system_channel, hidden) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [channelId, channelName, channelCategory, channelDescription || null, channelAccess || 'open', isSystemChannel, hidden]
          );
        } catch (insertError) {
          // If description column doesn't exist, insert without it
          if (insertError.code === 'ER_BAD_FIELD_ERROR' && insertError.message.includes('description')) {
            const isSystemChannel = PROTECTED_CHANNEL_IDS.has(channelId) ? 1 : 0;
            const hidden = 0;
        await db.execute(
              'INSERT INTO channels (id, name, category, access_level, is_system_channel, hidden) VALUES (?, ?, ?, ?, ?, ?)',
              [channelId, channelName, channelCategory, channelAccess || 'open', isSystemChannel, hidden]
        );
          } else {
            throw insertError;
          }
        }

        return res.status(201).json({
          success: true,
          channel: {
            id: channelId,
            name: channelName,
            displayName: displayName || toDisplayName(channelName),
            category: channelCategory,
            description: channelDescription,
            accessLevel: channelAccess,
            locked
          }
        });
      } catch (dbError) {
        console.error('Database error creating channel:', dbError);
        if (dbError?.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({
            success: false,
            message: 'A channel with this identifier already exists.'
          });
        }

        return res.status(500).json({
          success: false,
          message: 'Failed to create channel',
          error: dbError.message
        });
      } finally {
        try {
          await db.end();
        } catch (endError) {
          console.log('Error closing channels DB connection after create:', endError.message);
        }
      }
    } catch (error) {
      console.error('Error creating channel:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const channelId =
        req.query.id ||
        req.query.channelId ||
        req.body?.id ||
        req.body?.channelId;

      if (!channelId) {
        return res.status(400).json({
          success: false,
          message: 'Channel ID is required'
        });
      }

      if (PROTECTED_CHANNEL_IDS.has(channelId)) {
        return res.status(403).json({
          success: false,
          message: 'This channel cannot be deleted'
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
        await ensureChannelsTable(db);

        await db.execute('DELETE FROM messages WHERE channel_id = ?', [channelId]);
        const [result] = await db.execute('DELETE FROM channels WHERE id = ?', [channelId]);
        await db.end();

        if (result.affectedRows === 0) {
          return res.status(404).json({
            success: false,
            message: 'Channel not found'
          });
        }

        return res.status(200).json({
          success: true,
          message: 'Channel deleted successfully'
        });
      } catch (dbError) {
        console.error('Database error deleting channel:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to delete channel'
        });
      }
    } catch (error) {
      console.error('Error deleting channel:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};

