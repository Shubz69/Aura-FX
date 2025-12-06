import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import "../styles/Profile.css";
import { useNavigate } from 'react-router-dom';
import BinaryBackground from '../components/BinaryBackground';

const resolveApiBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return process.env.REACT_APP_API_URL || 'https://theglitch.world';
};

// Helper function to ensure avatar path is valid
const getAvatarPath = (avatarName) => {
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
    const [loading, setLoading] = useState(true);
    const [editedUserData, setEditedUserData] = useState({});
    const [userRole, setUserRole] = useState("");
    // eslint-disable-next-line no-unused-vars
    const [isEditing, setIsEditing] = useState(false);
    // eslint-disable-next-line no-unused-vars
    const navigate = useNavigate();

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

                        setFormData(prev => ({
                            ...prev,
                            ...backendData
                        }));

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
    };

    const handleSave = async (field) => {
        if (!user?.id) {
            setStatus("Cannot update — user ID missing.");
            return;
        }

        try {
            const res = await axios.put(
                `${resolveApiBaseUrl()}/api/users/${user.id}/update`,
                { [field]: formData[field] },
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${localStorage.getItem("token")}`
                    }
                }
            );

            if (res.status === 200) {
                setStatus("Profile updated successfully.");
                
                // Update both states with the new value
                const updatedData = {
                    ...formData,
                    [field]: formData[field]
                };
                setFormData(updatedData);
                setEditedUserData(prev => ({
                    ...prev,
                    [field]: formData[field]
                }));
                
                // Update local storage with the new value
                updateLocalUserData({ [field]: formData[field] });
            } else {
                setStatus("Update failed.");
            }

            setEditField(null);
        } catch (err) {
            console.error(err);
            setStatus("Server error.");
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
        try {
            const res = await axios.put(
                `${resolveApiBaseUrl()}/api/users/${user.id}/update`,
                editedUserData,
                {
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${localStorage.getItem("token")}`
                    }
                }
            );

            if (res.status === 200) {
                setStatus("Profile updated successfully.");
                
                // Update form data with the edited data
                setFormData(prev => ({
                    ...prev,
                    ...editedUserData
                }));
                
                // Save to local storage for persistence
                updateLocalUserData(editedUserData);
            } else {
                setStatus("Update failed.");
            }

            setEditField(null);
        } catch (err) {
            console.error("Error updating profile:", err);
            setStatus("Failed to update profile");
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
            <BinaryBackground />
            <div className="profile-content">
                <div className="profile-header">
                    <h1 className="profile-title">MY PROFILE</h1>
                </div>
                
                <div className="profile-box">
                    <div className="avatar-section">
                        <img
                            src={getAvatarPath(formData.avatar)}
                            alt="Avatar"
                            className="profile-avatar"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = "/avatars/avatar_ai.png";
                            }}
                        />
                        <select
                            name="avatar"
                            value={formData.avatar}
                            onChange={handleChange}
                        >
                            <option value="avatar_ai.png">AI Avatar</option>
                            <option value="avatar_money.png">Money Avatar</option>
                            <option value="avatar_tech.png">Tech Avatar</option>
                            <option value="avatar_trading.png">Trading Avatar</option>
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
                                                onChange={handleChange}
                                            />
                                        )}
                                        <button onClick={() => handleSave(name)}>Save</button>
                                    </>
                                ) : (
                                    <>
                                        <span>{formData[name] ? formData[name] : <i>None</i>}</span>
                                        {editable && (
                                            <button onClick={() => setEditField(name)}>Change</button>
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
                        {editField ? (
                            <>
                                <button className="action-button save-button" onClick={handleSaveChanges}>
                                    Save Changes
                                </button>
                                <button className="action-button cancel-button" onClick={handleEditToggle}>
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button className="action-button edit-button" onClick={handleEditToggle}>
                                Edit Profile
                            </button>
                        )}
                    </div>
                </div>

                {status && <p className="status-msg">{status}</p>}
            </div>
        </div>
    );
};

export default Profile;
