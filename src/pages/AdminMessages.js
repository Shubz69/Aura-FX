import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/AdminMessages.css';
import AdminApi from '../services/AdminApi';
import Api from '../services/Api';
import AuraTerminalThemeShell from '../components/AuraTerminalThemeShell';

const KNOWN_ROLES = ['free', 'premium', 'elite', 'a7fx', 'admin', 'super_admin'];

function normalizeSubmissionRole(role) {
    const k = (role || 'free').toLowerCase();
    return KNOWN_ROLES.includes(k) ? k : 'free';
}

const AdminMessages = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
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

    const buildMailtoReplyHref = (msg) => {
        const email = (msg.email || '').trim();
        if (!email) return '#';
        const subj = msg.subject
            ? `Re: ${msg.subject}`
            : 'Re: Your message to AURA TERMINAL';
        const bodyLines = [
            `Hi ${(msg.name || 'there').split(/\s+/)[0] || 'there'},`,
            '',
            '',
            '—',
            `Regarding your message (${msg.createdAt ? new Date(msg.createdAt).toLocaleString() : 'recent'}):`,
            (msg.message || '').slice(0, 2000),
        ];
        const params = new URLSearchParams({
            subject: subj,
            body: bodyLines.join('\n'),
        });
        return `mailto:${email}?${params.toString()}`;
    };

    const handleReplyClick = (msg, e) => {
        const uid = msg.userId != null ? Number(msg.userId) : NaN;
        if (Number.isFinite(uid) && uid > 0) {
            e.preventDefault();
            navigate(`/admin/inbox?user=${uid}`);
            return;
        }
        /* Guest / no account — mailto opens the default mail client */
    };

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
            <AuraTerminalThemeShell>
            <div className="admin-messages-container journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
                <div className="access-denied">
                    <h1 className="glitch-title">ACCESS DENIED</h1>
                    <p>You must be an admin to view this page.</p>
                </div>
            </div>
            </AuraTerminalThemeShell>
        );
    }

    const filtered = messages.filter(m => {
        if (filter === 'open') return !m.dealtWith;
        if (filter === 'dealt') return m.dealtWith;
        return true;
    });

    return (
        <AuraTerminalThemeShell>
        <div className="admin-messages-container journal-glass-panel journal-glass-panel--pad journal-glass-panel--rim aa-page">
            <div className="admin-messages-content">
                <div className="admin-header">
                    <h1 className="glitch-title">CONTACT SUBMISSIONS</h1>
                    <p className="admin-subtitle">Review and manage user contact messages</p>
                </div>

                <div className="submission-filter-bar" role="tablist" aria-label="Filter submissions">
                    {['all', 'open', 'dealt'].map((f) => (
                        <button
                            key={f}
                            type="button"
                            role="tab"
                            aria-selected={filter === f}
                            className={`submission-filter-btn${filter === f ? ' is-active' : ''}`}
                            onClick={() => setFilter(f)}
                        >
                            {f.charAt(0).toUpperCase() + f.slice(1)}
                            {f === 'open' && (
                                <span className="submission-filter-count" aria-hidden>
                                    {messages.filter((m) => !m.dealtWith).length}
                                </span>
                            )}
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
                                    className={`message-card${msg.dealtWith ? ' message-card--dealt' : ''}`}
                                >
                                    <div className="message-header">
                                        <div className="user-info">
                                            <div className="user-avatar">
                                                <span className="avatar-letter">{msg.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                                            </div>
                                            <div className="user-details">
                                                <div className="user-name submission-user-line">
                                                    {msg.name || 'Anonymous'}
                                                    {msg.userRole && (
                                                        <span
                                                            className="submission-role-badge"
                                                            data-role={normalizeSubmissionRole(msg.userRole)}
                                                        >
                                                            {msg.userRole}
                                                        </span>
                                                    )}
                                                    {msg.dealtWith && (
                                                        <span className="submission-dealt-badge">✓ Dealt</span>
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
                                    {msg.subject && (
                                        <div className="message-subject">Re: {msg.subject}</div>
                                    )}
                                    <div className="message-content">{msg.message || 'No message content'}</div>
                                    <div className="message-actions">
                                        <a
                                            href={buildMailtoReplyHref(msg)}
                                            className="action-btn reply-btn"
                                            onClick={(e) => handleReplyClick(msg, e)}
                                        >
                                            Reply
                                        </a>
                                        <button
                                            type="button"
                                            className={`action-btn action-btn--toggle ${msg.dealtWith ? 'mark-read-btn' : 'delete-btn'}`}
                                            disabled={actionLoading[msg.id]}
                                            onClick={() => markDealt(msg.id, !msg.dealtWith)}
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
        </AuraTerminalThemeShell>
    );
};

export default AdminMessages;