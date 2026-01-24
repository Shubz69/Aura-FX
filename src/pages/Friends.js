import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaUserFriends, FaSearch, FaUserPlus, FaUserMinus, FaCheck,
  FaTimes, FaSpinner, FaClock, FaCircle, FaUserCheck,
  FaEnvelope, FaChevronDown, FaChevronUp
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import Sidebar from '../components/Sidebar';
import '../styles/Friends.css';

// Get avatar path helper
function getAvatarPath(avatar) {
  if (!avatar) return '/avatars/avatar_ai.png';
  if (avatar.startsWith('data:') || avatar.startsWith('/')) return avatar;
  return `/avatars/${avatar}`;
}

// Format relative time
function formatRelativeTime(date) {
  if (!date) return 'Never';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return `${Math.floor(diffMins / 1440)}d ago`;
}

const Friends = () => {
  const [activeTab, setActiveTab] = useState('friends');
  const [friends, setFriends] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [outgoingRequests, setOutgoingRequests] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [addUsername, setAddUsername] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [processingIds, setProcessingIds] = useState(new Set());
  
  const [expandedSections, setExpandedSections] = useState({
    online: true,
    offline: true
  });
  
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const baseUrl = window.location.origin;

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!token) return;
    
    try {
      setLoading(true);
      
      const [friendsRes, incomingRes, outgoingRes] = await Promise.all([
        fetch(`${baseUrl}/api/friends/list`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${baseUrl}/api/friends/requests/incoming`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${baseUrl}/api/friends/requests/outgoing`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      
      if (friendsRes.ok) {
        const data = await friendsRes.json();
        setFriends(data.friends || []);
      }
      
      if (incomingRes.ok) {
        const data = await incomingRes.json();
        setIncomingRequests(data.requests || []);
      }
      
      if (outgoingRes.ok) {
        const data = await outgoingRes.json();
        setOutgoingRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to fetch friends data:', error);
      toast.error('Failed to load friends');
    } finally {
      setLoading(false);
    }
  }, [token, baseUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Search users by username
  const searchUsers = async (query) => {
    if (!query.trim() || !token) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    try {
      const response = await fetch(`${baseUrl}/api/community/users?search=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Filter out self and get friend status for each
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const users = (data.users || []).filter(u => u.id !== currentUser.id);
        
        // Get friend status for each user
        const usersWithStatus = await Promise.all(users.map(async (user) => {
          try {
            const statusRes = await fetch(`${baseUrl}/api/friends/status/${user.id}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              return { ...user, friendStatus: statusData.status, requestId: statusData.requestId };
            }
          } catch (e) {}
          return { ...user, friendStatus: 'NONE' };
        }));
        
        setSearchResults(usersWithStatus);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (addUsername.trim()) {
        searchUsers(addUsername);
      } else {
        setSearchResults([]);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [addUsername]);

  // Send friend request
  const sendFriendRequest = async (receiverId) => {
    if (processingIds.has(receiverId)) return;
    
    setProcessingIds(prev => new Set([...prev, receiverId]));
    
    try {
      const response = await fetch(`${baseUrl}/api/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ receiverUserId: receiverId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Friend request sent!');
        // Update search results
        setSearchResults(prev => prev.map(u => 
          u.id === receiverId 
            ? { ...u, friendStatus: 'PENDING_SENT', requestId: data.request?.id }
            : u
        ));
        // Refresh outgoing requests
        fetchData();
      } else {
        toast.error(data.message || 'Failed to send request');
      }
    } catch (error) {
      console.error('Failed to send friend request:', error);
      toast.error('Failed to send request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(receiverId);
        return next;
      });
    }
  };

  // Accept friend request
  const acceptRequest = async (requestId, requesterId) => {
    if (processingIds.has(requestId)) return;
    
    setProcessingIds(prev => new Set([...prev, requestId]));
    
    try {
      const response = await fetch(`${baseUrl}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ requestId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.success('Friend request accepted!');
        fetchData();
      } else {
        toast.error(data.message || 'Failed to accept request');
      }
    } catch (error) {
      console.error('Failed to accept request:', error);
      toast.error('Failed to accept request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  // Decline friend request
  const declineRequest = async (requestId) => {
    if (processingIds.has(requestId)) return;
    
    setProcessingIds(prev => new Set([...prev, requestId]));
    
    try {
      const response = await fetch(`${baseUrl}/api/friends/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ requestId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.info('Friend request declined');
        fetchData();
      } else {
        toast.error(data.message || 'Failed to decline request');
      }
    } catch (error) {
      console.error('Failed to decline request:', error);
      toast.error('Failed to decline request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  // Cancel outgoing request
  const cancelRequest = async (requestId) => {
    if (processingIds.has(requestId)) return;
    
    setProcessingIds(prev => new Set([...prev, requestId]));
    
    try {
      const response = await fetch(`${baseUrl}/api/friends/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ requestId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.info('Friend request cancelled');
        fetchData();
      } else {
        toast.error(data.message || 'Failed to cancel request');
      }
    } catch (error) {
      console.error('Failed to cancel request:', error);
      toast.error('Failed to cancel request');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  // Remove friend
  const removeFriend = async (friendId) => {
    if (processingIds.has(friendId)) return;
    
    setProcessingIds(prev => new Set([...prev, friendId]));
    
    try {
      const response = await fetch(`${baseUrl}/api/friends/remove`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ friendUserId: friendId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        toast.info('Friend removed');
        setFriends(prev => prev.filter(f => f.id !== friendId));
      } else {
        toast.error(data.message || 'Failed to remove friend');
      }
    } catch (error) {
      console.error('Failed to remove friend:', error);
      toast.error('Failed to remove friend');
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(friendId);
        return next;
      });
    }
  };

  // Filter friends by search
  const filteredFriends = friends.filter(f => 
    f.username?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  const onlineFriends = filteredFriends.filter(f => f.isOnline);
  const offlineFriends = filteredFriends.filter(f => !f.isOnline);

  // Get button for user based on status
  const renderUserAction = (user) => {
    const status = user.friendStatus;
    const isProcessing = processingIds.has(user.id) || processingIds.has(user.requestId);
    
    if (status === 'FRIENDS') {
      return (
        <span className="status-badge friends">
          <FaUserCheck /> Friends
        </span>
      );
    }
    
    if (status === 'PENDING_SENT') {
      return (
        <button 
          className="action-btn pending"
          onClick={() => user.requestId && cancelRequest(user.requestId)}
          disabled={isProcessing}
        >
          {isProcessing ? <FaSpinner className="spinner" /> : <FaClock />}
          Pending
        </button>
      );
    }
    
    if (status === 'PENDING_RECEIVED') {
      return (
        <button 
          className="action-btn accept"
          onClick={() => user.requestId && acceptRequest(user.requestId, user.id)}
          disabled={isProcessing}
        >
          {isProcessing ? <FaSpinner className="spinner" /> : <FaCheck />}
          Accept
        </button>
      );
    }
    
    return (
      <button 
        className="action-btn add"
        onClick={() => sendFriendRequest(user.id)}
        disabled={isProcessing}
      >
        {isProcessing ? <FaSpinner className="spinner" /> : <FaUserPlus />}
        Add Friend
      </button>
    );
  };

  return (
    <div className="friends-page">
      <Sidebar activePage="friends" />
      
      <div className="friends-content">
        <div className="friends-header">
          <h1>
            <FaUserFriends className="header-icon" />
            Friends
          </h1>
          
          {/* Tabs */}
          <div className="friends-tabs">
            <button 
              className={`tab ${activeTab === 'friends' ? 'active' : ''}`}
              onClick={() => setActiveTab('friends')}
            >
              Friends
              {friends.length > 0 && <span className="badge">{friends.length}</span>}
            </button>
            <button 
              className={`tab ${activeTab === 'incoming' ? 'active' : ''}`}
              onClick={() => setActiveTab('incoming')}
            >
              Incoming
              {incomingRequests.length > 0 && (
                <span className="badge alert">{incomingRequests.length}</span>
              )}
            </button>
            <button 
              className={`tab ${activeTab === 'outgoing' ? 'active' : ''}`}
              onClick={() => setActiveTab('outgoing')}
            >
              Pending
              {outgoingRequests.length > 0 && (
                <span className="badge">{outgoingRequests.length}</span>
              )}
            </button>
            <button 
              className={`tab ${activeTab === 'add' ? 'active' : ''}`}
              onClick={() => setActiveTab('add')}
            >
              <FaUserPlus /> Add Friend
            </button>
          </div>
        </div>

        <div className="friends-main">
          {loading ? (
            <div className="loading-state">
              <FaSpinner className="spinner" />
              <span>Loading friends...</span>
            </div>
          ) : (
            <>
              {/* Friends List */}
              {activeTab === 'friends' && (
                <div className="friends-list-container">
                  <div className="search-box">
                    <FaSearch className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search friends..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  
                  {filteredFriends.length === 0 ? (
                    <div className="empty-state">
                      <FaUserFriends className="empty-icon" />
                      <p>No friends yet</p>
                      <button 
                        className="add-friends-btn"
                        onClick={() => setActiveTab('add')}
                      >
                        <FaUserPlus /> Add Friends
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Online friends */}
                      {onlineFriends.length > 0 && (
                        <div className="friends-section">
                          <div 
                            className="section-header"
                            onClick={() => setExpandedSections(prev => ({ ...prev, online: !prev.online }))}
                          >
                            <span className="online-dot" />
                            Online — {onlineFriends.length}
                            {expandedSections.online ? <FaChevronUp /> : <FaChevronDown />}
                          </div>
                          
                          {expandedSections.online && (
                            <div className="friends-grid">
                              {onlineFriends.map(friend => (
                                <div key={friend.id} className="friend-card">
                                  <div className="friend-avatar">
                                    <img src={getAvatarPath(friend.avatar)} alt={friend.username} />
                                    <div className="online-indicator" />
                                  </div>
                                  <div className="friend-info">
                                    <span className="friend-name">{friend.username}</span>
                                    <span className="friend-level">Level {friend.level}</span>
                                  </div>
                                  <div className="friend-actions">
                                    <button 
                                      className="icon-btn message"
                                      title="Send Message"
                                      onClick={() => navigate(`/community?dm=${friend.id}`)}
                                    >
                                      <FaEnvelope />
                                    </button>
                                    <button 
                                      className="icon-btn remove"
                                      title="Remove Friend"
                                      onClick={() => removeFriend(friend.id)}
                                      disabled={processingIds.has(friend.id)}
                                    >
                                      {processingIds.has(friend.id) ? (
                                        <FaSpinner className="spinner" />
                                      ) : (
                                        <FaUserMinus />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Offline friends */}
                      {offlineFriends.length > 0 && (
                        <div className="friends-section">
                          <div 
                            className="section-header"
                            onClick={() => setExpandedSections(prev => ({ ...prev, offline: !prev.offline }))}
                          >
                            <span className="offline-dot" />
                            Offline — {offlineFriends.length}
                            {expandedSections.offline ? <FaChevronUp /> : <FaChevronDown />}
                          </div>
                          
                          {expandedSections.offline && (
                            <div className="friends-grid">
                              {offlineFriends.map(friend => (
                                <div key={friend.id} className="friend-card offline">
                                  <div className="friend-avatar">
                                    <img src={getAvatarPath(friend.avatar)} alt={friend.username} />
                                    <div className="offline-indicator" />
                                  </div>
                                  <div className="friend-info">
                                    <span className="friend-name">{friend.username}</span>
                                    <span className="friend-status">
                                      Last seen {formatRelativeTime(friend.lastSeen)}
                                    </span>
                                  </div>
                                  <div className="friend-actions">
                                    <button 
                                      className="icon-btn message"
                                      title="Send Message"
                                      onClick={() => navigate(`/community?dm=${friend.id}`)}
                                    >
                                      <FaEnvelope />
                                    </button>
                                    <button 
                                      className="icon-btn remove"
                                      title="Remove Friend"
                                      onClick={() => removeFriend(friend.id)}
                                      disabled={processingIds.has(friend.id)}
                                    >
                                      {processingIds.has(friend.id) ? (
                                        <FaSpinner className="spinner" />
                                      ) : (
                                        <FaUserMinus />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Incoming Requests */}
              {activeTab === 'incoming' && (
                <div className="requests-container">
                  {incomingRequests.length === 0 ? (
                    <div className="empty-state">
                      <FaUserPlus className="empty-icon" />
                      <p>No incoming friend requests</p>
                    </div>
                  ) : (
                    <div className="requests-list">
                      {incomingRequests.map(request => (
                        <div key={request.id} className="request-card">
                          <div className="request-avatar">
                            <img src={getAvatarPath(request.avatar)} alt={request.username} />
                          </div>
                          <div className="request-info">
                            <span className="request-name">{request.username}</span>
                            <span className="request-time">
                              <FaClock /> {formatRelativeTime(request.createdAt)}
                            </span>
                          </div>
                          <div className="request-actions">
                            <button 
                              className="action-btn accept"
                              onClick={() => acceptRequest(request.id, request.requesterId)}
                              disabled={processingIds.has(request.id)}
                            >
                              {processingIds.has(request.id) ? (
                                <FaSpinner className="spinner" />
                              ) : (
                                <FaCheck />
                              )}
                              Accept
                            </button>
                            <button 
                              className="action-btn decline"
                              onClick={() => declineRequest(request.id)}
                              disabled={processingIds.has(request.id)}
                            >
                              <FaTimes />
                              Decline
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Outgoing Requests */}
              {activeTab === 'outgoing' && (
                <div className="requests-container">
                  {outgoingRequests.length === 0 ? (
                    <div className="empty-state">
                      <FaClock className="empty-icon" />
                      <p>No pending friend requests</p>
                    </div>
                  ) : (
                    <div className="requests-list">
                      {outgoingRequests.map(request => (
                        <div key={request.id} className="request-card">
                          <div className="request-avatar">
                            <img src={getAvatarPath(request.avatar)} alt={request.username} />
                          </div>
                          <div className="request-info">
                            <span className="request-name">{request.username}</span>
                            <span className="request-time">
                              <FaClock /> Sent {formatRelativeTime(request.createdAt)}
                            </span>
                          </div>
                          <div className="request-actions">
                            <button 
                              className="action-btn cancel"
                              onClick={() => cancelRequest(request.id)}
                              disabled={processingIds.has(request.id)}
                            >
                              {processingIds.has(request.id) ? (
                                <FaSpinner className="spinner" />
                              ) : (
                                <FaTimes />
                              )}
                              Cancel
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Add Friend */}
              {activeTab === 'add' && (
                <div className="add-friend-container">
                  <div className="add-friend-box">
                    <h2>Add Friend</h2>
                    <p>Search for users by their username</p>
                    
                    <div className="search-input-wrapper">
                      <FaSearch className="search-icon" />
                      <input
                        type="text"
                        placeholder="Enter a username..."
                        value={addUsername}
                        onChange={(e) => setAddUsername(e.target.value)}
                      />
                      {searching && <FaSpinner className="spinner" />}
                    </div>
                  </div>
                  
                  {searchResults.length > 0 && (
                    <div className="search-results">
                      {searchResults.map(user => (
                        <div key={user.id} className="search-result-card">
                          <div className="result-avatar">
                            <img src={getAvatarPath(user.avatar)} alt={user.username} />
                          </div>
                          <div className="result-info">
                            <span className="result-name">{user.username}</span>
                            <span className="result-level">Level {user.level || 1}</span>
                          </div>
                          <div className="result-action">
                            {renderUserAction(user)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {addUsername && !searching && searchResults.length === 0 && (
                    <div className="no-results">
                      <p>No users found matching "{addUsername}"</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Friends;
