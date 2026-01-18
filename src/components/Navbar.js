import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/Navbar.css";
import "../styles/UserDropdown.css";
import { FaUserCircle, FaSignOutAlt, FaBook, FaTrophy, FaCog, FaHeadset, FaBars, FaTimes, FaEnvelope, FaSlidersH } from 'react-icons/fa';
import { isSuperAdmin, isAdmin, isPremium } from '../utils/roles';
import AuraLogo from './AuraLogo';
import NotificationSystem, { triggerNotification } from './NotificationSystem';

const Navbar = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mobileUserMenuOpen, setMobileUserMenuOpen] = useState(false);
    
    const handleNotificationClick = (link) => {
        if (link) {
            navigate(link);
        }
    };

    const toggleDropdown = () => {
        setDropdownOpen(!dropdownOpen);
    };

    const toggleMobileMenu = () => {
        setMobileMenuOpen(!mobileMenuOpen);
        setMobileUserMenuOpen(false); // Close user menu when opening nav menu
    };

    const toggleMobileUserMenu = () => {
        setMobileUserMenuOpen(!mobileUserMenuOpen);
        setMobileMenuOpen(false); // Close nav menu when opening user menu
    };

    return (
        <nav className="navbar">
            <div className="logo-container">
                <Link to="/" className="logo-link">
                    <div className="navbar-logo-wrapper">
                        <AuraLogo />
                    </div>
                    <span className="logo">AURA FX</span>
                </Link>
            </div>

            <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
                {mobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>

            <ul className={`nav-links ${mobileMenuOpen ? 'show' : ''}`}>
                {!user && <li><Link to="/">Home</Link></li>}
                {user && <li><Link to="/community">Community</Link></li>}
                <li><Link to="/courses">C & S</Link></li>
                {!user && <li><Link to="/explore">Explore</Link></li>}
                    {!user && <li><Link to="/why-glitch">Why AURA FX</Link></li>}
                <li><Link to="/contact">Contact Us</Link></li>
                {user && <li><Link to="/leaderboard">Leaderboard</Link></li>}
                {(isAdmin(user) || isSuperAdmin(user)) && (
                    <>
                        <li><Link to="/admin">Admin Panel</Link></li>
                        <li><Link to="/admin/messages"><FaHeadset className="dropdown-icon" /> Contact Submissions</Link></li>
                    </>
                )}
            </ul>

            <div className="nav-buttons">
                {!user ? (
                    <>
                        <button className="sign-in" onClick={() => window.location.href='/login'}>Sign In</button>
                        <button className="start-trading" onClick={() => window.location.href='/register'}>Sign Up</button>
                    </>
                ) : (
                    <>
                        <NotificationSystem user={user} onNotificationClick={handleNotificationClick} />
                        <div className="user-profile">
                            <div className="user-icon" onClick={toggleDropdown}>
                                <FaUserCircle />
                            </div>
                            {dropdownOpen && (
                                <div className="user-dropdown">
                                <p>{user.email}</p>
                                <Link to="/messages" className="dropdown-item">
                                    <FaEnvelope className="dropdown-icon" /> Messages
                                </Link>
                                <Link to="/profile" className="dropdown-item">
                                    <FaUserCircle className="dropdown-icon" /> Profile
                                </Link>
                                <Link to="/my-courses" className="dropdown-item">
                                    <FaBook className="dropdown-icon" /> My Courses
                                </Link>

                                <Link to="/leaderboard" className="dropdown-item">
                                    <FaTrophy className="dropdown-icon" /> Leaderboard
                                </Link>
                                {isPremium(user) && (
                                    <Link to="/premium-ai" className="dropdown-item">
                                        🤖 Premium AI Assistant
                                    </Link>
                                )}
                                {(isAdmin(user) || isSuperAdmin(user)) && (
                                    <>
                                        <Link to="/admin" className="dropdown-item">
                                            <FaCog className="dropdown-icon" /> Admin Panel
                                        </Link>
                                        <Link to="/settings" className="dropdown-item">
                                            <FaSlidersH className="dropdown-icon" /> Settings
                                        </Link>
                                    </>
                                )}
                                <button onClick={logout} className="dropdown-item">
                                    <FaSignOutAlt className="dropdown-icon" /> Logout
                                </button>
                            </div>
                        )}
                    </div>
                    </>
                )}
            </div>

            {/* Mobile Menu */}
            <div className={`mobile-menu ${mobileMenuOpen ? 'active' : ''}`}>
                <button className="mobile-menu-close" onClick={toggleMobileMenu}>
                    <FaTimes />
                </button>
                <ul className="mobile-nav-links">
                    {!user && <li><Link to="/" onClick={toggleMobileMenu}>Home</Link></li>}
                    {user && <li><Link to="/community" onClick={toggleMobileMenu}>Community</Link></li>}
                    <li><Link to="/courses" onClick={toggleMobileMenu}>C & S</Link></li>
                    {!user && <li><Link to="/explore" onClick={toggleMobileMenu}>Explore</Link></li>}
                    {!user && <li><Link to="/why-glitch" onClick={toggleMobileMenu}>Why AURA FX</Link></li>}
                    <li><Link to="/contact" onClick={toggleMobileMenu}>Contact Us</Link></li>
                    {user && <li><Link to="/leaderboard" onClick={toggleMobileMenu}>Leaderboard</Link></li>}
                    {isPremium(user) && (
                        <li><Link to="/premium-ai" onClick={toggleMobileMenu}>🤖 Premium AI</Link></li>
                    )}
                    {user?.role?.toUpperCase() === "ADMIN" && (
                        <>
                            <li><Link to="/admin" onClick={toggleMobileMenu}>Admin Panel</Link></li>
                            <li><Link to="/admin/messages" onClick={toggleMobileMenu}><FaHeadset className="dropdown-icon" /> Contact Submissions</Link></li>
                        </>
                    )}
                </ul>
                <div className="mobile-buttons">
                    {!user ? (
                        <>
                            <button className="mobile-sign-in" onClick={() => window.location.href='/login'}>Sign In</button>
                            <button className="mobile-start-trading" onClick={() => window.location.href='/register'}>Sign Up</button>
                        </>
                    ) : (
                        <>
                            <button 
                                className="mobile-user-menu-toggle" 
                                onClick={toggleMobileUserMenu}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 16px',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                    borderRadius: '8px',
                                    color: '#ffffff',
                                    cursor: 'pointer',
                                    width: '100%',
                                    justifyContent: 'center'
                                }}
                            >
                                <FaUserCircle /> User Menu
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Mobile User Menu Dropdown */}
            {user && (
                <div className={`mobile-user-menu ${mobileUserMenuOpen ? 'active' : ''}`}>
                    <button className="mobile-user-menu-close" onClick={toggleMobileUserMenu}>
                        <FaTimes />
                    </button>
                    <div className="mobile-user-email">{user.email}</div>
                    <ul className="mobile-user-links">
                        <li><Link to="/messages" onClick={toggleMobileUserMenu}>
                            <FaEnvelope className="dropdown-icon" /> Messages
                        </Link></li>
                        <li><Link to="/profile" onClick={toggleMobileUserMenu}>
                            <FaUserCircle className="dropdown-icon" /> Profile
                        </Link></li>
                        <li><Link to="/my-courses" onClick={toggleMobileUserMenu}>
                            <FaBook className="dropdown-icon" /> My Courses
                        </Link></li>
                        <li><Link to="/leaderboard" onClick={toggleMobileUserMenu}>
                            <FaTrophy className="dropdown-icon" /> Leaderboard
                        </Link></li>
                        {(isAdmin(user) || isSuperAdmin(user)) && (
                            <>
                                <li><Link to="/admin" onClick={toggleMobileUserMenu}>
                                    <FaCog className="dropdown-icon" /> Admin Panel
                                </Link></li>
                                <li><Link to="/settings" onClick={toggleMobileUserMenu}>
                                    <FaSlidersH className="dropdown-icon" /> Settings
                                </Link></li>
                            </>
                        )}
                        <li><button onClick={() => { toggleMobileUserMenu(); logout(); }}>
                            <FaSignOutAlt className="dropdown-icon" /> Logout
                        </button></li>
                    </ul>
                </div>
            )}

        </nav>
    );
};

export default Navbar;
