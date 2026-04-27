
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useAuth } from "../context/AuthContext";
import { useEntitlements } from "../context/EntitlementsContext";
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
  FaBook,
  FaThLarge,
  FaCheckSquare,
  FaChartLine,
  FaLink,
  FaFileAlt,
  FaHeartbeat,
  FaHistory,
  FaGlobe,
  FaProjectDiagram,
} from "react-icons/fa";
import { isSuperAdmin, isAdmin, isPremium } from "../utils/roles";
import A7Logo from "./A7Logo";
import { triggerNotification } from "./NotificationSystem";
import NavbarNotifications from "./NavbarNotifications";
const isLocalDev = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1' ||
   window.location.hostname.startsWith('192.168.') ||
   window.location.hostname.startsWith('10.') ||
   window.location.hostname.endsWith('.local'));
const Navbar = () => {
  const { t } = useTranslation();
  const { user, loading, logout } = useAuth();
  const { entitlements } = useEntitlements();
  const showSuperAdminLinks = !loading && user && isSuperAdmin(user);
  /** Admin Panel dropdown group: admins + super admins (incl. email-listed super admins). */
  const showAdminNavGroup = !loading && user && (isAdmin(user) || isSuperAdmin(user));
  const showPipelineNav = !loading && user && isSuperAdmin(user);
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
      <button className="mobile-menu-close" onClick={closeMobileMenu} aria-label={t('navbar.closeMenu')}>
        <FaTimes />
      </button>

      {user ? (
        <>
          <p className="mobile-menu-section-label">{t('navbar.menu')}</p>
          <ul className="mobile-nav-links mobile-nav-links-primary">
            <li><Link to="/" onClick={closeMobileMenu} className={location.pathname === '/' ? 'active' : ''}>{t('navbar.home')}</Link></li>
            <li><Link to="/community" onClick={closeMobileMenu} className={isActive('/community') ? 'active' : ''}>{t('navbar.network')}</Link></li>
            <li>
              <Link
                to={auraAiHref}
                onClick={closeMobileMenu}
                className={isActive('/premium-ai') || isActive('/subscription') ? 'active' : ''}
              >
                Aura AI
              </Link>
            </li>
            <li><Link to="/courses" onClick={closeMobileMenu} className={isActive('/courses') ? 'active' : ''}>C &amp; S</Link></li>
            <li><Link to="/leaderboard" onClick={closeMobileMenu} className={isActive('/leaderboard') ? 'active' : ''}>{t('navbar.leaderboard')}</Link></li>
          </ul>
          <p className="mobile-menu-account-hint">
            Tap the <strong>profile icon</strong> (next to the bell) for Trader Desk, Journal, Profile, Settings &amp; more — same menu as desktop.
          </p>
        </>
      ) : (
        <>
          <ul className="mobile-nav-links">
            <li><Link to="/" onClick={closeMobileMenu}>{t('navbar.home')}</Link></li>
            <li><Link to="/courses" onClick={closeMobileMenu}>C &amp; S</Link></li>
            <li><Link to="/explore" onClick={closeMobileMenu}>{t('navbar.explore')}</Link></li>
            <li><Link to="/why-glitch" onClick={closeMobileMenu}>{t('navbar.whyAura')}</Link></li>
            <li><Link to="/contact" onClick={closeMobileMenu}>{t('navbar.contactUs')}</Link></li>
          </ul>
          <div className="mobile-buttons">
            <button className="mobile-sign-in" onClick={() => { navigate("/login"); closeMobileMenu(); }}>{t('navbar.signIn')}</button>
            <button className="mobile-start-trading" onClick={() => { navigate("/register"); closeMobileMenu(); }}>{t('navbar.signUp')}</button>
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
              <span className="navbar-wordmark" aria-label="Aura Terminal™">
                <span className="navbar-wordmark-aura">AURA</span>
                <span className="navbar-wordmark-terminal">
                  TERMINAL<sup className="navbar-wordmark-tm">TM</sup>
                </span>
              </span>
            </div>
          </Link>
        </div>

        {/* Desktop Nav Links */}
        <ul className="nav-links">
          {user ? (
            <>
              <li><Link to="/" className={location.pathname === "/" ? "active" : ""}>{t('navbar.home')}</Link></li>
              <li><Link to="/community" className={isActive("/community") ? "active" : ""}>{t('navbar.network')}</Link></li>
              <li>
                <Link
                  to={auraAiHref}
                  className={isActive("/premium-ai") || isActive("/subscription") ? "active" : ""}
                >
                  Aura AI
                </Link>
              </li>
              <li><Link to="/courses" className={isActive("/courses") ? "active" : ""}>C &amp; S</Link></li>
              <li><Link to="/leaderboard" className={isActive("/leaderboard") ? "active" : ""}>{t('navbar.leaderboard')}</Link></li>
            </>
          ) : (
            <>
              <li><Link to="/">{t('navbar.home')}</Link></li>
              <li><Link to="/courses">C &amp; S</Link></li>
              <li><Link to="/explore">{t('navbar.explore')}</Link></li>
              <li><Link to="/why-glitch">{t('navbar.whyAura')}</Link></li>
              <li><Link to="/contact">{t('navbar.contactUs')}</Link></li>
            </>
          )}
        </ul>

        {/* Right side: notifications + hamburger (mobile) + user icon (desktop) */}
        <div className="nav-buttons">
          {!user ? (
            <div className="desktop-only" style={{ display: "flex", gap: "8px" }}>
              <button className="sign-in" onClick={() => navigate("/login")}>{t('navbar.signIn')}</button>
              <button className="start-trading" onClick={() => navigate("/register")}>{t('navbar.signUp')}</button>
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
                  aria-label={t('navbar.userMenu')}
                >
                  <FaUserCircle />
                </button>
                {dropdownOpen && ReactDOM.createPortal(
                  <div className="user-dropdown-overlay" onClick={() => setDropdownOpen(false)}>
                    <div className="user-dropdown" onClick={(e) => e.stopPropagation()} style={dropdownPosition}>
                      {/* Prefer username for user-facing identity; fall back to name/email if missing. */}
                      <p>{user?.username || user?.name || user?.email}</p>
                      <Link to="/trader-deck" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaThLarge className="dropdown-icon" /> {t('navbar.traderDesk')}
                      </Link>
                      <Link to="/journal" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaBook className="dropdown-icon" /> {t('navbar.journal')}
                      </Link>
                   <Link to="/operator-galaxy" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
  <FaCheckSquare className="dropdown-icon" /> The Operator
</Link>
           {isLocalDev || entitlements?.canAccessSurveillance ? (
  <Link to="/surveillance" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
    <FaGlobe className="dropdown-icon" /> Surveillance
    {isLocalDev && !entitlements?.canAccessSurveillance && (
      <span className="dropdown-dev-badge" style={{
        background: '#ff9800',
        color: '#000',
        fontSize: '9px',
        padding: '1px 4px',
        borderRadius: '3px',
        marginLeft: '8px',
        fontWeight: 'bold'
      }}>DEV</span>
    )}
  </Link>
) : (
  <button
    type="button"
    className="dropdown-item dropdown-item--locked"
    title="Surveillance is included with Elite (active Elite/A7FX billing) or Admin / Super Admin accounts."
    onClick={() => {
      setDropdownOpen(false);
      navigate('/choose-plan', { state: { feature: 'surveillance' } });
    }}
  >
    <FaGlobe className="dropdown-icon" /> Surveillance
    <span className="dropdown-lock-label" aria-hidden>Locked</span>
  </button>
)}
                      <Link to="/aura-analysis" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaChartLine className="dropdown-icon" /> Aura Analysis
                      </Link>
                      <Link to="/backtesting" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaHistory className="dropdown-icon" /> Backtesting
                      </Link>
                      {isPremium(user) && (
                        <>
                          <Link to="/reports" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                            <FaFileAlt className="dropdown-icon" /> Performance & DNA
                          </Link>
                        </>
                      )}
                      <Link to="/profile" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaUserCircle className="dropdown-icon" /> {t('navbar.profile')}
                      </Link>
                      <Link to="/admin/inbox" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaEnvelope className="dropdown-icon" /> {t('navbar.messages')}
                      </Link>
                      <Link to="/affiliation" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                        <FaLink className="dropdown-icon" /> Affiliation
                      </Link>
                      {showAdminNavGroup && (
                        <>
                          <Link to="/admin" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                            <FaCog className="dropdown-icon" /> Admin Panel
                          </Link>
                          <Link
                            to="/admin/integration-health"
                            className="dropdown-item dropdown-item--nested"
                            onClick={() => setDropdownOpen(false)}
                          >
                            <FaHeartbeat className="dropdown-icon" /> Integration health
                          </Link>
                          {showPipelineNav && (
                            <Link
                              to="/admin/pipeline-health"
                              className="dropdown-item dropdown-item--nested"
                              onClick={() => setDropdownOpen(false)}
                            >
                              <FaProjectDiagram className="dropdown-icon" /> Pipeline Monitor
                            </Link>
                          )}
                        </>
                      )}
                      {showSuperAdminLinks && (
                        <>
                          <Link to="/settings" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                            <FaSlidersH className="dropdown-icon" /> {t('navbar.settings')}
                          </Link>
                          <Link to="/admin/messages" className="dropdown-item" onClick={() => setDropdownOpen(false)}>
                            <FaHeadset className="dropdown-icon" /> Contact Submissions
                          </Link>
                        </>
                      )}
                      <button onClick={() => { setDropdownOpen(false); logout(); }} className="dropdown-item">
                        <FaSignOutAlt className="dropdown-icon" /> {t('navbar.logout')}
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
            aria-label={t('navbar.toggleMenu')}
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