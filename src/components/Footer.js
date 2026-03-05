import React from "react";
import "../styles/Footer.css";

const Footer = React.memo(function Footer() {
  return (
    <footer className="footer">
      <div className="footer-glow-top" />

      <div className="footer-container">
        {/* Brand Section */}
        <div className="footer-brand">
          <div className="footer-logo-wrap">
            <span className="footer-logo">AURA FX</span>
            <span className="footer-logo-dot" />
          </div>
          <p className="footer-tagline">Trade smarter with AI-powered insights.</p>
          <div className="footer-social">
            {/* Twitter / X */}
            <a href="#" className="footer-social-link" aria-label="Twitter">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4l16 16M4 20L20 4" />
              </svg>
            </a>
            {/* GitHub */}
            <a href="#" className="footer-social-link" aria-label="GitHub">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
            </a>
            {/* Discord */}
            <a href="#" className="footer-social-link" aria-label="Discord">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
                <path d="M7.5 7.5c.9-.3 2.1-.5 4.5-.5s3.6.2 4.5.5M7.5 16.5c.9.3 2.1.5 4.5.5s3.6-.2 4.5-.5"/>
                <path d="M20.32 5.56A17.6 17.6 0 0 0 15.9 4.2a.07.07 0 0 0-.07.04 12.27 12.27 0 0 0-.54 1.1 16.24 16.24 0 0 0-4.88 0 11.1 11.1 0 0 0-.55-1.1.07.07 0 0 0-.07-.04 17.56 17.56 0 0 0-4.42 1.36.06.06 0 0 0-.03.03C2.96 9.47 2.3 13.25 2.63 16.98a.07.07 0 0 0 .03.05 17.66 17.66 0 0 0 5.32 2.69.07.07 0 0 0 .08-.03 12.6 12.6 0 0 0 1.09-1.77.07.07 0 0 0-.04-.1 11.64 11.64 0 0 1-1.66-.79.07.07 0 0 1-.007-.117c.11-.083.22-.17.33-.258a.07.07 0 0 1 .072-.01c3.47 1.59 7.23 1.59 10.66 0a.07.07 0 0 1 .073.009c.11.089.22.176.332.259a.07.07 0 0 1-.006.117 10.9 10.9 0 0 1-1.66.79.07.07 0 0 0-.037.1 14.16 14.16 0 0 0 1.09 1.77.07.07 0 0 0 .079.028 17.61 17.61 0 0 0 5.33-2.69.07.07 0 0 0 .03-.048c.39-4.02-.654-7.51-2.764-10.607z"/>
              </svg>
            </a>
            {/* LinkedIn */}
            <a href="#" className="footer-social-link" aria-label="LinkedIn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                <rect x="2" y="9" width="4" height="12" /><circle cx="4" cy="4" r="2" />
              </svg>
            </a>
          </div>
        </div>

        {/* Quick Links */}
        <div className="footer-column">
          <h4 className="footer-column-heading">Platform</h4>
          <ul className="footer-links">
            <li><a href="#">Home</a></li>
            <li><a href="#">Features</a></li>
            <li><a href="#">Pricing</a></li>
            <li><a href="#">Community</a></li>
            <li><a href="#">Contact</a></li>
          </ul>
        </div>

        {/* Resources */}
        <div className="footer-column">
          <h4 className="footer-column-heading">Resources</h4>
          <ul className="footer-links">
            <li><a href="#">Docs</a></li>
            <li><a href="#">Blog</a></li>
            <li><a href="#">Support</a></li>
            <li><a href="#">Privacy Policy</a></li>
            <li><a href="#">Terms of Service</a></li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="footer-bottom-wrap">
        <div className="footer-divider" />
        <div className="footer-bottom">
          <span className="footer-copy">© 2025 AURA FX. All rights reserved.</span>
          <span className="footer-status">
            <span className="footer-status-dot" />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
});

export default Footer;