import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { resolveAvatarUrl, getPlaceholderColor } from '../utils/avatar';
import { FaArrowLeft, FaEnvelope } from 'react-icons/fa';

const PublicProfile = () => {
    const { t } = useTranslation();
    const { userId } = useParams();
    const { user: currentUser } = useAuth();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const navigate = useNavigate();
    
    const isAdminUser = isAdmin(currentUser) || isSuperAdmin(currentUser);

    const fetchInFlightRef = useRef(false);

    useEffect(() => {
        if (!userId || String(userId).toLowerCase() === 'system') {
            setError(t('publicProfile.systemUnavailable'));
            setLoading(false);
            return;
        }
        const fetchProfile = async () => {
            if (fetchInFlightRef.current) return;
            fetchInFlightRef.current = true;
            try {
                setLoading(true);
                const baseUrl = Api.getBaseUrl() || '';
                const response = await fetch(`${baseUrl}/api/users/public-profile/${userId}`);
                
                if (response.ok) {
                    const data = await response.json();
                    setProfile(data);
                } else {
                    setError(t('publicProfile.notFound'));
                }
                setLoading(false);
            } catch (err) {
                console.error("Error fetching profile:", err);
                setError(t('publicProfile.loadFailed'));
                setLoading(false);
            } finally {
                fetchInFlightRef.current = false;
            }
        };

        fetchProfile();
        
        // Keep profile updated without flooding network/CPU.
        const refreshInterval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            fetchProfile();
        }, 15000);
        
        return () => clearInterval(refreshInterval);
    }, [userId]);

    const goBack = () => {
        navigate(-1);
    };

    if (loading) {
        return (
            <div className="public-profile-container">
                <CosmicBackground />
                <div className="profile-modal loading">
                    <div className="loading-spinner"></div>
                    <div className="loading-text">{t('publicProfile.loading')}</div>
                </div>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="public-profile-container">
                <CosmicBackground />
                <div className="profile-modal error">
                    <div className="error-message">{error || t('publicProfile.notFound')}</div>
                    <button className="back-button" onClick={goBack}>
                        <FaArrowLeft /> {t('publicProfile.back')}
                    </button>
                </div>
            </div>
        );
    }

    // Calculate XP progress using the XP system
    const xpProgress = getXPProgress(profile.xp || 0, profile.level || 1);
    const rankTitle = getRankTitle(profile.level || 1, t);
    const tierName = getTierName(profile.level || 1, t);
    const tierColor = getTierColor(profile.level || 1);
    const nextMilestone = getNextRankMilestone(profile.level || 1, t);
    const joinDate = new Date(profile.joinDate || profile.createdAt || Date.now()).toLocaleDateString();
    const loginStreak = profile.login_streak || 0;

    // Get achievements based on level
    const getAchievements = (level) => {
        const list = [];
        if (level >= 10) list.push({ name: t('publicProfile.achv.started'), icon: "🔰" });
        if (level >= 20) list.push({ name: t('publicProfile.achv.communicator'), icon: "🎯" });
        if (level >= 40) list.push({ name: t('publicProfile.achv.proTier'), icon: "🔥" });
        if (level >= 60) list.push({ name: t('publicProfile.achv.eliteTier'), icon: "🏆" });
        if (level >= 80) list.push({ name: t('publicProfile.achv.legendTier'), icon: "👑" });
        if (level >= 100) list.push({ name: t('publicProfile.achv.auraGod'), icon: "💎" });
        return list;
    };

    const achievements = getAchievements(profile.level || 1);

    return (
        <div className="public-profile-container">
            <CosmicBackground />
            <div className="profile-modal">
                {/* Back Button */}
                <button className="back-button" onClick={goBack}>
                    <FaArrowLeft /> {t('publicProfile.navBack')}
                </button>

                {/* Profile Banner */}
                <div className="profile-banner-section">
                    {profile.banner && (profile.banner.startsWith('http') || (profile.banner.startsWith('data:image') && profile.banner.includes(',') && profile.banner.length > 30)) ? (
                        <img 
                            src={profile.banner} 
                            alt={t('profile.bannerAlt')} 
                            className="profile-banner"
                            loading="lazy"
                        />
                    ) : (
                        <div className="profile-banner-placeholder">
                            <div className="banner-text">{t('publicProfile.bannerWelcome')}</div>
                        </div>
                    )}
                    
                    {/* Avatar: show profile pic or coloured circle */}
                    <div className="profile-avatar-overlay">
                        {resolveAvatarUrl(profile.avatar, Api.getBaseUrl() || '') ? (
                            <img
                                src={resolveAvatarUrl(profile.avatar, Api.getBaseUrl() || '')}
                                alt=""
                                className="profile-avatar-large"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                                loading="lazy"
                            />
                        ) : (
                            <div className="profile-avatar-large" aria-hidden style={{ width: '100%', height: '100%', borderRadius: '50%', background: getPlaceholderColor(profile.id ?? profile.username), border: '4px solid rgba(234, 169, 96, 0.6)', boxSizing: 'border-box' }} />
                        )}
                    </div>
                </div>

                {/* Profile Header Info */}
                <div className="profile-header-info">
                    <h1 className="profile-username">{profile.username || profile.name || t('publicProfile.defaultUser')}</h1>
                    <div className="profile-rank" style={{ color: tierColor }}>
                        {rankTitle}
                    </div>
                    <div className="profile-tier">{tierName}</div>
                </div>

                {/* Progress Bar */}
                {nextMilestone && (
                    <div className="profile-progress-section">
                        <div className="progress-text">
                            <span>{t('publicProfile.nextRankGap', { title: nextMilestone.title, count: nextMilestone.level - (profile.level || 1) })}</span>
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
                        {t('publicProfile.tabInformation')}
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'journey' ? 'active' : ''}`}
                        onClick={() => setActiveTab('journey')}
                    >
                        {t('profile.herosJourney')}
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'statistics' ? 'active' : ''}`}
                        onClick={() => setActiveTab('statistics')}
                    >
                        {t('profile.tab.statistics')}
                    </button>
                    <button 
                        className={`tab-btn ${activeTab === 'achievements' ? 'active' : ''}`}
                        onClick={() => setActiveTab('achievements')}
                    >
                        {t('profile.tab.achievements')}
                    </button>
                </div>

                {/* Tab Content */}
                <div className="profile-tab-content">
                    {activeTab === 'overview' && (
                        <div className="tab-panel">
                            {/* Discipline Streak – prominent when on a streak */}
                            {loginStreak > 0 && (
                                <div className="public-profile-discipline-streak">
                                    <span className="public-profile-streak-icon">🔥</span>
                                    <div className="public-profile-streak-text">
                                        <span className="public-profile-streak-label">{t('publicProfile.disciplineStreakLabel')}</span>
                                        <span className="public-profile-streak-value">{t('profile.loginStreakDays', { count: loginStreak })}</span>
                                    </div>
                                </div>
                            )}
                            {/* Journal / Task stats – real-time (Today, This week, This month) */}
                            {(profile.journalStats && (profile.journalStats.todayPct != null || profile.journalStats.weekPct != null || profile.journalStats.monthPct != null)) && (
                                <div className="public-profile-stats-circles">
                                    <div className="public-profile-stat-circle">
                                        <div className="public-profile-stat-circle-ring" style={{ '--pct': profile.journalStats.todayPct != null ? profile.journalStats.todayPct : 0 }}>
                                            <span className="public-profile-stat-circle-value">{profile.journalStats.todayPct != null ? `${profile.journalStats.todayPct}%` : '—'}</span>
                                        </div>
                                        <span className="public-profile-stat-circle-label">{t('profile.today')}</span>
                                    </div>
                                    <div className="public-profile-stat-circle">
                                        <div className="public-profile-stat-circle-ring" style={{ '--pct': profile.journalStats.weekPct != null ? profile.journalStats.weekPct : 0 }}>
                                            <span className="public-profile-stat-circle-value">{profile.journalStats.weekPct != null ? `${profile.journalStats.weekPct}%` : '—'}</span>
                                        </div>
                                        <span className="public-profile-stat-circle-label">{t('profile.thisWeek')}</span>
                                    </div>
                                    <div className="public-profile-stat-circle">
                                        <div className="public-profile-stat-circle-ring" style={{ '--pct': profile.journalStats.monthPct != null ? profile.journalStats.monthPct : 0 }}>
                                            <span className="public-profile-stat-circle-value">{profile.journalStats.monthPct != null ? `${profile.journalStats.monthPct}%` : '—'}</span>
                                        </div>
                                        <span className="public-profile-stat-circle-label">{t('profile.thisMonth')}</span>
                                    </div>
                                </div>
                            )}
                            <div className="info-section">
                                <div className="info-row">
                                    <span className="info-label">{t('publicProfile.powerLevel')}:</span>
                                    <span className="info-value large">{profile.level || 1}</span>
                                    <span className="info-badge" style={{ color: tierColor }}>+{Math.round((profile.level || 1) * 10)}%</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">Power Points:</span>
                                    <span className="info-value">{(profile.xp || 0).toLocaleString()}</span>
                                </div>
                                <div className="info-row">
                                    <span className="info-label">{t('publicProfile.disciplineStreakLabel')}:</span>
                                    <span className="info-value">{t('publicProfile.disciplinePlusDays', { count: loginStreak })}</span>
                                </div>
                            </div>

                            {/* Roles Section */}
                            <div className="roles-section">
                                <label className="section-label">{t('publicProfile.roles')}</label>
                                <select className="roles-dropdown" disabled>
                                    <option>{profile.role || t('publicProfile.roleMember')}</option>
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
                                        <span className="tag-dot" style={{ backgroundColor: '#eaa960' }}></span>
                                        {t('publicProfile.memberBadge', { role: profile.role.charAt(0).toUpperCase() + profile.role.slice(1) })}
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
                                    <FaEnvelope /> {t('publicProfile.messageUser')}
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
                                        <div className="journey-label">{t('profile.currentLevel')}</div>
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
                                        <div className="journey-label">{t('profile.rank')}</div>
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
                                    <div className="stat-label">{t('profile.stat.totalTrades')}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">✅</div>
                                    <div className="stat-value">{profile.stats?.winRate || 0}%</div>
                                    <div className="stat-label">{t('profile.stat.winRate')}</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">💰</div>
                                    <div className="stat-value">${(profile.stats?.totalProfit || 0).toLocaleString()}</div>
                                    <div className="stat-label">Total Profit</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-icon">📅</div>
                                    <div className="stat-value">{joinDate}</div>
                                    <div className="stat-label">{t('publicProfile.joined')}</div>
                                </div>
                            </div>
                            <div className="stats-note">
                                {t('profile.tradingNote')}
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
                                    <div className="no-achievements-text">{t('profile.noAchievementsTitle')}</div>
                                    <div className="no-achievements-hint">{t('profile.noAchievementsHint')}</div>
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
