import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../styles/PublicProfile.css';
import BinaryBackground from '../components/BinaryBackground';

import { FaArrowLeft, FaMedal, FaCalendarAlt, FaUserCircle } from 'react-icons/fa';

const PublicProfile = () => {
    const { userId } = useParams();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const resolveApiBaseUrl = () => {
        if (typeof window !== 'undefined' && window.location?.origin) {
            return window.location.origin;
        }
        return process.env.REACT_APP_API_URL || 'https://theglitch.world';
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
    }, [userId]);

    const getLevelBadge = (level) => {
        if (level >= 75) return { label: "Legend", color: "#ffc107", icon: "👑" };
        if (level >= 50) return { label: "Elite", color: "#fd7e14", icon: "🔥" };
        if (level >= 25) return { label: "Pro", color: "#6f42c1", icon: "🟣" };
        if (level >= 10) return { label: "Member", color: "#0d6efd", icon: "🔵" };
        return { label: "Rookie", color: "#6c757d", icon: "🟢" };
    };

    const getAchievements = (level) => {
        const list = [];
        if (level >= 5) list.push("🔰 Getting Started");
        if (level >= 10) list.push("🎯 Active Communicator");
        if (level >= 25) list.push("🔥 Level 25 Club");
        if (level >= 50) list.push("🏆 Top Contributor");
        if (level >= 75) list.push("👑 Veteran Status");
        if (level >= 100) list.push("⭐ Infinity Legend");
        return list;
    };



    const goBack = () => {
        navigate(-1); // Go back to previous page
    };

    if (loading) {
        return (
            <div className="public-profile-container">
                <BinaryBackground />
                <div className="profile-card loading">
                    <div className="loader">Loading profile...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="public-profile-container">
                <BinaryBackground />
                <div className="profile-card error">
                    <div className="error-message">{error}</div>
                    <button className="back-button" onClick={goBack}>
                        <FaArrowLeft /> Go Back
                    </button>
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="public-profile-container">
                <BinaryBackground />
                <div className="profile-card error">
                    <div className="error-message">Profile not found</div>
                    <button className="back-button" onClick={goBack}>
                        <FaArrowLeft /> Go Back
                    </button>
                </div>
            </div>
        );
    }

    const percent = Math.min((profile.xp / (profile.level * 100)) * 100, 100);
    const badge = getLevelBadge(profile.level);
    const joinDate = new Date(profile.joinDate || Date.now()).toLocaleDateString();
    const achievements = getAchievements(profile.level);

    return (
        <div className="public-profile-container">
            <BinaryBackground />
            <div className="profile-card">
                <button className="back-button" onClick={goBack}>
                    <FaArrowLeft /> Back
                </button>
                
                <div className="profile-header">
                    {profile.avatar ? (
                        <img
                            src={`/styles/images/${profile.avatar}`}
                            alt="Profile Avatar"
                            className="profile-avatar"
                        />
                    ) : (
                        <div className="profile-avatar-placeholder">
                            {profile.username.charAt(0).toUpperCase()}
                        </div>
                    )}
                    
                    <div className="profile-title">
                        <h1 className="profile-username">{profile.username.toUpperCase()}</h1>
                        <div className="badge" style={{ backgroundColor: badge.color }}>
                            {badge.icon} {badge.label}
                        </div>
                    </div>
                </div>
                
                <div className="profile-stats-container">
                    <div className="stat-card">
                        <div className="stat-icon"><FaUserCircle /></div>
                        <div className="stat-value">{profile.level}</div>
                        <div className="stat-label">Level</div>
                    </div>
                    
                    <div className="stat-card">
                        <div className="stat-icon"><FaMedal /></div>
                        <div className="stat-value">{profile.stats?.reputation || 0}</div>
                        <div className="stat-label">Reputation</div>
                    </div>
                    
                    <div className="stat-card">
                        <div className="stat-icon"><FaCalendarAlt /></div>
                        <div className="stat-value">{joinDate}</div>
                        <div className="stat-label">Joined</div>
                    </div>
                </div>
                
                <div className="xp-container">
                    <div className="xp-header">
                        <span>Experience</span>
                        <span>{profile.xp || 0} / {profile.level * 100} XP</span>
                    </div>
                    <div className="xp-bar-container">
                        <div className="xp-bar" style={{ width: `${percent}%` }}></div>
                    </div>
                </div>
                
                {profile.bio && (
                    <div className="bio-section">
                        <h3 className="section-title">ABOUT</h3>
                        <p>{profile.bio}</p>
                    </div>
                )}
                
                <div className="achievements-section">
                    <h3 className="section-title">ACHIEVEMENTS</h3>
                    {achievements.length > 0 ? (
                        <div className="achievements-grid">
                            {achievements.map((achievement, i) => (
                                <div key={i} className="achievement-badge">
                                    {achievement}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="no-achievements">No achievements yet</p>
                    )}
                </div>
                

            </div>
        </div>
    );
};

export default PublicProfile;
