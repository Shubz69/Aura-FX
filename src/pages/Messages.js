import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Messages.css';
import BinaryBackground from '../components/BinaryBackground';
import { FaPaperPlane, FaArrowLeft } from 'react-icons/fa';

const Messages = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        // Load messages from localStorage or create initial welcome message
        const savedMessages = localStorage.getItem(`messages_${user.id}`);
        if (savedMessages) {
            setMessages(JSON.parse(savedMessages));
        } else {
            // Initial welcome message from Admin
            const welcomeMessages = [
                {
                    id: 1,
                    sender: 'admin',
                    senderName: 'Admin',
                    content: `👋 Welcome to The Glitch, ${user.username || user.name || 'there'}! I'm here to help you with anything you need.`,
                    timestamp: new Date().toISOString(),
                    read: false
                },
                {
                    id: 2,
                    sender: 'admin',
                    senderName: 'Admin',
                    content: 'Feel free to ask any questions about our platform, courses, or trading strategies. Our admin team will respond to your messages within 24 hours.',
                    timestamp: new Date().toISOString(),
                    read: false
                }
            ];
            setMessages(welcomeMessages);
            localStorage.setItem(`messages_${user.id}`, JSON.stringify(welcomeMessages));
        }
    }, [user, navigate]);

    useEffect(() => {
        // Scroll to bottom when messages change
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!newMessage.trim()) return;

        const newMsg = {
            id: messages.length + 1,
            sender: 'user',
            senderName: user.username || user.name || 'You',
            content: newMessage,
            timestamp: new Date().toISOString(),
            read: true
        };

        const updatedMessages = [...messages, newMsg];
        setMessages(updatedMessages);
        localStorage.setItem(`messages_${user.id}`, JSON.stringify(updatedMessages));
        setNewMessage('');

        // Send message to admin backend (shubzfx@gmail.com will receive notification)
        // In production, this would trigger an email/notification to the admin
        console.log('Message sent to admin:', newMsg);
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
            <BinaryBackground />
            <div className="messages-page-container">
                <div className="messages-page-header">
                    <button className="back-button" onClick={() => navigate(-1)}>
                        <FaArrowLeft /> Back
                    </button>
                    <div className="chat-partner-info">
                        <div className="admin-avatar">
                            <span>A</span>
                        </div>
                        <div className="admin-details">
                            <h2>Admin</h2>
                            <p className="admin-status">
                                <span className="status-dot online"></span>
                                Available to help
                            </p>
                        </div>
                    </div>
                </div>

                <div className="messages-page-content">
                    <div className="messages-list">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`message-bubble ${msg.sender === 'user' ? 'user-message' : 'admin-message'}`}
                            >
                                <div className="message-header">
                                    <span className="message-sender">
                                        {msg.sender === 'admin' ? 'Admin' : 'You'}
                                    </span>
                                    <span className="message-time">{formatTime(msg.timestamp)}</span>
                                </div>
                                <div className="message-content">{msg.content}</div>
                            </div>
                        ))}
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

