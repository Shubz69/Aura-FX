import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import Api from "../services/Api";
import "../styles/Profile.css";
import { useNavigate } from 'react-router-dom';
import CosmicBackground from '../components/CosmicBackground';
import { validateUsername, canChangeUsername, getCooldownMessage } from '../utils/usernameValidation';
import { getPlaceholderColor, setPlaceholderColor as savePlaceholderColor, PLACEHOLDER_COLORS } from '../utils/avatar';
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
    return process.env.REACT_APP_API_URL || '';
};

// Full IANA timezone list for daily journal notification (08:00 local)
const getIANATimezones = () => {
    try {
        if (typeof Intl !== 'undefined' && Intl.supportedValuesOf && typeof Intl.supportedValuesOf('timeZone') !== 'undefined') {
            return Intl.supportedValuesOf('timeZone').slice().sort();
        }
    } catch (_) {}
    return ['Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];
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

// Journal stats date helpers (match Journal page logic)
const getMonthStart = (d) => {
    const x = new Date(d);
    x.setDate(1);
    return x.toISOString().slice(0, 10);
};
const getMonthEnd = (d) => {
    const x = new Date(d);
    x.setMonth(x.getMonth() + 1);
    x.setDate(0);
    return x.toISOString().slice(0, 10);
};
const getWeekStart = (d) => {
    const x = new Date(d);
    const day = x.getDay();
    const diff = x.getDate() - day + (day === 0 ? -6 : 1);
    x.setDate(diff);
    return x.toISOString().slice(0, 10);
};
const getWeekEnd = (d) => {
    const start = new Date(getWeekStart(d));
    start.setDate(start.getDate() + 6);
    return start.toISOString().slice(0, 10);
};
const isSameDay = (a, b) => a && b && String(a).slice(0, 10) === String(b).slice(0, 10);

const Profile = () => {
    const { user, setUser } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');
    const [status, setStatus] = useState("");
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        phone: "",
        address: "",
        avatar: "",
        name: "",
        bio: "",
        banner: "",
        level: 1,
        xp: 0,
        timezone: ""
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
    const [journalTasks, setJournalTasks] = useState([]);
    const [journalStatsLoading, setJournalStatsLoading] = useState(true);

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

            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            const authData = {
                username: user.username || storedUser.username || "",
                email: user.email || storedUser.email || "",
                phone: user.phone || storedUser.phone || "",
                address: user.address || storedUser.address || "",
                avatar: user.avatar || storedUser.avatar || "",
                name: user.name || storedUser.name || "",
                bio: user.bio || storedUser.bio || "",
                banner: user.banner || storedUser.banner || "",
                level: storedUser.level || user.level || 1,
                xp: storedUser.xp || user.xp || 0,
                timezone: user.timezone || storedUser.timezone || ""
            };

            setFormData(prev => ({ ...prev, ...authData }));
            if (authData.avatar && authData.avatar.startsWith('data:image')) setAvatarPreview(authData.avatar);
            if (authData.banner && authData.banner.startsWith('data:image')) setBannerPreview(authData.banner);
            setUserRole(user.role || "");
            setLoginStreak(storedUser.login_streak ?? user.login_streak ?? 0);
            setLoading(false);

            const token = localStorage.getItem("token");
            if (!token) return;

            const baseUrl = resolveApiBaseUrl();
            const headers = { Authorization: `Bearer ${token}` };

            const [settingsRes, userRes] = await Promise.all([
                axios.get(`${baseUrl}/api/users/settings`, { headers }).catch(() => ({ data: null })),
                axios.get(`${baseUrl}/api/users/${user.id}`, { headers }).catch(() => ({ status: 0, data: null }))
            ]);

            if (settingsRes?.data?.timezone != null) {
                setFormData(prev => ({ ...prev, timezone: settingsRes.data.timezone || "" }));
            }

            if (userRes?.status === 200 && userRes.data) {
                const userData = userRes.data;
                const backendData = {
                    username: userData.username || authData.username,
                    email: userData.email || authData.email,
                    phone: userData.phone || authData.phone,
                    address: userData.address || authData.address,
                    avatar: userData.avatar || authData.avatar,
                    name: userData.name || authData.name,
                    bio: userData.bio || authData.bio || "",
                    banner: userData.banner || authData.banner || "",
                    level: storedUser.level ?? userData.level ?? authData.level,
                    xp: storedUser.xp ?? userData.xp ?? authData.xp
                };
                if (userData.last_username_change) {
                    setLastUsernameChange(userData.last_username_change);
                    setUsernameCooldownInfo(canChangeUsername(userData.last_username_change));
                }
                setFormData(prev => ({ ...prev, ...backendData }));
                if (backendData.avatar && backendData.avatar.startsWith('data:image')) setAvatarPreview(backendData.avatar);
                if (backendData.banner && backendData.banner.startsWith('data:image')) setBannerPreview(backendData.banner);
                setLoginStreak(userData.login_streak ?? 0);
                setAchievements(userData.achievements || []);
                updateLocalUserData(backendData);

                const currentUserId = user?.id || userData.id;
                const lastCheckKey = `daily_login_check_${currentUserId}`;
                const lastCheckDate = localStorage.getItem(lastCheckKey);
                const today = new Date().toDateString();
                if (currentUserId && lastCheckDate !== today) {
                    Promise.race([
                        Api.checkDailyLogin(currentUserId),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 3000))
                    ]).then((loginResponse) => {
                        if (loginResponse?.data?.success) {
                            localStorage.setItem(lastCheckKey, today);
                            setLoginStreak(loginResponse.data.streak ?? userData.login_streak ?? 0);
                            if (loginResponse.data.xpAwarded && !loginResponse.data.alreadyLoggedIn && loginResponse.data.xpAwarded > 0) {
                                setFormData(prev => ({
                                    ...prev,
                                    xp: loginResponse.data.newXP,
                                    level: loginResponse.data.newLevel ?? prev.level
                                }));
                            }
                        } else {
                            setLoginStreak(userData.login_streak ?? 0);
                        }
                    }).catch(() => setLoginStreak(userData.login_streak ?? 0));
                }
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
            // Keep localStorage in sync so sidebar and other tabs show correct level
            try {
                const u = JSON.parse(localStorage.getItem('user') || '{}');
                if (u.id) {
                    localStorage.setItem('user', JSON.stringify({ ...u, xp: newXP, level: newLevel }));
                }
            } catch (_) {}
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

    // Fetch journal tasks for Today / This week / This month stats (Journal tab)
    useEffect(() => {
        if (!user?.id) {
            setJournalStatsLoading(false);
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        const weekStart = getWeekStart(today);
        const weekEnd = getWeekEnd(today);
        const monthStart = getMonthStart(today);
        const monthEnd = getMonthEnd(today);
        const fetchFrom = weekStart < monthStart ? weekStart : monthStart;
        const fetchTo = weekEnd > monthEnd ? weekEnd : monthEnd;
        setJournalStatsLoading(true);
        Api.getJournalTasks({ dateFrom: fetchFrom, dateTo: fetchTo })
            .then((res) => {
                const list = res.data?.tasks ?? [];
                setJournalTasks(Array.isArray(list) ? list : []);
            })
            .catch(() => setJournalTasks([]))
            .finally(() => setJournalStatsLoading(false));
    }, [user?.id]);

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

    // Journal tab: Today / This week / This month completion %
    const journalToday = new Date().toISOString().slice(0, 10);
    const journalWeekStart = getWeekStart(journalToday);
    const journalWeekEnd = getWeekEnd(journalToday);
    const journalMonthStart = getMonthStart(journalToday);
    const journalMonthEnd = getMonthEnd(journalToday);
    const dayTasks = journalTasks.filter((t) => isSameDay(t.date, journalToday));
    const weekTasks = journalTasks.filter((t) => t.date >= journalWeekStart && t.date <= journalWeekEnd);
    const monthTasksForMonth = journalTasks.filter((t) => t.date >= journalMonthStart && t.date <= journalMonthEnd);
    const dayTotal = dayTasks.length;
    const dayDone = dayTasks.filter((t) => t.completed).length;
    const journalDayPct = dayTotal ? Math.round((dayDone / dayTotal) * 100) : null;
    const weekTotal = weekTasks.length;
    const weekDone = weekTasks.filter((t) => t.completed).length;
    const journalWeekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : null;
    const monthTotal = monthTasksForMonth.length;
    const monthDone = monthTasksForMonth.filter((t) => t.completed).length;
    const journalMonthPct = monthTotal ? Math.round((monthDone / monthTotal) * 100) : null;

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
                                imageRendering: 'high-quality'
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
                        <div style={{ position: 'relative', flexShrink: 0, width: 150, height: 150 }}>
                            {(avatarPreview || (formData.avatar && (formData.avatar.startsWith('data:image') || formData.avatar.startsWith('http')))) ? (
                                <img
                                    src={avatarPreview || formData.avatar}
                                    alt="Profile"
                                    className="profile-avatar profile-avatar-img"
                                />
                            ) : (
                                <div aria-hidden className="profile-avatar" style={{ width: 150, height: 150, borderRadius: '50%', background: getPlaceholderColor(user?.id ?? formData.username), border: '5px solid rgba(139, 92, 246, 0.6)', boxSizing: 'border-box' }} />
                            )}
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
                        {!(avatarPreview || (formData.avatar && (formData.avatar.startsWith('data:image') || formData.avatar.startsWith('http')))) && (
                            <div className="profile-avatar-color-picker">
                                <span className="profile-avatar-color-label">Pick a colour (no photo):</span>
                                <div className="profile-avatar-color-swatches">
                                    {PLACEHOLDER_COLORS.map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            className="profile-avatar-swatch"
                                            style={{ background: color }}
                                            title={color}
                                            onClick={() => {
                                                savePlaceholderColor(user?.id ?? formData.username, color);
                                                setStatus('Colour saved. It will show wherever your profile is seen.');
                                                setTimeout(() => setStatus(''), 2000);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
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
                        <span className="level-label">Power level</span>
                        <span className="level-value">{formData.level || 1}</span>
                    </div>
                    <div className="xp-display">
                        <span className="xp-label">Power points</span>
                        <span className="xp-value">{(formData.xp || 0).toLocaleString()}</span>
                    </div>
                    {nextMilestone && (
                        <div className="next-milestone">
                            <span className="milestone-label">Next rank:</span>
                            <span className="milestone-value">{nextMilestone.title} (Level {nextMilestone.level})</span>
                        </div>
                    )}
                </div>

                {/* XP Progress Bar */}
                <div className="xp-progress-container">
                    <div className="xp-progress-header">
                        <span>Progress to level {(formData.level || 1) + 1}</span>
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
                        <span className="streak-label">Login streak</span>
                        <span className="streak-value">{loginStreak}+ days</span>
                    </div>
                </div>

                {/* Journal summary – below login streak */}
                <div className="profile-journal-summary-card">
                    <div className="section-title">Journal</div>
                    {journalStatsLoading ? (
                        <div className="profile-journal-loading">
                            <div className="loading-spinner"></div>
                            <span>Loading journal stats…</span>
                        </div>
                    ) : (
                        <div className="profile-journal-stats">
                            <div className="profile-journal-stat-circle">
                                <div className="profile-journal-stat-ring" style={{ '--pct': journalDayPct != null ? journalDayPct : 0 }}>
                                    <span className="profile-journal-stat-value">{journalDayPct != null ? `${journalDayPct}%` : '—'}</span>
                                </div>
                                <span className="profile-journal-stat-label">Today</span>
                            </div>
                            <div className="profile-journal-stat-circle">
                                <div className="profile-journal-stat-ring" style={{ '--pct': journalWeekPct != null ? journalWeekPct : 0 }}>
                                    <span className="profile-journal-stat-value">{journalWeekPct != null ? `${journalWeekPct}%` : '—'}</span>
                                </div>
                                <span className="profile-journal-stat-label">This week</span>
                            </div>
                            <div className="profile-journal-stat-circle">
                                <div className="profile-journal-stat-ring" style={{ '--pct': journalMonthPct != null ? journalMonthPct : 0 }}>
                                    <span className="profile-journal-stat-value">{journalMonthPct != null ? `${journalMonthPct}%` : '—'}</span>
                                </div>
                                <span className="profile-journal-stat-label">This month</span>
                            </div>
                        </div>
                    )}
                    <p className="profile-journal-hint">Task completion from your Aura Journal. Add and complete tasks to improve your stats.</p>
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
                                <label htmlFor="profile-bio">Custom bio</label>
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

                            {/* Timezone (IANA) – daily journal notification at 08:00 local */}
                            <div className="form-group">
                                <label htmlFor="profile-timezone">Timezone (for daily journal reminder)</label>
                                <select
                                    id="profile-timezone"
                                    name="timezone"
                                    value={formData.timezone || ''}
                                    onChange={async (e) => {
                                        const val = e.target.value || '';
                                        setFormData(prev => ({ ...prev, timezone: val }));
                                        try {
                                            const token = localStorage.getItem('token');
                                            if (token) {
                                                await axios.put(
                                                    `${resolveApiBaseUrl()}/api/users/settings`,
                                                    { timezone: val || null },
                                                    { headers: { Authorization: `Bearer ${token}` } }
                                                );
                                                if (setUser) {
                                                    const u = JSON.parse(localStorage.getItem('user') || '{}');
                                                    setUser({ ...u, timezone: val || null });
                                                }
                                            }
                                        } catch (_) {}
                                    }}
                                    className="form-input"
                                >
                                    <option value="">Auto (browser)</option>
                                    {getIANATimezones().map(tz => (
                                        <option key={tz} value={tz}>{tz}</option>
                                    ))}
                                </select>
                                <small className="form-hint">Daily journal notification at 08:00 in this timezone.</small>
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
                                Save profile
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
                            <div className="section-title">Trading statistics</div>
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
