import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  isSuperAdmin, 
  isAdmin, 
  ADMIN_CAPABILITIES,
  DEFAULT_ADMIN_CAPABILITIES,
  getCapabilityName,
  getCapabilityCategory,
  SUPER_ADMIN_EMAIL,
  hasCapability
} from '../utils/roles';
import Api from '../services/Api';
import ConfirmationModal from '../components/ConfirmationModal';
import { toast } from 'react-toastify';
import { FaSearch, FaUserShield, FaCrown, FaFilter, FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';
import '../styles/Settings.css';

const ITEMS_PER_PAGE = 50; // Optimized for large user lists

const Settings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('free');
  const [selectedCapabilities, setSelectedCapabilities] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [subscriptionFilter, setSubscriptionFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('users');
  const [deleteAdminModal, setDeleteAdminModal] = useState({ isOpen: false, adminUser: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  
  // Subscription management state
  const [selectedSubUser, setSelectedSubUser] = useState(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState('inactive');
  const [subscriptionPlan, setSubscriptionPlan] = useState('aura');
  const [subscriptionExpiry, setSubscriptionExpiry] = useState('');

  const superAdmin = isSuperAdmin(user);
  const admin = isAdmin(user);

  useEffect(() => {
    if (!superAdmin && !admin) {
      navigate('/');
      return;
    }

    const initialize = async () => {
      if (superAdmin) {
        await loadUsers();
        await loadAdmins();
      }
      setLoading(false);
    };
    
    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [superAdmin, admin, navigate]);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
  }, [searchTerm, roleFilter, subscriptionFilter]);

  const loadUsers = async () => {
    try {
      const response = await Api.getUsers?.() || { data: [] };
      const usersData = response.data || [];
      // Ensure subscription fields are included
      setUsers(usersData.map(u => ({
        ...u,
        subscription_status: u.subscription_status || 'inactive',
        subscription_plan: u.subscription_plan || null,
        subscription_expiry: u.subscription_expiry || null
      })));
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    }
  };

  const loadAdmins = async () => {
    try {
      if (users.length === 0) {
        await loadUsers();
      }
      const adminUsers = users.filter(u => 
        u.role === 'admin' || u.role === 'super_admin'
      );
      setAdmins(adminUsers);
    } catch (error) {
      console.error('Error loading admins:', error);
    }
  };

  // Advanced filtering with search, role, and subscription filters
  const filteredUsers = useMemo(() => {
    let filtered = users;

    // Search filter (email, username, name)
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(u => 
        u.email?.toLowerCase().includes(searchLower) ||
        u.username?.toLowerCase().includes(searchLower) ||
        u.name?.toLowerCase().includes(searchLower) ||
        u.id?.toString().includes(searchLower)
      );
    }

    // Role filter
    if (roleFilter !== 'all') {
      filtered = filtered.filter(u => {
        if (roleFilter === 'admin') {
          return u.role === 'admin' || u.role === 'super_admin';
        }
        return u.role === roleFilter;
      });
    }

    // Subscription filter
    if (subscriptionFilter !== 'all') {
      filtered = filtered.filter(u => {
        if (subscriptionFilter === 'active') {
          return u.subscription_status === 'active';
        } else if (subscriptionFilter === 'premium') {
          return u.role === 'premium' || u.subscription_plan === 'aura';
        } else if (subscriptionFilter === 'a7fx') {
          return u.role === 'a7fx' || u.subscription_plan === 'a7fx';
        } else if (subscriptionFilter === 'expired') {
          return u.subscription_status === 'expired' || 
                 (u.subscription_expiry && new Date(u.subscription_expiry) < new Date());
        }
        return u.subscription_status === subscriptionFilter;
      });
    }

    return filtered;
  }, [users, searchTerm, roleFilter, subscriptionFilter]);

  // Pagination
  const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setSelectedRole(user.role || 'free');
    setSelectedCapabilities(user.capabilities || []);
  };

  const handleRoleChange = (role) => {
    setSelectedRole(role);
    if (role === 'admin') {
      // Set default admin capabilities
      setSelectedCapabilities(DEFAULT_ADMIN_CAPABILITIES);
    } else if (role === 'super_admin') {
      // Only super admin can assign super_admin role
      if (!superAdmin) {
        toast.error('Only Super Admin can assign Super Admin role');
        return;
      }
      // Super admin has all capabilities
      setSelectedCapabilities(Object.values(ADMIN_CAPABILITIES));
    } else {
      setSelectedCapabilities([]);
    }
  };

  const toggleCapability = (capability) => {
    // Prevent regular admins from assigning super admin capabilities
    if (!superAdmin && (
      capability === ADMIN_CAPABILITIES.CREATE_ADMINS ||
      capability === ADMIN_CAPABILITIES.DELETE_ADMINS ||
      capability === ADMIN_CAPABILITIES.EDIT_ADMIN_PERMISSIONS ||
      capability === ADMIN_CAPABILITIES.MANAGE_SYSTEM_SETTINGS ||
      capability === ADMIN_CAPABILITIES.MANAGE_DATABASE ||
      capability === ADMIN_CAPABILITIES.MANAGE_BACKUPS
    )) {
      toast.error('Only Super Admin can assign this capability');
      return;
    }

    if (selectedCapabilities.includes(capability)) {
      setSelectedCapabilities(selectedCapabilities.filter(c => c !== capability));
    } else {
      setSelectedCapabilities([...selectedCapabilities, capability]);
    }
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;

    // Prevent regular admins from creating other admins
    if (!superAdmin && (selectedRole === 'admin' || selectedRole === 'super_admin')) {
      toast.error('Only Super Admin can assign admin roles');
      return;
    }

    // Prevent changing super admin role
    if (selectedUser.email === SUPER_ADMIN_EMAIL && selectedRole !== 'super_admin') {
      toast.error('Cannot change Super Admin role');
      return;
    }

    try {
      // Update user role and capabilities via API
      await Api.updateUserRole(selectedUser.id, {
        role: selectedRole,
        capabilities: selectedCapabilities
      });

      // Update local state
      const updatedUsers = users.map(u => 
        u.id === selectedUser.id 
          ? { ...u, role: selectedRole, capabilities: selectedCapabilities }
          : u
      );
      setUsers(updatedUsers);
      
      if (selectedRole === 'admin' || selectedRole === 'super_admin') {
        loadAdmins();
      }

      toast.success('User role and capabilities updated successfully!', {
        position: "bottom-right",
        autoClose: 3000,
      });
      setSelectedUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user: ' + (error.message || 'Unknown error'), {
        position: "bottom-right",
        autoClose: 3000,
      });
    }
  };

  const handleSaveSubscription = async () => {
    if (!selectedSubUser) return;

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/admin/users/${selectedSubUser.id}/subscription`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          subscription_status: subscriptionStatus,
          subscription_plan: subscriptionPlan || null,
          subscription_expiry: subscriptionExpiry || null
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to update subscription');
      }

      // Reload users to get updated data
      await loadUsers();

      toast.success('Subscription updated successfully!', {
        position: "bottom-right",
        autoClose: 3000,
      });
      setSelectedSubUser(null);
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast.error('Failed to update subscription: ' + (error.message || 'Unknown error'), {
        position: "bottom-right",
        autoClose: 3000,
      });
    }
  };

  const handleDeleteAdmin = (adminUser) => {
    if (!superAdmin) {
      toast.error('Only Super Admin can remove admin privileges');
      return;
    }
    if (adminUser.email === SUPER_ADMIN_EMAIL) {
      toast.warning('Cannot delete Super Admin account!', {
        position: "bottom-right",
        autoClose: 3000,
      });
      return;
    }
    setDeleteAdminModal({ isOpen: true, adminUser });
  };

  const confirmDeleteAdmin = async () => {
    const { adminUser } = deleteAdminModal;
    if (!adminUser) return;

    try {
      await Api.updateUserRole(adminUser.id, {
        role: 'free',
        capabilities: []
      });

      const updatedUsers = users.map(u => 
        u.id === adminUser.id 
          ? { ...u, role: 'free', capabilities: [] }
          : u
      );
      setUsers(updatedUsers);
      loadAdmins();
      toast.success('Admin privileges removed successfully!', {
        position: "bottom-right",
        autoClose: 3000,
      });
      setDeleteAdminModal({ isOpen: false, adminUser: null });
    } catch (error) {
      console.error('Error removing admin:', error);
      toast.error('Failed to remove admin: ' + (error.message || 'Unknown error'), {
        position: "bottom-right",
        autoClose: 3000,
      });
      setDeleteAdminModal({ isOpen: false, adminUser: null });
    }
  };

  const groupedCapabilities = Object.values(ADMIN_CAPABILITIES).reduce((acc, cap) => {
    const category = getCapabilityCategory(cap);
    if (!acc[category]) acc[category] = [];
    acc[category].push(cap);
    return acc;
  }, {});

  // Get available capabilities for current user
  const getAvailableCapabilities = () => {
    if (superAdmin) {
      return Object.values(ADMIN_CAPABILITIES);
    }
    // Regular admins can't assign super admin capabilities
    return Object.values(ADMIN_CAPABILITIES).filter(cap => 
      cap !== ADMIN_CAPABILITIES.CREATE_ADMINS &&
      cap !== ADMIN_CAPABILITIES.DELETE_ADMINS &&
      cap !== ADMIN_CAPABILITIES.EDIT_ADMIN_PERMISSIONS &&
      cap !== ADMIN_CAPABILITIES.MANAGE_SYSTEM_SETTINGS &&
      cap !== ADMIN_CAPABILITIES.MANAGE_DATABASE &&
      cap !== ADMIN_CAPABILITIES.MANAGE_BACKUPS
    );
  };

  if (loading) {
    return <div className="settings-loading">Loading...</div>;
  }

  if (!superAdmin && !admin) {
    return null;
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Admin Panel</h1>
        {superAdmin && (
          <div className="super-admin-badge">
            <FaCrown style={{ marginRight: '8px' }} />
            <span>Super Admin</span>
          </div>
        )}
        {admin && !superAdmin && (
          <div className="admin-badge">
            <FaUserShield style={{ marginRight: '8px' }} />
            <span>Admin</span>
          </div>
        )}
      </div>

      <div className="settings-tabs">
        {superAdmin && (
          <>
            <button 
              className={activeTab === 'users' ? 'active' : ''}
              onClick={() => setActiveTab('users')}
            >
              Users ({users.length})
            </button>
            <button 
              className={activeTab === 'admins' ? 'active' : ''}
              onClick={() => setActiveTab('admins')}
            >
              Admins ({admins.length})
            </button>
            <button 
              className={activeTab === 'subscriptions' ? 'active' : ''}
              onClick={() => setActiveTab('subscriptions')}
            >
              Subscriptions
            </button>
            <button 
              className={activeTab === 'capabilities' ? 'active' : ''}
              onClick={() => setActiveTab('capabilities')}
            >
              Capabilities
            </button>
          </>
        )}
      </div>

      {activeTab === 'users' && superAdmin && (
        <div className="settings-content">
          <div className="settings-section">
            <div className="search-and-filters">
              <div className="search-box">
                <FaSearch style={{ marginRight: '10px', color: '#8B5CF6' }} />
                <input
                  type="text"
                  placeholder="Search by email, username, name, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button 
                    className="clear-search"
                    onClick={() => setSearchTerm('')}
                    title="Clear search"
                  >
                    <FaTimes />
                  </button>
                )}
              </div>
              
              <button 
                className="filter-toggle"
                onClick={() => setShowFilters(!showFilters)}
              >
                <FaFilter style={{ marginRight: '8px' }} />
                Filters {showFilters ? '▲' : '▼'}
              </button>
            </div>

            {showFilters && (
              <div className="filters-panel">
                <div className="filter-group">
                  <label>Role:</label>
                  <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                    <option value="all">All Roles</option>
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    <option value="a7fx">A7FX Elite</option>
                    <option value="admin">Admin</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Subscription:</label>
                  <select value={subscriptionFilter} onChange={(e) => setSubscriptionFilter(e.target.value)}>
                    <option value="all">All Subscriptions</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="premium">Premium (Aura FX)</option>
                    <option value="a7fx">A7FX Elite</option>
                    <option value="expired">Expired</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            )}

            <div className="results-info">
              <span>
                Showing {startIndex + 1}-{Math.min(endIndex, filteredUsers.length)} of {filteredUsers.length} users
                {searchTerm && ` (filtered from ${users.length} total)`}
              </span>
            </div>

            <div className="users-list">
              {paginatedUsers.length === 0 ? (
                <div className="no-results">
                  <p>No users found matching your criteria.</p>
                  {(searchTerm || roleFilter !== 'all' || subscriptionFilter !== 'all') && (
                    <button onClick={() => {
                      setSearchTerm('');
                      setRoleFilter('all');
                      setSubscriptionFilter('all');
                    }} className="btn-secondary">
                      Clear All Filters
                    </button>
                  )}
                </div>
              ) : (
                paginatedUsers.map(u => (
                  <div 
                    key={u.id} 
                    className={`user-item ${selectedUser?.id === u.id ? 'selected' : ''}`}
                    onClick={() => handleUserSelect(u)}
                  >
                    <div className="user-info">
                      <div className="user-email">{u.email}</div>
                      <div className="user-meta">
                        <span className={`role-badge role-${u.role || 'free'}`}>
                          {u.role || 'free'}
                        </span>
                        {u.subscription_status === 'active' && (
                          <span className="subscription-badge active">
                            {u.subscription_plan === 'a7fx' ? 'A7FX' : u.subscription_plan === 'aura' ? 'Premium' : 'Active'}
                          </span>
                        )}
                        {u.username && (
                          <span className="username">@{u.username}</span>
                        )}
                      </div>
                    </div>
                    {u.email === SUPER_ADMIN_EMAIL && (
                      <span className="super-admin-tag">
                        <FaCrown /> Super Admin
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="pagination-btn"
                >
                  <FaChevronLeft /> Previous
                </button>
                <span className="pagination-info">
                  Page {currentPage} of {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="pagination-btn"
                >
                  Next <FaChevronRight />
                </button>
              </div>
            )}

            {selectedUser && (
              <div className="user-edit-panel">
                <div className="panel-header">
                  <h3>Edit User: {selectedUser.email}</h3>
                  <button onClick={() => setSelectedUser(null)} className="close-btn">
                    <FaTimes />
                  </button>
                </div>
                
                <div className="form-group">
                  <label>Role</label>
                  <select 
                    value={selectedRole} 
                    onChange={(e) => handleRoleChange(e.target.value)}
                    disabled={selectedUser.email === SUPER_ADMIN_EMAIL}
                  >
                    <option value="free">Free</option>
                    <option value="premium">Premium (Aura FX)</option>
                    <option value="a7fx">A7FX Elite</option>
                    <option value="admin">Admin</option>
                    {superAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                  {selectedUser.email === SUPER_ADMIN_EMAIL && (
                    <p className="help-text">Super Admin role cannot be changed</p>
                  )}
                  {!superAdmin && (selectedRole === 'admin' || selectedRole === 'super_admin') && (
                    <p className="help-text warning">Only Super Admin can assign admin roles</p>
                  )}
                </div>

                {selectedRole === 'admin' && (
                  <div className="form-group">
                    <label>Admin Capabilities</label>
                    <div className="capabilities-list">
                      {Object.entries(groupedCapabilities).map(([category, caps]) => {
                        const availableCaps = caps.filter(cap => getAvailableCapabilities().includes(cap));
                        if (availableCaps.length === 0) return null;
                        
                        return (
                          <div key={category} className="capability-category">
                            <h4>{category}</h4>
                            {availableCaps.map(cap => (
                              <label key={cap} className="capability-item">
                                <input
                                  type="checkbox"
                                  checked={selectedCapabilities.includes(cap)}
                                  onChange={() => toggleCapability(cap)}
                                  disabled={selectedUser.email === SUPER_ADMIN_EMAIL}
                                />
                                <span>{getCapabilityName(cap)}</span>
                              </label>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="form-actions">
                  <button onClick={handleSaveUser} className="btn-primary">
                    Save Changes
                  </button>
                  <button onClick={() => setSelectedUser(null)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'admins' && superAdmin && (
        <div className="settings-content">
          <div className="settings-section">
            <h2>Admin Management</h2>
            <p className="help-text">
              Manage admin accounts. Only Super Admin can create or remove admins.
            </p>
            <div className="admins-list">
              {admins.length === 0 ? (
                <div className="no-results">No admins found.</div>
              ) : (
                admins.map(adminUser => (
                  <div key={adminUser.id} className="admin-item">
                    <div className="admin-info">
                      <div className="admin-email">
                        {adminUser.email}
                        {adminUser.email === SUPER_ADMIN_EMAIL && (
                          <span className="super-admin-tag">
                            <FaCrown /> Super Admin
                          </span>
                        )}
                      </div>
                      <div className="admin-role">
                        {adminUser.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                      </div>
                      {adminUser.capabilities && adminUser.capabilities.length > 0 && (
                        <div className="admin-capabilities">
                          {adminUser.capabilities.length} capabilities assigned
                        </div>
                      )}
                    </div>
                    {adminUser.email !== SUPER_ADMIN_EMAIL && (
                      <button 
                        onClick={() => handleDeleteAdmin(adminUser)}
                        className="btn-danger"
                      >
                        Remove Admin
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'capabilities' && superAdmin && (
        <div className="settings-content">
          <div className="settings-section">
            <h2>Admin Capabilities Reference</h2>
            <p className="help-text">
              These are all available capabilities that can be assigned to admins.
              Super Admin has all capabilities by default.
            </p>
            
            {Object.entries(groupedCapabilities).map(([category, caps]) => (
              <div key={category} className="capability-reference">
                <h3>{category}</h3>
                <ul>
                  {caps.map(cap => (
                    <li key={cap}>
                      <strong>{getCapabilityName(cap)}</strong>
                      <span className="capability-code">{cap}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'subscriptions' && superAdmin && (
        <div className="settings-content">
          <div className="settings-section">
            <h2>Subscription Management</h2>
            <p className="help-text">
              Manage user subscriptions manually. Changes will update user roles automatically.
            </p>
            
            <div className="search-box">
              <FaSearch style={{ marginRight: '10px', color: '#8B5CF6' }} />
              <input
                type="text"
                placeholder="Search users by email or username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="users-list">
              {filteredUsers.slice(0, 100).map(u => (
                <div 
                  key={u.id} 
                  className={`user-item ${selectedSubUser?.id === u.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedSubUser(u);
                    setSubscriptionStatus(u.subscription_status || 'inactive');
                    setSubscriptionPlan(u.subscription_plan || 'aura');
                    if (u.subscription_expiry) {
                      const expiryDate = new Date(u.subscription_expiry);
                      setSubscriptionExpiry(expiryDate.toISOString().split('T')[0]);
                    } else {
                      setSubscriptionExpiry('');
                    }
                  }}
                >
                  <div className="user-info">
                    <div className="user-email">{u.email}</div>
                    <div className="user-role">
                      {u.role || 'free'} | 
                      {u.subscription_status || 'inactive'} | 
                      {u.subscription_plan || 'none'}
                    </div>
                    {u.subscription_expiry && (
                      <div className="user-subscription-expiry">
                        Expires: {new Date(u.subscription_expiry).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {selectedSubUser && (
              <div className="user-edit-panel">
                <div className="panel-header">
                  <h3>Manage Subscription: {selectedSubUser.email}</h3>
                  <button onClick={() => setSelectedSubUser(null)} className="close-btn">
                    <FaTimes />
                  </button>
                </div>
                
                <div className="form-group">
                  <label>Subscription Status</label>
                  <select 
                    value={subscriptionStatus} 
                    onChange={(e) => setSubscriptionStatus(e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Subscription Plan</label>
                  <select 
                    value={subscriptionPlan} 
                    onChange={(e) => setSubscriptionPlan(e.target.value)}
                  >
                    <option value="aura">Aura FX (£99/month)</option>
                    <option value="a7fx">A7FX Elite (£250/month)</option>
                    <option value="">None (Free)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Expiry Date</label>
                  <input
                    type="date"
                    value={subscriptionExpiry}
                    onChange={(e) => setSubscriptionExpiry(e.target.value)}
                    placeholder="Leave empty for no expiry"
                  />
                  <p className="help-text">
                    Leave empty for no expiry. Format: YYYY-MM-DD
                  </p>
                </div>

                <div className="form-actions">
                  <button onClick={handleSaveSubscription} className="btn-primary">
                    Save Subscription Changes
                  </button>
                  <button onClick={() => setSelectedSubUser(null)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={deleteAdminModal.isOpen}
        onClose={() => setDeleteAdminModal({ isOpen: false, adminUser: null })}
        onConfirm={confirmDeleteAdmin}
        title="Remove Admin Privileges"
        message={`Are you sure you want to remove admin privileges from ${deleteAdminModal.adminUser?.email || 'this user'}? They will be downgraded to a free user.`}
        confirmText="Remove Admin"
        cancelText="Cancel"
        type="warning"
      />
    </div>
  );
};

export default Settings;
