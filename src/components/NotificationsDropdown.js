import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  FaBell, FaTimes, FaUserPlus, FaReply, FaAt, FaCheck,
  FaTimes as FaDecline, FaCog, FaUserCheck, FaUserTimes,
  FaComments, FaExclamationCircle, FaSpinner
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import '../styles/NotificationsDropdown.css';

// Notification type icons
const TYPE_ICONS = {
  MENTION: FaAt,
  REPLY: FaReply,
  FRIEND_REQUEST: FaUserPlus,
  FRIEND_ACCEPTED: FaUserCheck,
  FRIEND_DECLINED: FaUserTimes,
  SYSTEM: FaCog
};

// Notification type colors
const TYPE_COLORS = {
  MENTION: '#5865F2',
  REPLY: '#00B894',
  FRIEND_REQUEST: '#FFB800',
  FRIEND_ACCEPTED: '#23A55A',
  FRIEND_DECLINED: '#ED4245',
  SYSTEM: '#8B5CF6'
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

// Get avatar path
function getAvatarPath(avatar) {
  if (!avatar) return '/avatars/avatar_ai.png';
  if (avatar.startsWith('data:') || avatar.startsWith('/')) return avatar;
  return `/avatars/${avatar}`;
}

const NotificationsDropdown = ({ isOpen, onClose, anchorRef }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [processingIds, setProcessingIds] = useState(new Set());
  
  const listRef = useRef(null);
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const baseUrl = window.location.origin;

  // Fetch notifications
  const fetchNotifications = useCallback(async (cursor = null, append = false) => {
    if (!token) return;
    
    try {
      if (append) setLoadingMore(true);
      else setLoading(true);
      
      const params = new URLSearchParams();
      if (cursor) params.append('cursor', cursor);
      params.append('limit', '20');
      
      const response = await fetch(`${baseUrl}/api/notifications?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (append) {
          setNotifications(prev => [...prev, ...data.items]);
        } else {
          setNotifications(data.items);
        }
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, baseUrl]);

  // Load on open
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
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
    if (!token) return;
    
    try {
      await fetch(`${baseUrl}/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setNotifications(prev => prev.map(n => 
        n.id === notificationId ? { ...n, status: 'READ', readAt: new Date().toISOString() } : n
      ));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    if (!token) return;
    
    try {
      await fetch(`${baseUrl}/api/notifications/read-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      setNotifications(prev => prev.map(n => ({ ...n, status: 'READ', readAt: new Date().toISOString() })));
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification) => {
    // Mark as read optimistically
    if (notification.status === 'UNREAD') {
      markAsRead(notification.id);
    }
    
    // Handle message-type notifications (jump to message)
    if ((notification.type === 'MENTION' || notification.type === 'REPLY') && 
        notification.channelId && notification.messageId) {
      onClose();
      
      // Navigate to channel with jump param
      navigate(`/community?channel=${notification.channelId}&jump=${notification.messageId}&focus=1`);
    }
  };

  // Accept friend request
  const handleAcceptRequest = async (notification, e) => {
    e.stopPropagation();
    if (!notification.friendRequestId || processingIds.has(notification.id)) return;
    
    setProcessingIds(prev => new Set([...prev, notification.id]));
    
    try {
      const response = await fetch(`${baseUrl}/api/friends/accept`, {
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
      const response = await fetch(`${baseUrl}/api/friends/decline`, {
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
              <span>No notifications yet</span>
            </div>
          ) : (
            <>
              {notifications.map((notification) => {
                const Icon = TYPE_ICONS[notification.type] || FaBell;
                const color = TYPE_COLORS[notification.type] || '#8B5CF6';
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
                      style={{ backgroundColor: `${color}20`, color }}
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
