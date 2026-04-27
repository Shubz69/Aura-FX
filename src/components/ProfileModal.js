import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import {
    getRankTitle,
    getTierName,
    getTierColor,
    getXPProgress,
    getNextRankMilestone,
    getLevelFromXP,
    getXPForNextLevel
} from '../utils/xpSystem';
import { getStoredUser } from '../utils/storage';
import { 
    FaTimes, FaCog, FaUserPlus, FaUser, FaCrown, FaCheckCircle, FaFire, 
    FaGem, FaStar, FaTrophy, FaChartLine, FaClock, FaShieldAlt, FaRobot,
    FaLock, FaUnlock, FaUserCheck, FaUserTimes, FaHourglass, FaComments,
    FaGraduationCap, FaCalendarCheck, FaBolt, FaMedal, FaAward, FaBan,
    FaQuoteRight, FaPen
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { resolveAvatarUrl, getPlaceholderColor, isValidDataUrl } from '../utils/avatar';
import Api from '../services/Api';
import {
    formatMembershipLabel,
    normalizeRoleKey,
    hasActivePaidPlan,
    isSuperAdmin
} from '../utils/roles';
import '../styles/ProfileModal.css';

function inferTierUpperFromProfile(user) {
    if (hasActivePaidPlan(user)) {
        const pl = normalizeRoleKey(user.subscription_plan);
        if (['a7fx', 'elite'].includes(pl)) return 'ELITE';
        if (['aura', 'premium', 'pro'].includes(pl)) return 'PRO';
    }
    const r = normalizeRoleKey(user.role);
    if (r === 'a7fx' || r === 'elite') return 'ELITE';
    if (r === 'premium' || r === 'pro') return 'PRO';
    return 'ACCESS';
}

function planProductLabel(plan) {
    const pl = normalizeRoleKey(plan);
    if (pl === 'aura' || pl === 'pro') return 'AURA TERMINAL™';
    if (pl === 'a7fx' || pl === 'elite') return 'Elite';
    if (pl === 'premium') return 'Pro';
    if (pl === 'free' || pl === 'access') return 'Access';
    return pl ? pl.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '';
}

function subscriptionStatusLabel(status) {
    const s = normalizeRoleKey(status);
    if (s === 'active') return 'Active';
    if (s === 'trialing') return 'Trialing';
    if (s === 'past_due') return 'Past due';
    if (s === 'cancelled' || s === 'canceled') return 'Cancelled';
    if (s === 'expired') return 'Expired';
    if (s === 'inactive') return 'Inactive';
    return s ? s.replace(/_/g, ' ') : '';
}

const getModalRoot = () => {
    let modalRoot = document.getElementById('profile-modal-root');
    if (!modalRoot) {
        modalRoot = document.createElement('div');
        modalRoot.id = 'profile-modal-root';
        modalRoot.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99999; pointer-events: none;';
        document.body.appendChild(modalRoot);
    }
    return modalRoot;
};

const AvatarWithFallback = ({ size = 120, tierColor, isOnline, avatar, userId }) => {
    const avatarSrc = resolveAvatarUrl(avatar, typeof window !== 'undefined' ? window.location?.origin : '');
    const placeholderColor = getPlaceholderColor(userId);
    return (
        <div style={{ position: 'relative', width: `${size}px`, height: `${size}px`, flexShrink: 0 }}>
            <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: `3px solid ${tierColor}`,
                boxShadow: `0 0 0 1px ${tierColor}30, 0 4px 20px rgba(0,0,0,0.5)`,
                overflow: 'hidden',
                background: '#0f0f18'
            }}>
                {avatarSrc ? (
                    <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                ) : (
                    <div style={{ width: '100%', height: '100%', background: placeholderColor }} />
                )}
            </div>
            {/* Online dot */}
            <div style={{
                position: 'absolute', bottom: `${size * 0.05}px`, right: `${size * 0.05}px`,
                width: `${size * 0.18}px`, height: `${size * 0.18}px`, borderRadius: '50%',
                background: isOnline ? '#23A55A' : '#4a4a5a',
                border: '3px solid #0a0a12',
                boxShadow: isOnline ? '0 0 10px #23A55A88' : 'none', zIndex: 5,
                transition: 'all 0.3s ease'
            }} />
        </div>
    );
};

const ALL_ACHIEVEMENTS = [
    { id: 'first_steps', name: 'First Steps', icon: '\uD83D\uDD30', description: 'Reach Level 10', unlockLevel: 10 },
    { id: 'communicator', name: 'Communicator', icon: '\uD83D\uDCAC', description: 'Reach Level 20', unlockLevel: 20 },
    { id: 'dedicated', name: 'Dedicated', icon: '\uD83D\uDCC8', description: 'Reach Level 30', unlockLevel: 30 },
    { id: 'rising_star', name: 'Rising Star', icon: '\u2B50', description: 'Reach Level 40', unlockLevel: 40 },
    { id: 'level_50', name: 'Level 50', icon: '\uD83D\uDD25', description: 'Reach Level 50', unlockLevel: 50 },
    { id: 'tier_elite', name: 'Elite Tier', icon: '\uD83C\uDFAF', description: 'Reach Level 60', unlockLevel: 60 },
    { id: 'tier_legend', name: 'Legend Tier', icon: '\uD83D\uDC51', description: 'Reach Level 80', unlockLevel: 80 },
    { id: 'god_tier', name: 'GOD Tier', icon: '\uD83D\uDC8E', description: 'Reach Level 100', unlockLevel: 100 },
    { id: 'streak_7', name: 'Week Warrior', icon: '\uD83D\uDDD3\uFE0F', description: '7 day streak', unlockStreak: 7 },
    { id: 'streak_30', name: 'Monthly Master', icon: '\uD83D\uDCC5', description: '30 day streak', unlockStreak: 30 },
    { id: 'ai_user', name: 'AI Explorer', icon: '\uD83E\uDD16', description: 'Use AI 10 times', unlockAiChats: 10 },
    { id: 'social', name: 'Social', icon: '\uD83E\uDD8B', description: 'Send 100 messages', unlockMessages: 100 }
];

const ProfileModal = ({ isOpen, onClose, userId, userData, onViewProfile, currentUserId }) => {
    const { t } = useTranslation();
    const [profile, setProfile] = useState(userData || null);
    const [loading, setLoading] = useState(!userData);
    const [activeTab, setActiveTab] = useState('overview');
    const [isOnline, setIsOnline] = useState(false);
    const [lastSeen, setLastSeen] = useState(null);
    const [settings, setSettings] = useState(null);
    const [stats, setStats] = useState(null);
    const [friendStatus, setFriendStatus] = useState('none');
    const [friendRequestId, setFriendRequestId] = useState(null);
    const [friendLoading, setFriendLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [xpAnimated, setXpAnimated] = useState(0);
    const [mounted, setMounted] = useState(false);

    const storedUser = getStoredUser();
    const isOwnProfile = userId === storedUser.id || userId === currentUserId;
    const token = localStorage.getItem('token');
    const isSystemUser = userId && String(userId).toLowerCase() === 'system';

    const displayProfile = useMemo(() => {
        if (!profile) return null;
        if (!isOwnProfile) return profile;
        return {
            ...profile,
            subscription_plan: profile.subscription_plan ?? storedUser.subscription_plan,
            subscription_status: profile.subscription_status ?? storedUser.subscription_status,
            email: profile.email ?? storedUser.email
        };
    }, [profile, isOwnProfile, storedUser]);

    const fetchProfile = useCallback(async () => {
        if (!userId || isSystemUser) return;
        try {
            setLoading(true);
            const response = await fetch(`${Api.getBaseUrl() || ''}/api/users/public-profile/${userId}`);
            if (response.ok) {
                const data = await response.json();
                setProfile(data);
                if (data.last_seen) {
                    const lastSeenDate = new Date(data.last_seen);
                    setIsOnline(lastSeenDate >= new Date(Date.now() - 5 * 60 * 1000));
                    setLastSeen(lastSeenDate);
                }
            }
        } catch (err) { console.error("Error fetching profile:", err); }
        finally { setLoading(false); }
    }, [userId, isSystemUser]);

    const fetchSettings = useCallback(async () => {
        if (!isOwnProfile) return;
        const defaultSettings = { preferred_markets: ['forex', 'gold'], trading_sessions: ['london', 'newyork'], risk_profile: 'moderate', show_online_status: true, show_trading_stats: true, show_achievements: true };
        try {
            const stored = JSON.parse(localStorage.getItem('user_settings') || '{}');
            setSettings(Object.keys(stored).length > 0 ? { ...defaultSettings, ...stored } : defaultSettings);
        } catch (e) { setSettings(defaultSettings); }
        if (!token) return;
        try {
            const response = await fetch(`${Api.getBaseUrl() || ''}/api/users/settings`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (response.ok) {
                const data = await response.json();
                if (data.settings) { setSettings(prev => ({ ...prev, ...data.settings })); try { localStorage.setItem('user_settings', JSON.stringify(data.settings)); } catch (e) {} }
                if (data.stats) setStats(data.stats);
            }
        } catch (err) { console.error("Error fetching settings:", err); }
    }, [isOwnProfile, token]);

    const checkFriendStatus = useCallback(async () => {
    if (isOwnProfile || !token || !userId || isSystemUser) {
        setFriendStatus('none');
        setFriendRequestId(null);
        return;
    }
    
    try {
        const response = await fetch(`${Api.getBaseUrl() || ''}/api/friends/status/${userId}`, { 
            headers: { 'Authorization': `Bearer ${token}` } 
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Friend status response:', data); // Debug log
            
            // Convert status to lowercase for consistent handling
            const status = (data.status || 'none').toLowerCase();
            
            // Handle different status values
            if (status === 'accepted' || status === 'friends') {
                setFriendStatus('accepted');
                setFriendRequestId(null);
            } else if (status === 'pending') {
                // Need to determine if sent or received
                // The API should ideally tell us direction
                if (data.direction === 'sent') {
                    setFriendStatus('pending_sent');
                } else if (data.direction === 'received') {
                    setFriendStatus('pending_received');
                } else {
                    // If we don't have direction info, default to sent
                    setFriendStatus('pending_sent');
                }
                setFriendRequestId(data.requestId || null);
            } else if (status === 'pending_sent') {
                setFriendStatus('pending_sent');
                setFriendRequestId(data.requestId || null);
            } else if (status === 'pending_received') {
                setFriendStatus('pending_received');
                setFriendRequestId(data.requestId || null);
            } else {
                setFriendStatus('none');
                setFriendRequestId(null);
            }
        } else {
            setFriendStatus('none');
            setFriendRequestId(null);
        }
    } catch (err) { 
        console.error('Error checking friend status:', err);
        setFriendStatus('none'); 
        setFriendRequestId(null); 
    }
}, [isOwnProfile, token, userId, isSystemUser]);

   useEffect(() => {
    if (isOpen && userId) {
        setMounted(false);
        setTimeout(() => setMounted(true), 50);
        
        if (isSystemUser) { 
            setProfile(userData || { username: 'AURA TERMINAL™', id: 'system' }); 
            setLoading(false); 
            return; 
        }
        
        if (!userData) {
            fetchProfile(); 
        } else {
            setProfile(userData);
            if (userData.last_seen) { 
                const d = new Date(userData.last_seen); 
                setIsOnline(d >= new Date(Date.now() - 5 * 60 * 1000)); 
                setLastSeen(d); 
            }
            setLoading(false);
        }
        
        fetchSettings();
        checkFriendStatus(); // Make sure this is called
    }
    
    // Reset friend status when modal closes
    return () => {
        if (!isOpen) {
            setFriendStatus('none');
            setFriendRequestId(null);
        }
    };
}, [isOpen, userId, userData, isSystemUser, fetchProfile, fetchSettings, checkFriendStatus]);

    useEffect(() => {
        if (profile && isOpen) {
            const xpProgress = getXPProgress(profile.xp || 0, profile.level || 1);
            setXpAnimated(0);
            const timer = setTimeout(() => setXpAnimated(xpProgress.percentage), 200);
            return () => clearTimeout(timer);
        }
    }, [profile, isOpen]);

    if (!isOpen) return null;

   const handleFriendAction = async (action) => {
    if (!token) { toast.error('Please log in to manage friends'); return; }
    setFriendLoading(true);
    
    try {
        let endpoint = '', method = 'POST', body = {};
        
        switch (action) {
            case 'add':
                if (userId == null || userId === '' || Number.isNaN(Number(userId)) || Number(userId) < 1) {
                    toast.error('Cannot send request: invalid user');
                    setFriendLoading(false);
                    return;
                }
                endpoint = '/api/friends/request';
                body = { receiverUserId: Number(userId) };
                break;
            case 'cancel': 
                endpoint = '/api/friends/cancel'; 
                body = { requestId: friendRequestId }; 
                break;
            case 'accept': 
                endpoint = '/api/friends/accept'; 
                body = { requestId: friendRequestId }; 
                break;
            case 'reject': 
                endpoint = '/api/friends/decline'; 
                body = { requestId: friendRequestId }; 
                break;
            case 'remove': 
                endpoint = '/api/friends/remove'; 
                method = 'DELETE'; 
                body = { friendUserId: userId }; 
                break;
            default: 
                return;
        }
        
        const response = await fetch(`${Api.getBaseUrl() || ''}${endpoint}`, {
            method, 
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update friend status based on action
            switch (action) {
                case 'add':
                    setFriendStatus('pending_sent');
                    setFriendRequestId(data.request?.id || data.requestId || null);
                    break;
                case 'cancel':
                case 'reject':
                case 'remove':
                    setFriendStatus('none');
                    setFriendRequestId(null);
                    break;
                case 'accept':
                    setFriendStatus('accepted');
                    setFriendRequestId(null);
                    break;
                default:
                    break;
            }
            toast.success(data.message || 'Action completed successfully');
        } else { 
            toast.error(data.message || 'Action failed'); 
        }
    } catch (err) { 
        console.error('Friend action error:', err);
        toast.error('Failed to complete action'); 
    } finally { 
        setFriendLoading(false); 
    }
};

    const handleSettingsUpdate = async (updates) => {
        setSettings(prev => ({ ...prev, ...updates }));
        try { const stored = JSON.parse(localStorage.getItem('user_settings') || '{}'); localStorage.setItem('user_settings', JSON.stringify({ ...stored, ...updates })); } catch (e) {}
        if (!token) { toast.success('Settings saved locally'); return; }
        setSettingsLoading(true);
        try {
            const response = await fetch(`${Api.getBaseUrl() || ''}/api/users/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(updates) });
            if (response.ok) { const data = await response.json(); if (data.success) toast.success('Settings saved'); } else { toast.success('Settings saved locally'); }
        } catch (err) { toast.success('Settings saved locally'); }
        finally { setSettingsLoading(false); }
    };

   const getFriendButton = () => {
    // Debug log to see what status we're getting
    console.log('Current friendStatus:', friendStatus);
    
    switch (friendStatus) {
        case 'accepted':
            return { 
                icon: <FaUserCheck />, 
                text: 'Friends', 
                color: '#23A55A', 
                action: 'remove', 
                subtext: 'Click to remove' 
            };
        case 'pending_sent':
            return { 
                icon: <FaHourglass />, 
                text: 'Pending', 
                color: '#F0B232', 
                action: 'cancel', 
                subtext: 'Click to cancel' 
            };
        case 'pending_received':
            return { 
                icon: <FaUserPlus />, 
                text: 'Accept', 
                color: '#eaa960', 
                action: 'accept', 
                subtext: 'Accept request' 
            };
        case 'none':
        default:
            return { 
                icon: <FaUserPlus />, 
                text: 'Add Friend', 
                color: '#eaa960', 
                action: 'add', 
                subtext: 'Send request' 
            };
    }
};

    const friendBtn = getFriendButton();

    const formatLastSeen = (date) => {
        if (!date) return 'Never';
        const diffMs = Date.now() - date;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
        return `${Math.floor(diffMins / 1440)}d ago`;
    };

    const getBannerGradient = (level) => {
        if (level >= 100) return 'linear-gradient(135deg, #1a0a00 0%, #2d1500 40%, #1a0010 100%)';
        if (level >= 80) return 'linear-gradient(135deg, #000d1a 0%, #001428 40%, #0a0020 100%)';
        if (level >= 60) return 'linear-gradient(135deg, #0d0020 0%, #140030 40%, #0a0020 100%)';
        if (level >= 40) return 'linear-gradient(135deg, #001a15 0%, #002820 40%, #001a15 100%)';
        if (level >= 20) return 'linear-gradient(135deg, #0a0018 0%, #120025 40%, #0a0018 100%)';
        return 'linear-gradient(135deg, #0a0a18 0%, #0f0f20 100%)';
    };

    const getBannerAccent = (level) => {
        if (level >= 100) return '#FFD700';
        if (level >= 75) return '#f8c37d';
        if (level >= 50) return '#eaa960';
        if (level >= 25) return '#f8c37d';
        if (level >= 10) return '#eaa960';
        return '#eaa960';
    };

    const getAchievements = (level, streak = 0, aiChats = 0, messages = 0) => {
        return ALL_ACHIEVEMENTS.map(a => ({
            ...a, unlocked: (a.unlockLevel && level >= a.unlockLevel) || (a.unlockStreak && streak >= a.unlockStreak) || (a.unlockAiChats && aiChats >= a.unlockAiChats) || (a.unlockMessages && messages >= a.unlockMessages)
        }));
    };

    const TABS = ['overview', 'identity', 'statistics', 'achievements'];

    if (loading || !profile) {
        return createPortal(
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(16px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }} onClick={onClose}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }} onClick={e => e.stopPropagation()}>
                    <div className="pf-spinner" />
                    <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.38em', fontFamily: "'Space Grotesk', sans-serif" }}>{t('profile.loading')}</span>
                </div>
            </div>, getModalRoot()
        );
    }

    const level = displayProfile.level || 1;
    const xp = displayProfile.xp || 0;
    const xpProgress = getXPProgress(xp, level);
    const rankTitle = getRankTitle(level, t);
    const tierName = getTierName(level, t);
    const tierColor = getTierColor(level);
    const nextMilestone = getNextRankMilestone(level, t);
    const loginStreak = displayProfile.login_streak || 0;
    const xpForNext = getXPForNextLevel(level);
    const achievements = getAchievements(level, loginStreak, stats?.ai_chats_count || 0, stats?.community_messages || 0);
    const unlockedCount = achievements.filter(a => a.unlocked).length;
    const bannerAccent = getBannerAccent(level);
    const bio = displayProfile.bio || '';

    const membershipSubject = {
        role: displayProfile.role,
        email: displayProfile.email,
        subscription_plan: displayProfile.subscription_plan,
        subscription_status: displayProfile.subscription_status
    };
    const subjectIsSuperAdmin = isSuperAdmin(membershipSubject);
    const subjectIsAdmin = normalizeRoleKey(displayProfile.role) === 'admin';
    const tierUpper = inferTierUpperFromProfile(membershipSubject);
    const membershipHeadline = formatMembershipLabel(displayProfile.role, tierUpper, t);
    const subStatusNorm = normalizeRoleKey(displayProfile.subscription_status);
    const activeSub = ['active', 'trialing'].includes(subStatusNorm);
    const planName = planProductLabel(displayProfile.subscription_plan);
    const statusPretty = subscriptionStatusLabel(displayProfile.subscription_status);

    const SettingsModal = () => (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(20px)', zIndex: 100001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', pointerEvents: 'auto' }} onClick={() => setShowSettings(false)}>
            <div style={{ background: 'linear-gradient(145deg, rgba(14,14,22,0.99) 0%, rgba(10,10,18,0.99) 100%)', borderRadius: '20px', maxWidth: '560px', width: '100%', maxHeight: '85vh', overflow: 'auto', padding: '32px', border: '1px solid rgba(234,169,96,0.2)', boxShadow: '0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(234,169,96,0.08)', position: 'relative' }} onClick={e => e.stopPropagation()}>
                {/* Top shimmer */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(234,169,96,0.7), rgba(248,195,125,0.5), transparent)', borderRadius: '20px 20px 0 0' }} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
                    <div>
                        <div style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.4em', marginBottom: '4px', fontFamily: "'Space Grotesk', sans-serif" }}>Configuration</div>
                        <h2 style={{ color: 'white', margin: 0, fontSize: '1.3rem', fontWeight: 200, letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>Settings</h2>
                    </div>
                    <button onClick={() => setShowSettings(false)} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', width: '36px', height: '36px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', fontFamily: "'Space Grotesk', sans-serif" }}><FaTimes /></button>
                </div>

                {/* Trading Identity */}
                <div style={{ marginBottom: '28px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid rgba(234,169,96,0.12)' }}>
                        <FaChartLine style={{ color: tierColor, fontSize: '0.85rem' }} />
                        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.32em', fontFamily: "'Space Grotesk', sans-serif" }}>Trading Identity</span>
                    </div>
                    <div style={{ display: 'grid', gap: '16px' }}>
                        <div>
                            <label style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.24em', fontFamily: "'Space Grotesk', sans-serif" }}>Preferred Markets</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                                {['forex', 'gold', 'crypto', 'indices', 'stocks', 'oil'].map(market => (
                                    <button key={market} onClick={() => {
                                        const current = settings?.preferred_markets || [];
                                        const updated = current.includes(market) ? current.filter(m => m !== market) : [...current, market];
                                        handleSettingsUpdate({ preferred_markets: updated });
                                    }} style={{ padding: '7px 14px', borderRadius: '99px', cursor: 'pointer', background: settings?.preferred_markets?.includes(market) ? `${tierColor}22` : 'rgba(255,255,255,0.04)', border: `1px solid ${settings?.preferred_markets?.includes(market) ? tierColor + '60' : 'rgba(255,255,255,0.08)'}`, color: settings?.preferred_markets?.includes(market) ? tierColor : 'rgba(255,255,255,0.45)', fontSize: '0.72rem', fontWeight: 500, textTransform: 'capitalize', transition: 'all 0.22s', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>{market}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.24em', fontFamily: "'Space Grotesk', sans-serif" }}>Trading Sessions</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                                {['asian', 'london', 'newyork', 'sydney'].map(session => (
                                    <button key={session} onClick={() => {
                                        const current = settings?.trading_sessions || [];
                                        const updated = current.includes(session) ? current.filter(s => s !== session) : [...current, session];
                                        handleSettingsUpdate({ trading_sessions: updated });
                                    }} style={{ padding: '7px 14px', borderRadius: '99px', cursor: 'pointer', background: settings?.trading_sessions?.includes(session) ? 'rgba(248,195,125,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${settings?.trading_sessions?.includes(session) ? 'rgba(248,195,125,0.5)' : 'rgba(255,255,255,0.08)'}`, color: settings?.trading_sessions?.includes(session) ? '#f8c37d' : 'rgba(255,255,255,0.45)', fontSize: '0.72rem', fontWeight: 500, textTransform: 'capitalize', transition: 'all 0.22s', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>{session}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', display: 'block', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.24em', fontFamily: "'Space Grotesk', sans-serif" }}>Risk Profile</label>
                            <select value={settings?.risk_profile || 'moderate'} onChange={e => handleSettingsUpdate({ risk_profile: e.target.value })} style={{ width: '100%', padding: '11px 14px', borderRadius: '12px', cursor: 'pointer', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: '0.86rem', fontFamily: "'Space Grotesk', sans-serif", outline: 'none', transition: 'border-color 0.2s' }}>
                                <option value="conservative">🛡️ Conservative</option>
                                <option value="moderate">⚖️ Moderate</option>
                                <option value="aggressive">🔥 Aggressive</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* Privacy */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid rgba(234,169,96,0.12)' }}>
                        <FaShieldAlt style={{ color: '#f8c37d', fontSize: '0.85rem' }} />
                        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.32em', fontFamily: "'Space Grotesk', sans-serif" }}>Privacy</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[{ key: 'show_online_status', label: 'Show Online Status' }, { key: 'show_trading_stats', label: 'Show Trading Stats' }, { key: 'show_achievements', label: 'Show Achievements' }].map(({ key, label }) => (
                            <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', cursor: 'pointer', padding: '12px 14px', background: 'rgba(255,255,255,0.025)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', fontFamily: "'Space Grotesk', sans-serif" }}>{label}</span>
                                <div onClick={() => handleSettingsUpdate({ [key]: !(settings?.[key] !== false) })} style={{ width: '42px', height: '22px', borderRadius: '99px', background: settings?.[key] !== false ? `${tierColor}` : 'rgba(255,255,255,0.08)', border: `1px solid ${settings?.[key] !== false ? tierColor : 'rgba(255,255,255,0.12)'}`, position: 'relative', cursor: 'pointer', transition: 'all 0.3s', flexShrink: 0 }}>
                                    <div style={{ position: 'absolute', top: '2px', left: settings?.[key] !== false ? '22px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.3s', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }} />
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
                {settingsLoading && <div style={{ textAlign: 'center', padding: '12px', color: 'rgba(234,169,96,0.7)', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif" }}>Saving…</div>}
            </div>
        </div>
    );

    const modalContent = (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.88)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px', pointerEvents: 'auto', overflowY: 'auto'
        }} onClick={onClose}>

            <div style={{
                background: 'linear-gradient(145deg, rgba(12,12,20,0.99) 0%, rgba(8,8,16,0.99) 100%)',
                borderRadius: '22px',
                border: `1px solid rgba(234,169,96,0.18)`,
                boxShadow: `0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(234,169,96,0.06), 0 0 60px ${tierColor}12`,
                maxWidth: '860px', width: '100%',
                maxHeight: 'calc(100vh - 32px)',
                overflowY: 'auto', overflowX: 'hidden',
                position: 'relative', margin: 'auto',
                opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.98)',
                transition: 'opacity 0.35s cubic-bezier(0.22,1,0.36,1), transform 0.35s cubic-bezier(0.22,1,0.36,1)'
            }} onClick={e => e.stopPropagation()}>

                {/* Top shimmer line */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: `linear-gradient(90deg, transparent, ${tierColor}80, rgba(248,195,125,0.5), transparent)`, borderRadius: '22px 22px 0 0', zIndex: 10 }} />

                {/* Action Buttons — all icon-only, uniform 38×38 squares */}
                <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', gap: '8px', zIndex: 20 }}>
                    {isOwnProfile && (
                        <button onClick={() => setShowSettings(true)} title="Settings" style={{
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                            color: 'rgba(255,255,255,0.55)', width: '38px', height: '38px', borderRadius: '10px',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.22s', backdropFilter: 'blur(8px)', fontSize: '0.85rem', flexShrink: 0
                        }}><FaCog /></button>
                    )}
                    {!isOwnProfile && (
                        <button
                            onClick={() => friendBtn.action && handleFriendAction(friendBtn.action)}
                            disabled={friendLoading}
                            title={`${friendBtn.text} — ${friendBtn.subtext}`}
                            style={{
                                background: `${friendBtn.color}14`,
                                border: `1px solid ${friendBtn.color}50`,
                                color: friendBtn.color,
                                width: '38px', height: '38px', borderRadius: '10px',
                                cursor: friendBtn.action ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '0.95rem',
                                opacity: friendLoading ? 0.6 : 1,
                                transition: 'all 0.22s',
                                backdropFilter: 'blur(8px)',
                                flexShrink: 0,
                                boxShadow: `0 0 12px ${friendBtn.color}20`
                            }}>
                            {friendLoading
                                ? <div className="pf-spinner pf-spinner-sm" />
                                : friendBtn.icon}
                        </button>
                    )}
                    <button onClick={onClose} title="Close" style={{
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.55)', width: '38px', height: '38px', borderRadius: '10px',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.22s', backdropFilter: 'blur(8px)', fontSize: '0.85rem', flexShrink: 0
                    }}><FaTimes /></button>
                </div>

                {/* ─── BANNER ─────────────────────────────────────────── */}
                <div style={{
                    position: 'relative', width: '100%',
                    height: 'clamp(120px, 20vw, 170px)',
                    background: getBannerGradient(level), borderRadius: '22px 22px 0 0', overflow: 'hidden', flexShrink: 0
                }}>
                    {displayProfile.banner && (displayProfile.banner.startsWith('http') || (displayProfile.banner.startsWith('data:image') && isValidDataUrl(displayProfile.banner))) && (
                        <img 
                            src={displayProfile.banner} 
                            alt="Banner" 
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                opacity: 0.4
                            }}
                            onError={(e) => e.target.style.display = 'none'}
                        />
                    )}
                    {/* Diagonal grid */}
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 26px, ${bannerAccent}08 26px, ${bannerAccent}08 27px)`, pointerEvents: 'none' }} />
                    {/* Radial glow center */}
                    <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse 60% 80% at 30% 50%, ${bannerAccent}18 0%, transparent 70%)`, pointerEvents: 'none' }} />
                    {/* Shimmer */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)', animation: 'xpShimmer 4s ease-in-out infinite' }} />

                    {/* Level badge */}
                    <div style={{ position: 'absolute', top: '16px', left: '16px', display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 16px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)', borderRadius: '10px', border: `1px solid ${bannerAccent}30`, zIndex: 2 }}>
                        <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>{level >= 75 ? '👑' : level >= 50 ? '💎' : level >= 25 ? '🔥' : '⭐'}</span>
                        <div>
                            <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.3em', fontFamily: "'Space Grotesk', sans-serif" }}>Power Level</div>
                            <div style={{ fontSize: '1rem', fontWeight: 300, color: 'white', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>{level}</div>
                        </div>
                    </div>

                    {/* Online status badge */}
                    {!isOwnProfile && (
                        <div style={{ position: 'absolute', top: '16px', right: '100px', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)', borderRadius: '99px', border: `1px solid ${isOnline ? '#23A55A40' : 'rgba(255,255,255,0.08)'}` }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#23A55A' : '#4a4a5a', boxShadow: isOnline ? '0 0 8px #23A55A' : 'none' }} />
                            <span style={{ fontSize: '0.6rem', color: isOnline ? '#23A55A' : 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.2em', fontFamily: "'Space Grotesk', sans-serif" }}>{isOnline ? 'Online' : lastSeen ? formatLastSeen(lastSeen) : 'Offline'}</span>
                        </div>
                    )}
                </div>

                {/* ─── AVATAR OVERLAP STRIP ────────────────────────────── */}
                <div style={{
                    padding: '0 clamp(16px, 4vw, 32px)',
                    display: 'flex', alignItems: 'flex-end', gap: '0',
                    marginTop: '-52px', position: 'relative', zIndex: 5
                }}>
                    <AvatarWithFallback
                        size={typeof window !== 'undefined' && window.innerWidth < 480 ? 84 : 112}
                        tierColor={tierColor} isOnline={isOnline} avatar={displayProfile?.avatar} userId={displayProfile?.id ?? displayProfile?.username}
                    />
                </div>

                {/* ─── USERNAME + RANK ────────────────────────────────── */}
                <div style={{ padding: '14px clamp(16px, 4vw, 32px) 0', display: 'flex', alignItems: 'center', gap: '22px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px', flexWrap: 'wrap' }}>
                            <h1 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.9rem)', fontWeight: 200, color: 'white', margin: 0, textTransform: 'uppercase', letterSpacing: '0.22em', fontFamily: "'Space Grotesk', sans-serif", textShadow: `0 0 40px ${tierColor}30` }}>
                                {displayProfile.username || displayProfile.name || 'User'}
                            </h1>
                            {(subjectIsSuperAdmin || subjectIsAdmin) && (
                                <FaCrown style={{ color: '#FFD700', fontSize: '1.1rem', filter: 'drop-shadow(0 0 8px #FFD70060)' }} />
                            )}
                            {activeSub && <FaCheckCircle style={{ color: '#eaa960', fontSize: '1rem' }} title={statusPretty || 'Subscribed'} />}
                        </div>
                        {/* Rank pill */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 14px', background: `${tierColor}12`, border: `1px solid ${tierColor}30`, borderRadius: '99px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: tierColor, animation: 'dotPulse 2s ease-in-out infinite alternate' }} />
                            <span style={{ fontSize: '0.65rem', fontWeight: 500, color: tierColor, textTransform: 'uppercase', letterSpacing: '0.24em', fontFamily: "'Space Grotesk', sans-serif" }}>{rankTitle}</span>
                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', fontFamily: "'Space Grotesk', sans-serif" }}>· {tierName}</span>
                        </div>
                    </div>
                </div>

                {/* ─── BIO SECTION ───────────────────────────────────── */}
                {bio && (
                    <div style={{ 
                        padding: '12px clamp(16px, 4vw, 32px) 8px',
                        marginTop: '4px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                            padding: '12px 16px',
                            background: 'linear-gradient(135deg, rgba(234,169,96,0.05) 0%, rgba(248,195,125,0.02) 100%)',
                            border: '1px solid rgba(234,169,96,0.15)',
                            borderRadius: '14px',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            {/* Decorative quote mark */}
                            <div style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '8px',
                                fontSize: 'clamp(2.5rem, 8vw, 3.25rem)',
                                lineHeight: 1,
                                color: `${tierColor}12`,
                                fontFamily: 'Georgia, serif',
                                pointerEvents: 'none',
                                userSelect: 'none'
                            }}>
                                &ldquo;
                            </div>
                            
                            {/* Quote icon — fixed circle (avoid stretched oval from flex) */}
                            <div style={{
                                flexShrink: 0,
                                width: 32,
                                height: 32,
                                minWidth: 32,
                                minHeight: 32,
                                aspectRatio: '1',
                                borderRadius: '50%',
                                background: `${tierColor}15`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: tierColor,
                                fontSize: '0.75rem',
                                border: `1px solid ${tierColor}30`,
                                boxSizing: 'border-box'
                            }}>
                                <FaQuoteRight style={{ display: 'block' }} />
                            </div>
                            
                            {/* Bio text */}
                            <div style={{
                                flex: 1,
                                fontSize: '0.9rem',
                                lineHeight: '1.6',
                                color: 'rgba(255,255,255,0.75)',
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontStyle: 'italic',
                                letterSpacing: '0.02em',
                                wordBreak: 'break-word'
                            }}>
                                {bio}
                            </div>
                            
                            {/* Decorative gradient line */}
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: '10%',
                                right: '10%',
                                height: '1px',
                                background: `linear-gradient(90deg, transparent, ${tierColor}40, transparent)`
                            }} />
                        </div>
                    </div>
                )}

                {/* ─── XP BAR ─────────────────────────────────────────── */}
                <div style={{ padding: bio ? '8px clamp(16px, 4vw, 32px) 20px' : '4px clamp(16px, 4vw, 32px) 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.28em', fontFamily: "'Space Grotesk', sans-serif" }}>Lv {level} → Lv {level + 1}</span>
                        <span style={{ fontSize: '0.65rem', color: tierColor, fontWeight: 500, letterSpacing: '0.06em', fontFamily: "'Space Grotesk', sans-serif" }}>{(xpProgress.current || 0).toLocaleString()} / {(xpProgress.needed || 0).toLocaleString()} XP</span>
                    </div>
                    <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '99px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${xpAnimated}%`, background: `linear-gradient(90deg, ${tierColor} 0%, ${tierColor}cc 100%)`, borderRadius: '99px', boxShadow: `0 0 12px ${tierColor}60`, transition: 'width 1.5s cubic-bezier(0.4,0,0.2,1)', position: 'relative' }}>
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)', animation: 'xpShimmer 2.5s ease-in-out infinite' }} />
                        </div>
                    </div>
                    <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)', marginTop: '5px', textAlign: 'right', letterSpacing: '0.18em', fontFamily: "'Space Grotesk', sans-serif" }}>
                        {((xpProgress.needed || 0) - (xpProgress.current || 0)).toLocaleString()} XP remaining
                    </div>
                </div>

                {/* Thin divider */}
                <div style={{ height: '1px', margin: '0 clamp(16px, 4vw, 32px)', background: 'linear-gradient(90deg, transparent, rgba(234,169,96,0.2), transparent)' }} />

                {/* ─── TABS ───────────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: '2px', padding: '0 clamp(16px, 4vw, 32px)', borderBottom: '1px solid rgba(255,255,255,0.05)', overflowX: 'auto', scrollbarWidth: 'none', marginTop: '4px' }}>
                    {TABS.map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)} style={{
                            background: 'transparent', border: 'none', padding: 'clamp(10px, 2vw, 12px) clamp(10px, 2.5vw, 16px)', whiteSpace: 'nowrap',
                            color: activeTab === tab ? tierColor : 'rgba(255,255,255,0.35)',
                            fontSize: 'clamp(0.58rem, 1.5vw, 0.65rem)', fontWeight: 500, cursor: 'pointer',
                            textTransform: 'uppercase', letterSpacing: '0.2em', position: 'relative',
                            transition: 'color 0.22s', fontFamily: "'Space Grotesk', sans-serif",
                            borderBottom: activeTab === tab ? `2px solid ${tierColor}` : '2px solid transparent',
                            marginBottom: '-1px', flexShrink: 0
                        }}>
                            {tab === 'identity' ? 'Trading' : tab}
                        </button>
                    ))}
                </div>

                {/* ─── TAB CONTENT ────────────────────────────────────── */}
                <div style={{ padding: 'clamp(12px, 2.5vw, 20px) clamp(16px, 4vw, 32px) clamp(16px, 3vw, 24px)', minHeight: '0' }}>

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Role & subscription */}
                            <div style={{
                                padding: '14px 16px',
                                background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                                borderRadius: '14px',
                                border: `1px solid ${tierColor}22`,
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: `linear-gradient(90deg, transparent, ${tierColor}55, transparent)` }} />
                                <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.32em', marginBottom: '10px', fontFamily: "'Space Grotesk', sans-serif" }}>Account</div>
                                {subjectIsSuperAdmin ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                padding: '6px 12px',
                                                borderRadius: '99px',
                                                background: 'linear-gradient(135deg, rgba(255,215,0,0.12) 0%, rgba(234,169,96,0.08) 100%)',
                                                border: '1px solid rgba(255,215,0,0.35)',
                                                color: '#FFD700',
                                                fontSize: '0.68rem',
                                                fontWeight: 600,
                                                letterSpacing: '0.14em',
                                                textTransform: 'uppercase',
                                                fontFamily: "'Space Grotesk', sans-serif"
                                            }}>Super Admin</span>
                                            {subjectIsAdmin && (
                                                <span style={{
                                                    padding: '5px 10px',
                                                    borderRadius: '99px',
                                                    background: `${tierColor}14`,
                                                    border: `1px solid ${tierColor}40`,
                                                    color: tierColor,
                                                    fontSize: '0.62rem',
                                                    fontWeight: 500,
                                                    letterSpacing: '0.12em',
                                                    textTransform: 'uppercase',
                                                    fontFamily: "'Space Grotesk', sans-serif"
                                                }}>Admin</span>
                                            )}
                                            {activeSub && planName && (
                                                <span style={{
                                                    padding: '5px 10px',
                                                    borderRadius: '99px',
                                                    background: 'rgba(255,255,255,0.04)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    color: 'rgba(255,255,255,0.85)',
                                                    fontSize: '0.62rem',
                                                    letterSpacing: '0.1em',
                                                    fontFamily: "'Space Grotesk', sans-serif"
                                                }}>{planName}</span>
                                            )}
                                            {statusPretty && (
                                                <span style={{
                                                    padding: '5px 10px',
                                                    borderRadius: '99px',
                                                    background: activeSub ? 'rgba(35,165,90,0.12)' : 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${activeSub ? 'rgba(35,165,90,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                                    color: activeSub ? '#7dffb3' : 'rgba(255,255,255,0.45)',
                                                    fontSize: '0.58rem',
                                                    letterSpacing: '0.12em',
                                                    textTransform: 'uppercase',
                                                    fontFamily: "'Space Grotesk', sans-serif"
                                                }}>{statusPretty}</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.04em', lineHeight: 1.45 }}>
                                            Subscription view: <span style={{ color: tierColor }}>{formatMembershipLabel('USER', tierUpper, t)}</span>
                                            {tierName ? <span style={{ color: 'rgba(255,255,255,0.35)' }}> · XP rank {tierName}</span> : null}
                                        </div>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 300, color: 'white', letterSpacing: '0.06em', fontFamily: "'Space Grotesk', sans-serif", marginBottom: '6px' }}>{membershipHeadline}</div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
                                            {activeSub && planName && (
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '99px',
                                                    background: `${tierColor}12`,
                                                    border: `1px solid ${tierColor}35`,
                                                    color: tierColor,
                                                    fontSize: '0.6rem',
                                                    letterSpacing: '0.1em',
                                                    fontFamily: "'Space Grotesk', sans-serif"
                                                }}>{planName}</span>
                                            )}
                                            {statusPretty && (
                                                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.08em' }}>{statusPretty}</span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Journal stats rings */}
                            {displayProfile.journalStats && (
                                <div style={{ display: 'flex', justifyContent: 'space-around', gap: '12px', flexWrap: 'wrap', padding: '12px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                    {[{ pct: displayProfile.journalStats.todayPct, label: 'Today' }, { pct: displayProfile.journalStats.weekPct, label: 'This Week' }, { pct: displayProfile.journalStats.monthPct, label: 'This Month' }].map((item, i) => (
                                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '72px' }}>
                                            <div style={{ width: 48, height: 48, borderRadius: '50%', background: `conic-gradient(${tierColor} 0deg, #f8c37d ${(item.pct ?? 0) * 3.6}deg, rgba(255,255,255,0.06) ${(item.pct ?? 0) * 3.6}deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                                                <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: '#0a0a12' }} />
                                                <span style={{ position: 'relative', zIndex: 1, fontSize: '0.7rem', fontWeight: 500, color: '#fff', fontFamily: "'Space Grotesk', sans-serif" }}>{item.pct != null ? `${item.pct}%` : '—'}</span>
                                            </div>
                                            <span style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.18em', fontFamily: "'Space Grotesk', sans-serif" }}>{item.label}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Stat tiles — compact horizontal rows, no stretched grid cells */}
                            <div
                                className="pm-overview-stat-grid"
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                    gap: '10px',
                                    alignItems: 'start',
                                }}
                            >
                                {[
                                    { icon: '✨', label: 'Total XP', value: xp.toLocaleString(), color: '#FFD700' },
                                    { icon: '🔥', label: 'Streak', value: `${loginStreak}d`, color: '#f59e0b' },
                                    { icon: '🎖️', label: 'Achievements', value: `${unlockedCount}/${ALL_ACHIEVEMENTS.length}`, color: '#eaa960' }
                                ].map((stat, i) => (
                                    <div
                                        key={i}
                                        className="pm-overview-stat-tile"
                                        style={{
                                            padding: '10px 12px',
                                            background: 'rgba(255,255,255,0.02)',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            borderRadius: '12px',
                                            display: 'flex',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: '10px',
                                            textAlign: 'left',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            transition: 'border-color 0.22s',
                                            minHeight: 0,
                                            height: 'auto',
                                        }}
                                    >
                                        <div style={{ position: 'absolute', top: 0, left: '12%', right: '12%', height: '2px', background: `linear-gradient(90deg, transparent, ${stat.color}50, transparent)`, borderRadius: '2px' }} />
                                        <span style={{ fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }} aria-hidden>{stat.icon}</span>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.16em', fontFamily: "'Space Grotesk', sans-serif", marginBottom: '3px' }}>{stat.label}</div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 500, color: stat.color, letterSpacing: '0.02em', fontFamily: "'Space Grotesk', sans-serif", filter: `drop-shadow(0 0 6px ${stat.color}30)`, lineHeight: 1.25, wordBreak: 'break-word' }}>{stat.value}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Visible trading stats chosen by the user */}
                            {displayProfile.visibleStats && Object.keys(displayProfile.visibleStats).length > 0 && (() => {
                                const STAT_META = {
                                    discipline_score: { icon: '🎯', label: 'Discipline', color: '#f8c37d', fmt: v => `${v}%` },
                                    journal_score:    { icon: '📓', label: 'Journal',    color: '#f8c37d', fmt: v => `${v}%` },
                                    consistency_score:{ icon: '📈', label: 'Consistency',color: '#f8c37d', fmt: v => `${v}%` },
                                    win_rate:         { icon: '✅', label: 'Win Rate',   color: '#f59e0b', fmt: v => `${v}%` },
                                    total_trades:     { icon: '📊', label: 'Trades',     color: '#eaa960', fmt: v => String(v) },
                                    login_streak:     { icon: '🔥', label: 'Streak',     color: '#f97316', fmt: v => `${v}d` },
                                };
                                const entries = Object.entries(displayProfile.visibleStats).filter(([k]) => STAT_META[k]);
                                if (entries.length === 0) return null;
                                return (
                                    <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.015)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                            <span style={{ fontSize: '0.85rem', color: tierColor }}>📊</span>
                                            <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.32em', fontFamily: "'Space Grotesk', sans-serif" }}>Trader Stats</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', alignItems: 'start' }}>
                                            {entries.map(([key, value]) => {
                                                const meta = STAT_META[key];
                                                return (
                                                    <div key={key} style={{ padding: '10px 12px', background: `${meta.color}08`, border: `1px solid ${meta.color}22`, borderRadius: '12px', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', textAlign: 'left', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg, transparent, ${meta.color}70, transparent)` }} />
                                                        <span style={{ fontSize: '1.15rem', flexShrink: 0 }} aria-hidden>{meta.icon}</span>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div style={{ fontSize: '1.05rem', fontWeight: 500, color: meta.color, letterSpacing: '0.03em', fontFamily: "'Space Grotesk', sans-serif", filter: `drop-shadow(0 0 6px ${meta.color}35)`, lineHeight: 1.2 }}>{meta.fmt(value)}</div>
                                                            <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', letterSpacing: '0.18em', marginTop: '4px', fontFamily: "'Space Grotesk', sans-serif" }}>{meta.label}</div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Next Milestone */}
                            {nextMilestone && (
                                <div style={{ padding: '14px 18px', background: `${tierColor}08`, border: `1px solid ${tierColor}20`, borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '14px', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: `linear-gradient(90deg, transparent, ${tierColor}60, transparent)` }} />
                                    <div style={{ fontSize: '1.5rem' }}>🏆</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.28em', marginBottom: '3px', fontFamily: "'Space Grotesk', sans-serif" }}>Next Milestone</div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: 300, color: tierColor, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.25 }}>{nextMilestone.title}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '1.25rem', fontWeight: 200, color: 'rgba(255,255,255,0.6)', fontFamily: "'Space Grotesk', sans-serif" }}>{nextMilestone.level - level}</div>
                                        <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.2em', fontFamily: "'Space Grotesk', sans-serif" }}>levels</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TRADING IDENTITY TAB */}
                    {activeTab === 'identity' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                            {[
                                { icon: <FaChartLine />, color: tierColor, label: 'Preferred Markets', content: (settings?.preferred_markets || ['forex', 'gold']).map((m, i) => <span key={i} style={{ padding: '5px 12px', background: `${tierColor}18`, border: `1px solid ${tierColor}40`, borderRadius: '99px', color: tierColor, fontSize: '0.7rem', fontWeight: 500, textTransform: 'capitalize', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>{m}</span>) },
                                { icon: <FaClock />, color: '#f8c37d', label: 'Trading Sessions', content: (settings?.trading_sessions || ['london', 'newyork']).map((s, i) => <span key={i} style={{ padding: '5px 12px', background: 'rgba(248,195,125,0.1)', border: '1px solid rgba(248,195,125,0.3)', borderRadius: '99px', color: '#f8c37d', fontSize: '0.7rem', fontWeight: 500, textTransform: 'capitalize', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>{s}</span>) },
                                { icon: <FaShieldAlt />, color: '#f8c37d', label: 'Risk Profile', content: [<span key="r" style={{ fontSize: '1.1rem', color: '#f8c37d', fontWeight: 300, textTransform: 'capitalize', letterSpacing: '0.08em', fontFamily: "'Space Grotesk', sans-serif" }}>{settings?.risk_profile === 'conservative' ? '🛡️ ' : settings?.risk_profile === 'aggressive' ? '🔥 ' : '⚖️ '}{settings?.risk_profile || 'Moderate'}</span>] },
                                { icon: <FaRobot />, color: '#f8c37d', label: 'AI Usage', content: [<span key="ai" style={{ fontSize: '1.1rem', color: '#f8c37d', fontWeight: 300, letterSpacing: '0.04em', fontFamily: "'Space Grotesk', sans-serif" }}>{stats?.ai_chats_count || 0} conversations</span>] }
                            ].map((card, i) => (
                                <div key={i} style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '2px', background: `linear-gradient(180deg, transparent, ${card.color}60, transparent)` }} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                        <span style={{ color: card.color, fontSize: '0.85rem' }}>{card.icon}</span>
                                        <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.28em', fontFamily: "'Space Grotesk', sans-serif" }}>{card.label}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>{card.content}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* STATISTICS TAB */}
                    {activeTab === 'statistics' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                            {[
                                { icon: <FaRobot />, label: 'AI Chats', value: stats?.ai_chats_count || 0, color: '#f8c37d' },
                                { icon: <FaComments />, label: 'Messages', value: stats?.community_messages || 0, color: '#f8c37d' },
                                { icon: <FaGraduationCap />, label: 'Courses', value: stats?.courses_completed || 0, color: '#f8c37d' },
                                { icon: <FaFire />, label: 'Best Streak', value: `${stats?.longest_streak || loginStreak}d`, color: '#f59e0b' },
                                { icon: <FaCalendarCheck />, label: 'Login Days', value: stats?.total_login_days || 0, color: '#eaa960' },
                                { icon: <FaBolt />, label: 'Monthly XP', value: (stats?.current_month_xp || xp).toLocaleString(), color: '#FFD700' }
                            ].map((stat, i) => (
                                <div key={i} style={{ padding: '20px 14px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', textAlign: 'center', position: 'relative', overflow: 'hidden', transition: 'all 0.22s' }}>
                                    <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '2px', background: `linear-gradient(180deg, transparent, ${stat.color}60, transparent)` }} />
                                    <div style={{ fontSize: '1.4rem', marginBottom: '10px', color: stat.color }}>{stat.icon}</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 300, color: stat.color, marginBottom: '5px', fontFamily: "'Space Grotesk', sans-serif", filter: `drop-shadow(0 0 8px ${stat.color}30)` }}>{stat.value}</div>
                                    <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.22em', fontFamily: "'Space Grotesk', sans-serif" }}>{stat.label}</div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ACHIEVEMENTS TAB */}
                    {activeTab === 'achievements' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.32em', fontFamily: "'Space Grotesk', sans-serif" }}>{unlockedCount} / {ALL_ACHIEVEMENTS.length} unlocked</span>
                                <div style={{ height: '3px', width: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '99px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${(unlockedCount / ALL_ACHIEVEMENTS.length) * 100}%`, background: `linear-gradient(90deg, ${tierColor}, ${tierColor}80)`, borderRadius: '99px', transition: 'width 1s ease' }} />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '9px' }}>
                                {achievements.map((achievement, i) => (
                                    <div key={i} title={achievement.description} style={{ padding: '16px 10px', textAlign: 'center', borderRadius: '14px', position: 'relative', overflow: 'hidden', background: achievement.unlocked ? `${tierColor}0a` : 'rgba(255,255,255,0.015)', border: `1px solid ${achievement.unlocked ? tierColor + '30' : 'rgba(255,255,255,0.05)'}`, opacity: achievement.unlocked ? 1 : 0.5, transition: 'all 0.3s', cursor: 'pointer' }}>
                                        {achievement.unlocked && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '1px', background: `linear-gradient(90deg, transparent, ${tierColor}70, transparent)` }} />}
                                        <div style={{ fontSize: '2rem', marginBottom: '8px', filter: achievement.unlocked ? 'none' : 'grayscale(100%)' }}>
                                            {achievement.unlocked ? achievement.icon : '🔒'}
                                        </div>
                                        <div style={{ fontSize: '0.6rem', fontWeight: 500, color: achievement.unlocked ? tierColor : 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.1em', lineHeight: 1.3, marginBottom: '4px', fontFamily: "'Space Grotesk', sans-serif" }}>{achievement.name}</div>
                                        <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.25)', fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '0.04em' }}>{achievement.description}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Global styles */}
                <style>{`
                    @keyframes dotPulse { 0% { opacity:.6; transform:scale(1); } 100% { opacity:1; transform:scale(1.3); box-shadow: 0 0 6px currentColor; } }
                    @keyframes xpShimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
                    #profile-modal-root button:hover { opacity: 0.9; }
                    #profile-modal-root ::-webkit-scrollbar { width: 4px; }
                    #profile-modal-root ::-webkit-scrollbar-track { background: rgba(255,255,255,0.02); }
                    #profile-modal-root ::-webkit-scrollbar-thumb { background: rgba(234,169,96,0.3); border-radius: 99px; }

                    .pm-overview-stat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
                    @media (max-width: 520px) {
                        .pm-overview-stat-grid { grid-template-columns: 1fr !important; }
                    }

                    /* ── Mobile: ≤ 480px ─────────────────────────────── */
                    @media (max-width: 480px) {
                        .pm-actions { top: max(12px, env(safe-area-inset-top, 12px)) !important; right: max(12px, env(safe-area-inset-right, 12px)) !important; }
                    }

                    /* ── Small mobile: ≤ 360px ───────────────────────── */
                    @media (max-width: 360px) {
                        #profile-modal-root h1 { font-size: 1rem !important; letter-spacing: 0.12em !important; }
                    }
                `}</style>
            </div>

            {showSettings && <SettingsModal />}
        </div>
    );

    return createPortal(modalContent, getModalRoot());
};

export default ProfileModal;