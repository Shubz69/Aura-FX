import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/Navbar.css";
import "../styles/UserDropdown.css";
import {
  FaUserCircle,
  FaSignOutAlt,
  FaBook,
  FaTrophy,
  FaCog,
  FaHeadset,
  FaBars,
  FaTimes,
  FaEnvelope,
  FaSlidersH,
  FaChartLine,
  FaThLarge,
  FaCheckSquare,
  FaUsers,
  FaPhone,
  FaRobot,
} from "react-icons/fa";
import { isSuperAdmin, isAdmin, isPremium } from "../utils/roles";
import A7Logo from "./A7Logo";
import { triggerNotification } from "./NotificationSystem";
import NavbarNotifications from "./NavbarNotifications";

const Navbar = () => {
  const { user, loading, logout } = useAuth();
  const showSuperAdminLinks = !loading && user && isSuperAdmin(user);
  const navigate = useNavigate();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + "/");

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);
  const toggleDropdown = () => setDropdownOpen((prev) => !prev);
  const handleUserIconClick = (e) => { e.stopPropagation(); toggleDropdown(); };

  const dropdownPosition = {
    top: "calc(55px + env(safe-area-inset-top, 0) + 8px)",
    right: 16,
    left: "auto",
  };

  const auraAiHref = isPremium(user) ? "/premium-ai" : "/subscription";
  const auraAiLabel = "Aura AI";

  // ── Mobile full-screen menu (portalled to body)
  const mobileMenuPortal = ReactDOM.createPortal(
    <div className={`mobile-menu ${mobileMenuOpen ? "active" : ""}`}>
      <button className="mobile-menu-close" onClick={closeMobileMenu} aria-label="Close menu">
        <FaTimes />
      </button>

      {user ? (
        <>
          <div className="mobile-user-email">{user.email}</div>
          <ul className="mobile-nav-links">
            {/* PRIMARY NAV — required order */}
            <li><Link to="/trader-deck" onClick={closeMobileMenu}><FaThLarge className="dropdown-icon" /> Trader Desk</Link></li>
            <li><Link to="/journal" onClick={closeMobileMenu}><FaBook className="dropdown-icon" /> Journal</Link></li>
            <li><Link to="/trader-deck/trade-validator" onClick={closeMobileMenu}><FaCheckSquare className="dropdown-icon" /> Trade Validator</Link></li>
            <li><Link to="/aura-analysis" onClick={closeMobileMenu}><FaChartLine className="dropdown-icon" /> Aura Analysis</Link></li>
            {/* Aura AI — ALWAYS visible on mobile */}
            <li>
              <Link to={auraAiHref} onClick={closeMobileMenu} className="mobile-aura-ai-link">
                <FaRobot className="dropdown-icon" /> {auraAiLabel}
              </Link>
            </li>
            {/* SECONDARY NAV */}
            <li><Link to="/profile" onClick={closeMobileMenu}><FaUserCircle className="dropdown-icon" /> Profile</Link></li>
            <li><Link to="/leaderboard" onClick={closeMobileMenu}><FaTrophy className="dropdown-icon" /> Leaderboard</Link></li>
            <li><Link to="/community" onClick={closeMobileMenu}><FaUsers className="dropdown-icon" /> Community</Link></li>
            <li><Link to="/admin/inbox" onClick={closeMobileMenu}><FaEnvelope className="dropdown-icon" /> Messages</Link></li>
            <li><Link to="/contact" onClick={closeMobileMenu}><FaPhone className="dropdown-icon" /> Contact Us</Link></li>
            {(isAdmin(user) || isSuperAdmin(user)) && (
              <li><Link to="/settings" onClick={closeMobileMenu}><FaSlidersH className="dropdown-icon" /> Settings</Link></li>
            )}
            {showSuperAdminLinks && (
              <>
                <li><Link to="/admin" onClick={closeMobileMenu}><FaCog className="dropdown-icon" /> Admin Panel</Link></li>
                <li><Link to="/admin/messages" onClick={closeMobileMenu}><FaHeadset className="dropdown-icon" /> Contact Submissions</Link></li>
              </>
            )}
          </ul>
          <div className="mobile-buttons">
            <button className="mobile-sign-in" onClick={() => { logout(); closeMobileMenu(); }}>
              <FaSignOutAlt style={{ marginRight: 8 }} /> Logout
            </button>
          </div>
        </>
      ) : (
        <>
          <ul className="mobile-nav-links">
            <li><Link to="/" onClick={closeMobileMenu}>Home</Link></li>
            <li><Link to="/courses" onClick={closeMobileMenu}>C &amp; S</Link></li>
            <li><Link to="/explore" onClick={closeMobileMenu}>Explore</Link></li>
            <li><Link to="/why-glitch" onClick={closeMobileMenu}>Why Aura FX</Link></li>
            <li><Link to="/contact" onClick={closeMobileMenu}>Contact Us</Link></li>
          </ul>
          <div className="mobile-buttons">
            <button className="mobile-sign-in" onClick={() => { navigate("/login"); closeMobileMenu(); }}>Sign In</button>
            <button className="mobile-start-trading" onClick={() => { navigate("/register"); closeMobileMenu(); }}>Sign Up</button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );

  return (
    <>
      <nav className="navbar">
        {/* Logo */}
        <div className="logo-container">
          <Link to="/" className="logo-link">
            <div className="navbar-logo-wrapper">
              <A7Logo />
              <span className="logo">AURA TERMINAL</span>
            </div>
          </Link>
        </div>

        {/* Desktop Nav Links */}
        <ul className="nav-links">
          {user ? (
            <>
              <li><Link to="/trader-deck" className={isActive("/trader-deck") && !isActive("/trader-deck/trade-validator") ? "active" : ""}>Trader Desk</Link></li>
              <li><Link to="/journal" className={isActive("/journal") ? "active" : ""}>Journal</Link></li>
              <li><Link to="/trader-deck/trade-validator" className={isActive("/trader-deck/trade-validator") ? "active" : ""}>Trade Validator</Link></li>
              <li><Link to="/aura-analysis" className={isActive("/aura-analysis") ? "active" : ""}>Aura Analysis</Link></li>
              {/* Aura AI — always in desktop nav */}
              <li>
                <Link to={auraAiHref} className={`nav-aura-ai${isActive("/premium-ai") ? " active" : ""}`}>
                  🤖 Aura AI
                </Link>
              </li>
            </>
          ) : (
            <>
              <li><Link to="/">Home</Link></li>
              <li><Link to="/courses">C &amp; S</Link></li>
              <li><Link to="/explore">Explore</Link></li>
              <li><Link to="/why-glitch">Why Aura FX</Link></li>
              <li><Link to="/contact">Contact Us</Link></li>
            </>
          )}
        </ul>

        {/* Right side: notifications + hamburger (mobile) + user icon (desktop) */}
        <div className="nav-buttons">
          {!user ? (
            <div className="desktop-only" style={{ display: "flex", gap: "8px" }}>
              <button className="sign-in" onClick={() => navigate("/login")}>Sign In</button>
              <button className="start-trading" onClick={() => navigate("/register")}>Sign Up</button>
            </div>
          ) : (
            <>
              <div className="notifications-wrapper">
                <NavbarNotifications />
              </div>
              {/* Desktop user dropdown */}
              <div className="user-profile desktop-only">
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
                    <div className="user-dropdown" onClick={(e) => e.stopPropagation()} style={dropdownPosition}>
                      <p>{user.email}</p>
                      <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaUserCircle className="dropdown-icon" /> Profile
                      </Link>
                      <Link to="/leaderboard" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaTrophy className="dropdown-icon" /> Leaderboard
                      </Link>
                      <Link to="/community" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaUsers className="dropdown-icon" /> Community
                      </Link>
                      <Link to="/admin/inbox" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaEnvelope className="dropdown-icon" /> Messages
                      </Link>
                      <Link to="/contact" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaPhone className="dropdown-icon" /> Contact Us
                      </Link>
                      {(isAdmin(user) || isSuperAdmin(user)) && (
                        <Link to="/settings" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                          <FaSlidersH className="dropdown-icon" /> Settings
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
                      <button onClick={() => { setDropdownOpen(false); logout(); }} className="dropdown-item">
                        <FaSignOutAlt className="dropdown-icon" /> Logout
                      </button>
                    </div>
                  </div>,
                  document.body,
                )}
              </div>
            </>
          )}
          {/* Hamburger — mobile only */}
          <button className="mobile-menu-toggle" onClick={() => setMobileMenuOpen((p) => !p)} aria-label="Toggle menu">
            {mobileMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
      </nav>

      {mobileMenuPortal}
    </>
  );
};

export default React.memo(Navbar);