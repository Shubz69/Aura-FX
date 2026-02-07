import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Messages.css';
import CosmicBackground from '../components/CosmicBackground';
import { FaPaperPlane, FaArrowLeft, FaShieldAlt, FaCheckCircle } from 'react-icons/fa';
import Api from '../services/Api';

const Messages = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);

    const loadMessages = React.useCallback(async () => {
        if (!user) return;
        try {
            const threadResponse = await Api.ensureAdminThread();
            const threadId = threadResponse.data?.thread?.id;
            if (threadId) {
                const messagesResponse = await Api.getThreadMessages(threadId, { limit: 50 });
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
            } else {
                const savedMessages = localStorage.getItem(`messages_${user.id}`);
                if (savedMessages) setMessages(JSON.parse(savedMessages));
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            const savedMessages = localStorage.getItem(`messages_${user.id}`);
            if (savedMessages) setMessages(JSON.parse(savedMessages));
        }
    }, [user]);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }
        loadMessages();
        const pollInterval = setInterval(loadMessages, 3000);
        return () => clearInterval(pollInterval);
    }, [user, navigate, loadMessages]);

    useEffect(() => {
        // Scroll to bottom when messages change
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
            // Ensure admin thread exists
            const threadResponse = await Api.ensureAdminThread();
            const threadId = threadResponse.data?.thread?.id;
            
            if (threadId) {
                // Send message to thread
                await Api.sendThreadMessage(threadId, newMessage);
                // Reload messages to get server response
                const messagesResponse = await Api.getThreadMessages(threadId, { limit: 50 });
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
            console.error('Error sending message to admin:', error);
            // Message is still saved locally, so user can see it
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
        <>
            <CosmicBackground />
            <div className="messages-page-container">
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
                                Support Team
                            </h2>
                            <p className="admin-status">
                                <span className="status-dot online"></span>
                                <span className="status-text">Available to help</span>
                            </p>
                        </div>
                    </div>
                </div>

                <div className="messages-page-content">
                    <div className="messages-list">
                        {messages.length === 0 ? (
                            <div className="empty-messages-state">
                                <div className="empty-icon-wrapper">
                                    <FaShieldAlt className="empty-icon" />
                                </div>
                                <h3>Start a conversation</h3>
                                <p>Send a message to our admin team and we'll get back to you as soon as possible.</p>
                            </div>
                        ) : (
                            messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`message-bubble ${msg.sender === 'user' ? 'user-message' : 'admin-message'}`}
                                >
                                    <div className="message-header">
                                        <div className="message-sender-wrapper">
                                            <span className="message-sender">
                                                {msg.sender === 'admin' ? (
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
                                            {msg.read && msg.sender === 'user' && (
                                                <FaCheckCircle className="read-indicator" />
                                            )}
                                        </div>
                                        <span className="message-time">{formatTime(msg.timestamp)}</span>
                                    </div>
                                    <div className="message-content">{msg.content}</div>
                                </div>
                            ))
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
        </>
    );
};

export default Messages;

