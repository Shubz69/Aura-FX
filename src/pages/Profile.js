import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import Api from "../services/Api";
import "../styles/Profile.css";
import { useNavigate } from 'react-router-dom';
import CosmicBackground from '../components/CosmicBackground';
import { validateUsername, canChangeUsername, getCooldownMessage } from '../utils/usernameValidation';
import {
    getRankTitle,
    getTierName,
    getTierColor,
    getLevelFromXP,
    getXPForNextLevel,
    getXPProgress,
    getNextRankMilestone
} from '../utils/xpSystem';

const resolveApiBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin;
    }
    return process.env.REACT_APP_API_URL || 'https://aurafx.com';
};

// Helper function to ensure avatar path is valid
const getAvatarPath = (avatarName) => {
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
    const { user, setUser } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');
    const [status, setStatus] = useState("");
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        phone: "",
        address: "",
        avatar: "avatar_ai.png",
        name: "",
        bio: "",
        banner: "",
        level: 1,
        xp: 0
    });
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [bannerPreview, setBannerPreview] = useState(null);
    const fileInputRef = React.useRef(null);
    const bannerInputRef = React.useRef(null);
    const [loading, setLoading] = useState(true);
    const [editedUserData, setEditedUserData] = useState({});
    const [userRole, setUserRole] = useState("");
    const navigate = useNavigate();
    const [lastUsernameChange, setLastUsernameChange] = useState(null);
    const [usernameValidationError, setUsernameValidationError] = useState("");
    const [usernameCooldownInfo, setUsernameCooldownInfo] = useState(null);
    const [loginStreak, setLoginStreak] = useState(0);
    const [achievements, setAchievements] = useState([]);
    const [tradingStats, setTradingStats] = useState({
        totalTrades: 0,
        winRate: 0,
        totalProfit: 0
    });

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

            // First, check localStorage for latest XP data (updated in real-time from Community)
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            
            // Set data from auth context, but prioritize localStorage for XP/level
            const authData = {
                username: user.username || storedUser.username || "",
                email: user.email || storedUser.email || "",
                phone: user.phone || storedUser.phone || "",
                address: user.address || storedUser.address || "",
                avatar: user.avatar || storedUser.avatar || "avatar_ai.png",
                name: user.name || storedUser.name || "",
                bio: user.bio || storedUser.bio || "",
                banner: user.banner || storedUser.banner || "",
                level: storedUser.level || user.level || 1,
                xp: storedUser.xp || user.xp || 0
            };

            setFormData(prev => ({
                ...prev,
                ...authData
            }));

            // Set avatar preview if it's a base64 image
            if (authData.avatar && authData.avatar.startsWith('data:image')) {
                setAvatarPreview(authData.avatar);
            }
            if (authData.banner && authData.banner.startsWith('data:image')) {
                setBannerPreview(authData.banner);
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
                        // Prioritize localStorage XP/level over backend (for real-time updates)
                        const backendData = {
                            username: userData.username || authData.username,
                            email: userData.email || authData.email,
                            phone: userData.phone || authData.phone,
                            address: userData.address || authData.address,
                            avatar: userData.avatar || authData.avatar,
                            name: userData.name || authData.name,
                            bio: userData.bio || authData.bio || "",
                            banner: userData.banner || authData.banner || "",
                            level: storedUser.level || userData.level || authData.level,
                            xp: storedUser.xp || userData.xp || authData.xp
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
                        if (backendData.banner && backendData.banner.startsWith('data:image')) {
                            setBannerPreview(backendData.banner);
                        }

                        // Load login streak and achievements
                        // Fetch latest streak from API (includes daily login check) - non-blocking with timeout
                        // IMPORTANT: Only check if we haven't checked today (prevent duplicate XP awards)
                        const currentUserId = user?.id || userData.id;
                        if (currentUserId) {
                            const lastCheckKey = `daily_login_check_${currentUserId}`;
                            const lastCheckDate = localStorage.getItem(lastCheckKey);
                            const today = new Date().toDateString();
                            
                            // Only check if we haven't checked today
                            if (lastCheckDate !== today) {
                                // Use Promise.race to timeout after 3 seconds
                                const loginCheckPromise = Api.checkDailyLogin(currentUserId);
                                const timeoutPromise = new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('Timeout')), 3000)
                                );
                                
                                try {
                                    const loginResponse = await Promise.race([loginCheckPromise, timeoutPromise]);
                                    if (loginResponse.data && loginResponse.data.success) {
                                        // Mark that we checked today
                                        localStorage.setItem(lastCheckKey, today);
                                        
                                        setLoginStreak(loginResponse.data.streak || userData.login_streak || 0);
                                        
                                        // CRITICAL: Only update XP/level if XP was actually awarded (not already logged in)
                                        if (loginResponse.data.xpAwarded && !loginResponse.data.alreadyLoggedIn && loginResponse.data.xpAwarded > 0) {
                                            setFormData(prev => ({
                                                ...prev,
                                                xp: loginResponse.data.newXP,
                                                level: loginResponse.data.newLevel || prev.level
                                            }));
                                        }
                                        // If already logged in, don't update XP/level - just update streak display
                                    } else {
                                        setLoginStreak(userData.login_streak || 0);
                                    }
                                } catch (error) {
                                    // Fallback to stored value if API fails or times out
                                    // Don't mark as checked on error, so it can retry later
                                    console.warn('Daily login check failed or timed out, using stored value:', error);
                                    setLoginStreak(userData.login_streak || 0);
                                }
                            } else {
                                // Already checked today - just use stored streak
                                setLoginStreak(userData.login_streak || 0);
                            }
                        } else {
                            setLoginStreak(userData.login_streak || 0);
                        }
                        setAchievements(userData.achievements || []);

                        // Save to local storage
                        updateLocalUserData(backendData);
                    }
                }
            } catch (err) {
                console.error("Error fetching profile data:", err);
            } finally {
                setLoading(false);
            }
        };

        loadProfile();
        
        // Listen for XP update events from Community page
        const handleXPUpdate = (event) => {
            const { newXP, newLevel } = event.detail;
            setFormData(prev => ({
                ...prev,
                xp: newXP,
                level: newLevel
            }));
        };
        
        // Listen for level-up events
        const handleLevelUp = (event) => {
            const { newLevel } = event.detail;
            // Could show a toast notification here
            console.log(`🎉 Level Up! You reached level ${newLevel}!`);
        };
        
        window.addEventListener('xpUpdated', handleXPUpdate);
        window.addEventListener('levelUp', handleLevelUp);
        
        // Set up interval to refresh XP from localStorage every 1 second (for real-time updates)
        const xpRefreshInterval = setInterval(() => {
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            if (storedUser.xp !== undefined && storedUser.level !== undefined) {
                const currentXP = parseFloat(storedUser.xp || 0);
                const currentLevel = parseInt(storedUser.level || 1);
                
                setFormData(prev => {
                    // Only update if values actually changed to trigger re-render
                    const xpChanged = Math.abs(parseFloat(prev.xp || 0) - currentXP) > 0.01;
                    const levelChanged = parseInt(prev.level || 1) !== currentLevel;
                    
                    if (xpChanged || levelChanged) {
                        return {
                            ...prev,
                            xp: currentXP,
                            level: currentLevel
                        };
                    }
                    return prev;
                });
            }
        }, 1000); // Check every second for real-time updates
        
        return () => {
            clearInterval(xpRefreshInterval);
            window.removeEventListener('xpUpdated', handleXPUpdate);
            window.removeEventListener('levelUp', handleLevelUp);
        };
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

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setStatus("Avatar image must be less than 5MB");
            return;
        }

        try {
            // Optimize image quality for clarity
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Set canvas size to maintain quality (max 512x512 for optimal clarity)
                const maxSize = 512;
                let width = img.width;
                let height = img.height;
                
                if (width > height) {
                    if (width > maxSize) {
                        height = (height * maxSize) / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = (width * maxSize) / height;
                        height = maxSize;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Use high-quality rendering
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to base64 with high quality
                const base64 = canvas.toDataURL('image/png', 1.0);
                setAvatarPreview(base64);
                setFormData(prev => ({
                    ...prev,
                    avatar: base64
                }));
                setEditedUserData(prev => ({
                    ...prev,
                    avatar: base64
                }));
            };
            
            img.onerror = () => {
                // Fallback to original method if canvas fails
                convertToBase64(file).then(base64 => {
                    setAvatarPreview(base64);
                    setFormData(prev => ({
                        ...prev,
                        avatar: base64
                    }));
                    setEditedUserData(prev => ({
                        ...prev,
                        avatar: base64
                    }));
                });
            };
            
            img.src = URL.createObjectURL(file);
        } catch (error) {
            console.error("Error converting avatar:", error);
            setStatus("Failed to process avatar image");
        }
    };

    const handleBannerChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            setStatus("Banner image must be less than 10MB");
            return;
        }

        try {
            // Optimize banner image quality for clarity
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();
            
            img.onload = () => {
                // Set canvas size for banner (max 1920x600 for optimal clarity)
                const maxWidth = 1920;
                const maxHeight = 600;
                let width = img.width;
                let height = img.height;
                
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
                
                canvas.width = width;
                canvas.height = height;
                
                // Use high-quality rendering
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convert to base64 with high quality
                const base64 = canvas.toDataURL('image/png', 0.95);
                setBannerPreview(base64);
                setFormData(prev => ({
                    ...prev,
                    banner: base64
                }));
                setEditedUserData(prev => ({
                    ...prev,
                    banner: base64
                }));
            };
            
            img.onerror = () => {
                // Fallback to original method if canvas fails
                convertToBase64(file).then(base64 => {
                    setBannerPreview(base64);
                    setFormData(prev => ({
                        ...prev,
                        banner: base64
                    }));
                    setEditedUserData(prev => ({
                        ...prev,
                        banner: base64
                    }));
                });
            };
            
            img.src = URL.createObjectURL(file);
        } catch (error) {
            console.error("Error converting banner:", error);
            setStatus("Failed to process banner image");
        }
    };

    const handleSaveChanges = async () => {
        if (!user?.id) {
            setStatus("You must be logged in to save changes");
            return;
        }

        setStatus("Saving...");

        try {
            const token = localStorage.getItem("token");
            if (!token) {
                setStatus("Authentication required");
                return;
            }

            // Validate username if changed
            if (editedUserData.username && editedUserData.username !== user.username) {
                const validation = validateUsername(editedUserData.username);
                if (!validation.isValid) {
                    setUsernameValidationError(validation.error);
                    setStatus("Username validation failed");
                    return;
                }

                const cooldownCheck = canChangeUsername(lastUsernameChange);
                if (!cooldownCheck.canChange) {
                    setUsernameValidationError(getCooldownMessage(lastUsernameChange));
                    setStatus("Username change on cooldown");
                    return;
                }
            }

            const dataToSave = {
                ...editedUserData,
                id: user.id
            };

            // Also update localStorage 'user' object
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            const updatedStoredUser = { ...storedUser, ...dataToSave };
            localStorage.setItem('user', JSON.stringify(updatedStoredUser));

            setStatus("Saving...");

            const response = await axios.put(
                `${resolveApiBaseUrl()}/api/users/${user.id}/update`,
                dataToSave,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.status === 200) {
                const serverData = response.data;
                
                // Update form data with server response
                setFormData(prev => ({
                    ...prev,
                    ...serverData
                }));

                // Update auth context
                if (setUser) {
                    setUser(prev => ({
                        ...prev,
                        ...serverData
                    }));
                }

                // Update localStorage 'user' object
                if (serverData) {
                    const updatedUser = { ...updatedStoredUser, ...serverData };
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                }
                
                setStatus("Profile updated successfully!");
                setEditedUserData({});
                
                // Clear status after 3 seconds
                setTimeout(() => {
                    setStatus("");
                }, 3000);
            } else {
                setStatus("Failed to update profile");
            }
        } catch (error) {
            console.error("Error saving profile:", error);
            setStatus(error.response?.data?.message || "Failed to update profile");
        }
    };

    // Calculate XP progress
    const xpProgress = getXPProgress(formData.xp || 0, formData.level || 1);
    const rankTitle = getRankTitle(formData.level || 1);
    const tierName = getTierName(formData.level || 1);
    const tierColor = getTierColor(formData.level || 1);
    const nextMilestone = getNextRankMilestone(formData.level || 1);

    if (loading) {
        return (
            <div className="profile-container">
                <CosmicBackground />
                <div className="loading-screen">
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Loading Profile...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="profile-container">
            <CosmicBackground />
            <div className="profile-content">
                {/* Profile Banner */}
                <div className="profile-banner-container">
                    {bannerPreview || formData.banner ? (
                        <img 
                            src={bannerPreview || formData.banner} 
                            alt="Banner" 
                            className="profile-banner"
                            style={{
                                imageRendering: 'high-quality',
                                imageRendering: '-webkit-optimize-contrast',
                                imageRendering: 'crisp-edges'
                            }}
                            loading="eager"
                        />
                    ) : (
                        <div className="profile-banner-placeholder">
                            <div className="banner-upload-hint">Click to upload banner</div>
                        </div>
                    )}
                    <input
                        type="file"
                        ref={bannerInputRef}
                        accept="image/*"
                        onChange={handleBannerChange}
                        style={{ display: 'none' }}
                    />
                    <button 
                        className="banner-upload-btn"
                        onClick={() => bannerInputRef.current?.click()}
                    >
                        📷
                    </button>
                </div>

                {/* Profile Avatar & Header */}
                <div className="profile-header-section">
                    <div className="profile-avatar-wrapper">
                        <img 
                            src={avatarPreview || getAvatarPath(formData.avatar)} 
                            alt="Avatar" 
                            className="profile-avatar"
                            style={{
                                imageRendering: 'high-quality',
                                imageRendering: '-webkit-optimize-contrast',
                                imageRendering: 'crisp-edges'
                            }}
                            loading="eager"
                        />
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            onChange={handleAvatarChange}
                            style={{ display: 'none' }}
                        />
                        <button 
                            className="avatar-upload-btn"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            📷
                        </button>
                    </div>
                    <div className="profile-header-info">
                        <h1 className="profile-username">{formData.username || 'User'}</h1>
                        <div className="profile-rank" style={{ color: tierColor }}>
                            {rankTitle}
                        </div>
                        <div className="profile-tier">{tierName}</div>
                    </div>
                </div>

                {/* Level & XP Display */}
                <div className="profile-level-section">
                    <div className="level-display">
                        <span className="level-label">Power Level</span>
                        <span className="level-value">{formData.level || 1}</span>
                    </div>
                    <div className="xp-display">
                        <span className="xp-label">Power Points</span>
                        <span className="xp-value">{(formData.xp || 0).toLocaleString()}</span>
                    </div>
                    {nextMilestone && (
                        <div className="next-milestone">
                            <span className="milestone-label">Next Rank:</span>
                            <span className="milestone-value">{nextMilestone.title} (Level {nextMilestone.level})</span>
                        </div>
                    )}
                </div>

                {/* XP Progress Bar */}
                <div className="xp-progress-container">
                    <div className="xp-progress-header">
                        <span>Progress to Level {(formData.level || 1) + 1}</span>
                        <span>{Math.round(xpProgress.percentage)}%</span>
                    </div>
                    <div className="xp-progress-bar">
                        <div 
                            className="xp-progress-fill"
                            key={`xp-${formData.xp}-${formData.level}`} // Force re-render on XP change
                            style={{ 
                                width: `${Math.max(0, Math.min(100, xpProgress.percentage))}%`,
                                background: `linear-gradient(90deg, ${tierColor} 0%, ${tierColor}dd 100%)`,
                                transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                            }}
                        ></div>
                    </div>
                    <div className="xp-progress-text">
                        {Math.round(xpProgress.current).toLocaleString()} / {Math.round(xpProgress.needed).toLocaleString()} XP
                    </div>
                </div>

                {/* Login Streak */}
                <div className="login-streak-section">
                    <div className="streak-icon">🔥</div>
                    <div className="streak-info">
                        <span className="streak-label">Login Streak</span>
                        <span className="streak-value">{loginStreak}+ days</span>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="profile-tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        Overview
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'journey' ? 'active' : ''}`}
                        onClick={() => setActiveTab('journey')}
                    >
                        Journey
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'statistics' ? 'active' : ''}`}
                        onClick={() => setActiveTab('statistics')}
                    >
                        Statistics
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'achievements' ? 'active' : ''}`}
                        onClick={() => setActiveTab('achievements')}
                    >
                        Achievements
                    </button>
                </div>

                {/* Tab Content */}
                <div className="profile-tab-content">
                    {activeTab === 'overview' && (
                        <div className="tab-panel">
                            <div className="section-title">Information</div>
                            
                            {/* Bio */}
                            <div className="form-group">
                                <label htmlFor="profile-bio">Custom Bio</label>
                                <textarea
                                    id="profile-bio"
                                    name="bio"
                                    value={formData.bio || ''}
                                    onChange={handleChange}
                                    placeholder="Tell us about your trading journey..."
                                    rows="3"
                                    className="form-input"
                                />
                            </div>

                            {/* Username */}
                            <div className="form-group">
                                <label htmlFor="profile-username">Username</label>
                                <input
                                    id="profile-username"
                                    type="text"
                                    name="username"
                                    value={formData.username || ''}
                                    onChange={handleChange}
                                    className="form-input"
                                />
                                {usernameValidationError && (
                                    <div className="error-message">{usernameValidationError}</div>
                                )}
                            </div>

                            {/* Email */}
                            <div className="form-group">
                                <label htmlFor="profile-email">Email</label>
                                <input
                                    id="profile-email"
                                    type="email"
                                    name="email"
                                    value={formData.email || ''}
                                    onChange={handleChange}
                                    className="form-input"
                                    disabled
                                />
                            </div>

                            {/* Name */}
                            <div className="form-group">
                                <label htmlFor="profile-name">Full Name</label>
                                <input
                                    id="profile-name"
                                    type="text"
                                    name="name"
                                    value={formData.name || ''}
                                    onChange={handleChange}
                                    className="form-input"
                                />
                            </div>

                            {/* Role */}
                            {userRole && (
                                <div className="role-display">
                                    <span className="role-label">Role:</span>
                                    <span className="role-value">{userRole}</span>
                                </div>
                            )}

                            <button className="save-button" onClick={handleSaveChanges}>
                                SAVE PROFILE
                            </button>
                        </div>
                    )}

                    {activeTab === 'journey' && (
                        <div className="tab-panel">
                            <div className="section-title">Hero's Journey</div>
                            <div className="journey-content">
                                <div className="journey-stat">
                                    <div className="journey-icon">📈</div>
                                    <div className="journey-info">
                                        <div className="journey-label">Current Level</div>
                                        <div className="journey-value">{formData.level || 1}</div>
                                    </div>
                                </div>
                                <div className="journey-stat">
                                    <div className="journey-icon">🎯</div>
                                    <div className="journey-info">
                                        <div className="journey-label">Total XP</div>
                                        <div className="journey-value">{(formData.xp || 0).toLocaleString()}</div>
                                    </div>
                                </div>
                                <div className="journey-stat">
                                    <div className="journey-icon">🏆</div>
                                    <div className="journey-info">
                                        <div className="journey-label">Rank</div>
                                        <div className="journey-value">{rankTitle}</div>
                                    </div>
                                </div>
                                {nextMilestone && (
                                    <div className="milestone-card">
                                        <div className="milestone-title">Next Milestone</div>
                                        <div className="milestone-name">{nextMilestone.title}</div>
                                        <div className="milestone-level">Level {nextMilestone.level}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'statistics' && (
                        <div className="tab-panel">
                            <div className="section-title">Trading Statistics</div>
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-icon">📊</div>
                                    <div className="stat-value">{tradingStats.totalTrades}</div>
                                    <div className="stat-label">Total Trades</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">✅</div>
                                    <div className="stat-value">{tradingStats.winRate}%</div>
                                    <div className="stat-label">Win Rate</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">💰</div>
                                    <div className="stat-value">${tradingStats.totalProfit.toLocaleString()}</div>
                                    <div className="stat-label">Total Profit</div>
                                </div>
                            </div>
                            <div className="stats-note">
                                Trading statistics will be available when you connect your trading account.
                            </div>
                        </div>
                    )}

                    {activeTab === 'achievements' && (
                        <div className="tab-panel">
                            <div className="section-title">Achievements</div>
                            {achievements.length > 0 ? (
                                <div className="achievements-grid">
                                    {achievements.map((achievement, index) => (
                                        <div key={index} className="achievement-badge">
                                            {achievement}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="no-achievements">
                                    <div className="no-achievements-icon">🏅</div>
                                    <div className="no-achievements-text">No achievements yet</div>
                                    <div className="no-achievements-hint">Keep trading and engaging to unlock achievements!</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {status && <p className="status-msg">{status}</p>}
            </div>
        </div>
    );
};

export default Profile;
