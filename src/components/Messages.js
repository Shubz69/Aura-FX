import React, { useState, useEffect } from 'react';
import { FaEnvelope, FaEnvelopeOpen, FaPaperPlane, FaTimes } from 'react-icons/fa';
import '../styles/Messages.css';

const Messages = ({ isOpen, onClose, user }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        // Load messages from localStorage or API
        const savedMessages = localStorage.getItem(`messages_${user?.id}`);
        if (savedMessages) {
            const parsedMessages = JSON.parse(savedMessages);
            setMessages(parsedMessages);
            setUnreadCount(parsedMessages.filter(msg => !msg.read && msg.sender !== 'user').length);
        }
    }, [user?.id]);

    const sendMessage = () => {
        if (!newMessage.trim()) return;

        const message = {
            id: Date.now(),
            text: newMessage,
            sender: 'user',
            timestamp: new Date().toISOString(),
            read: true
        };

        const updatedMessages = [...messages, message];
        setMessages(updatedMessages);
        localStorage.setItem(`messages_${user?.id}`, JSON.stringify(updatedMessages));
        setNewMessage('');

        // Simulate admin response after 2 seconds
        setTimeout(() => {
            const adminResponse = {
                id: Date.now() + 1,
                text: "Thank you for your message! We'll get back to you soon.",
                sender: 'admin',
                timestamp: new Date().toISOString(),
                read: false
            };

            const finalMessages = [...updatedMessages, adminResponse];
            setMessages(finalMessages);
            setUnreadCount(prev => prev + 1);
            localStorage.setItem(`messages_${user?.id}`, JSON.stringify(finalMessages));
        }, 2000);
    };

    const markAsRead = (messageId) => {
        const updatedMessages = messages.map(msg => 
            msg.id === messageId ? { ...msg, read: true } : msg
        );
        setMessages(updatedMessages);
        setUnreadCount(updatedMessages.filter(msg => !msg.read && msg.sender !== 'user').length);
        localStorage.setItem(`messages_${user?.id}`, JSON.stringify(updatedMessages));
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (!isOpen) return null;

    return (
        <div className="messages-overlay" onClick={onClose}>
            <div className="messages-container" onClick={(e) => e.stopPropagation()}>
                <div className="messages-header">
                    <h3>Messages</h3>
                    <button className="close-btn" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>

                <div className="messages-list">
                    {messages.length === 0 ? (
                        <div className="no-messages">
                            <FaEnvelope className="no-messages-icon" />
                            <p>No messages yet. Start a conversation!</p>
                        </div>
                    ) : (
                        messages.map((message) => (
                            <div 
                                key={message.id} 
                                className={`message ${message.sender === 'user' ? 'user-message' : 'admin-message'} ${!message.read && message.sender !== 'user' ? 'unread' : ''}`}
                                onClick={() => markAsRead(message.id)}
                            >
                                <div className="message-content">
                                    <div className="message-text">{message.text}</div>
                                    <div className="message-time">{formatTime(message.timestamp)}</div>
                                </div>
                                {!message.read && message.sender !== 'user' && (
                                    <div className="unread-indicator"></div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="messages-input">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type your message..."
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    />
                    <button onClick={sendMessage} disabled={!newMessage.trim()}>
                        <FaPaperPlane />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Messages;
