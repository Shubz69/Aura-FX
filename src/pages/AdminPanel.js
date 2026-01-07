import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../utils/useWebSocket';
import ConfirmationModal from '../components/ConfirmationModal';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import '../styles/AdminPanel.css';

const AdminPanel = () => {
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, userId: null, userEmail: null });
    const [channels, setChannels] = useState([]);
    const [channelsLoading, setChannelsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('users'); // 'users' or 'channels'

    // Handle real-time online status updates from WebSocket
    const handleOnlineStatusUpdate = (data) => {
        if (data && Array.isArray(data)) {
            setOnlineUsers(new Set(data));
        }
    };

    // WebSocket connection for real-time updates
    const { isConnected } = useWebSocket(null, handleOnlineStatusUpdate, true);

    // Check if user is authenticated and is an admin
    useEffect(() => {
        if (!isAuthenticated) {
            navigate('/login');
            return;
        }
        
        const userRole = user?.role?.toLowerCase() || '';
        const isAdmin = userRole === 'admin' || userRole === 'super_admin' || user?.email?.toLowerCase() === 'shubzfx@gmail.com';
        
        if (user && !isAdmin) {
            navigate('/');
            return;
        }
        
        // Only fetch data if user is authenticated and is an admin
        fetchUsers();
        fetchChannels();
        fetchOnlineStatus();
        
        // Set up periodic refresh for online status
        const interval = setInterval(fetchOnlineStatus, 30000); // Refresh every 30 seconds
        
        return () => clearInterval(interval);
    }, [user, isAuthenticated, navigate]);
    
    const fetchUsers = async () => {
        try {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('token');
            
            // Try multiple API endpoints
            let response = await fetch(`/api/admin/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            // If that fails, try community endpoint
            if (!response.ok) {
                response = await fetch(`/api/community/users`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to fetch users');
            }
            
            const data = await response.json();
            // Handle different response formats
            const usersList = Array.isArray(data) ? data : (data.users || data.data || []);
            setUsers(usersList);
        } catch (err) {
            console.error('Error fetching users:', err);
            setError(err.message || 'Failed to load users. Please try again.');
            setUsers([]); // Set empty array on error
        } finally {
            setLoading(false);
        }
    };

    const fetchOnlineStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/user-status`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                setOnlineUsers(new Set(data.onlineUsers.map(u => u.id)));
            }
        } catch (err) {
        }
    };

    const fetchChannels = async () => {
        try {
            setChannelsLoading(true);
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/community/channels`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                setChannels(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('Error fetching channels:', err);
        } finally {
            setChannelsLoading(false);
        }
    };

    const handleUpdateChannelAccess = async (channelId, newAccessLevel) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/community/channels`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: channelId,
                    accessLevel: newAccessLevel
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to update channel');
            }

            const result = await response.json();
            if (result.success) {
                fetchChannels();
                setError(null);
            } else {
                throw new Error(result.message || 'Failed to update channel');
            }
        } catch (err) {
            console.error('Error updating channel access:', err);
            setError(err.message || 'Failed to update channel access. Please try again.');
        }
    };

    const handleUpdateChannel = async (channelId, field, value) => {
        try {
            const token = localStorage.getItem('token');
            const updateData = { id: channelId };
            
            if (field === 'name') {
                updateData.name = value;
            } else if (field === 'description') {
                updateData.description = value;
            } else if (field === 'category') {
                updateData.category = value;
            }
            
            const response = await fetch(`/api/community/channels`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to update channel');
            }

            const result = await response.json();
            if (result.success) {
                fetchChannels();
                setError(null);
            } else {
                throw new Error(result.message || 'Failed to update channel');
            }
        } catch (err) {
            console.error('Error updating channel:', err);
            setError(err.message || 'Failed to update channel. Please try again.');
        }
    };


    const handleDeleteUser = (userId, userEmail) => {
        setDeleteModal({ isOpen: true, userId, userEmail });
    };

    const handleGrantCommunityAccess = async (userId, userEmail) => {
        if (!window.confirm(`Grant community access to ${userEmail}? This will activate their subscription status (after you've verified their payment confirmation).`)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            
            // Grant access by activating subscription status (this sets both subscription_status AND role)
            const subscriptionResponse = await fetch(`/api/stripe/subscription-success`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    userId: userId,
                    session_id: `admin-granted-${Date.now()}`
                })
            });

            if (!subscriptionResponse.ok) {
                const errorData = await subscriptionResponse.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to grant subscription access');
            }

            const result = await subscriptionResponse.json();
            
            if (result.success) {
                // Refresh the user list
                fetchUsers();
                setError(null);
                alert(`✅ Community access granted to ${userEmail}!\n\nSubscription activated with 90-day expiry. User can now access the community.`);
            } else {
                throw new Error(result.message || 'Failed to grant access');
            }
        } catch (err) {
            console.error('Error granting community access:', err);
            setError(err.message || 'Failed to grant community access. Please try again.');
        }
    };

    const handleRevokeCommunityAccess = async (userId, userEmail) => {
        if (!window.confirm(`Revoke community access from ${userEmail}? This will deactivate their subscription and remove their premium access.`)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/revoke-access`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    userId: userId
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to revoke access');
            }

            const result = await response.json();
            
            if (result.success) {
                fetchUsers();
                setError(null);
                alert(`✅ Community access revoked from ${userEmail}!\n\nTheir subscription has been deactivated.`);
            } else {
                throw new Error(result.message || 'Failed to revoke access');
            }
        } catch (err) {
            console.error('Error revoking community access:', err);
            setError(err.message || 'Failed to revoke community access. Please try again.');
        }
    };

    const handleGiveXP = async (userId, userEmail, currentXP = 0) => {
        const xpAmount = window.prompt(`Give XP points to ${userEmail}\n\nCurrent XP: ${currentXP}\n\nEnter amount of XP to give:`, '100');
        
        if (xpAmount === null || xpAmount === '') {
            return; // User cancelled
        }

        const xp = parseFloat(xpAmount);
        if (isNaN(xp) || xp <= 0) {
            alert('Please enter a valid positive number for XP amount.');
            return;
        }

        try {
            const response = await Api.giveXp(userId, xp);

            const result = response.data || response;
            
            if (result.success) {
                fetchUsers();
                setError(null);
                alert(`✅ Successfully awarded ${xp} XP to ${userEmail}!\n\nNew XP: ${result.newXP}\nNew Level: ${result.newLevel}`);
            } else {
                throw new Error(result.message || 'Failed to give XP');
            }
        } catch (err) {
            console.error('Error giving XP:', err);
            setError(err.message || 'Failed to give XP points. Please try again.');
        }
    };

    const confirmDeleteUser = async () => {
        const { userId } = deleteModal;
        if (!userId) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/users/${userId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to delete user');
            }

            // Refresh the user list
            fetchUsers();
            setDeleteModal({ isOpen: false, userId: null, userEmail: null });
        } catch (err) {
            setError(err.message || 'Failed to delete user. Please try again.');
            setDeleteModal({ isOpen: false, userId: null, userEmail: null });
        }
    };

    // Check admin status more flexibly
    const userRole = user?.role?.toLowerCase() || '';
    const isAdmin = userRole === 'admin' || userRole === 'super_admin' || user?.email?.toLowerCase() === 'shubzfx@gmail.com';
    
    if (!isAuthenticated || !isAdmin) {
        return null; // Don't render anything while redirecting
    }

    const onlineUsersCount = onlineUsers.size;
    const offlineUsersCount = users.length - onlineUsersCount;

    return (
        <div className="admin-panel-container">
            <CosmicBackground />
            <div className="admin-panel">
                <div className="admin-header">
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
                        <button
                            onClick={() => setActiveTab('users')}
                            style={{
                                background: activeTab === 'users' ? 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)' : 'rgba(255, 255, 255, 0.1)',
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '16px',
                                fontWeight: '600',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            Users ({users.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('channels')}
                            style={{
                                background: activeTab === 'channels' ? 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)' : 'rgba(255, 255, 255, 0.1)',
                                color: 'white',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontSize: '16px',
                                fontWeight: '600',
                                transition: 'all 0.3s ease'
                            }}
                        >
                            Channels ({channels.length})
                        </button>
                    </div>
                    {activeTab === 'users' && (
                        <>
                            <h1 className="admin-title">REGISTERED USERS</h1>
                            <div className="user-summary">
                                <span>Total: {users.length} | Online: {onlineUsersCount} | Offline: {offlineUsersCount}</span>
                                {!isConnected && <span className="connection-status offline"> (Offline)</span>}
                                {isConnected && <span className="connection-status online"> (Live)</span>}
                            </div>
                        </>
                    )}
                    {activeTab === 'channels' && (
                        <>
                            <h1 className="admin-title">CHANNEL MANAGEMENT</h1>
                            <div className="user-summary">
                                <span>Total Channels: {channels.length}</span>
                                <button
                                    onClick={fetchChannels}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.1)',
                                        color: 'white',
                                        border: '1px solid rgba(255, 255, 255, 0.3)',
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        marginLeft: '16px'
                                    }}
                                >
                                    Refresh
                                </button>
                            </div>
                        </>
                    )}
                </div>

                {error && (
                    <div className="error-message">
                        <span className="error-icon">⚠️</span>
                        {error}
                        <button className="error-close" onClick={() => setError(null)}>×</button>
                    </div>
                )}

                {activeTab === 'users' && (
                    <>
                        {loading ? (
                            <div className="loading-container">
                                <div className="loading-spinner"></div>
                                <div className="loading-text">Loading users...</div>
                            </div>
                        ) : users.length === 0 ? (
                            <div className="no-users-message">
                                <p>No users found.</p>
                                <button onClick={fetchUsers} className="retry-btn">Retry</button>
                            </div>
                        ) : (
                            <div className="users-grid">
                                {users.map(userItem => (
                                    <div key={userItem.id || userItem.email} className="user-card">
                                        <div className="user-info">
                                            <div className="user-email">{userItem.email || 'No email'}</div>
                                            <div className="user-name">({userItem.name || userItem.username || 'N/A'})</div>
                                            <div className="user-role">{userItem.role || 'USER'}</div>
                                            <div className="user-xp" style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '8px',
                                                marginTop: '8px',
                                                padding: '6px 12px',
                                                background: 'rgba(139, 92, 246, 0.2)',
                                                borderRadius: '6px',
                                                fontSize: '14px',
                                                fontWeight: '600'
                                            }}>
                                                <span>⭐ Level {userItem.level || 1}</span>
                                                <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>•</span>
                                                <span>{Math.floor(userItem.xp || 0).toLocaleString()} XP</span>
                                            </div>
                                            <div className="user-joined">Joined: {userItem.createdAt ? new Date(userItem.createdAt).toLocaleDateString() : 'N/A'}</div>
                                            <div className={`user-status ${onlineUsers.has(userItem.id) ? 'online' : 'offline'}`}>
                                                {onlineUsers.has(userItem.id) ? 'Online' : 'Offline'}
                                            </div>
                                        </div>
                                <div className="user-actions">
                                    <button 
                                        className="give-xp-btn"
                                        onClick={() => handleGiveXP(userItem.id, userItem.email, userItem.xp || 0)}
                                        style={{
                                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                                            color: 'white',
                                            border: 'none',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            marginRight: '8px',
                                            transition: 'all 0.3s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        ⭐ Give XP
                                    </button>
                                    <button 
                                        className="grant-access-btn"
                                        onClick={() => handleGrantCommunityAccess(userItem.id, userItem.email)}
                                        style={{
                                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                            color: 'white',
                                            border: 'none',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            marginRight: '8px',
                                            transition: 'all 0.3s ease'
                                        }}
                                    >
                                        Grant Community Access
                                    </button>
                                    <button 
                                        className="revoke-access-btn"
                                        onClick={() => handleRevokeCommunityAccess(userItem.id, userItem.email)}
                                        style={{
                                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                            color: 'white',
                                            border: 'none',
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontSize: '14px',
                                            fontWeight: '600',
                                            marginRight: '8px',
                                            transition: 'all 0.3s ease'
                                        }}
                                    >
                                        Revoke Access
                                    </button>
                                    <button 
                                        className="delete-btn"
                                        onClick={() => handleDeleteUser(userItem.id, userItem.email)}
                                    >
                                        Delete
                                    </button>
                                </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'channels' && (
                    <>
                        {channelsLoading ? (
                            <div className="loading-container">
                                <div className="loading-spinner"></div>
                                <div className="loading-text">Loading channels...</div>
                            </div>
                        ) : channels.length === 0 ? (
                            <div className="no-users-message">
                                <p>No channels found.</p>
                                <button onClick={fetchChannels} className="retry-btn">Retry</button>
                            </div>
                        ) : (
                            <div className="users-grid">
                                {channels.map(channel => (
                                    <div key={channel.id} className="user-card" style={{ maxWidth: '100%' }}>
                                        <div className="user-info" style={{ width: '100%' }}>
                                            <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                                                #{channel.displayName || channel.name}
                                            </div>
                                            <div style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '8px' }}>
                                                Category: {channel.category || 'general'}
                                            </div>
                                            <div style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '16px' }}>
                                                {channel.description || 'No description'}
                                            </div>
                                            <div style={{ marginTop: '16px' }}>
                                                <label style={{ display: 'block', marginBottom: '8px', color: 'rgba(255, 255, 255, 0.9)' }}>
                                                    Access Level:
                                                </label>
                                                <select
                                                    value={channel.accessLevel || 'open'}
                                                    onChange={(e) => handleUpdateChannelAccess(channel.id, e.target.value)}
                                                    style={{
                                                        background: 'rgba(255, 255, 255, 0.1)',
                                                        color: 'white',
                                                        border: '1px solid rgba(255, 255, 255, 0.3)',
                                                        padding: '8px 12px',
                                                        borderRadius: '8px',
                                                        fontSize: '14px',
                                                        width: '100%',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <option value="open">Open - Everyone can view and post</option>
                                                    <option value="read-only">Read-Only - Everyone can view, only admins can post</option>
                                                    <option value="admin-only">Admin-Only - Only admins can view and post</option>
                                                    <option value="premium">Premium - Only premium subscribers</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            <ConfirmationModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, userId: null, userEmail: null })}
                onConfirm={confirmDeleteUser}
                title="Delete User"
                message={`Are you sure you want to delete ${deleteModal.userEmail || 'this user'}? This action cannot be undone.`}
                confirmText="Delete"
                cancelText="Cancel"
                type="danger"
            />
        </div>
    );
};

export default AdminPanel;
