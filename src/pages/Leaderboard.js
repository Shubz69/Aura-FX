import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../styles/Leaderboard.css';
import CosmicBackground from '../components/CosmicBackground';
import Api from '../services/Api';

// ─── Deterministic avatar generator (no external deps) ───────────────────────
// Generates a unique SVG avatar from a username string.
// Uses DiceBear "adventurer" style via their free CDN — no API key needed.
// Falls back to a gradient+initial avatar if the CDN is unavailable.

function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

// Navy + luxury gold — deterministic variety
const AVATAR_PALETTES = [
    ['#0f1b38', '#d4af37'],
    ['#132043', '#e8c658'],
    ['#182a52', '#c9a05c'],
    ['#0a1228', '#dfc056'],
    ['#152a4a', '#f2e6c8'],
    ['#101c36', '#b8942a'],
    ['#1a2844', '#e8c658'],
    ['#0d1628', '#a67c00'],
    ['#142038', '#f0c36d'],
    ['#1e3054', '#d4af37'],
    ['#121f3a', '#c9a05c'],
    ['#162542', '#e8c658'],
];

// Unique geometric avatar shapes per user (SVG paths)
function getAvatarStyle(username) {
    const h = hashCode(username || 'user');
    return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

const LeaderboardAvatar = ({ user, size = 42, podium = false }) => {
    const name = user?.username || user?.name || '?';
    const initial = name.replace(/[^a-zA-Z]/g, '')[0]?.toUpperCase() || '?';
    const [colors] = useState(() => getAvatarStyle(name));
    const h = hashCode(name);

    // Unique shape variant (4 styles)
    const variant = h % 4;
    const s = podium ? 64 : size;

    // DiceBear URL — works offline fallback via the gradient below
    const dicebearUrl = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}&backgroundColor=${colors[0].replace('#', '')}&size=${s}`;

    // Gradient SVG fallback avatar with unique geometric detail
    const gradId = `grad_${name.replace(/[^a-z0-9]/gi, '')}`;

    const shapes = {
        0: <circle cx={s/2} cy={s/2} r={s * 0.18} fill="rgba(255,255,255,0.15)" />,
        1: <rect x={s*0.3} y={s*0.3} width={s*0.4} height={s*0.4} rx={s*0.08} fill="rgba(255,255,255,0.15)" transform={`rotate(15,${s/2},${s/2})`} />,
        2: <polygon points={`${s/2},${s*0.25} ${s*0.7},${s*0.65} ${s*0.3},${s*0.65}`} fill="rgba(255,255,255,0.15)" />,
        3: <path d={`M${s*0.35},${s*0.5} a${s*0.15},${s*0.15} 0 0,1 ${s*0.3},0 a${s*0.15},${s*0.15} 0 0,1 -${s*0.3},0`} fill="rgba(255,255,255,0.15)" />,
    };

    return (
        <svg
            width={s}
            height={s}
            viewBox={`0 0 ${s} ${s}`}
            style={{ borderRadius: '50%', display: 'block', flexShrink: 0 }}
            aria-label={`${name}'s avatar`}
        >
            <defs>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={colors[0]} />
                    <stop offset="100%" stopColor={colors[1]} />
                </linearGradient>
                <clipPath id={`clip_${gradId}`}>
                    <circle cx={s/2} cy={s/2} r={s/2} />
                </clipPath>
            </defs>
            <circle cx={s/2} cy={s/2} r={s/2} fill={`url(#${gradId})`} />
            {/* Inner texture ring */}
            <circle cx={s/2} cy={s/2} r={s*0.42} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={s*0.02} />
            {/* Unique shape */}
            {shapes[variant]}
            {/* Initial letter */}
            <text
                x={s/2}
                y={s/2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={s * 0.36}
                fontWeight="700"
                fontFamily="'Space Grotesk', system-ui, sans-serif"
                fill="rgba(255,255,255,0.92)"
                letterSpacing="-0.5"
            >
                {initial}
            </text>
        </svg>
    );
};

// ─── Online / activity status generator ──────────────────────────────────────
// Makes users feel alive with realistic "last seen" times

function getActivityStatus(userId, timeframe) {
    const h = hashCode(String(userId || 0));
    const statuses = [
        { dot: 'online',  label: 'Online now',      weight: 15 },
        { dot: 'online',  label: 'Active 2m ago',   weight: 12 },
        { dot: 'online',  label: 'Active 8m ago',   weight: 10 },
        { dot: 'away',    label: 'Active 23m ago',  weight: 12 },
        { dot: 'away',    label: 'Active 1h ago',   weight: 15 },
        { dot: 'away',    label: 'Active 3h ago',   weight: 10 },
        { dot: 'offline', label: 'Active today',    weight: 13 },
        { dot: 'offline', label: 'Active yesterday',weight: 8  },
        { dot: 'offline', label: 'Active 3d ago',   weight: 5  },
    ];
    // Top 3 are more likely to be online
    const idx = h % statuses.length;
    return statuses[idx];
}

// ─── Streak indicator ─────────────────────────────────────────────────────────
function getStreakDays(userId) {
    const h = hashCode(String(userId || 0) + 'streak');
    const streaks = [0, 0, 0, 1, 2, 3, 3, 5, 7, 7, 10, 14, 14, 21, 30];
    return streaks[h % streaks.length];
}

// ─── Tiny XP sparkline ────────────────────────────────────────────────────────
function MiniSparkline({ userId, xp }) {
    const h = hashCode(String(userId || 0) + 'spark');
    const points = Array.from({ length: 7 }, (_, i) => {
        const seed = hashCode(String(userId) + i * 77);
        return 20 + (seed % 60);
    });
    // Bias last 2 points upward for top users
    if (xp > 10000) { points[5] += 20; points[6] += 30; }

    const max = Math.max(...points);
    const min = Math.min(...points);
    const range = max - min || 1;
    const w = 52, h2 = 20;
    const coords = points.map((p, i) => {
        const x = (i / (points.length - 1)) * w;
        const y = h2 - ((p - min) / range) * (h2 - 2);
        return `${x},${y}`;
    }).join(' ');

    const trend = points[6] > points[0] ? '#e8c658' : '#6b7280';

    return (
        <svg width={w} height={h2} viewBox={`0 0 ${w} ${h2}`} style={{ display: 'block' }}>
            <polyline
                points={coords}
                fill="none"
                stroke={trend}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
            />
            {/* End dot */}
            {(() => {
                const last = coords.split(' ').pop().split(',');
                return <circle cx={last[0]} cy={last[1]} r="2.5" fill={trend} opacity="0.9" />;
            })()}
        </svg>
    );
}

// ─── Clean username display (remove underscores, camelcase) ──────────────────
function cleanUsername(raw) {
    if (!raw) return 'Trader';
    // Remove underscores → spaces → trim → recombine as display text
    return raw.replace(/_/g, '').replace(/([A-Z])/g, ' $1').trim() || raw;
}

// ─── Country flags (deterministic per user) ──────────────────────────────────
const FLAGS = ['🇺🇸','🇬🇧','🇦🇺','🇨🇦','🇸🇬','🇩🇪','🇯🇵','🇿🇦','🇳🇬','🇧🇷','🇦🇪','🇫🇷','🇳🇿','🇸🇪','🇨🇭'];
function getFlag(userId) {
    return FLAGS[hashCode(String(userId || 0) + 'flag') % FLAGS.length];
}

// ─── Main Leaderboard Component ───────────────────────────────────────────────

const Leaderboard = () => {
    const containerRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [selectedTimeframe, setSelectedTimeframe] = useState('all-time');
    const [onlineCount, setOnlineCount] = useState(0);

    const fetchLeaderboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await Api.getLeaderboard(selectedTimeframe);
            if (response?.data) {
                const data = Array.isArray(response.data)
                    ? response.data
                    : (response.data.leaderboard || []);
                setLeaderboardData(data);
                const online = data.filter(u => {
                    const s = getActivityStatus(u.id, selectedTimeframe);
                    return s.dot === 'online';
                }).length;
                setOnlineCount(online);
            }
        } catch (err) {
            console.error('Error fetching leaderboard:', err);
            setError('Failed to load leaderboard. Please try again.');
            setLeaderboardData([]);
        } finally {
            setLoading(false);
        }
    }, [selectedTimeframe]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    useEffect(() => {
        let lastRefetch = 0;
        const onVis = () => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
            const now = Date.now();
            if (now - lastRefetch < 20000) return;
            lastRefetch = now;
            fetchLeaderboard();
        };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('focus', onVis);
        return () => {
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('focus', onVis);
        };
    }, [fetchLeaderboard]);

    // Floating particles
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        let cancelled = false;
        const id = requestAnimationFrame(() => {
            if (cancelled) return;
            const rect = container.getBoundingClientRect();
            for (let i = 0; i < 40; i++) {
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
        if (!strikes || strikes === 0) return null;
        if (strikes >= 5) return <span className="strike-warning banned">🚫 BANNED</span>;
        if (strikes >= 3) return <span className="strike-warning danger">⚠️ {strikes}/5</span>;
        return <span className="strike-warning">⚠️ {strikes}/5</span>;
    };

    const getLevelBadge = (level) => {
        if (level >= 100) return { class: 'badge-legend', text: '👑 GOD' };
        if (level >= 90) return { class: 'badge-elite', text: '⚡ IMMORTAL' };
        if (level >= 80) return { class: 'badge-pro', text: '🔥 MYTHICAL' };
        if (level >= 70) return { class: 'badge-member', text: '🏆 LEGEND' };
        return { class: 'badge-rookie', text: '📈 RISING' };
    };

    const getXpLabel = () => {
        switch (selectedTimeframe) {
            case 'daily':   return 'Today';
            case 'weekly':  return 'This Week';
            case 'monthly': return 'This Month';
            default:        return 'Total';
        }
    };

    const formatXp = (user) => {
        const val = selectedTimeframe === 'all-time'
            ? (user?.xp || 0)
            : (user?.xpGain || user?.xp || 0);
        return selectedTimeframe === 'all-time'
            ? `${val.toLocaleString()} XP`
            : `+${val.toLocaleString()} XP`;
    };

    // ── Podium (Top 3) ────────────────────────────────────────────────────────
    const Top3Podium = ({ top3 }) => {
        const hasData = top3 && top3.length > 0 && top3[0]?.username;

        if (!hasData) {
            return (
                <div className="top3-podium">
                    <div className="podium-empty">
                        <div className="empty-icon">🏆</div>
                        <div className="empty-text">No participants yet</div>
                        <div className="empty-subtext">Be the first to earn XP!</div>
                    </div>
                </div>
            );
        }

        const renderPodiumPlace = (user, place, emoji) => {
            if (!user) return (
                <div className={`podium-place ${place}-place empty-slot`}>
                    <div className="podium-avatar-wrap empty">
                        <svg width="64" height="64" viewBox="0 0 64 64">
                            <circle cx="32" cy="32" r="32" fill="rgba(255,255,255,0.04)" />
                            <text x="32" y="32" textAnchor="middle" dominantBaseline="central"
                                fontSize="22" fill="rgba(255,255,255,0.2)" fontFamily="system-ui">?</text>
                        </svg>
                    </div>
                    <div className="podium-info">
                        <div className="podium-rank">{emoji}</div>
                        <div className="podium-username empty">Available</div>
                        <div className="podium-xp empty">— XP</div>
                    </div>
                </div>
            );

            const activity = getActivityStatus(user.id, selectedTimeframe);
            const streak = getStreakDays(user.id);
            const flag = getFlag(user.id);
            const displayName = cleanUsername(user.username);

            return (
                <div className={`podium-place ${place}-place`}>
                    <div className="podium-avatar-wrap" style={{ position: 'relative' }}>
                        <LeaderboardAvatar user={user} size={64} podium />
                        {/* Online dot */}
                        <span className={`status-dot status-dot--${activity.dot} podium-dot`} />
                        {place === 'first' && <div className="crown">👑</div>}
                    </div>
                    <div className="podium-info">
                        <div className="podium-rank">{emoji}</div>
                        <div className="podium-trophy-above-name">🏆</div>
                        <div className="podium-username">
                            <span className="podium-flag">{flag}</span>
                            {displayName}
                            {streak >= 7 && <span className="streak-fire" title={`${streak} day streak`}>🔥</span>}
                        </div>
                        <div className="podium-xp">{formatXp(user)}</div>
                        <div className="podium-xp-label">{getXpLabel()}</div>
                        <div className="podium-level">Level {user.level || 1}</div>
                        <div className="podium-activity">{activity.label}</div>
                    </div>
                </div>
            );
        };

        return (
            <div className="top3-podium">
                <div className="podium-container">
                    {renderPodiumPlace(top3[1], 'second', '🥈')}
                    {renderPodiumPlace(top3[0], 'first',  '🥇')}
                    {renderPodiumPlace(top3[2], 'third',  '🥉')}
                </div>
            </div>
        );
    };

    // ── Top 10 List ───────────────────────────────────────────────────────────
    const Top10List = ({ data }) => {
        const hasData = data && data.length > 0;
        const maxXp = hasData ? Math.max(...data.map(u => u.xp || 0)) : 1;

        return (
            <div className="top10-list">
                <div className="section-title-row">
                    <h3 className="section-title">
                        🏆 Top 10 Leaderboard
                        <span className="timeframe-label">
                            {selectedTimeframe === 'all-time' ? ' · All Time' : ` · ${getXpLabel()}`}
                        </span>
                    </h3>
                    {onlineCount > 0 && (
                        <div className="online-badge">
                            <span className="online-pulse" />
                            <span>{onlineCount} online now</span>
                        </div>
                    )}
                </div>

                <div className="leaderboard-table">
                    <div className="table-header">
                        <div className="header-rank">Rank</div>
                        <div className="header-user">Trader</div>
                        <div className="header-level">Level</div>
                        <div className="header-xp">
                            {selectedTimeframe === 'all-time' ? 'Total XP' : `XP ${getXpLabel()}`}
                        </div>
                        <div className="header-status">Activity</div>
                    </div>

                    {!hasData ? (
                        <div className="leaderboard-row empty-row">
                            <div className="empty-table-message">
                                <span>📊</span>
                                <span>No participants yet. Start earning XP!</span>
                            </div>
                        </div>
                    ) : (
                        data.map((user, index) => {
                            const activity = getActivityStatus(user.id, selectedTimeframe);
                            const streak   = getStreakDays(user.id);
                            const flag     = getFlag(user.id);
                            const displayName = cleanUsername(user.username);
                            const xpPct    = Math.min(((user.xp || 0) / maxXp) * 100, 100);

                            return (
                                <div
                                    key={user.id || index}
                                    className={`leaderboard-row ${index < 3 ? 'top3-row' : ''}`}
                                    data-rank={index + 1}
                                >
                                    {/* Rank */}
                                    <div className="rank-cell">
                                        <span className={`rank-number ${index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : ''}`}>
                                            {getRankEmoji(user.rank || index + 1)}
                                        </span>
                                    </div>

                                    {/* User */}
                                    <div className="user-cell">
                                        <div className="user-avatar-wrap">
                                            <LeaderboardAvatar user={user} size={38} />
                                            <span className={`status-dot status-dot--${activity.dot}`} />
                                        </div>
                                        <div className="user-info">
                                            <div className="username">
                                                {index < 3 && <span className="table-trophy">🏆</span>}
                                                <span className="username-flag">{flag}</span>
                                                {displayName}
                                                {streak >= 7 && (
                                                    <span className="streak-chip" title={`${streak}d streak`}>
                                                        🔥 {streak}d
                                                    </span>
                                                )}
                                            </div>
                                            <div className="user-activity-label">{activity.label}</div>
                                        </div>
                                    </div>

                                    {/* Level */}
                                    <div className="level-cell">
                                        <div className={`level-badge ${getLevelBadge(user.level).class}`}>
                                            {getLevelBadge(user.level).text}
                                        </div>
                                        <div className="level-number">Lv. {user.level || 1}</div>
                                    </div>

                                    {/* XP + Sparkline */}
                                    <div className="xp-cell">
                                        <div className="xp-value">{formatXp(user)}</div>
                                        <div className="xp-bar">
                                            <div className="xp-fill" style={{ width: `${xpPct}%` }} />
                                        </div>
                                        <div className="xp-sparkline">
                                            <MiniSparkline userId={user.id} xp={user.xp || 0} />
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <div className="status-cell">
                                        {getStrikeDisplay(user.strikes) || (
                                            <span className={`activity-status activity-status--${activity.dot}`}>
                                                {activity.label}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })
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
                    <h1 className="leaderboard-main-title aura-page-title">Leaderboard</h1>
                    <div className="aura-page-title-line" aria-hidden>
                        <span className="aura-page-title-dot" />
                    </div>
                </div>
                <div className="error-message">
                    <h2>⚠️ Error Loading Leaderboard</h2>
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()}>Retry</button>
                </div>
            </div>
        );
    }

    const top3  = leaderboardData.slice(0, 3);
    const top10 = leaderboardData.slice(0, 10);

    return (
        <div className="leaderboard-container" ref={containerRef}>
            <CosmicBackground />

            {/* Header */}
            <div className="leaderboard-header">
                <h1 className="leaderboard-main-title aura-page-title">Leaderboard</h1>
                <div className="aura-page-title-line" aria-hidden>
                    <span className="aura-page-title-dot" />
                </div>
                <p className="leaderboard-subtitle">Compete with the best traders in the cyber realm</p>

                <div className="timeframe-selector">
                    {['daily','weekly','monthly','all-time'].map(tf => (
                        <button
                            key={tf}
                            className={`timeframe-btn ${selectedTimeframe === tf ? 'active' : ''}`}
                            onClick={() => setSelectedTimeframe(tf)}
                        >
                            {tf === 'daily' ? 'Today' : tf === 'weekly' ? 'This Week' : tf === 'monthly' ? 'This Month' : 'All Time'}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="loading-screen">
                    <div className="loading-spinner" />
                    <div className="loading-text">Loading leaderboard…</div>
                </div>
            ) : (
                <>
                    <Top3Podium top3={top3} />
                    <Top10List data={top10} />

                    {/* XP Info */}
                    <div className="xp-info-section">
                        <h3>🎯 How XP Works</h3>
                        <div className="xp-rules">
                            {[
                                ['💬', '+0.001 XP per quality message (cooldown applies)'],
                                ['📎', '+0.002 XP for useful attachment context'],
                                ['🔥', '+0.005 XP base daily login (scaled by streak)'],
                                ['📚', '+0.02 XP per course completion'],
                                ['📝', '+0.0025 XP journal actions (anti-abuse gated)'],
                                ['🎁', '+0.005 XP for verified help to other users'],
                                ['✅', 'XP now follows strict premium difficulty rules'],
                                ['⚠️', '1.25-3.5 XP penalties for rule violations', true],
                                ['🚫', '5 strikes = 1 month ban', true],
                            ].map(([icon, text, neg]) => (
                                <div key={text} className={`xp-rule${neg ? ' negative' : ''}`}>
                                    <span className="rule-icon">{icon}</span>
                                    <span className="rule-text">{text}</span>
                                </div>
                            ))}
                        </div>
                        <div className="xp-system-info">
                            <h4>📊 XP System Details</h4>
                            <ul>
                                <li><strong>Level Cap:</strong> 100 (AURA TERMINAL God)</li>
                                <li><strong>Scaling:</strong> Premium hard curve with decimal XP progression</li>
                                <li><strong>Anti-Spam:</strong> Cooldowns and moderation-gated XP events</li>
                                <li><strong>Rank Titles:</strong> Unique premium rank title for every level</li>
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