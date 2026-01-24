/**
 * Friends API - Complete friend system with request/accept flow
 * 
 * Endpoints:
 * - GET  /api/users/friends           - Get friends list
 * - GET  /api/users/friends/requests  - Get pending requests
 * - GET  /api/users/friends/status/:userId - Check friendship status
 * - POST /api/users/friends/request   - Send friend request (body: { friendId } or { receiverUserId } or { userId })
 * - POST /api/users/friends/accept    - Accept friend request
 * - POST /api/users/friends/reject    - Reject friend request
 * - DELETE /api/users/friends/:friendId - Remove friend
 */

const { executeQuery } = require('../db');

// Generate unique request ID for logging
function generateRequestId() {
  return `fr_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse and validate request body
 * Handles both JSON and string bodies, and accepts multiple field names
 */
function parseBody(req) {
  let body = req.body;
  
  // Handle string body (needs JSON parsing)
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return { error: 'Invalid JSON body', parsed: null };
    }
  }
  
  // Handle empty/null body
  if (!body || typeof body !== 'object') {
    return { error: null, parsed: {} };
  }
  
  return { error: null, parsed: body };
}

/**
 * Extract target user ID from body, accepting multiple field names
 * Returns { targetId: number | null, fieldUsed: string | null, error: string | null }
 */
function extractTargetUserId(body, acceptedFields = ['friendId', 'receiverUserId', 'userId', 'targetUserId']) {
  if (!body || typeof body !== 'object') {
    return { targetId: null, fieldUsed: null, error: 'Missing request body' };
  }
  
  // Try each accepted field name
  for (const field of acceptedFields) {
    const value = body[field];
    if (value !== undefined && value !== null && value !== '') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return { targetId: parsed, fieldUsed: field, error: null };
      }
    }
  }
  
  // Build helpful error message
  const receivedFields = Object.keys(body).join(', ') || 'none';
  return { 
    targetId: null, 
    fieldUsed: null, 
    error: `Missing required field. Expected one of: ${acceptedFields.join(', ')}. Received fields: ${receivedFields}`
  };
}

// Track if table has been created this session
let friendsTableCreated = false;

// Ensure friends table exists
async function ensureFriendsTable() {
  if (friendsTableCreated) return true;
  
  try {
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        friend_id INT NOT NULL,
        status ENUM('pending', 'accepted', 'rejected', 'blocked') DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_friendship (user_id, friend_id),
        INDEX idx_user (user_id),
        INDEX idx_friend (friend_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    friendsTableCreated = true;
    console.log('Friends table ready');
    return true;
  } catch (error) {
    console.log('Friends table check:', error.code || error.message);
    // Even if CREATE fails, table might exist
    friendsTableCreated = true;
    return true;
  }
}

// Helper to get rows from query result
function getRows(result) {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (result.length > 0 && Array.isArray(result[0])) return result[0];
    return result;
  }
  return [];
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

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Ensure friends table exists
  await ensureFriendsTable();

  // Auth check
  const token = req.headers.authorization?.replace('Bearer ', '');
  const decoded = decodeToken(token);
  
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const currentUserId = decoded.id;
  
  // Parse URL - handle both /api/users/friends/status/28 and query params
  const url = req.url || '';
  const urlWithoutQuery = url.split('?')[0];
  const pathParts = urlWithoutQuery.split('/').filter(Boolean);
  
  // Extract the action and target from path
  // e.g., /api/users/friends/status/28 -> ['api', 'users', 'friends', 'status', '28']
  let action = null;
  let targetId = null;
  
  const friendsIndex = pathParts.indexOf('friends');
  if (friendsIndex !== -1 && pathParts.length > friendsIndex + 1) {
    action = pathParts[friendsIndex + 1];
    if (pathParts.length > friendsIndex + 2) {
      targetId = pathParts[friendsIndex + 2];
    }
  }

  try {
    // GET /api/users/friends - Get friends list
    if (req.method === 'GET' && !action) {
      const result = await executeQuery(`
        SELECT u.id, u.username, u.avatar, u.level, u.xp, u.role, u.subscription_status, u.last_seen,
               f.status, f.created_at as friends_since
        FROM friends f
        JOIN users u ON (f.friend_id = u.id OR f.user_id = u.id)
        WHERE (f.user_id = ? OR f.friend_id = ?) 
          AND f.status = 'accepted'
          AND u.id != ?
        ORDER BY u.last_seen DESC
      `, [currentUserId, currentUserId, currentUserId]);

      const friends = Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : [];

      return res.status(200).json({ 
        success: true, 
        friends: friends,
        count: friends.length
      });
    }

    // GET /api/users/friends/requests - Get pending requests
    if (req.method === 'GET' && action === 'requests') {
      const incomingResult = await executeQuery(`
        SELECT u.id, u.username, u.avatar, u.level, u.xp, u.role, f.created_at as requested_at
        FROM friends f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `, [currentUserId]);

      const outgoingResult = await executeQuery(`
        SELECT u.id, u.username, u.avatar, u.level, u.xp, u.role, f.created_at as requested_at
        FROM friends f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `, [currentUserId]);

      const incoming = Array.isArray(incomingResult) ? (Array.isArray(incomingResult[0]) ? incomingResult[0] : incomingResult) : [];
      const outgoing = Array.isArray(outgoingResult) ? (Array.isArray(outgoingResult[0]) ? outgoingResult[0] : outgoingResult) : [];

      return res.status(200).json({ 
        success: true, 
        incoming,
        outgoing,
        incomingCount: incoming.length,
        outgoingCount: outgoing.length
      });
    }

    // GET /api/users/friends/status/:userId - Check friendship status
    if (req.method === 'GET' && action === 'status' && targetId) {
      const targetUserId = parseInt(targetId);
      
      if (isNaN(targetUserId)) {
        return res.status(400).json({ success: false, message: 'Invalid user ID' });
      }
      
      if (targetUserId === currentUserId) {
        return res.status(200).json({ success: true, status: 'self' });
      }

      const result = await executeQuery(`
        SELECT status, user_id, friend_id FROM friends 
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `, [currentUserId, targetUserId, targetUserId, currentUserId]);

      const existing = Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : [];

      if (!existing || existing.length === 0) {
        return res.status(200).json({ success: true, status: 'none' });
      }

      const friendship = existing[0];
      let status = friendship.status;
      
      if (status === 'pending') {
        status = friendship.user_id === currentUserId ? 'pending_sent' : 'pending_received';
      }

      return res.status(200).json({ success: true, status });
    }

    // POST /api/users/friends/request - Send friend request
    if (req.method === 'POST' && action === 'request') {
      const requestId = generateRequestId();
      
      // Parse body with robust handling
      const { error: parseError, parsed: body } = parseBody(req);
      
      if (parseError) {
        console.log(`[${requestId}] Friend request parse error:`, parseError);
        return res.status(400).json({ 
          success: false, 
          message: parseError,
          requestId
        });
      }
      
      // Extract target user ID (accepts friendId, receiverUserId, userId, targetUserId)
      const { targetId, fieldUsed, error: extractError } = extractTargetUserId(body);
      
      // Structured logging for debugging
      console.log(`[${requestId}] Friend request:`, {
        from: currentUserId,
        body: body,
        extractedTarget: targetId,
        fieldUsed: fieldUsed,
        contentType: req.headers['content-type']
      });
      
      if (extractError || !targetId) {
        console.log(`[${requestId}] Validation error:`, extractError);
        return res.status(400).json({ 
          success: false, 
          message: extractError || 'Target user ID is required',
          hint: 'Send JSON body with { "friendId": <userId> } or { "receiverUserId": <userId> }',
          received: body,
          requestId
        });
      }

      if (targetId === currentUserId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot add yourself as friend',
          requestId 
        });
      }

      // Check if target user exists
      const userResult = await executeQuery('SELECT id, username FROM users WHERE id = ?', [targetId]);
      const userRows = getRows(userResult);
      
      if (!userRows || userRows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found',
          requestId 
        });
      }

      // Check existing friendship
      const existingResult = await executeQuery(`
        SELECT * FROM friends 
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `, [currentUserId, targetId, targetId, currentUserId]);

      const existing = getRows(existingResult);

      if (existing && existing.length > 0) {
        const friendship = existing[0];
        const status = friendship.status;
        
        if (status === 'accepted') {
          return res.status(400).json({ 
            success: false, 
            message: 'Already friends',
            status: 'accepted',
            requestId 
          });
        }
        if (status === 'pending') {
          // Check if we sent it or received it
          const direction = friendship.user_id === currentUserId ? 'pending_sent' : 'pending_received';
          return res.status(400).json({ 
            success: false, 
            message: direction === 'pending_sent' ? 'Friend request already sent' : 'You have a pending request from this user',
            status: direction,
            requestId 
          });
        }
        if (status === 'blocked') {
          return res.status(400).json({ 
            success: false, 
            message: 'Cannot send request to this user',
            requestId 
          });
        }
        if (status === 'rejected') {
          // Update existing rejected record to pending
          await executeQuery(
            'UPDATE friends SET status = ?, updated_at = NOW() WHERE id = ?',
            ['pending', friendship.id]
          );
          
          console.log(`[${requestId}] Friend request re-sent (was rejected)`);
          return res.status(200).json({ 
            success: true, 
            message: 'Friend request sent',
            status: 'pending_sent',
            requestId
          });
        }
      }

      // Create friend request
      await executeQuery(
        'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
        [currentUserId, targetId, 'pending']
      );

      console.log(`[${requestId}] Friend request created: ${currentUserId} -> ${targetId}`);

      return res.status(200).json({ 
        success: true, 
        message: 'Friend request sent',
        status: 'pending_sent',
        requestId
      });
    }

    // POST /api/users/friends/accept - Accept friend request
    if (req.method === 'POST' && action === 'accept') {
      const requestId = generateRequestId();
      const { error: parseError, parsed: body } = parseBody(req);
      
      if (parseError) {
        return res.status(400).json({ success: false, message: parseError, requestId });
      }
      
      const { targetId, error: extractError } = extractTargetUserId(body);
      
      if (extractError || !targetId) {
        return res.status(400).json({ 
          success: false, 
          message: extractError || 'Friend ID required',
          requestId 
        });
      }

      const result = await executeQuery(`
        UPDATE friends SET status = 'accepted', updated_at = NOW()
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `, [targetId, currentUserId]);

      const updateResult = Array.isArray(result) ? result[0] : result;
      
      if (!updateResult || updateResult.affectedRows === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'No pending request found',
          requestId 
        });
      }

      console.log(`[${requestId}] Friend request accepted: ${targetId} -> ${currentUserId}`);

      return res.status(200).json({ 
        success: true, 
        message: 'Friend request accepted',
        status: 'accepted',
        requestId
      });
    }

    // POST /api/users/friends/reject - Reject friend request
    if (req.method === 'POST' && action === 'reject') {
      const requestId = generateRequestId();
      const { error: parseError, parsed: body } = parseBody(req);
      
      if (parseError) {
        return res.status(400).json({ success: false, message: parseError, requestId });
      }
      
      const { targetId, error: extractError } = extractTargetUserId(body);
      
      if (extractError || !targetId) {
        return res.status(400).json({ 
          success: false, 
          message: extractError || 'Friend ID required',
          requestId 
        });
      }

      await executeQuery(`
        DELETE FROM friends 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `, [targetId, currentUserId]);

      console.log(`[${requestId}] Friend request rejected: ${targetId} -> ${currentUserId}`);

      return res.status(200).json({ 
        success: true, 
        message: 'Friend request rejected',
        status: 'none',
        requestId
      });
    }

    // DELETE /api/users/friends/:friendId - Remove friend
    if (req.method === 'DELETE' && action) {
      const friendIdToRemove = parseInt(action);

      if (isNaN(friendIdToRemove)) {
        return res.status(400).json({ success: false, message: 'Invalid friend ID' });
      }

      await executeQuery(`
        DELETE FROM friends 
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
          AND status = 'accepted'
      `, [currentUserId, friendIdToRemove, friendIdToRemove, currentUserId]);

      return res.status(200).json({ 
        success: true, 
        message: 'Friend removed',
        status: 'none'
      });
    }

    return res.status(404).json({ success: false, message: 'Endpoint not found' });

  } catch (error) {
    console.error('Friends API error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};
