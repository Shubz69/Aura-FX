const mysql = require('mysql2/promise');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

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
    'free',
    'read-only',
    'admin-only',
    'premium',
    'a7fx',
    'elite',
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

const ensureSettingsTable = async (db) => {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS community_settings (
        id VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('Error ensuring settings table:', error);
  }
};

const PROTECTED_CHANNEL_IDS = new Set(['welcome', 'announcements', 'admin']);

const { getEntitlements, getChannelPermissions } = require('../utils/entitlements');

function decodeToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const padded = padding ? payload + '='.repeat(4 - padding) : payload;
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

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
    const decoded = decodeToken(req.headers.authorization);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ success: false, errorCode: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    try {
      // Default channels (fallback)
      const defaultChannels = [
        { id: 'welcome', name: 'welcome', displayName: 'Welcome', category: 'announcements', description: 'Welcome to AURA FX community!' },
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

          // Check if permission_type column exists, add it with default if it doesn't
          try {
            const [permissionColumns] = await db.execute(`
              SELECT COLUMN_NAME 
              FROM INFORMATION_SCHEMA.COLUMNS 
              WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'permission_type'
            `, [process.env.MYSQL_DATABASE]);
            
            if (permissionColumns.length === 0) {
              await db.execute('ALTER TABLE channels ADD COLUMN permission_type VARCHAR(50) DEFAULT \'read-write\'');
              console.log('Added permission_type column to channels table');
            }
          } catch (alterError) {
            console.log('Note: permission_type column check:', alterError.message);
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

            // TRADING CHANNELS - Open access for all users to see and post
            const tradingChannels = [
              { id: 'forex', name: 'forex', category: 'trading', description: 'Forex trading discussions', accessLevel: 'open' },
              { id: 'crypto', name: 'crypto', category: 'trading', description: 'Cryptocurrency trading discussions', accessLevel: 'open' },
              { id: 'stocks', name: 'stocks', category: 'trading', description: 'Stock market discussions', accessLevel: 'open' },
              { id: 'indices', name: 'indices', category: 'trading', description: 'Indices trading discussions', accessLevel: 'open' },
              { id: 'day-trading', name: 'day-trading', category: 'trading', description: 'Day trading strategies and discussions', accessLevel: 'open' },
              { id: 'swing-trading', name: 'swing-trading', category: 'trading', description: 'Swing trading discussions', accessLevel: 'open' },
              { id: 'commodities', name: 'commodities', category: 'trading', description: 'Commodities and metals trading insights', accessLevel: 'open' },
              { id: 'futures', name: 'futures', category: 'trading', description: 'Futures market strategies and setups', accessLevel: 'open' },
              { id: 'options', name: 'options', category: 'trading', description: 'Options trading strategies and education', accessLevel: 'open' },
              { id: 'prop-trading', name: 'prop-trading', category: 'trading', description: 'Prop firm challenges and funded account tips', accessLevel: 'open' },
              { id: 'market-analysis', name: 'market-analysis', category: 'trading', description: 'Daily market analysis and trade ideas', accessLevel: 'open' }
            ];
            
            for (const channel of tradingChannels) {
              await safeInsertChannel(channel.id, channel.name, channel.category, channel.description, channel.accessLevel);
            }
            
            // Re-fetch channels after inserting/updating
            [rows] = await db.execute('SELECT * FROM channels ORDER BY COALESCE(category, \'general\'), name');
          } catch (insertError) {
            console.error('Error creating/updating channels:', insertError.message);
          }
          
          if (rows && rows.length > 0) {
            // Return ALL channels, not just trading ones
            const allChannels = rows
              .map(row => {
                // Create a proper displayName from the name
                const displayName = row.name
                  .split('-')
                  .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');
                
                // Determine access level and lock status
                const isGeneral = row.category === 'general' || row.name === 'general' || row.id === 'general';
                const isTrading = row.category === 'trading';
                const accessLevel = row.access_level || (isGeneral ? 'open' : 'admin-only');
                const locked = accessLevel === 'admin-only' || accessLevel === 'admin';
                
                return {
                  id: row.id,
                  name: row.name,
                  displayName: displayName,
                  category: row.category || (isGeneral ? 'general' : 'trading'),
                  description: row.description,
                  accessLevel: accessLevel,
                  permissionType: row.permission_type || 'read-write',
                  locked: locked
                };
              });
            // Single source of truth: add per-channel permission flags from entitlements (effectiveTier)
            let entitlements = { role: 'USER', tier: 'FREE', effectiveTier: 'FREE', allowedChannelSlugs: [] };
            try {
              const [userRows] = await db.execute(
                'SELECT id, email, role, subscription_plan, subscription_status, subscription_expiry, payment_failed FROM users WHERE id = ?',
                [decoded.id]
              );
              if (userRows && userRows.length > 0) {
                entitlements = getEntitlements(userRows[0]);
                const { getAllowedChannelSlugs } = require('../utils/entitlements');
                entitlements.allowedChannelSlugs = getAllowedChannelSlugs(entitlements, allChannels);
              }
            } catch (e) {
              // keep default FREE entitlements
            }
            const channelsWithFlags = allChannels.map((ch) => {
              const perm = getChannelPermissions(entitlements, {
                id: ch.id,
                name: ch.name,
                access_level: ch.accessLevel,
                permission_type: ch.permissionType
              });
              return { ...ch, canSee: perm.canSee, canRead: perm.canRead, canWrite: perm.canWrite, locked: perm.locked };
            });
            return res.status(200).json(channelsWithFlags);
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

  // Handle channel order POST - MUST come before general POST handler
  if (req.method === 'POST' && (req.body?.channelOrder || (typeof req.body === 'string' && req.body.includes('channelOrder')))) {
    try {
      // Parse request body if needed (Vercel sometimes passes it as a string)
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
        }
      }
      
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        await ensureSettingsTable(db);
        const channelOrder = body.channelOrder;
        
        if (typeof channelOrder !== 'object' || channelOrder === null) {
          return res.status(400).json({ success: false, message: 'Invalid channel order format' });
        }

        await db.execute(
          'INSERT INTO community_settings (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP',
          ['channelOrder', JSON.stringify(channelOrder), JSON.stringify(channelOrder)]
        );

        await db.end();
        return res.status(200).json({ success: true, message: 'Channel order saved' });
      } catch (dbError) {
        console.error('Database error saving channel order:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    } catch (error) {
      console.error('Error in channel order save handler:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Handle category order POST - MUST come before general POST handler
  if (req.method === 'POST' && (req.body?.categoryOrder || (typeof req.body === 'string' && req.body.includes('categoryOrder')))) {
    try {
      // Parse request body if needed (Vercel sometimes passes it as a string)
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
        }
      }
      
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }

      try {
        await ensureSettingsTable(db);
        const order = Array.isArray(body.categoryOrder) ? body.categoryOrder : [];
        
        // Validate order array
        if (order.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Category order cannot be empty'
          });
        }

        // Upsert category order
        await db.execute(
          'INSERT INTO community_settings (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP',
          ['category_order', JSON.stringify(order), JSON.stringify(order)]
        );

        await db.end();
        return res.status(200).json({
          success: true,
          message: 'Category order updated successfully',
          data: order
        });
      } catch (dbError) {
        console.error('Database error saving category order:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to save category order'
        });
      }
    } catch (error) {
      console.error('Error saving category order:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  if (req.method === 'POST') {
    try {
      // Parse request body if needed (Vercel sometimes passes it as a string)
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
        }
      }
      
      const { id, name, displayName, category, description, accessLevel, permissionType } = body || {};
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
        const channelPermission = (permissionType || 'read-write').toLowerCase();
        const locked = channelAccess === 'admin-only';

        const [existingByName] = await db.execute('SELECT id FROM channels WHERE name = ?', [channelName]);
        if (existingByName && existingByName.length > 0) {
          // If channel with same name exists, suggest updating it instead
          return res.status(409).json({
            success: false,
            message: `A channel with the name "${channelName}" already exists. Please use a different name or update the existing channel.`,
            existingChannelId: existingByName[0].id
          });
        }

        // Insert channel - both is_system_channel and hidden are bit(1) NOT NULL, so we must provide them
        try {
          const isSystemChannel = PROTECTED_CHANNEL_IDS.has(channelId) ? 1 : 0; // bit(1) needs 0 or 1
          const hidden = 0; // bit(1) NOT NULL - default to not hidden
          
          await db.execute(
            'INSERT INTO channels (id, name, category, description, access_level, permission_type, is_system_channel, hidden) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [channelId, channelName, channelCategory, channelDescription || null, channelAccess || 'open', channelPermission, isSystemChannel, hidden]
          );
        } catch (insertError) {
          // If description column doesn't exist, insert without it
          if (insertError.code === 'ER_BAD_FIELD_ERROR' && insertError.message.includes('description')) {
            const isSystemChannel = PROTECTED_CHANNEL_IDS.has(channelId) ? 1 : 0;
            const hidden = 0;
        await db.execute(
              'INSERT INTO channels (id, name, category, access_level, permission_type, is_system_channel, hidden) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [channelId, channelName, channelCategory, channelAccess || 'open', channelPermission, isSystemChannel, hidden]
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
            permissionType: channelPermission,
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

  if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      // Parse request body if needed (Vercel sometimes passes it as a string)
      let body = req.body;
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (parseError) {
          return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
        }
      }
      
      const { id, name, displayName, category, description, accessLevel, permissionType } = body || {};
      const channelId = id || req.query.id;

      if (!channelId) {
        return res.status(400).json({
          success: false,
          message: 'Channel ID is required'
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

        // Check if channel exists
        const [existingRows] = await db.execute('SELECT * FROM channels WHERE id = ?', [channelId]);
        if (!existingRows || existingRows.length === 0) {
          return res.status(404).json({
            success: false,
            message: 'Channel not found'
          });
        }

        const updates = [];
        const values = [];

        if (name !== undefined) {
          const channelName = slugify(name);
          updates.push('name = ?');
          values.push(channelName);
        }

        if (category !== undefined) {
          const channelCategory = normalizeCategory(category);
          updates.push('category = ?');
          values.push(channelCategory);
        }

        if (description !== undefined) {
          updates.push('description = ?');
          values.push(description || null);
        }

        if (accessLevel !== undefined) {
          const channelAccess = normalizeAccessLevel(accessLevel);
          updates.push('access_level = ?');
          values.push(channelAccess);
        }

        if (permissionType !== undefined) {
          const channelPermission = (permissionType || 'read-write').toLowerCase();
          // Check if permission_type column exists before trying to update
          updates.push('permission_type = ?');
          values.push(channelPermission);
        }

        if (updates.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No fields to update'
          });
        }

        values.push(channelId);
        await db.execute(
          `UPDATE channels SET ${updates.join(', ')} WHERE id = ?`,
          values
        );

        // Fetch updated channel
        const [updatedRows] = await db.execute('SELECT * FROM channels WHERE id = ?', [channelId]);
        const updatedChannel = updatedRows[0];

        const displayNameFinal = displayName || toDisplayName(updatedChannel.name);
        const locked = (updatedChannel.access_level || 'open') === 'admin-only';

        await db.end();

        return res.status(200).json({
          success: true,
          channel: {
            id: updatedChannel.id,
            name: updatedChannel.name,
            displayName: displayNameFinal,
            permissionType: updatedChannel.permission_type || 'read-write',
            category: updatedChannel.category || 'general',
            description: updatedChannel.description,
            accessLevel: updatedChannel.access_level || 'open',
            locked
          }
        });
      } catch (dbError) {
        console.error('Database error updating channel:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to update channel',
          error: dbError.message
        });
      }
    } catch (error) {
      console.error('Error updating channel:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Handle category order GET/POST
  // Handle channel order request
  if (req.method === 'GET' && req.query.channelOrder === 'true') {
    try {
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        await ensureSettingsTable(db);
        const [rows] = await db.execute(
          'SELECT value FROM community_settings WHERE id = ?',
          ['channelOrder']
        );

        if (rows && rows.length > 0) {
          try {
            const channelOrder = JSON.parse(rows[0].value);
            await db.end();
            return res.status(200).json({ success: true, channelOrder });
          } catch (parseError) {
            console.error('Error parsing channel order:', parseError);
          }
        }

        await db.end();
        return res.status(200).json({ success: true, channelOrder: {} });
      } catch (dbError) {
        console.error('Database error fetching channel order:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({ success: false, message: 'Database error' });
      }
    } catch (error) {
      console.error('Error in channel order handler:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  if (req.method === 'GET' && req.query.categoryOrder === 'true') {
    try {
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }

      try {
        await ensureSettingsTable(db);
        const [rows] = await db.execute(
          'SELECT value FROM community_settings WHERE id = ?',
          ['category_order']
        );

        if (rows && rows.length > 0) {
          const order = JSON.parse(rows[0].value);
          return res.status(200).json({
            success: true,
            data: order
          });
        } else {
          // Return default order if not set
          const defaultOrder = ['announcements', 'staff', 'courses', 'trading', 'general', 'support', 'premium', 'a7fx'];
          return res.status(200).json({
            success: true,
            data: defaultOrder
          });
        }
      } catch (dbError) {
        console.error('Database error fetching category order:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch category order'
        });
      }
    } catch (error) {
      console.error('Error fetching category order:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};

