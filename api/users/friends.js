/**
 * Friends API - Complete friend system with request/accept flow
 * 
 * Endpoints:
 * - GET /api/users/friends - Get user's friends list
 * - GET /api/users/friends/requests - Get pending friend requests
 * - POST /api/users/friends/request - Send friend request
 * - POST /api/users/friends/accept - Accept friend request
 * - POST /api/users/friends/reject - Reject friend request
 * - DELETE /api/users/friends/:friendId - Remove friend
 * - GET /api/users/friends/status/:userId - Check friendship status
 */

const { executeQuery, getDbConnection } = require('../db');

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
        INDEX idx_status (status),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (error) {
    console.error('Error ensuring friends table:', error);
  }
}

// Initialize table on module load
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
    const decoded = JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf-8'));
    return decoded;
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
  const url = req.url || '';
  const urlParts = url.split('/').filter(p => p && p !== 'api' && p !== 'users' && p !== 'friends');

  try {
    // GET /api/users/friends - Get friends list
    if (req.method === 'GET' && urlParts.length === 0) {
      const [friends] = await executeQuery(`
        SELECT u.id, u.username, u.avatar, u.level, u.xp, u.role, u.subscription_status, u.last_seen,
               f.status, f.created_at as friends_since
        FROM friends f
        JOIN users u ON (f.friend_id = u.id OR f.user_id = u.id)
        WHERE (f.user_id = ? OR f.friend_id = ?) 
          AND f.status = 'accepted'
          AND u.id != ?
        ORDER BY u.last_seen DESC
      `, [currentUserId, currentUserId, currentUserId]);

      return res.status(200).json({ 
        success: true, 
        friends: friends || [],
        count: friends?.length || 0
      });
    }

    // GET /api/users/friends/requests - Get pending requests
    if (req.method === 'GET' && urlParts[0] === 'requests') {
      const [incoming] = await executeQuery(`
        SELECT u.id, u.username, u.avatar, u.level, u.xp, u.role, f.created_at as requested_at
        FROM friends f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `, [currentUserId]);

      const [outgoing] = await executeQuery(`
        SELECT u.id, u.username, u.avatar, u.level, u.xp, u.role, f.created_at as requested_at
        FROM friends f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `, [currentUserId]);

      return res.status(200).json({ 
        success: true, 
        incoming: incoming || [],
        outgoing: outgoing || [],
        incomingCount: incoming?.length || 0,
        outgoingCount: outgoing?.length || 0
      });
    }

    // GET /api/users/friends/status/:userId - Check friendship status
    if (req.method === 'GET' && urlParts[0] === 'status' && urlParts[1]) {
      const targetUserId = parseInt(urlParts[1]);
      
      if (targetUserId === currentUserId) {
        return res.status(200).json({ success: true, status: 'self' });
      }

      const [existing] = await executeQuery(`
        SELECT status, user_id, friend_id FROM friends 
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `, [currentUserId, targetUserId, targetUserId, currentUserId]);

      if (!existing || existing.length === 0) {
        return res.status(200).json({ success: true, status: 'none' });
      }

      const friendship = existing[0];
      let status = friendship.status;
      
      // Determine if this user sent or received the request
      if (status === 'pending') {
        status = friendship.user_id === currentUserId ? 'pending_sent' : 'pending_received';
      }

      return res.status(200).json({ success: true, status });
    }

    // POST /api/users/friends/request - Send friend request
    if (req.method === 'POST' && urlParts[0] === 'request') {
      const { friendId } = req.body;
      
      if (!friendId) {
        return res.status(400).json({ success: false, message: 'Friend ID required' });
      }

      if (parseInt(friendId) === currentUserId) {
        return res.status(400).json({ success: false, message: 'Cannot add yourself as friend' });
      }

      // Check if user exists
      const [userExists] = await executeQuery('SELECT id FROM users WHERE id = ?', [friendId]);
      if (!userExists || userExists.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Check existing friendship
      const [existing] = await executeQuery(`
        SELECT * FROM friends 
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
      `, [currentUserId, friendId, friendId, currentUserId]);

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
        [currentUserId, friendId, 'pending']
      );

      return res.status(200).json({ 
        success: true, 
        message: 'Friend request sent',
        status: 'pending_sent'
      });
    }

    // POST /api/users/friends/accept - Accept friend request
    if (req.method === 'POST' && urlParts[0] === 'accept') {
      const { friendId } = req.body;
      
      if (!friendId) {
        return res.status(400).json({ success: false, message: 'Friend ID required' });
      }

      // Find pending request where the other user sent it
      const [result] = await executeQuery(`
        UPDATE friends SET status = 'accepted', updated_at = NOW()
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `, [friendId, currentUserId]);

      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: 'No pending request found' });
      }

      return res.status(200).json({ 
        success: true, 
        message: 'Friend request accepted',
        status: 'accepted'
      });
    }

    // POST /api/users/friends/reject - Reject friend request
    if (req.method === 'POST' && urlParts[0] === 'reject') {
      const { friendId } = req.body;
      
      if (!friendId) {
        return res.status(400).json({ success: false, message: 'Friend ID required' });
      }

      await executeQuery(`
        DELETE FROM friends 
        WHERE user_id = ? AND friend_id = ? AND status = 'pending'
      `, [friendId, currentUserId]);

      return res.status(200).json({ 
        success: true, 
        message: 'Friend request rejected'
      });
    }

    // DELETE /api/users/friends/:friendId - Remove friend
    if (req.method === 'DELETE' && urlParts[0]) {
      const friendId = parseInt(urlParts[0]);

      await executeQuery(`
        DELETE FROM friends 
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
          AND status = 'accepted'
      `, [currentUserId, friendId, friendId, currentUserId]);

      return res.status(200).json({ 
        success: true, 
        message: 'Friend removed',
        status: 'none'
      });
    }

    return res.status(404).json({ success: false, message: 'Endpoint not found' });

  } catch (error) {
    console.error('Friends API error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
