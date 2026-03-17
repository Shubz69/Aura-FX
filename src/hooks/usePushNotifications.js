import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = typeof window !== 'undefined' ? window.location.origin : '';
const SW_URL = '/service-worker.js';

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
      await axios.post(`${API_BASE}/api/push/subscribe`, { subscription }, {
        headers: { Authorization: `Bearer ${token}` }
      });

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
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      if (!reg) return;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const token = localStorage.getItem('token');
        await axios.delete(`${API_BASE}/api/push/subscribe`, {
          data: { endpoint: sub.endpoint },
          headers: { Authorization: `Bearer ${token}` }
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e.message);
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
