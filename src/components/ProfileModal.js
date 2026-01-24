import React, { useEffect, useState, useCallback } from 'react';
import {
    getRankTitle,
    getTierName,
    getTierColor,
    getXPProgress,
    getNextRankMilestone,
    getLevelFromXP,
    getXPForNextLevel
} from '../utils/xpSystem';
import { 
    FaTimes, FaCog, FaUserPlus, FaUser, FaCrown, FaCheckCircle, FaFire, 
    FaGem, FaStar, FaTrophy, FaChartLine, FaClock, FaShieldAlt, FaRobot,
    FaLock, FaUnlock, FaUserCheck, FaUserTimes, FaHourglass, FaComments,
    FaGraduationCap, FaCalendarCheck, FaBolt, FaMedal, FaAward
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import '../styles/ProfileModal.css';

// All possible achievements with unlock conditions
const ALL_ACHIEVEMENTS = [
    { id: 'first_steps', name: 'First Steps', icon: '🔰', description: 'Reach Level 5', unlockLevel: 5 },
    { id: 'communicator', name: 'Active Communicator', icon: '💬', description: 'Reach Level 10', unlockLevel: 10 },
    { id: 'dedicated', name: 'Dedicated Trader', icon: '📈', description: 'Reach Level 15', unlockLevel: 15 },
    { id: 'rising_star', name: 'Rising Star', icon: '⭐', description: 'Reach Level 20', unlockLevel: 20 },
    { id: 'level_25', name: 'Level 25 Club', icon: '🔥', description: 'Reach Level 25', unlockLevel: 25 },
    { id: 'half_century', name: 'Half Century', icon: '🎯', description: 'Reach Level 50', unlockLevel: 50 },
    { id: 'veteran', name: 'Veteran Status', icon: '👑', description: 'Reach Level 75', unlockLevel: 75 },
    { id: 'legend', name: 'Infinity Legend', icon: '💎', description: 'Reach Level 100', unlockLevel: 100 },
    { id: 'streak_7', name: 'Week Warrior', icon: '🗓️', description: '7 day login streak', unlockStreak: 7 },
    { id: 'streak_30', name: 'Monthly Master', icon: '📅', description: '30 day login streak', unlockStreak: 30 },
    { id: 'ai_user', name: 'AI Explorer', icon: '🤖', description: 'Use AI Chat 10 times', unlockAiChats: 10 },
    { id: 'social', name: 'Social Butterfly', icon: '🦋', description: 'Send 100 messages', unlockMessages: 100 }
];

const ProfileModal = ({ isOpen, onClose, userId, userData, onViewProfile, currentUserId }) => {
    const [profile, setProfile] = useState(userData || null);
    const [loading, setLoading] = useState(!userData);
    const [activeTab, setActiveTab] = useState('overview');
    const [isOnline, setIsOnline] = useState(false);
    const [lastSeen, setLastSeen] = useState(null);
    const [settings, setSettings] = useState(null);
    const [stats, setStats] = useState(null);
    const [friendStatus, setFriendStatus] = useState('none');
    const [friendLoading, setFriendLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [xpAnimated, setXpAnimated] = useState(0);

    // Get stored user for current user check
    const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
    const isOwnProfile = userId === storedUser.id || userId === currentUserId;
    const token = localStorage.getItem('token');

    // Fetch profile data
    const fetchProfile = useCallback(async () => {
        if (!userId) return;
        try {
            setLoading(true);
            const baseUrl = window.location.origin;
            const response = await fetch(`${baseUrl}/api/users/public-profile/${userId}`);
            
            if (response.ok) {
                const data = await response.json();
                setProfile(data);
                
                if (data.last_seen) {
                    const lastSeenDate = new Date(data.last_seen);
                    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
                    setIsOnline(lastSeenDate >= fiveMinutesAgo);
                    setLastSeen(lastSeenDate);
                }
            }
        } catch (err) {
            console.error("Error fetching profile:", err);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    // Fetch settings and stats (for own profile)
    const fetchSettings = useCallback(async () => {
        if (!isOwnProfile || !token) return;
        try {
            const response = await fetch(`${window.location.origin}/api/users/settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSettings(data.settings);
                setStats(data.stats);
            }
        } catch (err) {
            console.error("Error fetching settings:", err);
        }
    }, [isOwnProfile, token]);

    // Check friend status
    const checkFriendStatus = useCallback(async () => {
        if (isOwnProfile || !token || !userId) return;
        try {
            const response = await fetch(`${window.location.origin}/api/users/friends/status/${userId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setFriendStatus(data.status || 'none');
            } else {
                // Graceful fallback - don't break the UI
                setFriendStatus('none');
            }
        } catch (err) {
            console.error("Error checking friend status:", err);
            setFriendStatus('none');
        }
    }, [isOwnProfile, token, userId]);

    // Initialize
    useEffect(() => {
        if (isOpen && userId) {
            if (!userData) fetchProfile();
            else {
                setProfile(userData);
                if (userData.last_seen) {
                    const lastSeenDate = new Date(userData.last_seen);
                    setIsOnline(lastSeenDate >= new Date(Date.now() - 5 * 60 * 1000));
                    setLastSeen(lastSeenDate);
                }
                setLoading(false);
            }
            fetchSettings();
            checkFriendStatus();
        }
    }, [isOpen, userId, userData, fetchProfile, fetchSettings, checkFriendStatus]);

    // Animate XP bar
    useEffect(() => {
        if (profile && isOpen) {
            const xpProgress = getXPProgress(profile.xp || 0, profile.level || 1);
            setXpAnimated(0);
            const timer = setTimeout(() => setXpAnimated(xpProgress.percentage), 100);
            return () => clearTimeout(timer);
        }
    }, [profile, isOpen]);

    if (!isOpen) return null;

    // Friend action handlers
    const handleFriendAction = async (action) => {
        if (!token) {
            toast.error('Please log in to manage friends');
            return;
        }
        
        setFriendLoading(true);
        try {
            let endpoint = '';
            let method = 'POST';
            
            switch (action) {
                case 'add':
                    endpoint = '/api/users/friends/request';
                    break;
                case 'accept':
                    endpoint = '/api/users/friends/accept';
                    break;
                case 'reject':
                    endpoint = '/api/users/friends/reject';
                    break;
                case 'remove':
                    endpoint = `/api/users/friends/${userId}`;
                    method = 'DELETE';
                    break;
                default:
                    return;
            }

            const response = await fetch(`${window.location.origin}${endpoint}`, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: method !== 'DELETE' ? JSON.stringify({ friendId: userId }) : undefined
            });

            const data = await response.json();
            
            if (data.success) {
                setFriendStatus(data.status || 'none');
                toast.success(data.message);
            } else {
                toast.error(data.message || 'Action failed');
            }
        } catch (err) {
            toast.error('Failed to complete action');
        } finally {
            setFriendLoading(false);
        }
    };

    // Settings update handler
    const handleSettingsUpdate = async (updates) => {
        if (!token) return;
        setSettingsLoading(true);
        try {
            const response = await fetch(`${window.location.origin}/api/users/settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(updates)
            });
            const data = await response.json();
            if (data.success) {
                setSettings(prev => ({ ...prev, ...updates }));
                toast.success('Settings updated');
            } else {
                toast.error(data.message || 'Update failed');
            }
        } catch (err) {
            toast.error('Failed to update settings');
        } finally {
            setSettingsLoading(false);
        }
    };

    // Get friend button config
    const getFriendButton = () => {
        switch (friendStatus) {
            case 'accepted':
                return { icon: <FaUserCheck />, text: 'Friends', color: '#23A55A', action: 'remove' };
            case 'pending_sent':
                return { icon: <FaHourglass />, text: 'Pending', color: '#F0B232', action: null };
            case 'pending_received':
                return { icon: <FaUserPlus />, text: 'Accept', color: '#5865F2', action: 'accept' };
            default:
                return { icon: <FaUserPlus />, text: 'Add Friend', color: '#23A55A', action: 'add' };
        }
    };

    const friendBtn = getFriendButton();

    // Helper functions
    const getAvatarPath = (avatarName) => {
        if (avatarName?.startsWith('data:image') || avatarName?.startsWith('/')) return avatarName;
        return avatarName ? `/avatars/${avatarName}` : '/avatars/avatar_ai.png';
    };

    const formatLastSeen = (date) => {
        if (!date) return 'Never';
        const diffMs = Date.now() - date;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return `${Math.floor(diffMins / 1440)}d ago`;
    };

    // Level-based banner gradient
    const getBannerGradient = (level) => {
        if (level >= 100) return 'linear-gradient(135deg, #FFD700 0%, #FFA500 30%, #FF6B35 60%, #E91E63 100%)';
        if (level >= 75) return 'linear-gradient(135deg, #00D4FF 0%, #5865F2 50%, #9B59B6 100%)';
        if (level >= 50) return 'linear-gradient(135deg, #9B59B6 0%, #8B5CF6 50%, #A78BFA 100%)';
        if (level >= 25) return 'linear-gradient(135deg, #00B894 0%, #00CEC9 50%, #81ECEC 100%)';
        if (level >= 10) return 'linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%)';
        return 'linear-gradient(135deg, rgba(139, 92, 246, 0.4) 0%, rgba(167, 139, 250, 0.3) 100%)';
    };

    // Get unlocked achievements
    const getAchievements = (level, streak = 0, aiChats = 0, messages = 0) => {
        return ALL_ACHIEVEMENTS.map(a => ({
            ...a,
            unlocked: (a.unlockLevel && level >= a.unlockLevel) ||
                      (a.unlockStreak && streak >= a.unlockStreak) ||
                      (a.unlockAiChats && aiChats >= a.unlockAiChats) ||
                      (a.unlockMessages && messages >= a.unlockMessages)
        }));
    };

    if (loading || !profile) {
        return (
            <div className="profile-modal-overlay" onClick={onClose}>
                <div className="profile-modal-content" onClick={(e) => e.stopPropagation()}>
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Loading profile...</div>
                </div>
            </div>
        );
    }

    const level = profile.level || 1;
    const xp = profile.xp || 0;
    const xpProgress = getXPProgress(xp, level);
    const rankTitle = getRankTitle(level);
    const tierName = getTierName(level);
    const tierColor = getTierColor(level);
    const nextMilestone = getNextRankMilestone(level);
    const loginStreak = profile.login_streak || 0;
    const xpForNext = getXPForNextLevel(level);
    const achievements = getAchievements(level, loginStreak, stats?.ai_chats_count || 0, stats?.community_messages || 0);
    const unlockedCount = achievements.filter(a => a.unlocked).length;

    // Settings Modal
    const SettingsModal = () => (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.9)', zIndex: 10001, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={() => setShowSettings(false)}>
            <div style={{
                background: 'linear-gradient(135deg, rgba(30, 30, 46, 0.98) 0%, rgba(20, 20, 35, 0.99) 100%)',
                borderRadius: '20px', maxWidth: '600px', width: '100%', maxHeight: '80vh',
                overflow: 'auto', padding: '30px', border: '1px solid rgba(139, 92, 246, 0.3)'
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                    <h2 style={{ color: 'white', margin: 0, fontSize: '1.5rem' }}>⚙️ Settings</h2>
                    <button onClick={() => setShowSettings(false)} style={{
                        background: 'rgba(255,0,0,0.2)', border: 'none', color: 'white',
                        width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer'
                    }}><FaTimes /></button>
                </div>

                {/* Trading Identity */}
                <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ color: '#C4B5FD', fontSize: '1rem', marginBottom: '15px', textTransform: 'uppercase' }}>
                        <FaChartLine style={{ marginRight: '8px' }} />Trading Identity
                    </h3>
                    
                    <div style={{ display: 'grid', gap: '15px' }}>
                        <div>
                            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '8px' }}>
                                Preferred Markets
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {['forex', 'gold', 'crypto', 'indices', 'stocks', 'oil'].map(market => (
                                    <button key={market} onClick={() => {
                                        const current = settings?.preferred_markets || [];
                                        const updated = current.includes(market) 
                                            ? current.filter(m => m !== market)
                                            : [...current, market];
                                        handleSettingsUpdate({ preferred_markets: updated });
                                    }} style={{
                                        padding: '8px 16px', borderRadius: '20px', cursor: 'pointer',
                                        background: settings?.preferred_markets?.includes(market) ? tierColor : 'rgba(255,255,255,0.1)',
                                        border: 'none', color: 'white', fontSize: '0.85rem', fontWeight: 600,
                                        textTransform: 'capitalize', transition: 'all 0.2s'
                                    }}>{market}</button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '8px' }}>
                                Trading Sessions
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {['asian', 'london', 'newyork', 'sydney'].map(session => (
                                    <button key={session} onClick={() => {
                                        const current = settings?.trading_sessions || [];
                                        const updated = current.includes(session) 
                                            ? current.filter(s => s !== session)
                                            : [...current, session];
                                        handleSettingsUpdate({ trading_sessions: updated });
                                    }} style={{
                                        padding: '8px 16px', borderRadius: '20px', cursor: 'pointer',
                                        background: settings?.trading_sessions?.includes(session) ? '#5865F2' : 'rgba(255,255,255,0.1)',
                                        border: 'none', color: 'white', fontSize: '0.85rem', fontWeight: 600,
                                        textTransform: 'capitalize', transition: 'all 0.2s'
                                    }}>{session}</button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', display: 'block', marginBottom: '8px' }}>
                                Risk Profile
                            </label>
                            <select value={settings?.risk_profile || 'moderate'} onChange={(e) => 
                                handleSettingsUpdate({ risk_profile: e.target.value })
                            } style={{
                                width: '100%', padding: '12px', borderRadius: '10px', cursor: 'pointer',
                                background: 'rgba(20, 20, 35, 0.8)', border: '1px solid rgba(139, 92, 246, 0.3)',
                                color: 'white', fontSize: '1rem'
                            }}>
                                <option value="conservative">🛡️ Conservative</option>
                                <option value="moderate">⚖️ Moderate</option>
                                <option value="aggressive">🔥 Aggressive</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Privacy Settings */}
                <div style={{ marginBottom: '30px' }}>
                    <h3 style={{ color: '#C4B5FD', fontSize: '1rem', marginBottom: '15px', textTransform: 'uppercase' }}>
                        <FaShieldAlt style={{ marginRight: '8px' }} />Privacy
                    </h3>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[
                            { key: 'show_online_status', label: 'Show Online Status' },
                            { key: 'show_trading_stats', label: 'Show Trading Stats' },
                            { key: 'show_achievements', label: 'Show Achievements' }
                        ].map(({ key, label }) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={settings?.[key] !== false}
                                    onChange={(e) => handleSettingsUpdate({ [key]: e.target.checked })}
                                    style={{ width: '20px', height: '20px', accentColor: tierColor }}
                                />
                                <span style={{ color: 'white', fontSize: '0.95rem' }}>{label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {settingsLoading && (
                    <div style={{ textAlign: 'center', padding: '10px', color: '#C4B5FD' }}>Saving...</div>
                )}
            </div>
        </div>
    );

    return (
        <div className="profile-modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.9)', backdropFilter: 'blur(10px)',
            zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
        }} onClick={onClose}>
            <div className="profile-modal-content" style={{
                background: 'linear-gradient(135deg, rgba(30, 30, 46, 0.98) 0%, rgba(20, 20, 35, 0.99) 100%)',
                borderRadius: '24px', boxShadow: `0 25px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px ${tierColor}40`,
                maxWidth: '900px', width: '100%', maxHeight: '92vh', overflow: 'auto', position: 'relative'
            }} onClick={(e) => e.stopPropagation()}>
                
                {/* Action Buttons */}
                <div style={{ position: 'absolute', top: '15px', right: '15px', display: 'flex', gap: '8px', zIndex: 10 }}>
                    {isOwnProfile && (
                        <button onClick={() => setShowSettings(true)} title="Settings" style={{
                            background: 'rgba(0, 0, 0, 0.7)', border: '1px solid rgba(255, 255, 255, 0.2)',
                            color: 'white', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s'
                        }}><FaCog /></button>
                    )}
                    
                    {!isOwnProfile && (
                        <button onClick={() => friendBtn.action && handleFriendAction(friendBtn.action)}
                            disabled={friendLoading || !friendBtn.action} title={friendBtn.text} style={{
                            background: `${friendBtn.color}40`, border: `1px solid ${friendBtn.color}`,
                            color: 'white', padding: '8px 16px', borderRadius: '20px', cursor: friendBtn.action ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 600,
                            opacity: friendLoading ? 0.6 : 1, transition: 'all 0.3s'
                        }}>
                            {friendLoading ? <span className="loading-spinner" style={{ width: '16px', height: '16px' }} /> : friendBtn.icon}
                            {friendBtn.text}
                        </button>
                    )}
                    
                    <button onClick={onClose} title="Close" style={{
                        background: 'rgba(0, 0, 0, 0.7)', border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'white', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}><FaTimes /></button>
                </div>

                {/* Level-Based Banner */}
                <div style={{
                    position: 'relative', width: '100%', height: '180px', overflow: 'hidden',
                    background: getBannerGradient(level), marginBottom: '70px'
                }}>
                    {/* Animated particles effect for high levels */}
                    {level >= 50 && (
                        <div style={{
                            position: 'absolute', inset: 0, background: 'url("data:image/svg+xml,...")',
                            animation: 'shimmer 3s infinite linear', opacity: 0.3
                        }} />
                    )}
                    
                    {/* Level indicator on banner */}
                    <div style={{
                        position: 'absolute', top: '15px', left: '15px', padding: '8px 16px',
                        background: 'rgba(0,0,0,0.5)', borderRadius: '20px', backdropFilter: 'blur(10px)',
                        display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                        <span style={{ fontSize: '1.5rem' }}>
                            {level >= 75 ? '👑' : level >= 50 ? '💎' : level >= 25 ? '🔥' : '⭐'}
                        </span>
                        <span style={{ color: 'white', fontWeight: 700, fontSize: '1.1rem' }}>Level {level}</span>
                    </div>

                    {/* Avatar */}
                    <div style={{ position: 'absolute', bottom: '-60px', left: '40px', zIndex: 5 }}>
                        <div style={{ position: 'relative', width: '130px', height: '130px' }}>
                            {profile.avatar && !profile.avatar.includes('avatar_ai') ? (
                                <img src={getAvatarPath(profile.avatar)} alt="Avatar" style={{
                                    width: '130px', height: '130px', borderRadius: '50%', objectFit: 'cover',
                                    border: `5px solid ${tierColor}`, boxShadow: `0 10px 40px rgba(0, 0, 0, 0.5), 0 0 30px ${tierColor}60`
                                }} onError={(e) => e.target.style.display = 'none'} />
                            ) : (
                                <div style={{
                                    width: '130px', height: '130px', borderRadius: '50%',
                                    background: `linear-gradient(135deg, ${tierColor}, ${tierColor}80)`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '2.8rem', fontWeight: 700, color: 'white',
                                    border: `5px solid ${tierColor}`, boxShadow: `0 10px 40px rgba(0, 0, 0, 0.5)`
                                }}>{(profile.username || 'U')[0].toUpperCase()}</div>
                            )}
                            
                            {/* Online indicator */}
                            <div style={{
                                position: 'absolute', bottom: '8px', right: '8px', width: '28px', height: '28px',
                                borderRadius: '50%', background: isOnline ? '#23A55A' : '#72767D',
                                border: '4px solid rgba(30, 30, 46, 0.95)', boxShadow: isOnline ? '0 0 12px #23A55A' : 'none'
                            }} />
                        </div>
                    </div>
                </div>

                {/* Profile Header */}
                <div style={{ padding: '0 40px 20px', marginTop: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'white', margin: 0 }}>
                            {profile.username || profile.name || 'User'}
                        </h1>
                        {(profile.role === 'admin' || profile.role === 'super_admin') && <FaCrown style={{ color: '#FFD700', fontSize: '1.4rem' }} />}
                        {profile.subscription_status === 'active' && <FaCheckCircle style={{ color: '#5865F2', fontSize: '1.2rem' }} />}
                    </div>

                    {/* Rank Banner */}
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: '12px', padding: '12px 20px',
                        background: `linear-gradient(135deg, ${tierColor}30, ${tierColor}10)`,
                        border: `2px solid ${tierColor}60`, borderRadius: '14px', marginBottom: '15px'
                    }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px', background: tierColor,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 4px 15px ${tierColor}50`
                        }}>
                            {level >= 75 ? <FaCrown style={{ color: 'white' }} /> :
                             level >= 50 ? <FaGem style={{ color: 'white' }} /> :
                             level >= 25 ? <FaTrophy style={{ color: 'white' }} /> : <FaStar style={{ color: 'white' }} />}
                        </div>
                        <div>
                            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: tierColor, letterSpacing: '1px' }}>{rankTitle}</div>
                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{tierName}</div>
                        </div>
                    </div>

                    {/* Animated XP Progress Bar */}
                    <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', fontWeight: 600 }}>
                                Level {level} → Level {level + 1}
                            </span>
                            <span style={{ color: tierColor, fontSize: '0.9rem', fontWeight: 700 }}>
                                {(xpProgress.current || 0).toLocaleString()} / {(xpProgress.needed || 0).toLocaleString()} XP
                            </span>
                        </div>
                        <div style={{
                            width: '100%', height: '12px', background: 'rgba(30, 30, 46, 0.8)',
                            borderRadius: '10px', overflow: 'hidden', position: 'relative'
                        }}>
                            <div style={{
                                height: '100%', width: `${xpAnimated}%`,
                                background: `linear-gradient(90deg, ${tierColor} 0%, ${tierColor}dd 50%, ${tierColor} 100%)`,
                                borderRadius: '10px', transition: 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: `0 0 20px ${tierColor}60`, position: 'relative'
                            }}>
                                {/* Shimmer effect */}
                                <div style={{
                                    position: 'absolute', inset: 0,
                                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                                    animation: 'shimmer 2s infinite'
                                }} />
                            </div>
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', marginTop: '6px', textAlign: 'right' }}>
                            {((xpProgress.needed || 0) - (xpProgress.current || 0)).toLocaleString()} XP to next level
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '5px', padding: '0 40px', borderBottom: '2px solid rgba(139, 92, 246, 0.2)', marginBottom: '25px', overflowX: 'auto' }}>
                    {['overview', 'identity', 'statistics', 'achievements'].map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                            background: 'transparent', border: 'none', padding: '14px 20px',
                            color: activeTab === tab ? tierColor : 'rgba(255, 255, 255, 0.5)',
                            fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
                            letterSpacing: '0.5px', position: 'relative', whiteSpace: 'nowrap'
                        }}>
                            {tab === 'identity' ? 'Trading Identity' : tab}
                            {activeTab === tab && (
                                <div style={{
                                    position: 'absolute', bottom: '-2px', left: 0, right: 0, height: '3px',
                                    background: tierColor, borderRadius: '2px 2px 0 0'
                                }} />
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div style={{ padding: '0 40px 40px', minHeight: '250px' }}>
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div style={{ display: 'grid', gap: '20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                                {[
                                    { icon: '⚡', label: 'Power Level', value: level, color: tierColor },
                                    { icon: '✨', label: 'Total XP', value: xp.toLocaleString(), color: '#FFD700' },
                                    { icon: '🔥', label: 'Login Streak', value: `${loginStreak} days`, color: '#FF6B35' },
                                    { icon: '🎖️', label: 'Achievements', value: `${unlockedCount}/${ALL_ACHIEVEMENTS.length}`, color: '#5865F2' }
                                ].map((stat, i) => (
                                    <div key={i} style={{
                                        padding: '20px', background: 'rgba(139, 92, 246, 0.08)',
                                        border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '16px',
                                        display: 'flex', alignItems: 'center', gap: '15px'
                                    }}>
                                        <span style={{ fontSize: '2rem' }}>{stat.icon}</span>
                                        <div>
                                            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>{stat.label}</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            {/* Next Milestone */}
                            {nextMilestone && (
                                <div style={{
                                    padding: '25px', background: `linear-gradient(135deg, ${tierColor}15, ${tierColor}08)`,
                                    border: `1px solid ${tierColor}40`, borderRadius: '16px', textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', marginBottom: '8px' }}>NEXT MILESTONE</div>
                                    <div style={{ fontSize: '1.6rem', fontWeight: 700, color: tierColor }}>{nextMilestone.title}</div>
                                    <div style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.7)', marginTop: '5px' }}>
                                        {nextMilestone.level - level} levels to go
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Trading Identity Tab */}
                    {activeTab === 'identity' && (
                        <div style={{ display: 'grid', gap: '25px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                                <div style={{ padding: '25px', background: 'rgba(139, 92, 246, 0.08)', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                        <FaChartLine style={{ color: tierColor, fontSize: '1.2rem' }} />
                                        <span style={{ color: 'white', fontWeight: 700 }}>Preferred Markets</span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {(settings?.preferred_markets || ['forex', 'gold']).map((market, i) => (
                                            <span key={i} style={{
                                                padding: '6px 14px', background: tierColor, borderRadius: '15px',
                                                color: 'white', fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize'
                                            }}>{market}</span>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ padding: '25px', background: 'rgba(139, 92, 246, 0.08)', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                        <FaClock style={{ color: '#5865F2', fontSize: '1.2rem' }} />
                                        <span style={{ color: 'white', fontWeight: 700 }}>Trading Sessions</span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {(settings?.trading_sessions || ['london', 'newyork']).map((session, i) => (
                                            <span key={i} style={{
                                                padding: '6px 14px', background: '#5865F2', borderRadius: '15px',
                                                color: 'white', fontSize: '0.85rem', fontWeight: 600, textTransform: 'capitalize'
                                            }}>{session}</span>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ padding: '25px', background: 'rgba(139, 92, 246, 0.08)', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                        <FaShieldAlt style={{ color: '#00B894', fontSize: '1.2rem' }} />
                                        <span style={{ color: 'white', fontWeight: 700 }}>Risk Profile</span>
                                    </div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#00B894', textTransform: 'capitalize' }}>
                                        {settings?.risk_profile === 'conservative' ? '🛡️' : settings?.risk_profile === 'aggressive' ? '🔥' : '⚖️'} {settings?.risk_profile || 'Moderate'}
                                    </div>
                                </div>

                                <div style={{ padding: '25px', background: 'rgba(139, 92, 246, 0.08)', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                        <FaRobot style={{ color: '#FF6B35', fontSize: '1.2rem' }} />
                                        <span style={{ color: 'white', fontWeight: 700 }}>AI Usage</span>
                                    </div>
                                    <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#FF6B35' }}>
                                        {stats?.ai_chats_count || 0} Conversations
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Statistics Tab */}
                    {activeTab === 'statistics' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                            {[
                                { icon: <FaRobot />, label: 'AI Chats', value: stats?.ai_chats_count || 0, color: '#FF6B35' },
                                { icon: <FaComments />, label: 'Messages Sent', value: stats?.community_messages || 0, color: '#5865F2' },
                                { icon: <FaGraduationCap />, label: 'Courses Done', value: stats?.courses_completed || 0, color: '#00B894' },
                                { icon: <FaFire />, label: 'Best Streak', value: `${stats?.longest_streak || loginStreak} days`, color: '#FF6B35' },
                                { icon: <FaCalendarCheck />, label: 'Login Days', value: stats?.total_login_days || 0, color: '#9B59B6' },
                                { icon: <FaBolt />, label: 'Monthly XP', value: (stats?.current_month_xp || xp).toLocaleString(), color: '#FFD700' }
                            ].map((stat, i) => (
                                <div key={i} style={{
                                    padding: '25px', background: 'rgba(139, 92, 246, 0.08)',
                                    border: '1px solid rgba(139, 92, 246, 0.2)', borderRadius: '16px', textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '10px', color: stat.color }}>{stat.icon}</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: stat.color }}>{stat.value}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginTop: '5px' }}>{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Achievements Tab */}
                    {activeTab === 'achievements' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '15px' }}>
                            {achievements.map((achievement, i) => (
                                <div key={i} title={achievement.description} style={{
                                    padding: '20px', textAlign: 'center', borderRadius: '16px', cursor: 'pointer',
                                    background: achievement.unlocked ? `linear-gradient(135deg, ${tierColor}20, ${tierColor}10)` : 'rgba(50,50,70,0.3)',
                                    border: `1px solid ${achievement.unlocked ? tierColor + '50' : 'rgba(100,100,120,0.3)'}`,
                                    opacity: achievement.unlocked ? 1 : 0.5, transition: 'all 0.3s',
                                    transform: achievement.unlocked ? 'scale(1)' : 'scale(0.95)'
                                }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '10px', filter: achievement.unlocked ? 'none' : 'grayscale(100%)' }}>
                                        {achievement.unlocked ? achievement.icon : <FaLock style={{ color: 'rgba(255,255,255,0.3)' }} />}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: achievement.unlocked ? tierColor : 'rgba(255,255,255,0.4)' }}>
                                        {achievement.name}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', marginTop: '5px' }}>
                                        {achievement.description}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* View Full Profile Button */}
                {onViewProfile && (
                    <div style={{ padding: '20px 40px 30px', borderTop: '1px solid rgba(139, 92, 246, 0.2)', display: 'flex', justifyContent: 'center' }}>
                        <button onClick={onViewProfile} style={{
                            display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 40px',
                            background: `linear-gradient(135deg, ${tierColor} 0%, ${tierColor}cc 100%)`,
                            border: 'none', borderRadius: '14px', color: 'white', fontSize: '1rem',
                            fontWeight: 700, cursor: 'pointer', boxShadow: `0 8px 30px ${tierColor}50`,
                            transition: 'all 0.3s', textTransform: 'uppercase', letterSpacing: '1px'
                        }}><FaUser /> View Full Profile</button>
                    </div>
                )}
            </div>

            {/* Settings Modal */}
            {showSettings && <SettingsModal />}

            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.1); }
                }
            `}</style>
        </div>
    );
};

export default ProfileModal;
