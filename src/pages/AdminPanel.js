import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useWebSocket } from '../utils/useWebSocket';
import ConfirmationModal from '../components/ConfirmationModal';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import { FaSearch, FaUserShield } from 'react-icons/fa';
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
    const [searchTerm, setSearchTerm] = useState(''); // Search filter for users

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

    const handleGrantAdminAccess = async (userId, userEmail) => {
        if (!window.confirm(`Grant admin access to ${userEmail}? This will give them admin privileges.`)) {
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/admin/users/${userId}/role`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    role: 'admin',
                    capabilities: [] // Default admin capabilities
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to grant admin access');
            }

            const result = await response.json();
            
            if (result.success) {
                fetchUsers();
                setError(null);
                alert(`✅ Admin access granted to ${userEmail}!\n\nThey now have admin privileges.`);
            } else {
                throw new Error(result.message || 'Failed to grant admin access');
            }
        } catch (err) {
            console.error('Error granting admin access:', err);
            setError(err.message || 'Failed to grant admin access. Please try again.');
        }
    };

    // Filter users based on search term
    const filteredUsers = useMemo(() => {
        if (!searchTerm.trim()) {
            return users;
        }
        
        const searchLower = searchTerm.toLowerCase();
        return users.filter(u => 
            u.email?.toLowerCase().includes(searchLower) ||
            u.username?.toLowerCase().includes(searchLower) ||
            u.name?.toLowerCase().includes(searchLower) ||
            u.id?.toString().includes(searchLower)
        );
    }, [users, searchTerm]);

    // Navigate to user profile
    const handleUserClick = (userId) => {
        navigate(`/profile/${userId}`);
    };

    const handleGiveXP = async (userId, userEmail, currentXP = 0, currentLevel = 1) => {
        const xpAmount = window.prompt(`Give XP points to ${userEmail}\n\nCurrent Level: ${currentLevel}\nCurrent XP: ${currentXP}\n\nEnter amount of XP to give (negative to remove):`, '100');
        
        if (xpAmount === null || xpAmount === '') {
            return; // User cancelled
        }

        const xp = parseFloat(xpAmount);
        if (isNaN(xp) || xp === 0) {
            alert('Please enter a valid number for XP amount (non-zero).');
            return;
        }

        try {
            const response = await Api.giveXp(userId, xp);

            const result = response.data || response;
            
            if (result.success) {
                fetchUsers();
                setError(null);
                const action = xp > 0 ? 'awarded' : 'removed';
                alert(`✅ Successfully ${action} ${Math.abs(xp)} XP to ${userEmail}!\n\nNew XP: ${result.newXP}\nNew Level: ${result.newLevel}`);
            } else {
                throw new Error(result.message || 'Failed to give XP');
            }
        } catch (err) {
            console.error('Error giving XP:', err);
            setError(err.message || 'Failed to give XP points. Please try again.');
        }
    };

    const handleResetXP = async (userId, userEmail) => {
        if (!window.confirm(`⚠️ WARNING: This will reset ALL XP and level for ${userEmail} to 0/1.\n\nThis action cannot be undone. Are you sure?`)) {
            return;
        }

        try {
            const response = await Api.giveXp(userId, -999999); // Large negative to reset

            const result = response.data || response;
            
            if (result.success) {
                fetchUsers();
                setError(null);
                alert(`✅ Successfully reset XP for ${userEmail}!\n\nNew XP: ${result.newXP}\nNew Level: ${result.newLevel}`);
            } else {
                throw new Error(result.message || 'Failed to reset XP');
            }
        } catch (err) {
            console.error('Error resetting XP:', err);
            setError(err.message || 'Failed to reset XP. Please try again.');
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
        <h1 className="admin-title">ADMIN PANEL</h1>
        <div className="admin-tabs">
          <button
            className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
            data-count={users.length}
          >
            Users
          </button>
          <button
            className={`admin-tab-btn ${activeTab === 'channels' ? 'active' : ''}`}
            onClick={() => setActiveTab('channels')}
            data-count={channels.length}
          >
            Channels
          </button>
        </div>
        {activeTab === 'users' && (
          <div className="user-summary">
            <span>Total: {users.length} | Showing: {filteredUsers.length}</span>
            <span className={`connection-status ${isConnected ? 'online' : 'offline'}`}>
              {isConnected ? '● Live' : '○ Offline'}
            </span>
          </div>
        )}
        {activeTab === 'channels' && (
          <div className="user-summary">
            <span>Total Channels: {channels.length}</span>
            <button onClick={fetchChannels} className="refresh-btn">
              ↻ Refresh
            </button>
          </div>
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
          <div className="search-container">
            <FaSearch className="search-icon" aria-hidden />
            <input
              type="text"
              placeholder="Search by email, username, name, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="clear-search-btn">
                ✕
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <div className="loading-text">Loading users...</div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="no-users-message">
              <p>{searchTerm ? 'No users found matching your search.' : 'No users found.'}</p>
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="retry-btn">
                  Clear Search
                </button>
              )}
              {!searchTerm && (
                <button onClick={fetchUsers} className="retry-btn">
                  Retry
                </button>
              )}
            </div>
          ) : (
            <div className="users-grid">
              {filteredUsers.map(userItem => (
                <div key={userItem.id || userItem.email} className="user-card">
                  <div className="user-info">
                    <div 
                      className="user-email"
                      onClick={() => handleUserClick(userItem.id)}
                    >
                      {userItem.email || 'No email'}
                    </div>
                    <div 
                      className="user-name"
                      onClick={() => handleUserClick(userItem.id)}
                    >
                      {userItem.name || userItem.username || 'N/A'}
                    </div>
                    <div className="user-role">{userItem.role || 'USER'}</div>
                    <div className="user-xp">
                      <span>⭐ Level {userItem.level || 1}</span>
                      <span>•</span>
                      <span>{Math.floor(userItem.xp || 0).toLocaleString()} XP</span>
                    </div>
                    <div className="user-plan">
                      <span className="user-plan__label">Plan</span>
                      <span
                        className={`user-plan__value user-plan__value--${(userItem.subscription_plan || 'free').toLowerCase()}`}
                      >
                        {userItem.subscription_plan || 'free'}
                      </span>
                      {userItem.subscription_expiry && userItem.subscription_plan !== 'free' && (
                        <span className="user-plan__expiry">
                          Expires {new Date(userItem.subscription_expiry).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="user-joined">
                      Joined: {userItem.createdAt ? new Date(userItem.createdAt).toLocaleDateString() : 'N/A'}
                    </div>
                    <div className={`user-status ${onlineUsers.has(userItem.id) ? 'online' : 'offline'}`}>
                      {onlineUsers.has(userItem.id) ? 'Online' : 'Offline'}
                    </div>
                  </div>
                  <div className="user-actions">
                    <button 
                      className="action-btn xp-btn"
                      onClick={() => handleGiveXP(userItem.id, userItem.email, userItem.xp || 0, userItem.level || 1)}
                    >
                      ⭐ Give XP
                    </button>
                    <button 
                      className="action-btn reset-xp-btn"
                      onClick={() => handleResetXP(userItem.id, userItem.email)}
                    >
                      🔄 Reset XP
                    </button>
                    <button 
                      className="action-btn grant-access-btn"
                      onClick={() => handleGrantCommunityAccess(userItem.id, userItem.email)}
                    >
                      Grant Access
                    </button>
                    {(user?.role === 'super_admin' || user?.email?.toLowerCase() === 'shubzfx@gmail.com') && 
                     userItem.role !== 'admin' && userItem.role !== 'super_admin' && (
                      <button 
                        className="action-btn grant-admin-btn"
                        onClick={() => handleGrantAdminAccess(userItem.id, userItem.email)}
                      >
                        <FaUserShield /> Grant Admin
                      </button>
                    )}
                    <button 
                      className="action-btn revoke-access-btn"
                      onClick={() => handleRevokeCommunityAccess(userItem.id, userItem.email)}
                    >
                      Revoke
                    </button>
                    <button 
                      className="action-btn delete-btn"
                      onClick={() => handleDeleteUser(userItem.id, userItem.email)}
                    >
                      Delete
                    </button>
                    <button
                      className="action-btn plan-btn"
                      type="button"
                      onClick={() => {
    const newPlan = window.prompt(
      `Change subscription for ${userItem.email}\n\nCurrent: ${userItem.subscription_plan || 'free'}\n\nEnter new plan (free/premium/a7fx/elite):`,
      userItem.subscription_plan || 'free'
    );
    if (newPlan && ['free', 'premium', 'a7fx', 'elite'].includes(newPlan)) {
      if (window.confirm(`Change ${userItem.email} to ${newPlan} plan?`)) {
        // Call API here
        fetch('/api/admin/change-subscription', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            userId: userItem.id,
            plan: newPlan
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            alert(`✅ Changed to ${newPlan}`);
            fetchUsers(); // Refresh list
          } else {
            alert('❌ Failed: ' + data.message);
          }
        })
        .catch(err => alert('Error: ' + err.message));
      }
    } else {
      alert('Invalid plan. Use: free, premium, a7fx, elite');
    }
                      }}
                    >
                      Change plan
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
            <div className="no-channels-message">
              <p>No channels found.</p>
              <button onClick={fetchChannels} className="retry-btn">Retry</button>
            </div>
          ) : (
            <div className="users-grid">
              {channels.map(channel => (
                <div key={channel.id} className="channel-card">
                  <div className="channel-info">
                    <div className="channel-name">
                      {channel.displayName || channel.name}
                    </div>
                    <div className="channel-category">
                      {channel.category || 'general'}
                    </div>
                    <div className="channel-description">
                      {channel.description || 'No description'}
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '10px', color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Access Level:
                      </label>
                      <select
                        id={`access-${channel.id}`}
                        value={channel.accessLevel || 'open'}
                        onChange={(e) => handleUpdateChannelAccess(channel.id, e.target.value)}
                        className="access-level-select"
                      >
                        <option value="open">Open/Free - Everyone can view and post</option>
                        <option value="free">Free - Everyone can view and post</option>
                        <option value="read-only">Read-Only - Everyone can view, only admins can post</option>
                        <option value="admin-only">Admin-Only - Only admins can view and post</option>
                        <option value="premium">Premium - Premium and A7FX subscribers</option>
                        <option value="a7fx">A7FX Elite - Only A7FX Elite subscribers</option>
                        <option value="elite">Elite - Only A7FX Elite subscribers</option>
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
