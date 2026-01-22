import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/PublicProfile.css';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
import { isAdmin, isSuperAdmin } from '../utils/roles';
import {
    getRankTitle,
    getTierName,
    getTierColor,
    getXPProgress,
    getNextRankMilestone
} from '../utils/xpSystem';

import { FaArrowLeft, FaEnvelope } from 'react-icons/fa';

const PublicProfile = () => {
    const { userId } = useParams();
    const { user: currentUser } = useAuth();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const navigate = useNavigate();
    
    const isAdminUser = isAdmin(currentUser) || isSuperAdmin(currentUser);

    const resolveApiBaseUrl = () => {
        if (typeof window !== 'undefined' && window.location?.origin) {
            return window.location.origin;
        }
        return process.env.REACT_APP_API_URL || 'https://aurafx.com';
    };

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                setLoading(true);
                const baseUrl = resolveApiBaseUrl();
                const response = await fetch(`${baseUrl}/api/users/public-profile/${userId}`);
                
                if (response.ok) {
                    const data = await response.json();
                    setProfile(data);
                } else {
                    setError("Profile not found. Please check the user ID.");
                }
                setLoading(false);
            } catch (err) {
                console.error("Error fetching profile:", err);
                setError("Failed to load profile. Please try again later.");
                setLoading(false);
            }
        };

        fetchProfile();
        
        // Refresh profile data every 3 seconds for real-time XP updates
        const refreshInterval = setInterval(fetchProfile, 3000);
        
        return () => clearInterval(refreshInterval);
    }, [userId]);

    const getAvatarPath = (avatarName) => {
        if (avatarName && avatarName.startsWith('data:image')) {
            return avatarName;
        }
        if (avatarName && avatarName.startsWith('/')) {
            return avatarName;
        }
        return avatarName ? `/avatars/${avatarName}` : '/avatars/avatar_ai.png';
    };

    const goBack = () => {
        navigate(-1);
    };

    if (loading) {
        return (
            <div className="public-profile-container">
                <CosmicBackground />
                <div className="profile-modal loading">
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Loading profile...</div>
                </div>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="public-profile-container">
                <CosmicBackground />
                <div className="profile-modal error">
                    <div className="error-message">{error || "Profile not found"}</div>
                    <button className="back-button" onClick={goBack}>
                        <FaArrowLeft /> Go Back
                    </button>
                </div>
            </div>
        );
    }

    // Calculate XP progress using the XP system
    const xpProgress = getXPProgress(profile.xp || 0, profile.level || 1);
    const rankTitle = getRankTitle(profile.level || 1);
    const tierName = getTierName(profile.level || 1);
    const tierColor = getTierColor(profile.level || 1);
    const nextMilestone = getNextRankMilestone(profile.level || 1);
    const joinDate = new Date(profile.joinDate || profile.createdAt || Date.now()).toLocaleDateString();
    const loginStreak = profile.login_streak || 0;

    // Get achievements based on level
    const getAchievements = (level) => {
        const list = [];
        if (level >= 5) list.push({ name: "Getting Started", icon: "🔰" });
        if (level >= 10) list.push({ name: "Active Communicator", icon: "🎯" });
        if (level >= 25) list.push({ name: "Level 25 Club", icon: "🔥" });
        if (level >= 50) list.push({ name: "Top Contributor", icon: "🏆" });
        if (level >= 75) list.push({ name: "Veteran Status", icon: "👑" });
        if (level >= 100) list.push({ name: "Infinity Legend", icon: "⭐" });
        if (level >= 200) list.push({ name: "Advanced Trader", icon: "💎" });
        if (level >= 500) list.push({ name: "Trading Master", icon: "🌟" });
        return list;
    };

    const achievements = getAchievements(profile.level || 1);

    return (
        <div className="public-profile-container">
            <CosmicBackground />
            <div className="profile-modal">
                {/* Back Button */}
                <button className="back-button" onClick={goBack}>
                    <FaArrowLeft /> Back
                </button>

                {/* Profile Banner */}
                <div className="profile-banner-section">
                    {profile.banner ? (
                        <img 
                            src={profile.banner.startsWith('data:image') ? profile.banner : profile.banner} 
                            alt="Banner" 
                            className="profile-banner"
                        />
                    ) : (
                        <div className="profile-banner-placeholder">
                            <div className="banner-text">Welcome to AURA FX</div>
                        </div>
                    )}
                    
                    {/* Avatar overlapping banner */}
                    <div className="profile-avatar-overlay">
                        <img 
                            src={getAvatarPath(profile.avatar)} 
                            alt="Avatar" 
                            className="profile-avatar-large"
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/avatars/avatar_ai.png';
                            }}
                        />
                    </div>
                </div>

                {/* Profile Header Info */}
                <div className="profile-header-info">
                    <h1 className="profile-username">{profile.username || profile.name || 'User'}</h1>
                    <div className="profile-rank" style={{ color: tierColor }}>
                        {rankTitle}
                    </div>
                    <div className="profile-tier">{tierName}</div>
                </div>

                {/* Progress Bar */}
                {nextMilestone && (
                    <div className="profile-progress-section">
                        <div className="progress-text">
                            <span>{nextMilestone.title} in {nextMilestone.level - (profile.level || 1)} levels</span>
                        </div>
                        <div className="progress-bar-container">
                            <div 
                                className="progress-bar-fill"
                                style={{ 
                                    width: `${xpProgress.percentage}%`,
                                    background: `linear-gradient(90deg, ${tierColor} 0%, ${tierColor}dd 100%)`
                                }}
                            ></div>
                        </div>
                    </div>
                )}

                {/* Bio */}
                {profile.bio && (
                    <div className="profile-bio">
                        {profile.bio}
                    </div>
                )}

                {/* Tabs */}
                <div className="profile-tabs">
                    <button 
                        className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        Information
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'journey' ? 'active' : ''}`}
                        onClick={() => setActiveTab('journey')}
                    >
                        Hero's Journey
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
                            <div className="info-section">
                                <div className="info-row">
                                    <span className="info-label">Power Level:</span>
                                    <span className="info-value large">{profile.level || 1}</span>
                                    <span className="info-badge" style={{ color: tierColor }}>+{Math.round((profile.level || 1) * 10)}%</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Power Points:</span>
                                    <span className="info-value">{(profile.xp || 0).toLocaleString()}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Login Streak:</span>
                                    <span className="info-value">{loginStreak}+ days</span>
                                </div>
                            </div>

                            {/* Roles Section */}
                            <div className="roles-section">
                                <label className="section-label">Roles</label>
                                <select className="roles-dropdown" disabled>
                                    <option>{profile.role || 'Member'}</option>
                                </select>
                            </div>

                            {/* Tags/Badges */}
                            <div className="tags-section">
                                {achievements.length > 0 && achievements.map((achievement, index) => (
                                    <div key={index} className="tag-badge">
                                        <span className="tag-dot" style={{ backgroundColor: tierColor }}></span>
                                        {achievement.name}
                                    </div>
                                ))}
                                {profile.role && profile.role !== 'free' && (
                                    <div className="tag-badge">
                                        <span className="tag-dot" style={{ backgroundColor: '#10b981' }}></span>
                                        {profile.role.charAt(0).toUpperCase() + profile.role.slice(1)} Member
                                    </div>
                                )}
                            </div>

                            {isAdminUser && userId && parseInt(userId) !== currentUser?.id && (
                                <button 
                                    className="message-user-btn"
                                    onClick={async () => {
                                        try {
                                            const response = await Api.ensureUserThread(userId);
                                            const threadId = response.data?.thread?.id;
                                            if (threadId) {
                                                navigate(`/messages?thread=${threadId}`);
                                            }
                                        } catch (error) {
                                            console.error('Error creating DM thread:', error);
                                            alert('Failed to create message thread. Please try again.');
                                        }
                                    }}
                                >
                                    <FaEnvelope /> Message User
                                </button>
                            )}
                        </div>
                    )}

                    {activeTab === 'journey' && (
                        <div className="tab-panel">
                            <div className="journey-content">
                                <div className="journey-stat">
                                    <div className="journey-icon">📈</div>
                                    <div className="journey-info">
                                        <div className="journey-label">Current Level</div>
                                        <div className="journey-value">{profile.level || 1}</div>
                                    </div>
                                </div>
                                <div className="journey-stat">
                                    <div className="journey-icon">🎯</div>
                                    <div className="journey-info">
                                        <div className="journey-label">Total XP</div>
                                        <div className="journey-value">{(profile.xp || 0).toLocaleString()}</div>
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
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className="stat-icon">📊</div>
                                    <div className="stat-value">{profile.stats?.totalTrades || 0}</div>
                                    <div className="stat-label">Total Trades</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">✅</div>
                                    <div className="stat-value">{profile.stats?.winRate || 0}%</div>
                                    <div className="stat-label">Win Rate</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">💰</div>
                                    <div className="stat-value">${(profile.stats?.totalProfit || 0).toLocaleString()}</div>
                                    <div className="stat-label">Total Profit</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">📅</div>
                                    <div className="stat-value">{joinDate}</div>
                                    <div className="stat-label">Joined</div>
                                </div>
                            </div>
                            <div className="stats-note">
                                Trading statistics will be available when you connect your trading account.
                            </div>
                        </div>
                    )}

                    {activeTab === 'achievements' && (
                        <div className="tab-panel">
                            {achievements.length > 0 ? (
                                <div className="achievements-grid">
                                    {achievements.map((achievement, index) => (
                                        <div key={index} className="achievement-badge-large">
                                            <div className="achievement-icon">{achievement.icon}</div>
                                            <div className="achievement-name">{achievement.name}</div>
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
            </div>
        </div>
    );
};

export default PublicProfile;
