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
  const token = localStorage.getItem('token');
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const fetchUnreadCount = useCallback(async () => {
    if (!token || !user) return;
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const res = await fetch(`${baseUrl}/api/notifications?limit=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          setUnreadCount(data.unreadCount ?? 0);
        }
      }
    } catch (e) {
      // Avoid console spam on network errors
      if ((e?.message || '').indexOf('fetch') === -1) console.warn('Failed to fetch notification count:', e?.message);
    } finally {
      fetchInFlightRef.current = false;
    }
  }, [token, user, baseUrl]);

  useEffect(() => {
    if (!user) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 45000); // poll every 45s to reduce ERR_INSUFFICIENT_RESOURCES
    const onFocus = () => fetchUnreadCount();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
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
          fetchUnreadCount(); // Refresh badge when closing
        }}
        anchorRef={bellRef}
        user={user}
        onUnreadCountChange={handleUnreadChange}
      />
    </div>
  );
};

export default NavbarNotifications;
