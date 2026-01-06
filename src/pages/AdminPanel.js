import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../utils/useWebSocket';
import ConfirmationModal from '../components/ConfirmationModal';
import CosmicBackground from '../components/CosmicBackground';
import '../styles/AdminPanel.css';

const AdminPanel = () => {
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, userId: null, userEmail: null });

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


    const handleDeleteUser = (userId, userEmail) => {
        setDeleteModal({ isOpen: true, userId, userEmail });
    };

    const handleGrantCommunityAccess = async (userId, userEmail) => {
        if (!window.confirm(`Grant community access to ${userEmail}? This will activate their subscription and give them premium access.`)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            
            // First, update subscription status
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
                throw new Error('Failed to grant subscription access');
            }

            // Also update role to premium
            const roleResponse = await fetch(`/api/admin/users/${userId}/role`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    role: 'premium'
                })
            });

            if (!roleResponse.ok) {
                console.warn('Failed to update role, but subscription was granted');
            }

            // Refresh the user list
            fetchUsers();
            setError(null);
            alert(`✅ Community access granted to ${userEmail}!`);
        } catch (err) {
            console.error('Error granting community access:', err);
            setError(err.message || 'Failed to grant community access. Please try again.');
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
                    <h1 className="admin-title">REGISTERED USERS</h1>
                    <div className="user-summary">
                        <span>Total: {users.length} | Online: {onlineUsersCount} | Offline: {offlineUsersCount}</span>
                        {!isConnected && <span className="connection-status offline"> (Offline)</span>}
                        {isConnected && <span className="connection-status online"> (Live)</span>}
                    </div>
                </div>

                {error && (
                    <div className="error-message">
                        <span className="error-icon">⚠️</span>
                        {error}
                        <button className="error-close" onClick={() => setError(null)}>×</button>
                    </div>
                )}

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
                                    <div className="user-joined">Joined: {userItem.createdAt ? new Date(userItem.createdAt).toLocaleDateString() : 'N/A'}</div>
                                    <div className={`user-status ${onlineUsers.has(userItem.id) ? 'online' : 'offline'}`}>
                                        {onlineUsers.has(userItem.id) ? 'Online' : 'Offline'}
                                    </div>
                                </div>
                                <div className="user-actions">
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
