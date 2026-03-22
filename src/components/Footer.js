import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "../styles/Footer.css";

/** Build-time / env: REACT_APP_MAINTENANCE_MODE=true | REACT_APP_SYSTEM_STATUS=operational|maintenance|down */
function getForcedSystemState() {
  if (process.env.REACT_APP_MAINTENANCE_MODE === "true") {
    return { mode: "maintenance", label: "Maintenance in progress" };
  }
  const raw = (process.env.REACT_APP_SYSTEM_STATUS || "operational")
    .toLowerCase()
    .trim();
  if (raw === "maintenance" || raw === "maint") {
    return { mode: "maintenance", label: "Maintenance in progress" };
  }
  if (raw === "down" || raw === "offline" || raw === "outage" || raw === "unavailable") {
    return { mode: "down", label: "Service disruption" };
  }
  return null;
}

const Footer = React.memo(function Footer() {
  const forced = useMemo(() => getForcedSystemState(), []);
  const healthCheckOn = process.env.REACT_APP_FOOTER_HEALTH_CHECK === "true";
  const healthUrl = useMemo(() => {
    const custom = process.env.REACT_APP_FOOTER_HEALTH_URL;
    if (custom) return custom;
    const base = (process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
    return base ? `${base}/api/health` : "/api/health";
  }, []);

  const [healthOk, setHealthOk] = useState(true);

  useEffect(() => {
    if (forced || !healthCheckOn) return undefined;
    const ctrl = new AbortController();
    const tid = window.setTimeout(() => ctrl.abort(), 5000);
    const url =
      healthUrl.startsWith("http") || healthUrl.startsWith("/")
        ? healthUrl
        : `/${healthUrl}`;

    fetch(url, { method: "GET", signal: ctrl.signal, credentials: "omit" })
      .then((res) => setHealthOk(res.ok))
      .catch(() => setHealthOk(false))
      .finally(() => window.clearTimeout(tid));

    return () => {
      window.clearTimeout(tid);
      ctrl.abort();
    };
  }, [forced, healthCheckOn, healthUrl]);

  const operational =
    !forced && (!healthCheckOn || healthOk);
  const statusLabel = forced
    ? forced.label
    : healthCheckOn && !healthOk
      ? "Service temporarily unavailable"
      : "All systems operational";
  const statusClass = operational
    ? "footer-status footer-status--ok"
    : "footer-status footer-status--issue";

  return (
    <footer className="footer">
      <div className="footer-glow-top" />

      <div className="footer-container">
        {/* Brand Section */}
        <div className="footer-brand">
          <div className="footer-logo-wrap">
            <span className="footer-logo">AURA TERMINAL</span>
            <span className="footer-logo-dot" />
          </div>
          <p className="footer-tagline">Trade smarter with AI-powered insights.</p>
          <div className="footer-social">
            {/* X (Twitter) */}
            <a 
              href="https://x.com/Auraxfx" 
              className="footer-social-link" 
              aria-label="X (Twitter)"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4l16 16M4 20L20 4" />
              </svg>
            </a>
            
            {/* Instagram (replacing GitHub) */}
            <a 
              href="https://www.instagram.com/xaurafx" 
              className="footer-social-link" 
              aria-label="Instagram"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
            </a>
            
            {/* Trustpilot */}
            <a 
              href="https://www.trustpilot.com/review/auraxfx.com" 
              className="footer-social-link" 
              aria-label="Trustpilot"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L9 9H2L7.5 13.5L5 21L12 16.5L19 21L16.5 13.5L22 9H15L12 2Z" />
              </svg>
            </a>
            
            
          </div>
        </div>

        {/* Quick Links */}
        <div className="footer-column">
          <h4 className="footer-column-heading">Platform</h4>
          <ul className="footer-links">
            <li><Link to="/">Home</Link></li>
            <li><Link to="/courses">C&S</Link></li>
            <li><Link to="/explore">Explore</Link></li>
            <li><Link to="/why-glitch">Why Aura Terminal</Link></li>
            <li><Link to="/contact">Contact</Link></li>
          </ul>
        </div>

        {/* Resources */}
        <div className="footer-column">
          <h4 className="footer-column-heading">Resources</h4>
          <ul className="footer-links">
            <li><Link to="/docs">Docs</Link></li>
            <li><Link to="/blog">Blog</Link></li>
            <li><Link to="/contact">Contact us</Link></li>
            <li><Link to="/privacy">Privacy Policy</Link></li>
            <li><Link to="/terms">Terms of Service</Link></li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom-wrap">
        <div className="footer-divider" />
        <div className="footer-bottom">
          <span className="footer-copy">© 2025 AURA TERMINAL. All rights reserved.</span>
          <span
            className={statusClass}
            title={statusLabel}
            role="status"
            aria-live="polite"
          >
            <span className="footer-status-dot" aria-hidden />
            {statusLabel}
          </span>
        </div>
      </div>
    </footer>
  );
});

export default Footer;