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
  const token = localStorage.getItem('token');
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const fetchUnreadCount = useCallback(async () => {
    if (!token || !user) return;
    try {
      const res = await fetch(`${baseUrl}/api/notifications?limit=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (e) {
      console.warn('Failed to fetch notification count:', e.message);
    }
  }, [token, user, baseUrl]);

  useEffect(() => {
    if (!user) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000); // poll every 60s
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
        onClose={() => setIsOpen(false)}
        anchorRef={bellRef}
        user={user}
        onUnreadCountChange={handleUnreadChange}
      />
    </div>
  );
};

export default NavbarNotifications;
