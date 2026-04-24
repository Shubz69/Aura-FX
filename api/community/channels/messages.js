const { getDbConnection, executeQuery } = require('../../db');
const { jsonSafeDeep } = require('../../utils/jsonSafe');
const { getEntitlements, getChannelPermissions, canAccessChannel, isSuperAdminEmail } = require('../../utils/entitlements');
const {
  permissionRoleFromUserRow,
  canonicalSubscriptionPlanForResponse
} = require('../../utils/userResponseNormalize');
const { triggerNewMessage } = require('../../utils/pusher');

let createNotification;
try {
  createNotification = require('../../notifications').createNotification;
} catch (e) {
  createNotification = null;
}

let messagesSchemaReady = false;
let messagesSchemaCheckedAt = 0;
const SCHEMA_CHECK_TTL_MS = 10 * 60 * 1000;

// Suppress url.parse() deprecation warnings from dependencies
require('../../utils/suppress-warnings');

/** Hard caps so a single POST cannot run 60s+ on Vercel (notifications + slow outbound fetch). */
const WS_BROADCAST_TIMEOUT_MS = Number(process.env.COMMUNITY_WS_BROADCAST_TIMEOUT_MS) || 2800;
const PUSHER_TRIGGER_TIMEOUT_MS = Number(process.env.COMMUNITY_PUSHER_TIMEOUT_MS) || 4000;
const MAX_MENTION_NOTIFICATIONS_PER_MESSAGE = Number(process.env.COMMUNITY_MAX_MENTION_PUSH) || 120;
const MAX_CHANNEL_ACTIVITY_NOTIFICATIONS = Number(process.env.COMMUNITY_MAX_CHANNEL_ACTIVITY_PUSH) || 2000;
const NOTIFICATION_CONCURRENCY = Number(process.env.COMMUNITY_NOTIF_CONCURRENCY) || 12;

async function fetchWithTimeout(url, init, timeoutMs) {
  const ms = Math.max(500, Math.min(timeoutMs || 3000, 15000));
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    if (typeof fetch === 'undefined') return null;
    return await fetch(url, { ...init, signal: ac.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function triggerNewMessageBounded(channelId, message, timeoutMs) {
  const ms = Math.max(500, Math.min(timeoutMs || 4000, 10000));
  await Promise.race([
    triggerNewMessage(channelId, message),
    new Promise((resolve) => setTimeout(resolve, ms)),
  ]).catch(() => {});
}

async function runInBatches(items, concurrency, fn) {
  const n = Math.max(1, Math.min(concurrency || 8, 50));
  for (let i = 0; i < items.length; i += n) {
    const chunk = items.slice(i, i + n);
    await Promise.allSettled(chunk.map((item, j) => fn(item, i + j)));
  }
}

/** Per-channel push preferences (enabled=0 means muted by user). */
let channelPushPrefsTableReady = false;
async function ensureChannelPushPrefsTable() {
  if (channelPushPrefsTableReady) return;
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS channel_push_prefs (
        user_id INT NOT NULL,
        channel_id VARCHAR(191) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        last_push_at DATETIME NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, channel_id),
        INDEX idx_channel_throttle (channel_id, last_push_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    channelPushPrefsTableReady = true;
  } catch (e) {
    console.warn('[channel_push_prefs] ensure table:', e.message);
  }
}

async function notifyChannelActivityBroadcast(db, params) {
  const {
    createNotification: cn,
    channelIdStr,
    channelIdForDb,
    channelRow,
    channelName,
    senderId,
    senderUsername,
    bodySnippet,
    messageId,
    notifMeta,
    excludeUserIds
  } = params;
  if (!cn || !channelIdStr || !senderId) return;
  await ensureChannelPushPrefsTable();
  const activityTitle = 'New activity';
  const activityBody = `${senderUsername} in #${channelName}: ${bodySnippet}`;
  try {
    // Default behavior: everyone with channel access is eligible, unless they muted this channel.
    const [users] = await db.execute(
      `SELECT id, email, role, subscription_plan, subscription_status, subscription_expiry, payment_failed,
              onboarding_accepted, onboarding_subscription_snapshot
         FROM users
        WHERE id != ?`,
      [senderId]
    );
    const [prefRows] = await db.execute(
      'SELECT user_id, enabled FROM channel_push_prefs WHERE channel_id = ?',
      [channelIdStr]
    );
    const muted = new Set(
      (prefRows || [])
        .filter((r) => Number(r.enabled) === 0)
        .map((r) => Number(r.user_id))
        .filter((x) => Number.isFinite(x) && x > 0)
    );

    const recipients = (users || [])
      .filter((u) => {
        const uid = Number(u.id);
        if (!uid || muted.has(uid) || excludeUserIds?.has(uid)) return false;
        const ent = getEntitlements(u);
        return canAccessChannel(ent, channelIdStr, [channelRow]);
      })
      .slice(0, MAX_CHANNEL_ACTIVITY_NOTIFICATIONS);

    await runInBatches(recipients, NOTIFICATION_CONCURRENCY, async (row) => {
      const uid = Number(row.id);
      try {
        await cn({
          userId: uid,
          type: 'CHANNEL_ACTIVITY',
          title: activityTitle,
          body: activityBody,
          channelId: channelIdForDb,
          messageId,
          fromUserId: senderId,
          meta: notifMeta
        });
      } catch (err) {
        console.warn('Channel activity notification create failed:', err.message);
      }
    });
  } catch (e) {
    console.warn('Channel activity broadcast notify:', e.message);
  }
}

/**
 * Runs after HTTP response so POST returns quickly (Pusher + WS only on critical path).
 * Uses a fresh pool connection; safe if Vercel freezes the isolate after respond (best-effort).
 */
async function runCommunityMessageNotificationSideEffects(payload) {
  const {
    createNotification: cn,
    messageContent,
    newMessageId,
    channelRow,
    channelId,
    channelIdValue,
    senderId,
    senderUsername,
  } = payload;
  if (!cn || !messageContent || newMessageId == null) return;

  let db;
  try {
    db = await getDbConnection();
    if (!db) return;

    const channelName = channelRow?.name || (typeof channelId === 'string' ? channelId : `channel-${channelId}`);
    const bodySnippet = messageContent.length > 80 ? messageContent.substring(0, 77) + '...' : messageContent;
    const mentionTitle = 'You were mentioned';
    const mentionBodyText = `${senderUsername} mentioned you in #${channelName}: ${bodySnippet}`;
    const numericChannelId = (typeof channelId === 'number' && !isNaN(channelId)) ? channelId : (parseInt(channelId, 10));
    const channelIdForDb = (typeof numericChannelId === 'number' && !isNaN(numericChannelId)) ? numericChannelId : null;
    const notifMeta = {
      channelId,
      channelName,
      url: `/community?channel=${encodeURIComponent(String(channelId))}&jump=${newMessageId}&focus=1`,
    };

    const userIdsToNotify = new Set();

    const mentionRegex = /@([a-zA-Z0-9_]+)/g;
    const matches = [...messageContent.matchAll(mentionRegex)];
    const mentionedUsernames = [...new Set(matches.map(m => (m[1] || '').toLowerCase()).filter(Boolean))];
    const isEveryoneMention = mentionedUsernames.some(u => u === 'everyone' || u === 'all');
    for (const uname of mentionedUsernames) {
      if (uname === 'everyone' || uname === 'all') continue;
      if (uname === 'admin') {
        const [adminRows] = await db.execute(
          'SELECT id FROM users WHERE role IN (?, ?)',
          ['admin', 'super_admin']
        );
        (adminRows || []).forEach(r => { if (r.id && r.id !== senderId) userIdsToNotify.add(r.id); });
      } else {
        const [uRows] = await db.execute(
          'SELECT id FROM users WHERE LOWER(TRIM(username)) = ? OR LOWER(TRIM(name)) = ? LIMIT 1',
          [uname, uname]
        );
        if (uRows && uRows[0] && uRows[0].id !== senderId) userIdsToNotify.add(uRows[0].id);
      }
    }

    if (isEveryoneMention) {
      try {
        const cap = Math.min(250, MAX_MENTION_NOTIFICATIONS_PER_MESSAGE);
        const [allUserRows] = await db.execute(
          `SELECT id FROM users WHERE id != ? ORDER BY id LIMIT ${cap}`,
          [senderId]
        );
        (allUserRows || []).forEach(r => { if (r.id) userIdsToNotify.add(r.id); });
      } catch (e) {
        console.warn('@everyone notification lookup failed:', e.message);
      }
    }

    const mentionIds = [...userIdsToNotify].slice(0, MAX_MENTION_NOTIFICATIONS_PER_MESSAGE);
    if (userIdsToNotify.size > MAX_MENTION_NOTIFICATIONS_PER_MESSAGE) {
      console.warn('[community/messages] mention notifications capped', {
        requested: userIdsToNotify.size,
        cap: MAX_MENTION_NOTIFICATIONS_PER_MESSAGE
      });
    }

    try {
      await runInBatches(mentionIds, NOTIFICATION_CONCURRENCY, async (targetUserId) => {
        try {
          await cn({
            userId: targetUserId,
            type: 'MENTION',
            title: mentionTitle,
            body: mentionBodyText,
            channelId: channelIdForDb,
            messageId: newMessageId,
            fromUserId: senderId,
            meta: notifMeta
          });
        } catch (err) {
          console.warn('Mention notification create failed:', err.message);
        }
      });
    } catch (mentionErr) {
      console.warn('Mention notification create failed:', mentionErr.message);
    }

    try {
      await notifyChannelActivityBroadcast(db, {
        createNotification: cn,
        channelIdStr: String(channelIdValue),
        channelIdForDb,
        channelRow: {
          id: channelId,
          name: channelName,
          access_level: channelRow?.access_level,
          permission_type: channelRow?.permission_type,
        },
        channelName,
        senderId,
        senderUsername,
        bodySnippet,
        messageId: newMessageId,
        notifMeta,
        excludeUserIds: userIdsToNotify
      });
    } catch (chActErr) {
      console.warn('Channel activity notification:', chActErr.message);
    }
  } catch (e) {
    console.warn('[community/messages] deferred notifications failed:', e.message);
  } finally {
    if (db) {
      try {
        if (typeof db.release === 'function') db.release();
        else if (typeof db.end === 'function') await db.end();
      } catch (_) { /* ignore */ }
    }
  }
}

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

// Ensure messages table exists with correct schema
const ensureMessagesTable = async (db) => {
  if (!db || !process.env.MYSQL_DATABASE) {
    return false;
  }

  try {
    // Create table if it doesn't exist with VARCHAR channel_id (supports string IDs)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        channel_id VARCHAR(255) NOT NULL,
        sender_id INT,
        content TEXT NOT NULL,
        encrypted BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_channel (channel_id),
        INDEX idx_timestamp (timestamp),
        INDEX idx_sender (sender_id)
      )
    `);
    try {
      await db.execute('ALTER TABLE messages ADD INDEX idx_channel_id (channel_id, id)');
    } catch (_) {
      // Duplicate index / incompatible engines are safe to ignore.
    }
    console.log('Messages table ensured (created or already exists)');
    
    // Check if encrypted column exists, add it if it doesn't
    try {
      const [encryptedColumn] = await db.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'messages' 
        AND COLUMN_NAME = 'encrypted'
      `, [process.env.MYSQL_DATABASE]);
      
      if (!encryptedColumn || encryptedColumn.length === 0) {
        // Add encrypted column with default value
        await db.execute('ALTER TABLE messages ADD COLUMN encrypted BOOLEAN DEFAULT FALSE');
        console.log('Added encrypted column to messages table');
      } else {
        // Check if it has a default value
        const [columnInfo] = await db.execute(`
          SELECT COLUMN_DEFAULT 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = ? 
          AND TABLE_NAME = 'messages' 
          AND COLUMN_NAME = 'encrypted'
        `, [process.env.MYSQL_DATABASE]);
        
        if (columnInfo && columnInfo.length > 0 && columnInfo[0].COLUMN_DEFAULT === null) {
          // Set default value if it doesn't have one
          await db.execute('ALTER TABLE messages MODIFY COLUMN encrypted BOOLEAN DEFAULT FALSE');
          console.log('Set default value for encrypted column');
        }
      }
    } catch (encryptedError) {
      console.warn('Could not check/add encrypted column:', encryptedError.message);
      // Continue anyway
    }
    
    // Check if file_data column exists, add it if it doesn't
    try {
      const [fileDataColumn] = await db.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'messages' 
        AND COLUMN_NAME = 'file_data'
      `, [process.env.MYSQL_DATABASE]);
      
      if (!fileDataColumn || fileDataColumn.length === 0) {
        // Add file_data column as JSON to store file metadata
        await db.execute('ALTER TABLE messages ADD COLUMN file_data JSON DEFAULT NULL');
        console.log('Added file_data column to messages table');
      }
    } catch (fileDataError) {
      console.warn('Could not check/add file_data column:', fileDataError.message);
      // Continue anyway
    }
    
    // Check if channel_id is VARCHAR, if not, convert it
    try {
      const [columnInfo] = await db.execute(`
        SELECT DATA_TYPE, COLUMN_TYPE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? 
        AND TABLE_NAME = 'messages' 
        AND COLUMN_NAME = 'channel_id'
      `, [process.env.MYSQL_DATABASE]);
      
      if (columnInfo && columnInfo.length > 0) {
        const dataType = columnInfo[0].DATA_TYPE;
        if (dataType === 'int' || dataType === 'bigint') {
          console.log('Converting channel_id from', dataType, 'to VARCHAR(255)...');
          try {
            // Drop foreign keys first
            const [fks] = await db.execute(`
              SELECT CONSTRAINT_NAME 
              FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
              WHERE TABLE_SCHEMA = ? 
              AND TABLE_NAME = 'messages' 
              AND COLUMN_NAME = 'channel_id' 
              AND REFERENCED_TABLE_NAME IS NOT NULL
            `, [process.env.MYSQL_DATABASE]);
            
            for (const fk of fks) {
              try {
                await db.execute(`ALTER TABLE messages DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
                console.log(`Dropped foreign key: ${fk.CONSTRAINT_NAME}`);
              } catch (fkError) {
                console.warn('Could not drop foreign key:', fkError.message);
              }
            }
            
            // Convert to VARCHAR
            await db.execute('ALTER TABLE messages MODIFY COLUMN channel_id VARCHAR(255) NOT NULL');
            console.log('Successfully converted channel_id to VARCHAR(255)');
          } catch (alterError) {
            console.error('Failed to convert channel_id:', alterError.message);
            // Continue anyway
          }
        }
      }
    } catch (checkError) {
      console.warn('Could not check channel_id column:', checkError.message);
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring messages table:', error);
    return false;
  }
};

async function ensureMessagesSchemaCached(db) {
  const now = Date.now();
  if (messagesSchemaReady && (now - messagesSchemaCheckedAt) < SCHEMA_CHECK_TTL_MS) {
    return true;
  }
  const ok = await ensureMessagesTable(db);
  messagesSchemaReady = Boolean(ok);
  messagesSchemaCheckedAt = now;
  return ok;
}

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Community-Messages-Handler', 'cm-2026-04-24b');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const decoded = decodeToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({
      success: false,
      errorCode: 'UNAUTHORIZED',
      message: 'Authentication required.'
    });
  }

  // Extract channel ID from query, URL path, or request body
  // Use req.path when available (Express/Vercel) to avoid triggering url.parse() deprecation
  let channelId = req.query.channelId || req.query.id;
  
  // If not in query, try to extract from URL path
  // Vercel routes: /api/community/channels/[channelId]/messages
  // Prefer req.path over req.url to avoid triggering internal URL parsing
  const urlPath = req.path || (req.url ? req.url.split('?')[0] : '');
  if (!channelId && urlPath) {
    // Handle different URL formats
    const urlMatch = urlPath.match(/\/channels\/([^\/]+)\/messages/);
    if (urlMatch && urlMatch[1]) {
      channelId = urlMatch[1];
    } else {
      // Fallback: split URL and find channel ID
      const urlParts = urlPath.split('/');
      const channelsIndex = urlParts.indexOf('channels');
      if (channelsIndex !== -1 && urlParts[channelsIndex + 1]) {
        channelId = urlParts[channelsIndex + 1];
      }
    }
  }
  
  // Also check request body for POST requests
  if (!channelId && req.body && req.body.channelId) {
    channelId = req.body.channelId;
  }

  if (!channelId) {
    console.error('Channel ID not found in request:', { 
      path: req.path,
      query: req.query, 
      body: req.body,
      method: req.method 
    });
    return res.status(400).json({ success: false, message: 'Channel ID is required' });
  }
  
  console.log('Processing messages request for channel:', channelId, 'Method:', req.method);

  try {
    const db = await getDbConnection();
    const releaseDb = async () => {
      try {
        if (!db) return;
        if (typeof db.release === 'function') {
          db.release();
        } else if (typeof db.end === 'function') {
          await db.end();
        }
      } catch (_) {
        // ignore
      }
    };
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database unavailable' });
    }

    // Single source of truth: enforce channel access via entitlements
    const [userRows] = await db.execute(
      'SELECT id, email, role, subscription_plan, subscription_status, subscription_expiry, payment_failed, onboarding_accepted, onboarding_subscription_snapshot FROM users WHERE id = ?',
      [decoded.id]
    );
    if (!userRows || userRows.length === 0) {
      await releaseDb();
      return res.status(403).json({ success: false, errorCode: 'FORBIDDEN', message: 'Access denied.' });
    }
    let entitlements = getEntitlements(userRows[0]);
    // JWT fallback: align with channels API – if token says ADMIN/SUPER_ADMIN, grant full channel access
    const jwtRole = (decoded.role || '').toString().toUpperCase();
    if (jwtRole === 'ADMIN' || jwtRole === 'SUPER_ADMIN') {
      entitlements = { ...entitlements, role: jwtRole, tier: 'ELITE', effectiveTier: 'ELITE' };
    }

    let [channelRows] = await db.execute(
      'SELECT id, name, access_level, permission_type FROM channels WHERE id = ?',
      [channelId]
    );
    if (!channelRows || channelRows.length === 0) {
      [channelRows] = await db.execute(
        'SELECT id, name, access_level, permission_type FROM channels WHERE LOWER(id) = LOWER(?)',
        [channelId]
      );
    }
    if (!channelRows || channelRows.length === 0) {
      await releaseDb();
      return res.status(404).json({ success: false, message: 'Channel not found.' });
    }
    const channelRow = channelRows[0];
    channelId = channelRow.id;
    const perm = getChannelPermissions(entitlements, {
      id: channelRow.id,
      name: channelRow.name,
      access_level: channelRow.access_level,
      accessLevel: channelRow.access_level,
      permission_type: channelRow.permission_type,
      permissionType: channelRow.permission_type
    });
    if (!perm.canSee) {
      await releaseDb();
      return res.status(403).json({ success: false, errorCode: 'FORBIDDEN', message: 'You do not have access to this channel.' });
    }
    if (req.method === 'GET' && !perm.canRead) {
      await releaseDb();
      return res.status(403).json({ success: false, errorCode: 'FORBIDDEN', message: 'You cannot read this channel.' });
    }
    if ((req.method === 'POST' || req.method === 'PUT') && !perm.canWrite) {
      await releaseDb();
      return res.status(403).json({ success: false, errorCode: 'FORBIDDEN', message: 'You cannot post in this channel.' });
    }
    /* Announcement channels (welcome, announcements, levels, notifications): only super admin can post */
    const channelIdLower = (channelId || '').toString().toLowerCase();
    const SUPER_ADMIN_ONLY_CHANNELS = new Set(['welcome', 'announcements', 'levels', 'notifications']);
    if ((req.method === 'POST' || req.method === 'PUT') && SUPER_ADMIN_ONLY_CHANNELS.has(channelIdLower)) {
      const userRow = userRows[0];
      const isSuperAdmin = isSuperAdminEmail(userRow) || (userRow.role || '').toString().toUpperCase() === 'SUPER_ADMIN';
      if (!isSuperAdmin) {
        await releaseDb();
        return res.status(403).json({ success: false, errorCode: 'FORBIDDEN', message: 'Only the Super Admin can post in this channel.' });
      }
    }
    
    if (req.method === 'GET') {
      // Get messages for a channel
      if (!db) {
        return res.status(200).json([]); // Return empty array if DB unavailable
      }

      try {
        // Use existing table structure - don't try to create/modify
        // The actual table has: id, content, encrypted, timestamp, channel_id, sender_id
        
        // Announcements: exclude level-up and future-style messages (keep only real announcements)
        const excludeLevelUp = channelIdLower === 'announcements'
          ? " AND (m.content NOT LIKE '%LEVEL UP%' AND m.content NOT LIKE '%Level up%' AND m.content NOT LIKE '%has reached Level%' AND m.content NOT LIKE '%New Rank:%')"
          : '';
        
        // Try to fetch messages with username from users table
        // channel_id is bigint in actual table, but we receive it as string, so we need to handle both
        let [rows] = [];
        try {
          const afterId = req.query && req.query.afterId ? parseInt(req.query.afterId, 10) : null;
          const isCursor = Number.isInteger(afterId) && afterId > 0;
          if (isCursor) {
            [rows] = await db.execute(
              `SELECT m.*, u.username, u.name, u.email, u.avatar, u.role, u.subscription_plan
               FROM messages m
               LEFT JOIN users u ON m.sender_id = u.id
               WHERE m.channel_id = ? AND m.id > ? AND (m.content IS NULL OR m.content <> '[deleted]')${excludeLevelUp}
               ORDER BY m.id ASC
               LIMIT 200`,
              [channelId, afterId]
            );
          } else {
            // No-cursor reads were hitting 60s function timeouts on hot tables.
            // Bound scan by recent id windows so we can still serve "latest messages" quickly
            // even when channel_id index quality varies across environments.
            const [[maxRow]] = await db.execute('SELECT MAX(id) AS maxId FROM messages');
            const maxId = Number(maxRow?.maxId || 0);
            const windows = [5000, 50000, 500000];
            for (let i = 0; i < windows.length; i += 1) {
              const minId = Math.max(0, maxId - windows[i]);
              [rows] = await db.execute(
                `SELECT m.*, u.username, u.name, u.email, u.avatar, u.role, u.subscription_plan
                 FROM messages m
                 LEFT JOIN users u ON m.sender_id = u.id
                 WHERE m.channel_id = ? AND m.id > ? AND (m.content IS NULL OR m.content <> '[deleted]')${excludeLevelUp}
                 ORDER BY m.id DESC
                 LIMIT 200`,
                [channelId, minId]
              );
              if (rows.length > 0 || i === windows.length - 1) break;
            }
            rows = rows.reverse();
          }
        } catch (queryError) {
          // If that fails, try converting channelId to number (for numeric IDs)
          const numericChannelId = parseInt(channelId);
          if (!isNaN(numericChannelId)) {
            [rows] = await db.execute(
              `SELECT m.*, u.username, u.name, u.email, u.avatar, u.role, u.subscription_plan 
               FROM messages m 
               LEFT JOIN users u ON m.sender_id = u.id 
               WHERE m.channel_id = ? AND (m.content IS NULL OR m.content <> '[deleted]')${excludeLevelUp}
               ORDER BY m.timestamp DESC 
               LIMIT 200`,
              [numericChannelId]
            );
            // Reverse to get chronological order
            rows = rows.reverse();
          } else {
            // If channelId is not numeric and query failed, try ordering by id
            try {
              [rows] = await db.execute(
                `SELECT m.*, u.username, u.name, u.email, u.avatar, u.role, u.subscription_plan 
                 FROM messages m 
                 LEFT JOIN users u ON m.sender_id = u.id 
                 WHERE m.channel_id = ? AND (m.content IS NULL OR m.content <> '[deleted]')${excludeLevelUp}
                 ORDER BY m.id DESC 
                 LIMIT 200`,
                [channelId]
              );
              // Reverse to get chronological order
              rows = rows.reverse();
            } catch (fallbackError) {
              if (!isNaN(numericChannelId)) {
                [rows] = await db.execute(
                  `SELECT m.*, u.username, u.name, u.email, u.avatar, u.role, u.subscription_plan 
                   FROM messages m 
                   LEFT JOIN users u ON m.sender_id = u.id 
                   WHERE m.channel_id = ? AND (m.content IS NULL OR m.content <> '[deleted]')${excludeLevelUp}
                   ORDER BY m.id DESC 
                   LIMIT 200`,
                  [numericChannelId]
                );
                // Reverse to get chronological order
                rows = rows.reverse();
              } else {
                throw queryError;
              }
            }
          }
        }
        
        // Release connection back to pool
        await releaseDb();

        // Map to frontend format - handle actual column names
        const messages = rows.map(row => {
          // Get username from joined user table, fallback to name, then email prefix, then Anonymous
          const username = row.username || row.name || (row.email ? row.email.split('@')[0] : 'Anonymous');
          
          // Get avatar from user table, fallback to default
          const avatar = row.avatar ?? null;
          
          const senderRow = { role: row.role, email: row.email, subscription_plan: row.subscription_plan };
          
          // Parse file_data if present
          let fileData = null;
          if (row.file_data) {
            try {
              fileData = typeof row.file_data === 'string' 
                ? JSON.parse(row.file_data) 
                : row.file_data;
            } catch (parseError) {
              console.warn('Could not parse file_data for message', row.id, ':', parseError);
            }
          }
          
          // Check if message is deleted (soft-delete)
          const isDeleted = !!row.deleted_at || row.content === '[deleted]';
          
          return {
            id: row.id,
            sequence: row.id,
            channelId: row.channel_id,
            userId: row.sender_id,
            username: username,
            content: row.content,
            createdAt: row.timestamp,
            timestamp: row.timestamp,
            file: fileData, // Include file data if present
            isDeleted: isDeleted, // Include deleted state
            deletedAt: row.deleted_at || null,
            sender: {
              id: row.sender_id,
              username: username,
              avatar: avatar,
              role: permissionRoleFromUserRow(senderRow),
              subscriptionPlan: canonicalSubscriptionPlanForResponse(senderRow)
            }
          };
        });

        return res.status(200).json(jsonSafeDeep(messages));
      } catch (error) {
        // Catch all errors (database errors, unexpected errors, etc.)
        console.error('Error fetching messages:', error);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          errno: error.errno,
          sqlState: error.sqlState,
          channelId: channelId,
          channelIdType: typeof channelId,
          path: req.path,
          query: req.query,
          stack: error.stack
        });
        if (db) {
          await releaseDb();
        }
        return res.status(500).json({ success: false, message: 'Failed to fetch messages' });
      }
    }

    if (req.method === 'POST') {
      // Create a new message
      const { userId, username, content, file, clientMessageId } = req.body;
      const senderId = userId || decoded.id;

      // Allow empty content if file metadata is present
      if ((!content || !content.trim()) && !file) {
        return res.status(400).json({ success: false, message: 'Message content or file is required' });
      }

      if (!db) {
        console.warn('Database unavailable for POST message');
        return res.status(503).json({ success: false, message: 'Database unavailable' });
      }

      try {
        // Ensure messages table exists with correct schema
        const tableExists = await ensureMessagesSchemaCached(db);
        if (!tableExists) {
          console.error('Failed to ensure messages table exists');
          try {
            if (db && typeof db.release === 'function') {
              db.release();
            } else if (db && typeof db.end === 'function') {
              await db.end();
            }
          } catch (e) {
            console.warn('Error releasing connection:', e.message);
          }
          return res.status(500).json({ 
            success: false, 
            message: 'Failed to initialize messages table. Please contact support.',
            error: 'Table initialization failed'
          });
        }

        // Rate limit: max 30 messages per minute per user per channel
        try {
          const [rateRows] = await db.execute(
            'SELECT COUNT(*) as cnt FROM messages WHERE sender_id = ? AND channel_id = ? AND timestamp > DATE_SUB(NOW(), INTERVAL 1 MINUTE)',
            [senderId, channelId]
          );
          const count = rateRows?.[0]?.cnt ?? 0;
          if (count >= 30) {
            return res.status(429).json({ success: false, message: 'Rate limit exceeded. Please slow down.' });
          }
        } catch (e) { /* non-fatal */ }

        // @everyone: only admins can use it
        const contentLower = (content || '').toString().toLowerCase();
        if (/@everyone\b/.test(contentLower) || /@all\b/.test(contentLower)) {
          const senderPerm =
            userRows[0] != null
              ? permissionRoleFromUserRow(userRows[0])
              : (decoded.role || 'USER').toString().toUpperCase();
          if (senderPerm !== 'ADMIN' && senderPerm !== 'SUPER_ADMIN') {
            return res.status(403).json({
              success: false,
              errorCode: 'FORBIDDEN',
              message: 'Only admins can use @everyone.'
            });
          }
        }

        // ── Community moderation bot (rules + strikes + XP) — see api/community/moderation-bot/
        const moderationEnabled = process.env.COMMUNITY_MODERATION_ENABLED !== 'false';
        if (moderationEnabled && content) {
          try {
            const { moderateMessage, aggregatePenalties } = require('../moderation-bot/engine');
            const { applyModerationPenalties } = require('../moderation-bot/penalties');
            const senderRoleForMod = (userRows[0]?.role || decoded.role || 'USER').toString();
            const modResult = moderateMessage(content.toString(), { role: senderRoleForMod });
            if (!modResult.allowed && modResult.violations && modResult.violations.length > 0) {
              const agg = aggregatePenalties(modResult.violations);
              try {
                await applyModerationPenalties(db, senderId, channelId, modResult.violations, content.toString());
              } catch (penErr) {
                console.warn('Moderation penalty apply failed:', penErr.message);
              }
              try {
                if (db && typeof db.release === 'function') db.release();
                else if (db && typeof db.end === 'function') await db.end();
              } catch (_) {}
              return res.status(403).json({
                success: false,
                errorCode: 'MODERATION_BLOCKED',
                message: agg.publicMessage,
                moderation: {
                  strikes: agg.strikes,
                  xpPenalty: agg.xpPenalty,
                  ruleIds: agg.ruleIds,
                },
              });
            }
          } catch (modErr) {
            console.warn('Community moderation bot error:', modErr.message);
            // Fail open: allow message if engine crashes (avoid total chat outage)
          }
        }
        // ─────────────────────────────────────────────────────────────────────

        // Idempotent: if clientMessageId provided, return existing message to prevent duplicates
        if (clientMessageId && senderId) {
          try {
            const [existing] = await db.execute(
              'SELECT m.*, u.username, u.name, u.email, u.avatar, u.role, u.subscription_plan FROM messages m LEFT JOIN users u ON m.sender_id = u.id WHERE m.sender_id = ? AND m.client_message_id = ? LIMIT 1',
              [senderId, String(clientMessageId).substring(0, 64)]
            );
            if (existing && existing.length > 0) {
              const r = existing[0];
              const uname = r.username || r.name || (r.email ? r.email.split('@')[0] : 'Anonymous');
              const dupSender = { role: r.role, email: r.email, subscription_plan: r.subscription_plan };
              const msg = {
                id: r.id,
                channelId: channelId,
                channel_id: channelId,
                userId: r.sender_id,
                username: uname,
                content: r.content,
                createdAt: r.timestamp,
                timestamp: r.timestamp,
                file: r.file_data ? (typeof r.file_data === 'string' ? JSON.parse(r.file_data) : r.file_data) : null,
                sender: {
                  id: r.sender_id,
                  username: uname,
                  avatar: r.avatar ?? null,
                  role: permissionRoleFromUserRow(dupSender),
                  subscriptionPlan: canonicalSubscriptionPlanForResponse(dupSender)
                },
                sequence: r.id
              };
              return res.status(200).json(msg);
            }
          } catch (e) { /* non-fatal, continue to insert */ }
        }

        // Fast path: avoid INFORMATION_SCHEMA checks on hot POST route.
        let channelIdValue = channelId;
        
        // Prepare content - include file info if present
        let messageContent = content.trim();
        if (file && file.name) {
            messageContent += ` [FILE: ${file.name}${file.preview ? ' - Image' : ''}]`;
        }
        
        // Prepare file_data JSON if file exists
        let fileDataJson = null;
        if (file && file.name) {
            fileDataJson = JSON.stringify({
                name: file.name,
                type: file.type || 'application/octet-stream',
                size: file.size || 0,
                preview: file.preview || null
            });
        }
        
        // Insert message - use actual column names
        // client_message_id for dedupe (nullable)
        const clientMsgId = clientMessageId ? String(clientMessageId).substring(0, 64) : null;
        let result;
        try {
          const insertCols = 'channel_id, sender_id, content, encrypted, file_data, timestamp';
          const insertVals = '?, ?, ?, FALSE, ?, NOW()';
          const insertParams = [channelIdValue, senderId || userId || null, messageContent, fileDataJson];
          let insertResult;
          if (clientMsgId) {
            try {
              insertResult = await db.execute(
                `INSERT INTO messages (${insertCols}, client_message_id) VALUES (${insertVals}, ?)`,
                [...insertParams, clientMsgId]
              );
            } catch (colErr) {
              if (colErr.code === 'ER_BAD_FIELD_ERROR' || (colErr.message && colErr.message.includes('client_message_id'))) {
                insertResult = await db.execute(
                  `INSERT INTO messages (${insertCols}) VALUES (${insertVals})`,
                  insertParams
                );
              } else throw colErr;
            }
          } else {
            insertResult = await db.execute(
              `INSERT INTO messages (${insertCols}) VALUES (${insertVals})`,
              insertParams
            );
          }
          // result is [ResultSetHeader, fields], we need the first element
          result = insertResult[0];
          console.log('Message inserted successfully with ID:', result.insertId, clientMsgId ? '(clientMessageId:' + clientMsgId + ')' : '');
        } catch (insertError) {
          console.error('Insert error:', insertError.message);
          console.error('Insert error code:', insertError.code);
          console.error('Channel ID value:', channelIdValue, 'Type:', typeof channelIdValue);
          
          // If insert failed, try alternative approaches
          if (insertError.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || 
              insertError.message?.includes('channel_id')) {
            // Try with string conversion
            console.log('Retrying insert with channelId as string...');
            try {
              const retryResult = await db.execute(
                'INSERT INTO messages (channel_id, sender_id, content, timestamp) VALUES (?, ?, ?, NOW())',
                [String(channelId), userId || null, content.trim()]
              );
              result = retryResult[0];
              console.log('Message inserted successfully on retry with ID:', result.insertId);
            } catch (retryError) {
              console.error('Insert failed even with string conversion:', retryError);
              throw retryError; // Re-throw to be caught by outer catch
            }
          } else {
            throw insertError; // Re-throw other errors
          }
        }

        // Fetch the newly created message with user info - execute returns [rows, fields]
        const [newMessageRows] = await db.execute(
          `SELECT m.*, u.username, u.name, u.email, u.avatar, u.role, u.subscription_plan 
           FROM messages m 
           LEFT JOIN users u ON m.sender_id = u.id 
           WHERE m.id = ?`, 
          [result.insertId]
        );
        const newMessage = newMessageRows[0]; // Get first row
        
        // Get username and avatar from joined user table
        const senderUsername = newMessage.username || newMessage.name || (newMessage.email ? newMessage.email.split('@')[0] : 'Anonymous');
        const senderAvatar = newMessage.avatar ?? null;
        const newSenderRow = {
          role: newMessage.role,
          email: newMessage.email,
          subscription_plan: newMessage.subscription_plan
        };

        let fileData = null;
        if (newMessage.file_data) {
          try {
            fileData = typeof newMessage.file_data === 'string'
              ? JSON.parse(newMessage.file_data)
              : newMessage.file_data;
          } catch (parseError) {
            console.warn('Could not parse file_data:', parseError);
          }
        }

        const message = {
          id: newMessage.id,
          sequence: newMessage.id,
          // Always use canonical channels.id for realtime (Pusher + WS + UI). Row channel_id may be numeric legacy.
          channelId: channelId,
          channel_id: channelId,
          userId: newMessage.sender_id,
          username: senderUsername,
          content: newMessage.content,
          createdAt: newMessage.timestamp,
          timestamp: newMessage.timestamp,
          file: fileData,
          sender: {
            id: newMessage.sender_id,
            username: senderUsername,
            avatar: senderAvatar,
            role: permissionRoleFromUserRow(newSenderRow),
            subscriptionPlan: canonicalSubscriptionPlanForResponse(newSenderRow)
          }
        };

        // Realtime first — bounded so a dead Railway / Pusher never hits Vercel 60s timeout
        await triggerNewMessageBounded(channelId, message, PUSHER_TRIGGER_TIMEOUT_MS);
        const wsServerUrl = process.env.WEBSOCKET_SERVER_URL || 'https://aura-fx-production.up.railway.app';
        const wsBroadcastUrl = `${wsServerUrl.replace(/\/$/, '')}/api/broadcast-new-message`;
        await fetchWithTimeout(
          wsBroadcastUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, message })
          },
          WS_BROADCAST_TIMEOUT_MS
        );

        // Release connection back to pool before responding (notifications use their own connection).
        await releaseDb();

        res.status(201).json(message);

        if (createNotification && messageContent) {
          void runCommunityMessageNotificationSideEffects({
            createNotification,
            messageContent,
            newMessageId: newMessage.id,
            channelRow,
            channelId,
            channelIdValue,
            senderId,
            senderUsername,
          }).catch((e) => console.error('[community/messages] deferred notifications:', e.message));
        }
        return;
      } catch (dbError) {
        console.error('Database error creating message:', dbError);
        console.error('Error details:', {
          message: dbError.message,
          code: dbError.code,
          errno: dbError.errno,
          sqlState: dbError.sqlState,
          sqlMessage: dbError.sqlMessage,
          sql: dbError.sql,
          channelId: channelId,
          channelIdType: typeof channelId,
          stack: dbError.stack
        });
        
        // Try to provide more helpful error message
        let errorMessage = 'Failed to create message';
        let errorDetails = null;
        
        if (dbError.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD' || dbError.code === 'ER_BAD_FIELD_ERROR') {
          errorMessage = 'Channel ID type mismatch. Database schema needs update.';
          errorDetails = `Channel ID "${channelId}" (${typeof channelId}) cannot be inserted into column type.`;
        } else if (dbError.message && dbError.message.includes('channel_id')) {
          errorMessage = 'Invalid channel ID format';
          errorDetails = dbError.message;
        } else if (dbError.code === 'ER_NO_SUCH_TABLE') {
          errorMessage = 'Messages table does not exist';
          errorDetails = 'Database table needs to be created.';
        } else if (dbError.code === 'ER_ACCESS_DENIED_ERROR' || dbError.code === 'ER_DBACCESS_DENIED_ERROR') {
          errorMessage = 'Database access denied';
          errorDetails = 'Check database credentials and permissions.';
        } else {
          errorMessage = dbError.message || 'Database error occurred';
          errorDetails = `Error code: ${dbError.code || 'UNKNOWN'}`;
        }
        
        if (db) {
          try {
            await releaseDb();
          } catch (releaseError) {
            console.warn('Error releasing database connection:', releaseError.message);
          }
        }
        
        return res.status(500).json({ 
          success: false, 
          message: errorMessage,
          error: errorDetails,
          code: dbError.code,
          // Include full error in development mode for debugging
          ...(process.env.NODE_ENV === 'development' ? {
            fullError: dbError.message,
            stack: dbError.stack
          } : {})
        });
      }
    }

    if (req.method === 'DELETE') {
      // Delete a message (admin only or message owner)
      // Extract messageId from query params (Vercel routing) or URL path
      let messageId = req.query.messageId || req.query.id;
      
      // If not in query, try to extract from URL path
      if (!messageId && req.url) {
        const urlParts = req.url.split('/');
        const messageIdIndex = urlParts.findIndex(part => part === 'messages') + 1;
        if (messageIdIndex > 0 && urlParts[messageIdIndex]) {
          messageId = urlParts[messageIdIndex].split('?')[0]; // Remove query string if present
        }
      }
      
      console.log('DELETE request - messageId:', messageId, 'from query:', req.query, 'from URL:', req.url);
      
      if (!messageId) {
        return res.status(400).json({ success: false, message: 'Message ID is required' });
      }

      if (!db) {
        console.warn('Database unavailable for DELETE message');
        return res.status(503).json({ success: false, message: 'Database unavailable' });
      }

      try {
        // Try both string and numeric messageId (handle both cases)
        let messageRows = [];
        let messageIdValue = messageId;
        
        // First try with the messageId as-is (could be string or number)
        try {
          [messageRows] = await db.execute('SELECT id, sender_id, channel_id FROM messages WHERE id = ?', [messageIdValue]);
        } catch (queryError) {
          // If that fails, try converting to number
          const numericId = parseInt(messageId);
          if (!isNaN(numericId)) {
            messageIdValue = numericId;
            [messageRows] = await db.execute('SELECT id, sender_id, channel_id FROM messages WHERE id = ?', [messageIdValue]);
          } else {
            throw queryError;
          }
        }
        
        if (!messageRows || messageRows.length === 0) {
          console.log('Message not found with ID:', messageId, 'tried value:', messageIdValue);
          await releaseDb();
          return res.status(404).json({ success: false, message: 'Message not found' });
        }

        const message = messageRows[0];
        console.log('Found message to delete:', message.id, 'in channel:', message.channel_id);

        // TODO: Add admin check from JWT token
        // For now, allow deletion (you can add auth check later)
        const [result] = await db.execute('DELETE FROM messages WHERE id = ?', [messageIdValue]);
        
        // Release connection back to pool
        await releaseDb();

        if (result.affectedRows > 0) {
          console.log('Message deleted successfully:', messageIdValue);
          return res.status(200).json({ 
            success: true, 
            message: 'Message deleted successfully' 
          });
        } else {
          console.log('Delete query executed but no rows affected');
          return res.status(404).json({ 
            success: false, 
            message: 'Message not found' 
          });
        }
      } catch (dbError) {
        console.error('Database error deleting message:', dbError);
        console.error('Error details:', {
          message: dbError.message,
          code: dbError.code,
          messageId: messageId,
          messageIdType: typeof messageId
        });
        if (db) {
          try {
            await releaseDb();
          } catch (releaseError) {
            // Ignore errors when releasing connection
          }
        }
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to delete message',
          error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }
    }

    await releaseDb();
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  } catch (error) {
    console.error('Unexpected error handling messages:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      query: req.query
    });
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

