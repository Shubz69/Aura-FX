/**
 * Shared email helpers. Internal notifications use CONTACT_INBOX (same default as contact form / server).
 */
const nodemailer = require('nodemailer');

const SUPPORT_EMAIL = process.env.CONTACT_INBOX || 'support@auraterminal.ai';

const createTransporter = () => {
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  if (!user || !pass) {
    return null;
  }
  try {
    const host = process.env.EMAIL_HOST?.trim() || 'smtp.gmail.com';
    const port = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587;
    const secure = process.env.EMAIL_SECURE === 'true';
    return nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure && port === 587,
      auth: { user, pass },
      tls: { minVersion: 'TLSv1.2' },
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
  const from = process.env.CONTACT_FROM || process.env.EMAIL_USER || 'no-reply@auraterminal.ai';
  const nth = userCount === 1 ? '1st' : userCount === 2 ? '2nd' : userCount === 3 ? '3rd' : `${userCount}th`;
  try {
    await transporter.sendMail({
      from,
      to: SUPPORT_EMAIL,
      subject: `[AURA TERMINAL] New signup – ${nth} user (total: ${userCount})`,
      html: `
        <h2>New signup on AURA TERMINAL</h2>
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

/**
 * Send weekly signup report to support with list of all signups from past week and their subscriptions.
 */
const sendWeeklySignupReport = async ({ signups }) => {
  const transporter = createTransporter();
  if (!transporter) {
    console.warn('Weekly signup report skipped – email not configured.');
    return { sent: false };
  }
  const from = process.env.CONTACT_FROM || process.env.EMAIL_USER || 'no-reply@auraterminal.ai';
  
  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPlanName = (plan) => {
    if (!plan) return 'None';
    const p = (plan || '').toString().toLowerCase();
    if (p === 'free') return 'Free';
    if (p === 'aura' || p === 'premium') return 'Aura Terminal (Premium)';
    if (p === 'a7fx' || p === 'elite') return 'A7FX (Elite)';
    return plan;
  };

  const signupsHtml = signups.length > 0 
    ? signups.map((user, idx) => `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 8px;">${idx + 1}</td>
          <td style="padding: 8px;">${user.name || 'N/A'}</td>
          <td style="padding: 8px;">${user.username || 'N/A'}</td>
          <td style="padding: 8px;">${user.email || 'N/A'}</td>
          <td style="padding: 8px;">${getPlanName(user.subscription_plan)}</td>
          <td style="padding: 8px;">${formatDate(user.created_at)}</td>
        </tr>
      `).join('')
    : '<tr><td colspan="6" style="padding: 8px; text-align: center;">No signups this week</td></tr>';

  try {
    await transporter.sendMail({
      from,
      to: SUPPORT_EMAIL,
      subject: `[AURA TERMINAL] Weekly Signup Report – ${signups.length} new signup${signups.length !== 1 ? 's' : ''} this week`,
      html: `
        <h2>Weekly Signup Report</h2>
        <p><strong>Week ending:</strong> ${formatDate(new Date())}</p>
        <p><strong>Total new signups:</strong> ${signups.length}</p>
        <hr />
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #f0f0f0; font-weight: bold;">
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #333;">#</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #333;">Name</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #333;">Username</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #333;">Email</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #333;">Subscription</th>
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #333;">Signed Up</th>
            </tr>
          </thead>
          <tbody>
            ${signupsHtml}
          </tbody>
        </table>
        <hr />
        <p style="font-size: 12px; color: #666; margin-top: 20px;">
          This is an automated weekly report sent every Sunday at midnight UTC.
        </p>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error('Failed to send weekly signup report:', error.message);
    return { sent: false, reason: error.message };
  }
};

/**
 * Referral tier milestone (sign-up count) — sent to the referrer.
 */
const sendReferralMilestoneEmail = async ({
  to,
  name,
  signupCount,
  tierLabel,
  tierReward,
}) => {
  const transporter = createTransporter();
  if (!transporter || !to) {
    console.warn('Referral milestone email skipped – email not configured or missing address.');
    return { sent: false };
  }
  const from = process.env.CONTACT_FROM || process.env.EMAIL_USER || 'no-reply@auraterminal.ai';
  const greet = name ? name.split(' ')[0] : 'there';
  try {
    await transporter.sendMail({
      from,
      to,
      subject: `[AURA TERMINAL] Referral milestone unlocked — ${tierLabel} (${signupCount} sign-ups)`,
      html: `
        <p>Hi ${greet},</p>
        <p><strong>Congratulations!</strong> You have reached <strong>${signupCount} referred sign-ups</strong> on AURA TERMINAL.</p>
        <p><strong>Tier:</strong> ${tierLabel}<br/>
        <strong>Reward:</strong> ${tierReward}</p>
        <p>Eligible perks are typically applied within 48 hours. If anything looks off, reply with your referral code.</p>
        <p style="font-size:12px;color:#666;">Keep sharing — your Affiliation page shows live progress.</p>
      `,
    });
    return { sent: true };
  } catch (error) {
    console.error('Referral milestone email failed:', error.message);
    return { sent: false, reason: error.message };
  }
};

/**
 * First-time subscription or course conversion from a referred user.
 */
const sendReferralConversionEmail = async ({ to, name, eventType }) => {
  const transporter = createTransporter();
  if (!transporter || !to) {
    return { sent: false };
  }
  const from = process.env.CONTACT_FROM || process.env.EMAIL_USER || 'no-reply@auraterminal.ai';
  const greet = name ? name.split(' ')[0] : 'there';
  const isSub = eventType === 'subscription';
  const title = isSub
    ? 'Someone you referred activated a subscription'
    : 'Someone you referred completed a course purchase';
  const body = isSub
    ? 'A trader you referred has subscribed. Thank you for growing the community — your Affiliation dashboard will reflect this under Subscriptions.'
    : 'A trader you referred has completed a course payment. Your Affiliation dashboard will reflect this under Courses.';
  try {
    await transporter.sendMail({
      from,
      to,
      subject: `[AURA TERMINAL] ${title}`,
      html: `
        <p>Hi ${greet},</p>
        <p>${body}</p>
        <p style="font-size:12px;color:#666;">This is a one-time notification for this conversion type per person referred.</p>
      `,
    });
    return { sent: true };
  } catch (error) {
    console.error('Referral conversion email failed:', error.message);
    return { sent: false, reason: error.message };
  }
};

module.exports = {
  SUPPORT_EMAIL,
  createTransporter,
  sendSignupNotification,
  sendWeeklySignupReport,
  sendReferralMilestoneEmail,
  sendReferralConversionEmail,
};
