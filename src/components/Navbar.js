import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/Navbar.css";
import "../styles/UserDropdown.css";
import { FaUserCircle, FaSignOutAlt, FaBook, FaTrophy, FaCog, FaHeadset, FaBars, FaTimes, FaEnvelope, FaSlidersH } from 'react-icons/fa';
import { isSuperAdmin, isAdmin } from '../utils/roles';

const Navbar = () => {
    const { user, logout } = useAuth();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const toggleDropdown = () => {
        setDropdownOpen(!dropdownOpen);
    };

    const toggleMobileMenu = () => {
        setMobileMenuOpen(!mobileMenuOpen);
    };

    return (
        <nav className="navbar">
            <div className="logo-container">
                <Link to="/" className="logo-link">
                    <span className="logo">THE GLITCH</span>
                </Link>
            </div>

            <button className="mobile-menu-toggle" onClick={toggleMobileMenu}>
                {mobileMenuOpen ? <FaTimes /> : <FaBars />}
            </button>

            <ul className={`nav-links ${mobileMenuOpen ? 'show' : ''}`}>
                {!user && <li><Link to="/">Home</Link></li>}
                {user && <li><Link to="/community">Community</Link></li>}
                <li><Link to="/courses">Courses</Link></li>
                {!user && <li><Link to="/explore">Explore</Link></li>}
                {!user && <li><Link to="/why-glitch">Why Glitch</Link></li>}
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
                    <li><Link to="/courses" onClick={toggleMobileMenu}>Courses</Link></li>
                    {!user && <li><Link to="/explore" onClick={toggleMobileMenu}>Explore</Link></li>}
                    {!user && <li><Link to="/why-glitch" onClick={toggleMobileMenu}>Why Glitch</Link></li>}
                    <li><Link to="/contact" onClick={toggleMobileMenu}>Contact Us</Link></li>
                    {user && <li><Link to="/leaderboard" onClick={toggleMobileMenu}>Leaderboard</Link></li>}
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
                        <button onClick={logout} className="mobile-sign-in">
                            <FaSignOutAlt className="dropdown-icon" /> Logout
                        </button>
                    )}
                </div>
            </div>

        </nav>
    );
};

export default Navbar;
