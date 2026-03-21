import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBell, FaTimes, FaEnvelope, FaAt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import '../styles/NotificationSystem.css';

/**
 * Request OS-level notification permission (must be called from a user gesture on many browsers, especially iOS).
 * @returns {Promise<NotificationPermission>}
 */
export async function requestCommunityMessageAlerts() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        toast.info('This browser does not support notifications.');
        return 'denied';
    }
    try {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
            toast.success('Alerts enabled — you will get system notifications for new messages (muted channels stay silent).');
        } else if (result === 'denied') {
            toast.warn('Notifications are blocked. Enable them in your browser or device settings for AURA TERMINAL.');
        }
        window.dispatchEvent(new Event('aura-notification-permission-change'));
        return result;
    } catch (e) {
        toast.error('Could not request notification permission.');
        return 'denied';
    }
}

export function getNotificationPermission() {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    return Notification.permission;
}

/**
 * @param {string} type - 'message' | 'mention' | 'dm' | etc.
 * @param {string} title
 * @param {string} message
 * @param {string|null} link
 * @param {string|number|null} userId - when set, only this user's session should handle the event (see legacy listeners)
 * @param {{ showSystem?: boolean, silent?: boolean }} [options] - silent: no UI at all; showSystem: OS notification when permitted
 */
export const triggerNotification = (type, title, message, link = null, userId = null, options = {}) => {
    const { showSystem = true, silent = false } = options || {};
    try {
        const detail = { type, title, message, link, userId, showSystem };
        window.dispatchEvent(new CustomEvent('newNotification', { detail }));

        if (silent) return;

        const canSystem =
            showSystem &&
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted';

        if (canSystem) {
            try {
                const isMessageLike = type === 'message' || type === 'mention' || type === 'dm';
                new Notification(title, {
                    body: message || '',
                    icon: '/aura_logo.png',
                    badge: '/logos/a7-logo.png',
                    tag: isMessageLike ? `aura-community-${type}` : `aura-${type}-${Date.now()}`,
                    renotify: type === 'mention',
                });
            } catch (_) {
                /* some platforms throw if Notification options unsupported */
            }
            return;
        }

        if ((type === 'message' || type === 'mention' || type === 'dm') && !silent) {
            const snippet = message ? `${String(message).slice(0, 100)}${String(message).length > 100 ? '…' : ''}` : '';
            toast.info(
                <div>
                    <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
                    <span style={{ fontSize: '0.92em', opacity: 0.9 }}>{snippet}</span>
                </div>,
                { autoClose: 5000, toastId: 'aura-community-inapp' }
            );
        }
    } catch (error) {
        console.error('Error triggering notification:', error);
    }
};

const NotificationSystem = ({ user, onNotificationClick }) => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const notificationRef = useRef(null);

    useEffect(() => {
        const savedNotifications = localStorage.getItem(`notifications_${user?.id}`);
        if (savedNotifications) {
            const parsed = JSON.parse(savedNotifications);
            setNotifications(parsed);
            setUnreadCount(parsed.filter((n) => !n.read).length);
        }

        const handleNotification = (event) => {
            const notificationUserId = event.detail.userId;

            if (
                notificationUserId !== null &&
                notificationUserId !== undefined &&
                String(notificationUserId) !== String(user?.id)
            ) {
                return;
            }

            const newNotification = {
                id: Date.now(),
                type: event.detail.type || 'message',
                title: event.detail.title || 'New Notification',
                message: event.detail.message || '',
                timestamp: new Date().toISOString(),
                read: false,
                link: event.detail.link || null,
                userId: notificationUserId || null,
            };

            setNotifications((prev) => {
                const updated = [newNotification, ...prev].slice(0, 50);
                localStorage.setItem(`notifications_${user?.id}`, JSON.stringify(updated));
                return updated;
            });
            setUnreadCount((prev) => prev + 1);
        };

        window.addEventListener('newNotification', handleNotification);

        return () => {
            window.removeEventListener('newNotification', handleNotification);
        };
    }, [user]);

    const markAsRead = (notificationId) => {
        setNotifications((prev) => {
            const updated = prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
            localStorage.setItem(`notifications_${user?.id}`, JSON.stringify(updated));
            return updated;
        });
        setUnreadCount((prev) => Math.max(0, prev - 1));
    };

    const markAllAsRead = () => {
        setNotifications((prev) => {
            const updated = prev.map((n) => ({ ...n, read: true }));
            localStorage.setItem(`notifications_${user?.id}`, JSON.stringify(updated));
            return updated;
        });
        setUnreadCount(0);
    };

    const handleNotificationClick = (notification) => {
        markAsRead(notification.id);
        setIsOpen(false);

        if (notification.link) {
            if (notification.link.startsWith('/')) {
                navigate(notification.link, { replace: false });
            } else if (onNotificationClick) {
                onNotificationClick(notification.link);
            }
        }
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'mention':
                return <FaAt />;
            case 'dm':
                return <FaEnvelope />;
            default:
                return <FaBell />;
        }
    };

    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString();
    };

    return (
        <div className="notification-container" ref={notificationRef}>
            <button className="notification-bell" onClick={() => setIsOpen(!isOpen)} aria-label="Notifications">
                <FaBell />
                {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Notifications</h3>
                        {unreadCount > 0 && (
                            <button onClick={markAllAsRead} className="mark-all-read">
                                Mark all as read
                            </button>
                        )}
                        <button onClick={() => setIsOpen(false)} className="close-notifications">
                            <FaTimes />
                        </button>
                    </div>
                    <div className="notification-list">
                        {notifications.length === 0 ? (
                            <div className="no-notifications">No notifications</div>
                        ) : (
                            notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <div className="notification-icon">{getNotificationIcon(notification.type)}</div>
                                    <div className="notification-content">
                                        <div className="notification-title">{notification.title}</div>
                                        <div className="notification-message">{notification.message}</div>
                                        <div className="notification-time">{formatTime(notification.timestamp)}</div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationSystem;
