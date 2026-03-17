import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/AdminMessages.css';
import AdminApi from '../services/AdminApi';
import Api from '../services/Api';

const ROLE_COLOURS = {
    free: '#6b7280',
    premium: '#8b5cf6',
    elite: '#f59e0b',
    a7fx: '#ec4899',
    admin: '#10b981',
    super_admin: '#ef4444',
};

const AdminMessages = () => {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all'); // 'all' | 'open' | 'dealt'
    const [actionLoading, setActionLoading] = useState({});

    const userRole = user?.role?.toLowerCase() || '';
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';

    const fetchMessages = useCallback(async () => {
        setLoading(true);
        try {
            const response = await AdminApi.getContactMessages();
            setMessages(response.data || []);
            setError(null);
        } catch (err) {
            setError(`Failed to load messages: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user || !isAdmin) {
            setError('Access denied. Admin privileges required.');
            setLoading(false);
            return;
        }
        fetchMessages();
    }, [user, isAdmin, fetchMessages]);

    const markDealt = async (msgId, dealt) => {
        setActionLoading(prev => ({ ...prev, [msgId]: true }));
        try {
            await Api.patchContactMessage(msgId, { dealt_with: dealt });
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, dealtWith: dealt } : m));
        } catch (e) {
            console.error('Failed to update dealt status:', e.message);
        } finally {
            setActionLoading(prev => ({ ...prev, [msgId]: false }));
        }
    };

    if (!user || !isAdmin) {
        return (
            <div className="admin-messages-container">
                <div className="access-denied">
                    <h1 className="glitch-title">ACCESS DENIED</h1>
                    <p>You must be an admin to view this page.</p>
                </div>
            </div>
        );
    }

    const filtered = messages.filter(m => {
        if (filter === 'open') return !m.dealtWith;
        if (filter === 'dealt') return m.dealtWith;
        return true;
    });

    return (
        <div className="admin-messages-container">
            <div className="admin-messages-content">
                <div className="admin-header">
                    <h1 className="glitch-title">CONTACT SUBMISSIONS</h1>
                    <p className="admin-subtitle">Review and manage user contact messages</p>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                    {['all', 'open', 'dealt'].map(f => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            style={{
                                padding: '6px 16px', borderRadius: '6px', cursor: 'pointer',
                                background: filter === f ? '#7c3aed' : 'rgba(255,255,255,0.05)',
                                color: '#fff', border: '1px solid rgba(255,255,255,0.1)',
                                fontWeight: filter === f ? '600' : '400', fontSize: '0.85rem'
                            }}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                            {f === 'open' && <span style={{ marginLeft: 6, background: '#ef4444', borderRadius: 9, padding: '1px 6px', fontSize: '0.75rem' }}>{messages.filter(m => !m.dealtWith).length}</span>}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="loading-container">
                        <div className="loading-spinner"></div>
                        <div className="loading-text">Loading messages...</div>
                    </div>
                ) : error ? (
                    <div className="error-container">
                        <span className="error-icon">⚠️</span>
                        <p className="error-message">{error}</p>
                        <button onClick={fetchMessages} className="retry-btn">Retry</button>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📭</div>
                        <h3>No Messages</h3>
                        <p>{filter === 'dealt' ? 'No dealt messages yet.' : 'No open messages.'}</p>
                    </div>
                ) : (
                    <div className="messages-section">
                        <div className="messages-header">
                            <h3>
                                {filter === 'dealt' ? 'Dealt Messages' : filter === 'open' ? 'Open Messages' : 'All Messages'}
                                <span className="message-count">{filtered.length}</span>
                            </h3>
                        </div>
                        <div className="messages-grid">
                            {filtered.map((msg, index) => (
                                <div
                                    key={msg.id || index}
                                    className="message-card"
                                    style={{ opacity: msg.dealtWith ? 0.65 : 1, border: msg.dealtWith ? '1px solid rgba(16,185,129,0.25)' : undefined }}
                                >
                                    <div className="message-header">
                                        <div className="user-info">
                                            <div className="user-avatar">
                                                <span className="avatar-letter">{msg.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                                            </div>
                                            <div className="user-details">
                                                <div className="user-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {msg.name || 'Anonymous'}
                                                    {msg.userRole && (
                                                        <span style={{
                                                            fontSize: '0.7rem', padding: '1px 7px', borderRadius: 9,
                                                            background: `${ROLE_COLOURS[msg.userRole.toLowerCase()] || '#6b7280'}22`,
                                                            color: ROLE_COLOURS[msg.userRole.toLowerCase()] || '#6b7280',
                                                            border: `1px solid ${ROLE_COLOURS[msg.userRole.toLowerCase()] || '#6b7280'}44`,
                                                            fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em'
                                                        }}>{msg.userRole}</span>
                                                    )}
                                                    {msg.dealtWith && (
                                                        <span style={{ fontSize: '0.7rem', padding: '1px 7px', borderRadius: 9, background: '#10b98122', color: '#10b981', border: '1px solid #10b98144', fontWeight: 600 }}>✓ Dealt</span>
                                                    )}
                                                </div>
                                                <div className="user-email">{msg.email || 'No email'}</div>
                                            </div>
                                        </div>
                                        <div className="message-time">
                                            <span className="time-icon">🕒</span>
                                            {msg.createdAt ? new Date(msg.createdAt).toLocaleString() : 'N/A'}
                                        </div>
                                    </div>
                                    {msg.subject && <div style={{ fontSize: '0.8rem', color: '#a78bfa', marginBottom: 6, fontWeight: 500 }}>Re: {msg.subject}</div>}
                                    <div className="message-content">{msg.message || 'No message content'}</div>
                                    <div className="message-actions">
                                        <a href={`mailto:${msg.email}`} className="action-btn reply-btn">Reply</a>
                                        <button
                                            className={`action-btn ${msg.dealtWith ? 'mark-read-btn' : 'delete-btn'}`}
                                            disabled={actionLoading[msg.id]}
                                            onClick={() => markDealt(msg.id, !msg.dealtWith)}
                                            style={{ minWidth: 110 }}
                                        >
                                            {actionLoading[msg.id] ? '...' : msg.dealtWith ? 'Mark Open' : 'Mark Dealt ✓'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminMessages;