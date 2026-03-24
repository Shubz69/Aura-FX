const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '../api/auth/password-reset.js');
let s = fs.readFileSync(p, 'utf8');

const startMarker = '      let db = null;';
const endMarker = '    // Handle verify code action';
const i = s.indexOf(startMarker);
const j = s.indexOf(endMarker);
if (i < 0 || j < 0) {
  console.error('markers', i, j);
  process.exit(1);
}

const before = s.slice(0, i);
const after = s.slice(j);

const middle = `      let db = null;
      try {
        db = await getDbConnection();
        if (!db) {
          console.error('Failed to establish database connection for password reset');
          return res.status(500).json({
            success: false,
            message: 'Database connection error. Please try again later.'
          });
        }

        const [userRows] = await db.execute('SELECT id, email, username FROM users WHERE email = ?', [emailLower]);

        if (!userRows || userRows.length === 0) {
          return res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset code has been sent.'
          });
        }

        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + (10 * 60 * 1000);

        await db.execute(\`
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
        \`);

        await db.execute('DELETE FROM reset_codes WHERE email = ?', [emailLower]);
        await db.execute(
          'INSERT INTO reset_codes (user_id, email, code, expires_at) VALUES (?, ?, ?, ?)',
          [userRows[0].id, emailLower, resetCode, expiresAt]
        );

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
          subject: 'AURA TERMINAL - Password Reset Code',
          html: \`
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #ffffff;">AURA TERMINAL - Password Reset</h2>
              <p>You requested to reset your password. Your reset code is:</p>
              <div style="background: #1a1a1a; color: #ffffff; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 8px; border: 1px solid #ffffff;">
                \${resetCode}
              </div>
              <p>This code will expire in 10 minutes.</p>
              <p>If you did not request this code, please ignore this email.</p>
            </div>
          \`
        };

        await transporter.sendMail(mailOptions);
        console.log(\`Password reset code sent to \${emailLower}\`);

        return res.status(200).json({
          success: true,
          message: 'If an account with that email exists, a password reset code has been sent.'
        });
      } catch (err) {
        console.error('Error in forgot-password:', err.message || err);
        return res.status(500).json({
          success: false,
          message: 'Failed to send reset email. Please try again later.',
          error: process.env.NODE_ENV === 'development' ? err.message : undefined
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

`;

fs.writeFileSync(p, before + middle + after, 'utf8');
console.log('fixed password-reset.js');
