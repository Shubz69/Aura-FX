/**
 * Transactional mail for auth flows (signup verification, password reset, MFA).
 *
 * Production reliability:
 * - Prefer **RESEND_API_KEY** + **RESEND_FROM_EMAIL** (or CONTACT_FROM) — avoids Gmail SMTP
 *   app-password breakage on serverless (EAUTH 535).
 * - If Resend is not set, uses SMTP (Gmail-compatible: explicit host/port/requireTLS).
 *
 * Env:
 * - RESEND_API_KEY — optional; if set, mail is sent via Resend HTTP API first.
 * - RESEND_FROM_EMAIL — e.g. `Aura Terminal <noreply@yourdomain.com>` (must be verified in Resend).
 * - CONTACT_FROM — used as Resend "from" when RESEND_FROM_EMAIL unset.
 * - EMAIL_USER, EMAIL_PASS — SMTP (trimmed). Use a Gmail **App Password**, not the normal password.
 * - EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE — override SMTP (defaults Gmail 587 STARTTLS).
 */

const nodemailer = require('nodemailer');

function maskSmtpUser(user) {
  if (!user || typeof user !== 'string') return '(unset)';
  const at = user.indexOf('@');
  if (at <= 0) return '(invalid)';
  const local = user.slice(0, at);
  const domain = user.slice(at + 1);
  const show = local.slice(0, Math.min(2, local.length));
  return `${show}***@${domain}`;
}

function resolveResendFrom() {
  const explicit = process.env.RESEND_FROM_EMAIL?.trim();
  if (explicit) return explicit;
  const contact = process.env.CONTACT_FROM?.trim();
  if (contact) return contact;
  const emailUser = process.env.EMAIL_USER?.trim();
  if (emailUser) return `"Aura Terminal" <${emailUser}>`;
  return '';
}

function hasSmtpCredentials() {
  return !!(process.env.EMAIL_USER?.trim() && process.env.EMAIL_PASS?.trim());
}

function createSmtpTransport() {
  if (!hasSmtpCredentials()) return null;
  const user = process.env.EMAIL_USER.trim();
  const pass = process.env.EMAIL_PASS.trim();
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
}

function defaultFromHeader() {
  const u = process.env.EMAIL_USER?.trim();
  if (u) return `"Aura Terminal" <${u}>`;
  const c = process.env.CONTACT_FROM?.trim();
  if (c) return c;
  return 'Aura Terminal <no-reply@auraterminal.ai>';
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, errorCode: string, message: string }>}
 */
async function sendViaResend(apiKey, { to, subject, html }) {
  const from = resolveResendFrom();
  if (!from) {
    return {
      ok: false,
      errorCode: 'RESEND_NO_FROM',
      message: 'RESEND_API_KEY is set but no sender: set RESEND_FROM_EMAIL or CONTACT_FROM.',
    };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    });

    const bodyText = await res.text();
    if (res.ok) {
      return { ok: true };
    }

    let detail = bodyText;
    try {
      const j = JSON.parse(bodyText);
      if (j && j.message) detail = Array.isArray(j.message) ? j.message.join(', ') : String(j.message);
    } catch (_) {
      /* keep bodyText */
    }

    return {
      ok: false,
      errorCode: `RESEND_${res.status}`,
      message: detail.slice(0, 500),
    };
  } catch (e) {
    return {
      ok: false,
      errorCode: 'RESEND_FETCH',
      message: e && e.message ? e.message : 'Resend request failed',
    };
  }
}

/**
 * Send HTML transactional email (auth codes, reset links).
 * Tries Resend when RESEND_API_KEY is set; on failure falls back to SMTP if configured.
 *
 * @param {{ to: string, subject: string, html: string }} opts
 * @returns {Promise<{ ok: true } | { ok: false, errorCode: string, message: string }>}
 */
async function sendTransactionalHtml(opts) {
  const { to, subject, html } = opts;
  if (!to || !subject || !html) {
    return { ok: false, errorCode: 'INVALID_ARGS', message: 'Missing to, subject, or html' };
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (resendKey) {
    const r = await sendViaResend(resendKey, { to, subject, html });
    if (r.ok) return r;
    console.error('authMail: Resend send failed:', r.errorCode, r.message);
    if (!hasSmtpCredentials()) {
      return r;
    }
    console.warn('authMail: falling back to SMTP after Resend failure');
  }

  const transporter = createSmtpTransport();
  if (!transporter) {
    return {
      ok: false,
      errorCode: 'SMTP_NOT_CONFIGURED',
      message: 'Email is not configured (set RESEND_API_KEY or EMAIL_USER + EMAIL_PASS).',
    };
  }

  try {
    await transporter.sendMail({
      from: defaultFromHeader(),
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (err) {
    const code = err && err.code ? String(err.code) : 'SMTP_ERROR';
    const message = err && err.message ? err.message : 'SMTP send failed';
    if (code === 'EAUTH') {
      console.error(
        'authMail: SMTP authentication failed (EAUTH). Use a Gmail App Password, or switch to Resend (RESEND_API_KEY). SMTP user:',
        maskSmtpUser(process.env.EMAIL_USER),
      );
    } else {
      console.error('authMail: SMTP send failed:', code, message);
    }
    return { ok: false, errorCode: code, message };
  }
}

function isMailConfiguredForAuth() {
  return !!(process.env.RESEND_API_KEY?.trim() || hasSmtpCredentials());
}

module.exports = {
  sendTransactionalHtml,
  isMailConfiguredForAuth,
  createSmtpTransport,
  maskSmtpUser,
};
