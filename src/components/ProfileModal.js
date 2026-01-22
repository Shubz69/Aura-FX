import React, { useEffect, useState } from 'react';
import {
    getRankTitle,
    getTierName,
    getTierColor,
    getXPProgress,
    getNextRankMilestone
} from '../utils/xpSystem';
import { FaTimes } from 'react-icons/fa';

const ProfileModal = ({ isOpen, onClose, userId, userData }) => {
    const [profile, setProfile] = useState(userData || null);
    const [loading, setLoading] = useState(!userData);
    const [activeTab, setActiveTab] = useState('overview');

    useEffect(() => {
        if (isOpen && userId && !userData) {
            const fetchProfile = async () => {
                try {
                    setLoading(true);
                    const baseUrl = window.location.origin;
                    const response = await fetch(`${baseUrl}/api/users/public-profile/${userId}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        setProfile(data);
                    }
                    setLoading(false);
                } catch (err) {
                    console.error("Error fetching profile:", err);
                    setLoading(false);
                }
            };

            fetchProfile();
        } else if (userData) {
            setProfile(userData);
            setLoading(false);
        }
    }, [isOpen, userId, userData]);

    if (!isOpen) return null;

    const getAvatarPath = (avatarName) => {
        if (avatarName && avatarName.startsWith('data:image')) {
            return avatarName;
        }
        if (avatarName && avatarName.startsWith('/')) {
            return avatarName;
        }
        return avatarName ? `/avatars/${avatarName}` : '/avatars/avatar_ai.png';
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

    const xpProgress = getXPProgress(profile.xp || 0, profile.level || 1);
    const rankTitle = getRankTitle(profile.level || 1);
    const tierName = getTierName(profile.level || 1);
    const tierColor = getTierColor(profile.level || 1);
    const nextMilestone = getNextRankMilestone(profile.level || 1);
    const joinDate = new Date(profile.joinDate || profile.createdAt || Date.now()).toLocaleDateString();
    const loginStreak = profile.login_streak || 0;

    const getAchievements = (level) => {
        const list = [];
        if (level >= 5) list.push({ name: "Getting Started", icon: "🔰" });
        if (level >= 10) list.push({ name: "Active Communicator", icon: "🎯" });
        if (level >= 25) list.push({ name: "Level 25 Club", icon: "🔥" });
        if (level >= 50) list.push({ name: "Top Contributor", icon: "🏆" });
        if (level >= 75) list.push({ name: "Veteran Status", icon: "👑" });
        if (level >= 100) list.push({ name: "Infinity Legend", icon: "⭐" });
        return list;
    };

    const achievements = getAchievements(profile.level || 1);

    return (
        <div 
            className="profile-modal-overlay"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(10px)',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                animation: 'fadeIn 0.3s ease'
            }}
            onClick={onClose}
        >
            <div 
                className="profile-modal-content"
                style={{
                    background: 'linear-gradient(135deg, rgba(30, 30, 46, 0.95) 0%, rgba(20, 20, 35, 0.98) 100%)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '20px',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.2)',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    maxWidth: '900px',
                    width: '100%',
                    maxHeight: '90vh',
                    overflow: 'auto',
                    position: 'relative',
                    animation: 'slideUp 0.3s ease'
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '20px',
                        right: '20px',
                        background: 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        zIndex: 10,
                        transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.target.style.background = 'rgba(255, 0, 0, 0.6)';
                        e.target.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.target.style.background = 'rgba(0, 0, 0, 0.6)';
                        e.target.style.transform = 'scale(1)';
                    }}
                >
                    <FaTimes />
                </button>

                {/* Profile Banner */}
                <div className="profile-banner-section" style={{
                    position: 'relative',
                    width: '100%',
                    height: '200px',
                    overflow: 'hidden',
                    marginBottom: '60px'
                }}>
                    {profile.banner ? (
                        <img 
                            src={profile.banner.startsWith('data:image') ? profile.banner : profile.banner} 
                            alt="Banner" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <div style={{
                            width: '100%',
                            height: '100%',
                            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(167, 139, 250, 0.2) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontSize: '1.2rem',
                            fontWeight: 600
                        }}>
                            Welcome to AURA FX
                        </div>
                    )}
                    
                    {/* Avatar overlapping banner */}
                    <div style={{
                        position: 'absolute',
                        bottom: '-50px',
                        left: '40px',
                        zIndex: 5
                    }}>
                        <img 
                            src={getAvatarPath(profile.avatar)} 
                            alt="Avatar" 
                            style={{
                                width: '120px',
                                height: '120px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '5px solid rgba(30, 30, 46, 0.95)',
                                boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5), 0 0 30px rgba(139, 92, 246, 0.6)',
                                background: 'rgba(20, 20, 35, 0.8)'
                            }}
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/avatars/avatar_ai.png';
                            }}
                        />
                    </div>
                </div>

                {/* Profile Header Info */}
                <div style={{ padding: '0 40px 20px', marginTop: '20px' }}>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: 700,
                        color: 'white',
                        margin: '0 0 10px 0',
                        textTransform: 'uppercase',
                        letterSpacing: '2px'
                    }}>
                        {profile.username || profile.name || 'User'}
                    </h1>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: tierColor, marginBottom: '5px' }}>
                        {rankTitle}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>
                        {tierName}
                    </div>
                </div>

                {/* Progress Bar */}
                {nextMilestone && (
                    <div style={{ padding: '0 40px 30px' }}>
                        <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.8)', marginBottom: '10px', fontWeight: 600 }}>
                            {nextMilestone.title} in {nextMilestone.level - (profile.level || 1)} levels
                        </div>
                        <div style={{
                            width: '100%',
                            height: '8px',
                            background: 'rgba(30, 30, 46, 0.8)',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            position: 'relative'
                        }}>
                            <div style={{
                                height: '100%',
                                width: `${Math.max(0, Math.min(100, xpProgress.percentage))}%`,
                                background: `linear-gradient(90deg, ${tierColor} 0%, ${tierColor}dd 100%)`,
                                borderRadius: '10px',
                                transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: `0 0 20px ${tierColor}60`
                            }}></div>
                        </div>
                    </div>
                )}

                {/* Bio */}
                {profile.bio && (
                    <div style={{ padding: '0 40px 30px', color: 'rgba(255, 255, 255, 0.8)', fontSize: '1rem', lineHeight: '1.6', fontStyle: 'italic' }}>
                        {profile.bio}
                    </div>
                )}

                {/* Tabs */}
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    padding: '0 40px',
                    borderBottom: '2px solid rgba(139, 92, 246, 0.3)',
                    marginBottom: '30px',
                    overflowX: 'auto'
                }}>
                    {['overview', 'journey', 'statistics', 'achievements'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: activeTab === tab ? '#C4B5FD' : 'rgba(255, 255, 255, 0.6)',
                                padding: '12px 24px',
                                fontSize: '1rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                borderRadius: '10px 10px 0 0',
                                transition: 'all 0.3s ease',
                                textTransform: 'uppercase',
                                letterSpacing: '1px',
                                whiteSpace: 'nowrap',
                                position: 'relative'
                            }}
                        >
                            {tab === 'overview' ? 'Information' : tab === 'journey' ? "Hero's Journey" : tab.charAt(0).toUpperCase() + tab.slice(1)}
                            {activeTab === tab && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '-2px',
                                    left: 0,
                                    right: 0,
                                    height: '3px',
                                    background: 'linear-gradient(90deg, #8B5CF6 0%, #A78BFA 100%)',
                                    borderRadius: '2px 2px 0 0'
                                }}></div>
                            )}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div style={{ padding: '0 40px 40px', minHeight: '200px' }}>
                    {activeTab === 'overview' && (
                        <div>
                            <div style={{ marginBottom: '30px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontWeight: 600, minWidth: '150px' }}>Power Level:</span>
                                    <span style={{ color: 'white', fontWeight: 700, fontSize: '2rem', color: '#C4B5FD' }}>{profile.level || 1}</span>
                                    <span style={{ marginLeft: 'auto', padding: '4px 12px', background: 'rgba(139, 92, 246, 0.2)', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, color: tierColor }}>
                                        +{Math.round((profile.level || 1) * 10)}%
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontWeight: 600, minWidth: '150px' }}>Power Points:</span>
                                    <span style={{ color: 'white', fontWeight: 700, fontSize: '1.2rem' }}>{(profile.xp || 0).toLocaleString()}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                                    <span style={{ color: 'rgba(255, 255, 255, 0.7)', fontWeight: 600, minWidth: '150px' }}>Login Streak:</span>
                                    <span style={{ color: 'white', fontWeight: 700, fontSize: '1.2rem' }}>{loginStreak}+ days</span>
                                </div>
                            </div>

                            <div style={{ marginBottom: '30px' }}>
                                <label style={{ display: 'block', color: 'rgba(255, 255, 255, 0.7)', fontWeight: 600, marginBottom: '10px', fontSize: '0.9rem', textTransform: 'uppercase' }}>Roles</label>
                                <select style={{
                                    width: '100%',
                                    background: 'rgba(20, 20, 35, 0.8)',
                                    border: '1px solid rgba(139, 92, 246, 0.3)',
                                    color: 'white',
                                    padding: '12px 16px',
                                    borderRadius: '10px',
                                    fontSize: '1rem',
                                    cursor: 'not-allowed'
                                }} disabled>
                                    <option>{profile.role || 'Member'}</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                                {achievements.map((achievement, index) => (
                                    <div key={index} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 16px',
                                        background: 'rgba(139, 92, 246, 0.15)',
                                        border: '1px solid rgba(139, 92, 246, 0.3)',
                                        borderRadius: '20px',
                                        color: 'rgba(255, 255, 255, 0.9)',
                                        fontSize: '0.9rem',
                                        fontWeight: 500
                                    }}>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tierColor, display: 'inline-block' }}></span>
                                        {achievement.name}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === 'journey' && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '20px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '15px' }}>
                                    <div style={{ fontSize: '2.5rem' }}>📈</div>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>Current Level</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#C4B5FD' }}>{profile.level || 1}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '20px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '15px' }}>
                                    <div style={{ fontSize: '2.5rem' }}>🎯</div>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>Total XP</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#C4B5FD' }}>{(profile.xp || 0).toLocaleString()}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '20px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '15px' }}>
                                    <div style={{ fontSize: '2.5rem' }}>🏆</div>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>Rank</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#C4B5FD' }}>{rankTitle}</div>
                                    </div>
                                </div>
                            </div>
                            {nextMilestone && (
                                <div style={{ padding: '30px', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(167, 139, 250, 0.15) 100%)', border: '2px solid rgba(139, 92, 246, 0.4)', borderRadius: '15px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', marginBottom: '10px' }}>Next Milestone</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#C4B5FD', marginBottom: '5px' }}>{nextMilestone.title}</div>
                                    <div style={{ fontSize: '1rem', color: 'rgba(255, 255, 255, 0.7)' }}>Level {nextMilestone.level}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'statistics' && (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                                <div style={{ padding: '25px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '15px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📊</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#C4B5FD', marginBottom: '5px' }}>{profile.stats?.totalTrades || 0}</div>
                                    <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>Total Trades</div>
                                </div>
                                <div style={{ padding: '25px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '15px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>✅</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#C4B5FD', marginBottom: '5px' }}>{profile.stats?.winRate || 0}%</div>
                                    <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>Win Rate</div>
                                </div>
                                <div style={{ padding: '25px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '15px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>💰</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#C4B5FD', marginBottom: '5px' }}>${(profile.stats?.totalProfit || 0).toLocaleString()}</div>
                                    <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>Total Profit</div>
                                </div>
                                <div style={{ padding: '25px', background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.3)', borderRadius: '15px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>📅</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#C4B5FD', marginBottom: '5px' }}>{joinDate}</div>
                                    <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase' }}>Joined</div>
                                </div>
                            </div>
                            <div style={{ textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.9rem', fontStyle: 'italic', padding: '20px', background: 'rgba(20, 20, 35, 0.5)', borderRadius: '10px' }}>
                                Trading statistics will be available when you connect your trading account.
                            </div>
                        </div>
                    )}

                    {activeTab === 'achievements' && (
                        <div>
                            {achievements.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
                                    {achievements.map((achievement, index) => (
                                        <div key={index} style={{
                                            padding: '25px',
                                            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(167, 139, 250, 0.15) 100%)',
                                            border: '1px solid rgba(139, 92, 246, 0.3)',
                                            borderRadius: '15px',
                                            textAlign: 'center',
                                            transition: 'all 0.3s ease',
                                            cursor: 'pointer'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-5px) scale(1.05)';
                                            e.currentTarget.style.boxShadow = '0 10px 30px rgba(139, 92, 246, 0.4)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0) scale(1)';
                                            e.currentTarget.style.boxShadow = 'none';
                                        }}
                                        >
                                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>{achievement.icon}</div>
                                            <div style={{ fontSize: '1rem', color: '#C4B5FD', fontWeight: 600 }}>{achievement.name}</div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                                    <div style={{ fontSize: '4rem', marginBottom: '20px', opacity: 0.5 }}>🏅</div>
                                    <div style={{ fontSize: '1.2rem', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '10px' }}>No achievements yet</div>
                                    <div style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.4)', fontStyle: 'italic' }}>Keep trading and engaging to unlock achievements!</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(50px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default ProfileModal;
