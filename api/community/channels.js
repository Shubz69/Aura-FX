// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');
const { getDbConnection } = require('../db');
const { jsonSafeDeep } = require('../utils/jsonSafe');

function safeJsonParse(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  try {
    return JSON.parse(typeof raw === 'string' ? raw : String(raw));
  } catch {
    return fallback;
  }
}

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

// Release pool connection when done (use instead of db.end())
const releaseDb = (db) => {
  if (db && typeof db.release === 'function') {
    try { db.release(); } catch (_) {}
  }
};

/** Heavy INFORMATION_SCHEMA + possible ALTERs â€” once per warm serverless instance is enough. */
let channelsHeavySchemaDone = false;
/** tradingâ†’forums migration + settings JSON fix â€” once per instance. */
let channelsTradingMigrateDone = false;

function isBenignChannelDdlError(e) {
  if (!e) return false;
  if (e.code === 'ER_DUP_FIELDNAME' || e.code === 'ER_DUP_KEYNAME') return true;
  const errno = Number(e.errno);
  if (errno === 1060 || errno === 1061) return true;
  const msg = `${e.message || ''} ${e.sqlMessage || ''}`;
  return /duplicate column name/i.test(msg) || /duplicate key name/i.test(msg);
}

async function loadChannelColumnSet(db) {
  if (!process.env.MYSQL_DATABASE) return new Set();
  try {
    const [cols] = await db.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'channels'`,
      [process.env.MYSQL_DATABASE]
    );
    return new Set((cols || []).map((c) => c.COLUMN_NAME));
  } catch {
    return new Set();
  }
}

async function ensureChannelColumnsFromSet(db, colSet) {
  const tryAdd = async (colName, ddl) => {
    if (colSet.has(colName)) return;
    try {
      await db.execute(ddl);
      colSet.add(colName);
    } catch (e) {
      if (!isBenignChannelDdlError(e)) {
        console.log(`Note: channels column ${colName}:`, e.message);
      } else {
        colSet.add(colName);
      }
    }
  };
  await tryAdd('access_level', "ALTER TABLE channels ADD COLUMN access_level VARCHAR(50) DEFAULT 'open'");
  await tryAdd('category', 'ALTER TABLE channels ADD COLUMN category VARCHAR(100) DEFAULT NULL');
  await tryAdd('description', 'ALTER TABLE channels ADD COLUMN description TEXT DEFAULT NULL');
  await tryAdd('is_system_channel', 'ALTER TABLE channels ADD COLUMN is_system_channel BOOLEAN DEFAULT FALSE');
  await tryAdd('permission_type', "ALTER TABLE channels ADD COLUMN permission_type VARCHAR(50) DEFAULT 'read-write'");
  await tryAdd('hidden', 'ALTER TABLE channels ADD COLUMN hidden BOOLEAN DEFAULT FALSE');
}

/** One round-trip seed of default channels (ON DUPLICATE KEY UPDATE). */
async function bulkUpsertDefaultChannels(db) {
  const seeds = [
    ['welcome', 'welcome', 'announcements', 'Welcome to Aura Terminal™ community. Read the rules and click the checkmark below to unlock your channels.', 'open'],
    ['announcements', 'announcements', 'announcements', 'Important announcements from AURA TERMINAL™.', 'open'],
    ['levels', 'levels', 'announcements', 'Level-up celebrations and progress.', 'open'],
    ['general', 'general', 'general', 'General chat for all free subscribers. Say hello and join the conversation.', 'open'],
    ['forex', 'forex-talk', 'forums', 'Forex Talk â€” discussion and ideas', 'open'],
    ['crypto', 'crypto-talk', 'forums', 'Crypto Talk â€” discussion and ideas', 'open'],
    ['stocks', 'stocks-talk', 'forums', 'Stocks Talk â€” discussion and ideas', 'open'],
    ['indices', 'indices-talk', 'forums', 'Indices Talk â€” discussion and ideas', 'open'],
    ['day-trading', 'day-trading-talk', 'forums', 'Day Trading Talk â€” strategies and discussion', 'open'],
    ['swing-trading', 'swing-trading-talk', 'forums', 'Swing Trading Talk â€” discussion and ideas', 'open'],
    ['commodities', 'commodity-talk', 'forums', 'Commodity Talk â€” metals, energy, and more', 'open'],
    ['futures', 'futures-talk', 'forums', 'Futures Talk â€” strategies and setups', 'open'],
    ['options', 'options-talk', 'forums', 'Options Talk â€” education and discussion', 'open'],
    ['prop-trading', 'prop-trading-talk', 'forums', 'Prop Trading Talk â€” funded accounts and firms', 'open'],
    ['market-analysis', 'market-analysis-talk', 'forums', 'Market Analysis Talk â€” ideas and commentary', 'open']
  ];
  const rows = seeds.map(([id, name, cat, desc, access]) => {
    const isSystem = PROTECTED_CHANNEL_IDS.has(id) ? 1 : 0;
    return [id, name, cat, desc, access, isSystem, 0];
  });
  const placeholders = rows.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
  const flat = rows.flat();
  try {
    await db.execute(
      `INSERT INTO channels (id, name, category, description, access_level, is_system_channel, hidden) VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), description = VALUES(description),
         access_level = VALUES(access_level), is_system_channel = VALUES(is_system_channel), hidden = VALUES(hidden)`,
      flat
    );
  } catch (e) {
    if (e.code === 'ER_BAD_FIELD_ERROR' && (e.message || '').includes('description')) {
      const ph2 = rows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
      const flat2 = rows.map(([id, name, cat, _d, access, isSystem, hidden]) => [id, name, cat, access, isSystem, hidden]).flat();
      await db.execute(
        `INSERT INTO channels (id, name, category, access_level, is_system_channel, hidden) VALUES ${ph2}
         ON DUPLICATE KEY UPDATE name = VALUES(name), category = VALUES(category), access_level = VALUES(access_level),
           is_system_channel = VALUES(is_system_channel), hidden = VALUES(hidden)`,
        flat2
      );
      return;
    }
    throw e;
  }
}

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

const PROTECTED_CHANNEL_IDS = new Set(['welcome', 'announcements', 'levels', 'admin']);

/** Default category order â€” `forums` replaces legacy `trading` */
const DEFAULT_CATEGORY_ORDER = ['announcements', 'staff', 'courses', 'forums', 'general', 'support', 'premium', 'a7fx'];

/**
 * One-time style migration: trading â†’ forums, channel display names â†’ *-talk slugs.
 * Idempotent: safe to run on every channels bootstrap.
 */
async function migrateTradingCategoryToForums(db) {
  try {
    await db.execute(`UPDATE channels SET category = 'forums' WHERE category = 'trading'`);
    const renames = [
      ['commodities', 'commodity-talk'],
      ['crypto', 'crypto-talk'],
      ['stocks', 'stocks-talk'],
      ['indices', 'indices-talk'],
      ['day-trading', 'day-trading-talk'],
      ['swing-trading', 'swing-trading-talk'],
      ['futures', 'futures-talk'],
      ['options', 'options-talk'],
      ['prop-trading', 'prop-trading-talk'],
      ['market-analysis', 'market-analysis-talk'],
      ['forex', 'forex-talk']
    ];
    for (const [id, nm] of renames) {
      try {
        await db.execute('UPDATE channels SET name = ? WHERE id = ?', [nm, id]);
      } catch (e) {
        console.warn(`migrateTradingCategoryToForums rename ${id}:`, e.message);
      }
    }
  } catch (e) {
    console.warn('migrateTradingCategoryToForums (channels):', e.message);
  }
  try {
    const [rows] = await db.execute(
      'SELECT id, value FROM community_settings WHERE id IN (?, ?)',
      ['category_order', 'channelOrder']
    );
    for (const row of rows || []) {
      if (!row.value) continue;
      let val;
      try {
        val = JSON.parse(row.value);
      } catch {
        continue;
      }
      if (row.id === 'category_order' && Array.isArray(val)) {
        const next = val.map((c) => (c === 'trading' ? 'forums' : c));
        if (JSON.stringify(next) !== JSON.stringify(val)) {
          await db.execute(
            'INSERT INTO community_settings (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP',
            [row.id, JSON.stringify(next), JSON.stringify(next)]
          );
        }
      }
      if (row.id === 'channelOrder' && val && typeof val === 'object' && !Array.isArray(val) && val.trading && !val.forums) {
        const next = { ...val, forums: val.trading };
        delete next.trading;
        await db.execute(
          'INSERT INTO community_settings (id, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?, updated_at = CURRENT_TIMESTAMP',
          ['channelOrder', JSON.stringify(next), JSON.stringify(next)]
        );
      }
    }
  } catch (e) {
    console.warn('migrateTradingCategoryToForums (settings):', e.message);
  }
}

const { getEntitlements, getChannelPermissions, getAllowedChannelSlugs } = require('../utils/entitlements');
const { applyScheduledDowngrade } = require('../utils/apply-scheduled-downgrade');

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

    // GET with ?channelOrder=true or ?categoryOrder=true (same auth, return order only)
    if (req.query.channelOrder === 'true') {
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
          releaseDb(db);
          if (rows && rows.length > 0) {
            const channelOrder = safeJsonParse(rows[0].value, {});
            if (channelOrder && typeof channelOrder === 'object') {
              return res.status(200).json({ success: true, channelOrder: jsonSafeDeep(channelOrder) });
            }
          }
          return res.status(200).json({ success: true, channelOrder: {} });
        } catch (dbError) {
          console.error('Database error fetching channel order:', dbError);
          releaseDb(db);
          return res.status(500).json({ success: false, message: 'Database error' });
        }
      } catch (error) {
        console.error('Error in channel order handler:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }

    if (req.query.categoryOrder === 'true') {
      try {
        const db = await getDbConnection();
        if (!db) {
          return res.status(500).json({ success: false, message: 'Database connection error' });
        }
        try {
          await ensureSettingsTable(db);
          const [rows] = await db.execute(
            'SELECT value FROM community_settings WHERE id = ?',
            ['category_order']
          );
          if (rows && rows.length > 0) {
            const order = safeJsonParse(rows[0].value, DEFAULT_CATEGORY_ORDER);
            releaseDb(db);
            const payload = Array.isArray(order) ? order : DEFAULT_CATEGORY_ORDER;
            return res.status(200).json({ success: true, data: jsonSafeDeep(payload) });
          }
          releaseDb(db);
          return res.status(200).json({ success: true, data: DEFAULT_CATEGORY_ORDER });
        } catch (dbError) {
          console.error('Database error fetching category order:', dbError);
          releaseDb(db);
          return res.status(500).json({ success: false, message: 'Database error' });
        }
      } catch (error) {
        console.error('Error in category order handler:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
      }
    }

    try {
      // Default channels (fallback) - include canSee/canRead so free users see them
      const defaultChannels = [
        { id: 'welcome', name: 'welcome', displayName: 'Welcome', category: 'announcements', description: 'Welcome to Aura Terminal™ community!', canSee: true, canRead: true, canWrite: false },
        { id: 'announcements', name: 'announcements', displayName: 'Announcements', category: 'announcements', description: 'Important announcements', canSee: true, canRead: true, canWrite: false },
        { id: 'levels', name: 'levels', displayName: 'Levels', category: 'announcements', description: 'Level-up celebrations', canSee: true, canRead: true, canWrite: false },
        { id: 'general', name: 'general', displayName: 'General', category: 'general', description: 'General discussion', canSee: true, canRead: true, canWrite: true }
      ];

      const db = await getDbConnection();
      if (db) {
        try {
          // Create channels table if it doesn't exist
          await ensureChannelsTable(db);
          if (!channelsHeavySchemaDone) {
            await ensureChannelSchema(db);
            channelsHeavySchemaDone = true;
          }

          const colSet = await loadChannelColumnSet(db);
          await ensureChannelColumnsFromSet(db, colSet);

          let [rows] = [];
          try {
            [rows] = await db.execute('SELECT * FROM channels ORDER BY COALESCE(category, \'general\'), name');
          } catch (orderError) {
            try {
              [rows] = await db.execute('SELECT * FROM channels ORDER BY name');
            } catch (fallbackError) {
              [rows] = await db.execute('SELECT * FROM channels');
            }
          }

          try {
            await bulkUpsertDefaultChannels(db);
            if (!channelsTradingMigrateDone) {
              try {
                await migrateTradingCategoryToForums(db);
              } catch (migErr) {
                console.warn('migrateTradingCategoryToForums:', migErr.message);
              }
              channelsTradingMigrateDone = true;
            }
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
                const accessLevel = row.access_level || (isGeneral ? 'open' : 'admin-only');
                const locked = accessLevel === 'admin-only' || accessLevel === 'admin';
                const rawCat = row.category || (isGeneral ? 'general' : 'forums');
                const categoryNorm = rawCat === 'trading' ? 'forums' : rawCat;
                
                return {
                  id: row.id,
                  name: row.name,
                  displayName: displayName,
                  category: categoryNorm,
                  description: row.description,
                  accessLevel: accessLevel,
                  permissionType: row.permission_type || 'read-write',
                  locked: locked
                };
              });
            // Single source of truth: add per-channel permission flags from entitlements (effectiveTier)
            let entitlements = { role: 'USER', tier: 'ACCESS', effectiveTier: 'ACCESS', allowedChannelSlugs: [] };
            try {
              const userId = decoded.id != null ? String(decoded.id) : null;
              // Pass same DB connection â€” pool is often size 1 on Vercel; nested executeQuery() deadlocks â†’ 504
              const userRow = userId ? await applyScheduledDowngrade(userId, db) : null;
              if (userRow) {
                entitlements = getEntitlements(userRow);
                entitlements.allowedChannelSlugs = getAllowedChannelSlugs(entitlements, allChannels);
              } else {
                const freeDefaultIds = ['welcome', 'announcements', 'levels', 'general'];
                entitlements.allowedChannelSlugs = allChannels
                  .filter((c) => freeDefaultIds.includes(String(c.id || c.name || '').toLowerCase()))
                  .map((c) => c.id || c.name)
                  .filter(Boolean);
              }
              // JWT fallback: if token has ADMIN or SUPER_ADMIN role, grant full channel access (e.g. when DB lookup fails or role not synced)
              const jwtRole = (decoded.role || '').toString().toUpperCase();
              if (jwtRole === 'ADMIN' || jwtRole === 'SUPER_ADMIN') {
                entitlements.role = jwtRole;
                entitlements.allowedChannelSlugs = allChannels.map((c) => c.id || c.name).filter(Boolean);
              }
            } catch (e) {
              // JWT fallback: even on error, grant full access if token says admin/super_admin
              const jwtRole = (decoded.role || '').toString().toUpperCase();
              if (jwtRole === 'ADMIN' || jwtRole === 'SUPER_ADMIN') {
                entitlements = { role: jwtRole, tier: 'ELITE', effectiveTier: 'ELITE', allowedChannelSlugs: allChannels.map((c) => c.id || c.name).filter(Boolean) };
              }
            }
            const allowedSet = new Set((entitlements.allowedChannelSlugs || []).map((s) => String(s).toLowerCase()));
            const channelsWithFlags = allChannels.map((ch) => {
              const perm = getChannelPermissions(entitlements, {
                id: ch.id,
                name: ch.name,
                category: ch.category,
                access_level: ch.accessLevel,
                permission_type: ch.permissionType
              });
              const chId = (ch.id || ch.name || '').toString().toLowerCase();
              const inAllowed = allowedSet.has(chId);
              const canSee = perm.canSee && inAllowed;
              return { ...ch, canSee, canRead: canSee && perm.canRead, canWrite: canSee && perm.canWrite, locked: perm.locked };
            });
            const visibleOnly = channelsWithFlags.filter((ch) => ch.canSee === true);
            // Single bootstrap response: channels + categoryOrder + channelOrder (faster load)
            if (req.query.bootstrap === 'true') {
              try {
                await ensureSettingsTable(db);
                const [[catRows], [chanRows]] = await Promise.all([
                  db.execute('SELECT value FROM community_settings WHERE id = ?', ['category_order']),
                  db.execute('SELECT value FROM community_settings WHERE id = ?', ['channelOrder'])
                ]);
                const categoryOrder = (catRows && catRows[0] && catRows[0].value)
                  ? safeJsonParse(catRows[0].value, DEFAULT_CATEGORY_ORDER)
                  : DEFAULT_CATEGORY_ORDER;
                const channelOrder = (chanRows && chanRows[0] && chanRows[0].value)
                  ? safeJsonParse(chanRows[0].value, {})
                  : {};
                const catPayload = Array.isArray(categoryOrder) ? categoryOrder : DEFAULT_CATEGORY_ORDER;
                return res.status(200).json({
                  success: true,
                  channels: jsonSafeDeep(visibleOnly),
                  categoryOrder: jsonSafeDeep(catPayload),
                  channelOrder: jsonSafeDeep(channelOrder),
                });
              } catch (bootstrapErr) {
                console.warn('Bootstrap order fetch failed, returning channels only:', bootstrapErr.message);
              }
            }
            return res.status(200).json(jsonSafeDeep(visibleOnly));
          }
        } catch (dbError) {
          console.error('Database error fetching channels:', dbError);
        } finally {
          try {
            releaseDb(db);
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

        releaseDb(db);
        return res.status(200).json({ success: true, message: 'Channel order saved' });
      } catch (dbError) {
        console.error('Database error saving channel order:', dbError);
        releaseDb(db);
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

        releaseDb(db);
        return res.status(200).json({
          success: true,
          message: 'Category order updated successfully',
          data: order
        });
      } catch (dbError) {
        console.error('Database error saving category order:', dbError);
        releaseDb(db);
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
          releaseDb(db);
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
        releaseDb(db);

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
        releaseDb(db);
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
      const decoded = decodeToken(req.headers.authorization);
      if (!decoded || !decoded.id) {
        return res.status(401).json({ success: false, errorCode: 'UNAUTHORIZED', message: 'Authentication required' });
      }
      const { isSuperAdminEmail, normalizeRole } = require('../utils/entitlements');
      const dbForAuth = await getDbConnection();
      if (!dbForAuth) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }
      let isSuperAdmin = false;
      try {
        const [userRows] = await dbForAuth.execute(
          'SELECT id, email, role FROM users WHERE id = ?',
          [String(decoded.id)]
        );
        await dbForAuth.end();
        if (userRows && userRows.length > 0) {
          const user = userRows[0];
          isSuperAdmin = isSuperAdminEmail(user) || normalizeRole(user.role) === 'SUPER_ADMIN';
        } else {
          isSuperAdmin = (decoded.role || '').toString().toUpperCase() === 'SUPER_ADMIN';
        }
      } catch (authErr) {
        if (dbForAuth && !dbForAuth.ended) try { await dbForAuth.end(); } catch (e) { /* ignore */ }
        isSuperAdmin = (decoded.role || '').toString().toUpperCase() === 'SUPER_ADMIN';
      }
      if (!isSuperAdmin) {
        return res.status(403).json({ success: false, errorCode: 'FORBIDDEN', message: 'Only Super Admin can edit channels or categories.' });
      }

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
          /* When admin sets read-only via access level, also set permission_type for consistent enforcement */
          if (channelAccess === 'read-only' && permissionType === undefined) {
            updates.push('permission_type = ?');
            values.push('read-only');
          }
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
        const accessLevel = (updatedChannel.access_level || 'open').toLowerCase();
        const permissionType = (updatedChannel.permission_type || 'read-write').toLowerCase();
        const locked = accessLevel === 'admin-only' || accessLevel === 'admin' || permissionType === 'read-only';

        releaseDb(db);

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
        releaseDb(db);
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

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};

