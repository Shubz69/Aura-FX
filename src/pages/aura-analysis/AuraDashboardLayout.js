import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import '../../styles/aura-analysis/AuraDashboard.css';

const TABS = [
  { path: 'overview',      label: 'Overview',      icon: 'fa-th-large' },
  { path: 'performance',   label: 'Performance',   icon: 'fa-chart-line' },
  { path: 'risk-lab',      label: 'Risk Lab',      icon: 'fa-shield-alt' },
  { path: 'edge-analyzer', label: 'Edge Analyzer', icon: 'fa-bolt' },
  { path: 'execution-lab', label: 'Execution Lab', icon: 'fa-rocket' },
  { path: 'calendar',      label: 'Calendar',      icon: 'fa-calendar-alt' },
  { path: 'growth',        label: 'Growth',        icon: 'fa-seedling' },
];

const base = '/aura-analysis/dashboard';

function getActiveLabel(pathname) {
  const match = TABS.find(t => pathname.includes(`/dashboard/${t.path}`));
  return match ? match.label : 'Dashboard';
}

export default function AuraDashboardLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const [notifOpen, setNotifOpen] = useState(false);
  const [time, setTime] = useState(new Date());

  const displayName = user?.displayName || user?.username || user?.name || 'Admin';
  const xp = user?.xp || user?.experience || 0;
  const avatar = user?.avatar || user?.profilePicture || null;
  const initial = displayName.charAt(0).toUpperCase();
  const activeLabel = getActiveLabel(location.pathname);

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = time.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="aura-dashboard">

      {/* ══ Primary Tab Header ══ */}
      <div className="aura-dashboard-tabs-wrap">
        <div className="aura-dashboard-tabs-inner">

          {/* Brand */}
          <Link to="/aura-analysis/ai" className="aura-dashboard-brand" title="Back to Connection Hub">
            <span className="aura-db-brand-slash">/</span>
            <span className="aura-db-brand-name">AURA FX</span>
          </Link>

          {/* Tab Nav */}
          <nav className="aura-dashboard-tabs" aria-label="MT5 Dashboard sections">
            {TABS.map(({ path, label, icon }) => (
              <NavLink
                key={path}
                to={`${base}/${path}`}
                className={({ isActive }) => `aura-dashboard-tab${isActive ? ' active' : ''}`}
                end={path === 'overview'}
              >
                <i className={`fas ${icon}`} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Right controls */}
          <div className="aura-db-right">
            <div className="aura-db-clock">
              <span className="aura-db-time">{timeStr}</span>
              <span className="aura-db-date">{dateStr}</span>
            </div>
            <button
              className={`aura-db-icon-btn${notifOpen ? ' active' : ''}`}
              title="Notifications"
              onClick={() => setNotifOpen(v => !v)}
              aria-label="Notifications"
            >
              <i className="fas fa-bell" />
              <span className="aura-db-notif-dot" />
            </button>
            <div className="aura-db-user">
              <div className="aura-db-avatar">
                {avatar
                  ? <img src={avatar} alt={displayName} />
                  : <span>{initial}</span>
                }
                <span className="aura-db-avatar-ring" />
              </div>
              <div className="aura-db-user-info">
                <span className="aura-db-user-name">{displayName}</span>
                <span className="aura-db-xp">
                  {xp.toLocaleString()} <span className="aura-db-xp-gem">◆</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ Page sub-header ══ */}
      <div className="aura-db-subheader">
        <div className="aura-db-subheader-inner">
          <div className="aura-db-page-title">
            <span className="aura-db-page-icon">
              <i className={`fas ${TABS.find(t => location.pathname.includes(t.path))?.icon || 'fa-th-large'}`} />
            </span>
            {activeLabel}
          </div>
          <div className="aura-db-sub-tabs">
            {TABS.map(({ path, label }) => (
              <NavLink
                key={path}
                to={`${base}/${path}`}
                className={({ isActive }) => `aura-db-sub-tab${isActive ? ' active' : ''}`}
                end={path === 'overview'}
              >
                {label}
              </NavLink>
            ))}
          </div>
          <div className="aura-db-sub-right">
            <div className="aura-db-status-dot" title="Live data" />
            <span className="aura-db-status-label">Live</span>
          </div>
        </div>
      </div>

      {/* ══ Content ══ */}
      <main className="aura-dashboard-content">
        <Outlet />
      </main>
    </div>
  );
}
