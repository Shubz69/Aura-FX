/**
 * Friends API - Complete friend system with request/accept flow
 */

const { executeQuery } = require('../db');

// Generate unique request ID for logging
function generateRequestId() {
  return `fr_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

// Ensure friends table exists
async function ensureFriendsTable() {
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
  } catch (error) {
    // Table might already exist or foreign keys might fail - that's ok
    console.log('Friends table check:', error.code || 'OK');
  }
}

// Initialize table
ensureFriendsTable();

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
      const { friendId } = req.body || {};
      
      if (!friendId) {
        return res.status(400).json({ success: false, message: 'Friend ID required' });
      }

      const friendIdNum = parseInt(friendId);
      
      if (friendIdNum === currentUserId) {
        return res.status(400).json({ success: false, message: 'Cannot add yourself as friend' });
      }

      // Check if user exists
      const userResult = await executeQuery('SELECT id FROM users WHERE id = ?', [friendIdNum]);
      const userExists = Array.isArray(userResult) ? (Array.isArray(userResult[0]) ? userResult[0] : userResult) : [];
      
      if (!userExists || userExists.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Check existing friendship
      const existingResult = await executeQuery(`
        SELECT * FROM friends 
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `, [currentUserId, friendIdNum, friendIdNum, currentUserId]);

      const existing = Array.isArray(existingResult) ? (Array.isArray(existingResult[0]) ? existingResult[0] : existingResult) : [];

      if (existing && existing.length > 0) {
        const status = existing[0].status;
        if (status === 'accepted') {
          return res.status(400).json({ success: false, message: 'Already friends' });
        }
        if (status === 'pending') {
          return res.status(400).json({ success: false, message: 'Friend request already pending' });
        }
        if (status === 'blocked') {
          return res.status(400).json({ success: false, message: 'Cannot send request' });
        }
      }

      // Create friend request
      await executeQuery(
        'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
        [currentUserId, friendIdNum, 'pending']
      );

      return res.status(200).json({ 
        success: true, 
        message: 'Friend request sent',
        status: 'pending_sent'
      });
    }

    // POST /api/users/friends/accept - Accept friend request
    if (req.method === 'POST' && action === 'accept') {
      const { friendId } = req.body || {};
      
      if (!friendId) {
        return res.status(400).json({ success: false, message: 'Friend ID required' });
      }

      const result = await executeQuery(`
        UPDATE friends SET status = 'accepted', updated_at = NOW()
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `, [parseInt(friendId), currentUserId]);

      const updateResult = Array.isArray(result) ? result[0] : result;
      
      if (!updateResult || updateResult.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'No pending request found' });
      }

      return res.status(200).json({ 
        success: true, 
        message: 'Friend request accepted',
        status: 'accepted'
      });
    }

    // POST /api/users/friends/reject - Reject friend request
    if (req.method === 'POST' && action === 'reject') {
      const { friendId } = req.body || {};
      
      if (!friendId) {
        return res.status(400).json({ success: false, message: 'Friend ID required' });
      }

      await executeQuery(`
        DELETE FROM friends 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `, [parseInt(friendId), currentUserId]);

      return res.status(200).json({ 
        success: true, 
        message: 'Friend request rejected'
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
