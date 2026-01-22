const mysql = require('mysql2/promise');

// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');
const nodemailer = require('nodemailer');

// Configure email transporter (optional – logs warning if credentials missing)
const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('Contact email credentials not configured – messages will be stored but no email will be sent.');
    return null;
  }

  try {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } catch (error) {
    console.error('Failed to configure email transporter:', error.message);
    return null;
  }
};

const transporter = createTransporter();
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'shubzfx@gmail.com';
const CONTACT_FROM = process.env.CONTACT_FROM || process.env.EMAIL_USER || 'no-reply@aurafx.com';

const sendContactEmail = async ({ name, email, subject, message }) => {
  if (!transporter) {
    console.log('Email transporter not configured; skipping outbound contact email.');
    return { sent: false, reason: 'transporter_not_configured' };
  }

  try {
    await transporter.sendMail({
      from: CONTACT_FROM,
      to: CONTACT_INBOX,
      subject: subject ? `[Contact] ${subject}` : `Contact form message from ${name || 'Visitor'}`,
      replyTo: email,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name || 'N/A'}</p>
        <p><strong>Email:</strong> ${email || 'N/A'}</p>
        ${subject ? `<p><strong>Subject:</strong> ${subject}</p>` : ''}
        <p><strong>Message:</strong></p>
        <p>${(message || '').replace(/\n/g, '<br>')}</p>
        <hr />
        <p style="font-size: 12px; color: #666;">Submitted via AURA FX contact form.</p>
      `
    });

    return { sent: true };
  } catch (error) {
    console.error('Failed to send contact email:', error.message);
    return { sent: false, reason: error.message };
  }
};

// Get database connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    console.error('Missing MySQL environment variables for admin');
    return null;
  }

  try {
    const connectionConfig = {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306,
      connectTimeout: 10000,
    };

    if (process.env.MYSQL_SSL === 'true') {
      connectionConfig.ssl = { rejectUnauthorized: false };
    } else {
      connectionConfig.ssl = false;
    }

    const connection = await mysql.createConnection(connectionConfig);
    await connection.ping();
    return connection;
  } catch (error) {
    console.error('Database connection error in admin:', error.message);
    return null;
  }
};

module.exports = async (req, res) => {
  // Handle CORS - allow both www and non-www origins
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle HEAD requests
  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  // Extract the path to determine which endpoint to handle
  // Vercel passes the path in req.url or we can construct it
  // Use WHATWG URL API to avoid deprecation warnings
  let pathname = '';
  try {
    if (req.url) {
      // Handle relative URLs properly without triggering url.parse() deprecation
      if (req.url.startsWith('http://') || req.url.startsWith('https://')) {
        const url = new URL(req.url);
        pathname = url.pathname;
      } else {
        // For relative URLs, extract pathname directly
        const urlPath = req.url.split('?')[0]; // Remove query string
        pathname = urlPath;
      }
    } else if (req.path) {
      pathname = req.path;
    }
  } catch (e) {
    // Fallback: check if this is a contact request based on query or body
    pathname = req.url ? req.url.split('?')[0] : '';
  }

  // Handle /api/subscription/check
  if ((pathname.includes('/subscription/check') || pathname.endsWith('/subscription/check')) && (req.method === 'GET' || req.method === 'POST')) {
    try {
      const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
      
      if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        // Check if subscription columns exist, add if not
        try {
          await db.execute('SELECT subscription_status FROM users LIMIT 1');
        } catch (e) {
          await db.execute('ALTER TABLE users ADD COLUMN subscription_status VARCHAR(50) DEFAULT NULL');
        }
        
        try {
          await db.execute('SELECT subscription_expiry FROM users LIMIT 1');
        } catch (e) {
          await db.execute('ALTER TABLE users ADD COLUMN subscription_expiry DATETIME DEFAULT NULL');
        }
        
        try {
          await db.execute('SELECT payment_failed FROM users LIMIT 1');
        } catch (e) {
          await db.execute('ALTER TABLE users ADD COLUMN payment_failed BOOLEAN DEFAULT FALSE');
        }

        const [rows] = await db.execute(
          'SELECT subscription_status, subscription_expiry, payment_failed, role FROM users WHERE id = ?',
          [userId]
        );
        await db.end();

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = rows[0];
        const userRole = (user.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'ADMIN';
        const isPremium = userRole === 'premium' || userRole === 'a7fx' || userRole === 'elite';
        
        // Admins always have access
        if (isAdmin) { {
          return res.status(200).json({
            success: true,
            hasActiveSubscription: true,
            isAdmin: true,
            paymentFailed: false,
            expiry: null
          });
        }

        // Premium role alone does NOT grant access - must have active subscription status

        if (user.payment_failed === 1 || user.payment_failed === true) {
          return res.status(200).json({
            success: true,
            hasActiveSubscription: false,
            isAdmin: false,
            paymentFailed: true,
            expiry: user.subscription_expiry,
            message: 'Your payment has failed. Please update your payment method to continue using the community.'
          });
        }

        if (user.subscription_status === 'active' && user.subscription_expiry) {
          const expiryDate = new Date(user.subscription_expiry);
          const now = new Date();
          
          if (expiryDate > now) {
            return res.status(200).json({
              success: true,
              hasActiveSubscription: true,
              isAdmin: false,
              paymentFailed: false,
              expiry: user.subscription_expiry
            });
          } else {
            return res.status(200).json({
              success: true,
              hasActiveSubscription: false,
              isAdmin: false,
              paymentFailed: false,
              expiry: user.subscription_expiry,
              message: 'Your subscription has expired. Please renew to continue using the community.'
            });
          }
        }

        return res.status(200).json({
          success: true,
          hasActiveSubscription: false,
          isAdmin: false,
          paymentFailed: false,
          expiry: null,
          message: 'You need an active subscription to access the community.'
        });
      } catch (dbError) {
        console.error('Database error checking subscription:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({ success: false, message: 'Failed to check subscription status' });
      }
    } catch (error) {
      console.error('Error in subscription check:', error);
      return res.status(500).json({ success: false, message: 'An error occurred' });
    }
  }

  // Handle /api/admin/user-status
  if ((pathname.includes('/user-status') || pathname.endsWith('/admin/user-status')) && req.method === 'GET') {
    try {
      const db = await getDbConnection();
      if (!db) {
        return res.status(200).json({
          onlineUsers: [],
          totalUsers: 0,
          success: false,
          message: 'User status unavailable (database not configured)'
        });
      }

      try {
        // Ensure required columns exist
        const ensureUserColumn = async (columnDefinition, testQuery) => {
          try {
            await db.execute(testQuery);
          } catch (err) {
            await db.execute(`ALTER TABLE users ADD COLUMN ${columnDefinition}`);
          }
        };

        await ensureUserColumn('last_seen DATETIME DEFAULT NULL', 'SELECT last_seen FROM users LIMIT 1');
        await ensureUserColumn('created_at DATETIME DEFAULT CURRENT_TIMESTAMP', 'SELECT created_at FROM users LIMIT 1');

        // Consider users online if they were active in the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        
        const [rows] = await db.execute(
          `SELECT id, username, email, name, avatar, role, last_seen, created_at
           FROM users 
           WHERE (last_seen IS NOT NULL AND last_seen >= ?)
              OR (last_seen IS NULL AND created_at IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE))
           ORDER BY COALESCE(last_seen, created_at) DESC`,
          [fiveMinutesAgo]
        );
        
        // Get total users count (including deleted/banned status)
        const [allUsers] = await db.execute('SELECT COUNT(*) as total FROM users');
        await db.end();

        const onlineUsers = rows.map(row => ({
          id: row.id,
          username: row.username,
          email: row.email,
          name: row.name,
          avatar: row.avatar || '/avatars/avatar_ai.png',
          role: row.role,
          lastSeen: row.last_seen
        }));

        return res.status(200).json({
          onlineUsers: onlineUsers,
          totalUsers: allUsers[0]?.total || 0
        });
      } catch (dbError) {
        console.error('Database error fetching user status:', dbError.message);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch user status'
        });
      }
    } catch (error) {
      console.error('Error in admin/user-status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user status'
      });
    }
  }

  // Handle /api/contact (GET, POST, DELETE) - consolidated into admin endpoint
  // Check if this is a contact endpoint request
  const isContactRequest = pathname.includes('/contact') || pathname.endsWith('/contact') || 
                          (req.url && req.url.includes('/contact'));

  if (isContactRequest) {
    // GET - Fetch all contact messages (admin only)
    if (req.method === 'GET') {
      try {
        const db = await getDbConnection();
        if (!db) {
          console.warn('Contact GET requested but database connection unavailable – returning empty list.');
          return res.status(200).json([]);
        }

        try {
          await db.execute(`
            CREATE TABLE IF NOT EXISTS contact_messages (
              id INT AUTO_INCREMENT PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              email VARCHAR(255) NOT NULL,
              subject VARCHAR(255),
              message TEXT NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              \`read\` BOOLEAN DEFAULT FALSE,
              INDEX idx_email (email),
              INDEX idx_created (created_at)
            )
          `);

          const [rows] = await db.execute(
            'SELECT * FROM contact_messages ORDER BY created_at DESC'
          );
          await db.end();

          const messages = rows.map(row => ({
            id: row.id,
            name: row.name,
            email: row.email,
            subject: row.subject,
            message: row.message,
            createdAt: row.created_at,
            read: row.read === 1 || row.read === true
          }));

          return res.status(200).json(messages);
        } catch (dbError) {
          console.error('Database error fetching contact messages:', dbError.message);
          if (db && !db.ended) await db.end();
          return res.status(500).json({
            success: false,
            message: 'Failed to fetch contact messages'
          });
        }
      } catch (error) {
        console.error('Error in contact GET:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch contact messages'
        });
      }
    }

    // POST - Submit new contact message
    if (req.method === 'POST') {
      try {
        const { name, email, subject, message } = req.body || {};

        if (!name || !email || !message) {
          return res.status(400).json({
            success: false,
            message: 'Name, email, and message are required'
          });
        }

        const db = await getDbConnection();
        let emailResult = { sent: false, reason: 'skipped' };

        try {
          if (db) {
            await db.execute(`
            CREATE TABLE IF NOT EXISTS contact_messages (
              id INT AUTO_INCREMENT PRIMARY KEY,
              name VARCHAR(255) NOT NULL,
              email VARCHAR(255) NOT NULL,
              subject VARCHAR(255),
              message TEXT NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              \`read\` BOOLEAN DEFAULT FALSE
            )
          `);

            await db.execute(
              'INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
              [name, email, subject || '', message]
            );
            await db.end();
          } else {
            console.warn('Contact POST received but database not configured – message will not be persisted.');
          }

          emailResult = await sendContactEmail({ name, email, subject, message });

          return res.status(200).json({
            success: true,
            message: emailResult.sent
              ? 'Contact message submitted successfully'
              : 'Contact message received. Email notification could not be sent automatically.',
            emailSent: emailResult.sent,
            emailReason: emailResult.reason || null
          });
        } catch (dbError) {
          console.error('Database error submitting contact message:', dbError.message);
          if (db && !db.ended) await db.end();

          emailResult = await sendContactEmail({ name, email, subject, message });

          return res.status(200).json({
            success: true,
            message: emailResult.sent
              ? 'Contact message submitted successfully (email notification sent).'
              : 'Contact message submitted but email notification failed.',
            emailSent: emailResult.sent,
            emailReason: emailResult.reason || dbError.message
          });
        }
      } catch (error) {
        console.error('Error in contact POST:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to submit contact message'
        });
      }
    }

    // DELETE - Delete contact message (admin only)
    if (req.method === 'DELETE') {
      try {
        const { id } = req.query || {};
        let messageId = id;

        if (!messageId && pathname) {
          const parts = pathname.split('/');
          messageId = parts[parts.length - 1];
        }

        if (!messageId) {
          return res.status(400).json({
            success: false,
            message: 'Message ID is required'
          });
        }

        const db = await getDbConnection();
        if (!db) {
          return res.status(500).json({
            success: false,
            message: 'Database connection error'
          });
        }

        try {
          const [result] = await db.execute(
            'DELETE FROM contact_messages WHERE id = ?',
            [messageId]
          );
          await db.end();

          if (result.affectedRows > 0) {
            return res.status(200).json({
              success: true,
              message: 'Contact message deleted successfully'
            });
          } else {
            return res.status(404).json({
              success: false,
              message: 'Message not found'
            });
          }
        } catch (dbError) {
          console.error('Database error deleting contact message:', dbError.message);
          if (db && !db.ended) await db.end();
          return res.status(500).json({
            success: false,
            message: 'Failed to delete contact message'
          });
        }
      } catch (error) {
        console.error('Error in contact DELETE:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete contact message'
        });
      }
    }
  }

  // Handle /api/admin/users - Get all users (Super Admin only)
  if ((pathname.includes('/users') || pathname.endsWith('/users')) && req.method === 'GET') {
    try {
      // Check if user is super admin
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // TODO: Verify JWT and check if user is super admin
      // For now, allow if token exists (you should add proper JWT verification)

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        // Check if metadata column exists
        let hasMetadata = false;
        try {
          await db.execute('SELECT metadata FROM users LIMIT 1');
          hasMetadata = true;
        } catch (e) {
          // Column doesn't exist, that's okay
          hasMetadata = false;
        }

        // Check if created_at and last_seen exist
        let hasCreatedAt = false;
        let hasLastSeen = false;
        try {
          await db.execute('SELECT created_at, last_seen FROM users LIMIT 1');
          hasCreatedAt = true;
          hasLastSeen = true;
        } catch (e) {
          // Check individually
          try {
            await db.execute('SELECT created_at FROM users LIMIT 1');
            hasCreatedAt = true;
          } catch (e2) {}
          try {
            await db.execute('SELECT last_seen FROM users LIMIT 1');
            hasLastSeen = true;
          } catch (e2) {}
        }

        // Check if XP and level columns exist
        let hasXP = false;
        let hasLevel = false;
        try {
          await db.execute('SELECT xp FROM users LIMIT 1');
          hasXP = true;
        } catch (e) {}
        try {
          await db.execute('SELECT level FROM users LIMIT 1');
          hasLevel = true;
        } catch (e) {}

        // Check if subscription columns exist
        let hasSubscriptionStatus = false;
        let hasSubscriptionPlan = false;
        let hasSubscriptionExpiry = false;
        try {
          await db.execute('SELECT subscription_status FROM users LIMIT 1');
          hasSubscriptionStatus = true;
        } catch (e) {}
        try {
          await db.execute('SELECT subscription_plan FROM users LIMIT 1');
          hasSubscriptionPlan = true;
        } catch (e) {}
        try {
          await db.execute('SELECT subscription_expiry FROM users LIMIT 1');
          hasSubscriptionExpiry = true;
        } catch (e) {}

        // Build query based on available columns
        let query = 'SELECT id, email, username, role';
        if (hasMetadata) {
          query += ', JSON_EXTRACT(metadata, "$.capabilities") as capabilities';
        }
        if (hasCreatedAt) {
          query += ', created_at';
        }
        if (hasLastSeen) {
          query += ', last_seen';
        }
        if (hasXP) {
          query += ', xp';
        }
        if (hasLevel) {
          query += ', level';
        }
        if (hasSubscriptionStatus) {
          query += ', subscription_status';
        }
        if (hasSubscriptionPlan) {
          query += ', subscription_plan';
        }
        if (hasSubscriptionExpiry) {
          query += ', subscription_expiry';
        }
        query += ' FROM users';
        if (hasCreatedAt) {
          query += ' ORDER BY created_at DESC';
        } else {
          query += ' ORDER BY id DESC';
        }

        const [users] = await db.execute(query);

        const formattedUsers = users.map(user => {
          const formatted = {
            id: user.id,
            email: user.email || '',
            username: user.username || user.name || '',
            role: user.role || 'free',
            capabilities: [],
            xp: hasXP ? (user.xp || 0) : 0,
            level: hasLevel ? (user.level || 1) : 1,
            subscription_status: hasSubscriptionStatus ? (user.subscription_status || 'inactive') : 'inactive',
            subscription_plan: hasSubscriptionPlan ? (user.subscription_plan || null) : null,
            subscription_expiry: hasSubscriptionExpiry ? (user.subscription_expiry || null) : null
          };

          // Parse capabilities if metadata exists
          if (hasMetadata && user.capabilities) {
            try {
              formatted.capabilities = JSON.parse(user.capabilities);
            } catch (e) {
              formatted.capabilities = [];
            }
          }

          if (hasCreatedAt) {
            formatted.createdAt = user.created_at;
          }
          if (hasLastSeen) {
            formatted.lastSeen = user.last_seen;
          }

          return formatted;
        });

        await db.end();
        return res.status(200).json(formattedUsers);
      } catch (dbError) {
        console.error('Database error fetching users:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({ 
          success: false, 
          message: 'Failed to fetch users',
          error: dbError.message 
        });
      }
    } catch (error) {
      console.error('Error in users GET:', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
  }

  // Handle /api/admin/users/:userId/role - Update user role and capabilities (Super Admin only)
  if (pathname.includes('/users/') && pathname.includes('/role') && req.method === 'PUT') {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // Extract userId from path
      const userIdMatch = pathname.match(/\/users\/(\d+)\/role/);
      if (!userIdMatch) {
        return res.status(400).json({ success: false, message: 'Invalid user ID' });
      }
      const userId = userIdMatch[1];

      const { role, capabilities } = req.body;

      if (!role) {
        return res.status(400).json({ success: false, message: 'Role is required' });
      }

      // Validate role
      const validRoles = ['free', 'premium', 'a7fx', 'elite', 'admin', 'super_admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        // Verify requester is super admin
        let requesterEmail = null;
        try {
          const tokenParts = token.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            const [requesterRows] = await db.execute('SELECT email, role FROM users WHERE id = ?', [payload.id]);
            if (requesterRows.length > 0) {
              requesterEmail = requesterRows[0].email;
              const requesterRole = requesterRows[0].role;
              
              // Only super admin can assign admin or super_admin roles
              if ((role === 'admin' || role === 'super_admin') && 
                  requesterEmail !== 'shubzfx@gmail.com' && 
                  requesterRole !== 'super_admin') {
                await db.end();
                return res.status(403).json({ 
                  success: false, 
                  message: 'Only Super Admin can assign admin roles' 
                });
              }
            }
          }
        } catch (tokenError) {
          // If token parsing fails, check by email in token or allow if it's a valid admin token
          console.warn('Token parsing error, proceeding with role check:', tokenError.message);
        }

        // Check if target user is super admin
        const [userRows] = await db.execute('SELECT email FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
          await db.end();
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userEmail = userRows[0].email;
        if (userEmail === 'shubzfx@gmail.com' && role !== 'super_admin') {
          await db.end();
          return res.status(403).json({ success: false, message: 'Cannot change Super Admin role' });
        }

        // Update user role
        await db.execute('UPDATE users SET role = ? WHERE id = ?', [role, userId]);

        // Update capabilities in metadata JSON field
        if (capabilities && Array.isArray(capabilities)) {
          // Check if metadata column exists
          try {
            await db.execute('SELECT metadata FROM users LIMIT 1');
          } catch (e) {
            await db.execute('ALTER TABLE users ADD COLUMN metadata JSON DEFAULT NULL');
          }

          await db.execute(
            'UPDATE users SET metadata = JSON_SET(COALESCE(metadata, "{}"), "$.capabilities", ?) WHERE id = ?',
            [JSON.stringify(capabilities), userId]
          );
        }

        if (db && typeof db.release === 'function') {
          db.release();
        } else if (db && typeof db.end === 'function') {
          await db.end();
        }
        return res.status(200).json({ 
          success: true, 
          message: 'User role and capabilities updated successfully' 
        });
      } catch (dbError) {
        console.error('Database error updating user role:', dbError);
        if (db && typeof db.release === 'function') {
          db.release();
        } else if (db && typeof db.end === 'function' && !db.ended) {
          await db.end();
        }
        return res.status(500).json({ success: false, message: 'Failed to update user role' });
      }
    } catch (error) {
      console.error('Error in user role update:', error);
      return res.status(500).json({ success: false, message: 'Failed to update user role' });
    }
  }

  // Handle /api/admin/users/:userId - Delete user (Super Admin only)
  if (pathname.includes('/users/') && !pathname.includes('/role') && req.method === 'DELETE') {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      // Extract userId from path
      const userIdMatch = pathname.match(/\/users\/(\d+)/);
      if (!userIdMatch) {
        return res.status(400).json({ success: false, message: 'Invalid user ID' });
      }
      const userId = userIdMatch[1];

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        // Check if user exists
        const [userRows] = await db.execute('SELECT email FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
          await db.end();
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const userEmail = userRows[0].email;
        
        // Prevent deletion of super admin
        if (userEmail === 'shubzfx@gmail.com') {
          await db.end();
          return res.status(403).json({ success: false, message: 'Cannot delete Super Admin account' });
        }

        // Delete user
        await db.execute('DELETE FROM users WHERE id = ?', [userId]);

        // Notify WebSocket server to logout user immediately
        try {
            const wsServerUrl = process.env.WEBSOCKET_SERVER_URL || 'https://aura-fx-production.up.railway.app';
            const notifyResponse = await fetch(`${wsServerUrl}/api/notify-user-deleted`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId: userId })
            });
            
            if (notifyResponse.ok) {
                console.log(`User ${userId} notified of account deletion via WebSocket`);
            } else {
                console.warn(`Failed to notify user ${userId} via WebSocket, but user was deleted`);
            }
        } catch (wsError) {
            console.warn('WebSocket notification failed (user still deleted):', wsError.message);
            // Don't fail the deletion if WebSocket notification fails
        }

        await db.end();
        return res.status(200).json({ 
          success: true, 
          message: 'User deleted successfully' 
        });
      } catch (dbError) {
        console.error('Database error deleting user:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({ success: false, message: 'Failed to delete user' });
      }
    } catch (error) {
      console.error('Error in user delete:', error);
      return res.status(500).json({ success: false, message: 'Failed to delete user' });
    }
  }

  // Handle /api/admin/revoke-access
  if ((pathname.includes('/revoke-access') || pathname.endsWith('/revoke-access')) && req.method === 'POST') {
    try {
      const { userId } = req.body || {};

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }

      try {
        // Revoke access by setting subscription to inactive and role to free
        await db.execute(
          'UPDATE users SET subscription_status = ?, payment_failed = TRUE, role = ? WHERE id = ?',
          ['inactive', 'free', userId]
        );

        await db.end();

        return res.status(200).json({
          success: true,
          message: 'Community access revoked successfully'
        });
      } catch (dbError) {
        console.error('Database error revoking access:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to revoke access'
        });
      }
    } catch (error) {
      console.error('Error revoking access:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Handle /api/admin/users/:userId/subscription - Update user subscription (Super Admin only)
  if (pathname.includes('/users/') && pathname.includes('/subscription') && req.method === 'PUT') {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      // TODO: Verify JWT and check if user is super admin
      // For now, allow if token exists (you should add proper JWT verification)

      // Extract userId from path
      const userIdMatch = pathname.match(/\/users\/(\d+)\/subscription/);
      if (!userIdMatch) {
        await db.end();
        return res.status(400).json({ success: false, message: 'Invalid user ID' });
      }
      const userId = userIdMatch[1];

      const { subscription_status, subscription_plan, subscription_expiry, role } = req.body;

      // Validate subscription status
      const validStatuses = ['active', 'inactive', 'cancelled', 'expired'];
      if (subscription_status && !validStatuses.includes(subscription_status)) {
        await db.end();
        return res.status(400).json({ success: false, message: 'Invalid subscription status' });
      }

      // Validate subscription plan
      const validPlans = ['aura', 'a7fx', 'elite', null];
      if (subscription_plan !== undefined && !validPlans.includes(subscription_plan)) {
        await db.end();
        return res.status(400).json({ success: false, message: 'Invalid subscription plan' });
      }

      // Validate role if provided
      const validRoles = ['free', 'premium', 'a7fx', 'elite', 'admin', 'super_admin'];
      if (role && !validRoles.includes(role)) {
        await db.end();
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }

      // Check if user exists
      const [userRows] = await db.execute('SELECT email FROM users WHERE id = ?', [userId]);
      if (userRows.length === 0) {
        await db.end();
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const userEmail = userRows[0].email;
      if (userEmail === 'shubzfx@gmail.com' && role && role !== 'super_admin') {
        await db.end();
        return res.status(403).json({ success: false, message: 'Cannot change Super Admin role' });
      }

      // Build update query dynamically
      const updates = [];
      const values = [];

      if (subscription_status !== undefined) {
        updates.push('subscription_status = ?');
        values.push(subscription_status);
      }

      if (subscription_plan !== undefined) {
        updates.push('subscription_plan = ?');
        values.push(subscription_plan);
      }

      if (subscription_expiry !== undefined) {
        updates.push('subscription_expiry = ?');
        values.push(subscription_expiry ? new Date(subscription_expiry) : null);
      }

      // Auto-update role based on subscription if role not explicitly provided
      if (role !== undefined) {
        updates.push('role = ?');
        values.push(role);
      } else if (subscription_status === 'active' && subscription_plan) {
        // Auto-assign role based on plan
        let autoRole = 'free';
        if (subscription_plan === 'a7fx' || subscription_plan === 'elite') {
          autoRole = 'elite'; // A7FX purchases get Elite role
        } else if (subscription_plan === 'aura') {
          autoRole = 'premium';
        }
        updates.push('role = ?');
        values.push(autoRole);
      } else if (subscription_status === 'inactive' || subscription_status === 'cancelled' || subscription_status === 'expired') {
        // Auto-downgrade to free if subscription is inactive
        updates.push('role = ?');
        values.push('free');
      }

      if (updates.length === 0) {
        await db.end();
        return res.status(400).json({ success: false, message: 'No fields to update' });
      }

      values.push(userId);
      const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      await db.execute(query, values);

      // Fetch updated user data
      const [updatedRows] = await db.execute(
        'SELECT id, email, role, subscription_status, subscription_plan, subscription_expiry FROM users WHERE id = ?',
        [userId]
      );

      await db.end();
      return res.status(200).json({
        success: true,
        message: 'Subscription updated successfully',
        user: updatedRows[0]
      });
    } catch (error) {
      console.error('Error updating subscription:', error);
      return res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }
  }

  // Handle /api/admin/give-xp - Give XP points to a user
  if ((pathname.includes('/give-xp') || pathname.endsWith('/give-xp')) && req.method === 'POST') {
    try {
      const { userId, xpAmount } = req.body || {};

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
      }

      if (!xpAmount || xpAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid XP amount is required (must be greater than 0)'
        });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error'
        });
      }

      try {
        // Check if XP column exists, if not add it
        try {
          await db.execute('SELECT xp FROM users LIMIT 1');
        } catch (e) {
          console.log('XP column does not exist, adding it...');
          await db.execute('ALTER TABLE users ADD COLUMN xp DECIMAL(10, 2) DEFAULT 0');
        }

        // Check if level column exists, if not add it
        try {
          await db.execute('SELECT level FROM users LIMIT 1');
        } catch (e) {
          console.log('Level column does not exist, adding it...');
          await db.execute('ALTER TABLE users ADD COLUMN level INT DEFAULT 1');
        }

        // Get current XP
        const [userRows] = await db.execute('SELECT xp, level FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
          await db.end();
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }

        const currentXP = parseFloat(userRows[0].xp || 0);
        const currentLevel = parseInt(userRows[0].level || 1);
        const newXP = Math.max(0, currentXP + parseFloat(xpAmount)); // Prevent negative XP

        // Use the new XP system level calculation
        // Import the function (we'll need to require it properly)
        const getLevelFromXP = (xp) => {
            if (xp <= 0) return 1;
            if (xp >= 1000000) return 1000;
            
            if (xp < 500) {
                return Math.floor(Math.sqrt(xp / 50)) + 1;
            } else if (xp < 5000) {
                const baseLevel = 10;
                const remainingXP = xp - 500;
                return baseLevel + Math.floor(Math.sqrt(remainingXP / 100)) + 1;
            } else if (xp < 20000) {
                const baseLevel = 50;
                const remainingXP = xp - 5000;
                return baseLevel + Math.floor(Math.sqrt(remainingXP / 200)) + 1;
            } else if (xp < 100000) {
                const baseLevel = 100;
                const remainingXP = xp - 20000;
                return baseLevel + Math.floor(Math.sqrt(remainingXP / 500)) + 1;
            } else if (xp < 500000) {
                const baseLevel = 200;
                const remainingXP = xp - 100000;
                return baseLevel + Math.floor(Math.sqrt(remainingXP / 1000)) + 1;
            } else {
                const baseLevel = 500;
                const remainingXP = xp - 500000;
                return Math.min(1000, baseLevel + Math.floor(Math.sqrt(remainingXP / 2000)) + 1);
            }
        };
        
        const newLevel = getLevelFromXP(newXP);
        const leveledUp = newLevel > currentLevel;

        // Update user XP and level
        await db.execute(
            'UPDATE users SET xp = ?, level = ? WHERE id = ?',
            [newXP, newLevel, userId]
        );

        // If user leveled up, send notification
        if (leveledUp) {
            try {
                // Get username
                const [userInfo] = await db.execute('SELECT username, name FROM users WHERE id = ?', [userId]);
                const username = userInfo[0]?.username || userInfo[0]?.name || 'User';
                
                // Send level-up notification (async, don't wait)
                fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/users/level-up-notification`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userId,
                        oldLevel: currentLevel,
                        newLevel: newLevel,
                        username: username
                    })
                }).catch(err => console.error('Failed to send level-up notification:', err));
            } catch (notifError) {
                console.error('Error sending level-up notification:', notifError);
            }
        }

        await db.execute(
          'UPDATE users SET xp = ?, level = ? WHERE id = ?',
          [newXP, newLevel, userId]
        );

        await db.end();

        return res.status(200).json({
          success: true,
          message: `Successfully awarded ${xpAmount} XP points`,
          newXP: newXP,
          newLevel: newLevel
        });
      } catch (dbError) {
        console.error('Database error giving XP:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({
          success: false,
          message: 'Failed to give XP points'
        });
      }
    } catch (error) {
      console.error('Error giving XP:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  return res.status(404).json({ success: false, message: 'Endpoint not found' });
};

