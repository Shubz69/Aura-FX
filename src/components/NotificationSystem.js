import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBell, FaTimes, FaEnvelope, FaAt } from 'react-icons/fa';
import '../styles/NotificationSystem.css';

const NotificationSystem = ({ user, onNotificationClick }) => {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const notificationRef = useRef(null);

    useEffect(() => {
        // Load notifications from localStorage
        const savedNotifications = localStorage.getItem(`notifications_${user?.id}`);
        if (savedNotifications) {
            const parsed = JSON.parse(savedNotifications);
            setNotifications(parsed);
            setUnreadCount(parsed.filter(n => !n.read).length);
        }

        // Listen for new notifications via custom events
        const handleNotification = (event) => {
            const notificationUserId = event.detail.userId;
            
            // Only store notification if:
            // 1. userId is null/undefined (global notification for all users)
            // 2. userId matches the current user's ID (notification specifically for this user)
            if (notificationUserId !== null && notificationUserId !== undefined && String(notificationUserId) !== String(user?.id)) {
                // This notification is for a different user, ignore it
                return;
            }
            
            const newNotification = {
                id: Date.now(),
                type: event.detail.type || 'message', // 'message', 'mention', 'dm'
                title: event.detail.title || 'New Notification',
                message: event.detail.message || '',
                timestamp: new Date().toISOString(),
                read: false,
                link: event.detail.link || null,
                userId: notificationUserId || null
            };

            setNotifications(prev => {
                const updated = [newNotification, ...prev].slice(0, 50); // Keep last 50
                localStorage.setItem(`notifications_${user?.id}`, JSON.stringify(updated));
                return updated;
            });
            setUnreadCount(prev => prev + 1);

            // Show browser notification if permission granted
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(newNotification.title, {
                    body: newNotification.message,
                    icon: '/favicon.ico'
                });
            }
        };

        window.addEventListener('newNotification', handleNotification);

        // Request notification permission
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        return () => {
            window.removeEventListener('newNotification', handleNotification);
        };
    }, [user]);

    const markAsRead = (notificationId) => {
        setNotifications(prev => {
            const updated = prev.map(n => 
                n.id === notificationId ? { ...n, read: true } : n
            );
            localStorage.setItem(`notifications_${user?.id}`, JSON.stringify(updated));
            return updated;
        });
        setUnreadCount(prev => Math.max(0, prev - 1));
    };

    const markAllAsRead = () => {
        setNotifications(prev => {
            const updated = prev.map(n => ({ ...n, read: true }));
            localStorage.setItem(`notifications_${user?.id}`, JSON.stringify(updated));
            return updated;
        });
        setUnreadCount(0);
    };

    const handleNotificationClick = (notification) => {
        markAsRead(notification.id);
        setIsOpen(false);
        
        if (notification.link) {
            // Use React Router navigate for SPA navigation
            if (notification.link.startsWith('/')) {
                navigate(notification.link);
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
            <button 
                className="notification-bell"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Notifications"
            >
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
                            notifications.map(notification => (
                                <div
                                    key={notification.id}
                                    className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <div className="notification-icon">
                                        {getNotificationIcon(notification.type)}
                                    </div>
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

// Helper function to trigger notifications from anywhere
export const triggerNotification = (type, title, message, link = null, userId = null) => {
    try {
        const event = new CustomEvent('newNotification', {
            detail: { type, title, message, link, userId }
        });
        window.dispatchEvent(event);
        
        // Also show browser notification if permission granted
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, {
                body: message,
                icon: '/aura_logo.png',
                tag: `notification-${Date.now()}`,
                requireInteraction: false
            });
        }
    } catch (error) {
        console.error('Error triggering notification:', error);
    }
};

export default NotificationSystem;

