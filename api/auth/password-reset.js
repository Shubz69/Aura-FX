// Combined password reset endpoint - handles forgot-password, verify code, and reset password
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
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

// Get MySQL connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    console.error('Missing MySQL environment variables for password-reset');
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
    
    // Test the connection
    await connection.ping();
    
    console.log('Database connection successful for password-reset');
    return connection;
  } catch (error) {
    console.error('Database connection error in password-reset:', error.message);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      syscall: error.syscall,
      address: error.address,
      port: error.port
    });
    return null;
  }
};

module.exports = async (req, res) => {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { action, email, code, token, newPassword } = req.body;

    // Handle forgot-password (send reset code) - action='forgot' or no action/code provided
    if (action === 'forgot' || (!action && !code && !token && email && !newPassword)) {
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      const emailLower = email.toLowerCase();

      // Check if user exists
      let db = null;
      try {
        db = await getDbConnection();
        if (!db) {
          console.error('Failed to establish database connection for password reset');
          return res.status(500).json({
            success: false,
            message: 'Database connection error. Please try again later.'
          });
        }
      } catch (connError) {
        console.error('Database connection error in password-reset:', connError);
        return res.status(500).json({
          success: false,
          message: 'Database connection error. Please try again later.'
        });
      }

      try {
        const [userRows] = await db.execute('SELECT id, email, username FROM users WHERE email = ?', [emailLower]);
        
        if (!userRows || userRows.length === 0) {
          if (db && !db.ended) {
            try {
              await db.end();
            } catch (e) {
              console.warn('Error closing DB connection:', e.message);
            }
          }
          // Don't reveal if email exists or not for security
          return res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset code has been sent.'
          });
        }

        // Generate 6-digit reset code
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes

        // Create reset_codes table if it doesn't exist
        await db.execute(`
          CREATE TABLE IF NOT EXISTS reset_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            email VARCHAR(255) NOT NULL,
            code VARCHAR(10) NOT NULL,
            expires_at BIGINT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            used BOOLEAN DEFAULT FALSE,
            INDEX idx_user_id (user_id),
            INDEX idx_email (email),
            INDEX idx_code (code),
            INDEX idx_expires (expires_at)
          )
        `);

        // Delete any existing codes for this user
        await db.execute('DELETE FROM reset_codes WHERE email = ?', [emailLower]);
        
        // Insert new code
        await db.execute(
          'INSERT INTO reset_codes (user_id, email, code, expires_at) VALUES (?, ?, ?, ?)',
          [userRows[0].id, emailLower, resetCode, expiresAt]
        );
        
        // Close DB connection before sending email
        if (db && !db.ended) {
          try {
            await db.end();
          } catch (e) {
            console.warn('Error closing DB connection:', e.message);
          }
        }

        // Send email with reset code
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
          subject: 'THE GLITCH - Password Reset Code',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #8B5CF6;">THE GLITCH - Password Reset</h2>
              <p>You requested to reset your password. Your reset code is:</p>
              <div style="background: #1a0f2e; color: #8B5CF6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px;">
                ${resetCode}
              </div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
          `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Password reset code sent to ${emailLower}`);

        return res.status(200).json({
          success: true,
          message: 'If an account with that email exists, a password reset code has been sent.'
        });
      } catch (dbError) {
        console.error('Database error in forgot-password:', dbError.message);
        if (db && !db.ended) {
          try {
            await db.end();
          } catch (e) {
            console.warn('Error closing DB connection after error:', e.message);
          }
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to send reset email. Please try again later.',
          error: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }
    }

    // Handle verify code action
    if (action === 'verify' || (code && !token)) {
      if (!email || !code) {
        return res.status(400).json({
          success: false,
          message: 'Email and code are required'
        });
      }

      const emailLower = email.toLowerCase();
      const db = await getDbConnection();
      
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database not configured. Please contact support.'
        });
      }

      try {
        const [rows] = await db.execute(
          'SELECT * FROM reset_codes WHERE email = ? AND code = ? ORDER BY created_at DESC LIMIT 1',
          [emailLower, code]
        );

        if (rows.length === 0) {
          await db.end();
          return res.status(400).json({
            success: false,
            message: 'Invalid code'
          });
        }

        const stored = rows[0];

        if (Date.now() > stored.expires_at) {
          await db.execute('DELETE FROM reset_codes WHERE email = ?', [emailLower]);
          await db.end();
          return res.status(400).json({
            success: false,
            message: 'Code has expired'
          });
        }

        await db.execute('DELETE FROM reset_codes WHERE email = ?', [emailLower]);
        await db.end();

        const resetToken = Buffer.from(JSON.stringify({
          email: email,
          code: code,
          expiresAt: Date.now() + (15 * 60 * 1000)
        })).toString('base64');

        return res.status(200).json({
          success: true,
          token: resetToken,
          message: 'Code verified successfully'
        });
      } catch (dbError) {
        console.error('Database error verifying code:', dbError.message);
        console.error('Database error details:', {
          message: dbError.message,
          code: dbError.code,
          errno: dbError.errno
        });
        if (db && !db.ended) {
          await db.end();
        }
        return res.status(500).json({
          success: false,
          message: `Failed to verify code: ${dbError.message || 'Database error'}`
        });
      }
    }

    // Handle reset password action
    if (action === 'reset' || (token && newPassword)) {
      if (!token || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token and new password are required'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters'
        });
      }

      let tokenData;
      try {
        tokenData = JSON.parse(Buffer.from(token, 'base64').toString());
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: 'Invalid token'
        });
      }

      if (Date.now() > tokenData.expiresAt) {
        return res.status(400).json({
          success: false,
          message: 'Token has expired'
        });
      }

      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      const db = await getDbConnection();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database not configured. Please contact support.'
        });
      }

      try {
        const [result] = await db.execute(
          'UPDATE users SET password = ? WHERE email = ?',
          [hashedPassword, tokenData.email.toLowerCase()]
        );

        await db.end();

        if (result.affectedRows > 0) {
          console.log(`Password reset for ${tokenData.email} - updated in MySQL database`);
          return res.status(200).json({
            success: true,
            message: 'Password reset successfully'
          });
        } else {
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }
      } catch (dbError) {
        console.error('MySQL update error:', dbError.message);
        console.error('Database error details:', {
          message: dbError.message,
          code: dbError.code,
          errno: dbError.errno
        });
        if (db && !db.ended) {
          await db.end();
        }
        return res.status(500).json({
          success: false,
          message: `Failed to reset password: ${dbError.message || 'Database error'}`
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid action. Use action="verify" or action="reset"'
    });
  } catch (error) {
    console.error('Error in password-reset endpoint:', error);
    console.error('Error stack:', error.stack);
    
    // Provide more specific error message
    let errorMessage = 'Failed to process request';
    if (error.message) {
      errorMessage = error.message;
    }
    
    return res.status(500).json({
      success: false,
      message: errorMessage
    });
  }
};

