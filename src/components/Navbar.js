import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/Navbar.css";
import "../styles/UserDropdown.css";
import { FaUserCircle, FaSignOutAlt, FaBook, FaTrophy, FaCog, FaHeadset, FaBars, FaTimes, FaEnvelope, FaSlidersH, FaChartLine } from 'react-icons/fa';
import { isSuperAdmin, isAdmin, isPremium } from '../utils/roles';
import A7Logo from './A7Logo';
import { triggerNotification } from './NotificationSystem';
import NavbarNotifications from './NavbarNotifications';

const Navbar = () => {
    const { user, loading, logout } = useAuth();
    const showSuperAdminLinks = !loading && user && isSuperAdmin(user);
    const navigate = useNavigate();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [mobileUserMenuOpen, setMobileUserMenuOpen] = useState(false);

    // Lock body scroll when mobile menu is open
    useEffect(() => {
        if (mobileMenuOpen || mobileUserMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [mobileMenuOpen, mobileUserMenuOpen]);

    const toggleDropdown = () => setDropdownOpen(prev => !prev);

    const handleUserIconClick = (e) => {
        e.stopPropagation();
        toggleDropdown();
    };

    const dropdownPosition = {
        top: 'calc(55px + env(safe-area-inset-top, 0) + 8px)',
        right: 16,
        left: 'auto'
    };

    const toggleMobileMenu = () => {
        setMobileMenuOpen(prev => !prev);
        setMobileUserMenuOpen(false);
    };

    const toggleMobileUserMenu = () => {
        setMobileUserMenuOpen(prev => !prev);
        setMobileMenuOpen(false);
    };

    const closeMobileMenu = () => {
        setMobileMenuOpen(false);
        setMobileUserMenuOpen(false);
    };

// ── Mobile full-screen menu — portalled to body so navbar clipping can't affect it
const mobileMenuPortal = ReactDOM.createPortal(
    <div style={{ position: 'contents' }}>
        {/* Mobile Nav Menu */}
        <div className={`mobile-menu ${mobileMenuOpen ? 'active' : ''}`}>
            <button className="mobile-menu-close" onClick={closeMobileMenu}>
                <FaTimes />
            </button>
            <ul className="mobile-nav-links">
                {!user && <li><Link to="/" onClick={closeMobileMenu}>Home</Link></li>}
                {user && <li><Link to="/community" onClick={closeMobileMenu}>Community</Link></li>}
                <li><Link to="/courses" onClick={closeMobileMenu}>C & S</Link></li>
                {!user && <li><Link to="/explore" onClick={closeMobileMenu}>Explore</Link></li>}
                {!user && <li><Link to="/why-glitch" onClick={closeMobileMenu}>Why AURA FX</Link></li>}
                <li><Link to="/contact" onClick={closeMobileMenu}>Contact Us</Link></li>
                {user && <li><Link to="/leaderboard" onClick={closeMobileMenu}>Leaderboard</Link></li>}
                {user && isPremium(user) && (
                    <li><Link to="/premium-ai" onClick={closeMobileMenu}>🤖 Premium AI</Link></li>
                )}
            </ul>
            <div className="mobile-buttons">
                {!user ? (
                    <>
                        <button className="mobile-sign-in" onClick={() => { navigate('/login'); closeMobileMenu(); }}>Sign In</button>
                        <button className="mobile-start-trading" onClick={() => { navigate('/register'); closeMobileMenu(); }}>Sign Up</button>
                    </>
                ) : (
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
                )}
            </div>
        </div>

        {/* Mobile User Slide-out Menu */}
        {user && (
            <div className={`mobile-user-menu ${mobileUserMenuOpen ? 'active' : ''}`}>
                <button className="mobile-user-menu-close" onClick={toggleMobileUserMenu}>
                    <FaTimes />
                </button>
                <div className="mobile-user-email">{user.email}</div>
                <ul className="mobile-user-links">
                    <li>
                        <Link to="/aura-analysis" onClick={closeMobileMenu}>
                            <FaChartLine className="dropdown-icon" /> Aura Analysis
                        </Link>
                    </li>
                    <li>
                        <Link to={isAdmin(user) ? "/admin/inbox" : "/messages"} onClick={closeMobileMenu}>
                            <FaEnvelope className="dropdown-icon" /> Messages
                        </Link>
                    </li>
                    <li>
                        <Link to="/journal" onClick={closeMobileMenu}>
                            <FaBook className="dropdown-icon" /> Journal
                        </Link>
                    </li>
                    <li>
                        <Link to="/profile" onClick={closeMobileMenu}>
                            <FaUserCircle className="dropdown-icon" /> Profile
                        </Link>
                    </li>
                    <li>
                        <Link to="/leaderboard" onClick={closeMobileMenu}>
                            <FaTrophy className="dropdown-icon" /> Leaderboard
                        </Link>
                    </li>
                    {showSuperAdminLinks && (
                        <>
                            <li>
                                <Link to="/admin" onClick={closeMobileMenu}>
                                    <FaCog className="dropdown-icon" /> Admin Panel
                                </Link>
                            </li>
                            <li>
                                <Link to="/admin/messages" onClick={closeMobileMenu}>
                                    <FaHeadset className="dropdown-icon" /> Contact Submissions
                                </Link>
                            </li>
                        </>
                    )}
                    {(isAdmin(user) || isSuperAdmin(user)) && (
                        <>
                            <li>
                                <Link to="/admin/journal" onClick={closeMobileMenu}>
                                    Journal Progress
                                </Link>
                            </li>
                            <li>
                                <Link to="/settings" onClick={closeMobileMenu}>
                                    <FaSlidersH className="dropdown-icon" /> Settings
                                </Link>
                            </li>
                        </>
                    )}
                    <li>
                        <button onClick={() => { closeMobileMenu(); logout(); }}>
                            <FaSignOutAlt className="dropdown-icon" /> Logout
                        </button>
                    </li>
                </ul>
            </div>
        )}
    </div>,
    document.body
);
    return (
        <>
            <nav className="navbar">
                {/* Logo */}
                <div className="logo-container">
                    <Link to="/" className="logo-link">
                        <div className="navbar-logo-wrapper">
                            <A7Logo />
                            <span className="logo">AURA FX</span>
                        </div>
                    </Link>
                </div>

                {/* Hamburger — only visible on mobile/tablet */}
                <button className="mobile-menu-toggle" onClick={toggleMobileMenu} aria-label="Toggle menu">
                    {mobileMenuOpen ? <FaTimes /> : <FaBars />}
                </button>

                {/* Desktop Nav Links */}
                <ul className="nav-links">
                    {!user && <li><Link to="/">Home</Link></li>}
                    {user && <li><Link to="/community">Community</Link></li>}
                    <li><Link to="/courses">C & S</Link></li>
                    {!user && <li><Link to="/explore">Explore</Link></li>}
                    {!user && <li><Link to="/why-glitch">Why Aura FX</Link></li>}
                    <li><Link to="/contact">Contact Us</Link></li>
                    {user && <li><Link to="/leaderboard">Leaderboard</Link></li>}
                </ul>

                {/* Desktop Buttons / User Profile */}
                <div className="nav-buttons">
                    {!user ? (
                        <>
                            <button className="sign-in" onClick={() => navigate('/login')}>Sign In</button>
                            <button className="start-trading" onClick={() => navigate('/register')}>Sign Up</button>
                        </>
                    ) : (
                        <>
                            <NavbarNotifications />
                            <div className="user-profile">
                                <button
                                    type="button"
                                    className="user-icon"
                                    onClick={handleUserIconClick}
                                    aria-expanded={dropdownOpen}
                                    aria-haspopup="true"
                                    aria-label="User menu"
                                >
                                    <FaUserCircle />
                                </button>

                                {dropdownOpen && ReactDOM.createPortal(
                                    <div className="user-dropdown-overlay" onClick={() => setDropdownOpen(false)}>
                                        <div
                                            className="user-dropdown"
                                            onClick={(e) => e.stopPropagation()}
                                            style={dropdownPosition}
                                        >
                                            <p>{user.email}</p>
                                            <Link to="/aura-analysis" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                <FaChartLine className="dropdown-icon" /> Aura Analysis
                                            </Link>
                                            <Link to={isAdmin(user) ? "/admin/inbox" : "/messages"} className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                <FaEnvelope className="dropdown-icon" /> Messages
                                            </Link>
                                            <Link to="/journal" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                <FaBook className="dropdown-icon" /> Journal
                                            </Link>
                                            <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                <FaUserCircle className="dropdown-icon" /> Profile
                                            </Link>
                                            <Link to="/leaderboard" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                <FaTrophy className="dropdown-icon" /> Leaderboard
                                            </Link>
                                            {isPremium(user) && (
                                                <Link to="/premium-ai" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                    🤖 Premium AI Assistant
                                                </Link>
                                            )}
                                            {showSuperAdminLinks && (
                                                <>
                                                    <Link to="/admin" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                        <FaCog className="dropdown-icon" /> Admin Panel
                                                    </Link>
                                                    <Link to="/admin/messages" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                        <FaHeadset className="dropdown-icon" /> Contact Submissions
                                                    </Link>
                                                </>
                                            )}
                                            {(isAdmin(user) || isSuperAdmin(user)) && (
                                                <>
                                                    <Link to="/admin/journal" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                        Journal Progress
                                                    </Link>
                                                    <Link to="/settings" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                                                        <FaSlidersH className="dropdown-icon" /> Settings
                                                    </Link>
                                                </>
                                            )}
                                            <button onClick={() => { setDropdownOpen(false); logout(); }} className="dropdown-item">
                                                <FaSignOutAlt className="dropdown-icon" /> Logout
                                            </button>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </>
                    )}
                </div>
            </nav>

            {/* Portal: mobile menus rendered directly into body — escapes navbar clipping */}
            {mobileMenuPortal}
        </>
    );
};

export default React.memo(Navbar);