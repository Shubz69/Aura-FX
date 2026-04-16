/**
 * Transactional mail for auth flows (signup verification, password reset, MFA).
 *
 * Production reliability (tried in order until one succeeds):
 * 1. **RESEND_API_KEY** — Resend HTTP API (set RESEND_FROM_EMAIL or verified CONTACT_FROM).
 * 2. **SENDGRID_API_KEY** — SendGrid v3 HTTP API (set SENDGRID_FROM_EMAIL or CONTACT_FROM).
 * 3. **SMTP** — EMAIL_USER + EMAIL_PASS (Gmail: use an App Password, not the account password).
 *
 * Env:
 * - RESEND_API_KEY, RESEND_FROM_EMAIL (optional if CONTACT_FROM is valid for Resend).
 * - SENDGRID_API_KEY, SENDGRID_FROM_EMAIL (optional if CONTACT_FROM has a verified SendGrid sender).
 * - CONTACT_FROM — used as "from" for HTTP providers when specific *_FROM_EMAIL is unset.
 * - EMAIL_USER, EMAIL_PASS — SMTP; EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE optional.
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

/** @returns {{ name: string, email: string } | null} */
function parseFromNameEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  const lt = s.indexOf('<');
  const gt = s.indexOf('>');
  if (lt !== -1 && gt > lt) {
    const name = s.slice(0, lt).trim().replace(/^["']|["']$/g, '') || 'Aura Terminal';
    const email = s.slice(lt + 1, gt).trim();
    if (email.includes('@')) return { name, email };
  }
  if (s.includes('@') && lt === -1) {
    return { name: 'Aura Terminal', email: s };
  }
  return null;
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

function resolveSendGridFrom() {
  const explicit = process.env.SENDGRID_FROM_EMAIL?.trim();
  if (explicit) {
    const p = parseFromNameEmail(explicit);
    if (p) return p;
    if (explicit.includes('@')) return { name: 'Aura Terminal', email: explicit };
  }
  const contact = process.env.CONTACT_FROM?.trim();
  if (contact) {
    const p = parseFromNameEmail(contact);
    if (p) return p;
  }
  const emailUser = process.env.EMAIL_USER?.trim();
  if (emailUser) return { name: 'Aura Terminal', email: emailUser };
  return null;
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
 * @returns {Promise<{ ok: true } | { ok: false, errorCode: string, message: string }>}
 */
async function sendViaSendGrid(apiKey, { to, subject, html }) {
  const from = resolveSendGridFrom();
  if (!from) {
    return {
      ok: false,
      errorCode: 'SENDGRID_NO_FROM',
      message: 'SENDGRID_API_KEY is set but no sender: set SENDGRID_FROM_EMAIL or CONTACT_FROM.',
    };
  }

  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from.email, name: from.name },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });

    const bodyText = await res.text();
    if (res.status === 202 || res.ok) {
      return { ok: true };
    }

    let detail = bodyText.slice(0, 500);
    try {
      const j = JSON.parse(bodyText);
      if (j && j.errors && Array.isArray(j.errors)) {
        detail = j.errors.map((e) => e.message || String(e)).join('; ');
      } else if (j && j.message) {
        detail = String(j.message);
      }
    } catch (_) {
      /* keep bodyText */
    }

    return {
      ok: false,
      errorCode: `SENDGRID_${res.status}`,
      message: detail,
    };
  } catch (e) {
    return {
      ok: false,
      errorCode: 'SENDGRID_FETCH',
      message: e && e.message ? e.message : 'SendGrid request failed',
    };
  }
}

/**
 * Send HTML transactional email (auth codes, reset links).
 * Tries Resend, then SendGrid (HTTP), then SMTP.
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
  }

  const sendgridKey = process.env.SENDGRID_API_KEY?.trim();
  if (sendgridKey) {
    const r = await sendViaSendGrid(sendgridKey, { to, subject, html });
    if (r.ok) return r;
    console.error('authMail: SendGrid send failed:', r.errorCode, r.message);
  }

  const transporter = createSmtpTransport();
  if (!transporter) {
    return {
      ok: false,
      errorCode: 'SMTP_NOT_CONFIGURED',
      message:
        'Email is not configured. Set RESEND_API_KEY, SENDGRID_API_KEY, or EMAIL_USER + EMAIL_PASS on the server.',
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
  return !!(
    process.env.RESEND_API_KEY?.trim() ||
    process.env.SENDGRID_API_KEY?.trim() ||
    hasSmtpCredentials()
  );
}

module.exports = {
  sendTransactionalHtml,
  isMailConfiguredForAuth,
  createSmtpTransport,
  maskSmtpUser,
};
