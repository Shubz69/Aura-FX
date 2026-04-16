// Vercel serverless function for signup email verification (consolidated send + verify)
// Suppress url.parse() deprecation warnings from dependencies
require('../utils/suppress-warnings');
const { getDbConnection } = require('../db');
const { checkPhoneAlreadyRegistered } = require('../utils/signupEligibility');
const { sendTransactionalHtml, isMailConfiguredForAuth } = require('../utils/authMail');

// Generate 6-digit code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

async function ensureSignupVerificationTable(conn) {
  await conn.execute(`
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
}

async function loadSendSignupState(conn, emailLower, usernameLower) {
  const [emailRows] = await conn.execute(
    'SELECT id FROM users WHERE LOWER(TRIM(COALESCE(email, \'\'))) = ? LIMIT 1',
    [emailLower]
  );
  if (emailRows.length > 0) return { blocked: 'email_exists' };
  if (usernameLower) {
    const [uRows] = await conn.execute(
      'SELECT id FROM users WHERE LOWER(TRIM(COALESCE(username, \'\'))) = ? LIMIT 1',
      [usernameLower]
    );
    if (uRows.length > 0) return { blocked: 'username_taken' };
  }
  return { ok: true };
}

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

      const emailLower = String(email).trim().toLowerCase();
      const usernameLower = body.username ? String(body.username).trim().toLowerCase() : null;
      const rawPhone = body.phone != null && String(body.phone).trim() ? String(body.phone).trim() : '';
      if (!rawPhone || rawPhone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Valid phone number is required so we can check it is not already registered.',
        });
      }

      const verificationCode = generateVerificationCode();
      const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes expiration

      let dbStore = null;
      try {
        dbStore = await getDbConnection();
        if (!dbStore) {
          return res.status(503).json({
            success: false,
            message: 'Database temporarily unavailable. Please try again in a moment.'
          });
        }

        let state;
        try {
          state = await loadSendSignupState(dbStore, emailLower, usernameLower);
        } catch (checkErr) {
          console.error('Signup send eligibility check failed:', checkErr.message);
          return res.status(503).json({
            success: false,
            message: 'Could not verify signup eligibility. Please try again.'
          });
        }

        if (state.blocked === 'email_exists') {
          return res.status(409).json({
            success: false,
            message: 'This email is already in use. Please use a different email or sign in.',
            field: 'email',
          });
        }
        if (state.blocked === 'username_taken') {
          return res.status(409).json({
            success: false,
            message: 'This username is already taken. Please choose a different username.',
            field: 'username',
          });
        }

        if (rawPhone) {
          const phoneTaken = await checkPhoneAlreadyRegistered(dbStore, rawPhone);
          if (phoneTaken) {
            return res.status(409).json({
              success: false,
              message: 'This phone number is already in use. Please use a different number or sign in.',
              field: 'phone',
            });
          }
        }

        await ensureSignupVerificationTable(dbStore);
        await dbStore.execute('DELETE FROM signup_verification_codes WHERE email = ?', [emailLower]);
        await dbStore.execute(
          'INSERT INTO signup_verification_codes (email, code, expires_at) VALUES (?, ?, ?)',
          [emailLower, verificationCode.toString(), expiresAt]
        );
        console.log(`Stored verification code for ${emailLower}`);
      } catch (dbError) {
        console.error('Database error storing verification code:', dbError);
        console.error('Error details:', {
          message: dbError.message,
          code: dbError.code,
          stack: dbError.stack
        });
        return res.status(500).json({
          success: false,
          message: 'Could not store verification code. Please try again.'
        });
      } finally {
        if (dbStore) {
          try {
            dbStore.release();
          } catch (_) {}
        }
      }

      if (!isMailConfiguredForAuth()) {
        console.error(
          'authMail: transactional email not configured (set RESEND_API_KEY, SENDGRID_API_KEY, or EMAIL_USER+EMAIL_PASS)',
        );
        try {
          const dbDel = await getDbConnection();
          if (dbDel) {
            try {
              await dbDel.execute('DELETE FROM signup_verification_codes WHERE email = ?', [emailLower]);
            } finally {
              try {
                dbDel.release();
              } catch (_) {}
            }
          }
        } catch (delErr) {
          console.warn('Could not roll back verification row (mail not configured):', delErr.message);
        }
        return res.status(503).json({
          success: false,
          message:
            'Email delivery is not configured on the server. Please try again later or contact support.',
        });
      }

      const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0a0a1a; color: #ffffff;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #ffffff; font-size: 32px; margin: 0;">Aura Terminal</h1>
            </div>
            <div style="background-color: #1a1a1a; padding: 30px; border-radius: 10px; border: 1px solid #ffffff;">
              <h2 style="color: #ffffff; margin-top: 0;">Email Verification Required</h2>
              <p style="font-size: 16px; line-height: 1.6;">
                Thank you for signing up for Aura Terminal. To complete your registration and verify your email address, please use the following verification code:
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
                Welcome to Aura Terminal — where wealth meets opportunity! 💰🚀
              </p>
            </div>
          </div>
        `;

      const sendResult = await sendTransactionalHtml({
        to: emailLower,
        subject: 'Aura Terminal — Email verification code',
        html,
      });

      if (!sendResult.ok) {
        console.error('Signup verification email failed:', sendResult.errorCode, sendResult.message);
        try {
          const dbDel = await getDbConnection();
          if (dbDel) {
            try {
              await dbDel.execute('DELETE FROM signup_verification_codes WHERE email = ?', [emailLower]);
            } finally {
              try {
                dbDel.release();
              } catch (_) {}
            }
          }
        } catch (delErr) {
          console.warn('Could not roll back verification row after send failure:', delErr.message);
        }

        const code = String(sendResult.errorCode || '');
        const userMsg =
          code === 'EAUTH' ||
          code.startsWith('RESEND_') ||
          code.startsWith('SENDGRID_') ||
          code === 'SMTP_NOT_CONFIGURED'
            ? 'We could not send the email right now. Please try again in a few minutes.'
            : 'We could not send the verification email. Please try again shortly.';
        return res.status(503).json({ success: false, message: userMsg });
      }

      console.log(`Signup verification code sent to ${emailLower}`);
      return res.status(200).json({
        success: true,
        message: 'Verification code sent successfully',
      });
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

      let dbVerify = null;
      try {
        dbVerify = await getDbConnection();
        if (!dbVerify) {
          console.error('Database connection failed during verification');
          return res.status(500).json({
            success: false,
            message: 'Database connection error. Please try again later.'
          });
        }
        await ensureSignupVerificationTable(dbVerify);

        const [allCodes] = await dbVerify.execute(
          'SELECT * FROM signup_verification_codes WHERE email = ? ORDER BY created_at DESC',
          [emailLower]
        );
        console.log(`Found ${allCodes.length} verification code(s) for ${emailLower}`);

        const [rows] = await dbVerify.execute(
          'SELECT * FROM signup_verification_codes WHERE email = ? AND code = ? ORDER BY created_at DESC LIMIT 1',
          [emailLower, codeTrimmed]
        );

        console.log(`Code verification query result: ${rows.length} matching code(s)`);

        if (!rows || rows.length === 0) {
          console.error(`Invalid code: ${codeTrimmed} for email: ${emailLower}`);
          return res.status(400).json({
            success: false,
            message: 'Invalid verification code. Please check the code and try again.'
          });
        }

        const verificationRecord = rows[0];
        const currentTime = Date.now();
        const expRaw = verificationRecord.expires_at;
        const expiresAt =
          typeof expRaw === 'bigint' ? Number(expRaw) : parseInt(String(expRaw), 10);

        console.log(`Code expires at: ${expiresAt}, current time: ${currentTime}`);

        if (!Number.isFinite(expiresAt) || currentTime > expiresAt) {
          await dbVerify.execute('DELETE FROM signup_verification_codes WHERE email = ?', [emailLower]);
          console.error(`Code expired for ${emailLower}`);
          return res.status(400).json({
            success: false,
            message: 'Verification code has expired. Please request a new one.'
          });
        }

        // Do NOT delete the row here. If /api/auth/register fails afterward, the user would retry with
        // the same correct email code and get "invalid" because the code was already consumed.
        // register.js deletes signup_verification_codes after a successful user insert.

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
        return res.status(500).json({
          success: false,
          message: 'Database error. Please try again later.'
        });
      } finally {
        if (dbVerify) {
          try {
            dbVerify.release();
          } catch (_) {}
        }
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

