import { useEffect } from 'react';
import { toast } from 'react-toastify';

const TOAST_DEBOUNCE_MS = 10000;

function shouldFireInstallToast() {
  try {
    const t = sessionStorage.getItem('aura_pwa_install_toast_ts');
    if (t && Date.now() - parseInt(t, 10) < TOAST_DEBOUNCE_MS) return false;
    sessionStorage.setItem('aura_pwa_install_toast_ts', String(Date.now()));
  } catch (_) {
    /* ignore */
  }
  return true;
}

function trySystemInstallNotification() {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    new Notification('AURA TERMINAL', {
      body: 'App installed — keep notifications on to get alerts while using the app.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'aura-pwa-installed',
    });
  } catch (_) {
    /* unsupported options on some platforms */
  }
}

const INSTALL_TOAST =
  'AURA TERMINAL is installed as an app. Enable notifications in your device or browser settings to get alerts.';

/**
 * When the site is installed as a PWA, surface a clear in-app ping (toast) and,
 * if permission was already granted, an OS notification. Also handles
 * display-mode: standalone / iOS home-screen where `appinstalled` may not fire.
 */
export function usePwaInstallAlerts() {
  useEffect(() => {
    const onAppInstalled = () => {
      if (!shouldFireInstallToast()) return;
      toast.success(INSTALL_TOAST, { autoClose: 6500 });
      trySystemInstallNotification();
    };

    window.addEventListener('appinstalled', onAppInstalled);

    const tryStandaloneWelcome = () => {
      const standaloneMq = window.matchMedia?.('(display-mode: standalone)');
      const isStandalone =
        standaloneMq?.matches === true ||
        window.navigator.standalone === true;
      if (!isStandalone) return;

      try {
        if (localStorage.getItem('aura_pwa_standalone_welcome')) return;
      } catch (_) {
        return;
      }
      if (!shouldFireInstallToast()) return;
      try {
        localStorage.setItem('aura_pwa_standalone_welcome', '1');
      } catch (_) {
        /* private mode — still show toast */
      }
      toast.info(INSTALL_TOAST, { autoClose: 6500 });
      trySystemInstallNotification();
    };

    tryStandaloneWelcome();

    const standaloneMq = window.matchMedia?.('(display-mode: standalone)');
    const onStandaloneChange = () => tryStandaloneWelcome();
    standaloneMq?.addEventListener?.('change', onStandaloneChange);

    return () => {
      window.removeEventListener('appinstalled', onAppInstalled);
      standaloneMq?.removeEventListener?.('change', onStandaloneChange);
    };
  }, []);
}
