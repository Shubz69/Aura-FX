const { getDbConnection } = require('../db');
const { verifyToken } = require('../utils/auth');
const { jsonSafeDeep } = require('../utils/jsonSafe');

// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

// Import notification creator for notifying recipients of new messages
let createNotification;
try {
  createNotification = require('../notifications').createNotification;
} catch (e) {
  createNotification = null;
}

// Parse body for Vercel (sometimes passed as string or buffer)
function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const raw = typeof req.body === 'string' ? req.body : (Buffer.isBuffer(req.body) ? req.body.toString() : '');
    return JSON.parse(raw || '{}');
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

  let pathname = '';
  try {
    if (req.url) {
      if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
        const url = new URL(req.url);
        pathname = url.pathname;
      } else {
        pathname = req.url.split('?')[0];
      }
    } else if (req.path) {
      pathname = req.path;
    }
  } catch (e) {
    pathname = (req.url || '').split('?')[0];
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  let decoded;
  try {
    decoded = verifyToken(req.headers.authorization);
  } catch (authErr) {
    console.error('messages/threads verifyToken error:', authErr && authErr.message);
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
  if (!decoded || !decoded.id) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  const authRole = (decoded.role || '').toString().toUpperCase();
  let isAdmin = authRole === 'ADMIN' || authRole === 'SUPER_ADMIN';

  let db = null;
  try {
    db = await getDbConnection();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection error' });
    }

    if (!isAdmin) {
      try {
        const [ar] = await db.execute(
          `SELECT 1 AS ok FROM users WHERE id = ? AND LOWER(COALESCE(role, '')) IN ('admin', 'super_admin') LIMIT 1`,
          [decoded.id]
        );
        if (ar && ar.length) isAdmin = true;
      } catch (_) {
        /* ignore */
      }
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
      const userIdRaw = body.userId != null ? body.userId : (body.user_id != null ? body.user_id : null);
      const userId = userIdRaw != null ? parseInt(userIdRaw, 10) : NaN;

      if (!Number.isFinite(userId) || userId < 1) {
        if (db && db.release) db.release();
        return res.status(400).json({ success: false, message: 'User ID required in request body' });
      }

      // Check if thread exists
      const [existing] = await db.execute(
        'SELECT * FROM threads WHERE userId = ? AND adminId IS NULL LIMIT 1',
        [userId]
      );

      if (existing.length > 0) {
        if (db.release) db.release();
        return res.status(200).json({ success: true, thread: existing[0] });
      }

      // Create new thread (auto-create DM for every user)
      const [insertResult] = await db.execute(
        'INSERT INTO threads (userId, adminId) VALUES (?, NULL)',
        [userId]
      );
      const insertId = insertResult.insertId;

      const [newThreadRows] = await db.execute('SELECT * FROM threads WHERE id = ?', [insertId]);
      if (db.release) db.release();
      return res.status(200).json({ success: true, thread: newThreadRows[0] });
    }
    
    // Handle /api/messages/threads/ensure-user/:userId - Create or get DM thread (admin with any user, or Premium+ with friend only)
    const ensureUserMatch = pathname.match(/\/ensure-user\/(\d+)/);
    if (ensureUserMatch && req.method === 'POST') {
      const targetUserId = parseInt(ensureUserMatch[1]);
      const body = parseBody(req);
      const adminUserId = body.userId || null;

      if (!adminUserId || !targetUserId) {
        db.release && db.release();
        return res.status(400).json({ success: false, message: 'User IDs required' });
      }

      if (!isAdmin) {
        // Non-admin: only allow DMs with friends, and only for Premium/Elite/Admin/SuperAdmin
        const allowedRoles = ['premium', 'elite', 'a7fx', 'admin', 'super_admin'];
        const myRole = (decoded.role || '').toString().toLowerCase();
        if (!allowedRoles.includes(myRole)) {
          db.release && db.release();
          return res.status(403).json({ success: false, message: 'Friends messaging is for Premium, Elite, or Admin only' });
        }
        if (parseInt(adminUserId, 10) !== parseInt(decoded.id, 10)) {
          db.release && db.release();
          return res.status(403).json({ success: false, message: 'Not allowed' });
        }
        // Check friendship (friendships table: user_id, friend_id)
        const [friendRows] = await db.execute(
          'SELECT 1 FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?) LIMIT 1',
          [decoded.id, targetUserId, targetUserId, decoded.id]
        );
        if (!friendRows || friendRows.length === 0) {
          db.release && db.release();
          return res.status(403).json({ success: false, message: 'You can only message friends' });
        }
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

    // Handle /api/messages/threads - List threads: admin inbox (adminId IS NULL) or DM threads (mode=dms)
    if (pathname.endsWith('/threads') && !pathname.includes('/threads/') && req.method === 'GET') {
      const modeDms = (req.query && req.query.mode === 'dms') || (req.url && req.url.includes('mode=dms'));
      const friendsOnly = (req.query && req.query.friendsOnly === '1') || (req.url && req.url.includes('friendsOnly=1'));

      if (modeDms) {
        // DM threads: (userId = me OR adminId = me) AND adminId IS NOT NULL
        const myId = decoded.id;
        const [threads] = await db.execute(
          `SELECT t.*, 
            CASE WHEN t.userId = ? THEN u2.id ELSE u1.id END as otherUserId,
            CASE WHEN t.userId = ? THEN COALESCE(u2.username, u2.email) ELSE COALESCE(u1.username, u1.email) END as username,
            CASE WHEN t.userId = ? THEN u2.email ELSE u1.email END as email
           FROM threads t
           LEFT JOIN users u1 ON u1.id = t.userId
           LEFT JOIN users u2 ON u2.id = t.adminId
           WHERE t.adminId IS NOT NULL AND (t.userId = ? OR t.adminId = ?)
           ORDER BY COALESCE(t.lastMessageAt, t.createdAt) DESC
           LIMIT 200`,
          [myId, myId, myId, myId, myId]
        );
        let result = threads || [];
        if (friendsOnly && result.length > 0) {
          const [friendRows] = await db.execute(
            'SELECT friend_id FROM friendships WHERE user_id = ? UNION SELECT user_id FROM friendships WHERE friend_id = ?',
            [myId, myId]
          );
          const friendIds = new Set((friendRows || []).map((r) => r.friend_id));
          result = result.filter((t) => {
            const other = t.userId === myId ? t.adminId : t.userId;
            return friendIds.has(other);
          });
        }
        const threadIds = result.map((t) => t.id).filter(Boolean);
        let unreadMap = {};
        if (threadIds.length > 0) {
          const placeholders = threadIds.map(() => '?').join(',');
          const [unreadRows] = await db.execute(
            `SELECT threadId, COUNT(*) as c FROM thread_messages WHERE threadId IN (${placeholders}) AND recipientId = ? AND readAt IS NULL GROUP BY threadId`,
            [...threadIds, String(myId)]
          );
          (unreadRows || []).forEach((r) => {
            const c = typeof r.c === 'bigint' ? Number(r.c) : r.c;
            unreadMap[r.threadId] = c;
          });
        }
        const threadsWithUnread = result.map((t) => ({
          ...t,
          userId: t.otherUserId,
          adminUnreadCount: unreadMap[t.id] || 0
        }));
        db.release && db.release();
        return res.status(200).json({ success: true, threads: jsonSafeDeep(threadsWithUnread) });
      }

      if (!isAdmin) {
        db.release && db.release();
        return res.status(403).json({ success: false, message: 'Admin access required' });
      }
      const [threads] = await db.execute(
        `SELECT t.*, u.username, u.email, u.name 
         FROM threads t 
         LEFT JOIN users u ON u.id = t.userId 
         WHERE t.adminId IS NULL 
         ORDER BY COALESCE(t.lastMessageAt, t.createdAt) DESC 
         LIMIT 200`
      );
      const threadIds = (threads || []).map((t) => t.id).filter(Boolean);
      let unreadMap = {};
      if (threadIds.length > 0) {
        const placeholders = threadIds.map(() => '?').join(',');
        const [unreadRows] = await db.execute(
          `SELECT threadId, COUNT(*) as c FROM thread_messages WHERE threadId IN (${placeholders}) AND recipientId = 'ADMIN' AND readAt IS NULL GROUP BY threadId`,
          threadIds
        );
        (unreadRows || []).forEach((r) => {
          const c = typeof r.c === 'bigint' ? Number(r.c) : r.c;
          unreadMap[r.threadId] = c;
        });
      }
      const threadsWithUnread = (threads || []).map((t) => ({ ...t, adminUnreadCount: unreadMap[t.id] || 0 }));
      db.release && db.release();
      return res.status(200).json({ success: true, threads: jsonSafeDeep(threadsWithUnread) });
    }

    // Handle /api/messages/threads/:threadId/messages - Get messages for a thread
    const threadMessagesMatch = pathname.match(/\/threads\/(\d+)\/messages/);
    if (threadMessagesMatch && req.method === 'GET') {
      const threadId = parseInt(threadMessagesMatch[1], 10);
      const limitRaw = parseInt(req.query?.limit, 10) || 50;
      const limit = Math.min(Math.max(1, Number.isNaN(limitRaw) ? 50 : limitRaw), 100);

      const [threadRows] = await db.execute('SELECT * FROM threads WHERE id = ?', [threadId]);
      if (!threadRows || threadRows.length === 0) {
        db.release && db.release();
        return res.status(404).json({ success: false, message: 'Thread not found' });
      }
      const thread = threadRows[0];
      const isOwner = String(thread.userId) === String(decoded.id);
      const isDmParticipant = thread.adminId != null && (String(thread.userId) === String(decoded.id) || String(thread.adminId) === String(decoded.id));
      if (!isOwner && !isAdmin && !isDmParticipant) {
        db.release && db.release();
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      // LIMIT must be a literal integer for mysql2 (avoids "Incorrect arguments to myqld_start_execute")
      const [messages] = await db.execute(
        `SELECT * FROM thread_messages WHERE threadId = ? ORDER BY createdAt DESC LIMIT ${limit}`,
        [threadId]
      );

      await db.execute('UPDATE threads SET lastMessageAt = NOW() WHERE id = ?', [threadId]);

      db.release && db.release();
      return res.status(200).json({ success: true, messages: jsonSafeDeep((messages || []).reverse()) });
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
      const isDmParticipant = thread.adminId != null && (String(thread.userId) === String(senderId) || String(thread.adminId) === String(senderId));
      if (!isOwner && !isAdmin && !isDmParticipant) {
        db.release && db.release();
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const recipientId = thread.adminId != null
        ? (String(thread.userId) === String(senderId) ? String(thread.adminId) : String(thread.userId))
        : (isOwner ? 'ADMIN' : String(thread.userId));

      const [insertResult] = await db.execute(
        'INSERT INTO thread_messages (threadId, senderId, recipientId, body) VALUES (?, ?, ?, ?)',
        [threadId, senderId, recipientId, messageBody]
      );
      const messageId = insertResult.insertId;
      const [newMsgRows] = await db.execute('SELECT id, threadId, senderId, recipientId, body, createdAt, readAt FROM thread_messages WHERE id = ?', [messageId]);
      const createdMessage = newMsgRows && newMsgRows[0] ? newMsgRows[0] : null;

      await db.execute('UPDATE threads SET lastMessageAt = NOW() WHERE id = ?', [threadId]);

      // Notify recipient: admin→user (recipientId is user id) or user→admin (recipientId is 'ADMIN')
      // #region agent log
      try {
        const { debugAgentLog } = require('../utils/debugAgentLog');
        debugAgentLog({
          location: 'messages/threads.js:POST message',
          message: 'thread message notify branch',
          hypothesisId: 'H3',
          data: {
            hasCreateNotification: !!createNotification,
            threadId,
            isDm: thread.adminId != null,
            recipientIsNumeric: !Number.isNaN(parseInt(recipientId, 10)) && parseInt(recipientId, 10) > 0,
          },
        });
      } catch (_) {}
      // #endregion
      if (createNotification) {
        const recipientUserId = parseInt(recipientId, 10);
        if (!isNaN(recipientUserId) && recipientUserId > 0) {
          const [senderRows] = await db.execute('SELECT username FROM users WHERE id = ?', [senderId]);
          const senderName = senderRows && senderRows[0] ? senderRows[0].username : 'Someone';
          const preview = typeof messageBody === 'string' && messageBody.length > 80
            ? messageBody.substring(0, 77) + '...'
            : messageBody;
          const dmTitle = thread.adminId != null
            ? `New message from ${senderName}`
            : 'New message from Admin';
          try {
            await createNotification({
              userId: recipientUserId,
              type: 'REPLY',
              title: dmTitle,
              body: `${senderName}: ${preview}`,
              channelId: 0,
              messageId: threadId,
              fromUserId: senderId,
              friendRequestId: null,
              actionStatus: null
            });
          } catch (e) {
            console.warn('Thread notification failed:', e.message);
          }
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
            try {
              await createNotification({
                userId: adminId,
                type: 'REPLY',
                title: 'New message from user',
                body: `${senderName}: ${preview}`,
                channelId: 0,
                messageId: threadId,
                fromUserId: senderId,
                friendRequestId: null,
                actionStatus: null
              });
            } catch (e) {
              console.warn('Thread notification failed:', e.message);
            }
          }
        }
      }

      db.release && db.release();
      return res.status(200).json({ success: true, message: 'Message sent', created: createdMessage });
    }

    // Handle /api/messages/threads/:threadId/read - Mark thread as read
    const threadReadMatch = pathname.match(/\/threads\/(\d+)\/read/);
    if (threadReadMatch && req.method === 'POST') {
      const threadId = parseInt(threadReadMatch[1]);
      const [trRows] = await db.execute('SELECT userId, adminId FROM threads WHERE id = ?', [threadId]);
      const thread = trRows && trRows[0] ? trRows[0] : null;
      // DM thread: messages to me have recipientId = my id. Support thread: to admin = 'ADMIN', to user = user id.
      const isDm = thread && thread.adminId != null;
      const recipientId = isDm ? String(decoded.id) : (isAdmin ? 'ADMIN' : String(decoded.id));

      await db.execute(
        'UPDATE thread_messages SET readAt = NOW() WHERE threadId = ? AND recipientId = ? AND readAt IS NULL',
        [threadId, recipientId]
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

