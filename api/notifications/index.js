/**
 * Notifications API - Production-grade notification system
 * 
 * Endpoints:
 * - GET  /api/notifications          - List notifications with cursor pagination
 * - POST /api/notifications/:id/read - Mark single notification as read
 * - POST /api/notifications/read-all - Mark all notifications as read
 * 
 * Notification Types:
 * - MENTION: User was mentioned in a message
 * - CHANNEL_ACTIVITY: Opt-in throttled push for new messages in a channel
 * - REPLY: User received a reply to their message
 * - FRIEND_REQUEST: Received a friend request
 * - FRIEND_ACCEPTED: Friend request was accepted
 * - FRIEND_DECLINED: Friend request was declined
 * - SYSTEM: System notification
 * 
 * HARDENED:
 * - Rate limiting
 * - Request coalescing for unread count
 * - Proper error handling
 * - Structured logging
 */

const {
  executeQuery,
  executeQueryWithTimeout,
  addColumnIfNotExists,
  addIndexIfNotExists,
  indexExists,
  isBenignSchemaDuplicate
} = require('../db');
const { generateRequestId, createLogger } = require('../utils/logger');
const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('../utils/rate-limiter');
const { safeLimit, safeCursor, isValidUUID } = require('../utils/validators');

/** MySQL COUNT(*) may be bigint — normalize for JSON + UI */
function toCountValue(val) {
  if (val == null) return 0;
  if (typeof val === 'bigint') return Number(val);
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// Track schema creation
let schemaCreated = false;

// Generate UUID v4
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Decode JWT token
function decodeToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padding = payload.length % 4;
    const paddedPayload = padding ? payload + '='.repeat(4 - padding) : payload;
    return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf-8'));
  } catch (e) {
    return null;
  }
}

// Ensure notifications table exists
async function ensureSchema() {
  if (schemaCreated) return;
  
  try {
    // Create notifications table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(36) PRIMARY KEY,
        user_id INT NOT NULL,
        type ENUM('MENTION', 'REPLY', 'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'FRIEND_DECLINED', 'SYSTEM', 'DAILY_JOURNAL', 'CHANNEL_ACTIVITY') NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT,
        channel_id INT NULL,
        message_id INT NULL,
        from_user_id INT NULL,
        friend_request_id VARCHAR(36) NULL,
        status ENUM('UNREAD', 'READ', 'ARCHIVED') DEFAULT 'UNREAD',
        action_status ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED') NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        read_at TIMESTAMP NULL,
        scheduled_for_utc TIMESTAMP NULL,
        local_date DATE NULL,
        meta JSON NULL,
        INDEX idx_user_status_created (user_id, status, created_at),
        INDEX idx_user_created (user_id, created_at),
        INDEX idx_friend_request (friend_request_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Create friend_requests table
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS friend_requests (
        id VARCHAR(36) PRIMARY KEY,
        requester_id INT NOT NULL,
        receiver_id INT NOT NULL,
        status ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED') DEFAULT 'PENDING',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_request (requester_id, receiver_id),
        INDEX idx_requester (requester_id),
        INDEX idx_receiver (receiver_id),
        INDEX idx_status (status),
        CONSTRAINT chk_not_self CHECK (requester_id != receiver_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Create friendships table (bidirectional)
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS friendships (
        user_id INT NOT NULL,
        friend_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, friend_id),
        INDEX idx_friend (friend_id),
        CONSTRAINT chk_friendship_not_self CHECK (user_id != friend_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Extend existing table: add DAILY_JOURNAL columns and enum value if missing
    try {
      await addColumnIfNotExists('notifications', 'scheduled_for_utc', 'TIMESTAMP NULL');
      await addColumnIfNotExists('notifications', 'local_date', 'DATE NULL');
      await addColumnIfNotExists('notifications', 'meta', 'JSON NULL');
      await executeQuery(`
        ALTER TABLE notifications MODIFY COLUMN type ENUM(
          'MENTION', 'REPLY', 'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'FRIEND_DECLINED', 'SYSTEM', 'DAILY_JOURNAL', 'CHANNEL_ACTIVITY'
        ) NOT NULL
      `);
      await addIndexIfNotExists('notifications', 'idx_notif_user_type_local', ['user_id', 'type', 'local_date']);
      // Idempotency: at most one DAILY_JOURNAL per user per local date (allows multiple NULL local_date for other types)
      const hasUnique = await indexExists('notifications', 'unique_user_type_local_date');
      const hasLegacyUnique = await indexExists('notifications', 'unique_user_type_local_id');
      const hasTypoUnique = await indexExists('notifications', 'unique_user_type_local_data');
      if (!hasUnique && !hasLegacyUnique && !hasTypoUnique) {
        try {
          await executeQuery(`
            ALTER TABLE notifications ADD UNIQUE KEY unique_user_type_local_date (user_id, type, local_date)
          `);
        } catch (uniqueErr) {
          if (!isBenignSchemaDuplicate(uniqueErr)) {
            console.warn('Unique key unique_user_type_local_date:', uniqueErr.message);
          }
        }
      }
    } catch (alterErr) {
      // Ignore if already applied
    }
    schemaCreated = true;
  } catch (e) {
    console.log('Schema check:', e.code || e.message);
    schemaCreated = true; // Don't retry
  }
}

// Create a notification (called by threads, friends, etc.)
async function createNotification(data) {
  await ensureSchema();
  const id = generateUUID();
  const {
    userId,
    type,
    title,
    body = null,
    channelId = null,
    messageId = null,
    fromUserId = null,
    friendRequestId = null,
    actionStatus = null,
    scheduledForUTC = null,
    localDate = null,
    meta = null
  } = data;
  const metaStr = meta != null ? JSON.stringify(meta) : null;
  await executeQuery(`
    INSERT INTO notifications (id, user_id, type, title, body, channel_id, message_id, from_user_id, friend_request_id, action_status, scheduled_for_utc, local_date, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, userId, type, title, body, channelId, messageId, fromUserId, friendRequestId, actionStatus, scheduledForUTC, localDate, metaStr]);

  // #region agent log
  try {
    const { debugAgentLog } = require('../utils/debugAgentLog');
    debugAgentLog({
      location: 'notifications/index.js:createNotification',
      message: 'notification row inserted, invoking web push',
      hypothesisId: 'H3',
      data: {
        type: String(type || ''),
        channelId: channelId == null ? null : Number(channelId),
        userId: Number(userId),
      },
    });
  } catch (_) {}
  // #endregion

  try {
    const { sendWebPushForNotification } = require('../push/webPushNotify');
    await sendWebPushForNotification({
      userId,
      notificationId: id,
      type,
      title,
      body: body || '',
      meta,
      channelId
    });
  } catch (pushErr) {
    console.warn('[notifications] web push:', pushErr.message);
  }

  return id;
}

// Idempotent daily journal notification: at most one per user per local date
async function createDailyJournalNotificationIfNotSent(userId, localDate, title, body, meta) {
  await ensureSchema();
  const [existingRows] = await executeQuery(
    'SELECT id FROM notifications WHERE user_id = ? AND type = ? AND local_date = ? LIMIT 1',
    [userId, 'DAILY_JOURNAL', localDate]
  );
  if (Array.isArray(existingRows) && existingRows.length > 0) return null;
  return createNotification({
    userId,
    type: 'DAILY_JOURNAL',
    title,
    body,
    scheduledForUTC: new Date(),
    localDate,
    meta: meta || {}
  });
}

// Main API handler (assign first so we can attach helpers)
const handler = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const requestId = generateRequestId('notif');
  const logger = createLogger(requestId);
  const startTime = Date.now();
  
  res.setHeader('X-Request-ID', requestId);
  
  // Auth check
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = decodeToken(token);
  
  if (!decoded || !decoded.id) {
    return res.status(401).json({ 
      success: false, 
      errorCode: 'UNAUTHORIZED',
      message: 'Authentication required',
      requestId 
    });
  }

  const userId = decoded.id;
  const uid = Number.parseInt(String(userId), 10);
  if (!Number.isFinite(uid) || uid <= 0) {
    return res.status(401).json({
      success: false,
      errorCode: 'UNAUTHORIZED',
      message: 'Invalid user in token',
      requestId
    });
  }
  
  // Rate limiting
  const rateLimitKey = `notifications_${uid}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.MEDIUM.requests, RATE_LIMIT_CONFIGS.MEDIUM.windowMs)) {
    logger.warn('Rate limited', { userId });
    return res.status(429).json({
      success: false,
      errorCode: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
      requestId
    });
  }

  logger.info('Request started', { method: req.method, url: req.url });

  try {
    await ensureSchema();
  } catch (schemaErr) {
    logger.warn('ensureSchema failed (continuing)', { message: schemaErr?.message, requestId });
  }

  // Parse URL
  const url = req.url || '';
  const urlWithoutQuery = url.split('?')[0];
  const pathParts = urlWithoutQuery.split('/').filter(Boolean);
  
  // Parse query params
  const queryString = url.split('?')[1] || '';
  const query = {};
  queryString.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key) query[key] = decodeURIComponent(value || '');
  });

  try {
    // GET /api/notifications - List with cursor pagination
    if (req.method === 'GET' && pathParts[pathParts.length - 1] === 'notifications') {
      const cursor = safeCursor(query.cursor);
      const limit = safeLimit(query.limit, 20, 50);
      // MySQL prepared statements reject LIMIT ? (ER_WRONG_ARGUMENTS) — use a validated integer literal
      const fetchCap = limit + 1; // limit is 1..50 from safeLimit → fetchCap 2..51

      const listSql = cursor
        ? `SELECT * FROM notifications WHERE user_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ${fetchCap}`
        : `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ${fetchCap}`;
      const listParams = cursor ? [uid, cursor] : [uid];

      let rows = [];
      let listFetchFailed = false;

      const loadListRows = async () => {
        const [fetchedRows] = await executeQuery(listSql, listParams, { timeout: 28000, requestId });
        if (Array.isArray(fetchedRows)) return fetchedRows;
        return [];
      };

      try {
        rows = await loadListRows();
      } catch (e1) {
        logger.warn('Notifications list query failed, retrying once', { error: e1.message, uid, requestId });
        try {
          rows = await loadListRows();
        } catch (e2) {
          logger.warn('Notifications list query failed after retry', { error: e2.message, uid, requestId });
          listFetchFailed = true;
          rows = [];
        }
      }

      let unreadCount = 0;
      try {
        const [countRows] = await executeQueryWithTimeout(
          'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND status = ?',
          [uid, 'UNREAD'],
          8000,
          requestId
        );
        unreadCount = toCountValue(countRows?.[0]?.count);
      } catch (_) { unreadCount = 0; }

      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

      return res.status(200).json({
        success: true,
        listFetchFailed: listFetchFailed || undefined,
        items: items.map(n => {
          let meta = null;
          if (n.meta != null) {
            try {
              meta = typeof n.meta === 'string' ? JSON.parse(n.meta) : n.meta;
            } catch (_) { /* ignore invalid JSON */ }
          }
          return {
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            channelId: (meta && meta.channelId != null) ? meta.channelId : n.channel_id,
            messageId: n.message_id,
            fromUserId: n.from_user_id,
            fromUsername: null,
            fromAvatar: null,
            friendRequestId: n.friend_request_id,
            status: n.status,
            actionStatus: n.action_status,
            createdAt: n.created_at,
            readAt: n.read_at,
            scheduledForUTC: n.scheduled_for_utc ?? null,
            localDate: n.local_date ?? null,
            meta: meta
          };
        }),
        nextCursor,
        hasMore,
        unreadCount,
        requestId
      });
    }

    // POST /api/notifications/read-all - Mark all as read
    if (req.method === 'POST' && url.includes('/read-all')) {
      await executeQuery(
        'UPDATE notifications SET status = ?, read_at = NOW() WHERE user_id = ? AND status = ?',
        ['READ', uid, 'UNREAD']
      );
      
      return res.status(200).json({
        success: true,
        message: 'All notifications marked as read',
        requestId
      });
    }

    // POST /api/notifications/:id/read - Mark single as read
    if (req.method === 'POST' && url.includes('/read')) {
      // Extract notification ID from path
      const notificationId = pathParts[pathParts.length - 2];
      
      if (!notificationId || notificationId === 'notifications') {
        return res.status(400).json({
          success: false,
          errorCode: 'INVALID_ID',
          message: 'Notification ID required',
          requestId
        });
      }
      
      const result = await executeQuery(
        'UPDATE notifications SET status = ?, read_at = NOW() WHERE id = ? AND user_id = ?',
        ['READ', notificationId, uid]
      );
      
      const updateResult = Array.isArray(result) ? result[0] : result;
      
      if (!updateResult || updateResult.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          errorCode: 'NOT_FOUND',
          message: 'Notification not found',
          requestId
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Notification marked as read',
        requestId
      });
    }

    return res.status(404).json({
      success: false,
      errorCode: 'NOT_FOUND',
      message: 'Endpoint not found',
      requestId
    });

  } catch (error) {
    logger.error('Notifications error', { error, ms: Date.now() - startTime });
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Internal server error',
      requestId
    });
  }
};

module.exports = handler;
module.exports.createNotification = createNotification;
module.exports.createDailyJournalNotificationIfNotSent = createDailyJournalNotificationIfNotSent;
module.exports.ensureSchema = ensureSchema;
