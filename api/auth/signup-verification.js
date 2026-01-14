// Vercel serverless function for signup email verification (consolidated send + verify)
const nodemailer = require('nodemailer');
const mysql = require('mysql2/promise');
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');

// Function to create transporter
const createEmailTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Missing EMAIL_USER or EMAIL_PASS environment variables');
    return null;
  }

  try {
    const emailUser = process.env.EMAIL_USER.trim();
    const emailPass = process.env.EMAIL_PASS.trim();
    
    // Log credential info (without exposing password)
    console.log('Creating email transporter:', {
      emailUser: emailUser,
      emailPassLength: emailPass.length,
      emailPassHasSpaces: emailPass.includes(' ')
    });
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPass
      }
    });
    
    // Verify connection (but don't block - do it async)
    transporter.verify((error, success) => {
      if (error) {
        console.error('Email transporter verification failed:', error);
        console.error('Error code:', error.code);
        console.error('Error response:', error.response);
      } else {
        console.log('Email transporter verified successfully');
      }
    });
    
    return transporter;
  } catch (error) {
    console.error('Failed to create email transporter:', error);
    return null;
  }
};

// Generate 6-digit code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Get MySQL connection
const getDbConnection = async () => {
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_PASSWORD || !process.env.MYSQL_DATABASE) {
    return null;
  }

  try {
    const connectionConfig = {
      host: process.env.MYSQL_HOST,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306
    };

    if (process.env.MYSQL_SSL === 'true') {
      connectionConfig.ssl = { rejectUnauthorized: false };
    } else {
      connectionConfig.ssl = false;
    }

    const connection = await mysql.createConnection(connectionConfig);
    
    // Create signup_verification_codes table if it doesn't exist
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS signup_verification_codes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(10) NOT NULL,
        expires_at BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_expires (expires_at)
      )
    `);
    
    return connection;
  } catch (error) {
    console.error('Database connection error:', error.message);
    return null;
  }
};

// Check if email already exists in users table
const checkEmailExists = async (email) => {
  const db = await getDbConnection();
  if (!db) {
    return null;
  }

  try {
    const [users] = await db.execute(
      'SELECT id, email FROM users WHERE email = ? LIMIT 1',
      [email.toLowerCase()]
    );
    await db.end();
    return users.length > 0;
  } catch (error) {
    console.error('Error checking if email exists:', error.message);
    await db.end();
    return null;
  }
};

module.exports = async (req, res) => {
  // Set content type to JSON first to ensure we always return JSON
  res.setHeader('Content-Type', 'application/json');
  
  // Handle CORS - allow both www and non-www origins
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
    // Parse request body if needed (Vercel sometimes passes it as a string)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseError) {
        return res.status(400).json({ success: false, message: 'Invalid JSON in request body' });
      }
    }
    
    const { action, email, code } = body;

    // ACTION: SEND VERIFICATION CODE
    if (action === 'send' || !action) {
      if (!email || !email.includes('@')) {
        return res.status(400).json({ 
          success: false, 
          message: 'Valid email address is required' 
        });
      }

      const emailLower = email.toLowerCase();
      const usernameLower = body.username ? body.username.toLowerCase() : null;

      // Check if email already exists in the system
      const emailExists = await checkEmailExists(emailLower);
      if (emailExists === true) {
        return res.status(409).json({ 
          success: false, 
          message: 'An account with this email already exists. Please sign in instead.' 
        });
      }

      // Check if username already exists (if provided)
      if (usernameLower) {
        const db = await getDbConnection();
        if (db) {
          try {
            const [users] = await db.execute(
              'SELECT id FROM users WHERE username = ? LIMIT 1',
              [usernameLower]
            );
            await db.end();
            if (users.length > 0) {
              return res.status(409).json({ 
                success: false, 
                message: 'This username is already taken. Please choose a different username.' 
              });
            }
          } catch (error) {
            console.error('Error checking username:', error);
            await db.end();
          }
        }
      }

      // Generate verification code
      const verificationCode = generateVerificationCode();
      const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes expiration

      console.log(`Generated verification code for ${emailLower}: ${verificationCode}, expires at: ${expiresAt}`);

      // Store code in database
      const db = await getDbConnection();
      if (db) {
        try {
          // Delete any existing codes for this email
          await db.execute('DELETE FROM signup_verification_codes WHERE email = ?', [emailLower]);
          console.log(`Deleted old codes for ${emailLower}`);
          
          // Insert new code (ensure code is stored as string)
          await db.execute(
            'INSERT INTO signup_verification_codes (email, code, expires_at) VALUES (?, ?, ?)',
            [emailLower, verificationCode.toString(), expiresAt]
          );
          console.log(`Stored verification code for ${emailLower}`);
          await db.end();
        } catch (dbError) {
          console.error('Database error storing verification code:', dbError);
          console.error('Error details:', {
            message: dbError.message,
            code: dbError.code,
            stack: dbError.stack
          });
          await db.end();
        }
      }

      // Send email
      const transporter = createEmailTransporter();
      if (!transporter) {
        console.error('Email service not configured - missing EMAIL_USER or EMAIL_PASS environment variables');
        console.error('EMAIL_USER exists:', !!process.env.EMAIL_USER);
        console.error('EMAIL_PASS exists:', !!process.env.EMAIL_PASS);
        return res.status(500).json({ 
          success: false, 
          message: 'Email service is temporarily unavailable. Please contact support or check back later.' 
        });
      }

      // Check if email credentials are actually set
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.error('Email credentials check failed:', {
          hasEmailUser: !!process.env.EMAIL_USER,
          hasEmailPass: !!process.env.EMAIL_PASS,
          emailUserLength: process.env.EMAIL_USER ? process.env.EMAIL_USER.length : 0,
          emailPassLength: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0
        });
        return res.status(500).json({ 
          success: false, 
          message: 'Email service configuration error. Please contact support.' 
        });
      }

      const mailOptions = {
        from: `"AURA FX" <${process.env.EMAIL_USER.trim()}>`,
        to: emailLower,
        subject: 'AURA FX - Email Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a1a; color: #ffffff;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #ffffff; font-size: 32px; margin: 0;">AURA FX</h1>
            </div>
            <div style="background-color: #1a1a1a; padding: 30px; border-radius: 10px; border: 1px solid #ffffff;">
              <h2 style="color: #ffffff; margin-top: 0;">Email Verification Required</h2>
              <p style="font-size: 16px; line-height: 1.6;">
                Thank you for signing up for AURA FX! To complete your registration and verify your email address, please use the following verification code:
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <div style="display: inline-block; background-color: #2a2a2a; padding: 20px 40px; border-radius: 8px; border: 2px solid #ffffff;">
                  <span style="font-size: 36px; font-weight: bold; color: #ffffff; letter-spacing: 5px;">${verificationCode}</span>
                </div>
              </div>
              <p style="font-size: 14px; color: #cccccc; margin-top: 30px;">
                This code will expire in 10 minutes. If you didn't request this verification code, please ignore this email.
              </p>
              <p style="font-size: 14px; color: #cccccc; margin-top: 20px;">
                Welcome to AURA FX - where wealth meets opportunity! 💰🚀
              </p>
            </div>
          </div>
        `
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`Signup verification code sent to ${emailLower}`);
        
        return res.status(200).json({ 
          success: true, 
          message: 'Verification code sent successfully' 
        });
      } catch (emailError) {
        console.error('Failed to send email:', emailError);
        console.error('Email error details:', {
          message: emailError.message,
          code: emailError.code,
          response: emailError.response,
          command: emailError.command,
          responseCode: emailError.responseCode
        });
        
        // Return a more helpful error message
        let errorMessage = 'Failed to send verification email. Please try again later.';
        if (emailError.code === 'EAUTH') {
          errorMessage = 'Email authentication failed. Please check email credentials.';
        } else if (emailError.code === 'ECONNECTION') {
          errorMessage = 'Email service connection failed. Please try again later.';
        }
        
        return res.status(500).json({ 
          success: false, 
          message: errorMessage 
        });
      }
    }

    // ACTION: VERIFY CODE
    if (action === 'verify') {
      if (!email || !code) {
        console.error('Verify action missing required fields:', { email: !!email, code: !!code });
        return res.status(400).json({ 
          success: false, 
          message: 'Email and verification code are required' 
        });
      }

      const emailLower = email.toLowerCase().trim();
      const codeTrimmed = code.toString().trim();

      console.log(`Verifying code for email: ${emailLower}, code: ${codeTrimmed}`);

      // Retrieve code from database
      const db = await getDbConnection();
      if (!db) {
        console.error('Database connection failed during verification');
        return res.status(500).json({ 
          success: false, 
          message: 'Database connection error. Please try again later.' 
        });
      }

      try {
        // First, check all codes for this email to debug
        const [allCodes] = await db.execute(
          'SELECT * FROM signup_verification_codes WHERE email = ? ORDER BY created_at DESC',
          [emailLower]
        );
        console.log(`Found ${allCodes.length} verification code(s) for ${emailLower}`);

        // Now check for exact match
        const [rows] = await db.execute(
          'SELECT * FROM signup_verification_codes WHERE email = ? AND code = ? ORDER BY created_at DESC LIMIT 1',
          [emailLower, codeTrimmed]
        );

        console.log(`Code verification query result: ${rows.length} matching code(s)`);

        if (!rows || rows.length === 0) {
          await db.end();
          console.error(`Invalid code: ${codeTrimmed} for email: ${emailLower}`);
          return res.status(400).json({ 
            success: false, 
            message: 'Invalid verification code. Please check the code and try again.' 
          });
        }

        const verificationRecord = rows[0];
        const currentTime = Date.now();
        const expiresAt = parseInt(verificationRecord.expires_at);

        console.log(`Code expires at: ${expiresAt}, current time: ${currentTime}`);

        // Check if code has expired
        if (currentTime > expiresAt) {
          // Delete expired code
          await db.execute('DELETE FROM signup_verification_codes WHERE email = ?', [emailLower]);
          await db.end();
          console.error(`Code expired for ${emailLower}`);
          return res.status(400).json({ 
            success: false, 
            message: 'Verification code has expired. Please request a new one.' 
          });
        }

        // Code is valid - delete it so it can't be reused
        await db.execute('DELETE FROM signup_verification_codes WHERE email = ? AND code = ?', [emailLower, codeTrimmed]);
        await db.end();

        console.log(`Code verified successfully for ${emailLower}`);

        return res.status(200).json({ 
          success: true, 
          verified: true,
          message: 'Email verified successfully' 
        });
      } catch (dbError) {
        console.error('Database error verifying code:', dbError);
        console.error('Error details:', {
          message: dbError.message,
          code: dbError.code,
          stack: dbError.stack
        });
        if (db) await db.end();
        return res.status(500).json({ 
          success: false, 
          message: 'Database error. Please try again later.' 
        });
      }
    }

    return res.status(400).json({ 
      success: false, 
      message: 'Invalid action. Use "send" or "verify".' 
    });
  } catch (error) {
    console.error('Error in signup verification:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      name: error.name,
      code: error.code
    });
    return res.status(500).json({ 
      success: false, 
      message: 'An error occurred. Please try again later.' 
    });
  }
};

