const mysql = require('mysql2/promise');
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
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'platform@theglitch.online';
const CONTACT_FROM = process.env.CONTACT_FROM || process.env.EMAIL_USER || 'no-reply@theglitch.world';

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
        <p style="font-size: 12px; color: #666;">Submitted via THE GLITCH contact form.</p>
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
  let pathname = '';
  try {
    if (req.url) {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      pathname = url.pathname;
    } else if (req.path) {
      pathname = req.path;
    }
  } catch (e) {
    // Fallback: check if this is a contact request based on query or body
    pathname = req.url || '';
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
        const isAdmin = user.role === 'ADMIN' || user.role === 'admin';
        
        if (isAdmin) {
          return res.status(200).json({
            success: true,
            hasActiveSubscription: true,
            isAdmin: true,
            paymentFailed: false,
            expiry: null
          });
        }

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
              read BOOLEAN DEFAULT FALSE,
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
              read BOOLEAN DEFAULT FALSE
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
            capabilities: []
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
      const validRoles = ['free', 'premium', 'admin', 'super_admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }

      // Super admin cannot be changed
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        // Check if user is super admin
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

        await db.end();
        return res.status(200).json({ 
          success: true, 
          message: 'User role and capabilities updated successfully' 
        });
      } catch (dbError) {
        console.error('Database error updating user role:', dbError);
        if (db && !db.ended) await db.end();
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

  return res.status(404).json({ success: false, message: 'Endpoint not found' });
};

