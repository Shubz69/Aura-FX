const bcrypt = require('bcrypt'); // bcrypt is in package.json
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');
const { getDbConnection } = require('../db');
const { signToken } = require('../utils/auth');
const { getSuperAdminEmailLower } = require('../utils/entitlements');
const { sendSignupNotification } = require('../utils/email');
const {
  resolveReferrerIdFromInput,
  ensureUserReferralCode,
  maybeNotifyReferralSignupMilestones,
  upsertReferralAttribution,
} = require('../referral/referralService');

async function ensureUsersTable(conn) {
  await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        avatar VARCHAR(255),
        role VARCHAR(50) DEFAULT 'USER',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
}

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ success: false, message: 'Invalid JSON' }); }
    }
    const { username, email, password, name, phone, avatar, referralCode, ref } = body;

    // Validate required fields
    if (!username || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username, email, and password are required' 
      });
    }
    if (!phone || (phone + '').replace(/\D/g, '').length < 10) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid phone number is required' 
      });
    }

    // Validate email format
    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email address' 
      });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long' 
      });
    }

    const emailLower = email.toLowerCase();
    const usernameLower = username.toLowerCase();

    let db = null;
    try {
      db = await getDbConnection();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error. Please try again later.'
        });
      }

      await ensureUsersTable(db);

      // Check if email or username already exists
      const [emailCheck] = await db.execute('SELECT id FROM users WHERE email = ?', [emailLower]);
      if (emailCheck && emailCheck.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists. Please sign in instead.'
        });
      }

      const [usernameCheck] = await db.execute('SELECT id FROM users WHERE username = ?', [usernameLower]);
      if (usernameCheck && usernameCheck.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Username already taken. Please choose a different username.'
        });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const phoneClean = (phone || '').toString().trim();
      // Insert new user (phone column may not exist on older schemas - try with phone first)
      let result;
      try {
        [result] = await db.execute(
          'INSERT INTO users (username, email, password, name, phone, avatar, role, muted, mfa_verified, dtype) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [usernameLower, emailLower, hashedPassword, name || username, phoneClean, avatar ?? null, 'USER', 0, 0, 'UserModel']
        );
      } catch (colErr) {
        if (colErr.code === 'ER_BAD_FIELD_ERROR' && colErr.message && colErr.message.includes('phone')) {
          await db.execute('ALTER TABLE users ADD COLUMN phone VARCHAR(50) DEFAULT NULL');
          [result] = await db.execute(
            'INSERT INTO users (username, email, password, name, phone, avatar, role, muted, mfa_verified, dtype) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [usernameLower, emailLower, hashedPassword, name || username, phoneClean, avatar ?? null, 'USER', 0, 0, 'UserModel']
          );
        } else {
          throw colErr;
        }
      }

      const userId = result.insertId;

      const refRaw = (referralCode || ref || '').toString().trim();
      let referredBy = null;
      try {
        referredBy = await resolveReferrerIdFromInput(refRaw, userId);
      } catch (refErr) {
        console.warn('Referral resolve skipped:', refErr.message);
      }
      if (referredBy) {
        try {
          await db.execute('UPDATE users SET referred_by = ? WHERE id = ?', [referredBy, userId]);
        } catch (colErr) {
          if (colErr.code === 'ER_BAD_FIELD_ERROR') {
            await db.execute('ALTER TABLE users ADD COLUMN referred_by INT NULL DEFAULT NULL');
            await db.execute('UPDATE users SET referred_by = ? WHERE id = ?', [referredBy, userId]);
          }
        }
        try {
          await upsertReferralAttribution({
            referrerUserId: referredBy,
            referredUserId: userId,
            referralCodeUsed: (refRaw || '').toString().trim(),
            source: 'register',
          });
        } catch (attrErr) {
          console.warn('Referral attribution insert:', attrErr.message);
        }
        Promise.resolve(maybeNotifyReferralSignupMilestones(referredBy)).catch((e) =>
          console.warn('Referral milestone notify:', e.message),
        );
      }

      try {
        await ensureUserReferralCode(userId);
      } catch (codeErr) {
        console.warn('Referral code init:', codeErr.message);
      }

      // Notify support with signup count (for milestones e.g. 10th user prize)
      try {
        const [countRows] = await db.execute('SELECT COUNT(*) AS cnt FROM users');
        const userCount = countRows && countRows[0] && countRows[0].cnt != null ? Number(countRows[0].cnt) : userId;
        sendSignupNotification({
          email: emailLower,
          name: name || username,
          username: usernameLower,
          userCount
        }).catch((err) => console.error('Signup notification email:', err.message));
      } catch (countErr) {
        console.warn('Could not get user count for signup email:', countErr.message);
      }

      // Create admin thread and send welcome message for new user
      const WELCOME_MESSAGE = `Welcome to AURA TERMINAL! This is a place where you can complain, ask questions, or get help. A personal admin will be there to assist you whenever you need it.`;
      try {
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
        const [existingThread] = await db.execute(
          'SELECT id FROM threads WHERE userId = ? AND adminId IS NULL LIMIT 1',
          [userId]
        );
        let threadId;
        if (existingThread.length > 0) {
          threadId = existingThread[0].id;
        } else {
          const [insertThread] = await db.execute(
            'INSERT INTO threads (userId, adminId) VALUES (?, NULL)',
            [userId]
          );
          threadId = insertThread.insertId;
        }
        const superEl = getSuperAdminEmailLower();
        let adminRows;
        if (superEl) {
          [adminRows] = await db.execute(
            "SELECT id FROM users WHERE LOWER(role) IN ('admin', 'super_admin') OR LOWER(email) = ? ORDER BY id ASC LIMIT 1",
            [superEl]
          );
        } else {
          [adminRows] = await db.execute(
            "SELECT id FROM users WHERE LOWER(role) IN ('admin', 'super_admin') ORDER BY id ASC LIMIT 1"
          );
        }
        const adminId = adminRows && adminRows[0] ? adminRows[0].id : null;
        if (adminId) {
          await db.execute(
            'INSERT INTO thread_messages (threadId, senderId, recipientId, body) VALUES (?, ?, ?, ?)',
            [threadId, adminId, String(userId), WELCOME_MESSAGE]
          );
          await db.execute('UPDATE threads SET lastMessageAt = NOW() WHERE id = ?', [threadId]);
        }
      } catch (welcomeErr) {
        console.warn('Could not send welcome message to new user:', welcomeErr.message);
      }

      let token;
      try {
        token = signToken(
          {
            id: userId,
            email: emailLower,
            username: usernameLower,
            role: 'USER',
          },
          '24h'
        );
      } catch (signErr) {
        console.error('Registration JWT sign failed:', signErr.message);
        return res.status(503).json({
          success: false,
          message: 'Authentication service is not configured. Please try again later.',
        });
      }

      return res.status(200).json({
        success: true,
        id: userId,
        username: usernameLower,
        email: emailLower,
        name: name || username,
        phone: phoneClean,
        avatar: avatar ?? null,
        role: 'USER',
        token: token,
        status: 'SUCCESS'
      });
    } catch (dbError) {
      console.error('Database error during registration:', dbError);

      if (dbError.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          success: false,
          message: 'Email or username already exists. Please sign in instead.'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Database error. Please try again later.'
      });
    } finally {
      if (db) {
        try {
          db.release();
        } catch (e) {
          console.warn('Error releasing DB connection:', e.message);
        }
      }
    }
  } catch (error) {
    console.error('Error during registration:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Registration failed. Please try again later.' 
    });
  }
};

