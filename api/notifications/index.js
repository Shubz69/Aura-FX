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

const { executeQuery, executeQueryWithTimeout } = require('../db');
const { getCached, setCached, invalidatePattern, DEFAULT_TTLS } = require('../cache');
const { generateRequestId, createLogger } = require('../utils/logger');
const { checkRateLimit, coalesceRequest, RATE_LIMIT_CONFIGS } = require('../utils/rate-limiter');
const { safeLimit, safeCursor, isValidUUID } = require('../utils/validators');

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

// Get rows helper
function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
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
        type ENUM('MENTION', 'REPLY', 'FRIEND_REQUEST', 'FRIEND_ACCEPTED', 'FRIEND_DECLINED', 'SYSTEM') NOT NULL,
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
    
    schemaCreated = true;
    console.log('Notifications schema ready');
  } catch (e) {
    console.log('Schema check:', e.code || e.message);
    schemaCreated = true; // Don't retry
  }
}

// Create a notification
async function createNotification(data) {
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
    actionStatus = null
  } = data;
  
  await executeQuery(`
    INSERT INTO notifications (id, user_id, type, title, body, channel_id, message_id, from_user_id, friend_request_id, action_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, userId, type, title, body, channelId, messageId, fromUserId, friendRequestId, actionStatus]);
  
  return id;
}

// Export for use by other modules
module.exports.createNotification = createNotification;
module.exports.ensureSchema = ensureSchema;

// Main API handler
module.exports = async (req, res) => {
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
  
  // Rate limiting
  const rateLimitKey = `notifications_${userId}`;
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

  await ensureSchema();

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
      
      let whereClause = 'WHERE user_id = ?';
      const params = [userId];
      
      if (cursor) {
        // Cursor is the created_at timestamp of the last item
        whereClause += ' AND created_at < ?';
        params.push(cursor);
      }
      
      const result = await executeQuery(`
        SELECT 
          n.*,
          u.username as from_username,
          u.avatar as from_avatar
        FROM notifications n
        LEFT JOIN users u ON n.from_user_id = u.id
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT ${limit + 1}
      `, params);
      
      const rows = getRows(result);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit);
      
      // Get next cursor
      const nextCursor = hasMore && items.length > 0 
        ? items[items.length - 1].created_at 
        : null;
      
      // Get unread count with coalescing (prevent N concurrent queries)
      const unreadCount = await coalesceRequest(
        `notif_unread_${userId}`,
        async () => {
          const countResult = await executeQueryWithTimeout(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND status = ?',
            [userId, 'UNREAD'],
            5000,
            requestId
          );
          return getRows(countResult)[0]?.count || 0;
        },
        100 // 100ms coalescing window
      );
      
      return res.status(200).json({
        success: true,
        items: items.map(n => ({
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          channelId: n.channel_id,
          messageId: n.message_id,
          fromUserId: n.from_user_id,
          fromUsername: n.from_username,
          fromAvatar: n.from_avatar,
          friendRequestId: n.friend_request_id,
          status: n.status,
          actionStatus: n.action_status,
          createdAt: n.created_at,
          readAt: n.read_at
        })),
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
        ['READ', userId, 'UNREAD']
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
        ['READ', notificationId, userId]
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
