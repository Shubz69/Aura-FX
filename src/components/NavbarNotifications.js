import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaBell } from 'react-icons/fa';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { getApiBaseUrl } from '../services/Api';
import NotificationsDropdown from './NotificationsDropdown';
import '../styles/NotificationSystem.css';

const UNREAD_POLL_INTERVAL_MS = 60000;
const UNREAD_MIN_GAP_MS = 60000;
const UNREAD_429_MIN_BACKOFF_MS = 60000;

let globalUnreadInFlightPromise = null;
let globalUnreadLastAttemptAt = 0;
let globalUnreadNextAllowedAt = 0;
let globalUnreadFailStreak = 0;
let globalUnreadLastResult = { ok: null, status: null, at: 0 };

function parseRetryAfterMs(headerValue) {
  if (!headerValue) return 0;
  const asNumber = Number(headerValue);
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.floor(asNumber * 1000);
  const retryDate = Date.parse(headerValue);
  if (!Number.isFinite(retryDate)) return 0;
  return Math.max(0, retryDate - Date.now());
}

/**
 * Navbar notification bell that fetches from /api/notifications
 * and shows NotificationsDropdown (friend requests, admin messages, etc.)
 */
const NavbarNotifications = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef(null);
  const fetchInFlightRef = useRef(false);
  const controllerRef = useRef(null);
  const lastFetchAtRef = useRef(0);
  const refreshTimerRef = useRef(null);
  const token = localStorage.getItem('token');

  const fetchUnreadCount = useCallback(async ({ force = false } = {}) => {
    if (!token || !user) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && !force) return;
    if (typeof window !== 'undefined' && String(window.location?.pathname || '').startsWith('/community') && !force) return;
    if (fetchInFlightRef.current || globalUnreadInFlightPromise) return globalUnreadInFlightPromise;
    const now = Date.now();
    const localGapMs = now - lastFetchAtRef.current;
    const globalGapMs = now - globalUnreadLastAttemptAt;
    if (now < globalUnreadNextAllowedAt) return globalUnreadLastResult;
    if (localGapMs < 2500) return;
    if (globalGapMs < UNREAD_MIN_GAP_MS) return;
    fetchInFlightRef.current = true;
    lastFetchAtRef.current = now;
    globalUnreadLastAttemptAt = now;
    const requestPromise = (async () => {
      const apiBase = getApiBaseUrl();
      if (controllerRef.current) controllerRef.current.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      let res = await fetch(`${apiBase}/api/notifications?limit=1`, {
        headers: { Authorization: `Bearer ${token}` }
        , signal: controller.signal
      });
      if (!res.ok && res.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        res = await fetch(`${apiBase}/api/notifications?limit=1`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
      }
      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          setUnreadCount(data.unreadCount ?? 0);
        }
        globalUnreadLastResult = { ok: true, status: res.status, at: Date.now() };
        globalUnreadFailStreak = 0;
        globalUnreadNextAllowedAt = 0;
      } else {
        globalUnreadLastResult = { ok: false, status: res.status, at: Date.now() };
        globalUnreadFailStreak = Math.min(6, globalUnreadFailStreak + 1);
        if (res.status === 429) {
          const retryAfterMs = parseRetryAfterMs(res.headers?.get?.('Retry-After'));
          const waitMs = Math.max(UNREAD_429_MIN_BACKOFF_MS, retryAfterMs || 0);
          globalUnreadNextAllowedAt = Date.now() + waitMs;
        } else {
          const backoffMs = 1200 * (2 ** Math.max(0, globalUnreadFailStreak - 1));
          globalUnreadNextAllowedAt = Date.now() + Math.min(45000, backoffMs);
        }
      }
    })().catch((e) => {
      if (e?.name === 'AbortError') return;
      globalUnreadLastResult = { ok: false, status: 'network_error', at: Date.now() };
      globalUnreadFailStreak = Math.min(5, globalUnreadFailStreak + 1);
      const backoffMs = 1500 * (2 ** globalUnreadFailStreak);
      globalUnreadNextAllowedAt = Date.now() + Math.min(45000, backoffMs);
    }).finally(() => {
      fetchInFlightRef.current = false;
      globalUnreadInFlightPromise = null;
    });
    globalUnreadInFlightPromise = requestPromise;
    return requestPromise;
  }, [token, user]);

  useEffect(() => {
    if (!user) return;
    fetchUnreadCount({ force: false });
    const interval = setInterval(() => fetchUnreadCount({ force: false }), UNREAD_POLL_INTERVAL_MS);
    const onFocus = () => fetchUnreadCount({ force: false });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void fetchUnreadCount({ force: false });
    };
    const onRefresh = () => {
      if (typeof window !== 'undefined' && String(window.location?.pathname || '').startsWith('/community')) return;
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void fetchUnreadCount({ force: false });
      }, 600);
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('aura-notifications-refresh', onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('aura-notifications-refresh', onRefresh);
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      if (controllerRef.current) controllerRef.current.abort();
    };
  }, [user, fetchUnreadCount]);

  const handleUnreadChange = useCallback((count) => {
    setUnreadCount(count);
  }, []);

  if (!user) return null;

  return (
    <div className="notification-container" ref={bellRef}>
      <button
        className="notification-bell"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={t('notifications.title')}
      >
        <FaBell />
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      <NotificationsDropdown
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
          if (!(typeof window !== 'undefined' && String(window.location?.pathname || '').startsWith('/community'))) {
            fetchUnreadCount({ force: false });
          }
        }}
        anchorRef={bellRef}
        user={user}
        onUnreadCountChange={handleUnreadChange}
      />
    </div>
  );
};

export default NavbarNotifications;
