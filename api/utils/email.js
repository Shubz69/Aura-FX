/**
 * Shared email helpers. Contact and signup notifications go to Support@auraxfx.com.
 */
const nodemailer = require('nodemailer');

const SUPPORT_EMAIL = 'Support@auraxfx.com';

const createTransporter = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
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
    console.error('Email transporter error:', error.message);
    return null;
  }
};

/**
 * Send signup notification to support with user count (e.g. "10th signup" for prizes).
 */
const sendSignupNotification = async ({ email, name, username, userCount }) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn('Signup notification skipped – email not configured.');
    return { sent: false };
  }
  const from = process.env.CONTACT_FROM || process.env.EMAIL_USER || 'no-reply@aurafx.com';
  const nth = userCount === 1 ? '1st' : userCount === 2 ? '2nd' : userCount === 3 ? '3rd' : `${userCount}th`;
  try {
    await transporter.sendMail({
      from,
      to: SUPPORT_EMAIL,
      subject: `[AURA FX] New signup – ${nth} user (total: ${userCount})`,
      html: `
        <h2>New signup on AURA FX</h2>
        <p><strong>Total user count:</strong> ${userCount} (this is the ${nth} user)</p>
        <p><strong>Email:</strong> ${email || 'N/A'}</p>
        <p><strong>Name:</strong> ${name || 'N/A'}</p>
        <p><strong>Username:</strong> ${username || 'N/A'}</p>
        <hr />
        <p style="font-size: 12px; color: #666;">Use this count for milestone prizes (e.g. 10th, 50th, 100th user).</p>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error('Failed to send signup notification:', error.message);
    return { sent: false, reason: error.message };
  }
};

module.exports = {
  SUPPORT_EMAIL,
  createTransporter,
  sendSignupNotification
};
