/**
 * Friends API - Production-grade friend system
 * 
 * Endpoints:
 * - GET  /api/friends/list              - Get friends list
 * - GET  /api/friends/requests/incoming - Get incoming friend requests
 * - GET  /api/friends/requests/outgoing - Get outgoing friend requests
 * - POST /api/friends/request           - Send friend request { receiverUserId }
 * - POST /api/friends/accept            - Accept request { requestId }
 * - POST /api/friends/decline           - Decline request { requestId }
 * - POST /api/friends/cancel            - Cancel outgoing request { requestId }
 * - DELETE /api/friends/remove          - Remove friend { friendUserId }
 * 
 * Validation Rules:
 * - Reject self-add
 * - Reject duplicates
 * - Reject if already friends
 * - Idempotent operations (accepting twice is safe)
 * 
 * HARDENED:
 * - Rate limiting
 * - Caching for friends list
 * - Proper error handling
 * - Structured logging
 */

const { executeQuery, executeQueryWithTimeout } = require('../db');
const { getCached, setCached, deleteCached, invalidatePattern, DEFAULT_TTLS } = require('../cache');
const { generateRequestId, createLogger } = require('../utils/logger');
const { checkRateLimit, RATE_LIMIT_CONFIGS } = require('../utils/rate-limiter');
const { positiveInt, isValidUUID } = require('../utils/validators');

// Import notification creator if available
let createNotification;
try {
  createNotification = require('../notifications').createNotification;
} catch (e) {
  createNotification = null;
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

// Get rows helper
function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
}

// Parse body helper
function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return { error: 'Invalid JSON body', parsed: null };
    }
  }
  if (!body || typeof body !== 'object') {
    return { error: null, parsed: {} };
  }
  return { error: null, parsed: body };
}

// Ensure schema exists
async function ensureSchema() {
  if (schemaCreated) return;
  
  try {
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
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Create friendships table (bidirectional)
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS friendships (
        user_id INT NOT NULL,
        friend_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, friend_id),
        INDEX idx_friend (friend_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    schemaCreated = true;
    console.log('Friends schema ready');
  } catch (e) {
    console.log('Friends schema check:', e.code || e.message);
    schemaCreated = true;
  }
}

// Create notification helper
async function notify(userId, type, title, body, data = {}) {
  if (!createNotification) return null;
  try {
    return await createNotification({
      userId,
      type,
      title,
      body,
      ...data
    });
  } catch (e) {
    console.error('Failed to create notification:', e);
    return null;
  }
}

// Main API handler
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const requestId = generateRequestId('friend');
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
  const rateLimitKey = `friends_${userId}`;
  if (!checkRateLimit(rateLimitKey, RATE_LIMIT_CONFIGS.MEDIUM.requests, RATE_LIMIT_CONFIGS.MEDIUM.windowMs)) {
    logger.warn('Rate limited', { userId });
    return res.status(429).json({
      success: false,
      errorCode: 'RATE_LIMITED',
      message: 'Too many requests. Please try again later.',
      requestId
    });
  }

  await ensureSchema();

  // Parse URL
  const url = req.url || '';
  const urlWithoutQuery = url.split('?')[0];
  const pathParts = urlWithoutQuery.split('/').filter(Boolean);
  
  // Determine action from path
  const friendsIndex = pathParts.indexOf('friends');
  const action = friendsIndex !== -1 && pathParts.length > friendsIndex + 1 
    ? pathParts.slice(friendsIndex + 1).join('/') 
    : 'list';

  logger.info('Request started', { action, method: req.method });

  try {
    // GET /api/friends/list - Get friends list (with caching)
    if (req.method === 'GET' && (action === 'list' || action === '')) {
      // Check cache
      const cacheKey = `friends_list_${userId}`;
      const cached = getCached(cacheKey, DEFAULT_TTLS.FRIENDS_LIST);
      if (cached) {
        logger.info('Cache HIT', { ms: Date.now() - startTime });
        return res.status(200).json({
          success: true,
          friends: cached,
          count: cached.length,
          cached: true,
          requestId
        });
      }
      
      logger.startTimer('db_query');
      const result = await executeQueryWithTimeout(`
        SELECT 
          u.id, u.username, u.avatar, u.level, u.xp, u.role,
          u.last_seen, f.created_at as friends_since
        FROM friendships f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ?
        ORDER BY u.last_seen DESC
      `, [userId], 10000, requestId);
      logger.endTimer('db_query');
      
      const friends = getRows(result).map(f => ({
        id: f.id,
        username: f.username,
        avatar: f.avatar,
        level: f.level,
        xp: f.xp,
        role: f.role,
        isOnline: f.last_seen && new Date(f.last_seen) >= new Date(Date.now() - 5 * 60 * 1000),
        lastSeen: f.last_seen,
        friendsSince: f.friends_since
      }));
      
      // Cache the result
      setCached(cacheKey, friends, DEFAULT_TTLS.FRIENDS_LIST);
      
      logger.info('Request completed', { count: friends.length, ms: Date.now() - startTime });
      
      return res.status(200).json({
        success: true,
        friends,
        count: friends.length,
        requestId
      });
    }

    // GET /api/friends/requests/incoming - Incoming requests
    if (req.method === 'GET' && action === 'requests/incoming') {
      const result = await executeQuery(`
        SELECT 
          fr.id, fr.requester_id, fr.status, fr.created_at,
          u.username, u.avatar, u.level
        FROM friend_requests fr
        JOIN users u ON fr.requester_id = u.id
        WHERE fr.receiver_id = ? AND fr.status = 'PENDING'
        ORDER BY fr.created_at DESC
      `, [userId]);
      
      const requests = getRows(result).map(r => ({
        id: r.id,
        requesterId: r.requester_id,
        username: r.username,
        avatar: r.avatar,
        level: r.level,
        status: r.status,
        createdAt: r.created_at
      }));
      
      return res.status(200).json({
        success: true,
        requests,
        count: requests.length,
        requestId
      });
    }

    // GET /api/friends/requests/outgoing - Outgoing requests
    if (req.method === 'GET' && action === 'requests/outgoing') {
      const result = await executeQuery(`
        SELECT 
          fr.id, fr.receiver_id, fr.status, fr.created_at,
          u.username, u.avatar, u.level
        FROM friend_requests fr
        JOIN users u ON fr.receiver_id = u.id
        WHERE fr.requester_id = ? AND fr.status = 'PENDING'
        ORDER BY fr.created_at DESC
      `, [userId]);
      
      const requests = getRows(result).map(r => ({
        id: r.id,
        receiverId: r.receiver_id,
        username: r.username,
        avatar: r.avatar,
        level: r.level,
        status: r.status,
        createdAt: r.created_at
      }));
      
      return res.status(200).json({
        success: true,
        requests,
        count: requests.length,
        requestId
      });
    }

    // POST /api/friends/request - Send friend request
    if (req.method === 'POST' && action === 'request') {
      const { error: parseError, parsed: body } = parseBody(req);
      if (parseError) {
        return res.status(400).json({ success: false, errorCode: 'INVALID_BODY', message: parseError, requestId });
      }
      
      // Accept multiple field names
      const receiverId = parseInt(body.receiverUserId || body.friendId || body.userId || body.targetUserId);
      
      if (!receiverId || isNaN(receiverId)) {
        return res.status(400).json({
          success: false,
          errorCode: 'MISSING_RECEIVER',
          message: 'receiverUserId is required',
          hint: 'Send { "receiverUserId": <userId> }',
          requestId
        });
      }
      
      // Validate: not self
      if (receiverId === userId) {
        return res.status(400).json({
          success: false,
          errorCode: 'SELF_REQUEST',
          message: 'Cannot send friend request to yourself',
          requestId
        });
      }
      
      // Check if user exists
      const userResult = await executeQuery('SELECT id, username FROM users WHERE id = ?', [receiverId]);
      const receiverUser = getRows(userResult)[0];
      if (!receiverUser) {
        return res.status(404).json({
          success: false,
          errorCode: 'USER_NOT_FOUND',
          message: 'User not found',
          requestId
        });
      }
      
      // Check if already friends
      const friendshipResult = await executeQuery(
        'SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?',
        [userId, receiverId]
      );
      if (getRows(friendshipResult).length > 0) {
        return res.status(400).json({
          success: false,
          errorCode: 'ALREADY_FRIENDS',
          message: 'Already friends with this user',
          requestId
        });
      }
      
      // Check existing pending request (either direction)
      const existingResult = await executeQuery(`
        SELECT id, requester_id, receiver_id, status 
        FROM friend_requests 
        WHERE ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))
          AND status = 'PENDING'
      `, [userId, receiverId, receiverId, userId]);
      
      const existing = getRows(existingResult)[0];
      if (existing) {
        if (existing.requester_id === userId) {
          return res.status(400).json({
            success: false,
            errorCode: 'REQUEST_EXISTS',
            message: 'Friend request already sent',
            requestId: existing.id,
            status: 'PENDING'
          });
        } else {
          // They already sent us a request - could auto-accept or prompt
          return res.status(400).json({
            success: false,
            errorCode: 'REQUEST_PENDING_FROM_USER',
            message: 'This user has already sent you a friend request. Accept it instead!',
            requestId: existing.id
          });
        }
      }
      
      // Create request
      const newRequestId = generateUUID();
      await executeQuery(
        'INSERT INTO friend_requests (id, requester_id, receiver_id, status) VALUES (?, ?, ?, ?)',
        [newRequestId, userId, receiverId, 'PENDING']
      );
      
      // Get requester info for notification
      const requesterResult = await executeQuery('SELECT username FROM users WHERE id = ?', [userId]);
      const requesterUsername = getRows(requesterResult)[0]?.username || 'Someone';
      
      // Create notification for receiver
      await notify(receiverId, 'FRIEND_REQUEST', 'New Friend Request', 
        `${requesterUsername} wants to be your friend`, {
        fromUserId: userId,
        friendRequestId: newRequestId,
        actionStatus: 'PENDING'
      });
      
      console.log(`[${requestId}] Friend request created: ${userId} -> ${receiverId} (${newRequestId})`);
      
      return res.status(200).json({
        success: true,
        message: 'Friend request sent',
        request: {
          id: newRequestId,
          receiverId,
          status: 'PENDING'
        },
        requestId
      });
    }

    // POST /api/friends/accept - Accept friend request
    if (req.method === 'POST' && action === 'accept') {
      const { error: parseError, parsed: body } = parseBody(req);
      if (parseError) {
        return res.status(400).json({ success: false, errorCode: 'INVALID_BODY', message: parseError, requestId });
      }
      
      const friendRequestId = body.requestId || body.friendRequestId || body.id;
      
      if (!friendRequestId) {
        return res.status(400).json({
          success: false,
          errorCode: 'MISSING_REQUEST_ID',
          message: 'requestId is required',
          requestId
        });
      }
      
      // Get the request
      const requestResult = await executeQuery(
        'SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?',
        [friendRequestId, userId]
      );
      const friendRequest = getRows(requestResult)[0];
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          errorCode: 'REQUEST_NOT_FOUND',
          message: 'Friend request not found',
          requestId
        });
      }
      
      // Idempotency: if already accepted, return success
      if (friendRequest.status === 'ACCEPTED') {
        return res.status(200).json({
          success: true,
          message: 'Friend request already accepted',
          alreadyProcessed: true,
          requestId
        });
      }
      
      if (friendRequest.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          errorCode: 'REQUEST_NOT_PENDING',
          message: `Request is ${friendRequest.status.toLowerCase()}`,
          requestId
        });
      }
      
      const requesterId = friendRequest.requester_id;
      
      // Update request status
      await executeQuery(
        'UPDATE friend_requests SET status = ?, updated_at = NOW() WHERE id = ?',
        ['ACCEPTED', friendRequestId]
      );
      
      // Create bidirectional friendship
      await executeQuery(
        'INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?), (?, ?)',
        [userId, requesterId, requesterId, userId]
      );
      
      // Invalidate friends list cache for both users
      deleteCached(`friends_list_${userId}`);
      deleteCached(`friends_list_${requesterId}`);
      
      // Update notification action_status
      await executeQuery(
        'UPDATE notifications SET action_status = ? WHERE friend_request_id = ?',
        ['ACCEPTED', friendRequestId]
      );
      
      // Get usernames for notification
      const userResult = await executeQuery('SELECT username FROM users WHERE id = ?', [userId]);
      const accepterUsername = getRows(userResult)[0]?.username || 'Someone';
      
      // Notify requester
      await notify(requesterId, 'FRIEND_ACCEPTED', 'Friend Request Accepted',
        `${accepterUsername} accepted your friend request`, {
        fromUserId: userId
      });
      
      console.log(`[${requestId}] Friend request accepted: ${requesterId} -> ${userId}`);
      
      return res.status(200).json({
        success: true,
        message: 'Friend request accepted',
        friendId: requesterId,
        requestId
      });
    }

    // POST /api/friends/decline - Decline friend request
    if (req.method === 'POST' && action === 'decline') {
      const { error: parseError, parsed: body } = parseBody(req);
      if (parseError) {
        return res.status(400).json({ success: false, errorCode: 'INVALID_BODY', message: parseError, requestId });
      }
      
      const friendRequestId = body.requestId || body.friendRequestId || body.id;
      
      if (!friendRequestId) {
        return res.status(400).json({
          success: false,
          errorCode: 'MISSING_REQUEST_ID',
          message: 'requestId is required',
          requestId
        });
      }
      
      // Get the request
      const requestResult = await executeQuery(
        'SELECT * FROM friend_requests WHERE id = ? AND receiver_id = ?',
        [friendRequestId, userId]
      );
      const friendRequest = getRows(requestResult)[0];
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          errorCode: 'REQUEST_NOT_FOUND',
          message: 'Friend request not found',
          requestId
        });
      }
      
      // Idempotency
      if (friendRequest.status === 'DECLINED') {
        return res.status(200).json({
          success: true,
          message: 'Friend request already declined',
          alreadyProcessed: true,
          requestId
        });
      }
      
      if (friendRequest.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          errorCode: 'REQUEST_NOT_PENDING',
          message: `Request is ${friendRequest.status.toLowerCase()}`,
          requestId
        });
      }
      
      // Update status
      await executeQuery(
        'UPDATE friend_requests SET status = ?, updated_at = NOW() WHERE id = ?',
        ['DECLINED', friendRequestId]
      );
      
      // Update notification
      await executeQuery(
        'UPDATE notifications SET action_status = ? WHERE friend_request_id = ?',
        ['DECLINED', friendRequestId]
      );
      
      console.log(`[${requestId}] Friend request declined: ${friendRequest.requester_id} -> ${userId}`);
      
      return res.status(200).json({
        success: true,
        message: 'Friend request declined',
        requestId
      });
    }

    // POST /api/friends/cancel - Cancel outgoing request
    if (req.method === 'POST' && action === 'cancel') {
      const { error: parseError, parsed: body } = parseBody(req);
      if (parseError) {
        return res.status(400).json({ success: false, errorCode: 'INVALID_BODY', message: parseError, requestId });
      }
      
      const friendRequestId = body.requestId || body.friendRequestId || body.id;
      
      if (!friendRequestId) {
        return res.status(400).json({
          success: false,
          errorCode: 'MISSING_REQUEST_ID',
          message: 'requestId is required',
          requestId
        });
      }
      
      // Get the request (must be requester)
      const requestResult = await executeQuery(
        'SELECT * FROM friend_requests WHERE id = ? AND requester_id = ?',
        [friendRequestId, userId]
      );
      const friendRequest = getRows(requestResult)[0];
      
      if (!friendRequest) {
        return res.status(404).json({
          success: false,
          errorCode: 'REQUEST_NOT_FOUND',
          message: 'Friend request not found',
          requestId
        });
      }
      
      // Idempotency
      if (friendRequest.status === 'CANCELLED') {
        return res.status(200).json({
          success: true,
          message: 'Friend request already cancelled',
          alreadyProcessed: true,
          requestId
        });
      }
      
      if (friendRequest.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          errorCode: 'REQUEST_NOT_PENDING',
          message: `Request is ${friendRequest.status.toLowerCase()}`,
          requestId
        });
      }
      
      // Update status
      await executeQuery(
        'UPDATE friend_requests SET status = ?, updated_at = NOW() WHERE id = ?',
        ['CANCELLED', friendRequestId]
      );
      
      // Update notification
      await executeQuery(
        'UPDATE notifications SET action_status = ? WHERE friend_request_id = ?',
        ['CANCELLED', friendRequestId]
      );
      
      console.log(`[${requestId}] Friend request cancelled: ${userId} -> ${friendRequest.receiver_id}`);
      
      return res.status(200).json({
        success: true,
        message: 'Friend request cancelled',
        requestId
      });
    }

    // DELETE /api/friends/remove - Remove friend
    if (req.method === 'DELETE' || (req.method === 'POST' && action === 'remove')) {
      const { error: parseError, parsed: body } = parseBody(req);
      if (parseError) {
        return res.status(400).json({ success: false, errorCode: 'INVALID_BODY', message: parseError, requestId });
      }
      
      const friendId = parseInt(body.friendUserId || body.friendId || body.userId);
      
      if (!friendId || isNaN(friendId)) {
        return res.status(400).json({
          success: false,
          errorCode: 'MISSING_FRIEND_ID',
          message: 'friendUserId is required',
          requestId
        });
      }
      
      // Delete both directions
      const result = await executeQuery(
        'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
        [userId, friendId, friendId, userId]
      );
      
      const deleteResult = Array.isArray(result) ? result[0] : result;
      
      if (!deleteResult || deleteResult.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          errorCode: 'NOT_FRIENDS',
          message: 'Not friends with this user',
          requestId
        });
      }
      
      // Invalidate friends list cache for both users
      deleteCached(`friends_list_${userId}`);
      deleteCached(`friends_list_${friendId}`);
      
      logger.info('Friendship removed', { userId, friendId });
      
      return res.status(200).json({
        success: true,
        message: 'Friend removed',
        requestId
      });
    }

    // GET /api/friends/status/:userId - Check friendship status with a user
    if (req.method === 'GET' && action.startsWith('status/')) {
      const targetId = parseInt(action.split('/')[1]);
      
      if (!targetId || isNaN(targetId)) {
        return res.status(400).json({
          success: false,
          errorCode: 'INVALID_USER_ID',
          message: 'Valid user ID required',
          requestId
        });
      }
      
      if (targetId === userId) {
        return res.status(200).json({
          success: true,
          status: 'SELF',
          requestId
        });
      }
      
      // Check if friends
      const friendResult = await executeQuery(
        'SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?',
        [userId, targetId]
      );
      if (getRows(friendResult).length > 0) {
        return res.status(200).json({
          success: true,
          status: 'FRIENDS',
          requestId
        });
      }
      
      // Check for pending request
      const requestResult = await executeQuery(`
        SELECT id, requester_id, receiver_id, status 
        FROM friend_requests 
        WHERE ((requester_id = ? AND receiver_id = ?) OR (requester_id = ? AND receiver_id = ?))
          AND status = 'PENDING'
      `, [userId, targetId, targetId, userId]);
      
      const pending = getRows(requestResult)[0];
      if (pending) {
        if (pending.requester_id === userId) {
          return res.status(200).json({
            success: true,
            status: 'PENDING_SENT',
            requestId: pending.id
          });
        } else {
          return res.status(200).json({
            success: true,
            status: 'PENDING_RECEIVED',
            requestId: pending.id
          });
        }
      }
      
      return res.status(200).json({
        success: true,
        status: 'NONE',
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
    logger.error('Friends API error', { error, action, ms: Date.now() - startTime });
    return res.status(500).json({
      success: false,
      errorCode: 'SERVER_ERROR',
      message: 'Internal server error',
      requestId
    });
  }
};
