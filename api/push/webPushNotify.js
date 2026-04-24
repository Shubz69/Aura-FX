/**
 * Send Web Push to all stored subscriptions for a user (after in-app notification is created).
 * Users with no subscription only see the bell dropdown; disabling push removes DB rows → no device ping.
 */

const webpush = require('web-push');
const { executeQuery } = require('../db');

let vapidConfigured = false;
let vapidMissingLogged = false;
const PUSH_SEND_TIMEOUT_MS = 5000;
const PUSH_BATCH_SIZE = 10;

function ensureVapid() {
  if (vapidConfigured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    if (!vapidMissingLogged) {
      vapidMissingLogged = true;
      console.warn('[webPush] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set — device push disabled (in-app notifications still work)');
    }
    return false;
  }
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
  if (typeof m.url === 'string' && m.url.trim()) return m.url.trim();
  if (type === 'DAILY_JOURNAL') return '/journal';
  if (type === 'SYSTEM') {
    if (m.kind === 'JOURNAL_TASK_DUE') return '/journal';
    return '/';
  }
  // Thread DMs use REPLY with channel_id 0 — not community channels
  if (type === 'REPLY' && (channelId === 0 || channelId == null)) return '/messages';
  if (type === 'CHANNEL_ACTIVITY') return '/community';
  if (type === 'MENTION' || type === 'REPLY') return '/community';
  if (String(type || '').startsWith('FRIEND')) return '/messages';
  return '/messages';
}

function pushPayloadType(type) {
  if (type === 'MENTION' || type === 'REPLY') return 'mention';
  if (type === 'CHANNEL_ACTIVITY') return 'channel_activity';
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
    title: title || 'AURA TERMINAL™',
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

  // Keep latency bounded under high subscription counts.
  for (let i = 0; i < rows.length; i += PUSH_BATCH_SIZE) {
    const batch = rows.slice(i, i + PUSH_BATCH_SIZE);
    await Promise.allSettled(batch.map((row) => sendOneSubscription(row, payload)));
  }
}

async function sendOneSubscription(row, payload) {
  const sub = {
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth }
  };
  try {
    await withTimeout(
      webpush.sendNotification(sub, payload, { TTL: 86400 }),
      PUSH_SEND_TIMEOUT_MS
    );
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

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Push send timeout')), timeoutMs);
    })
  ]);
}

module.exports = { sendWebPushForNotification };
