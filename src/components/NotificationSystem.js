import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FaBell, FaTimes, FaEnvelope, FaAt } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { ensureWebPushSubscription } from '../utils/ensureWebPushSubscription';
import { appNavigate } from '../utils/appNavigate';
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
            // Permission alone is not enough — ensure subscription is registered server-side.
            await ensureWebPushSubscription();
            toast.success('Alerts enabled — you will get system notifications for new messages (muted channels stay silent).');
        } else if (result === 'denied') {
            toast.warn('Notifications are blocked. Enable them in your browser or device settings for AURA TERMINAL™.');
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

function getStoredUserId() {
    try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        return u.id != null ? String(u.id) : null;
    } catch (_) {
        return null;
    }
}

function formatShortTime() {
    try {
        return new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch (_) {
        return '';
    }
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
    const { showSystem = true, silent = false, dedupeKey: dedupeKeyOpt } = options || {};
    try {
        const me = getStoredUserId();
        const isMessageLike = type === 'message' || type === 'mention' || type === 'dm';
        if (isMessageLike) {
            if (userId == null || userId === undefined) return;
            if (me != null && String(userId) !== String(me)) return;
        }

        const dedupeKey =
            dedupeKeyOpt ||
            (link && message ? `${type}:${link}:${String(message).slice(0, 40)}` : `${type}:${Date.now()}`);
        if (typeof sessionStorage !== 'undefined' && dedupeKey) {
            const sk = `aura_nd_${dedupeKey}`;
            const now = Date.now();
            const prev = parseInt(sessionStorage.getItem(sk) || '0', 10);
            if (prev && now - prev < 45000) return;
            sessionStorage.setItem(sk, String(now));
        }

        const detail = { type, title, message, link, userId, showSystem, silent };
        window.dispatchEvent(new CustomEvent('newNotification', { detail }));

        if (silent) {
            window.dispatchEvent(new Event('aura-notifications-refresh'));
            return;
        }

        const canSystem =
            showSystem &&
            typeof window !== 'undefined' &&
            'Notification' in window &&
            Notification.permission === 'granted';
        const tabHidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';

        if (canSystem && tabHidden && isMessageLike) {
            try {
                new Notification(title, {
                    body: message || '',
                    icon: '/icons/icon-192.png',
                    badge: '/icons/icon-192.png',
                    tag: `aura-${type}-${dedupeKey}`.slice(0, 64),
                    renotify: type === 'mention',
                });
            } catch (_) {
                /* some platforms throw if Notification options unsupported */
            }
            window.dispatchEvent(new Event('aura-notifications-refresh'));
            return;
        }

        if (isMessageLike) {
            const snippet = message ? `${String(message).slice(0, 100)}${String(message).length > 100 ? '…' : ''}` : '';
            const timeLine = formatShortTime();
            toast.info(
                <div
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && link) appNavigate(link);
                    }}
                    style={{ cursor: link ? 'pointer' : 'default' }}
                    onClick={() => {
                        if (link) appNavigate(link);
                    }}
                >
                    <strong style={{ display: 'block', marginBottom: 4 }}>{title}</strong>
                    <span style={{ fontSize: '0.92em', opacity: 0.9 }}>{snippet}</span>
                    {timeLine ? (
                        <div style={{ fontSize: '0.75em', opacity: 0.65, marginTop: 6 }}>{timeLine}</div>
                    ) : null}
                </div>,
                {
                    autoClose: 6500,
                    toastId: `aura-inapp-${dedupeKey}`.slice(0, 120),
                    onClick: () => {
                        if (link) appNavigate(link);
                    },
                }
            );
            window.dispatchEvent(new Event('aura-notifications-refresh'));
        }
    } catch (error) {
        console.error('Error triggering notification:', error);
    }
};

if (typeof window !== 'undefined') {
    try {
        if (/\be2eNotify=1\b/.test(window.location.search || '')) {
            window.__AURA_E2E_TRIGGER__ = triggerNotification;
        }
    } catch (_) {
        /* ignore */
    }
}

const NotificationSystem = ({ user, onNotificationClick, headless = false }) => {
    const { t } = useTranslation();
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
                title: event.detail.title || t('notifications.system.newNotification'),
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

        if (minutes < 1) return t('notifications.time.justNow');
        if (minutes < 60) return t('notifications.time.minutesAgo', { count: minutes });
        if (hours < 24) return t('notifications.time.hoursAgo', { count: hours });
        if (days < 7) return t('notifications.time.daysAgo', { count: days });
        return date.toLocaleDateString();
    };

    if (headless) return null;

    return (
        <div className="notification-container" ref={notificationRef}>
            <button className="notification-bell" onClick={() => setIsOpen(!isOpen)} aria-label={t('notifications.title')}>
                <FaBell />
                {unreadCount > 0 && (
                    <span className="notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>{t('notifications.title')}</h3>
                        {unreadCount > 0 && (
                            <button onClick={markAllAsRead} className="mark-all-read">
                                {t('notifications.markAllAsRead')}
                            </button>
                        )}
                        <button onClick={() => setIsOpen(false)} className="close-notifications">
                            <FaTimes />
                        </button>
                    </div>
                    <div className="notification-list">
                        {notifications.length === 0 ? (
                            <div className="no-notifications">{t('notifications.noneYet')}</div>
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
