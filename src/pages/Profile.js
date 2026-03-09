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

const getIANATimezones = () => {
    try {
        if (typeof Intl !== 'undefined' && Intl.supportedValuesOf && typeof Intl.supportedValuesOf('timeZone') !== 'undefined') {
            return Intl.supportedValuesOf('timeZone').slice().sort();
        }
    } catch (_) {}
    return ['Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];
};

const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
};

const getMonthStart = (d) => { const x = new Date(d); x.setDate(1); return x.toISOString().slice(0, 10); };
const getMonthEnd = (d) => { const x = new Date(d); x.setMonth(x.getMonth() + 1); x.setDate(0); return x.toISOString().slice(0, 10); };
const getWeekStart = (d) => { const x = new Date(d); const day = x.getDay(); const diff = x.getDate() - day + (day === 0 ? -6 : 1); x.setDate(diff); return x.toISOString().slice(0, 10); };
const getWeekEnd = (d) => { const start = new Date(getWeekStart(d)); start.setDate(start.getDate() + 6); return start.toISOString().slice(0, 10); };
const isSameDay = (a, b) => a && b && String(a).slice(0, 10) === String(b).slice(0, 10);

// ─── Helper: user-scoped localStorage keys ───
const userKey = (userId, key) => `user_${userId}_${key}`;

/* ─── Mini SVG ring component ─── */
const RingProgress = ({ pct, color, value, label, size = 80 }) => {
    const r = (size / 2) - 6;
    const circ = 2 * Math.PI * r;
    const offset = circ - (pct / 100) * circ;
    return (
        <div className="pf-ring-item">
            <div className="pf-ring-wrapper" style={{ width: size, height: size }}>
                <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                    <circle
                        cx={size/2} cy={size/2} r={r}
                        fill="none" stroke={color} strokeWidth="5"
                        strokeLinecap="round"
                        strokeDasharray={circ}
                        strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)' }}
                    />
                </svg>
                <div className="pf-ring-center">
                    <span className="pf-ring-value">{value}</span>
                </div>
            </div>
            <span className="pf-ring-label">{label}</span>
        </div>
    );
};

const Profile = () => {
    const { user, setUser } = useAuth();
    const [activeTab, setActiveTab] = useState('overview');
    const [status, setStatus] = useState("");
    const [formData, setFormData] = useState({
        username: "", email: "", phone: "", address: "",
        avatar: "", name: "", bio: "", banner: "",
        level: 1, xp: 0, timezone: ""
    });
    const [avatarPreview, setAvatarPreview] = useState(null);
    const [bannerPreview, setBannerPreview] = useState(null);
    const fileInputRef = useRef(null);
    const bannerInputRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [editedUserData, setEditedUserData] = useState({});
    const [userRole, setUserRole] = useState("");
    const [avatarColor, setAvatarColor] = useState(null); // Add this state
    const navigate = useNavigate();
    const [lastUsernameChange, setLastUsernameChange] = useState(null);
    const [usernameValidationError, setUsernameValidationError] = useState("");
    const [usernameCooldownInfo, setUsernameCooldownInfo] = useState(null);
    const [loginStreak, setLoginStreak] = useState(0);
    const [achievements, setAchievements] = useState([]);
    const [tradingStats, setTradingStats] = useState({ totalTrades: 0, winRate: 0, totalProfit: 0 });
    const [journalTasks, setJournalTasks] = useState([]);
    const [journalStatsLoading, setJournalStatsLoading] = useState(true);

    const initialLoadDone = useRef(false);

    // Add these helper functions at the component level, right after useState declarations
    const handleColorSelect = (color) => {
        if (!user?.id) return;
        
        // Save the color to localStorage with user-specific key
        localStorage.setItem(`avatar_color_${user.id}`, color);
        
        // Update the avatarColor state to trigger re-render
        setAvatarColor(color);
        
        // Also save using the existing utility function for backward compatibility
        savePlaceholderColor(user.id, color);
        
        setStatus('Profile color updated!');
        setTimeout(() => setStatus(''), 2000);
    };

    const getAvatarDisplayColor = () => {
        if (avatarColor) return avatarColor;
        return getPlaceholderColor(user?.id ?? formData.username);
    };


    // ─── Load initial data from localStorage, SCOPED to this user ───
    useEffect(() => {
        if (initialLoadDone.current) return;
        if (!user?.id) return;

        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userBannerKey = userKey(user.id, 'banner');
        const scopedBanner = localStorage.getItem(userBannerKey) || '';
        const localBanner = (storedUser.id === user.id ? storedUser.banner : '') || scopedBanner || '';
        const storedUserData = JSON.parse(localStorage.getItem('userData') || '{}');

        // Load saved avatar color
        const savedColor = localStorage.getItem(`avatar_color_${user.id}`);
        if (savedColor) {
            setAvatarColor(savedColor);
        }

        const initialData = {
            ...formData,
            ...storedUserData,
            ...storedUser,
            username: (storedUser.username || storedUserData.username || '').trim(),
            banner: localBanner
        };

        setFormData(initialData);

        if (initialData.banner?.startsWith('data:image') || initialData.banner?.startsWith('http')) {
            setBannerPreview(initialData.banner);
        }
        if (initialData.avatar?.startsWith('data:image') || initialData.avatar?.startsWith('http')) {
            setAvatarPreview(initialData.avatar);
        }

        initialLoadDone.current = true;
    }, [user?.id]);

    // ─── Main profile loading effect ───
   useEffect(() => {
        const loadProfile = async () => {
            if (!user?.id) return;

            // Load saved avatar color
            const savedColor = localStorage.getItem(`avatar_color_${user.id}`);
            if (savedColor) {
                setAvatarColor(savedColor);
            }

            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            const userBannerKey = userKey(user.id, 'banner');
            const scopedBanner = localStorage.getItem(userBannerKey) || '';
            const localBanner = (storedUser.id === user.id ? storedUser.banner : '') || scopedBanner || '';

            const authData = {
                username: (user.username || storedUser.username || "").trim(),
                email: user.email || storedUser.email || "",
                phone: user.phone || storedUser.phone || "",
                address: user.address || storedUser.address || "",
                avatar: user.avatar || storedUser.avatar || "",
                name: user.name || storedUser.name || "",
                bio: user.bio || storedUser.bio || "",
                banner: localBanner,
                level: storedUser.level || user.level || 1,
                xp: storedUser.xp || user.xp || 0,
                timezone: user.timezone || storedUser.timezone || ""
            };

            setFormData(prev => ({ ...prev, ...authData }));

            if (authData.avatar?.startsWith('data:image') || authData.avatar?.startsWith('http')) {
                setAvatarPreview(authData.avatar);
            }
            if (authData.banner?.startsWith('data:image') || authData.banner?.startsWith('http')) {
                setBannerPreview(authData.banner);
            }

            setUserRole(user.role || "");
            setLoginStreak(storedUser.login_streak ?? user.login_streak ?? 0);
            setLoading(false);

            const token = localStorage.getItem("token");
            if (!token) return;

            const baseUrl = resolveApiBaseUrl();
            const headers = { Authorization: `Bearer ${token}` };

            try {
                const [settingsRes, userRes] = await Promise.all([
                    axios.get(`${baseUrl}/api/users/settings`, { headers }).catch(() => ({ data: null })),
                    axios.get(`${baseUrl}/api/users/${user.id}`, { headers }).catch(() => ({ status: 0, data: null }))
                ]);

                if (settingsRes?.data?.timezone != null) {
                    setFormData(prev => ({ ...prev, timezone: settingsRes.data.timezone || "" }));
                }

                if (userRes?.status === 200 && userRes.data) {
                    const userData = userRes.data;
                    const serverBanner = userData.banner || '';
                    const finalBanner = serverBanner || localBanner;
                    const backendAvatar = userData.avatar || authData.avatar;

                    const backendData = {
                        username: (userData.username || authData.username).trim(),
                        email: userData.email || authData.email,
                        phone: userData.phone || authData.phone,
                        address: userData.address || authData.address,
                        avatar: backendAvatar,
                        name: userData.name || authData.name,
                        bio: userData.bio || authData.bio || "",
                        banner: finalBanner,
                        level: storedUser.level ?? userData.level ?? authData.level,
                        xp: storedUser.xp ?? userData.xp ?? authData.xp
                    };

                    if (userData.last_username_change) {
                        setLastUsernameChange(userData.last_username_change);
                        setUsernameCooldownInfo(canChangeUsername(userData.last_username_change));
                    }

                    setFormData(prev => ({ ...prev, ...backendData }));

                    if (backendAvatar?.startsWith('data:image') || backendAvatar?.startsWith('http')) {
                        setAvatarPreview(backendAvatar);
                    }
                    if (finalBanner?.startsWith('data:image') || finalBanner?.startsWith('http')) {
                        setBannerPreview(finalBanner);
                    }

                    setLoginStreak(userData.login_streak ?? 0);
                    setAchievements(userData.achievements || []);

                    const updatedUser = {
                        ...storedUser,
                        ...backendData,
                        id: user.id
                    };
                    localStorage.setItem('user', JSON.stringify(updatedUser));

                    if (finalBanner) {
                        localStorage.setItem(userBannerKey, finalBanner);
                    }

                    // Daily login check
                    const currentUserId = user?.id || userData.id;
                    const lastCheckKey = `daily_login_check_${currentUserId}`;
                    const lastCheckDate = localStorage.getItem(lastCheckKey);
                    const today = new Date().toDateString();

                    if (currentUserId && lastCheckDate !== today) {
                        try {
                            const loginResponse = await Promise.race([
                                Api.checkDailyLogin(currentUserId),
                                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                            ]);

                            if (loginResponse?.data?.success) {
                                localStorage.setItem(lastCheckKey, today);
                                setLoginStreak(loginResponse.data.streak ?? userData.login_streak ?? 0);

                                if (loginResponse.data.xpAwarded && !loginResponse.data.alreadyLoggedIn && loginResponse.data.xpAwarded > 0) {
                                    setFormData(prev => ({
                                        ...prev,
                                        xp: loginResponse.data.newXP,
                                        level: loginResponse.data.newLevel ?? prev.level
                                    }));

                                    const updatedUserWithXP = {
                                        ...updatedUser,
                                        xp: loginResponse.data.newXP,
                                        level: loginResponse.data.newLevel ?? updatedUser.level
                                    };
                                    localStorage.setItem('user', JSON.stringify(updatedUserWithXP));
                                }
                            }
                        } catch (error) {
                            console.error('Daily login check failed:', error);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading profile data:', error);
            }
        };

        loadProfile();

        const handleXPUpdate = (event) => {
            const { newXP, newLevel } = event.detail;
            setFormData(prev => ({ ...prev, xp: newXP, level: newLevel }));
            try {
                const u = JSON.parse(localStorage.getItem('user') || '{}');
                if (u.id) {
                    const updatedUser = { ...u, xp: newXP, level: newLevel };
                    localStorage.setItem('user', JSON.stringify(updatedUser));
                }
            } catch (_) {}
        };

        const handleLevelUp = (event) => {
            console.log(`🎉 Level Up! You reached level ${event.detail.newLevel}!`);
        };

        window.addEventListener('xpUpdated', handleXPUpdate);
        window.addEventListener('levelUp', handleLevelUp);

        const xpRefreshInterval = setInterval(() => {
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            if (storedUser.xp !== undefined && storedUser.level !== undefined) {
                const currentXP = parseFloat(storedUser.xp || 0);
                const currentLevel = parseInt(storedUser.level || 1);
                setFormData(prev => {
                    if (Math.abs(parseFloat(prev.xp || 0) - currentXP) > 0.01 || parseInt(prev.level || 1) !== currentLevel) {
                        return { ...prev, xp: currentXP, level: currentLevel };
                    }
                    return prev;
                });
            }
        }, 1000);

        return () => {
            clearInterval(xpRefreshInterval);
            window.removeEventListener('xpUpdated', handleXPUpdate);
            window.removeEventListener('levelUp', handleLevelUp);
        };
    }, [user]);

    // ─── Journal stats effect ───
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
        setFormData(prev => ({ ...prev, [name]: value }));
        setEditedUserData(prev => ({ ...prev, [name]: value }));
        if (name === 'username') setUsernameValidationError("");
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setStatus("Avatar image must be less than 5MB");
            return;
        }

        try {
            const base64 = await convertToBase64(file);
            const img = new Image();
            img.src = base64;

            await new Promise((resolve) => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const maxSize = 512;
                    let { width, height } = img;

                    if (width > height) {
                        if (width > maxSize) { height = (height * maxSize) / width; width = maxSize; }
                    } else {
                        if (height > maxSize) { width = (width * maxSize) / height; height = maxSize; }
                    }

                    canvas.width = width; canvas.height = height;
                    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);

                    const resizedBase64 = canvas.toDataURL('image/png', 1.0);

                    setAvatarPreview(resizedBase64);
                    setFormData(prev => ({ ...prev, avatar: resizedBase64 }));
                    setEditedUserData(prev => ({ ...prev, avatar: resizedBase64 }));

                    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                    localStorage.setItem('user', JSON.stringify({ ...storedUser, avatar: resizedBase64 }));

                    resolve();
                };
            });

            setStatus("Avatar ready to save. Click 'Save Profile' to update.");
        } catch (error) {
            console.error('Avatar processing error:', error);
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
            const base64 = await convertToBase64(file);
            const img = new Image();
            img.src = base64;

            await new Promise((resolve) => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let { width, height } = img;
                    const maxWidth = 1920;
                    const maxHeight = 400;

                    if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
                    if (height > maxHeight) { width = (width * maxHeight) / height; height = maxHeight; }

                    canvas.width = Math.round(width); canvas.height = Math.round(height);
                    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);

                    const resizedBase64 = canvas.toDataURL('image/jpeg', 0.85);

                    setBannerPreview(resizedBase64);
                    setFormData(prev => ({ ...prev, banner: resizedBase64 }));
                    setEditedUserData(prev => ({ ...prev, banner: resizedBase64 }));

                    if (user?.id) {
                        const userBannerKey = userKey(user.id, 'banner');
                        localStorage.setItem(userBannerKey, resizedBase64);
                    }

                    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                    localStorage.setItem('user', JSON.stringify({ ...storedUser, banner: resizedBase64, id: user?.id }));

                    resolve();
                };
            });

            setStatus("Banner ready to save. Click 'Save Profile' to update permanently.");
        } catch (error) {
            console.error('Banner processing error:', error);
            setStatus("Failed to process banner image");
        }
    };

    // COMPLETELY REWRITTEN handleSaveChanges function
    const handleSaveChanges = async () => {
        // Check if user is logged in
        if (!user?.id) {
            setStatus("You must be logged in to save changes");
            return;
        }

        setStatus("Saving...");
        setUsernameValidationError("");

        try {
            // Check for authentication token
            const token = localStorage.getItem("token");
            if (!token) {
                setStatus("Authentication required");
                return;
            }

            // Get stored user data for reference
            const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
            
            // Get and trim usernames for comparison
            const currentUsername = (user.username || storedUser.username || '').toString().trim();
            const newUsername = (formData.username || '').toString().trim();
            
            // Check if username actually changed
            const usernameChanged = currentUsername !== newUsername;

            // Only validate username if it was changed
            if (usernameChanged) {
                // Check if username is empty
                if (!newUsername) {
                    setUsernameValidationError("Username cannot be empty");
                    setStatus("Username validation failed");
                    return;
                }

                // Validate username format
                const validation = validateUsername(newUsername);
                
                // Check if validation returned a valid result
                if (!validation || typeof validation !== 'object') {
                    setUsernameValidationError("Username validation error");
                    setStatus("Username validation failed");
                    return;
                }
                
                // Check if validation failed
                if (validation.isValid === false) {
                    setUsernameValidationError(validation.error || "Invalid username format");
                    setStatus("Username validation failed");
                    return;
                }

                // Check cooldown period if user has changed username before
                if (lastUsernameChange) {
                    const cooldownCheck = canChangeUsername(lastUsernameChange);
                    if (cooldownCheck && cooldownCheck.canChange === false) {
                        const cooldownMessage = getCooldownMessage(lastUsernameChange) || "Username change on cooldown";
                        setUsernameValidationError(cooldownMessage);
                        setStatus("Username change on cooldown");
                        return;
                    }
                }
            }

            // Get banner for this user
            const userBannerKey = userKey(user.id, 'banner');
            const scopedBanner = localStorage.getItem(userBannerKey) || '';
            const currentBanner = bannerPreview || formData.banner || scopedBanner || '';

            // Prepare data to save
            const dataToSave = {
                id: user.id,
                username: usernameChanged ? newUsername : currentUsername, // Use new username only if changed
                email: formData.email || storedUser.email || '',
                phone: formData.phone || storedUser.phone || '',
                address: formData.address || storedUser.address || '',
                name: formData.name || storedUser.name || '',
                bio: (formData.bio || '').trim(), // Always include bio
                avatar: formData.avatar || storedUser.avatar || '',
                banner: currentBanner,
                timezone: formData.timezone || storedUser.timezone || '',
            };

            // Update localStorage optimistically
            localStorage.setItem('user', JSON.stringify({ ...storedUser, ...dataToSave }));

            // Send to server
            const response = await axios.put(
                `${resolveApiBaseUrl()}/api/users/${user.id}`,
                dataToSave,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            // Handle successful response
            if (response.status === 200) {
                const serverData = response.data || {};
                
                // Determine final banner (server response or current)
                const savedBanner = serverData.banner || currentBanner;
                
                // Merge server data with our data
                const updatedData = {
                    ...dataToSave,
                    ...serverData,
                    banner: savedBanner,
                    id: user.id,
                    username: serverData.username || dataToSave.username,
                };

                // Update all state
                setFormData(prev => ({ ...prev, ...updatedData }));
                
                if (savedBanner) {
                    setBannerPreview(savedBanner);
                }

                // Update localStorage with merged data
                const updatedStoredUser = { ...storedUser, ...updatedData };
                localStorage.setItem('user', JSON.stringify(updatedStoredUser));

                // Update scoped banner
                if (savedBanner) {
                    localStorage.setItem(userBannerKey, savedBanner);
                }

                // Update auth context
                if (setUser) {
                    setUser(updatedStoredUser);
                }

                // Update last username change timestamp if username was actually changed
                if (usernameChanged && serverData.last_username_change) {
                    setLastUsernameChange(serverData.last_username_change);
                }

                // Clear edited data and show success message
                setEditedUserData({});
                setStatus("Profile updated successfully!");
                setTimeout(() => setStatus(""), 3000);
            } else {
                setStatus("Failed to update profile");
            }
        } catch (error) {
            console.error('Save error:', error);

            // Handle specific error cases
            if (error.response) {
                const errorMessage = error.response.data?.message || '';
                
                if (error.response.status === 409) {
                    setUsernameValidationError("This username is already taken. Please choose another.");
                    setStatus("Username already taken.");
                } else if (error.response.status === 400) {
                    if (errorMessage.toLowerCase().includes('username')) {
                        setUsernameValidationError(errorMessage || "Invalid username format");
                    }
                    setStatus(errorMessage || "Bad request. Please check your data.");
                } else if (error.response.status === 413) {
                    setStatus("Images too large. Please try smaller images.");
                } else {
                    setStatus(errorMessage || `Error ${error.response.status}: Failed to update profile`);
                }
            } else if (error.request) {
                setStatus("No response from server. Please check your connection.");
            } else {
                setStatus(error.message || "Failed to update profile");
            }
        }
    };

    // XP calculations
    const xpProgress = getXPProgress(formData.xp || 0, formData.level || 1);
    const rankTitle = getRankTitle(formData.level || 1);
    const tierName = getTierName(formData.level || 1);
    const tierColor = getTierColor(formData.level || 1);
    const nextMilestone = getNextRankMilestone(formData.level || 1);

    // Journal stats
    const journalToday = new Date().toISOString().slice(0, 10);
    const journalWeekStart = getWeekStart(journalToday);
    const journalWeekEnd = getWeekEnd(journalToday);
    const journalMonthStart = getMonthStart(journalToday);
    const journalMonthEnd = getMonthEnd(journalToday);

    const dayTasks = journalTasks.filter(t => isSameDay(t.date, journalToday));
    const weekTasks = journalTasks.filter(t => t.date >= journalWeekStart && t.date <= journalWeekEnd);
    const monthTasksForMonth = journalTasks.filter(t => t.date >= journalMonthStart && t.date <= journalMonthEnd);

    const dayTotal = dayTasks.length; const dayDone = dayTasks.filter(t => t.completed).length;
    const journalDayPct = dayTotal ? Math.round((dayDone / dayTotal) * 100) : 0;
    const weekTotal = weekTasks.length; const weekDone = weekTasks.filter(t => t.completed).length;
    const journalWeekPct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;
    const monthTotal = monthTasksForMonth.length; const monthDone = monthTasksForMonth.filter(t => t.completed).length;
    const journalMonthPct = monthTotal ? Math.round((monthDone / monthTotal) * 100) : 0;

    const hasAvatar = avatarPreview || (formData.avatar && (formData.avatar.startsWith('data:image') || formData.avatar.startsWith('http')));
    const xpPct = Math.max(0, Math.min(100, xpProgress.percentage));

    if (loading) {
        return (
            <div className="pf-container">
                <CosmicBackground />
                <div className="pf-loading">
                    <div className="pf-spinner"></div>
                    <span className="pf-loading-text">Loading Profile</span>
                </div>
            </div>
        );
    }

    return (
        <div className="pf-container">
            <CosmicBackground />
            <div className="pf-ambient" aria-hidden="true">
                <div className="pf-orb pf-orb-1"></div>
                <div className="pf-orb pf-orb-2"></div>
            </div>

            <div className="pf-content">
                {/* Banner section */}
                <div className="pf-banner-wrap">
                    {bannerPreview || formData.banner ? (
                        <img
                            src={bannerPreview || formData.banner}
                            alt="Banner"
                            className="pf-banner-img"
                            onError={(e) => {
                                console.error('Banner failed to load');
                                e.target.style.display = 'none';
                            }}
                        />
                    ) : (
                        <div className="pf-banner-placeholder">
                            <span className="pf-banner-hint">Upload Banner</span>
                        </div>
                    )}
                    <input
                        type="file"
                        ref={bannerInputRef}
                        accept="image/*"
                        onChange={handleBannerChange}
                        style={{ display: 'none' }}
                    />
                    <button className="pf-banner-btn" onClick={() => bannerInputRef.current?.click()}>
                        <span>📷</span> Change Banner
                    </button>
                </div>

                {/* Header card */}
                <div className="pf-header-card">
                    {/* Avatar */}
                    <div className="pf-avatar-col">
                        <div className="pf-avatar-ring">
                          <div className="pf-avatar-inner">
        {hasAvatar ? (
            <img
                src={avatarPreview || formData.avatar}
                alt="Avatar"
                className="pf-avatar-img"
                onError={(e) => {
                    console.error('Avatar failed to load');
                    e.target.style.display = 'none';
                    e.target.parentNode.innerHTML = `<div class="pf-avatar-placeholder" style="background: ${getAvatarDisplayColor()}"></div>`;
                }}
            />
        ) : (
            <div 
                className="pf-avatar-placeholder" 
                style={{ background: getAvatarDisplayColor() }}
            />
        )}
    </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="image/*"
                                onChange={handleAvatarChange}
                                style={{ display: 'none' }}
                            />
                            <button className="pf-avatar-edit-btn" onClick={() => fileInputRef.current?.click()} title="Change avatar">✏️</button>
                        </div>

                      {!hasAvatar && (
        <div className="pf-swatch-picker">
            <span className="pf-swatch-label">Ring Colour</span>
            <div className="pf-swatches">
                {PLACEHOLDER_COLORS.map((color) => (
                    <button
                        key={color}
                        className={`pf-swatch ${avatarColor === color ? 'active' : ''}`}
                        style={{ background: color }}
                        title={color}
                        onClick={() => handleColorSelect(color)}
                    />
                ))}
            </div>
        </div>
    )}

                    </div>

                    {/* Info */}
                    <div className="pf-header-info">
                        <h1 className="pf-username">{formData.username || 'Trader'}</h1>
                        <div className="pf-rank-pill" style={{ '--tier-color': tierColor }}>
                            <span className="pf-rank-dot" style={{ background: tierColor }}></span>
                            <span className="pf-rank-text">{rankTitle}</span>
                        </div>
                        <span className="pf-tier-label">{tierName}</span>
                    </div>

                    {/* Quick stats */}
                    <div className="pf-header-quick-stats">
                        <div className="pf-qstat">
                            <span className="pf-qstat-num">{formData.level || 1}</span>
                            <span className="pf-qstat-lbl">Level</span>
                        </div>
                        <div className="pf-qstat">
                            <span className="pf-qstat-num">{((formData.xp || 0) / 1000).toFixed(1)}K</span>
                            <span className="pf-qstat-lbl">Total XP</span>
                        </div>
                        <div className="pf-qstat">
                            <span className="pf-qstat-num">🔥{loginStreak}</span>
                            <span className="pf-qstat-lbl">Streak</span>
                        </div>
                    </div>
                </div>

                {/* XP progress */}
                <div className="pf-xp-card">
                    <div className="pf-xp-header">
                        <div>
                            <p className="pf-xp-eyebrow">XP Progress · Level {formData.level || 1}</p>
                            <p className="pf-xp-count">{(formData.xp || 0).toLocaleString()} XP</p>
                        </div>
                        {nextMilestone && (
                            <div className="pf-xp-milestone">
                                <span className="pf-xp-milestone-lbl">Next Rank</span>
                                <span className="pf-xp-milestone-val">{nextMilestone.title} · Lv {nextMilestone.level}</span>
                            </div>
                        )}
                    </div>
                    <div className="pf-xp-track">
                        <div
                            className="pf-xp-fill"
                            key={`xp-${formData.xp}-${formData.level}`}
                            style={{
                                width: `${xpPct}%`,
                                background: `linear-gradient(90deg, rgba(139,92,246,0.9), rgba(99,179,237,0.8))`
                            }}
                        />
                    </div>
                    <div className="pf-xp-sub">
                        {Math.round(xpProgress.current).toLocaleString()} / {Math.round(xpProgress.needed).toLocaleString()} XP &nbsp;·&nbsp; {Math.round(xpPct)}%
                    </div>
                </div>

                {/* Streak + mini stats */}
                <div className="pf-row-2">
                    <div className="pf-streak-card">
                        <span className="pf-streak-flame">🔥</span>
                        <div className="pf-streak-info">
                            <span className="pf-streak-lbl">Login Streak</span>
                            <span className="pf-streak-val">{loginStreak}</span>
                            <span className="pf-streak-unit">Days</span>
                        </div>
                    </div>
                    <div className="pf-mini-stats">
                        <div className="pf-mini-stat">
                            <span className="pf-mini-icon">📈</span>
                            <span className="pf-mini-val">{formData.level || 1}</span>
                            <span className="pf-mini-lbl">Level</span>
                        </div>
                        <div className="pf-mini-stat">
                            <span className="pf-mini-icon">⭐</span>
                            <span className="pf-mini-val">{((formData.xp || 0) / 1000).toFixed(1)}K</span>
                            <span className="pf-mini-lbl">XP Total</span>
                        </div>
                        <div className="pf-mini-stat">
                            <span className="pf-mini-icon">🏆</span>
                            <span className="pf-mini-val">{achievements.length}</span>
                            <span className="pf-mini-lbl">Badges</span>
                        </div>
                    </div>
                </div>

                {/* Journal summary */}
                <div className="pf-journal-card">
                    <p className="pf-section-label">Journal · Completion</p>
                    {journalStatsLoading ? (
                        <div className="pf-journal-loading">
                            <div className="pf-spinner pf-spinner-sm"></div>
                            <span>Loading stats…</span>
                        </div>
                    ) : (
                        <>
                            <div className="pf-rings-row">
                                <RingProgress pct={journalDayPct} color="rgba(16,185,129,0.85)"
                                    value={dayTotal ? `${journalDayPct}%` : '—'} label="Today" />
                                <RingProgress pct={journalWeekPct} color="rgba(139,92,246,0.85)"
                                    value={weekTotal ? `${journalWeekPct}%` : '—'} label="This Week" />
                                <RingProgress pct={journalMonthPct} color="rgba(99,179,237,0.85)"
                                    value={monthTotal ? `${journalMonthPct}%` : '—'} label="This Month" />
                            </div>
                            <p className="pf-journal-hint">Task completion from your Aura Journal. Add and complete tasks to improve your stats.</p>
                        </>
                    )}
                </div>

                {/* Tabs */}
                <div className="pf-tabs">
                    {['overview', 'journey', 'statistics', 'achievements'].map(tab => (
                        <button
                            key={tab}
                            className={`pf-tab-btn${activeTab === tab ? ' active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Tab panel */}
                <div className="pf-tab-panel">
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="pf-panel">
                            <p className="pf-section-label">Account Settings</p>

                            {userRole && (
                                <div className="pf-role-row">
                                    <span className="pf-role-lbl">Role</span>
                                    <span className="pf-role-val">{userRole}</span>
                                </div>
                            )}

                            <div className="pf-form-row-2">
                                <div className="pf-form-group">
                                    <label className="pf-label">Username</label>
                                    <input className="pf-input" type="text" name="username"
                                        value={formData.username || ''} onChange={handleChange} />
                                    {usernameValidationError && <span className="pf-error">{usernameValidationError}</span>}
                                </div>
                                <div className="pf-form-group">
                                    <label className="pf-label">Full Name</label>
                                    <input className="pf-input" type="text" name="name"
                                        value={formData.name || ''} onChange={handleChange} />
                                </div>
                            </div>

                            <div className="pf-form-group">
                                <label className="pf-label">Email</label>
                                <input className="pf-input pf-input-disabled" type="email" name="email"
                                    value={formData.email || ''} onChange={handleChange} disabled />
                            </div>

                            <div className="pf-form-group">
                                <label className="pf-label">Bio</label>
                                <textarea className="pf-input pf-textarea" name="bio" rows="3"
                                    value={formData.bio || ''} onChange={handleChange}
                                    placeholder="Tell us about your trading journey…" />
                            </div>

                            <div className="pf-form-group">
                                <label className="pf-label">Timezone <span className="pf-label-hint">· daily journal reminder at 08:00</span></label>
                                <select className="pf-input" name="timezone"
                                    value={formData.timezone || ''}
                                    onChange={async (e) => {
                                        const val = e.target.value || '';
                                        setFormData(prev => ({ ...prev, timezone: val }));
                                        setEditedUserData(prev => ({ ...prev, timezone: val }));

                                        try {
                                            const token = localStorage.getItem('token');
                                            if (token) {
                                                await axios.put(`${resolveApiBaseUrl()}/api/users/settings`,
                                                    { timezone: val || null },
                                                    { headers: { Authorization: `Bearer ${token}` } }
                                                );

                                                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                                                const updatedUser = { ...storedUser, timezone: val || null };
                                                localStorage.setItem('user', JSON.stringify(updatedUser));

                                                if (setUser) setUser(updatedUser);

                                                setStatus("Timezone updated");
                                                setTimeout(() => setStatus(""), 2000);
                                            }
                                        } catch (error) {
                                            console.error('Timezone update error:', error);
                                            setStatus("Failed to update timezone");
                                        }
                                    }}>
                                    <option value="">Auto (browser)</option>
                                    {getIANATimezones().map(tz => (
                                        <option key={tz} value={tz}>{tz}</option>
                                    ))}
                                </select>
                            </div>

                            <button className="pf-save-btn" onClick={handleSaveChanges}>Save Profile</button>
                        </div>
                    )}

                    {/* Other tabs remain the same */}
                    {activeTab === 'journey' && (
                        <div className="pf-panel">
                            <p className="pf-section-label">Hero's Journey</p>
                            <div className="pf-journey-grid">
                                <div className="pf-journey-stat">
                                    <span className="pf-journey-icon">📈</span>
                                    <div className="pf-journey-info">
                                        <span className="pf-journey-lbl">Current Level</span>
                                        <span className="pf-journey-val">{formData.level || 1}</span>
                                    </div>
                                </div>
                                <div className="pf-journey-stat">
                                    <span className="pf-journey-icon">🎯</span>
                                    <div className="pf-journey-info">
                                        <span className="pf-journey-lbl">Total XP</span>
                                        <span className="pf-journey-val">{(formData.xp || 0).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="pf-journey-stat">
                                    <span className="pf-journey-icon">🏆</span>
                                    <div className="pf-journey-info">
                                        <span className="pf-journey-lbl">Rank</span>
                                        <span className="pf-journey-val">{rankTitle}</span>
                                    </div>
                                </div>
                                <div className="pf-journey-stat">
                                    <span className="pf-journey-icon">🔥</span>
                                    <div className="pf-journey-info">
                                        <span className="pf-journey-lbl">Login Streak</span>
                                        <span className="pf-journey-val">{loginStreak} days</span>
                                    </div>
                                </div>
                            </div>
                            {nextMilestone && (
                                <div className="pf-milestone-card">
                                    <span className="pf-milestone-eyebrow">Next Milestone</span>
                                    <span className="pf-milestone-name">{nextMilestone.title}</span>
                                    <span className="pf-milestone-level">Level {nextMilestone.level}</span>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'statistics' && (
                        <div className="pf-panel">
                            <p className="pf-section-label">Trading Statistics</p>
                            <div className="pf-stats-grid">
                                <div className="pf-stat-card">
                                    <span className="pf-stat-icon">📊</span>
                                    <span className="pf-stat-val">{tradingStats.totalTrades}</span>
                                    <span className="pf-stat-lbl">Total Trades</span>
                                </div>
                                <div className="pf-stat-card">
                                    <span className="pf-stat-icon">✅</span>
                                    <span className="pf-stat-val">{tradingStats.winRate}%</span>
                                    <span className="pf-stat-lbl">Win Rate</span>
                                </div>
                                <div className="pf-stat-card">
                                    <span className="pf-stat-icon">💰</span>
                                    <span className="pf-stat-val">${tradingStats.totalProfit.toLocaleString()}</span>
                                    <span className="pf-stat-lbl">Total Profit</span>
                                </div>
                            </div>
                            <div className="pf-stats-note">
                                Trading statistics will be available when you connect your trading account.
                            </div>
                        </div>
                    )}

                    {activeTab === 'achievements' && (
                        <div className="pf-panel">
                            <p className="pf-section-label">Achievements · {achievements.length} Unlocked</p>
                            {achievements.length > 0 ? (
                                <div className="pf-achievements-grid">
                                    {achievements.map((achievement, index) => (
                                        <div key={index} className="pf-badge">
                                            <span className="pf-badge-icon">🏅</span>
                                            <span className="pf-badge-name">{achievement}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="pf-no-achievements">
                                    <span className="pf-no-ach-icon">🏅</span>
                                    <p className="pf-no-ach-title">No achievements yet</p>
                                    <p className="pf-no-ach-hint">Keep trading and engaging to unlock achievements!</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Status message */}
                {status && (
                    <div className={`pf-status${status.toLowerCase().includes('fail') || status.toLowerCase().includes('error') ? ' pf-status-err' : ''}`}>
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Profile;