import React, { useState, useEffect, useRef } from 'react';
import '../styles/Leaderboard.css';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';
// Renders coloured placeholder only on leaderboard (no personal PFP); users pick avatar in profile.
const LeaderboardAvatar = ({ user, className, emptyLabel = '?', noWrap }) => {
    if (!user) {
        if (noWrap) return <div className="empty-avatar-placeholder">{emptyLabel}</div>;
        return (
            <div className={className || 'podium-avatar empty'}>
                <div className="empty-avatar-placeholder">{emptyLabel}</div>
            </div>
        );
    }
    // Leaderboard: only coloured placeholders (no personal PFP); they pick avatar in profile.
    const content = (
        <div className="avatar-placeholder" style={{ width: '100%', height: '100%', borderRadius: '50%' }} aria-hidden />
    );
    if (noWrap) return content;
    return (
        <div className={className || 'podium-avatar'} style={{ position: 'relative' }}>
            {content}
        </div>
    );
};

const Leaderboard = () => {
    const containerRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [selectedTimeframe, setSelectedTimeframe] = useState('all-time');

    useEffect(() => {
        const fetchLeaderboard = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await Api.getLeaderboard(selectedTimeframe);
                if (response?.data?.success === false) {
                    console.error('Leaderboard API error:', response.data?.error);
                }
                if (response?.data) {
                    const data = Array.isArray(response.data)
                        ? response.data
                        : (response.data.leaderboard || []);
                    setLeaderboardData(data);
                } else {
                    setLeaderboardData([]);
                }
            } catch (err) {
                console.error('Error fetching leaderboard:', err);
                setError('Failed to load leaderboard. Please try again.');
                setLeaderboardData([]);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
    }, [selectedTimeframe]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let cancelled = false;
        const id = requestAnimationFrame(() => {
            if (cancelled) return;
            const rect = container.getBoundingClientRect();
            for (let i = 0; i < 50; i++) {
                const el = document.createElement('div');
                el.className = 'data-point';
                el.style.left = `${Math.floor(Math.random() * rect.width)}px`;
                el.style.top = `${Math.floor(Math.random() * rect.height)}px`;
                el.style.animationDelay = `${Math.random() * 8}s`;
                container.appendChild(el);
            }
        });
        return () => {
            cancelled = true;
            if (id) cancelAnimationFrame(id);
            container.querySelectorAll('.data-point').forEach(p => p.remove());
        };
    }, []);

    const getRankEmoji = (rank) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `#${rank}`;
    };

    const getStrikeDisplay = (strikes) => {
        if (strikes === 0) return null;
        if (strikes >= 5) return <span className="strike-warning banned">🚫 BANNED</span>;
        if (strikes >= 3) return <span className="strike-warning danger">⚠️ {strikes}/5 STRIKES</span>;
        return <span className="strike-warning">⚠️ {strikes}/5</span>;
    };

    const getLevelBadge = (level) => {
        if (level >= 20) return { class: 'badge-legend', text: '🔥 LEGEND' };
        if (level >= 15) return { class: 'badge-elite', text: '⚡ ELITE' };
        if (level >= 10) return { class: 'badge-pro', text: '🚀 PRO' };
        if (level >= 5) return { class: 'badge-member', text: '🌟 MEMBER' };
        return { class: 'badge-rookie', text: '🔰 ROOKIE' };
    };

    const getXpLabel = () => {
        switch (selectedTimeframe) {
            case 'daily': return 'Today';
            case 'weekly': return 'This Week';
            case 'monthly': return 'This Month';
            default: return 'Total';
        }
    };

    const formatXp = (user) => {
        if (selectedTimeframe === 'all-time') {
            return `${(user?.xp || 0).toLocaleString()} XP`;
        }
        return `+${(user?.xpGain || user?.xp || 0).toLocaleString()} XP`;
    };

    const Top3Podium = ({ top3 }) => {
        // Check if we have enough data for podium
        const hasData = top3 && top3.length > 0 && top3[0]?.username;
        
        if (!hasData) {
            return (
                <div className="top3-podium">
                    <div className="podium-empty">
                        <div className="empty-icon">🏆</div>
                        <div className="empty-text">No participants yet</div>
                        <div className="empty-subtext">Be the first to earn XP and claim the top spot!</div>
                    </div>
                </div>
            );
        }
        
        const renderPodiumPlace = (user, place, emoji) => {
            if (!user) {
                return (
                    <div className={`podium-place ${place}-place empty-slot`}>
                        <div className="podium-avatar empty">
                            <div className="empty-avatar-placeholder">?</div>
                        </div>
                        <div className="podium-info">
                            <div className="podium-rank">{emoji}</div>
                            <div className="podium-username empty">Available</div>
                            <div className="podium-xp empty">— XP</div>
                        </div>
                    </div>
                );
            }
            
            return (
                <div className={`podium-place ${place}-place`}>
                    <div className="podium-avatar" style={{ position: 'relative' }}>
                        <LeaderboardAvatar user={user} noWrap />
                        {place === 'first' && <div className="crown">👑</div>}
                        {user.isDemo && <span className="demo-badge" title="Demo User">🤖</span>}
                    </div>
                    <div className="podium-info">
                        <div className="podium-rank">{emoji}</div>
                        <div className="podium-trophy-above-name">🏆</div>
                        <div className="podium-username">{user.username}</div>
                        <div className="podium-xp">{formatXp(user)}</div>
                        <div className="podium-xp-label">{getXpLabel()}</div>
                        <div className="podium-level">Level {user.level || 1}</div>
                    </div>
                </div>
            );
        };
        
        return (
            <div className="top3-podium">
                <div className="podium-container">
                    {renderPodiumPlace(top3[1], 'second', '🥈')}
                    {renderPodiumPlace(top3[0], 'first', '🥇')}
                    {renderPodiumPlace(top3[2], 'third', '🥉')}
                </div>
            </div>
        );
    };

    const Top10List = ({ data }) => {
        const hasData = data && data.length > 0;
        
        return (
            <div className="top10-list">
                <h3 className="section-title">
                    🏆 Top 10 leaderboard 
                    <span className="timeframe-label">
                        {selectedTimeframe === 'all-time' ? ' - All time' : ` - ${getXpLabel()}`}
                    </span>
                </h3>
                <div className="leaderboard-table">
                    <div className="table-header">
                        <div className="header-rank">Rank</div>
                        <div className="header-user">User</div>
                        <div className="header-level">Level</div>
                        <div className="header-xp">
                            {selectedTimeframe === 'all-time' ? 'Total XP' : `XP ${getXpLabel()}`}
                        </div>
                        <div className="header-status">Status</div>
                    </div>
                    {!hasData ? (
                        <div className="leaderboard-row empty-row">
                            <div className="empty-table-message">
                                <span className="empty-icon">📊</span>
                                <span>No participants yet for this timeframe. Start earning XP to appear here!</span>
                            </div>
                        </div>
                    ) : (
                        data.map((user, index) => (
                            <div key={user.id || index} className={`leaderboard-row ${index < 3 ? 'top3-row' : ''} ${user.isDemo ? 'demo-row' : ''}`}>
                                <div className="rank-cell">
                                    <span className="rank-number">{getRankEmoji(user.rank)}</span>
                                </div>
                                <div className="user-cell">
                                    <div className="user-avatar">
                                        <LeaderboardAvatar user={user} noWrap />
                                        {user.isDemo && <span className="demo-indicator" title="Demo User">🤖</span>}
                                    </div>
                                    <div className="user-info">
                                        <div className="username">
                                            {index < 3 && <span className="table-trophy">🏆</span>}
                                            {user.username}
                                            {user.isDemo && <span className="demo-tag">Demo</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="level-cell">
                                    <div className={`level-badge ${getLevelBadge(user.level).class}`}>
                                        {getLevelBadge(user.level).text}
                                    </div>
                                </div>
                                <div className="xp-cell">
                                    <div className="xp-value">{formatXp(user)}</div>
                                    <div className="xp-bar">
                                        <div 
                                            className="xp-fill" 
                                            style={{ 
                                                width: `${selectedTimeframe === 'all-time' 
                                                    ? Math.min(((user.xp || 0) / 50000) * 100, 100)
                                                    : Math.min(((user.xpGain || user.xp || 0) / 500) * 100, 100)
                                                }%` 
                                            }}
                                        ></div>
                                    </div>
                                </div>
                                <div className="status-cell">
                                    {user.isDemo 
                                        ? <span className="demo-status">🤖 Demo</span>
                                        : getStrikeDisplay(user.strikes)
                                    }
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    };

    if (error) {
        return (
            <div className="leaderboard-container" ref={containerRef}>
                <CosmicBackground />
                <div className="leaderboard-header">
                    <h1 className="leaderboard-main-title">Leaderboard</h1>
                    <p className="leaderboard-subtitle">Compete with the best traders in the cyber realm</p>
                </div>
                <div className="error-message">
                    <h2>⚠️ Error Loading Leaderboard</h2>
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()}>Retry</button>
                </div>
            </div>
        );
    }

    const top3 = leaderboardData.slice(0, 3);
    const top10 = leaderboardData.slice(0, 10);

    return (
        <div className="leaderboard-container" ref={containerRef}>
            <CosmicBackground />
            
            <div className="leaderboard-header">
                <h1 className="leaderboard-main-title">Leaderboard</h1>
                <p className="leaderboard-subtitle">Compete with the best traders in the cyber realm</p>
                
                <div className="timeframe-selector">
                    <button 
                        className={`timeframe-btn ${selectedTimeframe === 'daily' ? 'active' : ''}`}
                        onClick={() => setSelectedTimeframe('daily')}
                    >
                        Today
                    </button>
                    <button 
                        className={`timeframe-btn ${selectedTimeframe === 'weekly' ? 'active' : ''}`}
                        onClick={() => setSelectedTimeframe('weekly')}
                    >
                        This Week
                    </button>
                    <button 
                        className={`timeframe-btn ${selectedTimeframe === 'monthly' ? 'active' : ''}`}
                        onClick={() => setSelectedTimeframe('monthly')}
                    >
                        This Month
                    </button>
                    <button 
                        className={`timeframe-btn ${selectedTimeframe === 'all-time' ? 'active' : ''}`}
                        onClick={() => setSelectedTimeframe('all-time')}
                    >
                        All Time
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="loading-screen" style={{ minHeight: '280px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Loading leaderboard…</div>
                </div>
            ) : (
                <>
            {/* Top 3 Podium */}
            <Top3Podium top3={top3} />

            {/* Top 10 List */}
            <Top10List data={top10} />

            {/* XP System Info */}
            <div className="xp-info-section">
                <h3>🎯 How XP Works</h3>
                <div className="xp-rules">
                    <div className="xp-rule">
                        <span className="rule-icon">💬</span>
                        <span className="rule-text">+10 XP per message in community</span>
                    </div>
                    <div className="xp-rule">
                        <span className="rule-icon">📎</span>
                        <span className="rule-text">+5 XP for file attachments</span>
                    </div>
                    <div className="xp-rule">
                        <span className="rule-icon">🔥</span>
                        <span className="rule-text">+25 XP for daily login streak</span>
                    </div>
                    <div className="xp-rule">
                        <span className="rule-icon">📚</span>
                        <span className="rule-text">+50 XP per course completion</span>
                    </div>
                    <div className="xp-rule">
                        <span className="rule-icon">📝</span>
                        <span className="rule-text">+15 XP per journal entry</span>
                    </div>
                    <div className="xp-rule">
                        <span className="rule-icon">🎁</span>
                        <span className="rule-text">+100 XP for helping other users</span>
                    </div>
                    <div className="xp-rule">
                        <span className="rule-icon">✅</span>
                        <span className="rule-text">+XP for good behavior (moderation rewards)</span>
                    </div>
                    <div className="xp-rule negative">
                        <span className="rule-icon">⚠️</span>
                        <span className="rule-text">-200 XP for rule violations</span>
                    </div>
                    <div className="xp-rule negative">
                        <span className="rule-icon">🚫</span>
                        <span className="rule-text">5 strikes = 1 month ban</span>
                    </div>
                </div>
                <div className="xp-system-info">
                    <h4>📊 XP System Details</h4>
                    <ul>
                        <li><strong>Level Cap:</strong> 1000 (AURA FX Legend)</li>
                        <li><strong>Scaling:</strong> Early levels are easier, higher levels require more XP</li>
                        <li><strong>Anti-Spam:</strong> Cooldowns prevent abuse (5s between messages, 24h for daily login)</li>
                        <li><strong>Rank Titles:</strong> Earn unique trading rank titles every 10 levels</li>
                        <li><strong>Tiers:</strong> Beginner → Intermediate → Advanced → Professional → Elite → Master → Legend → Mythical → Immortal → God</li>
                    </ul>
                </div>
            </div>
                </>
            )}
        </div>
    );
};

export default Leaderboard;
