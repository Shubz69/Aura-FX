const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');

// Function to create email transporter
const createEmailTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Missing EMAIL_USER or EMAIL_PASS environment variables');
    return null;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER.trim(),
        pass: process.env.EMAIL_PASS.trim()
      }
    });
    return transporter;
  } catch (error) {
    console.error('Failed to create email transporter:', error);
    return null;
  }
};

// Generate 6-digit MFA code
const generateMFACode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Get MySQL connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    console.error('Missing MySQL environment variables for mfa');
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
    
    // Create mfa_codes table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS mfa_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_email (email),
        INDEX idx_expires (expires_at)
      )
    `);
    
    return connection;
  } catch (error) {
    console.error('Database connection error in mfa:', error.message);
    return null;
  }
};

module.exports = async (req, res) => {
  // Handle CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { action, userId, email, code } = req.body;

    // Handle send MFA code (action === 'send' or resend flag)
    if (action === 'send' || (req.body.resend && !code)) {
      if (!userId && !email) {
        return res.status(400).json({ 
          success: false, 
          message: 'User ID or email is required' 
        });
      }

      const emailLower = (email || '').toLowerCase();

      // Generate MFA code
      const mfaCode = generateMFACode();
      const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes expiration

      // Store code in database
      const db = await getDbConnection();
      if (db) {
        try {
          // Delete any existing codes for this user
          if (userId) {
            await db.execute('DELETE FROM mfa_codes WHERE user_id = ?', [userId]);
          } else if (emailLower) {
            await db.execute('DELETE FROM mfa_codes WHERE email = ?', [emailLower]);
          }
          
          // Insert new code
          await db.execute(
            'INSERT INTO mfa_codes (user_id, email, code, expires_at) VALUES (?, ?, ?, ?)',
            [userId || null, emailLower, mfaCode, expiresAt]
          );
          await db.end();
        } catch (dbError) {
          console.error('Database error storing MFA code:', dbError);
          if (db && !db.ended) await db.end();
        }
      }

      // Send email
      const transporter = createEmailTransporter();
      if (!transporter) {
        return res.status(500).json({ 
          success: false, 
          message: 'Email service is not configured. Please contact support.' 
        });
      }

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: emailLower,
        subject: 'THE GLITCH - MFA Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B5CF6;">THE GLITCH - MFA Verification</h2>
            <p>Your MFA verification code is:</p>
            <div style="background: #1a0f2e; color: #8B5CF6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px;">
              ${mfaCode}
            </div>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this code, please ignore this email.</p>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`MFA code sent to ${emailLower}`);

      return res.status(200).json({ 
        success: true, 
        message: req.body.resend ? 'MFA code resent successfully' : 'MFA code sent successfully' 
      });
    }

    // Handle verify MFA code (action === 'verify' or code is provided)
    if (action === 'verify' || code) {
      if (!code || (!userId && !email)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Code and user ID or email are required' 
        });
      }

      const emailLower = email ? email.toLowerCase() : null;

      // Retrieve code from database
      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({ 
          success: false, 
          message: 'Database connection error. Please try again later.' 
        });
      }

      try {
        let query, params;
        if (userId) {
          query = 'SELECT * FROM mfa_codes WHERE user_id = ? AND code = ? ORDER BY created_at DESC LIMIT 1';
          params = [userId, code];
        } else {
          query = 'SELECT * FROM mfa_codes WHERE email = ? AND code = ? ORDER BY created_at DESC LIMIT 1';
          params = [emailLower, code];
        }

        const [rows] = await db.execute(query, params);

        if (!rows || rows.length === 0) {
          await db.end();
          return res.status(400).json({ 
            success: false, 
            message: 'Invalid MFA code' 
          });
        }

        const mfaRecord = rows[0];

        // Check if code has expired
        if (Date.now() > mfaRecord.expires_at) {
          await db.execute('DELETE FROM mfa_codes WHERE id = ?', [mfaRecord.id]);
          await db.end();
          return res.status(400).json({ 
            success: false, 
            message: 'MFA code has expired. Please request a new one.' 
          });
        }

        // Code is valid - get user info
        let userInfo;
        if (userId) {
          const [userRows] = await db.execute('SELECT * FROM users WHERE id = ?', [userId]);
          if (userRows && userRows.length > 0) {
            userInfo = userRows[0];
          }
        } else if (emailLower) {
          const [userRows] = await db.execute('SELECT * FROM users WHERE email = ?', [emailLower]);
          if (userRows && userRows.length > 0) {
            userInfo = userRows[0];
          }
        }

        // Delete used code
        await db.execute('DELETE FROM mfa_codes WHERE id = ?', [mfaRecord.id]);
        await db.end();

        if (!userInfo) {
          return res.status(404).json({ 
            success: false, 
            message: 'User not found' 
          });
        }

        // Generate JWT token (3-part format: header.payload.signature)
        const toBase64Url = (str) => {
          return Buffer.from(str).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
        };
        
        const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const payload = toBase64Url(JSON.stringify({
          id: userInfo.id,
          email: userInfo.email,
          username: userInfo.username,
          role: userInfo.role || 'USER',
          exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        }));
        const signature = toBase64Url('signature-' + Date.now());
        const token = `${header}.${payload}.${signature}`;

        return res.status(200).json({
          success: true,
          verified: true,
          token: token,
          id: userInfo.id,
          username: userInfo.username,
          email: userInfo.email,
          name: userInfo.name,
          avatar: userInfo.avatar || '/avatars/avatar_ai.png',
          role: userInfo.role || 'USER',
          mfaVerified: true
        });
      } catch (dbError) {
        console.error('Database error verifying MFA code:', dbError);
        if (db && !db.ended) await db.end();
        return res.status(500).json({ 
          success: false, 
          message: 'Database error. Please try again later.' 
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid action. Use action="send" or action="verify"'
    });
  } catch (error) {
    console.error('Error in mfa endpoint:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to process MFA request. Please try again later.' 
    });
  }
};

