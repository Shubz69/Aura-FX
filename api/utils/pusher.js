/**
 * Pusher server-side helper for production realtime messaging.
 * Requires env: PUSHER_APP_ID, PUSHER_KEY, PUSHER_SECRET, PUSHER_CLUSTER (e.g. us2).
 * If not configured, triggerMessage is a no-op.
 */

let pusherInstance = null;

function getPusher() {
  if (pusherInstance) return pusherInstance;
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER || 'us2';
  if (!appId || !key || !secret) return null;
  try {
    const Pusher = require('pusher');
    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true
    });
    return pusherInstance;
  } catch (e) {
    console.warn('Pusher init failed:', e.message);
    return null;
  }
}

/**
 * Broadcast a new message to all clients subscribed to the channel.
 * Call this AFTER successful DB insert. No-op if Pusher not configured.
 */
async function triggerNewMessage(channelId, message) {
  const pusher = getPusher();
  if (!pusher || !channelId || !message) return;
  try {
    await pusher.trigger(`channel-${channelId}`, 'new-message', message);
  } catch (e) {
    console.warn('Pusher trigger failed:', e.message);
  }
}

module.exports = { getPusher, triggerNewMessage };
