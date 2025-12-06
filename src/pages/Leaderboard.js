import React, { useState, useEffect, useRef } from 'react';
import '../styles/Leaderboard.css';
import BinaryBackground from '../components/BinaryBackground';
import Api from '../services/Api';

const Leaderboard = () => {
    const containerRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [selectedTimeframe, setSelectedTimeframe] = useState('all-time');

    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            const containerRect = container.getBoundingClientRect();
            
            for (let i = 0; i < 50; i++) {
                const dataPoint = document.createElement('div');
                dataPoint.className = 'data-point';
                
                const left = Math.floor(Math.random() * containerRect.width);
                const top = Math.floor(Math.random() * containerRect.height);
                
                dataPoint.style.left = `${left}px`;
                dataPoint.style.top = `${top}px`;
                dataPoint.style.animationDelay = `${Math.random() * 8}s`;
                
                container.appendChild(dataPoint);
            }
        }

        const fetchLeaderboard = async () => {
            try {
                const response = await Api.getLeaderboard(selectedTimeframe);
                
                if (response && response.data) {
                    const data = Array.isArray(response.data) ? response.data : response.data.leaderboard || [];
                    setLeaderboardData(data);
                } else {
                    setLeaderboardData([]);
                }
                setLoading(false);
            } catch (err) {
                console.error('Error fetching leaderboard:', err);
                setError('Failed to load leaderboard. Please try again.');
                setLeaderboardData([]);
                setLoading(false);
            }
        };

        fetchLeaderboard();

        return () => {
            if (container) {
                const dataPoints = container.querySelectorAll('.data-point');
                dataPoints.forEach(point => point.remove());
            }
        };
    }, [selectedTimeframe]);

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

    const Top3Podium = ({ top3 }) => (
        <div className="top3-podium">
            <div className="podium-container">
                {/* 2nd Place */}
                <div className="podium-place second-place">
                    <div className="podium-avatar">
                        <img src={`/avatars/${top3[1]?.avatar || 'avatar_ai.png'}`} alt={top3[1]?.username} />
                    </div>
                    <div className="podium-info">
                        <div className="podium-rank">🥈</div>
                        <div className="podium-username">{top3[1]?.username || 'Loading...'}</div>
                        <div className="podium-xp">{top3[1]?.xp?.toLocaleString() || 0} XP</div>
                        <div className="podium-level">Level {top3[1]?.level || 0}</div>
                    </div>
                </div>

                {/* 1st Place */}
                <div className="podium-place first-place">
                    <div className="podium-avatar">
                        <img src={`/avatars/${top3[0]?.avatar || 'avatar_ai.png'}`} alt={top3[0]?.username} />
                        <div className="crown">👑</div>
                    </div>
                    <div className="podium-info">
                        <div className="podium-rank">🥇</div>
                        <div className="podium-username">{top3[0]?.username || 'Loading...'}</div>
                        <div className="podium-xp">{top3[0]?.xp?.toLocaleString() || 0} XP</div>
                        <div className="podium-level">Level {top3[0]?.level || 0}</div>
                    </div>
                </div>

                {/* 3rd Place */}
                <div className="podium-place third-place">
                    <div className="podium-avatar">
                        <img src={`/avatars/${top3[2]?.avatar || 'avatar_ai.png'}`} alt={top3[2]?.username} />
                    </div>
                    <div className="podium-info">
                        <div className="podium-rank">🥉</div>
                        <div className="podium-username">{top3[2]?.username || 'Loading...'}</div>
                        <div className="podium-xp">{top3[2]?.xp?.toLocaleString() || 0} XP</div>
                        <div className="podium-level">Level {top3[2]?.level || 0}</div>
                    </div>
                </div>
            </div>
        </div>
    );

    const Top10List = ({ data }) => (
        <div className="top10-list">
            <h3 className="section-title">🏆 TOP 10 LEADERBOARD</h3>
            <div className="leaderboard-table">
                <div className="table-header">
                    <div className="header-rank">RANK</div>
                    <div className="header-user">USER</div>
                    <div className="header-level">LEVEL</div>
                    <div className="header-xp">XP</div>
                    <div className="header-status">STATUS</div>
                </div>
                {data.map((user, index) => (
                    <div key={user.id} className={`leaderboard-row ${index < 3 ? 'top3-row' : ''}`}>
                        <div className="rank-cell">
                            <span className="rank-number">{getRankEmoji(user.rank)}</span>
                        </div>
                        <div className="user-cell">
                            <div className="user-avatar">
                                <img src={`/avatars/${user.avatar}`} alt={user.username} />
                            </div>
                            <div className="user-info">
                                <div className="username">{user.username}</div>
                                <div className="user-role">{user.role}</div>
                            </div>
                        </div>
                        <div className="level-cell">
                            <div className={`level-badge ${getLevelBadge(user.level).class}`}>
                                {getLevelBadge(user.level).text}
                            </div>
                        </div>
                        <div className="xp-cell">
                            <div className="xp-value">{user.xp.toLocaleString()}</div>
                            <div className="xp-bar">
                                <div 
                                    className="xp-fill" 
                                    style={{ width: `${(user.xp / 20000) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                        <div className="status-cell">
                            {getStrikeDisplay(user.strikes)}
            </div>
                        </div>
                    ))}
                </div>
            </div>
    );

    if (loading) {
        return (
            <div className="leaderboard-container" ref={containerRef}>
                <BinaryBackground />
                <div className="loading-screen">
                    <div className="loading-spinner"></div>
                    <div className="loading-text">Loading Leaderboard...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="leaderboard-container">
                <BinaryBackground />
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
            <BinaryBackground />
            
            {/* Header */}
            <div className="leaderboard-header">
                <h1 className="leaderboard-main-title">LEADERBOARD</h1>
                <p className="leaderboard-subtitle">Compete with the best traders in the cyber realm</p>
                
                {/* Timeframe Selector */}
                <div className="timeframe-selector">
                    <button 
                        className={`timeframe-btn ${selectedTimeframe === 'all-time' ? 'active' : ''}`}
                        onClick={() => setSelectedTimeframe('all-time')}
                    >
                        All Time
                    </button>
                    <button 
                        className={`timeframe-btn ${selectedTimeframe === 'monthly' ? 'active' : ''}`}
                        onClick={() => setSelectedTimeframe('monthly')}
                    >
                        This Month
                    </button>
                    <button 
                        className={`timeframe-btn ${selectedTimeframe === 'weekly' ? 'active' : ''}`}
                        onClick={() => setSelectedTimeframe('weekly')}
                    >
                        This Week
                    </button>
                </div>
            </div>

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
                        <span className="rule-icon">📚</span>
                        <span className="rule-text">+50 XP per course completion</span>
                    </div>
                    <div className="xp-rule">
                        <span className="rule-icon">🎁</span>
                        <span className="rule-text">+100 XP for helping other users</span>
                                </div>
                    <div className="xp-rule">
                        <span className="rule-icon">⚠️</span>
                        <span className="rule-text">-200 XP for rule violations</span>
                                </div>
                    <div className="xp-rule">
                        <span className="rule-icon">🚫</span>
                        <span className="rule-text">5 strikes = 1 month ban</span>
                                    </div>
                                    </div>
                                </div>
        </div>
    );
};

export default Leaderboard;
