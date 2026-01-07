const mysql = require('mysql2/promise');

// Get database connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    return null;
  }

  try {
    const connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
      connectTimeout: 5000,
      ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
    await connection.ping();
    return connection;
  } catch (error) {
    console.error('Database connection error:', error);
    return null;
  }
};

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
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      pathname = url.pathname;
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

  try {
    const db = await getDbConnection();
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
      // Extract userId from request body (should be sent from frontend)
      const userId = req.body.userId || null;
      
      if (!userId) {
        await db.end();
        return res.status(400).json({ success: false, message: 'User ID required in request body' });
      }

      // Check if thread exists
      const [existing] = await db.execute(
        'SELECT * FROM threads WHERE userId = ? AND adminId IS NULL LIMIT 1',
        [userId]
      );

      if (existing.length > 0) {
        await db.end();
        return res.status(200).json({ success: true, thread: existing[0] });
      }

      // Create new thread
      const [result] = await db.execute(
        'INSERT INTO threads (userId, adminId) VALUES (?, NULL)',
        [userId]
      );

      const [newThread] = await db.execute('SELECT * FROM threads WHERE id = ?', [result.insertId]);
      await db.end();
      return res.status(200).json({ success: true, thread: newThread[0] });
    }

    // Handle /api/messages/threads - List all threads (admin only)
    if (pathname.endsWith('/threads') && req.method === 'GET') {
      const [threads] = await db.execute(
        'SELECT * FROM threads ORDER BY lastMessageAt DESC LIMIT 100'
      );
      await db.end();
      return res.status(200).json({ success: true, threads });
    }

    // Handle /api/messages/threads/:threadId/messages - Get messages for a thread
    const threadMessagesMatch = pathname.match(/\/threads\/(\d+)\/messages/);
    if (threadMessagesMatch && req.method === 'GET') {
      const threadId = parseInt(threadMessagesMatch[1]);
      const limit = parseInt(req.query.limit) || 50;

      const [messages] = await db.execute(
        'SELECT * FROM thread_messages WHERE threadId = ? ORDER BY createdAt DESC LIMIT ?',
        [threadId, limit]
      );

      // Update thread's lastMessageAt
      await db.execute('UPDATE threads SET lastMessageAt = NOW() WHERE id = ?', [threadId]);

      await db.end();
      return res.status(200).json({ success: true, messages: messages.reverse() });
    }

    // Handle /api/messages/threads/:threadId/messages - Send message to thread
    if (threadMessagesMatch && req.method === 'POST') {
      const threadId = parseInt(threadMessagesMatch[1]);
      const { body, userId } = req.body;

      if (!body || !userId) {
        await db.end();
        return res.status(400).json({ success: false, message: 'Message body and user ID required' });
      }

      // Determine recipient (if user sends, recipient is ADMIN, if admin sends, recipient is thread userId)
      const [thread] = await db.execute('SELECT * FROM threads WHERE id = ?', [threadId]);
      if (thread.length === 0) {
        await db.end();
        return res.status(404).json({ success: false, message: 'Thread not found' });
      }

      const recipientId = thread[0].userId === userId ? 'ADMIN' : String(thread[0].userId);

      // Insert message
      await db.execute(
        'INSERT INTO thread_messages (threadId, senderId, recipientId, body) VALUES (?, ?, ?, ?)',
        [threadId, userId, recipientId, body]
      );

      // Update thread's lastMessageAt
      await db.execute('UPDATE threads SET lastMessageAt = NOW() WHERE id = ?', [threadId]);

      await db.end();
      return res.status(200).json({ success: true, message: 'Message sent' });
    }

    // Handle /api/messages/threads/:threadId/read - Mark thread as read
    const threadReadMatch = pathname.match(/\/threads\/(\d+)\/read/);
    if (threadReadMatch && req.method === 'POST') {
      const threadId = parseInt(threadReadMatch[1]);
      const userId = req.body.userId || null;

      // Mark all messages in thread as read for this user
      await db.execute(
        'UPDATE thread_messages SET readAt = NOW() WHERE threadId = ? AND recipientId = ? AND readAt IS NULL',
        [threadId, userId === null ? 'ADMIN' : String(userId)]
      );

      await db.end();
      return res.status(200).json({ success: true, message: 'Thread marked as read' });
    }

    await db.end();
    return res.status(404).json({ success: false, message: 'Endpoint not found' });
  } catch (error) {
    console.error('Error in messages API:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

