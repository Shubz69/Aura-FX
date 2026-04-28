import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  FaBell, FaTimes, FaUserPlus, FaReply, FaAt, FaCheck,
  FaTimes as FaDecline, FaCog, FaUserCheck, FaUserTimes,
  FaComments, FaExclamationCircle, FaSpinner, FaBook
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { isAdmin } from '../utils/roles';
import { getApiBaseUrl } from '../services/Api';
import { logClassifiedError } from '../utils/apiObservability';
import '../styles/NotificationsDropdown.css';

// Notification type icons
const TYPE_ICONS = {
  MENTION: FaAt,
  REPLY: FaReply,
  CHANNEL_ACTIVITY: FaComments,
  FRIEND_REQUEST: FaUserPlus,
  FRIEND_ACCEPTED: FaUserCheck,
  FRIEND_DECLINED: FaUserTimes,
  SYSTEM: FaCog,
  DAILY_JOURNAL: FaBook
};

// Notification type colors
const TYPE_COLORS = {
  MENTION: '#5865F2',
  REPLY: '#00B894',
  CHANNEL_ACTIVITY: '#eaa960',
  FRIEND_REQUEST: '#FFB800',
  FRIEND_ACCEPTED: '#23A55A',
  FRIEND_DECLINED: '#ED4245',
  SYSTEM: '#eaa960',
  DAILY_JOURNAL: '#eaa960'
};

// Format relative time
function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  if (diffMins < 10080) return `${Math.floor(diffMins / 1440)}d ago`;
  return then.toLocaleDateString();
}

/** Coerce API / MySQL-style fields into the shape the UI expects */
function normalizeNotification(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = raw.id != null ? String(raw.id) : null;
  if (!id) return null;
  let meta = raw.meta ?? null;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch (_) {
      meta = null;
    }
  }
  return {
    ...raw,
    id,
    meta,
    type: raw.type || 'SYSTEM',
    title: raw.title != null ? String(raw.title) : 'Notification',
    body: raw.body != null ? raw.body : null,
    status: raw.status || 'READ',
    actionStatus: raw.actionStatus ?? raw.action_status ?? null,
    channelId: raw.channelId ?? raw.channel_id,
    messageId: raw.messageId ?? raw.message_id,
    friendRequestId: raw.friendRequestId ?? raw.friend_request_id,
    createdAt: raw.createdAt ?? raw.created_at,
    readAt: raw.readAt ?? raw.read_at,
  };
}

function parseUnreadCount(data) {
  const c = data?.unreadCount;
  if (c == null) return 0;
  if (typeof c === 'bigint') return Number(c);
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}

const NotificationsDropdown = ({ isOpen, onClose, anchorRef, user, onUnreadCountChange }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [listFetchFailed, setListFetchFailed] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());
  
  const listRef = useRef(null);
  const listRetryRef = useRef(0);
  const listFetchSeqRef = useRef(0);
  const listControllerRef = useRef(null);
  const inFlightCursorRef = useRef(new Set());
  const lastNavRef = useRef({ url: '', at: 0 });
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  // Fetch notifications
  const fetchNotifications = useCallback(async (cursor = null, append = false) => {
    if (!token) return;
    const cursorKey = cursor || '__root__';
    if (inFlightCursorRef.current.has(cursorKey)) return;
    const fetchSeq = ++listFetchSeqRef.current;
    if (!append && listControllerRef.current) listControllerRef.current.abort();
    const controller = new AbortController();
    listControllerRef.current = controller;
    inFlightCursorRef.current.add(cursorKey);
    
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      
      const params = new URLSearchParams();
      if (cursor) params.append('cursor', cursor);
      params.append('limit', '20');
      const apiBase = getApiBaseUrl();

      let response = await fetch(`${apiBase}/api/notifications?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
        , signal: controller.signal
      });
      // Safe retry for idempotent GET only.
      if (!response.ok && response.status >= 500) {
        response = await fetch(`${apiBase}/api/notifications?${params}`, {
          headers: { 'Authorization': `Bearer ${token}` },
          signal: controller.signal,
        });
      }
      
      const data = response.ok ? await response.json().catch(() => ({})) : null;
      if (fetchSeq !== listFetchSeqRef.current && !append) return;

      if (!response.ok) {
        setListFetchFailed(true);
        const msg = data?.message || `Could not load notifications (${response.status})`;
        toast.error(msg);
        if (!append) setNotifications([]);
        return;
      }

      if (data.success === false) {
        setListFetchFailed(true);
        toast.error(data.message || 'Failed to load notifications');
        return;
      }

      const rawItems = Array.isArray(data.items)
        ? data.items
        : (Array.isArray(data.notifications) ? data.notifications : (Array.isArray(data.data) ? data.data : []));
      const items = rawItems.map(normalizeNotification).filter(Boolean);

      setListFetchFailed(!!data.listFetchFailed);
      if (append) {
        setNotifications(prev => [...prev, ...items]);
      } else {
        setNotifications(items);
      }
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
      const count = parseUnreadCount(data);
      setUnreadCount(count);
      onUnreadCountChange?.(count);

      // One silent retry if server reported unread but returned no rows (matches fc33ee2-style list/ count drift)
      if (!append && items.length === 0 && count > 0 && !data.listFetchFailed && listRetryRef.current < 1) {
        listRetryRef.current += 1;
        setTimeout(() => fetchNotifications(null, false), 500);
      }
      if (items.length > 0) listRetryRef.current = 0;
    } catch (error) {
      if (error?.name === 'AbortError') return;
      if (fetchSeq !== listFetchSeqRef.current && !append) return;
      console.error('Failed to fetch notifications:', error);
      logClassifiedError('notifications.list_fetch', error, { cursor: cursor || null, append });
      setListFetchFailed(true);
      toast.error('Failed to load notifications');
    } finally {
      inFlightCursorRef.current.delete(cursorKey);
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, onUnreadCountChange]);

  // Load on open
  useEffect(() => {
    if (isOpen) {
      listRetryRef.current = 0;
      setListFetchFailed(false);
      fetchNotifications();
    } else if (listControllerRef.current) {
      listControllerRef.current.abort();
    }
  }, [isOpen, fetchNotifications]);

  // Infinite scroll
  const handleScroll = useCallback(() => {
    if (!listRef.current || !hasMore || loadingMore) return;
    
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      fetchNotifications(nextCursor, true);
    }
  }, [hasMore, loadingMore, nextCursor, fetchNotifications]);

  // Mark single as read
  const markAsRead = async (notificationId) => {
    if (!token || !notificationId) return;
    
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      // Optimistic update - apply regardless of response
      setNotifications(prev => prev.map(n => 
        n.id === notificationId ? { ...n, status: 'READ', readAt: new Date().toISOString() } : n
      ));
      setUnreadCount(prev => {
        const next = Math.max(0, prev - 1);
        onUnreadCountChange?.(next);
        return next;
      });
      
      if (!res.ok) {
        console.warn('Mark as read failed:', res.status);
      }
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    if (!token) return;
    
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/notifications/read-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      // Optimistic update
      setNotifications(prev => prev.map(n => ({ ...n, status: 'READ', readAt: new Date().toISOString() })));
      setUnreadCount(0);
      onUnreadCountChange?.(0);
      
      if (res.ok) {
        toast.success('All notifications marked as read');
      } else {
        toast.error('Failed to mark all as read');
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  const navigateOnce = useCallback((url) => {
    if (typeof url !== 'string' || !url.startsWith('/')) return;
    const now = Date.now();
    const prev = lastNavRef.current;
    if (prev.url === url && now - prev.at < 1000) return;
    lastNavRef.current = { url, at: now };
    navigate(url);
  }, [navigate]);

  // Handle notification click
  const handleNotificationClick = async (notification) => {
    let meta = notification.meta;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch (_) {
        meta = null;
      }
    }
    if (meta && typeof meta === 'object' && typeof meta.url === 'string' && meta.url.startsWith('/')) {
      if (notification.status === 'UNREAD') {
        markAsRead(notification.id);
      }
      onClose();
      navigateOnce(meta.url);
      return;
    }

    if (notification.status === 'UNREAD') {
      markAsRead(notification.id);
    }

    if (notification.type === 'DAILY_JOURNAL') {
      onClose();
      navigateOnce('/journal');
      return;
    }
    if (notification.type === 'FRIEND_REQUEST') {
      onClose();
      navigateOnce('/friends');
      return;
    }
    if (notification.type === 'CHANNEL_ACTIVITY') {
      onClose();
      if (notification.channelId) {
        const mid = notification.messageId || '';
        navigateOnce(
          `/community/${encodeURIComponent(String(notification.channelId))}${
            mid ? `?jump=${encodeURIComponent(String(mid))}` : ''
          }`
        );
      } else {
        navigateOnce('/community');
      }
      return;
    }
    if ((notification.type === 'MENTION' || notification.type === 'REPLY') && notification.messageId) {
      onClose();
      if (notification.channelId === 0 || notification.channelId === '0') {
        if (isAdmin(user) && notification.title?.toLowerCase().includes('from user')) {
          navigateOnce(`/admin/inbox?thread=${notification.messageId}`);
        } else {
          navigateOnce(`/messages?thread=${encodeURIComponent(String(notification.messageId))}`);
        }
      } else if (notification.channelId) {
        navigateOnce(
          `/community/${encodeURIComponent(String(notification.channelId))}?jump=${encodeURIComponent(
            String(notification.messageId)
          )}`
        );
      }
    }
  };

  // Accept friend request
  const handleAcceptRequest = async (notification, e) => {
    e.stopPropagation();
    if (!notification.friendRequestId || processingIds.has(notification.id)) return;
    
    setProcessingIds(prev => new Set([...prev, notification.id]));
    
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ requestId: notification.friendRequestId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setNotifications(prev => prev.map(n => 
          n.id === notification.id ? { ...n, actionStatus: 'ACCEPTED' } : n
        ));
        toast.success('Friend request accepted!');
      } else {
        toast.error(data.message || 'Failed to accept request');
      }
    } catch (error) {
      console.error('Failed to accept friend request:', error);
      toast.error('Failed to accept request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(notification.id);
        return next;
      });
    }
  };

  // Decline friend request
  const handleDeclineRequest = async (notification, e) => {
    e.stopPropagation();
    if (!notification.friendRequestId || processingIds.has(notification.id)) return;
    
    setProcessingIds(prev => new Set([...prev, notification.id]));
    
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/friends/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ requestId: notification.friendRequestId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setNotifications(prev => prev.map(n => 
          n.id === notification.id ? { ...n, actionStatus: 'DECLINED' } : n
        ));
        toast.info('Friend request declined');
      } else {
        toast.error(data.message || 'Failed to decline request');
      }
    } catch (error) {
      console.error('Failed to decline friend request:', error);
      toast.error('Failed to decline request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(notification.id);
        return next;
      });
    }
  };

  if (!isOpen) return null;

  // Get position from anchor
  const anchorRect = anchorRef?.current?.getBoundingClientRect();
  const dropdownStyle = anchorRect ? {
    top: anchorRect.bottom + 10,
    right: window.innerWidth - anchorRect.right
  } : { top: 60, right: 20 };

  const dropdownContent = (
    <div className="notifications-dropdown-overlay" onClick={onClose}>
      <div 
        className="notifications-dropdown"
        style={dropdownStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="notifications-header">
          <div className="notifications-title">
            <FaBell className="notifications-icon" />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="unread-badge">{unreadCount}</span>
            )}
          </div>
          <div className="notifications-actions">
            {unreadCount > 0 && (
              <button 
                className="mark-all-read-btn"
                onClick={markAllAsRead}
                title="Mark all as read"
              >
                <FaCheck /> Mark all read
              </button>
            )}
            <button className="close-btn" onClick={onClose}>
              <FaTimes />
            </button>
          </div>
        </div>

        {/* List */}
        <div 
          className="notifications-list"
          ref={listRef}
          onScroll={handleScroll}
        >
          {loading ? (
            <div className="notifications-loading">
              <FaSpinner className="spinner" />
              <span>Loading notifications...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="notifications-empty">
              <FaBell className="empty-icon" />
              {(listFetchFailed || (unreadCount > 0)) ? (
                <>
                  <span>Couldn&apos;t load notifications</span>
                  <button
                    type="button"
                    className="notifications-retry-btn"
                    onClick={() => {
                      listRetryRef.current = 0;
                      fetchNotifications();
                    }}
                  >
                    Tap to retry
                  </button>
                </>
              ) : (
                <span>No notifications yet</span>
              )}
            </div>
          ) : (
            <>
              {notifications.map((notification) => {
                const Icon = TYPE_ICONS[notification.type] || FaBell;
                const color = TYPE_COLORS[notification.type] || '#eaa960';
                const isUnread = notification.status === 'UNREAD';
                const isProcessing = processingIds.has(notification.id);
                const isFriendRequest = notification.type === 'FRIEND_REQUEST';
                const isPending = notification.actionStatus === 'PENDING';
                const isAccepted = notification.actionStatus === 'ACCEPTED';
                const isDeclined = notification.actionStatus === 'DECLINED';
                
                return (
                  <div
                    key={notification.id}
                    className={`notification-item ${isUnread ? 'unread' : ''}`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    {/* Icon */}
                    <div
                      className="notification-icon"
                      style={{
                        backgroundColor: `${color}24`,
                        color,
                        borderColor: `${color}44`
                      }}
                    >
                      <Icon />
                    </div>
                    
                    {/* Content */}
                    <div className="notification-content">
                      <div className="notification-header">
                        <span className="notification-title">{notification.title}</span>
                        <span className="notification-time">
                          {formatRelativeTime(notification.createdAt)}
                        </span>
                      </div>
                      
                      {notification.body && (
                        <div className="notification-body">{notification.body}</div>
                      )}
                      
                      {/* Friend request actions */}
                      {isFriendRequest && (
                        <div className="notification-actions">
                          {isPending ? (
                            <>
                              <button
                                className="action-btn accept"
                                onClick={(e) => handleAcceptRequest(notification, e)}
                                disabled={isProcessing}
                              >
                                {isProcessing ? <FaSpinner className="spinner" /> : <FaCheck />}
                                Accept
                              </button>
                              <button
                                className="action-btn decline"
                                onClick={(e) => handleDeclineRequest(notification, e)}
                                disabled={isProcessing}
                              >
                                <FaDecline />
                                Decline
                              </button>
                            </>
                          ) : isAccepted ? (
                            <span className="action-status accepted">
                              <FaUserCheck /> Friends
                            </span>
                          ) : isDeclined ? (
                            <span className="action-status declined">
                              <FaUserTimes /> Declined
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                    
                    {/* Unread indicator */}
                    {isUnread && <div className="unread-dot" style={{ backgroundColor: color }} />}
                  </div>
                );
              })}
              
              {loadingMore && (
                <div className="loading-more">
                  <FaSpinner className="spinner" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  // Render to portal
  return createPortal(dropdownContent, document.body);
};

export default NotificationsDropdown;
