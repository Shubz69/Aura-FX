import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import Api from '../services/Api';

const SW_URL = '/service-worker.js';

/** Same host as other API calls (e.g. www.auraterminal.ai) — avoids silent push subscribe failures from apex vs www. */
function getPushApiBase() {
  try {
    const b = typeof Api.getBaseUrl === 'function' ? Api.getBaseUrl() : '';
    if (typeof b === 'string' && b.length > 0) return b;
  } catch (_) { /* ignore */ }
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * usePushNotifications
 * Manages service worker registration + Web Push subscription lifecycle.
 * Call subscribe() to request permission and register the user's device.
 * The VAPID public key must be set as REACT_APP_VAPID_PUBLIC_KEY in .env
 */
export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState('default');
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ok = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setSupported(ok);
    if (ok) setPermission(Notification.permission);
  }, []);

  const getRegistration = useCallback(async () => {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  }, []);

  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  };

  const subscribe = useCallback(async () => {
    if (!supported) { setError('Push notifications not supported in this browser.'); return false; }
    setLoading(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') { setError('Notification permission denied.'); return false; }

      const reg = await getRegistration();
      const vapidKey = process.env.REACT_APP_VAPID_PUBLIC_KEY;
      if (!vapidKey) { setError('Push notifications not configured (missing VAPID key).'); return false; }

      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey)
      });

      const token = localStorage.getItem('token');
      const base = getPushApiBase();
      const subPayload = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
      await axios.post(`${base}/api/push/subscribe`, { subscription: subPayload }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // #region agent log
      fetch('http://127.0.0.1:7826/ingest/3ba0a834-6e5c-4fe0-bd70-25d6a5ebbb2f', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8f4319' },
        body: JSON.stringify({
          sessionId: '8f4319',
          timestamp: Date.now(),
          location: 'usePushNotifications.js:subscribe',
          message: 'client push subscribe API ok',
          hypothesisId: 'H5',
          data: { origin: typeof window !== 'undefined' ? window.location.origin : '' },
        }),
      }).catch(() => {});
      // #endregion

      setSubscribed(true);
      return true;
    } catch (e) {
      setError(e.message || 'Failed to enable push notifications.');
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported, getRegistration]);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    setError(null);
    let serverRemoved = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      if (!reg) {
        setSubscribed(false);
        return true;
      }
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const token = localStorage.getItem('token');
        try {
          const base = getPushApiBase();
          await axios.delete(`${base}/api/push/subscribe`, {
            data: { endpoint: sub.endpoint },
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch (apiErr) {
          serverRemoved = false;
          console.warn('Push unsubscribe API:', apiErr?.message);
          setError('Could not remove push on server — try again or you may still get device alerts.');
        }
        await sub.unsubscribe();
      }
      setSubscribed(false);
      return serverRemoved;
    } catch (e) {
      setError(e.message || 'Failed to disable push notifications.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Check existing subscription on mount
  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.getRegistration(SW_URL).then(reg => {
      if (!reg) return;
      reg.pushManager?.getSubscription().then(sub => setSubscribed(!!sub));
    }).catch(() => {});
  }, [supported]);

  return { supported, permission, subscribed, loading, error, subscribe, unsubscribe };
}
