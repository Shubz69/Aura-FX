// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');
const { getDbConnection } = require('../db');
const nodemailer = require('nodemailer');
const { verifyToken } = require('../utils/auth');
const { isSuperAdminEmail } = require('../utils/entitlements');
const { assertStaffAdminFromRequest } = require('../utils/adminAccess');
const { jsonNumber, jsonSafeDeep } = require('../utils/jsonSafe');
const { canonicalStoredPlanFromAny, normalizeKey } = require('../utils/subscriptionNormalize');
const {
  permissionRoleFromUserRow,
  canonicalSubscriptionPlanForResponse
} = require('../utils/userResponseNormalize');

/** Map admin-submitted tier aliases to canonical stored roles (admin / super_admin unchanged). */
function normalizeAdminTierRoleWrite(role) {
  const r = (role || '').toString().trim().toLowerCase();
  if (r === 'super_admin' || r === 'admin') return r;
  if (r === 'free' || r === 'access') return 'access';
  if (r === 'premium' || r === 'aura' || r === 'pro') return 'pro';
  if (r === 'a7fx' || r === 'elite') return 'elite';
  return 'access';
}

/** Cryptographic JWT + DB role super_admin or env SUPER_ADMIN_EMAIL match. */
async function assertSuperAdminDb(db, authHeader) {
  const decoded = verifyToken(authHeader);
  if (!decoded || !decoded.id) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  const [rows] = await db.execute('SELECT email, role FROM users WHERE id = ? LIMIT 1', [decoded.id]);
  if (!rows || !rows.length) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  const row = rows[0];
  const r = (row.role || '').toString().trim().toLowerCase();
  if (r === 'super_admin' || isSuperAdminEmail(row)) {
    return { ok: true, decoded };
  }
  return { ok: false, status: 403, message: 'Super Admin access required' };
}
const { postLevelUpToLevelsChannel } = require('../utils/post-level-up-to-levels-channel');

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
const CONTACT_INBOX = process.env.CONTACT_INBOX || 'support@auraterminal.ai';
const CONTACT_FROM = process.env.CONTACT_FROM || process.env.EMAIL_USER || 'no-reply@auraterminal.ai';

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
        <p style="font-size: 12px; color: #666;">Submitted via AURA TERMINAL™ contact form.</p>
      `
    });

    return { sent: true };
  } catch (error) {
    console.error('Failed to send contact email:', error.message);
    return { sent: false, reason: error.message };
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

  // Handle /api/subscription/check (uses shared pool to avoid connection exhaustion)
  if ((pathname.includes('/subscription/check') || pathname.endsWith('/subscription/check')) && (req.method === 'GET' || req.method === 'POST')) {
    const releaseDb = (conn) => { if (conn && typeof conn.release === 'function') { try { conn.release(); } catch (_) {} } };
    let db = null;
    try {
      try {
      const userId = req.method === 'GET' ? req.query.userId : req.body.userId;
      
      if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
      }

      db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

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
      try {
        await db.execute('SELECT subscription_plan FROM users LIMIT 1');
      } catch (e) {
        await db.execute('ALTER TABLE users ADD COLUMN subscription_plan VARCHAR(50) DEFAULT NULL');
      }

      const [rows] = await db.execute(
        'SELECT subscription_status, subscription_expiry, payment_failed, role, subscription_plan FROM users WHERE id = ?',
        [userId]
      );
      releaseDb(db);
      db = null;

        if (rows.length === 0) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const user = rows[0];
        const userRole = (user.role || '').toLowerCase();
        const isAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'ADMIN';
        const isPremium =
          userRole === 'premium' ||
          userRole === 'pro' ||
          userRole === 'a7fx' ||
          userRole === 'elite';
        
        // CRITICAL: Admins ALWAYS have access - no subscription required, no payment checks
        if (isAdmin) {
          return res.status(200).json({
            success: true,
            hasActiveSubscription: true,
            isAdmin: true,
            isPremium: false,
            paymentFailed: false,
            expiry: null,
            message: 'Admin access granted'
          });
        }

        // CRITICAL: Premium role users (premium, a7fx, elite) ALWAYS have access - grant access based on role
        // Even if subscription_status is inactive, premium role grants access
        if (isPremium) {
          return res.status(200).json({
            success: true,
            hasActiveSubscription: true,
            isAdmin: false,
            isPremium: true,
            paymentFailed: false,
            expiry: user.subscription_expiry || null,
            subscriptionPlan: canonicalSubscriptionPlanForResponse(user),
            message: 'Premium role access granted'
          });
        }

        // Only check payment_failed for non-admin, non-premium users
        if (user.payment_failed === 1 || user.payment_failed === true) {
          return res.status(200).json({
            success: true,
            hasActiveSubscription: false,
            isAdmin: false,
            isPremium: false,
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
              expiry: user.subscription_expiry,
              subscriptionPlan: canonicalSubscriptionPlanForResponse(user)
            });
          } else {
            return res.status(200).json({
              success: true,
              hasActiveSubscription: false,
              isAdmin: false,
              paymentFailed: false,
              expiry: user.subscription_expiry,
              subscriptionPlan: canonicalSubscriptionPlanForResponse(user),
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
        releaseDb(db);
        return res.status(500).json({ success: false, message: 'Failed to check subscription status' });
      }
    } catch (error) {
      console.error('Error in subscription check:', error);
      releaseDb(db);
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

        // Build SELECT from columns that exist (username/name/avatar may be missing)
        let hasUsername = false;
        let hasName = false;
        let hasAvatar = false;
        try { await db.execute('SELECT username FROM users LIMIT 1'); hasUsername = true; } catch (_) {}
        try { await db.execute('SELECT name FROM users LIMIT 1'); hasName = true; } catch (_) {}
        try { await db.execute('SELECT avatar FROM users LIMIT 1'); hasAvatar = true; } catch (_) {}
        let hasSubscriptionPlanCol = false;
        try { await db.execute('SELECT subscription_plan FROM users LIMIT 1'); hasSubscriptionPlanCol = true; } catch (_) {}
        let selectCols = 'id, email, role, last_seen, created_at';
        if (hasUsername) selectCols += ', username';
        if (hasName) selectCols += ', name';
        if (hasAvatar) selectCols += ', avatar';
        if (hasSubscriptionPlanCol) selectCols += ', subscription_plan';

        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const [rows] = await db.execute(
          `SELECT ${selectCols}
           FROM users 
           WHERE (last_seen IS NOT NULL AND last_seen >= ?)
              OR (last_seen IS NULL AND created_at IS NOT NULL AND created_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE))
           ORDER BY COALESCE(last_seen, created_at) DESC`,
          [fiveMinutesAgo]
        );
        const [allUsers] = await db.execute('SELECT COUNT(*) as total FROM users');
        db.release();

        const onlineUsers = rows.map((row) => ({
          id: row.id,
          username: hasUsername ? (row.username || '') : (row.name || ''),
          email: row.email || '',
          name: hasName ? (row.name || '') : (row.username || ''),
          avatar: hasAvatar ? (row.avatar ?? null) : null,
          role: permissionRoleFromUserRow(row),
          subscriptionPlan: hasSubscriptionPlanCol ? canonicalSubscriptionPlanForResponse(row) : null,
          lastSeen: row.last_seen
        }));

        return res.status(200).json({
          onlineUsers: onlineUsers,
          totalUsers: jsonNumber(allUsers[0]?.total, 0)
        });
      } catch (dbError) {
        console.error('Database error fetching user status:', dbError.message);
        if (db) { try { db.release(); } catch (_) {} }
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
    const ensureContactTable = async (db) => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS contact_messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          subject VARCHAR(255),
          message TEXT NOT NULL,
          user_id INT DEFAULT NULL,
          user_role VARCHAR(64) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          \`read\` BOOLEAN DEFAULT FALSE,
          dealt_with BOOLEAN DEFAULT FALSE,
          INDEX idx_email (email),
          INDEX idx_created (created_at)
        )
      `);
      // Idempotent column additions
      const extras = [
        ["user_id", "INT DEFAULT NULL"],
        ["user_role", "VARCHAR(64) DEFAULT NULL"],
        ["dealt_with", "BOOLEAN DEFAULT FALSE"]
      ];
      for (const [col, def] of extras) {
        try {
          await db.execute(`ALTER TABLE contact_messages ADD COLUMN ${col} ${def}`);
        } catch (e) {
          if (!e.message.includes('Duplicate column')) throw e;
        }
      }
    };

    // GET - Fetch all contact messages (admin only)
    if (req.method === 'GET') {
      try {
        const db = await getDbConnection();
        if (!db) {
          console.warn('Contact GET requested but database connection unavailable – returning empty list.');
          return res.status(200).json([]);
        }

        try {
          await ensureContactTable(db);
          const [rows] = await db.execute(
            'SELECT * FROM contact_messages ORDER BY created_at DESC'
          );
          db.release();

          const messages = rows.map(row => ({
            id: row.id,
            name: row.name,
            email: row.email,
            subject: row.subject,
            message: row.message,
            userRole: row.user_role || null,
            userId: row.user_id || null,
            createdAt: row.created_at,
            read: row.read === 1 || row.read === true,
            dealtWith: row.dealt_with === 1 || row.dealt_with === true
          }));

          return res.status(200).json(messages);
        } catch (dbError) {
          console.error('Database error fetching contact messages:', dbError.message);
          if (db) { try { db.release(); } catch (_) {} }
          return res.status(500).json({ success: false, message: 'Failed to fetch contact messages' });
        }
      } catch (error) {
        console.error('Error in contact GET:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch contact messages' });
      }
    }

    // PATCH - Mark contact message as dealt with (admin only)
    if (req.method === 'PATCH') {
      try {
        const parts = pathname.split('/');
        const messageId = parts[parts.length - 1];
        if (!messageId || isNaN(parseInt(messageId))) {
          return res.status(400).json({ success: false, message: 'Message ID required' });
        }
        const db = await getDbConnection();
        if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });
        try {
          const dealtWith = req.body?.dealt_with !== false;
          await db.execute(
            'UPDATE contact_messages SET dealt_with = ? WHERE id = ?',
            [dealtWith ? 1 : 0, parseInt(messageId)]
          );
          db.release();
          return res.status(200).json({ success: true, dealtWith });
        } catch (dbError) {
          if (db) { try { db.release(); } catch (_) {} }
          return res.status(500).json({ success: false, message: dbError.message });
        }
      } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
      }
    }

    // POST - Submit new contact message
    if (req.method === 'POST') {
      try {
        const { name, email, subject, message, user_id, user_role } = req.body || {};

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
            await ensureContactTable(db);
            await db.execute(
              'INSERT INTO contact_messages (name, email, subject, message, user_id, user_role) VALUES (?, ?, ?, ?, ?, ?)',
              [name, email, subject || '', message, user_id || null, user_role || null]
            );
            db.release();
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
          if (db) { try { db.release(); } catch (_) {} }

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
          db.release();

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
          if (db) { try { db.release(); } catch (_) {} }
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

  // Handle /api/admin/users - Get all users (Admin or Super Admin)
  if ((pathname.includes('/users') || pathname.endsWith('/users')) && req.method === 'GET') {
    try {
      const gate = await assertStaffAdminFromRequest(req);
      if (!gate.ok) {
        return res.status(gate.status).json({ success: false, message: gate.message });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        // Check base columns (some DBs may have name instead of username or different schema)
        let hasUsername = false;
        let hasName = false;
        try {
          await db.execute('SELECT id, email, username, role FROM users LIMIT 1');
          hasUsername = true;
        } catch (e) {
          try {
            await db.execute('SELECT id, email, name, role FROM users LIMIT 1');
            hasName = true;
          } catch (e2) {
            console.error('Admin users: missing base columns (id, email, username/name, role):', e?.message || e2?.message);
            if (db) { try { db.release(); } catch (_) {} }
            return res.status(500).json({ success: false, message: 'Database schema error: users table missing required columns' });
          }
        }

        // Check if metadata column exists
        let hasMetadata = false;
        try {
          await db.execute('SELECT metadata FROM users LIMIT 1');
          hasMetadata = true;
        } catch (e) {
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
        let query = 'SELECT id, email, role';
        if (hasUsername) {
          query += ', username';
        }
        if (hasName && !hasUsername) {
          query += ', name';
        }
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
        let demoWhere = `COALESCE(email,'') NOT LIKE '%@aurafx.demo'`;
        try {
          await db.execute('SELECT is_demo FROM users LIMIT 1');
          demoWhere = `(is_demo IS NULL OR is_demo = 0 OR is_demo = FALSE) AND ${demoWhere}`;
        } catch (_) {}
        query += ` FROM users WHERE ${demoWhere}`;
        if (hasCreatedAt) {
          query += ' ORDER BY created_at DESC';
        } else {
          query += ' ORDER BY id DESC';
        }

        const [users] = await db.execute(query);

        const formattedUsers = users.map((user) => {
          const formatted = {
            id: jsonNumber(user.id),
            email: user.email || '',
            username: user.username || user.name || '',
            role: permissionRoleFromUserRow(user),
            capabilities: [],
            xp: hasXP ? jsonNumber(user.xp, 0) : 0,
            level: hasLevel ? jsonNumber(user.level ?? 1, 1) : 1,
            subscription_status: hasSubscriptionStatus ? (user.subscription_status || 'inactive') : 'inactive',
            subscriptionPlan: hasSubscriptionPlan ? canonicalSubscriptionPlanForResponse(user) : null,
            subscription_expiry: hasSubscriptionExpiry ? (user.subscription_expiry || null) : null
          };

          // Parse capabilities if metadata exists (driver may return string or object)
          if (hasMetadata && user.capabilities != null) {
            try {
              formatted.capabilities = typeof user.capabilities === 'string'
                ? JSON.parse(user.capabilities)
                : Array.isArray(user.capabilities)
                  ? user.capabilities
                  : [];
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

        db.release();
        return res.status(200).json(jsonSafeDeep(formattedUsers));
      } catch (dbError) {
        console.error('Database error fetching users:', dbError);
        if (db) { try { db.release(); } catch (_) {} }
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
      const validRoleKeys = ['free', 'access', 'premium', 'aura', 'pro', 'a7fx', 'elite', 'admin', 'super_admin'];
      if (!validRoleKeys.includes(normalizeKey(role))) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      const gate = await assertSuperAdminDb(db, req.headers.authorization);
      if (!gate.ok) {
        try {
          db.release();
        } catch (_) {}
        return res.status(gate.status).json({ success: false, message: gate.message });
      }

      try {
        // Check if target user is super admin
        const [userRows] = await db.execute('SELECT email, role FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
          db.release();
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const targetDbRole = (userRows[0].role || '').toString().trim().toLowerCase();

        const storedTierRole = normalizeAdminTierRoleWrite(role);
        if ((targetDbRole === 'super_admin' || isSuperAdminEmail(userRows[0])) && storedTierRole !== 'super_admin') {
          db.release();
          return res.status(403).json({ success: false, message: 'Cannot change Super Admin role' });
        }
        /* Granting super_admin: caller already passed assertSuperAdminDb (DB super_admin or env-listed email).
           Target need not be pre-listed in SUPER_ADMIN_EMAIL — that list is for recognition / bootstrap only. */

        // Update user role (canonical tier strings)
        await db.execute('UPDATE users SET role = ? WHERE id = ?', [storedTierRole, userId]);

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

        if (db) { try { db.release(); } catch (_) {} }
        return res.status(200).json({ 
          success: true, 
          message: 'User role and capabilities updated successfully' 
        });
      } catch (dbError) {
        console.error('Database error updating user role:', dbError);
        if (db) { try { db.release(); } catch (_) {} }
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

      const gate = await assertSuperAdminDb(db, req.headers.authorization);
      if (!gate.ok) {
        try {
          db.release();
        } catch (_) {}
        return res.status(gate.status).json({ success: false, message: gate.message });
      }

      try {
        // Check if user exists
        const [userRows] = await db.execute('SELECT email, role FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
          db.release();
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const targetRole = (userRows[0].role || '').toString().trim().toLowerCase();
        if (targetRole === 'super_admin' || isSuperAdminEmail(userRows[0])) {
          db.release();
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

        db.release();
        return res.status(200).json({ 
          success: true, 
          message: 'User deleted successfully' 
        });
      } catch (dbError) {
        console.error('Database error deleting user:', dbError);
        if (db) { try { db.release(); } catch (_) {} }
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

      const gate = await assertSuperAdminDb(db, req.headers.authorization);
      if (!gate.ok) {
        try {
          db.release();
        } catch (_) {}
        return res.status(gate.status).json({ success: false, message: gate.message });
      }

      try {
        // Revoke access: inactive + access tier (canonical)
        await db.execute(
          'UPDATE users SET subscription_status = ?, payment_failed = TRUE, role = ?, subscription_plan = ? WHERE id = ?',
          ['inactive', 'access', 'access', userId]
        );

        db.release();

        return res.status(200).json({
          success: true,
          message: 'Community access revoked successfully'
        });
      } catch (dbError) {
        console.error('Database error revoking access:', dbError);
        if (db) { try { db.release(); } catch (_) {} }
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
    let db;
    try {
      db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      const gate = await assertSuperAdminDb(db, req.headers.authorization);
      if (!gate.ok) {
        try {
          db.release();
        } catch (_) {}
        return res.status(gate.status).json({ success: false, message: gate.message });
      }

      // Extract userId from path
      const userIdMatch = pathname.match(/\/users\/(\d+)\/subscription/);
      if (!userIdMatch) {
        db.release();
        return res.status(400).json({ success: false, message: 'Invalid user ID' });
      }
      const userId = userIdMatch[1];

      const { subscription_status, subscription_plan, subscription_expiry, role } = req.body;

      // Validate subscription status
      const validStatuses = ['active', 'inactive', 'cancelled', 'expired'];
      if (subscription_status && !validStatuses.includes(subscription_status)) {
        db.release();
        return res.status(400).json({ success: false, message: 'Invalid subscription status' });
      }

      const allowedPlanKeys = new Set(['aura', 'a7fx', 'elite', 'premium', 'pro', 'access', 'free']);
      if (
        subscription_plan !== undefined &&
        subscription_plan !== null &&
        !allowedPlanKeys.has(normalizeKey(subscription_plan))
      ) {
        db.release();
        return res.status(400).json({ success: false, message: 'Invalid subscription plan' });
      }

      const subValidRoleKeys = ['free', 'access', 'premium', 'aura', 'pro', 'a7fx', 'elite', 'admin', 'super_admin'];
      if (role && !subValidRoleKeys.includes(normalizeKey(role))) {
        db.release();
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }

      // Check if user exists
      const [userRows] = await db.execute('SELECT email, role FROM users WHERE id = ?', [userId]);
      if (userRows.length === 0) {
        db.release();
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const targetRoleRow = (userRows[0].role || '').toString().trim().toLowerCase();
      if (
        (targetRoleRow === 'super_admin' || isSuperAdminEmail(userRows[0])) &&
        role &&
        normalizeKey(role) !== 'super_admin'
      ) {
        db.release();
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
        values.push(
          subscription_plan === null ? null : canonicalStoredPlanFromAny(subscription_plan) || null
        );
      }

      if (subscription_expiry !== undefined) {
        updates.push('subscription_expiry = ?');
        values.push(subscription_expiry ? new Date(subscription_expiry) : null);
      }

      // Auto-update role based on subscription if role not explicitly provided
      if (role !== undefined) {
        updates.push('role = ?');
        values.push(normalizeAdminTierRoleWrite(role));
      } else if (subscription_status === 'active' && subscription_plan) {
        const sp = canonicalStoredPlanFromAny(subscription_plan);
        let autoRole = 'access';
        if (sp === 'elite') autoRole = 'elite';
        else if (sp === 'pro') autoRole = 'pro';
        else if (sp === 'access') autoRole = 'access';
        updates.push('role = ?');
        values.push(autoRole);
      } else if (subscription_status === 'inactive' || subscription_status === 'cancelled' || subscription_status === 'expired') {
        updates.push('role = ?');
        values.push('access');
      }

      if (updates.length === 0) {
        db.release();
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

      db.release();
      const u = updatedRows[0];
      return res.status(200).json({
        success: true,
        message: 'Subscription updated successfully',
        user: {
          id: u.id,
          email: u.email,
          role: permissionRoleFromUserRow(u),
          subscriptionPlan: canonicalSubscriptionPlanForResponse(u),
          subscription_status: u.subscription_status,
          subscription_expiry: u.subscription_expiry
        }
      });
    } catch (error) {
      console.error('Error updating subscription:', error);
      if (db) {
        try {
          db.release();
        } catch (_) {}
      }
      return res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }
  }

  // Handle /api/admin/journal-stats - Journal progress overview (admin only)
  if ((pathname.includes('/journal-stats') || pathname.endsWith('/journal-stats')) && req.method === 'GET') {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      try {
        let requesterId = null;
        try {
          const tokenParts = token.split('.');
          if (tokenParts.length === 3) {
            const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
            requesterId = payload.id;
          }
        } catch (e) { /* ignore */ }
        if (!requesterId) {
          db.release();
          return res.status(401).json({ success: false, message: 'Invalid token' });
        }

        const [roleRows] = await db.execute('SELECT role FROM users WHERE id = ?', [requesterId]);
        if (roleRows.length === 0) {
          db.release();
          return res.status(401).json({ success: false, message: 'User not found' });
        }
        const role = (roleRows[0].role || '').toString().toLowerCase().trim();
        const allowedRoles = ['admin', 'super_admin', 'pro', 'premium', 'aura', 'a7fx', 'elite'];
        if (!allowedRoles.includes(role)) {
          db.release();
          return res.status(403).json({ success: false, message: 'Admin only' });
        }

        const userId = req.query?.userId ? parseInt(req.query.userId, 10) : null;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

        // Ensure journal tables exist (optional – may 404 if not used yet)
        try {
          await db.execute('SELECT 1 FROM journal_tasks LIMIT 1');
        } catch (e) {
          db.release();
          return res.status(200).json({
            summary: { usersWithJournal: 0, tasksLast7: 0, tasksLast30: 0, completedWithProofLast7: 0, completedWithProofLast30: 0, totalJournalXpAwarded: 0 },
            users: []
          });
        }

        if (userId) {
          // Single-user detail
          const [userRows] = await db.execute(
            'SELECT id, email, username, xp, level FROM users WHERE id = ?',
            [userId]
          );
          const u = userRows && userRows[0];
          if (!u) {
            db.release();
            return res.status(404).json({ success: false, message: 'User not found' });
          }
          const [taskRows] = await db.execute(
            `SELECT date, COUNT(*) as total, SUM(completed=1) as completed, SUM(CASE WHEN completed=1 AND proof_image IS NOT NULL AND proof_image != '' THEN 1 ELSE 0 END) as withProof
             FROM journal_tasks WHERE userId = ? GROUP BY date ORDER BY date DESC LIMIT 90`,
            [userId]
          );
          const [xpRows] = await db.execute(
            'SELECT award_type, SUM(xp_amount) as xp, COUNT(*) as count FROM journal_xp_awards WHERE userId = ? GROUP BY award_type',
            [userId]
          );
          const [notesRows] = await db.execute(
            'SELECT COUNT(*) as cnt FROM journal_daily WHERE userId = ? AND notes IS NOT NULL AND notes != ""',
            [userId]
          );
          const [proofTasksRows] = await db.execute(
            `SELECT id, date, title FROM journal_tasks WHERE userId = ? AND proof_image IS NOT NULL AND proof_image != '' ORDER BY date DESC, id`,
            [userId]
          );
          db.release();
          return res.status(200).json({
            user: {
              id: u.id,
              email: u.email,
              username: u.username || u.email,
              xp: u.xp || 0,
              level: u.level || 1
            },
            tasksByDate: (taskRows || []).map(r => ({
              date: r.date ? String(r.date).slice(0, 10) : null,
              total: Number(r.total),
              completed: Number(r.completed),
              withProof: Number(r.withProof)
            })),
            tasksWithProof: (proofTasksRows || []).map(r => ({
              id: r.id,
              date: r.date ? String(r.date).slice(0, 10) : null,
              title: r.title || ''
            })),
            xpByType: (xpRows || []).map(r => ({ type: r.award_type, xp: Number(r.xp), count: Number(r.count) })),
            notesSaved: (notesRows && notesRows[0]) ? Number(notesRows[0].cnt) : 0
          });
        }

        // Summary
        const [usersWithJournal] = await db.execute(
          'SELECT COUNT(DISTINCT userId) as c FROM journal_tasks'
        );
        const [tasks7] = await db.execute(
          'SELECT COUNT(*) as c FROM journal_tasks WHERE date >= ?',
          [sevenDaysAgo]
        );
        const [tasks30] = await db.execute(
          'SELECT COUNT(*) as c FROM journal_tasks WHERE date >= ?',
          [thirtyDaysAgo]
        );
        const [proof7] = await db.execute(
          `SELECT COUNT(*) as c FROM journal_tasks WHERE date >= ? AND completed = 1 AND proof_image IS NOT NULL AND proof_image != ''`,
          [sevenDaysAgo]
        );
        const [proof30] = await db.execute(
          `SELECT COUNT(*) as c FROM journal_tasks WHERE date >= ? AND completed = 1 AND proof_image IS NOT NULL AND proof_image != ''`,
          [thirtyDaysAgo]
        );
        let totalJournalXp = 0;
        try {
          const [xpSum] = await db.execute('SELECT COALESCE(SUM(xp_amount), 0) as s FROM journal_xp_awards');
          totalJournalXp = Number(xpSum && xpSum[0] ? xpSum[0].s : 0);
        } catch (e) { /* table may not exist */ }

        const summary = {
          usersWithJournal: usersWithJournal && usersWithJournal[0] ? Number(usersWithJournal[0].c) : 0,
          tasksLast7: tasks7 && tasks7[0] ? Number(tasks7[0].c) : 0,
          tasksLast30: tasks30 && tasks30[0] ? Number(tasks30[0].c) : 0,
          completedWithProofLast7: proof7 && proof7[0] ? Number(proof7[0].c) : 0,
          completedWithProofLast30: proof30 && proof30[0] ? Number(proof30[0].c) : 0,
          totalJournalXpAwarded: totalJournalXp
        };

        // Per-user progress (only users with journal activity)
        const [allTaskAgg] = await db.execute(
          `SELECT userId,
            COUNT(*) as tasksTotal,
            SUM(completed=1) as tasksCompleted,
            SUM(CASE WHEN completed=1 AND proof_image IS NOT NULL AND proof_image != '' THEN 1 ELSE 0 END) as withProof,
            MAX(date) as lastDate
          FROM journal_tasks GROUP BY userId`
        );
        const taskByUser = {};
        (allTaskAgg || []).forEach(r => {
          taskByUser[r.userId] = {
            tasksTotal: Number(r.tasksTotal),
            tasksCompleted: Number(r.tasksCompleted),
            withProof: Number(r.withProof),
            lastDate: r.lastDate ? String(r.lastDate).slice(0, 10) : null
          };
        });

        let xpByUser = {};
        try {
          const [xpAgg] = await db.execute('SELECT userId, SUM(xp_amount) as total FROM journal_xp_awards GROUP BY userId');
          (xpAgg || []).forEach(r => { xpByUser[r.userId] = Number(r.total); });
        } catch (e) { /* ignore */ }

        const userIds = [...new Set([...Object.keys(taskByUser).map(Number), ...Object.keys(xpByUser).map(Number)])];
        if (userIds.length === 0) {
          db.release();
          return res.status(200).json({ summary, users: [] });
        }

        const placeholders = userIds.map(() => '?').join(',');
        const [userRows] = await db.execute(
          `SELECT id, email, username, xp, level FROM users WHERE id IN (${placeholders})`,
          userIds
        );
        const users = (userRows || []).map(u => {
          const tid = u.id;
          const agg = taskByUser[tid] || { tasksTotal: 0, tasksCompleted: 0, withProof: 0, lastDate: null };
          return {
            id: u.id,
            email: u.email,
            username: u.username || u.email,
            xp: u.xp || 0,
            level: u.level || 1,
            tasksTotal: agg.tasksTotal,
            tasksCompleted: agg.tasksCompleted,
            tasksWithProof: agg.withProof,
            lastTaskDate: agg.lastDate,
            journalXpEarned: xpByUser[tid] || 0
          };
        });

        db.release();
        return res.status(200).json({ summary, users });
      } catch (dbErr) {
        console.error('Database error in journal-stats:', dbErr);
        if (db) { try { db.release(); } catch (_) {} }
        return res.status(500).json({ success: false, message: 'Failed to load journal stats' });
      }
    } catch (err) {
      console.error('Error in journal-stats:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Handle /api/admin/journal-proof?taskId=xxx - Get proof image for a task (admin only; for viewing user's folder)
  if ((pathname.includes('/journal-proof') || pathname.endsWith('/journal-proof')) && req.method === 'GET') {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
      let requesterId = null;
      try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
          requesterId = payload.id;
        }
      } catch (e) { /* ignore */ }
      if (!requesterId) return res.status(401).json({ success: false, message: 'Invalid token' });
      const db = await getDbConnection();
      if (!db) return res.status(500).json({ success: false, message: 'Database connection error' });
      try {
        const [roleRows] = await db.execute('SELECT role FROM users WHERE id = ?', [requesterId]);
        if (roleRows.length === 0) { db.release(); return res.status(401).json({ success: false, message: 'User not found' }); }
        const role = (roleRows[0].role || '').toString().toLowerCase().trim();
        if (!['admin', 'super_admin', 'pro', 'premium', 'aura', 'a7fx', 'elite'].includes(role)) {
          db.release();
          return res.status(403).json({ success: false, message: 'Admin only' });
        }
        const taskId = req.query?.taskId ? String(req.query.taskId).trim() : null;
        if (!taskId) {
          db.release();
          return res.status(400).json({ success: false, message: 'taskId required' });
        }
        const [rows] = await db.execute('SELECT proof_image, userId FROM journal_tasks WHERE id = ?', [taskId]);
        db.release();
        if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Task not found' });
        const proof = rows[0].proof_image;
        if (!proof) return res.status(404).json({ success: false, message: 'No proof image for this task' });
        return res.status(200).json({ success: true, proofImage: proof, userId: rows[0].userId });
      } catch (e) {
        if (db) { try { db.release(); } catch (_) {} }
        throw e;
      }
    } catch (err) {
      console.error('Error in journal-proof:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Handle /api/admin/give-xp — must write xp_events or cron syncUserXpFromLedger overwrites users.xp
  if ((pathname.includes('/give-xp') || pathname.endsWith('/give-xp')) && req.method === 'POST') {
    try {
      const { invalidatePattern } = require('../cache');
      const { userId, xpAmount: rawAmt } = req.body || {};
      const xpAmount = parseFloat(rawAmt);

      if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
      }
      if (Number.isNaN(xpAmount) || xpAmount === 0) {
        return res.status(400).json({ success: false, message: 'Enter a non-zero XP amount' });
      }

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database connection error' });
      }

      const getLevelFromXP = (xp) => {
        if (xp <= 0) return 1;
        if (xp >= 1000000) return 1000;
        if (xp < 500) return Math.floor(Math.sqrt(xp / 50)) + 1;
        if (xp < 5000) return 10 + Math.floor(Math.sqrt((xp - 500) / 100)) + 1;
        if (xp < 20000) return 50 + Math.floor(Math.sqrt((xp - 5000) / 200)) + 1;
        if (xp < 100000) return 100 + Math.floor(Math.sqrt((xp - 20000) / 500)) + 1;
        if (xp < 500000) return 200 + Math.floor(Math.sqrt((xp - 100000) / 1000)) + 1;
        return Math.min(1000, 500 + Math.floor(Math.sqrt((xp - 500000) / 2000)) + 1);
      };

      try {
        try {
          await db.execute('SELECT xp FROM users LIMIT 1');
        } catch (e) {
          await db.execute('ALTER TABLE users ADD COLUMN xp DECIMAL(12, 2) DEFAULT 0');
        }
        try {
          await db.execute('SELECT level FROM users LIMIT 1');
        } catch (e) {
          await db.execute('ALTER TABLE users ADD COLUMN level INT DEFAULT 1');
        }

        await db.execute(`
          CREATE TABLE IF NOT EXISTS xp_events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            amount DECIMAL(12, 2) NOT NULL,
            source VARCHAR(50) NOT NULL,
            meta JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_created_at (created_at)
          )
        `);

        const [userRows] = await db.execute('SELECT xp, level FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) {
          db.release();
          return res.status(404).json({ success: false, message: 'User not found' });
        }

        const currentXP = parseFloat(userRows[0].xp || 0);
        const currentLevel = parseInt(userRows[0].level || 1, 10);

        // Full reset (matches AdminPanel "Reset XP")
        if (xpAmount <= -999999) {
          await db.execute('DELETE FROM xp_events WHERE user_id = ?', [userId]);
          await db.execute('UPDATE users SET xp = 0, level = 1 WHERE id = ?', [userId]);
          db.release();
          try {
            invalidatePattern('leaderboard_v*');
          } catch (_) {}
          return res.status(200).json({
            success: true,
            message: 'XP reset',
            newXP: 0,
            newLevel: 1
          });
        }

        const [[ledgerRow]] = await db.execute(
          'SELECT COALESCE(SUM(amount), 0) AS s FROM xp_events WHERE user_id = ?',
          [userId]
        );
        const ledgerSum = parseFloat(ledgerRow?.s || 0);

        const newXP = Math.max(0, currentXP + xpAmount);
        const ledgerDelta = Math.round((newXP - ledgerSum) * 100) / 100;

        if (Math.abs(ledgerDelta) > 0.0001) {
          const src = xpAmount > 0 ? 'admin_grant' : 'admin_adjust';
          await db.execute(
            'INSERT INTO xp_events (user_id, amount, source, meta) VALUES (?, ?, ?, ?)',
            [userId, ledgerDelta, src, JSON.stringify({ admin: true, requestedDelta: xpAmount })]
          );
        }

        const [[cntRow]] = await db.execute(
          'SELECT COUNT(*) AS c, COALESCE(SUM(amount), 0) AS s FROM xp_events WHERE user_id = ?',
          [userId]
        );
        const finalXP =
          parseInt(cntRow.c, 10) > 0
            ? Math.max(0, parseFloat(cntRow.s || 0))
            : newXP;
        const newLevel = getLevelFromXP(finalXP);
        const leveledUp = newLevel > currentLevel;

        await db.execute('UPDATE users SET xp = ?, level = ? WHERE id = ?', [finalXP, newLevel, userId]);

        if (leveledUp) {
          try {
            const [userInfo] = await db.execute('SELECT username, name, email FROM users WHERE id = ?', [userId]);
            const u = userInfo[0];
            const un = (u?.username || u?.name || (u?.email && String(u.email).split('@')[0]) || 'User').toString();
            await postLevelUpToLevelsChannel({
              username: un,
              newLevel,
              senderIdFallback: userId
            });
          } catch (_) {}
        }

        db.release();
        try {
          invalidatePattern('leaderboard_v*');
        } catch (_) {}

        const msg = xpAmount > 0
          ? `Awarded ${xpAmount} XP (ledger synced)`
          : `Adjusted XP by ${xpAmount}`;
        return res.status(200).json({
          success: true,
          message: msg,
          newXP: finalXP,
          newLevel
        });
      } catch (dbError) {
        console.error('Database error giving XP:', dbError);
        if (db) { try { db.release(); } catch (_) {} }
        return res.status(500).json({ success: false, message: 'Failed to give XP points' });
      }
    } catch (error) {
      console.error('Error giving XP:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  return res.status(404).json({ success: false, message: 'Endpoint not found' });
};

