const { getDbConnection } = require('../db');
const { verifyToken } = require('../utils/auth');

// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

// Import notification creator for notifying recipients of new messages
let createNotification;
try {
  createNotification = require('../notifications').createNotification;
} catch (e) {
  createNotification = null;
}

// Parse body for Vercel (sometimes passed as string)
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : {};
  } catch (e) {
    return {};
  }
}

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Extract pathname
  let pathname = '';
  try {
    if (req.url) {
      // Handle relative URLs properly without triggering url.parse() deprecation
      if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
        const url = new URL(req.url);
        pathname = url.pathname;
      } else {
        // For relative URLs, extract pathname directly
        pathname = req.url.split('?')[0]; // Remove query string
      }
    } else if (req.path) {
      pathname = req.path;
    }
  } catch (e) {
    pathname = req.url || '';
  }

  // Get auth token
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const decoded = verifyToken(req.headers.authorization);
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  const authRole = (decoded.role || '').toString().toUpperCase();
  const isAdmin = authRole === 'ADMIN' || authRole === 'SUPER_ADMIN';

  let db = null;
  try {
    db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    // Ensure threads table exists
    await db.execute(`
      CREATE TABLE IF NOT EXISTS threads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        adminId INT DEFAULT NULL,
        lastMessageAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_userId (userId),
        INDEX idx_adminId (adminId)
      )
    `);

    // Ensure thread_messages table exists
    await db.execute(`
      CREATE TABLE IF NOT EXISTS thread_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        threadId INT NOT NULL,
        senderId INT NOT NULL,
        recipientId VARCHAR(50) NOT NULL,
        body TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        readAt TIMESTAMP NULL,
        INDEX idx_threadId (threadId),
        INDEX idx_senderId (senderId),
        FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE
      )
    `);

    // Handle /api/messages/threads/ensure-admin - Create or get user's admin thread
    if (pathname.includes('/ensure-admin') && req.method === 'POST') {
      const body = parseBody(req);
      const userId = body.userId || null;
      
      if (!userId) {
        db.release && db.release();
        return res.status(400).json({ success: false, message: 'User ID required in request body' });
      }

      // Check if thread exists
      const [existing] = await db.execute(
        'SELECT * FROM threads WHERE userId = ? AND adminId IS NULL LIMIT 1',
        [userId]
      );

      if (existing.length > 0) {
        db.release && db.release();
        return res.status(200).json({ success: true, thread: existing[0] });
      }

      // Create new thread (auto-create DM for every user)
      const [insertResult] = await db.execute(
        'INSERT INTO threads (userId, adminId) VALUES (?, NULL)',
        [userId]
      );
      const insertId = insertResult.insertId;

      const [newThreadRows] = await db.execute('SELECT * FROM threads WHERE id = ?', [insertId]);
      db.release && db.release();
      return res.status(200).json({ success: true, thread: newThreadRows[0] });
    }
    
    // Handle /api/messages/threads/ensure-user/:userId - Create or get DM thread with specific user (for admins)
    const ensureUserMatch = pathname.match(/\/ensure-user\/(\d+)/);
    if (ensureUserMatch && req.method === 'POST') {
      const targetUserId = parseInt(ensureUserMatch[1]);
      const body = parseBody(req);
      const adminUserId = body.userId || null;
      
      if (!adminUserId || !targetUserId) {
        db.release && db.release();
        return res.status(400).json({ success: false, message: 'User IDs required' });
      }

      const [existing] = await db.execute(
        'SELECT * FROM threads WHERE (userId = ? AND adminId = ?) OR (userId = ? AND adminId = ?) LIMIT 1',
        [targetUserId, adminUserId, adminUserId, targetUserId]
      );

      if (existing.length > 0) {
        db.release && db.release();
        return res.status(200).json({ success: true, thread: existing[0] });
      }

      const [insertResult] = await db.execute(
        'INSERT INTO threads (userId, adminId) VALUES (?, ?)',
        [targetUserId, adminUserId]
      );
      const insertId = insertResult.insertId;

      const [newThreadRows] = await db.execute('SELECT * FROM threads WHERE id = ?', [insertId]);
      db.release && db.release();
      return res.status(200).json({ success: true, thread: newThreadRows[0] });
    }

    // Handle /api/messages/threads - List all user-support threads (admin only)
    // Only threads with adminId IS NULL = shared inbox; all admins see same users
    if (pathname.endsWith('/threads') && !pathname.includes('/threads/') && req.method === 'GET') {
      if (!isAdmin) {
        db.release && db.release();
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }
      const [threads] = await db.execute(
        `SELECT t.*, u.username, u.email, u.name 
         FROM threads t 
         LEFT JOIN users u ON u.id = t.userId 
         WHERE t.adminId IS NULL 
         ORDER BY t.lastMessageAt DESC 
         LIMIT 200`
      );
      db.release && db.release();
      return res.status(200).json({ success: true, threads: threads || [] });
    }

    // Handle /api/messages/threads/:threadId/messages - Get messages for a thread
    const threadMessagesMatch = pathname.match(/\/threads\/(\d+)\/messages/);
    if (threadMessagesMatch && req.method === 'GET') {
      const threadId = parseInt(threadMessagesMatch[1]);
      const limit = Math.min(parseInt(req.query?.limit) || 50, 100);

      const [threadRows] = await db.execute('SELECT * FROM threads WHERE id = ?', [threadId]);
      if (!threadRows || threadRows.length === 0) {
        db.release && db.release();
        return res.status(404).json({ success: false, message: 'Thread not found' });
      }
      const thread = threadRows[0];
      const isOwner = String(thread.userId) === String(decoded.id);
      if (!isOwner && !isAdmin) {
        db.release && db.release();
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const [messages] = await db.execute(
        'SELECT * FROM thread_messages WHERE threadId = ? ORDER BY createdAt DESC LIMIT ?',
        [threadId, limit]
      );

      await db.execute('UPDATE threads SET lastMessageAt = NOW() WHERE id = ?', [threadId]);

      db.release && db.release();
      return res.status(200).json({ success: true, messages: (messages || []).reverse() });
    }

    // Handle /api/messages/threads/:threadId/messages - Send message to thread
    if (threadMessagesMatch && req.method === 'POST') {
      const threadId = parseInt(threadMessagesMatch[1]);
      const body = parseBody(req);
      const { body: messageBody } = body;
      const senderId = decoded.id;

      if (!messageBody) {
        db.release && db.release();
        return res.status(400).json({ success: false, message: 'Message body required' });
      }

      const [threadRows] = await db.execute('SELECT * FROM threads WHERE id = ?', [threadId]);
      if (!threadRows || threadRows.length === 0) {
        db.release && db.release();
        return res.status(404).json({ success: false, message: 'Thread not found' });
      }
      const thread = threadRows[0];
      const isOwner = String(thread.userId) === String(senderId);
      if (!isOwner && !isAdmin) {
        db.release && db.release();
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const recipientId = isOwner ? 'ADMIN' : String(thread.userId);

      await db.execute(
        'INSERT INTO thread_messages (threadId, senderId, recipientId, body) VALUES (?, ?, ?, ?)',
        [threadId, senderId, recipientId, messageBody]
      );

      await db.execute('UPDATE threads SET lastMessageAt = NOW() WHERE id = ?', [threadId]);

      // Notify recipient: admin→user (recipientId is user id) or user→admin (recipientId is 'ADMIN')
      if (createNotification) {
        const recipientUserId = parseInt(recipientId, 10);
        if (!isNaN(recipientUserId) && recipientUserId > 0) {
          const [senderRows] = await db.execute('SELECT username FROM users WHERE id = ?', [senderId]);
          const senderName = senderRows && senderRows[0] ? senderRows[0].username : 'Admin';
          const preview = typeof messageBody === 'string' && messageBody.length > 80
            ? messageBody.substring(0, 77) + '...'
            : messageBody;
          createNotification({
            userId: recipientUserId,
            type: 'REPLY',
            title: 'New message from Admin',
            body: `${senderName}: ${preview}`,
            channelId: 0,
            messageId: threadId,
            fromUserId: senderId,
            friendRequestId: null,
            actionStatus: null
          }).catch((e) => console.warn('Thread notification failed:', e.message));
        } else if (recipientId === 'ADMIN') {
          const [senderRows] = await db.execute('SELECT username FROM users WHERE id = ?', [senderId]);
          const senderName = senderRows && senderRows[0] ? senderRows[0].username : 'A user';
          const preview = typeof messageBody === 'string' && messageBody.length > 80
            ? messageBody.substring(0, 77) + '...'
            : messageBody;
          const [adminRows] = await db.execute(
            "SELECT id FROM users WHERE LOWER(role) IN ('admin', 'super_admin')"
          );
          const adminIds = (adminRows || []).map((r) => r.id).filter(Boolean);
          for (const adminId of adminIds) {
            createNotification({
              userId: adminId,
              type: 'REPLY',
              title: 'New message from user',
              body: `${senderName}: ${preview}`,
              channelId: 0,
              messageId: threadId,
              fromUserId: senderId,
              friendRequestId: null,
              actionStatus: null
            }).catch((e) => console.warn('Thread notification failed:', e.message));
          }
        }
      }

      db.release && db.release();
      return res.status(200).json({ success: true, message: 'Message sent' });
    }

    // Handle /api/messages/threads/:threadId/read - Mark thread as read
    const threadReadMatch = pathname.match(/\/threads\/(\d+)\/read/);
    if (threadReadMatch && req.method === 'POST') {
      const threadId = parseInt(threadReadMatch[1]);
      const body = parseBody(req);
      const userId = body.userId ?? null;

      await db.execute(
        'UPDATE thread_messages SET readAt = NOW() WHERE threadId = ? AND recipientId = ? AND readAt IS NULL',
        [threadId, userId === null ? 'ADMIN' : String(userId)]
      );

      db.release && db.release();
      return res.status(200).json({ success: true, message: 'Thread marked as read' });
    }

    db.release && db.release();
    return res.status(404).json({ success: false, message: 'Endpoint not found' });
  } catch (error) {
    console.error('Error in messages/threads API:', error);
    try {
      if (db && typeof db.release === 'function') db.release();
    } catch (e) { /* ignore */ }
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

