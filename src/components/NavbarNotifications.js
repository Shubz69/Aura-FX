import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FaBell } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import NotificationsDropdown from './NotificationsDropdown';
import '../styles/NotificationSystem.css';

/**
 * Navbar notification bell that fetches from /api/notifications
 * and shows NotificationsDropdown (friend requests, admin messages, etc.)
 */
const NavbarNotifications = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef(null);
  const fetchInFlightRef = useRef(false);
  const controllerRef = useRef(null);
  const failStreakRef = useRef(0);
  const nextAllowedAtRef = useRef(0);
  const lastFetchAtRef = useRef(0);
  const refreshTimerRef = useRef(null);
  const token = localStorage.getItem('token');
  const baseUrl = process.env.REACT_APP_API_URL || (typeof window !== 'undefined' ? window.location.origin : '');

  const fetchUnreadCount = useCallback(async ({ force = false } = {}) => {
    if (!token || !user) return;
    if (fetchInFlightRef.current) return;
    const now = Date.now();
    if (!force) {
      if (now < nextAllowedAtRef.current) return;
      if (now - lastFetchAtRef.current < 2500) return;
    }
    fetchInFlightRef.current = true;
    lastFetchAtRef.current = now;
    try {
      if (controllerRef.current) controllerRef.current.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      let res = await fetch(`${baseUrl}/api/notifications?limit=1`, {
        headers: { Authorization: `Bearer ${token}` }
        , signal: controller.signal
      });
      if (!res.ok && (res.status === 429 || res.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        res = await fetch(`${baseUrl}/api/notifications?limit=1`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal
        });
      }
      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          setUnreadCount(data.unreadCount ?? 0);
        }
        failStreakRef.current = 0;
        nextAllowedAtRef.current = 0;
      } else {
        failStreakRef.current = Math.min(6, failStreakRef.current + 1);
        const base = res.status === 429 ? 3000 : 800;
        const backoffMs = base * (2 ** Math.max(0, failStreakRef.current - 1));
        nextAllowedAtRef.current = Date.now() + Math.min(30000, backoffMs);
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
      // Avoid console spam on network errors
      if ((e?.message || '').indexOf('fetch') === -1) console.warn('Failed to fetch notification count:', e?.message);
      failStreakRef.current = Math.min(5, failStreakRef.current + 1);
      const backoffMs = 400 * (2 ** failStreakRef.current);
      nextAllowedAtRef.current = Date.now() + backoffMs;
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [token, user, baseUrl]);

  useEffect(() => {
    if (!user) return;
    fetchUnreadCount({ force: true });
    const interval = setInterval(fetchUnreadCount, 45000); // poll every 45s to reduce ERR_INSUFFICIENT_RESOURCES
    const onFocus = () => fetchUnreadCount({ force: true });
    const onRefresh = () => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void fetchUnreadCount({ force: true });
      }, 600);
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('aura-notifications-refresh', onRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
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
        aria-label="Notifications"
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
          fetchUnreadCount({ force: true }); // Refresh badge when closing
        }}
        anchorRef={bellRef}
        user={user}
        onUnreadCountChange={handleUnreadChange}
      />
    </div>
  );
};

export default NavbarNotifications;
