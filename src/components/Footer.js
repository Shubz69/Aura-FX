import React from "react";
import "../styles/Footer.css";

const Footer = React.memo(function Footer() {
    return (
        <footer className="footer">
            <span className="footer-logo">© 2025 AURA FX</span>
        </footer>
    );
});

export default Footer;
