/**
 * Message Delete API - Soft-delete with auth checks
 * 
 * POST /api/messages/delete
 * Body: { messageId, channelId }
 * 
 * Authorization:
 * - Message owner (message.sender_id === auth.user.id)
 * - Admin role
 * - Moderator role
 * 
 * Soft-delete: Sets deleted_at = NOW(), content = '[deleted]'
 * Broadcasts MESSAGE_DELETED via WebSocket
 */

const { getDbConnection, executeQuery } = require('../db');
const jwt = require('jsonwebtoken');

// Decode JWT token
function decodeToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    return decoded;
  } catch (e) {
    // Try decode without verification for development
    try {
      return jwt.decode(token);
    } catch (e2) {
      return null;
    }
  }
}

// Check if user can delete a message
function canDeleteMessage(user, message) {
  if (!user || !message) return false;
  
  // Message owner can delete
  if (String(message.sender_id) === String(user.id || user.userId)) {
    return true;
  }
  
  // Admin or moderator can delete
  const role = (user.role || '').toLowerCase();
  if (role === 'admin' || role === 'moderator' || role === 'super_admin') {
    return true;
  }
  
  return false;
}

// Ensure deleted_at and deleted_by columns exist
async function ensureDeleteColumns(db) {
  try {
    // Check if deleted_at column exists
    const [cols] = await db.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'messages' 
        AND COLUMN_NAME = 'deleted_at'
    `);
    
    if (!cols || cols.length === 0) {
      await db.execute('ALTER TABLE messages ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL');
      console.log('Added deleted_at column to messages table');
    }
    
    // Check if deleted_by column exists
    const [cols2] = await db.execute(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'messages' 
        AND COLUMN_NAME = 'deleted_by'
    `);
    
    if (!cols2 || cols2.length === 0) {
      await db.execute('ALTER TABLE messages ADD COLUMN deleted_by INT NULL DEFAULT NULL');
      console.log('Added deleted_by column to messages table');
    }
    
    return true;
  } catch (e) {
    console.warn('Error ensuring delete columns:', e.message);
    return true; // Continue anyway
  }
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ 
      success: false, 
      errorCode: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed' 
    });
  }

  // Authenticate user
  const authHeader = req.headers.authorization;
  const user = decodeToken(authHeader);
  
  if (!user) {
    return res.status(401).json({ 
      success: false, 
      errorCode: 'UNAUTHORIZED',
      message: 'Authentication required' 
    });
  }

  // Get messageId from body or query
  const messageId = req.body?.messageId || req.query?.messageId;
  const channelId = req.body?.channelId || req.query?.channelId;

  if (!messageId) {
    return res.status(400).json({ 
      success: false, 
      errorCode: 'MISSING_MESSAGE_ID',
      message: 'Message ID is required' 
    });
  }

  let db;
  try {
    db = await getDbConnection();
    
    if (!db) {
      return res.status(503).json({ 
        success: false, 
        errorCode: 'DATABASE_UNAVAILABLE',
        message: 'Database unavailable' 
      });
    }

    // Ensure delete columns exist
    await ensureDeleteColumns(db);

    // Fetch the message
    const [messageRows] = await db.execute(
      'SELECT id, sender_id, channel_id, content, deleted_at FROM messages WHERE id = ?',
      [messageId]
    );

    if (!messageRows || messageRows.length === 0) {
      if (db && typeof db.release === 'function') db.release();
      return res.status(404).json({ 
        success: false, 
        errorCode: 'MESSAGE_NOT_FOUND',
        message: 'Message not found' 
      });
    }

    const message = messageRows[0];

    // Check if already deleted
    if (message.deleted_at) {
      if (db && typeof db.release === 'function') db.release();
      return res.status(200).json({ 
        success: true, 
        message: 'Message already deleted',
        alreadyDeleted: true
      });
    }

    // Authorization check
    if (!canDeleteMessage(user, message)) {
      if (db && typeof db.release === 'function') db.release();
      return res.status(403).json({ 
        success: false, 
        errorCode: 'FORBIDDEN',
        message: 'You do not have permission to delete this message' 
      });
    }

    // Soft-delete: Set deleted_at, replace content
    const userId = user.id || user.userId;
    const deletedAt = new Date();
    
    await db.execute(
      `UPDATE messages 
       SET deleted_at = ?, 
           deleted_by = ?,
           content = '[deleted]'
       WHERE id = ?`,
      [deletedAt, userId, messageId]
    );

    // Release connection
    if (db && typeof db.release === 'function') db.release();

    // Prepare response
    const response = {
      success: true,
      message: 'Message deleted successfully',
      messageId: messageId,
      channelId: message.channel_id || channelId,
      deletedAt: deletedAt.toISOString(),
      deletedBy: userId
    };

    // Broadcast deletion via WebSocket server (non-blocking)
    const wsUrl = process.env.WEBSOCKET_URL || 'https://aura-fx-production.up.railway.app';
    try {
      // Fire and forget - don't wait for response
      fetch(`${wsUrl}/api/broadcast-message-deleted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: messageId,
          channelId: message.channel_id || channelId,
          deletedAt: deletedAt.toISOString(),
          deletedBy: userId
        })
      }).catch(e => console.warn('WebSocket broadcast failed:', e.message));
    } catch (e) {
      console.warn('Could not broadcast deletion:', e.message);
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error deleting message:', error);
    
    if (db && typeof db.release === 'function') {
      try { db.release(); } catch (e) {}
    }
    
    return res.status(500).json({ 
      success: false, 
      errorCode: 'SERVER_ERROR',
      message: 'Failed to delete message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
