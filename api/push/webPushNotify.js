/**
 * Send Web Push to all stored subscriptions for a user (after in-app notification is created).
 * Users with no subscription only see the bell dropdown; disabling push removes DB rows → no device ping.
 */

const webpush = require('web-push');
const { executeQuery } = require('../db');

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_USER || 'support@auraterminal.ai'}`,
    pub,
    priv
  );
  vapidConfigured = true;
  return true;
}

function resolveOpenUrl(type, meta, channelId) {
  let m = meta;
  if (m && typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch (_) {
      m = {};
    }
  }
  if (!m || typeof m !== 'object') m = {};
  if (type === 'DAILY_JOURNAL') return '/journal';
  if (type === 'SYSTEM') return '/';
  // Thread DMs use REPLY with channel_id 0 — not community channels
  if (type === 'REPLY' && (channelId === 0 || channelId == null)) return '/messages';
  if (type === 'MENTION' || type === 'REPLY') return '/community';
  if (String(type || '').startsWith('FRIEND')) return '/messages';
  return '/messages';
}

function pushPayloadType(type) {
  if (type === 'MENTION' || type === 'REPLY') return 'mention';
  return 'general';
}

/**
 * @param {object} opts
 * @param {number} opts.userId
 * @param {string} opts.notificationId
 * @param {string} opts.type
 * @param {string} opts.title
 * @param {string} [opts.body]
 * @param {object|string|null} [opts.meta]
 * @param {number|null} [opts.channelId]
 */
async function sendWebPushForNotification(opts) {
  const { userId, notificationId, type, title, body = '', meta, channelId = null } = opts;
  if (!userId || !notificationId) return;
  if (!ensureVapid()) return;

  const url = resolveOpenUrl(type, meta, channelId);
  const payload = JSON.stringify({
    title: title || 'AURA TERMINAL',
    body: body || '',
    url,
    type: pushPayloadType(type),
    tag: `aura-${notificationId}`
  });

  let rows;
  try {
    const [r] = await executeQuery(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?',
      [userId]
    );
    rows = r;
  } catch (e) {
    console.warn('[webPush] subscription query failed:', e.message);
    return;
  }

  if (!Array.isArray(rows) || rows.length === 0) return;

  await Promise.all(
    rows.map((row) => sendOneSubscription(row, payload))
  );
}

async function sendOneSubscription(row, payload) {
  const sub = {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth }
  };
  try {
    await webpush.sendNotification(sub, payload, { TTL: 86400 });
  } catch (err) {
    const status = err.statusCode;
    if (status === 404 || status === 410) {
      try {
        await executeQuery('DELETE FROM push_subscriptions WHERE endpoint = ?', [row.endpoint]);
      } catch (_) {}
    } else {
      console.warn('[webPush] send failed:', status || err.message);
    }
  }
}

module.exports = { sendWebPushForNotification };
