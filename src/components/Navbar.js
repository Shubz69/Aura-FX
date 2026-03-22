import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/Navbar.css";
import "../styles/UserDropdown.css";
import {
  FaUserCircle,
  FaSignOutAlt,
  FaTrophy,
  FaCog,
  FaHeadset,
  FaBars,
  FaTimes,
  FaEnvelope,
  FaSlidersH,
  FaUsers,
  FaPhone,
  FaRobot,
  FaBook,
  FaThLarge,
  FaCheckSquare,
  FaChartLine,
  FaLink,
  FaFileAlt,
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
  const handleUserIconClick = (e) => {
    e.stopPropagation();
    setMobileMenuOpen(false);
    toggleDropdown();
  };

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
          <p className="mobile-menu-section-label">Menu</p>
          <ul className="mobile-nav-links mobile-nav-links-primary">
            <li><Link to="/" onClick={closeMobileMenu} className={location.pathname === '/' ? 'active' : ''}>Home</Link></li>
            <li><Link to="/community" onClick={closeMobileMenu} className={isActive('/community') ? 'active' : ''}>Community</Link></li>
            <li>
              <Link to={auraAiHref} onClick={closeMobileMenu} className={`mobile-aura-ai-link${isActive('/premium-ai') ? ' active' : ''}`}>
                Aura AI
              </Link>
            </li>
            <li><Link to="/courses" onClick={closeMobileMenu} className={isActive('/courses') ? 'active' : ''}>C &amp; S</Link></li>
            <li><Link to="/leaderboard" onClick={closeMobileMenu} className={isActive('/leaderboard') ? 'active' : ''}>Leaderboard</Link></li>
          </ul>
          <p className="mobile-menu-account-hint">
            Tap the <strong>profile icon</strong> (next to the bell) for Trader Desk, Journal, Profile, Settings &amp; more — same menu as desktop.
          </p>
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
              <li><Link to="/" className={location.pathname === "/" ? "active" : ""}>Home</Link></li>
              <li><Link to="/community" className={isActive("/community") ? "active" : ""}>Community</Link></li>
              <li>
                <Link to={auraAiHref} className={`nav-aura-ai${isActive("/premium-ai") ? " active" : ""}`}>
                  🤖 Aura AI
                </Link>
              </li>
              <li><Link to="/courses" className={isActive("/courses") ? "active" : ""}>C &amp; S</Link></li>
              <li><Link to="/leaderboard" className={isActive("/leaderboard") ? "active" : ""}>Leaderboard</Link></li>
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
              <div className="user-profile user-profile-always">
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
                      <Link to="/trader-deck" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaThLarge className="dropdown-icon" /> Trader Desk
                      </Link>
                      <Link to="/journal" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaBook className="dropdown-icon" /> Journal
                      </Link>
                      <Link to="/trader-deck/trade-validator/overview" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaCheckSquare className="dropdown-icon" /> Trade Validator
                      </Link>
                      <Link to="/aura-analysis" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaChartLine className="dropdown-icon" /> Aura Analysis
                      </Link>
                      {isPremium(user) && (
                        <Link to="/reports" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                          <FaFileAlt className="dropdown-icon" /> Monthly Reports / DNA
                        </Link>
                      )}
                      <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaUserCircle className="dropdown-icon" /> Profile
                      </Link>
                      <Link to="/admin/inbox" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaEnvelope className="dropdown-icon" /> Messages
                      </Link>
                      <Link to="/affiliation" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaLink className="dropdown-icon" /> Affiliation
                      </Link>
                      {showSuperAdminLinks && (
                        <>
                          <Link to="/admin" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                            <FaCog className="dropdown-icon" /> Admin Panel
                          </Link>
                          <Link to="/settings" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                            <FaSlidersH className="dropdown-icon" /> Settings
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
          <button
            className="mobile-menu-toggle"
            onClick={() => {
              setDropdownOpen(false);
              setMobileMenuOpen((p) => !p);
            }}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <FaTimes /> : <FaBars />}
          </button>
        </div>
      </nav>

      {mobileMenuPortal}
    </>
  );
};

export default React.memo(Navbar);