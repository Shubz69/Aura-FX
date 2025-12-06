import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { 
  isSuperAdmin, 
  isAdmin, 
  ADMIN_CAPABILITIES,
  DEFAULT_ADMIN_CAPABILITIES,
  getCapabilityName,
  getCapabilityCategory,
  SUPER_ADMIN_EMAIL
} from '../utils/roles';
import Api from '../services/Api';
import ConfirmationModal from '../components/ConfirmationModal';
import { toast } from 'react-toastify';
import '../styles/Settings.css';

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
  const [activeTab, setActiveTab] = useState('users');
  const [deleteAdminModal, setDeleteAdminModal] = useState({ isOpen: false, adminUser: null });

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

  const loadUsers = async () => {
    try {
      // This would call your API to get all users
      // For now, we'll use a placeholder
      const response = await Api.getUsers?.() || { data: [] };
      setUsers(response.data || []);
    } catch (error) {
      console.error('Error loading users:', error);
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
      // Super admin has all capabilities
      setSelectedCapabilities(Object.values(ADMIN_CAPABILITIES));
    } else {
      setSelectedCapabilities([]);
    }
  };

  const toggleCapability = (capability) => {
    if (selectedCapabilities.includes(capability)) {
      setSelectedCapabilities(selectedCapabilities.filter(c => c !== capability));
    } else {
      setSelectedCapabilities([...selectedCapabilities, capability]);
    }
  };

  const handleSaveUser = async () => {
    if (!selectedUser) return;

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
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      setSelectedUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      toast.error('Failed to update user: ' + (error.message || 'Unknown error'), {
        position: "bottom-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  };

  const handleDeleteAdmin = (adminUser) => {
    if (!superAdmin) return;
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

  const filteredUsers = users.filter(u => 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedCapabilities = Object.values(ADMIN_CAPABILITIES).reduce((acc, cap) => {
    const category = getCapabilityCategory(cap);
    if (!acc[category]) acc[category] = [];
    acc[category].push(cap);
    return acc;
  }, {});

  if (loading) {
    return <div className="settings-loading">Loading...</div>;
  }

  if (!superAdmin && !admin) {
    return null;
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>Settings</h1>
        {superAdmin && (
          <div className="super-admin-badge">
            <span>🔐 Super Admin</span>
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
              User Management
            </button>
            <button 
              className={activeTab === 'admins' ? 'active' : ''}
              onClick={() => setActiveTab('admins')}
            >
              Admin Management
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
            <h2>User Management</h2>
            <div className="search-box">
              <input
                type="text"
                placeholder="Search users by email or username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="users-list">
              {filteredUsers.map(u => (
                <div 
                  key={u.id} 
                  className={`user-item ${selectedUser?.id === u.id ? 'selected' : ''}`}
                  onClick={() => handleUserSelect(u)}
                >
                  <div className="user-info">
                    <div className="user-email">{u.email}</div>
                    <div className="user-role">{u.role || 'free'}</div>
                  </div>
                  {u.email === SUPER_ADMIN_EMAIL && (
                    <span className="super-admin-tag">Super Admin</span>
                  )}
                </div>
              ))}
            </div>

            {selectedUser && (
              <div className="user-edit-panel">
                <h3>Edit User: {selectedUser.email}</h3>
                
                <div className="form-group">
                  <label>Role</label>
                  <select 
                    value={selectedRole} 
                    onChange={(e) => handleRoleChange(e.target.value)}
                    disabled={selectedUser.email === SUPER_ADMIN_EMAIL}
                  >
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                    <option value="admin">Admin</option>
                    {superAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                  {selectedUser.email === SUPER_ADMIN_EMAIL && (
                    <p className="help-text">Super Admin role cannot be changed</p>
                  )}
                </div>

                {selectedRole === 'admin' && (
                  <div className="form-group">
                    <label>Admin Capabilities</label>
                    <div className="capabilities-list">
                      {Object.entries(groupedCapabilities).map(([category, caps]) => (
                        <div key={category} className="capability-category">
                          <h4>{category}</h4>
                          {caps.map(cap => (
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
                      ))}
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
            <div className="admins-list">
              {admins.map(adminUser => (
                <div key={adminUser.id} className="admin-item">
                  <div className="admin-info">
                    <div className="admin-email">{adminUser.email}</div>
                    <div className="admin-role">
                      {adminUser.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                    </div>
                    {adminUser.capabilities && (
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
              ))}
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

