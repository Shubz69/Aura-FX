import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Messages.css';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';
import { FaPaperPlane, FaArrowLeft, FaShieldAlt, FaCheckCircle } from 'react-icons/fa';
import Api from '../services/Api';
import { logClassifiedError } from '../utils/apiObservability';
import WebSocketService from '../services/WebSocketService';

const Messages = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);
    const messagesContainerRef = useRef(null);
    const isFirstLoad = useRef(true);
    const prevMessagesLength = useRef(0);
    const threadIdRef = useRef(null);
    const loadInFlightRef = useRef(false);
    const isRealtimeConnectedRef = useRef(false);
    const lastRealtimeReceiveAtRef = useRef(0);
    const [threadId, setThreadId] = useState(null);

    const loadMessages = useCallback(async () => {
        if (!user || loadInFlightRef.current) return;
        loadInFlightRef.current = true;
        try {
            let threadId = threadIdRef.current;
            if (!threadId) {
                const threadResponse = await Api.ensureAdminThread(user.id);
                threadId = threadResponse.data?.thread?.id || null;
                threadIdRef.current = threadId;
                setThreadId(threadId);
            }
            if (threadId) {
                const messagesResponse = await Api.getThreadMessages(threadId, {
                    limit: 50,
                    _sync: Date.now(),
                });
                const apiMessages = messagesResponse.data?.messages || [];
                const formattedMessages = apiMessages.map(msg => ({
                    id: msg.id,
                    sender: String(msg.senderId) === String(user.id) ? 'user' : 'admin',
                    senderName: String(msg.senderId) === String(user.id) ? (user.username || user.name || 'You') : 'Admin',
                    content: msg.body,
                    timestamp: msg.createdAt || msg.created_at,
                    read: !!msg.readAt || !!msg.read_at
                }));
                setMessages(formattedMessages);
                await Api.markThreadRead(threadId).catch(() => {});
            } else {
                const savedMessages = localStorage.getItem(`messages_${user.id}`);
                if (savedMessages) setMessages(JSON.parse(savedMessages));
            }
        } catch (error) {
            logClassifiedError('messages.page_load', error, { userId: user?.id || null });
            // Only hydrate from localStorage when we never established a server thread.
            // Otherwise a transient GET error would clobber in-memory admin messages (localStorage is user-send only).
            if (!threadIdRef.current) {
                const savedMessages = localStorage.getItem(`messages_${user.id}`);
                if (savedMessages) setMessages(JSON.parse(savedMessages));
            }
        } finally {
            loadInFlightRef.current = false;
        }
    }, [user]);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        loadMessages();
        return undefined;
    }, [user, navigate, loadMessages]);

    useEffect(() => {
        if (!user?.id || !threadId) return undefined;
        let mounted = true;

        const wireRealtime = () => {
            WebSocketService.offThreadEvents();
            WebSocketService.joinThread(threadId);
            WebSocketService.onThreadMessage(async ({ threadId: incomingThreadId, message }) => {
                if (!mounted || String(incomingThreadId) !== String(threadId)) return;
                const createdAt = message?.createdAt || message?.created_at || null;
                const latencyMs = createdAt ? Date.now() - new Date(createdAt).getTime() : null;
                lastRealtimeReceiveAtRef.current = Date.now();
                console.info('[observability]', {
                    scope: 'messages.realtime_receive',
                    threadId,
                    latencyMs: Number.isFinite(latencyMs) ? latencyMs : null,
                });
                setMessages((prev) => {
                    const mid =
                        message?.id != null
                            ? message.id
                            : `rt_${Date.now()}_${String(message?.body || '').slice(0, 12)}`;
                    const normalized = {
                        id: mid,
                        sender: String(message.senderId) === String(user.id) ? 'user' : 'admin',
                        senderName: String(message.senderId) === String(user.id) ? (user.username || user.name || 'You') : 'Admin',
                        content: message.body,
                        timestamp: message.createdAt || message.created_at,
                        read: !!message.readAt || !!message.read_at,
                    };
                    return prev.some((m) => String(m.id) === String(normalized.id)) ? prev : [...prev, normalized];
                });
                await Api.markThreadRead(threadId).catch(() => {});
            });
            WebSocketService.onThreadRead(() => {});
        };

        WebSocketService.connect({ userId: user.id, role: user.role }, () => {
            if (!mounted) return;
            isRealtimeConnectedRef.current = Boolean(WebSocketService.isConnected);
            if (isRealtimeConnectedRef.current) {
                console.info('[observability]', { scope: 'messages.realtime_connected', threadId });
                wireRealtime();
                void loadMessages();
            }
        });

        return () => {
            mounted = false;
            isRealtimeConnectedRef.current = false;
            lastRealtimeReceiveAtRef.current = 0;
            WebSocketService.offThreadEvents();
        };
    }, [user?.id, user?.role, user?.name, user?.username, threadId, loadMessages]);

    useEffect(() => {
        if (!user?.id) return undefined;
        const onVisible = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                void loadMessages();
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [user?.id, loadMessages]);

    useEffect(() => {
        if (!user?.id) return undefined;
        const pollInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            loadMessages();
        }, 1500);
        return () => clearInterval(pollInterval);
    }, [user?.id, loadMessages]);

    // Control scrolling behavior
    useEffect(() => {
        // Don't scroll on first load
        if (isFirstLoad.current) {
            isFirstLoad.current = false;
            return;
        }

        // Check if new messages were added
        const hasNewMessages = messages.length > prevMessagesLength.current;
        
        // Only auto-scroll if:
        // 1. There are new messages AND
        // 2. The user was already at the bottom OR it's a new message from the current user
        if (hasNewMessages && messagesContainerRef.current) {
            const container = messagesContainerRef.current;
            const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
            
            // Get the last message
            const lastMessage = messages[messages.length - 1];
            
            // Scroll if user was at bottom OR if the new message is from the user (optimistic update)
            if (isAtBottom || (lastMessage && lastMessage.sender === 'user')) {
                setTimeout(() => {
                    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
        }
        
        prevMessagesLength.current = messages.length;
    }, [messages]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const newMsg = {
            id: `temp_${Date.now()}`,
            sender: 'user',
            senderName: user.username || user.name || 'You',
            content: newMessage,
            timestamp: new Date().toISOString(),
            read: true
        };

        // Optimistic update
        const updatedMessages = [...messages, newMsg];
        setMessages(updatedMessages);
        localStorage.setItem(`messages_${user.id}`, JSON.stringify(updatedMessages));
        setNewMessage('');

        // Send message to admin via API
        try {
            const threadResponse = await Api.ensureAdminThread(user.id);
            const threadId = threadResponse.data?.thread?.id;
            
            if (threadId) {
                await Api.sendThreadMessage(threadId, newMessage);
                const messagesResponse = await Api.getThreadMessages(threadId, {
                    limit: 50,
                    _sync: Date.now(),
                });
                const apiMessages = messagesResponse.data?.messages || [];
                const formattedMessages = apiMessages.map(msg => ({
                    id: msg.id,
                    sender: String(msg.senderId) === String(user.id) ? 'user' : 'admin',
                    senderName: String(msg.senderId) === String(user.id) ? (user.username || user.name || 'You') : 'Admin',
                    content: msg.body,
                    timestamp: msg.createdAt || msg.created_at,
                    read: !!msg.readAt || !!msg.read_at
                }));
                setMessages(formattedMessages);
            }
        } catch (error) {
            logClassifiedError('messages.page_send', error, { userId: user?.id || null, threadId: threadIdRef.current });
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

    const getDateLabel = (timestamp) => {
        const d = new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const key = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        if (key(d) === key(today)) return 'Today';
        if (key(d) === key(yesterday)) return 'Yesterday';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const messagesWithDateGroups = useMemo(() => {
        if (!messages.length) return [];
        const groups = new Map();
        for (const msg of messages) {
            const ts = msg.timestamp ? new Date(msg.timestamp) : new Date();
            const dateKey = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}`;
            if (!groups.has(dateKey)) {
                groups.set(dateKey, { label: getDateLabel(msg.timestamp), messages: [] });
            }
            groups.get(dateKey).messages.push(msg);
        }
        const sortedKeys = [...groups.keys()].sort();
        return sortedKeys.flatMap((dateKey) => {
            const { label, messages: dayMessages } = groups.get(dateKey);
            return [{ type: 'date', label, dateKey }, ...dayMessages.map((m) => ({ type: 'message', message: m }))];
        });
    }, [messages]);

    return (
        <AuraTerminalThemeShell>
            <div className="messages-page-container journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
                <div className="messages-page-header">
                    <button className="back-button" onClick={() => navigate(-1)}>
                        <FaArrowLeft /> Back
                    </button>
                    <div className="chat-partner-info">
                        <div className="admin-avatar">
                            <FaShieldAlt className="admin-icon" />
                        </div>
                        <div className="admin-details">
                            <h2>
                                <span className="admin-badge">Admin</span>
                                <span className="admin-title-text">Support Team</span>
                            </h2>
                            <p className="admin-status">
                                <span className="status-dot online"></span>
                                <span className="status-text">Available to help</span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="messages-page-content">
                    <div 
                        className="messages-list" 
                        ref={messagesContainerRef}
                    >
                        {messages.length === 0 ? (
                            <div className="empty-messages-state">
                                <div className="empty-icon-wrapper">
                                    <FaShieldAlt className="empty-icon" />
                                </div>
                                <h3>Start a conversation</h3>
                                <p>Send a message to our admin team and we'll get back to you as soon as possible.</p>
                            </div>
                        ) : (
                            messagesWithDateGroups.map((item, index) =>
                                item.type === 'date' ? (
                                    <div key={`date-${item.dateKey}`} className="messages-date-separator">
                                        <span className="messages-date-separator-label">{item.label}</span>
                                    </div>
                                ) : (
                                    <div
                                        key={item.message.id}
                                        className={`message-bubble ${item.message.sender === 'user' ? 'user-message' : 'admin-message'}`}
                                    >
                                        <div className="message-header">
                                            <div className="message-sender-wrapper">
                                                <span className="message-sender">
                                                    {item.message.sender === 'admin' ? (
                                                        <>
                                                            <FaShieldAlt className="sender-icon" />
                                                            Admin
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="sender-you-icon">You</span>
                                                        </>
                                                    )}
                                                </span>
                                                {item.message.read && item.message.sender === 'user' && (
                                                    <FaCheckCircle className="read-indicator" />
                                                )}
                                            </div>
                                            <span className="message-time">{formatTime(item.message.timestamp)}</span>
                                        </div>
                                        <div className="message-content">{item.message.content}</div>
                                    </div>
                                )
                            )
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <form className="message-input-form" onSubmit={handleSendMessage}>
                        <div className="message-input-container">
                            <input
                                type="text"
                                className="message-input"
                                value={newMessage}
                                onChange={(e) => setNewMessage(e.target.value)}
                                placeholder="Type your message to Admin..."
                            />
                            <button type="submit" className="send-button" disabled={!newMessage.trim()}>
                                <FaPaperPlane />
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </AuraTerminalThemeShell>
    );
};

export default Messages;