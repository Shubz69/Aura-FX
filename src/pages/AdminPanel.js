import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../utils/useWebSocket';
import ConfirmationModal from '../components/ConfirmationModal';
import '../styles/AdminPanel.css';

const AdminPanel = () => {
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, userId: null, userEmail: null });

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
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/community/users`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch users');
            }
            
            const data = await response.json();
            setUsers(data);
        } catch (err) {
            setError('Failed to load users. Please try again.');
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

    // Handle real-time online status updates from WebSocket
    function handleOnlineStatusUpdate(data) {
        if (data && Array.isArray(data)) {
            setOnlineUsers(new Set(data));
        }
    }

    const handleDeleteUser = (userId, userEmail) => {
        setDeleteModal({ isOpen: true, userId, userEmail });
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

    if (!isAuthenticated || (user && user.role !== 'ADMIN')) {
        return null; // Don't render anything while redirecting
    }

    const onlineUsersCount = onlineUsers.size;
    const offlineUsersCount = users.length - onlineUsersCount;

    return (
        <div className="admin-panel-container">
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
                ) : (
                    <div className="users-grid">
                        {users.map(user => (
                            <div key={user.id} className="user-card">
                                <div className="user-info">
                                    <div className="user-email">{user.email}</div>
                                    <div className="user-name">({user.name || user.username || 'N/A'})</div>
                                    <div className="user-role">{user.role}</div>
                                    <div className="user-joined">Joined: N/A</div>
                                    <div className={`user-status ${onlineUsers.has(user.id) ? 'online' : 'offline'}`}>
                                        {onlineUsers.has(user.id) ? 'Online' : 'Offline'}
                                    </div>
                                </div>
                                <div className="user-actions">
                                    <button 
                                        className="delete-btn"
                                        onClick={() => handleDeleteUser(user.id, user.email)}
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