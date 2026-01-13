import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import "../styles/Profile.css";
import { useNavigate } from 'react-router-dom';
import CosmicBackground from '../components/CosmicBackground';
import { validateUsername, canChangeUsername, getCooldownMessage } from '../utils/usernameValidation';

const resolveApiBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return process.env.REACT_APP_API_URL || 'https://aurafx.com';
};

// Helper function to ensure avatar path is valid
const getAvatarPath = (avatarName) => {
    // If it's a base64 data URL, return it directly
    if (avatarName && avatarName.startsWith('data:image')) {
        return avatarName;
    }
    
    const availableAvatars = [
        'avatar_ai.png',
        'avatar_money.png',
        'avatar_tech.png',
        'avatar_trading.png'
    ];
    return availableAvatars.includes(avatarName)
        ? `/avatars/${avatarName}`
        : '/avatars/avatar_ai.png';
};

// Helper function to convert file to base64
const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

const Profile = () => {
    // eslint-disable-next-line no-unused-vars
    const { user, setUser } = useAuth();
    const [editField, setEditField] = useState(null);
    const [status, setStatus] = useState("");
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        phone: "",
        address: "",
        avatar: "avatar_ai.png",
        name: "",
        bio: "",
        level: 1,
        xp: 0
    });
    const [avatarPreview, setAvatarPreview] = useState(null);
    const fileInputRef = React.useRef(null);
    const [loading, setLoading] = useState(true);
    const [editedUserData, setEditedUserData] = useState({});
    const [userRole, setUserRole] = useState("");
    // eslint-disable-next-line no-unused-vars
    const [isEditing, setIsEditing] = useState(false);
    // eslint-disable-next-line no-unused-vars
    const navigate = useNavigate();
    const [lastUsernameChange, setLastUsernameChange] = useState(null);
    const [usernameValidationError, setUsernameValidationError] = useState("");
    const [usernameCooldownInfo, setUsernameCooldownInfo] = useState(null);

    // Function to update local storage with user profile data
    const updateLocalUserData = (data) => {
        const currentUser = JSON.parse(localStorage.getItem('userData') || '{}');
        const updatedUser = { ...currentUser, ...data };
        localStorage.setItem('userData', JSON.stringify(updatedUser));
    };

    // Load user data from local storage on initial render
    useEffect(() => {
        const storedUserData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (storedUserData) {
            setFormData(prev => ({
                ...prev,
                ...storedUserData
            }));
        }
    }, []);

    useEffect(() => {
        const loadProfile = async () => {
            if (!user?.id) return;

            // First, set data from auth context
            const authData = {
                username: user.username || "",
                email: user.email || "",
                phone: user.phone || "",
                address: user.address || "",
                avatar: user.avatar || "avatar_ai.png",
                name: user.name || "",
                level: user.level || 1,
                xp: user.xp || 0
            };

            setFormData(prev => ({
                ...prev,
                ...authData
            }));

            // Set avatar preview if it's a base64 image
            if (authData.avatar && authData.avatar.startsWith('data:image')) {
                setAvatarPreview(authData.avatar);
            }

            // Set user role
            setUserRole(user.role || "");

            // Try to fetch additional profile data from the backend
            try {
                const token = localStorage.getItem("token");
                if (token) {
                    const response = await axios.get(
                        `${resolveApiBaseUrl()}/api/users/${user.id}`,
                        {
                            headers: {
                                Authorization: `Bearer ${token}`
                            }
                        }
                    );

                    if (response.status === 200) {
                        const userData = response.data;
                        const backendData = {
                            username: userData.username || authData.username,
                            email: userData.email || authData.email,
                            phone: userData.phone || authData.phone,
                            address: userData.address || authData.address,
                            avatar: userData.avatar || authData.avatar,
                            name: userData.name || authData.name,
                            bio: userData.bio || "",
                            level: userData.level || authData.level,
                            xp: userData.xp || authData.xp
                        };
                        
                        // Store last username change date if available
                        if (userData.last_username_change) {
                            setLastUsernameChange(userData.last_username_change);
                            const cooldownCheck = canChangeUsername(userData.last_username_change);
                            setUsernameCooldownInfo(cooldownCheck);
                        }

                        setFormData(prev => ({
                            ...prev,
                            ...backendData
                        }));

                        // Set avatar preview if it's a base64 image
                        if (backendData.avatar && backendData.avatar.startsWith('data:image')) {
                            setAvatarPreview(backendData.avatar);
                        }

                        // Save to local storage
                        updateLocalUserData(backendData);
                    }
                }
            } catch (err) {
                console.error("Error fetching profile data:", err);
                // Use auth context data as fallback
            } finally {
                setLoading(false);
            }
        };

        loadProfile();
    }, [user]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setEditedUserData(prev => ({
            ...prev,
            [name]: value
        }));
        
        // If avatar dropdown changed, clear preview
        if (name === 'avatar' && !value.startsWith('data:image')) {
            setAvatarPreview(null);
        }
    };

    const handleAvatarUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            setStatus("Please select an image file.");
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            setStatus("Image size must be less than 5MB.");
            return;
        }

        try {
            // Convert to base64
            const base64Image = await convertToBase64(file);
            
            // Update form data with base64 image
            setFormData(prev => ({
                ...prev,
                avatar: base64Image
            }));
            
            // Set preview
            setAvatarPreview(base64Image);
            
            setStatus("Image uploaded successfully. Click 'SAVE PROFILE' to save.");
        } catch (error) {
            console.error("Error converting image:", error);
            setStatus("Failed to process image. Please try again.");
        }
    };

    const handleSave = async (field) => {
        if (!user?.id) {
            setStatus("Cannot update — user ID missing.");
            return;
        }

        // Special validation for username
        if (field === 'username') {
            const validation = validateUsername(formData.username);
            if (!validation.valid) {
                setUsernameValidationError(validation.error);
                setStatus(validation.error);
                return;
            }
            
            // Check cooldown
            if (lastUsernameChange) {
                const cooldownCheck = canChangeUsername(lastUsernameChange);
                if (!cooldownCheck.canChange) {
                    setUsernameValidationError(getCooldownMessage(cooldownCheck.daysRemaining));
                    setStatus(getCooldownMessage(cooldownCheck.daysRemaining));
                    return;
                }
            }
            
            setUsernameValidationError("");
        }

        try {
            const res = await axios.put(
                `${resolveApiBaseUrl()}/api/users/${user.id}/update`,
                { 
                    [field]: formData[field],
                    ...(field === 'username' ? { updateUsername: true } : {})
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${localStorage.getItem("token")}`
                    }
                }
            );

            if (res.status === 200 && res.data.success) {
                setStatus("✅ Saved successfully!");
                
                // If username was updated, update cooldown info
                if (field === 'username' && res.data.user?.last_username_change) {
                    setLastUsernameChange(res.data.user.last_username_change);
                    const cooldownCheck = canChangeUsername(res.data.user.last_username_change);
                    setUsernameCooldownInfo(cooldownCheck);
                }
                
                // Update with server response data
                const serverValue = res.data.user?.[field] || formData[field];
                const updatedData = {
                    ...formData,
                    [field]: serverValue
                };
                setFormData(updatedData);
                setEditedUserData(prev => ({
                    ...prev,
                    [field]: serverValue
                }));
                
                // Update local storage with the new value
                updateLocalUserData({ [field]: serverValue });
                
                // Update auth context
                if (setUser) {
                    setUser(prev => ({
                        ...prev,
                        [field]: serverValue
                    }));
                }
                
                // Update localStorage 'user' object
                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                storedUser[field] = serverValue;
                localStorage.setItem('user', JSON.stringify(storedUser));
                
                // Clear status after 2 seconds
                setTimeout(() => {
                    setStatus("");
                }, 2000);
            } else {
                setStatus("❌ Update failed.");
            }

            setEditField(null);
        } catch (err) {
            console.error(err);
            if (err.response?.data?.message) {
                setStatus(err.response.data.message);
                if (field === 'username') {
                    setUsernameValidationError(err.response.data.message);
                }
            } else {
                setStatus("Server error.");
            }
        }
    };

    const handleEditToggle = () => {
        if (editField) {
            setEditField(null);
        } else {
            setEditedUserData(formData);
        }
    };

    const handleSaveChanges = async () => {
        if (!user?.id) {
            setStatus("Cannot update — user ID missing.");
            return;
        }

        // Validate username if it's being updated
        if (formData.username) {
            const validation = validateUsername(formData.username);
            if (!validation.valid) {
                setStatus(validation.error);
                setUsernameValidationError(validation.error);
                return;
            }
            
            // Check cooldown if username is changing
            if (lastUsernameChange) {
                const cooldownCheck = canChangeUsername(lastUsernameChange);
                if (!cooldownCheck.canChange) {
                    setStatus(getCooldownMessage(cooldownCheck.daysRemaining));
                    setUsernameValidationError(getCooldownMessage(cooldownCheck.daysRemaining));
                    return;
                }
            }
        }

        // Prepare data to save
        const dataToSave = {
            name: formData.name || "",
            username: formData.username || "",
            email: formData.email || "",
            phone: formData.phone || "",
            address: formData.address || "",
            bio: formData.bio || "",
            avatar: formData.avatar || "avatar_ai.png"
        };

        // Optimistic update - update UI immediately
        setFormData(prev => ({
            ...prev,
            ...dataToSave
        }));
        
        setEditedUserData(dataToSave);
        updateLocalUserData(dataToSave);
        
        // Update auth context immediately
        if (setUser) {
            setUser(prev => ({
                ...prev,
                ...dataToSave
            }));
        }

        // Also update localStorage 'user' object
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const updatedStoredUser = { ...storedUser, ...dataToSave };
        localStorage.setItem('user', JSON.stringify(updatedStoredUser));

        setStatus("Saving...");

        try {
            // Save to database
            const res = await axios.put(
                `${resolveApiBaseUrl()}/api/users/${user.id}/update`,
                {
                    ...dataToSave,
                    ...(formData.username ? { updateUsername: true } : {})
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${localStorage.getItem("token")}`
                    }
                }
            );

            if (res.status === 200 && res.data.success) {
                setStatus("✅ Profile saved successfully!");
                
                // Update with server response data (includes last_username_change)
                if (res.data.user) {
                    const serverData = {
                        name: res.data.user.name || dataToSave.name,
                        username: res.data.user.username || dataToSave.username,
                        email: res.data.user.email || dataToSave.email,
                        phone: res.data.user.phone || dataToSave.phone,
                        address: res.data.user.address || dataToSave.address,
                        bio: res.data.user.bio || dataToSave.bio,
                        avatar: res.data.user.avatar || dataToSave.avatar
                    };
                    
                    setFormData(prev => ({
                        ...prev,
                        ...serverData
                    }));
                    
                    updateLocalUserData(serverData);
                    
                    if (setUser) {
                        setUser(prev => ({
                            ...prev,
                            ...serverData
                        }));
                    }
                    
                    // Update last_username_change if provided
                    if (res.data.user.last_username_change) {
                        setLastUsernameChange(res.data.user.last_username_change);
                        const cooldownCheck = canChangeUsername(res.data.user.last_username_change);
                        setUsernameCooldownInfo(cooldownCheck);
                    }
                    
                    // Update localStorage 'user' object
                    const updatedUser = { ...updatedStoredUser, ...serverData };
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                }
                
                // Clear status after 3 seconds
                setTimeout(() => {
                    setStatus("");
                }, 3000);
            } else {
                setStatus("❌ Update failed. Please try again.");
                // Revert optimistic update on failure
                // Reload from server
                const refreshResponse = await axios.get(
                    `${resolveApiBaseUrl()}/api/users/${user.id}`,
                    {
                        headers: {
                            Authorization: `Bearer ${localStorage.getItem("token")}`
                        }
                    }
                );
                if (refreshResponse.status === 200) {
                    const userData = refreshResponse.data;
                    setFormData(prev => ({
                        ...prev,
                        name: userData.name || "",
                        username: userData.username || "",
                        email: userData.email || "",
                        phone: userData.phone || "",
                        address: userData.address || "",
                        bio: userData.bio || "",
                        avatar: userData.avatar || "avatar_ai.png"
                    }));
                }
            }

            setEditField(null);
        } catch (err) {
            console.error("Error updating profile:", err);
            
            // Revert optimistic update on error
            const refreshResponse = await axios.get(
                `${resolveApiBaseUrl()}/api/users/${user.id}`,
                {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`
                    }
                }
            ).catch(() => null);
            
            if (refreshResponse && refreshResponse.status === 200) {
                const userData = refreshResponse.data;
                setFormData(prev => ({
                    ...prev,
                    name: userData.name || "",
                    username: userData.username || "",
                    email: userData.email || "",
                    phone: userData.phone || "",
                    address: userData.address || "",
                    bio: userData.bio || "",
                    avatar: userData.avatar || "avatar_ai.png"
                }));
            }
            
            const errorMessage = err.response?.data?.message || err.message || "Failed to update profile. Please try again.";
            setStatus(`❌ ${errorMessage}`);
            
            if (err.response?.data?.message && formData.username) {
                setUsernameValidationError(err.response.data.message);
            }
        }
    };

    const fields = [
        { label: "Full Name", name: "name", editable: true },
        { label: "Username", name: "username", editable: true },
        { label: "Email", name: "email", editable: true },
        { label: "Phone", name: "phone", editable: true },
        { label: "Address", name: "address", editable: true },
        { label: "Bio", name: "bio", editable: true }
    ];

    if (loading) {
        return <div className="profile-container"><div className="loading">Loading...</div></div>;
    }

    return (
        <div className="profile-container">
            <CosmicBackground />
            <div className="profile-content">
                <div className="profile-header">
                    <h1 className="profile-title">MY PROFILE</h1>
                </div>
                
                <div className="profile-box">
                    <div className="avatar-section">
                        <img
                            src={avatarPreview || getAvatarPath(formData.avatar)}
                            alt="Avatar"
                            className="profile-avatar"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = "/avatars/avatar_ai.png";
                            }}
                        />
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            style={{ display: 'none' }}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                background: 'rgba(255, 215, 0, 0.1)',
                                color: 'var(--gold-primary)',
                                border: '1px solid rgba(255, 215, 0, 0.3)',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                marginBottom: '10px',
                                width: '100%',
                                maxWidth: '200px',
                                transition: 'all 0.3s ease'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.background = 'rgba(255, 215, 0, 0.2)';
                                e.target.style.borderColor = 'rgba(255, 215, 0, 0.5)';
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.background = 'rgba(255, 215, 0, 0.1)';
                                e.target.style.borderColor = 'rgba(255, 215, 0, 0.3)';
                            }}
                        >
                            📷 Upload Photo
                        </button>
                        <select
                            name="avatar"
                            value={formData.avatar.startsWith('data:image') ? 'custom' : formData.avatar}
                            onChange={(e) => {
                                if (e.target.value === 'custom') {
                                    fileInputRef.current?.click();
                                } else {
                                    handleChange(e);
                                }
                            }}
                        >
                            <option value="avatar_ai.png">AI Avatar</option>
                            <option value="avatar_money.png">Money Avatar</option>
                            <option value="avatar_tech.png">Tech Avatar</option>
                            <option value="avatar_trading.png">Trading Avatar</option>
                            {formData.avatar.startsWith('data:image') && (
                                <option value="custom">Custom Image (Current)</option>
                            )}
                        </select>
                    </div>

                    <div className="profile-stats">
                        <div className="profile-level">
                            🧠 <strong>Level:</strong> {formData.level || 1}
                        </div>
                        <div className="profile-xp">
                            🎯 <strong>XP:</strong> {formData.xp || 0}
                        </div>
                    </div>
                    
                    {formData.level && (
                        <div className="xp-progress-container">
                            <div className="xp-progress-bar" 
                                style={{
                                    width: `${(formData.xp / (formData.level * 100)) * 100}%`
                                }}>
                            </div>
                        </div>
                    )}

                    <div className="info-section">
                        {fields.map(({ label, name, editable }) => (
                            <div key={name} className="profile-field">
                                <strong>{label}:</strong>{" "}
                                {editField === name ? (
                                    <>
                                        {name === "bio" ? (
                                            <textarea
                                                name={name}
                                                value={formData[name]}
                                                onChange={handleChange}
                                                rows={3}
                                                cols={40}
                                            />
                                        ) : (
                                            <input
                                                type="text"
                                                name={name}
                                                value={formData[name]}
                                                onChange={(e) => {
                                                    handleChange(e);
                                                    // Real-time validation for username
                                                    if (name === 'username') {
                                                        const validation = validateUsername(e.target.value);
                                                        if (!validation.valid) {
                                                            setUsernameValidationError(validation.error);
                                                        } else {
                                                            setUsernameValidationError("");
                                                        }
                                                    }
                                                }}
                                                placeholder={name === 'username' ? 'Letters, numbers, spaces allowed' : ''}
                                            />
                                        )}
                                        {name === 'username' && usernameValidationError && (
                                            <div style={{ 
                                                color: '#ff6b6b', 
                                                fontSize: '12px', 
                                                marginTop: '4px',
                                                marginBottom: '4px'
                                            }}>
                                                {usernameValidationError}
                                            </div>
                                        )}
                                        {name === 'username' && usernameCooldownInfo && !usernameCooldownInfo.canChange && (
                                            <div style={{ 
                                                color: '#ffa500', 
                                                fontSize: '12px', 
                                                marginTop: '4px',
                                                marginBottom: '4px'
                                            }}>
                                                {getCooldownMessage(usernameCooldownInfo.daysRemaining)}
                                            </div>
                                        )}
                                        <button 
                                            onClick={() => handleSave(name)}
                                            disabled={name === 'username' && (!!usernameValidationError || (usernameCooldownInfo && !usernameCooldownInfo.canChange))}
                                        >
                                            Save
                                        </button>
                                        <button onClick={() => {
                                            setEditField(null);
                                            setUsernameValidationError("");
                                        }}>Cancel</button>
                                    </>
                                ) : (
                                    <>
                                        <span>{formData[name] ? formData[name] : <i>None</i>}</span>
                                        {editable && (
                                            <button onClick={() => {
                                                setEditField(name);
                                                if (name === 'username' && lastUsernameChange) {
                                                    const cooldownCheck = canChangeUsername(lastUsernameChange);
                                                    setUsernameCooldownInfo(cooldownCheck);
                                                }
                                            }}>
                                                Change
                                                {name === 'username' && usernameCooldownInfo && !usernameCooldownInfo.canChange && (
                                                    <span style={{ fontSize: '10px', display: 'block', color: '#ffa500' }}>
                                                        ({usernameCooldownInfo.daysRemaining} days)
                                                    </span>
                                                )}
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    {userRole && (
                        <div className="user-role">
                            <strong>Role:</strong> {userRole}
                        </div>
                    )}

                    <div className="profile-actions">
                        <button className="action-button save-button" onClick={handleSaveChanges}>
                            SAVE PROFILE
                        </button>
                    </div>
                </div>

                {status && <p className="status-msg">{status}</p>}
            </div>
        </div>
    );
};

export default Profile;
