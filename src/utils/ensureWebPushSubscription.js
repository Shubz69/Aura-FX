/**
 * If the user already granted notification permission (e.g. on Profile) but the
 * subscription was lost (cache clear, new device), re-create the push subscription
 * and register it with the API so DMs / @mentions can reach phones & PWAs.
 */
import axios from 'axios';
import Api from '../services/Api';

const SW_URL = '/service-worker.js';

function getPushApiBase() {
  try {
    const b = typeof Api.getBaseUrl === 'function' ? Api.getBaseUrl() : '';
    if (typeof b === 'string' && b.length > 0) return b;
  } catch (_) { /* ignore */ }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

/**
 * No permission prompt if status is not "granted".
 * Safe to call on every login.
 */
export async function ensureWebPushSubscription() {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const vapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
  if (!vapidKey) return;

  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const payload = typeof sub.toJSON === 'function' ? sub.toJSON() : sub;
    const base = getPushApiBase();
    await axios.post(
      `${base}/api/push/subscribe`,
      { subscription: payload },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (e) {
    console.warn('[push] ensureWebPushSubscription:', e?.message || e);
  }
}
