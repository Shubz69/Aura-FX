'use strict';

/**
 * When desk automation (Perplexity / upstream) fails in a way that suggests credits, auth, or quota,
 * notify admins + super admins in-app; email super admins only (if SMTP is configured).
 * Rate-limited to avoid spam on repeated brief attempts.
 */

const { executeQuery } = require('../../db');
const { createNotification } = require('../../notifications');
const { createTransporter } = require('../../utils/email');

const lastSent = new Map();
const COOLDOWN_MS = Math.max(
  30 * 60 * 1000,
  Math.min(6 * 60 * 60 * 1000, parseInt(process.env.BRIEF_PROVIDER_ALERT_COOLDOWN_MS || String(60 * 60 * 1000), 10) || 60 * 60 * 1000)
);

function isCreditOrAuthFailure(httpStatus, errorText) {
  const s = Number(httpStatus) || 0;
  const t = String(errorText || '').toLowerCase();
  if (s === 401 || s === 402 || s === 403 || s === 429) return true;
  if (t.includes('no_perplexity') || t.includes('credit') || t.includes('quota') || t.includes('billing')) return true;
  if (t.includes('insufficient') && t.includes('fund')) return true;
  if (t.includes('rate limit') || t.includes('ratelimit')) return true;
  return false;
}

/**
 * @param {{ httpStatus?: number, errorText?: string, source?: string }} opts
 */
async function maybeNotifyBriefAutomationIssue(opts = {}) {
  const httpStatus = Number(opts.httpStatus) || 0;
  const errorText = String(opts.errorText || '');
  const source = String(opts.source || 'perplexity');
  if (!isCreditOrAuthFailure(httpStatus, errorText)) return { notified: false, reason: 'not_actionable' };

  const dedupeKey = `${source}:${httpStatus || 'na'}:${errorText.slice(0, 80)}`;
  const now = Date.now();
  const prev = lastSent.get(dedupeKey) || 0;
  if (now - prev < COOLDOWN_MS) return { notified: false, reason: 'cooldown' };
  lastSent.set(dedupeKey, now);
  if (lastSent.size > 200) {
    const cutoff = now - COOLDOWN_MS * 4;
    for (const [k, t] of lastSent) {
      if (t < cutoff) lastSent.delete(k);
    }
  }

  const title = 'Trader Desk automation alert';
  const body = `${source} request failed (${httpStatus || 'error'}). Check API keys / credits. ${errorText.slice(0, 400)}`;

  let inbox = 0;
  try {
    const [rows] = await executeQuery(
      `SELECT id, email, role FROM users WHERE LOWER(TRIM(role)) IN ('admin', 'super_admin')`,
      []
    );
    const list = Array.isArray(rows) ? rows : [];
    for (const u of list) {
      const uid = Number(u.id);
      if (!Number.isFinite(uid) || uid <= 0) continue;
      try {
        await createNotification({
          userId: uid,
          type: 'SYSTEM',
          title,
          body,
          meta: { briefAutomation: true, source, httpStatus, at: new Date().toISOString() },
        });
        inbox += 1;
      } catch (e) {
        console.warn('[briefProviderAlerts] notification failed', uid, e.message);
      }
    }
  } catch (e) {
    console.warn('[briefProviderAlerts] admin lookup failed', e.message);
  }

  let emailSent = false;
  try {
    const [sa] = await executeQuery(
      `SELECT DISTINCT email FROM users
       WHERE LOWER(TRIM(role)) = 'super_admin'
         AND email IS NOT NULL AND TRIM(email) <> ''`,
      []
    );
    const emails = (Array.isArray(sa) ? sa : [])
      .map((r) => String(r.email || '').trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (emails.length > 0) {
      const transporter = createTransporter();
      if (transporter) {
        const from = process.env.CONTACT_FROM || process.env.EMAIL_USER || 'no-reply@auraterminal.ai';
        const to = emails[0];
        const bcc = emails.length > 1 ? emails.slice(1) : undefined;
        await transporter.sendMail({
          from,
          to,
          ...(bcc && bcc.length ? { bcc } : {}),
          subject: `[AURA TERMINAL] Trader Desk automation — ${source} error (${httpStatus || 'n/a'})`,
          text: `${title}\n\n${body}\n\nThis email goes to super admins only when automation likely hit auth/credits/rate limits.`,
        });
        emailSent = true;
      }
    }
  } catch (e) {
    console.warn('[briefProviderAlerts] super admin email failed', e.message);
  }

  console.warn('[briefProviderAlerts]', { inbox, emailSent, httpStatus, source: source.slice(0, 40) });
  return { notified: true, inbox, emailSent };
}

module.exports = { maybeNotifyBriefAutomationIssue, isCreditOrAuthFailure };
